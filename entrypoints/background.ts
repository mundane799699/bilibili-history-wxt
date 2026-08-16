import {
  HAS_FULL_SYNC,
  HAS_FULL_FAV_SYNC,
  HISTORY_LAST_SYNC,
  SYNC_INTERVAL,
  IS_SYNC_DELETE_FROM_BILIBILI,
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
  getDeletedHistoryIds,
  addDeletedHistoryIds,
} from "../utils/db";
import { getStorageValue, setStorageValue } from "../utils/storage";
import { recordStorageWarning } from "../utils/storageHealth";
import {
  ensureDirectory,
  uploadFile,
  downloadFile,
  withWebDavOperationLock,
  loadWebDavConfig,
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
  FavoriteFolderSyncErrorKind,
  SyncAllFavoriteFoldersRequest,
  SyncAllFavoriteFoldersResponse,
  AllFavoriteFoldersSyncProgress,
} from "../utils/types";
import { isLocalHistoryBackupDue, runLocalHistoryBackup } from "../utils/localHistoryBackup";

const FAVORITE_FOLDER_RATE_LIMIT_COOLDOWNS_MS = [10, 30, 60].map((minutes) => minutes * 60 * 1000);
const FAVORITE_FOLDER_PAGE_DELAY_MIN_MS = 1500;
const FAVORITE_FOLDER_PAGE_DELAY_MAX_MS = 3000;
const FAVORITE_FOLDER_DELAY_MIN_MS = 2000;
const FAVORITE_FOLDER_DELAY_MAX_MS = 5000;

class FavoriteFolderRequestError extends Error {
  constructor(
    message: string,
    readonly kind: FavoriteFolderSyncErrorKind,
    readonly status?: number,
  ) {
    super(message);
    this.name = "FavoriteFolderRequestError";
  }
}

const normalizeFavoriteFolderRequestError = (error: unknown): FavoriteFolderRequestError => {
  if (error instanceof FavoriteFolderRequestError) return error;
  if (error instanceof DOMException && error.name === "AbortError") {
    return new FavoriteFolderRequestError("请求超时", "network");
  }
  if (error instanceof TypeError) {
    return new FavoriteFolderRequestError(error.message || "网络请求失败", "network");
  }
  return new FavoriteFolderRequestError(
    error instanceof Error ? error.message : "未知错误",
    "unknown",
  );
};

