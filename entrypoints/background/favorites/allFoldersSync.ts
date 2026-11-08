/**
 * 依次同步多个收藏夹（支持跨收藏夹的断点续传与风控冷却）。
 */
import { saveFavFolders } from "@/utils/db";
import type {
  AllFavoriteFoldersSyncProgress,
  SyncAllFavoriteFoldersRequest,
  SyncAllFavoriteFoldersResponse,
} from "@/utils/types";
import { BiliRequestError, toBiliRequestError } from "../shared/bilibiliApi";
import { syncModeLabel, SyncMode, toSyncMode } from "../shared/types";
import { randomBetween, sleep } from "../shared/utils";
import { fetchFavoriteFolders } from "./api";
import { FAVORITE_SYNC_BUSY, isFavoriteSyncRunning, tryRunExclusive } from "./lock";
import {
  buildFailurePatch,
  FolderPageProgress,
  isCoolingDown,
  loadAllFoldersProgress,
  normalizeAllFoldersCheckpoint,
  pageProgressFrom,
  saveAllFoldersProgress,
  withRateLimitCount,
} from "./progress";
import { syncFolderResources } from "./syncResources";

/** 收藏夹之间的间隔，降低触发风控的概率 */
const FOLDER_DELAY_MIN_MS = 2000;
const FOLDER_DELAY_MAX_MS = 5000;

type FolderRef = SyncAllFavoriteFoldersRequest["folders"][number];
type FailedFolder = AllFavoriteFoldersSyncProgress["failedFolders"][number];

interface AllFoldersTask {
  folders: FolderRef[];
  folderIds: number[];
  isFullSync: boolean;
  mode: SyncMode;
  startedAt: number;
  checkpoint: AllFavoriteFoldersSyncProgress | null;
}

function validateRequest({ folders, isFullSync }: SyncAllFavoriteFoldersRequest): string | null {
  if (!Array.isArray(folders) || folders.length === 0) return "没有需要同步的收藏夹";
  if (typeof isFullSync !== "boolean") return "同步方式不完整";
  const hasInvalidFolder = folders.some(
    (folder) =>
      !Number.isSafeInteger(folder.id) || folder.id <= 0 || typeof folder.title !== "string",
  );
  if (hasInvalidFolder) return "收藏夹信息不完整";
  if (new Set(folders.map((folder) => folder.id)).size !== folders.length) {
    return "收藏夹列表包含重复项目";
  }
  return null;
}

export async function handleSyncAllFavoriteFolders(
  message: SyncAllFavoriteFoldersRequest,
): Promise<SyncAllFavoriteFoldersResponse> {
  if (isFavoriteSyncRunning()) return FAVORITE_SYNC_BUSY;
  const invalidReason = validateRequest(message);
  if (invalidReason) return { success: false, error: invalidReason };

  const { folders, isFullSync } = message;
  const mode = toSyncMode(isFullSync);
  const folderIds = folders.map((folder) => folder.id);
  const checkpoint = normalizeAllFoldersCheckpoint(await loadAllFoldersProgress(), folderIds, mode);

  if (checkpoint && isCoolingDown(checkpoint)) {
    return {
      success: false,
      status: "paused",
      error: checkpoint.message || "全部收藏夹同步正在冷却，请稍后继续",
      currentFolderIndex: checkpoint.currentFolderIndex,
      currentFolderId: checkpoint.currentFolderId,
      nextPage: checkpoint.nextPage,
      retryAfter: checkpoint.retryAfter,
    };
  }

  const task: AllFoldersTask = {
    folders,
    folderIds,
    isFullSync,
    mode,
    startedAt: checkpoint?.startedAt ?? Date.now(),
    checkpoint,
  };
  return (await tryRunExclusive("all-folders", () => runTask(task))) ?? FAVORITE_SYNC_BUSY;
}

/** 执行同步并把结果（成功/失败）写入进度，整个过程都在锁内 */
async function runTask(task: AllFoldersTask): Promise<SyncAllFavoriteFoldersResponse> {
  try {
    await syncAllFolders(task);
    const message = `全部 ${task.folders.length} 个收藏夹${syncModeLabel(task.isFullSync)}同步成功`;
    await markSuccess(task, message);
    return { success: true, message, mode: task.mode };
  } catch (error) {
    console.error("同步所有收藏夹失败:", error);
    return markFailure(task, error);
  }
}

