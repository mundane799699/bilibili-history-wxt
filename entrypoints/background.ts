import {
  HAS_FULL_SYNC,
  HAS_FULL_FAV_SYNC,
  HISTORY_LAST_SYNC,
  SYNC_INTERVAL,
  IS_SYNC_DELETE_FROM_BILIBILI,
  WEBDAV_CONFIG,
  WEBDAV_LAST_SYNC,
  WEBDAV_AUTO_SYNC_ENABLED,
  WEBDAV_AUTO_SYNC_INTERVAL,
  WEBDAV_SYNC_ITEMS,
  DEFAULT_WEBDAV_SYNC_ITEMS,
  WebDavSyncItems,
  WebDavSyncKey,
  LOCAL_HISTORY_BACKUP_ALARM,
  FAVORITE_FOLDER_SYNC_PROGRESS,
  ALL_FAVORITE_FOLDERS_SYNC_PROGRESS,
} from "../utils/constants";
import {
  openDB,
  getItem,
  deleteHistoryItem,
  saveFavFolders,
  replaceFavFolders,
  saveFavResources,
  getFavResources,
  deleteFavResources,
  getAllHistory,
  getAllLikedMusic,
  getAllFavFolders,
  getAllFavResources,
  getAllSubscribedCollections,
  getAllSubscribedCollectionResources,
  smartMergeHistory,
  smartMergeLikedMusic,
  smartMergeFavResources,
  importFavFolders,
  importSubscribedCollections,
  smartMergeSubscribedCollectionResources,
  replaceSubscribedCollections,
  replaceSubscribedCollectionResources,
} from "../utils/db";
import { getStorageValue, setStorageValue } from "../utils/storage";
import { recordStorageWarning } from "../utils/storageHealth";
import {
  WebDavConfig,
  ensureDirectory,
  uploadFile,
  downloadFile,
  withWebDavOperationLock,
} from "../utils/webdav";
import {
  FavoriteFolder,
  RefreshFavoriteFoldersResponse,
  SubscribedCollection,
  SubscribedCollectionResource,
  SyncFavoriteFolderRequest,
  SyncFavoriteFolderResponse,
  SyncHistoryRequest,
  SyncHistoryResponse,
  LocalHistoryBackupRequest,
  LocalHistoryBackupResult,
  FavoriteFolderSyncProgress,
  SyncAllFavoriteFoldersRequest,
  AllFavoriteFoldersSyncProgress,
} from "../utils/types";
import { isLocalHistoryBackupDue, runLocalHistoryBackup } from "../utils/localHistoryBackup";