const getRandomDelay = (minMs: number, maxMs: number): number =>
  Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;

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
    Number.isSafeInteger(progress.nextPage) &&
    progress.nextPage >= 1;

  const normalizeAllFoldersCheckpoint = (
    progress: AllFavoriteFoldersSyncProgress | null,
    folderIds: number[],
    mode: "full" | "incremental",
  ): AllFavoriteFoldersSyncProgress | null => {
    if (
      !progress ||
      progress.status === "success" ||
      progress.mode !== mode ||
      !Array.isArray(progress.folderIds) ||
      progress.folderIds.length !== folderIds.length ||
      !progress.folderIds.every((id, index) => id === folderIds[index]) ||
      !Number.isSafeInteger(progress.nextPage) ||
      progress.nextPage < 1
    ) {
      return null;
    }

    const hasExplicitIndex = Number.isSafeInteger(progress.currentFolderIndex);
    const currentFolderIndex = hasExplicitIndex
      ? progress.currentFolderIndex
      : progress.completedCount;
    if (
      !Number.isSafeInteger(currentFolderIndex) ||
      currentFolderIndex < 0 ||
      currentFolderIndex >= folderIds.length ||
      (hasExplicitIndex && progress.completedCount !== currentFolderIndex)
    ) {
      return null;
    }

    const expectedFolderId = folderIds[currentFolderIndex];
    const currentFolderId = Number.isSafeInteger(progress.currentFolderId)
      ? progress.currentFolderId
      : expectedFolderId;
    if (currentFolderId !== expectedFolderId) return null;

    return {
      ...progress,
      currentFolderIndex,
      currentFolderId,
      completedCount: currentFolderIndex,
      totalFolders: folderIds.length,
    };
  };

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
    const isSameTask = previousProgress?.folderId === folderId && previousProgress.mode === mode;
    if (
      isSameTask &&
      previousProgress?.status === "paused" &&
      previousProgress.retryAfter &&
      Date.now() < previousProgress.retryAfter
    ) {
      sendResponse({
        success: false,
        status: "paused",
        error: previousProgress.message || "收藏夹同步正在冷却，请稍后继续",
        nextPage: previousProgress.nextPage,
        retryAfter: previousProgress.retryAfter,
      });
      return;
    }
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
      const completedProgress = progress ?? {
        currentPage: 0,
        nextPage: 1,
        processedItems: 0,
        totalItems: folder.media_count,
        onlineResourceIds: [],
        startedAt,
      };
      await updateFavoriteFolderSyncProgress({
        folderId,
        folderTitle: folder.title,
        mode,
        status: "success",
        currentPage: completedProgress.currentPage,
        nextPage: completedProgress.nextPage,
        processedItems: completedProgress.processedItems,
        totalItems: completedProgress.totalItems,
        onlineResourceIds: completedProgress.onlineResourceIds,
        startedAt: completedProgress.startedAt,
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
      const requestError = normalizeFavoriteFolderRequestError(error);
      const progress = await getStorageValue<FavoriteFolderSyncProgress | null>(
        FAVORITE_FOLDER_SYNC_PROGRESS,
        null,
      );
      const failureProgress: FavoriteFolderSyncProgress = progress ?? {
        folderId,
        folderTitle: message.folderTitle || "未知收藏夹",
        mode,
        status: "error",
        currentPage: Math.max(0, (checkpoint?.nextPage ?? 1) - 1),
        nextPage: checkpoint?.nextPage ?? 1,
        processedItems: checkpoint?.processedItems ?? 0,
        totalItems: checkpoint?.totalItems ?? 0,
        onlineResourceIds: checkpoint?.onlineResourceIds ?? [],
        startedAt,
        updatedAt: Date.now(),
        ...(checkpoint?.rateLimitCount ? { rateLimitCount: checkpoint.rateLimitCount } : {}),
      };
      if (requestError.kind === "rate_limited") {
        const rateLimitCount = (failureProgress.rateLimitCount ?? 0) + 1;
        const cooldownIndex = Math.min(
          rateLimitCount - 1,
          FAVORITE_FOLDER_RATE_LIMIT_COOLDOWNS_MS.length - 1,
        );
        const retryAfter = Date.now() + FAVORITE_FOLDER_RATE_LIMIT_COOLDOWNS_MS[cooldownIndex];
        const errorMessage = "触发 B 站访问风控，同步已暂停";
        await updateFavoriteFolderSyncProgress({
          ...failureProgress,
          status: "paused",
          errorKind: "rate_limited",
          rateLimitCount,
          retryAfter,
          updatedAt: Date.now(),
          message: errorMessage,
        });
        response = {
          success: false,
          status: "paused",
          error: errorMessage,
          nextPage: failureProgress.nextPage,
          retryAfter,
        };
      } else {
        const errorMessage = requestError.message;
        await updateFavoriteFolderSyncProgress({
          ...failureProgress,
          status: "error",
          errorKind: requestError.kind,
          updatedAt: Date.now(),
          message: errorMessage,
        });
        response = {
          success: false,
          status: "error",
          error: errorMessage,
          nextPage: failureProgress.nextPage,
        };
      }
    } finally {
      favoriteFolderSyncPromise = null;
      finishFavoriteSync(task);
    }
    sendResponse(response);
  };

  const handleSyncAllFavoriteFolders = async (
    message: SyncAllFavoriteFoldersRequest,
    sendResponse: (response: SyncAllFavoriteFoldersResponse) => void,
  ) => {
    if (favoriteSyncPromise) {
      sendResponse({ success: false, error: "收藏夹同步正在进行中，请稍后再试" });
      return;
    }

    const { folders, isFullSync } = message;
    if (!Array.isArray(folders) || folders.length === 0) {
      sendResponse({ success: false, error: "没有需要同步的收藏夹" });
      return;
    }
    if (typeof isFullSync !== "boolean") {
      sendResponse({ success: false, error: "同步方式不完整" });
      return;
    }
    if (
      folders.some(
        (folder) =>
          !Number.isSafeInteger(folder.id) || folder.id <= 0 || typeof folder.title !== "string",
      )
    ) {
      sendResponse({ success: false, error: "收藏夹信息不完整" });
      return;
    }

    const mode = isFullSync ? "full" : "incremental";
    const folderIds = folders.map((folder) => folder.id);
    if (new Set(folderIds).size !== folderIds.length) {
      sendResponse({ success: false, error: "收藏夹列表包含重复项目" });
      return;
    }

    const previousProgress = await getStorageValue<AllFavoriteFoldersSyncProgress | null>(
      ALL_FAVORITE_FOLDERS_SYNC_PROGRESS,
      null,
    );
    const checkpoint = normalizeAllFoldersCheckpoint(previousProgress, folderIds, mode);
    if (
      checkpoint?.status === "paused" &&
      checkpoint.retryAfter &&
      Date.now() < checkpoint.retryAfter
    ) {
      sendResponse({
        success: false,
        status: "paused",
        error: checkpoint.message || "全部收藏夹同步正在冷却，请稍后继续",
        currentFolderIndex: checkpoint.currentFolderIndex,
        currentFolderId: checkpoint.currentFolderId,
        nextPage: checkpoint.nextPage,
        retryAfter: checkpoint.retryAfter,
      });
      return;
    }

    const startedAt = checkpoint?.startedAt ?? Date.now();

    const task = startFavoriteSync(async () => {
      let currentFolderIndex = checkpoint?.currentFolderIndex ?? 0;
      let completedCount = currentFolderIndex;
      const failedFolders = [...(checkpoint?.failedFolders ?? [])];
      const rateLimitCount = checkpoint?.rateLimitCount;
      const initialFolder = folders[currentFolderIndex];

      await updateAllFavoriteFoldersSyncProgress({
        status: "syncing",
        mode,
        currentFolderIndex,
        currentFolderId: initialFolder.id,
        currentFolderTitle: initialFolder.title,
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
        ...(rateLimitCount ? { rateLimitCount } : {}),
      });

      const { sessdata, folders: onlineFolders } = await getFavoriteFoldersFromBilibili();
      const onlineFoldersById = new Map(onlineFolders.map((folder) => [folder.id, folder]));

      for (let index = currentFolderIndex; index < folders.length; index++) {
        const folder = folders[index];
        const resumeFolder =
          checkpoint?.currentFolderIndex === index && checkpoint.currentFolderId === folder.id
            ? checkpoint
            : null;
        let currentPage = resumeFolder?.currentPage ?? 0;
        let nextPage = resumeFolder?.nextPage ?? 1;
        let processedItems = resumeFolder?.processedItems ?? 0;
        let totalItems = resumeFolder?.totalItems ?? 0;
        let onlineResourceIds = resumeFolder?.onlineResourceIds ?? [];
        currentFolderIndex = index;
        completedCount = index;

        await updateAllFavoriteFoldersSyncProgress({
          status: "syncing",
          mode,
          currentFolderIndex,
          currentFolderId: folder.id,
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
          ...(rateLimitCount ? { rateLimitCount } : {}),
        });

        const onlineFolder = onlineFoldersById.get(folder.id);
        if (!onlineFolder) {
          throw new FavoriteFolderRequestError(`收藏夹「${folder.title}」不存在或无权访问`, "data");
        }

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
              currentFolderIndex,
              currentFolderId: folder.id,
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
              ...(rateLimitCount ? { rateLimitCount } : {}),
            });
            console.info("[all-favorite-folders-sync] checkpoint", {
              currentFolderIndex,
              currentFolderId: folder.id,
              completedCount,
              currentPage,
              nextPage,
              rateLimitCount: rateLimitCount ?? 0,
            });
          },
          resumeFolder,
          true,
        );

        const currentFailureIndex = failedFolders.findIndex((item) => item.id === folder.id);
        if (currentFailureIndex >= 0) failedFolders.splice(currentFailureIndex, 1);

        completedCount = index + 1;
        currentFolderIndex = completedCount;
        const nextFolder = folders[currentFolderIndex];
        if (nextFolder) {
          await updateAllFavoriteFoldersSyncProgress({
            status: "syncing",
            mode,
            currentFolderIndex,
            currentFolderId: nextFolder.id,
            currentFolderTitle: nextFolder.title,
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
            ...(rateLimitCount ? { rateLimitCount } : {}),
          });

          const folderDelay = getRandomDelay(
            FAVORITE_FOLDER_DELAY_MIN_MS,
            FAVORITE_FOLDER_DELAY_MAX_MS,
          );
          await new Promise((resolve) => setTimeout(resolve, folderDelay));
        }
      }

      const messageText = `全部 ${folders.length} 个收藏夹${isFullSync ? "全量" : "增量"}同步成功`;
      await updateAllFavoriteFoldersSyncProgress({
        status: "success",
        mode,
        currentFolderIndex: folders.length,
        currentFolderId: null,
        currentFolderTitle: "",
        completedCount: folders.length,
        totalFolders: folders.length,
        failedFolders: [],
        folderIds,
        currentPage: 0,
        nextPage: 1,
        processedItems: 0,
        totalItems: 0,
        onlineResourceIds: [],
        startedAt,
        updatedAt: Date.now(),
        message: messageText,
      });
    });
    if (!task) {
      sendResponse({ success: false, error: "收藏夹同步正在进行中，请稍后再试" });
      return;
    }
    allFavoriteFoldersSyncPromise = task;

    try {
      await task;
      sendResponse({
        success: true,
        message: `全部 ${folders.length} 个收藏夹${isFullSync ? "全量" : "增量"}同步成功`,
        mode,
      });
    } catch (error) {
      console.error("同步所有收藏夹失败:", error);
      const requestError = normalizeFavoriteFolderRequestError(error);
      const progress = await getStorageValue<AllFavoriteFoldersSyncProgress | null>(
        ALL_FAVORITE_FOLDERS_SYNC_PROGRESS,
        null,
      );
      const latestCheckpoint = normalizeAllFoldersCheckpoint(progress, folderIds, mode);
      const currentFolderIndex = Math.min(
        latestCheckpoint?.currentFolderIndex ?? checkpoint?.currentFolderIndex ?? 0,
        folders.length - 1,
      );
      const currentFolder = folders[currentFolderIndex];
      const failureProgress: AllFavoriteFoldersSyncProgress = latestCheckpoint ?? {
        status: "error",
        mode,
        currentFolderIndex,
        currentFolderId: currentFolder.id,
        currentFolderTitle: currentFolder.title,
        completedCount: currentFolderIndex,
        totalFolders: folders.length,
        failedFolders: [],
        folderIds,
        currentPage: Math.max(0, (checkpoint?.nextPage ?? 1) - 1),
        nextPage: checkpoint?.nextPage ?? 1,
        processedItems: checkpoint?.processedItems ?? 0,
        totalItems: checkpoint?.totalItems ?? 0,
        onlineResourceIds: checkpoint?.onlineResourceIds ?? [],
        startedAt,
        updatedAt: Date.now(),
        ...(checkpoint?.rateLimitCount ? { rateLimitCount: checkpoint.rateLimitCount } : {}),
      };

      let response: SyncAllFavoriteFoldersResponse;
      if (requestError.kind === "rate_limited") {
        const rateLimitCount = (failureProgress.rateLimitCount ?? 0) + 1;
        const cooldownIndex = Math.min(
          rateLimitCount - 1,
          FAVORITE_FOLDER_RATE_LIMIT_COOLDOWNS_MS.length - 1,
        );
        const retryAfter = Date.now() + FAVORITE_FOLDER_RATE_LIMIT_COOLDOWNS_MS[cooldownIndex];
        const errorMessage = "触发 B 站访问风控，全部收藏夹同步已暂停";
        await updateAllFavoriteFoldersSyncProgress({
          ...failureProgress,
          status: "paused",
          errorKind: "rate_limited",
          rateLimitCount,
          retryAfter,
          updatedAt: Date.now(),
          message: errorMessage,
        });
        response = {
          success: false,
          status: "paused",
          error: errorMessage,
          currentFolderIndex: failureProgress.currentFolderIndex,
          currentFolderId: failureProgress.currentFolderId,
          nextPage: failureProgress.nextPage,
          retryAfter,
        };
      } else {
        const errorMessage = requestError.message;
        const failedFolders = [...failureProgress.failedFolders];
        const failedFolderId = failureProgress.currentFolderId;
        if (failedFolderId !== null) {
          const failure = {
            id: failedFolderId,
            title: failureProgress.currentFolderTitle,
            error: errorMessage,
          };
          const existingFailureIndex = failedFolders.findIndex(
            (folder) => folder.id === failedFolderId,
          );
          if (existingFailureIndex >= 0) failedFolders[existingFailureIndex] = failure;
          else failedFolders.push(failure);
        }
        await updateAllFavoriteFoldersSyncProgress({
          ...failureProgress,
          status: "error",
          failedFolders,
          errorKind: requestError.kind,
          updatedAt: Date.now(),
          message: errorMessage,
        });
        response = {
          success: false,
          status: "error",
          error: errorMessage,
          currentFolderIndex: failureProgress.currentFolderIndex,
          currentFolderId: failureProgress.currentFolderId,
          nextPage: failureProgress.nextPage,
        };
      }
      sendResponse(response);
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
        status: "interrupted",
        updatedAt: Date.now(),
        message: `同步任务已中断，可从第 ${progress.nextPage} 页继续`,
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
    const storedProgress = await getStorageValue<AllFavoriteFoldersSyncProgress | null>(
      ALL_FAVORITE_FOLDERS_SYNC_PROGRESS,
      null,
    );
    const progress =
      storedProgress &&
      storedProgress.status !== "success" &&
      Array.isArray(storedProgress.folderIds)
        ? (normalizeAllFoldersCheckpoint(
            storedProgress,
            storedProgress.folderIds,
            storedProgress.mode,
          ) ?? storedProgress)
        : storedProgress;

    if (progress?.status === "syncing" && !allFavoriteFoldersSyncPromise) {
      const interruptedProgress: AllFavoriteFoldersSyncProgress = {
        ...progress,
        status: "interrupted",
        updatedAt: Date.now(),
        message: `同步任务已中断，可从「${progress.currentFolderTitle}」第 ${progress.nextPage} 页继续`,
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
      if (favoriteSyncPromise) {
        sendResponse({ success: false, error: "收藏夹同步正在进行中，已跳过目录刷新" });
        return;
      }

      const [singleProgress, allProgress] = await Promise.all([
        getStorageValue<FavoriteFolderSyncProgress | null>(FAVORITE_FOLDER_SYNC_PROGRESS, null),
        getStorageValue<AllFavoriteFoldersSyncProgress | null>(
          ALL_FAVORITE_FOLDERS_SYNC_PROGRESS,
          null,
        ),
      ]);
      const now = Date.now();
      const isCoolingDown = [singleProgress, allProgress].some(
        (progress) =>
          progress?.status === "paused" &&
          Boolean(progress.retryAfter && progress.retryAfter > now),
      );
      if (isCoolingDown) {
        sendResponse({ success: false, error: "收藏夹同步正在冷却，已跳过目录刷新" });
        return;
      }

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
    const id = Number(message?.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      sendResponse({ success: false, error: "历史记录信息不完整" });
      return;
    }
    try {
      const syncDeleteFromBilibili = await getStorageValue(IS_SYNC_DELETE_FROM_BILIBILI, true);
      if (!syncDeleteFromBilibili) {
        sendResponse({ success: true, message: "同步删除未开启" });
        return;
      }
      await deleteHistoryItem(id);
      await addDeletedHistoryIds([id]);
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
      // 增量同步的兜底翻页上限，防止"首尾记录均不存在于本地"时无限翻页。
      // 超出后按服务端 is_end 或空列表正常收尾，不影响正确性，只是多拉几页。
      const MAX_INCREMENTAL_PAGES = 500;
      let incrementalPages = 0;
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
        // 服务端返回 is_end 或空列表才代表真正翻完。仅依赖 list.length 会在
        // 最后一页 cursor 归零后重新从头返回数据，造成死循环。
        hasMore = list.length > 0 && !cursor.is_end;
        max = cursor.max;
        view_at = cursor.view_at;
        incrementalPages++;

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
            } else if (incrementalPages >= MAX_INCREMENTAL_PAGES) {
              console.warn(
                `增量同步已超过 ${MAX_INCREMENTAL_PAGES} 页仍未遇到本地边界，停止翻页（不影响已同步数据）`,
              );
              hasMore = false;
            }
          }

          // 批量存储历史记录
          for (const item of list) {
            // 保留旧记录已有的 uploaded 标记，避免重复上传
            const existing = await getItem(store, item.history.oid);
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
              uploaded: existing?.uploaded === true,
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
    if (navRes.status === 412 || navRes.status === 429) {
      throw new FavoriteFolderRequestError(
        `获取用户信息失败：HTTP ${navRes.status}`,
        "rate_limited",
        navRes.status,
      );
    }
    if (navRes.status === 401 || navRes.status === 403) {
      throw new FavoriteFolderRequestError("登录状态无效，请重新登录 B 站", "auth", navRes.status);
    }
    if (!navRes.ok) {
      throw new FavoriteFolderRequestError(
        `获取用户信息失败：HTTP ${navRes.status}`,
        navRes.status >= 500 ? "server" : "unknown",
        navRes.status,
      );
    }

    const navData = await navRes.json();
    if (navData.code === -412) {
      throw new FavoriteFolderRequestError(
        navData.message || "获取用户信息触发访问风控",
        "rate_limited",
        412,
      );
    }
    if (navData.code !== 0) {
      throw new FavoriteFolderRequestError(navData.message || "获取用户信息失败", "unknown");
    }

    const mid = Number(navData.data?.mid);
    if (!Number.isSafeInteger(mid) || mid <= 0) throw new Error("获取用户信息失败");

    const folderRes = await fetch(
      `https://api.bilibili.com/x/v3/fav/folder/created/list-all?up_mid=${mid}`,
      { headers: { Cookie: `SESSDATA=${sessdata}` } },
    );
    if (folderRes.status === 412 || folderRes.status === 429) {
      throw new FavoriteFolderRequestError(
        `获取收藏夹失败：HTTP ${folderRes.status}`,
        "rate_limited",
        folderRes.status,
      );
    }
    if (folderRes.status === 401 || folderRes.status === 403) {
      throw new FavoriteFolderRequestError(
        "登录状态无效，请重新登录 B 站",
        "auth",
        folderRes.status,
      );
    }
    if (!folderRes.ok) {
      throw new FavoriteFolderRequestError(
        `获取收藏夹失败：HTTP ${folderRes.status}`,
        folderRes.status >= 500 ? "server" : "unknown",
        folderRes.status,
      );
    }

    const folderData = await folderRes.json();
    if (folderData.code === -412) {
      throw new FavoriteFolderRequestError(
        folderData.message || "获取收藏夹触发访问风控",
        "rate_limited",
        412,
      );
    }
    if (folderData.code !== 0) {
      throw new FavoriteFolderRequestError(folderData.message || "获取收藏夹失败", "unknown");
    }

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
    let lastError = new FavoriteFolderRequestError("未知错误", "unknown");

    for (let attempt = 1; attempt <= 3; attempt++) {
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

        if (response.status === 412 || response.status === 429) {
          throw new FavoriteFolderRequestError(
            `HTTP ${response.status}`,
            "rate_limited",
            response.status,
          );
        }
        if (response.status === 401 || response.status === 403) {
          throw new FavoriteFolderRequestError(
            `登录状态无效（HTTP ${response.status}）`,
            "auth",
            response.status,
          );
        }
        if (!response.ok) {
          throw new FavoriteFolderRequestError(
            `HTTP ${response.status}`,
            response.status >= 500 ? "server" : "unknown",
            response.status,
          );
        }

        const data = await response.json();
        if (data.code === -412) {
          throw new FavoriteFolderRequestError(
            data.message || "B 站接口触发访问风控",
            "rate_limited",
            412,
          );
        }
        if (data.code !== 0) {
          throw new FavoriteFolderRequestError(data.message || "B 站接口返回失败", "unknown");
        }
        if (!data.data || (data.data.medias != null && !Array.isArray(data.data.medias))) {
          throw new FavoriteFolderRequestError("收藏夹资源数据格式异常", "data");
        }

        return {
          medias: data.data.medias || [],
          hasMore: Boolean(data.data.has_more),
        };
      } catch (error) {
        lastError = normalizeFavoriteFolderRequestError(error);
        const canRetry = lastError.kind === "network" || lastError.kind === "server";
        if (!canRetry || attempt >= 3) {
          throw new FavoriteFolderRequestError(
            `获取收藏夹「${folder.title}」第 ${page} 页失败：${lastError.message}`,
            lastError.kind,
            lastError.status,
          );
        }

        const retryDelay = (attempt === 1 ? 2000 : 5000) + getRandomDelay(0, 500);
        console.warn(
          `请求收藏夹 ${folder.title} 第 ${page} 页失败，${retryDelay}ms 后重试 (${attempt}/3)`,
        );
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      } finally {
        clearTimeout(timeoutId);
      }
    }

    throw new FavoriteFolderRequestError(
      `获取收藏夹「${folder.title}」第 ${page} 页失败：${lastError.message}`,
      lastError.kind,
      lastError.status,
    );
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
    useConservativePageDelay = false,
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
      const pageDelay = useConservativePageDelay
        ? getRandomDelay(FAVORITE_FOLDER_PAGE_DELAY_MIN_MS, FAVORITE_FOLDER_PAGE_DELAY_MAX_MS)
        : 500;
      await new Promise((resolve) => setTimeout(resolve, pageDelay));
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
      ...(checkpoint?.rateLimitCount ? { rateLimitCount: checkpoint.rateLimitCount } : {}),
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
          ...(checkpoint?.rateLimitCount ? { rateLimitCount: checkpoint.rateLimitCount } : {}),
        });
      },
      checkpoint,
      true,
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
    let total = 0;
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

      if (collections.length >= total) break;
      if (list.length === 0) break; // 空页保护，防止接口异常导致死循环
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
      if (hasMore && medias.length === 0) break; // 空页保护，防止接口异常导致死循环
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
      const config = await loadWebDavConfig();
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
      const deletedHistoryIds = await getDeletedHistoryIds();
      for (const item of items) {
        const remote = await downloadFile(config, item.file);
        if (remote) {
          if (item.key === "history") {
            await smartMergeHistory(JSON.parse(remote), deletedHistoryIds);
          } else {
            await item.merge(JSON.parse(remote));
          }
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