async function syncAllFolders(task: AllFoldersTask): Promise<void> {
  const { folders, folderIds, isFullSync, mode, startedAt, checkpoint } = task;
  const failedFolders = [...(checkpoint?.failedFolders ?? [])];

  /** 把"正在同步第 index 个收藏夹"的状态写入进度 */
  const writeSyncing = (index: number, pageProgress: FolderPageProgress) =>
    saveAllFoldersProgress({
      status: "syncing",
      mode,
      folderIds,
      totalFolders: folders.length,
      currentFolderIndex: index,
      completedCount: index,
      currentFolderId: folders[index].id,
      currentFolderTitle: folders[index].title,
      failedFolders,
      ...pageProgress,
      startedAt,
      updatedAt: Date.now(),
      ...withRateLimitCount(checkpoint?.rateLimitCount),
    });

  const startIndex = checkpoint?.currentFolderIndex ?? 0;
  // 先落盘"同步中"，前端立即可见；随后才去请求收藏夹列表
  await writeSyncing(startIndex, pageProgressFrom(checkpoint));

  const { sessdata, folders: onlineFolders } = await fetchFavoriteFolders();
  const onlineFoldersById = new Map(onlineFolders.map((folder) => [folder.id, folder]));

  for (let index = startIndex; index < folders.length; index++) {
    const folder = folders[index];
    const onlineFolder = onlineFoldersById.get(folder.id);
    if (!onlineFolder) {
      throw new BiliRequestError(`收藏夹「${folder.title}」不存在或无权访问`, "data");
    }

    await saveFavFolders([onlineFolder]);
    await syncFolderResources(onlineFolder, sessdata, {
      isFullSync,
      // 只有断点所在的那个收藏夹需要续传，后面的都从头开始
      resumeFrom: index === startIndex ? checkpoint : null,
      onProgress: async (pageProgress) => {
        await writeSyncing(index, pageProgress);
        console.info("[all-favorite-folders-sync] checkpoint", {
          currentFolderIndex: index,
          currentFolderId: folder.id,
          currentPage: pageProgress.currentPage,
          nextPage: pageProgress.nextPage,
          rateLimitCount: checkpoint?.rateLimitCount ?? 0,
        });
      },
    });
    removeFailedFolder(failedFolders, folder.id);

    const hasNext = index + 1 < folders.length;
    if (hasNext) {
      await writeSyncing(index + 1, pageProgressFrom(null));
      await sleep(randomBetween(FOLDER_DELAY_MIN_MS, FOLDER_DELAY_MAX_MS));
    }
  }
}

async function markSuccess(task: AllFoldersTask, message: string): Promise<void> {
  await saveAllFoldersProgress({
    status: "success",
    mode: task.mode,
    folderIds: task.folderIds,
    totalFolders: task.folders.length,
    currentFolderIndex: task.folders.length,
    completedCount: task.folders.length,
    currentFolderId: null,
    currentFolderTitle: "",
    failedFolders: [],
    ...pageProgressFrom(null),
    startedAt: task.startedAt,
    updatedAt: Date.now(),
    message,
  });
}

async function markFailure(
  task: AllFoldersTask,
  error: unknown,
): Promise<SyncAllFavoriteFoldersResponse> {
  const requestError = toBiliRequestError(error);
  const base = await loadFailureBase(task);
  const patch = buildFailurePatch(
    requestError,
    base.rateLimitCount,
    "触发 B 站访问风控，全部收藏夹同步已暂停",
  );

  // 风控暂停不算该收藏夹失败；其他错误则记录到失败列表
  const failedFolders =
    patch.status === "error" && base.currentFolderId !== null
      ? upsertFailedFolder(base.failedFolders, {
          id: base.currentFolderId,
          title: base.currentFolderTitle,
          error: patch.message,
        })
      : base.failedFolders;
  await saveAllFoldersProgress({ ...base, ...patch, failedFolders });

  return {
    success: false,
    status: patch.status,
    error: patch.message,
    currentFolderIndex: base.currentFolderIndex,
    currentFolderId: base.currentFolderId,
    nextPage: base.nextPage,
    ...(patch.status === "paused" ? { retryAfter: patch.retryAfter } : {}),
  };
}

/** 失败时的进度基准：优先用同步过程中写入的最新断点，否则用本次开始时的断点 */
async function loadFailureBase(task: AllFoldersTask): Promise<AllFavoriteFoldersSyncProgress> {
  const { folders, folderIds, mode, startedAt, checkpoint } = task;
  const latest = normalizeAllFoldersCheckpoint(await loadAllFoldersProgress(), folderIds, mode);
  if (latest) return latest;

  const index = Math.min(checkpoint?.currentFolderIndex ?? 0, folders.length - 1);
  return {
    status: "error",
    mode,
    folderIds,
    totalFolders: folders.length,
    currentFolderIndex: index,
    completedCount: index,
    currentFolderId: folders[index].id,
    currentFolderTitle: folders[index].title,
    failedFolders: [],
    ...pageProgressFrom(checkpoint),
    currentPage: Math.max(0, (checkpoint?.nextPage ?? 1) - 1),
    startedAt,
    updatedAt: Date.now(),
    ...withRateLimitCount(checkpoint?.rateLimitCount),
  };
}

function removeFailedFolder(failedFolders: FailedFolder[], folderId: number): void {
  const index = failedFolders.findIndex((item) => item.id === folderId);
  if (index >= 0) failedFolders.splice(index, 1);
}

function upsertFailedFolder(failedFolders: FailedFolder[], failure: FailedFolder): FailedFolder[] {
  const exists = failedFolders.some((item) => item.id === failure.id);
  return exists
    ? failedFolders.map((item) => (item.id === failure.id ? failure : item))
    : [...failedFolders, failure];
}

/**
 * 前端轮询进度。若进度显示"同步中"但后台并没有任务在跑（如 service worker 被回收），
 * 则改为"已中断"，前端可据此提示用户从断点继续。
 */
export async function handleGetAllFoldersProgress(): Promise<AllFavoriteFoldersSyncProgress | null> {
  const stored = await loadAllFoldersProgress();
  // 兼容旧版本断点：能规范化就用规范化后的，否则原样返回
  const progress =
    stored && stored.status !== "success" && Array.isArray(stored.folderIds)
      ? (normalizeAllFoldersCheckpoint(stored, stored.folderIds, stored.mode) ?? stored)
      : stored;
  if (progress?.status !== "syncing" || isFavoriteSyncRunning("all-folders")) return progress;

  const interrupted: AllFavoriteFoldersSyncProgress = {
    ...progress,
    status: "interrupted",
    updatedAt: Date.now(),
    message: `同步任务已中断，可从「${progress.currentFolderTitle}」第 ${progress.nextPage} 页继续`,
  };
  await saveAllFoldersProgress(interrupted);
  return interrupted;
}