export default defineBackground(() => {
  let localHistoryBackupPromise: Promise<LocalHistoryBackupResult> | null = null;
  let webDavSyncPromise: Promise<void> | null = null;
  let favoriteSyncPromise: Promise<unknown> | null = null;
  let favoriteFolderSyncPromise: Promise<FavoriteFolder> | null = null;
  let allFavoriteFoldersSyncPromise: Promise<void> | null = null;

  const isSameFolderCheckpoint = (
    progress: FavoriteFolderSyncProgress | null,
    folderId: number,
    mode: "full" | "incremental",
  ) =>
    progress?.status !== "success" &&
    progress?.folderId === folderId &&
    progress.mode === mode &&
    progress.nextPage > 1;

  const isSameAllFoldersCheckpoint = (
    progress: AllFavoriteFoldersSyncProgress | null,
    folderIds: number[],
    mode: "full" | "incremental",
  ) =>
    progress?.status !== "success" &&
    progress?.mode === mode &&
    Array.isArray(progress.folderIds) &&
    progress.folderIds.length === folderIds.length &&
    progress.folderIds.every((id, index) => id === folderIds[index]) &&
    (progress.completedCount > 0 || progress.nextPage > 1);

  const startFavoriteSync = <T>(task: () => Promise<T>): Promise<T> | null => {
    if (favoriteSyncPromise) return null;
    const promise = task();
    favoriteSyncPromise = promise;
    return promise;
  };

  const finishFavoriteSync = (task: Promise<unknown>): void => {
    if (favoriteSyncPromise === task) favoriteSyncPromise = null;
  };

  async function updateFavoriteFolderSyncProgress(
    progress: FavoriteFolderSyncProgress | null,
  ): Promise<void> {
    if (progress === null) {
      await browser.storage.local.remove(FAVORITE_FOLDER_SYNC_PROGRESS);
      return;
    }
    await setStorageValue(FAVORITE_FOLDER_SYNC_PROGRESS, progress);
  }

  async function updateAllFavoriteFoldersSyncProgress(
    progress: AllFavoriteFoldersSyncProgress | null,
  ): Promise<void> {
    if (progress === null) {
      await browser.storage.local.remove(ALL_FAVORITE_FOLDERS_SYNC_PROGRESS);
      return;
    }
    await setStorageValue(ALL_FAVORITE_FOLDERS_SYNC_PROGRESS, progress);
  }

  const ensureLocalHistoryBackupAlarm = async (): Promise<void> => {
    const alarm = await browser.alarms.get(LOCAL_HISTORY_BACKUP_ALARM);
    if (!alarm || alarm.periodInMinutes !== 1) {
      await browser.alarms.create(LOCAL_HISTORY_BACKUP_ALARM, {
        periodInMinutes: 1,
      });
    }
  };

  const runLocalHistoryBackupOnce = (allowEmpty = false): Promise<LocalHistoryBackupResult> => {
    if (localHistoryBackupPromise) return localHistoryBackupPromise;

    localHistoryBackupPromise = runLocalHistoryBackup(allowEmpty).finally(() => {
      localHistoryBackupPromise = null;
    });
    return localHistoryBackupPromise;
  };

  void ensureLocalHistoryBackupAlarm().catch((error) => {
    console.error("初始化历史记录本地备份定时任务失败:", error);
  });

  const actionApi = browser.action ?? browser.browserAction;
  actionApi.onClicked.addListener(() => {
    void browser.tabs.create({
      url: browser.runtime.getURL("/my-history.html"),
    });
  });

  // 初始化定时任务
  browser.runtime.onInstalled.addListener(async (details) => {
    // 设置每分钟同步一次
    browser.alarms.create("syncHistory", {
      periodInMinutes: 1,
    });
    // 设置每分钟检查一次 WebDAV 自动同步
    browser.alarms.create("syncWebDav", {
      periodInMinutes: 1,
    });

    // 只在首次安装时打开设置页面并执行初始化同步
    if (details.reason === "install") {
      const url = browser.runtime.getURL("/my-history.html#/welcome");
      browser.tabs.create({ url });

      // 延迟执行，确保页面加载状态
      setTimeout(async () => {
        // 并行执行初始化同步
        const initHistory = async () => {
          try {
            await syncHistory(true);
          } catch (e) {
            console.error("History init failed", e);
          }
        };
        const initFav = async () => {
          try {
            const task = startFavoriteSync(() => syncFavorites(true));
            if (!task) return;
            try {
              await task;
              await setStorageValue(HAS_FULL_FAV_SYNC, true);
            } finally {
              finishFavoriteSync(task);
            }
          } catch (e) {
            console.error("Fav init failed", e);
          }
        };
        initHistory();
        initFav();
      }, 1000);
    }
  });

  const intervalSync = async () => {
    try {
      // 执行增量同步
      await syncHistory(false);
    } catch (error) {
      console.error("定时同步失败:", error);
    }
  };

  // 监听定时任务
  browser.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === "syncHistory") {
      // 获取同步间隔
      const syncInterval = await getStorageValue(SYNC_INTERVAL, 1);
      // 根据最近一次成功同步的时间判断是否需要同步
      const lastSyncTime = await getStorageValue<number>(HISTORY_LAST_SYNC, 0);
      const elapsed = Date.now() - lastSyncTime;
      const intervalMs = syncInterval * 60 * 1000;

      if (elapsed <= intervalMs) {
        const remainingMinutes = Math.ceil((intervalMs - elapsed) / 60000);
        console.log(`还需${remainingMinutes}分钟进行历史记录同步，暂时跳过`);
        return;
      }

      // 同步成功后，syncHistory 会更新最近一次同步时间
      void intervalSync();
    } else if (alarm.name === "syncWebDav") {
      // WebDAV 自动同步：基于上次同步时间判断
      const enabled = await getStorageValue(WEBDAV_AUTO_SYNC_ENABLED, false);
      if (!enabled) return;

      const syncInterval = await getStorageValue(WEBDAV_AUTO_SYNC_INTERVAL, 30);
      const lastSyncTime = await getStorageValue<number>(WEBDAV_LAST_SYNC, 0);
      const elapsed = Date.now() - lastSyncTime;
      const intervalMs = syncInterval * 60 * 1000;

      if (elapsed < intervalMs) {
        console.log(
          `WebDAV 自动同步：距上次同步仅 ${Math.round(elapsed / 60000)} 分钟，需等待 ${syncInterval} 分钟`,
        );
        return;
      }

      // 距离上次同步已超过设定间隔，执行备份
      if (!webDavSyncPromise) {
        webDavSyncPromise = withWebDavOperationLock(autoSyncWebDav).finally(() => {
          webDavSyncPromise = null;
        });
      }
      await webDavSyncPromise;
    } else if (alarm.name === LOCAL_HISTORY_BACKUP_ALARM) {
      try {
        if (await isLocalHistoryBackupDue()) {
          const result = await runLocalHistoryBackupOnce();
          if (!result.success) {
            console.warn("历史记录本地自动备份未完成:", result.error);
          }
        }
      } catch (error) {
        console.error("历史记录本地自动备份失败:", error);
      }
    }
  });

  // 处理同步历史记录的消息
  const handleSyncHistory = async (
    message: SyncHistoryRequest,
    sendResponse: (response: SyncHistoryResponse) => void,
  ) => {
    try {
      // 获取前端传递的isFullSync参数，如果没有则根据历史记录判断
      const forceFullSync = message.isFullSync;
      let syncResult = "";

      if (forceFullSync) {
        // 如果前端强制要求全量同步
        await syncHistory(true);
        syncResult = "全量同步成功";
        sendResponse({ success: true, message: syncResult });
      } else {
        await syncHistory(false);
        syncResult = "增量同步成功";
        sendResponse({ success: true, message: syncResult });
      }
    } catch (error) {
      console.error("同步失败:", error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : "未知错误",
      });
    }
  };

  const handleSyncFavorites = async (sendResponse: (response: any) => void) => {
    const task = startFavoriteSync(async () => {
      const hasFullFavSync = await getStorageValue(HAS_FULL_FAV_SYNC, false);
      await syncFavorites(!hasFullFavSync);
      if (!hasFullFavSync) await setStorageValue(HAS_FULL_FAV_SYNC, true);
    });
    if (!task) {
      sendResponse({ success: false, error: "收藏夹同步正在进行中，请稍后再试" });
      return;
    }

    try {
      await task;
      sendResponse({ success: true, message: "收藏夹同步成功" });
    } catch (error) {
      console.error("同步收藏夹失败:", error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : "未知错误",
      });
    } finally {
      finishFavoriteSync(task);
    }
  };

  const handleSyncFavoriteFolder = async (
    message: SyncFavoriteFolderRequest,
    sendResponse: (response: SyncFavoriteFolderResponse) => void,
  ) => {
    const folderId = Number(message.folderId);
    if (!Number.isSafeInteger(folderId) || folderId <= 0) {
      sendResponse({ success: false, error: "收藏夹信息不完整" });
      return;
    }
    if (typeof message.isFullSync !== "boolean") {
      sendResponse({ success: false, error: "同步方式不完整" });
      return;
    }

    if (favoriteSyncPromise) {
      sendResponse({ success: false, error: "收藏夹同步正在进行中，请稍后再试" });
      return;
    }

    const mode = message.isFullSync ? "full" : "incremental";
    const previousProgress = await getStorageValue<FavoriteFolderSyncProgress | null>(
      FAVORITE_FOLDER_SYNC_PROGRESS,
      null,
    );
    const checkpoint = isSameFolderCheckpoint(previousProgress, folderId, mode)
      ? previousProgress
      : null;
    const startedAt = checkpoint?.startedAt ?? Date.now();
    const task = startFavoriteSync(() =>
      syncFavoriteFolderById(folderId, message.isFullSync, startedAt, checkpoint),
    );
    if (!task) {
      sendResponse({ success: false, error: "收藏夹同步正在进行中，请稍后再试" });
      return;
    }
    favoriteFolderSyncPromise = task;

    let response: SyncFavoriteFolderResponse;
    try {
      const folder = await favoriteFolderSyncPromise;
      const messageText = `「${folder.title}」${message.isFullSync ? "全量" : "增量"}同步成功`;
      const progress = await getStorageValue<FavoriteFolderSyncProgress | null>(
        FAVORITE_FOLDER_SYNC_PROGRESS,
        null,
      );
      await updateFavoriteFolderSyncProgress({
        ...(progress || {
          folderId,
          folderTitle: folder.title,
          mode,
          currentPage: 0,
          nextPage: 1,
          processedItems: 0,
          totalItems: folder.media_count,
          onlineResourceIds: [],
          startedAt,
        }),
        folderId,
        folderTitle: folder.title,
        mode,
        status: "success",
        updatedAt: Date.now(),
        message: messageText,
      });
      response = {
        success: true,
        message: messageText,
        folderId,
        mode,
      };
    } catch (error) {
      console.error("同步单个收藏夹失败:", error);
      const errorMessage = error instanceof Error ? error.message : "未知错误";
      const progress = await getStorageValue<FavoriteFolderSyncProgress | null>(
        FAVORITE_FOLDER_SYNC_PROGRESS,
        null,
      );
      if (progress) {
        await updateFavoriteFolderSyncProgress({
          ...progress,
          status: "error",
          updatedAt: Date.now(),
          message: errorMessage,
        });
      }
      response = { success: false, error: errorMessage };
    } finally {
      favoriteFolderSyncPromise = null;
      finishFavoriteSync(task);
    }
    sendResponse(response);
  };

  const handleSyncAllFavoriteFolders = async (
    message: SyncAllFavoriteFoldersRequest,
    sendResponse: (response: { success: boolean; error?: string }) => void,
  ) => {
    if (favoriteSyncPromise) {
      sendResponse({ success: false, error: "收藏夹同步正在进行中，请稍后再试" });
      return;
    }

    const { folders, isFullSync } = message;
    if (!folders || folders.length === 0) {
      sendResponse({ success: false, error: "没有需要同步的收藏夹" });
      return;
    }

    const mode = isFullSync ? "full" : "incremental";
    const folderIds = folders.map((folder) => folder.id);
    const previousProgress = await getStorageValue<AllFavoriteFoldersSyncProgress | null>(
      ALL_FAVORITE_FOLDERS_SYNC_PROGRESS,
      null,
    );
    const checkpoint = isSameAllFoldersCheckpoint(previousProgress, folderIds, mode)
      ? previousProgress
      : null;
    const startedAt = checkpoint?.startedAt ?? Date.now();

    const task = startFavoriteSync(async () => {
      const failedIds = new Set((checkpoint?.failedFolders ?? []).map((folder) => folder.id));
      const firstFailedIndex = folders.findIndex((folder) => failedIds.has(folder.id));
      let completedCount =
        firstFailedIndex >= 0
          ? firstFailedIndex
          : Math.min(checkpoint?.completedCount ?? 0, folders.length);
      const failedFolders = [...(checkpoint?.failedFolders ?? [])];

      await updateAllFavoriteFoldersSyncProgress({
        status: "syncing",
        mode,
        currentFolderTitle: folders[completedCount]?.title ?? "",
        completedCount,
        totalFolders: folders.length,
        failedFolders,
        folderIds,
        currentPage: checkpoint?.currentPage ?? 0,
        nextPage: checkpoint?.nextPage ?? 1,
        processedItems: checkpoint?.processedItems ?? 0,
        totalItems: checkpoint?.totalItems ?? 0,
        onlineResourceIds: checkpoint?.onlineResourceIds ?? [],
        startedAt,
        updatedAt: Date.now(),
      });

      const { sessdata, folders: onlineFolders } = await getFavoriteFoldersFromBilibili();
      const onlineFoldersById = new Map(onlineFolders.map((folder) => [folder.id, folder]));

      for (let index = completedCount; index < folders.length; index++) {
        const folder = folders[index];
        const resumeFolder = checkpoint && index === checkpoint.completedCount ? checkpoint : null;
        let currentPage = resumeFolder?.currentPage ?? 0;
        let nextPage = resumeFolder?.nextPage ?? 1;
        let processedItems = resumeFolder?.processedItems ?? 0;
        let totalItems = resumeFolder?.totalItems ?? 0;
        let onlineResourceIds = resumeFolder?.onlineResourceIds ?? [];

        await updateAllFavoriteFoldersSyncProgress({
          status: "syncing",
          mode,
          currentFolderTitle: folder.title,
          completedCount,
          totalFolders: folders.length,
          failedFolders,
          folderIds,
          currentPage,
          nextPage,
          processedItems,
          totalItems,
          onlineResourceIds,
          startedAt,
          updatedAt: Date.now(),
        });

        let folderFailed = false;
        try {
          const onlineFolder = onlineFoldersById.get(folder.id);
          if (!onlineFolder) throw new Error("收藏夹不存在或无权访问");

          await saveFavFolders([onlineFolder]);
          await syncFavoriteFolderResources(
            onlineFolder,
            sessdata,
            isFullSync,
            async (update) => {
              currentPage = update.currentPage;
              nextPage = update.nextPage;
              processedItems = update.processedItems;
              totalItems = update.totalItems;
              onlineResourceIds = update.onlineResourceIds;
              await updateAllFavoriteFoldersSyncProgress({
                status: "syncing",
                mode,
                currentFolderTitle: folder.title,
                completedCount,
                totalFolders: folders.length,
                failedFolders,
                folderIds,
                currentPage,
                nextPage,
                processedItems,
                totalItems,
                onlineResourceIds,
                startedAt,
                updatedAt: Date.now(),
              });
            },
            resumeFolder,
          );
        } catch (error) {
          folderFailed = true;
          const existingFailureIndex = failedFolders.findIndex((item) => item.id === folder.id);
          const failure = {
            id: folder.id,
            title: folder.title,
            error: error instanceof Error ? error.message : "未知错误",
          };
          if (existingFailureIndex >= 0) failedFolders[existingFailureIndex] = failure;
          else failedFolders.push(failure);
        }

        const currentFailureIndex = failedFolders.findIndex((item) => item.id === folder.id);
        if (folderFailed) {
          // 保留失败文件夹的分页断点，重试时从失败页继续。
          await updateAllFavoriteFoldersSyncProgress({
            status: "error",
            mode,
            currentFolderTitle: folder.title,
            completedCount,
            totalFolders: folders.length,
            failedFolders,
            folderIds,
            currentPage,
            nextPage,
            processedItems,
            totalItems,
            onlineResourceIds,
            startedAt,
            updatedAt: Date.now(),
            message: failedFolders[currentFailureIndex].error,
          });
          break;
        } else if (currentFailureIndex >= 0) {
          // 重试成功后移除旧失败记录。
          failedFolders.splice(currentFailureIndex, 1);
        }
        completedCount++;
        await updateAllFavoriteFoldersSyncProgress({
          status: "syncing",
          mode,
          currentFolderTitle: folders[completedCount]?.title ?? "",
          completedCount,
          totalFolders: folders.length,
          failedFolders,
          folderIds,
          currentPage: 0,
          nextPage: 1,
          processedItems: 0,
          totalItems: 0,
          onlineResourceIds: [],
          startedAt,
          updatedAt: Date.now(),
        });
      }

      await updateAllFavoriteFoldersSyncProgress({
        status: failedFolders.length > 0 ? "error" : "success",
        mode,
        currentFolderTitle: "",
        completedCount,
        totalFolders: folders.length,
        failedFolders,
        folderIds,
        currentPage: 0,
        nextPage: 1,
        processedItems: 0,
        totalItems: 0,
        onlineResourceIds: [],
        startedAt,
        updatedAt: Date.now(),
        ...(failedFolders.length > 0
          ? { message: `有 ${failedFolders.length} 个收藏夹同步失败` }
          : {}),
      });
    });
    if (!task) {
      sendResponse({ success: false, error: "收藏夹同步正在进行中，请稍后再试" });
      return;
    }
    allFavoriteFoldersSyncPromise = task;

    try {
      await task;
      sendResponse({ success: true });
    } catch (error) {
      console.error("同步所有收藏夹失败:", error);
      const progress = await getStorageValue<AllFavoriteFoldersSyncProgress | null>(
        ALL_FAVORITE_FOLDERS_SYNC_PROGRESS,
        null,
      );
      const errorMessage = error instanceof Error ? error.message : "未知错误";
      await updateAllFavoriteFoldersSyncProgress({
        ...(progress ?? {
          mode,
          currentFolderTitle: "",
          completedCount: 0,
          totalFolders: folders.length,
          failedFolders: [],
          folderIds,
          currentPage: 0,
          nextPage: 1,
          processedItems: 0,
          totalItems: 0,
          onlineResourceIds: [],
          startedAt,
        }),
        status: "error",
        updatedAt: Date.now(),
        message: errorMessage,
      });
      sendResponse({ success: false, error: errorMessage });
    } finally {
      allFavoriteFoldersSyncPromise = null;
      finishFavoriteSync(task);
    }
  };

  const handleGetFavoriteFolderSyncProgress = async (sendResponse: (response: unknown) => void) => {
    const progress = await getStorageValue<FavoriteFolderSyncProgress | null>(
      FAVORITE_FOLDER_SYNC_PROGRESS,
      null,
    );

    if (progress?.status === "syncing" && !favoriteFolderSyncPromise) {
      const interruptedProgress: FavoriteFolderSyncProgress = {
        ...progress,
        status: "error",
        updatedAt: Date.now(),
        message: "同步任务已中断，可点击重试继续",
      };
      await updateFavoriteFolderSyncProgress(interruptedProgress);
      sendResponse(interruptedProgress);
      return;
    }

    sendResponse(progress);
  };

  const handleGetAllFavoriteFoldersSyncProgress = async (
    sendResponse: (response: unknown) => void,
  ) => {
    const progress = await getStorageValue<AllFavoriteFoldersSyncProgress | null>(
      ALL_FAVORITE_FOLDERS_SYNC_PROGRESS,
      null,
    );

    if (progress?.status === "syncing" && !allFavoriteFoldersSyncPromise) {
      const interruptedProgress: AllFavoriteFoldersSyncProgress = {
        ...progress,
        status: "error",
        updatedAt: Date.now(),
        message: "同步任务已中断，可点击重试继续",
      };
      await updateAllFavoriteFoldersSyncProgress(interruptedProgress);
      sendResponse(interruptedProgress);
      return;
    }

    sendResponse(progress);
  };

  const handleRefreshFavoriteFolders = async (
    sendResponse: (response: RefreshFavoriteFoldersResponse) => void,
  ) => {
    try {
      const { folders } = await getFavoriteFoldersFromBilibili();
      await replaceFavFolders(folders);
      sendResponse({ success: true, folderCount: folders.length });
    } catch (error) {
      console.error("刷新收藏夹目录失败:", error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : "未知错误",
      });
    }
  };

  const handleSyncSubscribedCollections = async (sendResponse: (response: any) => void) => {
    try {
      await syncSubscribedCollections();
      sendResponse({ success: true, message: "订阅合集同步成功" });
    } catch (error) {
      console.error("同步订阅合集失败:", error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : "未知错误",
      });
    }
  };

  const handleSyncSubscribedCollectionResources = async (
    message: any,
    sendResponse: (response: any) => void,
  ) => {
    const collectionId = Number(message.collectionId);

    if (!Number.isFinite(collectionId)) {
      sendResponse({ success: false, error: "合集信息不完整" });
      return;
    }

    try {
      await syncSubscribedCollectionResources(collectionId);
      sendResponse({ success: true, message: "合集内容同步成功" });
    } catch (error) {
      console.error("同步合集内容失败:", error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : "未知错误",
      });
    }
  };

  // 处理删除历史记录的消息
  const handleDeleteHistoryItem = async (message: any, sendResponse: (response: any) => void) => {
    try {
      const syncDeleteFromBilibili = await getStorageValue(IS_SYNC_DELETE_FROM_BILIBILI, true);
      if (!syncDeleteFromBilibili) {
        sendResponse({ success: true, message: "同步删除未开启" });
        return;
      }
      await deleteHistoryItem(message.id);
      sendResponse({ success: true, message: "历史记录删除成功" });
    } catch (error) {
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : "删除失败",
      });
    }
  };

  const handleRunLocalHistoryBackup = async (
    message: LocalHistoryBackupRequest,
    sendResponse: (response: LocalHistoryBackupResult) => void,
  ) => {
    try {
      sendResponse(await runLocalHistoryBackupOnce(Boolean(message.allowEmpty)));
    } catch (error) {
      sendResponse({
        success: false,
        errorCode: "WRITE_FAILED",
        error: error instanceof Error ? error.message : "本地备份失败",
      });
    }
  };

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "syncHistory") {
      handleSyncHistory(message as SyncHistoryRequest, sendResponse);
      return true; // 保持消息通道开放
    } else if (message.action === "getCookies") {
      browser.cookies.getAll({ domain: "bilibili.com" }, (cookies) => {
        sendResponse({ success: true, cookies });
      });
      return true;
    } else if (message.action === "deleteHistoryItem") {
      handleDeleteHistoryItem(message, sendResponse);
      return true; // 保持消息通道开放
    } else if (message.action === "syncFavorites") {
      handleSyncFavorites(sendResponse);
      return true;
    } else if (message.action === "syncFavoriteFolder") {
      handleSyncFavoriteFolder(message as SyncFavoriteFolderRequest, sendResponse);
      return true;
    } else if (message.action === "syncAllFavoriteFolders") {
      handleSyncAllFavoriteFolders(message as SyncAllFavoriteFoldersRequest, sendResponse);
      return true;
    } else if (message.action === "getFavoriteFolderSyncProgress") {
      handleGetFavoriteFolderSyncProgress(sendResponse);
      return true;
    } else if (message.action === "getAllFavoriteFoldersSyncProgress") {
      handleGetAllFavoriteFoldersSyncProgress(sendResponse);
      return true;
    } else if (message.action === "refreshFavoriteFolders") {
      handleRefreshFavoriteFolders(sendResponse);
      return true;
    } else if (message.action === "syncSubscribedCollections") {
      handleSyncSubscribedCollections(sendResponse);
      return true;
    } else if (message.action === "syncSubscribedCollectionResources") {
      handleSyncSubscribedCollectionResources(message, sendResponse);
      return true;
    } else if (message.action === "runLocalHistoryBackup") {
      handleRunLocalHistoryBackup(message as LocalHistoryBackupRequest, sendResponse);
      return true;
    }
  });

  // 全量同步历史记录
  async function syncHistory(isFullSync = false): Promise<boolean> {
    try {
      // 获取 B 站 cookie
      const cookies = await browser.cookies.getAll({
        domain: "bilibili.com",
      });
      const SESSDATA = cookies.find((cookie) => cookie.name === "SESSDATA")?.value;

      if (!SESSDATA) {
        throw new Error("未找到 B 站登录信息，请先登录 B 站");
      }

      let hasMore = true;
      let max = 0;
      let view_at = 0;
      const type = "all";
      const ps = 30;
      console.log(`${isFullSync ? "全量" : "增量"}同步开始`);

      // 循环获取所有历史记录
      while (hasMore) {
        // 获取历史记录
        const response = await fetch(
          `https://api.bilibili.com/x/web-interface/history/cursor?max=${max}&view_at=${view_at}&type=${type}&ps=${ps}`,
          {
            headers: {
              Cookie: `SESSDATA=${SESSDATA}`,
            },
          },
        );

        if (!response.ok) {
          throw new Error("获取历史记录失败");
        }

        const { data, code, message } = await response.json();

        if (code !== 0) {
          throw new Error(message || "获取历史记录失败");
        }

        const { cursor, list } = data;
        // 更新分页参数
        hasMore = list.length > 0;
        max = cursor.max;
        view_at = cursor.view_at;

        if (list.length > 0) {
          // 为每批数据创建新的事务
          const db = await openDB();
          const tx = db.transaction("history", "readwrite");
          const store = tx.objectStore("history");
          // 取出list中的第一条和最后一条
          if (!isFullSync) {
            const firstItem = list[0];
            const lastItem = list[list.length - 1];
            // 如果firstItem的bvid和lastItem的bvid在indexedDB中存在，则不进行同步
            const firstItemExists = await getItem(store, firstItem.history.oid);
            const lastItemExists = await getItem(store, lastItem.history.oid);
            if (firstItemExists && lastItemExists) {
              hasMore = false;
            }
          }

          // 批量存储历史记录
          for (const item of list) {
            // put是异步的
            store.put({
              id: item.history.oid,
              business: item.history.business,
              bvid: item.history.bvid,
              cid: item.history.cid,
              title: item.title,
              tag_name: item.tag_name,
              cover: item.cover || (item.covers && item.covers[0]),
              view_at: item.view_at,
              uri: item.uri,
              author_name: item.author_name || "",
              author_mid: item.author_mid || "",
              progress: item.progress,
              duration: item.duration,
              is_fav: item.is_fav === 1, // 保存是否收藏字段
              timestamp: Date.now(),
              uploaded: false,
            });
          }

          // 等待事务完成
          await new Promise((resolve, reject) => {
            tx.oncomplete = resolve;
            tx.onerror = () => {
              void recordStorageWarning(tx.error, "sync-history-transaction");
              reject(tx.error);
            };
            tx.onabort = () => {
              void recordStorageWarning(tx.error, "sync-history-transaction-abort");
              reject(tx.error);
            };
          });

          // 添加延时，避免请求过于频繁
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
      console.log(`${isFullSync ? "全量" : "增量"}同步结束`);

      if (isFullSync) {
        await setStorageValue(HAS_FULL_SYNC, true);
      }

      // 更新最后同步时间
      await setStorageValue(HISTORY_LAST_SYNC, Date.now());

      return true;
    } catch (error) {
      console.error("同步历史记录失败:", error);
      throw error;
    }
  }

  interface FavoriteFolderPage {
    medias: any[];
    hasMore: boolean;
  }

  async function getFavoriteFoldersFromBilibili(): Promise<{
    sessdata: string;
    folders: FavoriteFolder[];
  }> {
    const sessdata = await getBilibiliSession();

    const navRes = await fetch("https://api.bilibili.com/x/web-interface/nav", {
      headers: { Cookie: `SESSDATA=${sessdata}` },
    });
    if (!navRes.ok) throw new Error("获取用户信息失败");

    const navData = await navRes.json();
    if (navData.code !== 0) throw new Error(navData.message || "获取用户信息失败");

    const mid = Number(navData.data?.mid);
    if (!Number.isSafeInteger(mid) || mid <= 0) throw new Error("获取用户信息失败");

    const folderRes = await fetch(
      `https://api.bilibili.com/x/v3/fav/folder/created/list-all?up_mid=${mid}`,
      { headers: { Cookie: `SESSDATA=${sessdata}` } },
    );
    if (!folderRes.ok) throw new Error("获取收藏夹失败");

    const folderData = await folderRes.json();
    if (folderData.code !== 0) throw new Error(folderData.message || "获取收藏夹失败");

    if (!folderData.data || !("list" in folderData.data)) {
      throw new Error("收藏夹数据格式异常");
    }

    const onlineFolders = folderData.data.list;
    if (onlineFolders !== null && !Array.isArray(onlineFolders)) {
      throw new Error("收藏夹数据格式异常");
    }

    const folders = (onlineFolders || []).map(
      (folder: FavoriteFolder, index: number): FavoriteFolder => ({
        ...folder,
        id: Number(folder.id),
        index,
      }),
    );

    return { sessdata, folders };
  }

  async function fetchFavoriteFolderPage(
    folder: FavoriteFolder,
    page: number,
    sessdata: string,
  ): Promise<FavoriteFolderPage> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= 2; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      try {
        const response = await fetch(
          `https://api.bilibili.com/x/v3/fav/resource/list?media_id=${folder.id}&pn=${page}&ps=20`,
          {
            headers: { Cookie: `SESSDATA=${sessdata}` },
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        if (data.code !== 0) {
          throw new Error(data.message || "B 站接口返回失败");
        }
        if (!data.data || (data.data.medias != null && !Array.isArray(data.data.medias))) {
          throw new Error("收藏夹资源数据格式异常");
        }

        return {
          medias: data.data.medias || [],
          hasMore: Boolean(data.data.has_more),
        };
      } catch (error) {
        lastError = error;
        if (attempt < 2) {
          console.warn(`请求收藏夹 ${folder.title} 第 ${page} 页失败，正在重试 (${attempt}/2)`);
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      } finally {
        clearTimeout(timeoutId);
      }
    }

    const reason = lastError instanceof Error ? `：${lastError.message}` : "";
    throw new Error(`获取收藏夹「${folder.title}」第 ${page} 页失败${reason}`);
  }

  async function syncFavoriteFolderResources(
    folder: FavoriteFolder,
    sessdata: string,
    isFullSync: boolean,
    reportProgress?: (update: {
      currentPage: number;
      nextPage: number;
      processedItems: number;
      totalItems: number;
      onlineResourceIds: number[];
    }) => Promise<void>,
    checkpoint?: Pick<
      FavoriteFolderSyncProgress | AllFavoriteFoldersSyncProgress,
      "nextPage" | "processedItems" | "onlineResourceIds"
    > | null,
  ): Promise<void> {
    console.log(`正在同步收藏夹: ${folder.title} (${isFullSync ? "全量" : "增量"})`);

    const localResources = await getFavResources(folder.id);
    const existingResourceIds = new Set(localResources.map((item) => item.id));
    const onlineResourceIds = new Set<number>(checkpoint?.onlineResourceIds ?? []);

    let page = Math.max(1, checkpoint?.nextPage ?? 1);
    let allPagesFetched = false;
    let processedItems = checkpoint?.processedItems ?? 0;

    await reportProgress?.({
      currentPage: Math.max(0, page - 1),
      nextPage: page,
      processedItems,
      totalItems: folder.media_count,
      onlineResourceIds: [...onlineResourceIds],
    });

    while (true) {
      const { medias, hasMore } = await fetchFavoriteFolderPage(folder, page, sessdata);

      if (medias.length === 0) {
        if (hasMore) throw new Error(`收藏夹「${folder.title}」分页数据异常`);
        allPagesFetched = true;
        await reportProgress?.({
          currentPage: page,
          nextPage: page + 1,
          processedItems,
          totalItems: folder.media_count,
          onlineResourceIds: [...onlineResourceIds],
        });
        break;
      }

      const resourceIds = medias.map((media: any) => Number(media.id));
      if (resourceIds.some((id: number) => !Number.isSafeInteger(id) || id <= 0)) {
        throw new Error(`收藏夹「${folder.title}」资源数据格式异常`);
      }

      resourceIds.forEach((id: number) => onlineResourceIds.add(id));

      const reachedLocalBoundary =
        !isFullSync &&
        existingResourceIds.has(resourceIds[0]) &&
        existingResourceIds.has(resourceIds[resourceIds.length - 1]);

      const resources = medias.map((media: any, index: number) => ({
        ...media,
        folder_id: folder.id,
        index: (page - 1) * 20 + index,
        id: resourceIds[index],
        bv_id: media.bv_id || media.bvid,
      }));
      await saveFavResources(resources);
      processedItems += resources.length;
      await reportProgress?.({
        currentPage: page,
        nextPage: page + 1,
        processedItems,
        totalItems: folder.media_count,
        onlineResourceIds: [...onlineResourceIds],
      });

      if (!hasMore) {
        allPagesFetched = true;
        break;
      }
      if (reachedLocalBoundary) break;

      page += 1;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    if (isFullSync) {
      if (!allPagesFetched) {
        throw new Error(`收藏夹「${folder.title}」未完整同步，已跳过本地清理`);
      }

      const idsToDelete = localResources
        .filter((item) => !onlineResourceIds.has(item.id))
        .map((item) => item.id);

      if (idsToDelete.length > 0) {
        await deleteFavResources(folder.id, idsToDelete);
        console.log(`从收藏夹 "${folder.title}" 删除了 ${idsToDelete.length} 个已取消收藏的项目`);
      }
    }
  }

  async function syncFavoriteFolderById(
    folderId: number,
    isFullSync: boolean,
    startedAt: number,
    checkpoint: FavoriteFolderSyncProgress | null,
  ): Promise<FavoriteFolder> {
    const { sessdata, folders } = await getFavoriteFoldersFromBilibili();
    const folder = folders.find((item) => item.id === folderId);
    if (!folder) throw new Error("收藏夹不存在或无权访问");

    await saveFavFolders([folder]);
    await updateFavoriteFolderSyncProgress({
      folderId,
      folderTitle: folder.title,
      mode: isFullSync ? "full" : "incremental",
      status: "syncing",
      currentPage: 0,
      nextPage: checkpoint?.nextPage ?? 1,
      processedItems: checkpoint?.processedItems ?? 0,
      totalItems: folder.media_count,
      onlineResourceIds: checkpoint?.onlineResourceIds ?? [],
      startedAt,
      updatedAt: Date.now(),
    });
    await syncFavoriteFolderResources(
      folder,
      sessdata,
      isFullSync,
      async (update) => {
        await updateFavoriteFolderSyncProgress({
          folderId,
          folderTitle: folder.title,
          mode: isFullSync ? "full" : "incremental",
          status: "syncing",
          ...update,
          startedAt,
          updatedAt: Date.now(),
        });
      },
      checkpoint,
    );
    return folder;
  }

  async function syncFavorites(isFullSync = false): Promise<void> {
    try {
      const { sessdata, folders } = await getFavoriteFoldersFromBilibili();

      if (folders.length > 0) {
        await saveFavFolders(folders);
        console.log(`同步了 ${folders.length} 个收藏夹`);
      }

      for (const folder of folders) {
        await syncFavoriteFolderResources(folder, sessdata, isFullSync);
      }
    } catch (error) {
      console.error("同步收藏夹过程出错:", error);
      throw error;
    }
  }

  async function getBilibiliSession(): Promise<string> {
    const cookies = await browser.cookies.getAll({ domain: "bilibili.com" });
    const sessdata = cookies.find((cookie) => cookie.name === "SESSDATA")?.value;
    if (!sessdata) throw new Error("未找到 B 站登录信息，请先登录 B 站");
    return sessdata;
  }

  async function getCurrentBilibiliMid(sessdata: string): Promise<number> {
    const navRes = await fetch("https://api.bilibili.com/x/web-interface/nav", {
      headers: { Cookie: `SESSDATA=${sessdata}` },
    });
    if (!navRes.ok) throw new Error("获取用户信息失败");

    const navData = await navRes.json();
    if (navData.code !== 0 || !navData.data?.mid)
      throw new Error(navData.message || "获取用户信息失败");
    return navData.data.mid;
  }

  async function syncSubscribedCollections(): Promise<void> {
    const sessdata = await getBilibiliSession();
    const currentMid = await getCurrentBilibiliMid(sessdata);
    const pageSize = 50;
    let page = 1;
    let total = Infinity;
    const collections: SubscribedCollection[] = [];

    while (collections.length < total) {
      const response = await fetch(
        `https://api.bilibili.com/x/v3/fav/folder/collected/list?pn=${page}&ps=${pageSize}&up_mid=${currentMid}&platform=web&web_location=333.1387`,
        { headers: { Cookie: `SESSDATA=${sessdata}` } },
      );
      if (!response.ok) throw new Error("获取订阅合集失败");

      const data = await response.json();
      if (data.code !== 0) throw new Error(data.message || "获取订阅合集失败");

      const list = data.data?.list || [];
      total = Number(data.data?.count || 0);
      collections.push(
        ...list.map((item: any, index: number) => ({
          id: item.id,
          mid: item.mid,
          title: item.title || "未命名合集",
          cover: item.cover || "",
          intro: item.intro || "",
          ctime: item.ctime || 0,
          mtime: item.mtime || 0,
          media_count: item.media_count || 0,
          upper: item.upper || { mid: item.mid, name: "未知 UP 主", face: "" },
          index: collections.length + index,
        })),
      );

      if (list.length < pageSize) break;
      page += 1;
    }

    await replaceSubscribedCollections(collections);
  }

  async function syncSubscribedCollectionResources(collectionId: number): Promise<void> {
    const sessdata = await getBilibiliSession();
    const pageSize = 30;
    let page = 1;
    let hasMore = true;
    const resources: SubscribedCollectionResource[] = [];

    while (hasMore) {
      const response = await fetch(
        `https://api.bilibili.com/x/space/fav/season/list?season_id=${collectionId}&pn=${page}&ps=${pageSize}`,
        {
          headers: {
            Cookie: `SESSDATA=${sessdata}`,
          },
        },
      );
      if (!response.ok) throw new Error("获取合集内容失败");

      const data = await response.json();
      if (data.code !== 0) throw new Error(data.message || "获取合集内容失败");

      const medias = data.data?.medias || [];
      resources.push(
        ...medias.map((media: any, index: number) => ({
          id: `${collectionId}-${media.id}`,
          collection_id: collectionId,
          aid: media.id,
          bvid: media.bvid || media.bv_id || "",
          title: media.title || "未命名视频",
          cover: media.cover || "",
          duration: media.duration || 0,
          author_name: media.upper?.name || "未知 UP 主",
          author_mid: media.upper?.mid || 0,
          pubdate: media.pubtime || media.ctime || 0,
          index: resources.length + index,
        })),
      );

      hasMore = Boolean(data.data?.has_more);
      page += 1;
    }

    await replaceSubscribedCollectionResources(collectionId, resources);
  }

  // WebDAV 同步数据项定义：文件名、本地读取与远端合并策略（与 WebDavSync 页面保持一致）
  const WEBDAV_DATA_ITEMS: {
    key: WebDavSyncKey;
    label: string;
    file: string;
    getAll: () => Promise<unknown[]>;
    merge: (items: any[]) => Promise<unknown>;
  }[] = [
    {
      key: "history",
      label: "历史",
      file: "history.json",
      getAll: getAllHistory,
      merge: smartMergeHistory,
    },
    {
      key: "likedMusic",
      label: "音乐",
      file: "likedMusic.json",
      getAll: getAllLikedMusic,
      merge: smartMergeLikedMusic,
    },
    {
      key: "favFolders",
      label: "收藏夹",
      file: "favFolders.json",
      getAll: getAllFavFolders,
      merge: importFavFolders,
    },
    {
      key: "favResources",
      label: "收藏",
      file: "favResources.json",
      getAll: getAllFavResources,
      merge: smartMergeFavResources,
    },
    {
      key: "subscribedCollections",
      label: "订阅合集",
      file: "subscribedCollections.json",
      getAll: getAllSubscribedCollections,
      merge: importSubscribedCollections,
    },
    {
      key: "subscribedCollectionResources",
      label: "合集视频",
      file: "subscribedCollectionResources.json",
      getAll: getAllSubscribedCollectionResources,
      merge: smartMergeSubscribedCollectionResources,
    },
  ];

  // WebDAV 自动双向同步：拉取 → 合并 → 推送（仅同步用户勾选的数据项）
  async function autoSyncWebDav(): Promise<void> {
    try {
      const config = await getStorageValue<WebDavConfig | null>(WEBDAV_CONFIG, null);
      if (!config || !config.serverUrl) {
        console.log("WebDAV 未配置，跳过自动同步");
        return;
      }

      const syncItems = await getStorageValue<WebDavSyncItems>(
        WEBDAV_SYNC_ITEMS,
        DEFAULT_WEBDAV_SYNC_ITEMS,
      );
      const items = WEBDAV_DATA_ITEMS.filter((item) => syncItems[item.key]);
      if (items.length === 0) {
        console.log("WebDAV 同步数据项均未勾选，跳过自动同步");
        return;
      }

      console.log(`开始 WebDAV 双向同步（${items.map((i) => i.label).join("、")}）...`);
      if (!(await ensureDirectory(config))) {
        throw new Error("WebDAV 备份目录创建失败");
      }

      // ===== 第一步：拉取远端数据并合并到本地 =====
      console.log("[WebDAV 同步] 步骤 1/2：拉取并合并远端数据...");
      for (const item of items) {
        const remote = await downloadFile(config, item.file);
        if (remote) {
          await item.merge(JSON.parse(remote));
        }
      }

      // ===== 第二步：将合并后的最新本地数据推送到远端 =====
      console.log("[WebDAV 同步] 步骤 2/2：推送本地数据到远端...");
      const summary: string[] = [];
      for (const item of items) {
        const data = await item.getAll();
        if (!(await uploadFile(config, item.file, JSON.stringify(data)))) {
          throw new Error(`WebDAV 上传${item.label}失败`);
        }
        summary.push(`${item.label} ${data.length}`);
      }

      // 同步完成，记录时间戳
      await setStorageValue(WEBDAV_LAST_SYNC, Date.now());

      console.log(`WebDAV 双向同步完成：${summary.join("，")}`);
    } catch (error) {
      console.error("WebDAV 双向同步失败:", error);
    }
  }
});
