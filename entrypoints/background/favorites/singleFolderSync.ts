/**
 * 同步单个收藏夹（支持断点续传与风控冷却）。
 */
import { saveFavFolders } from "@/utils/db";
import type {
  FavoriteFolder,
  FavoriteFolderSyncProgress,
  SyncFavoriteFolderRequest,
  SyncFavoriteFolderResponse,
} from "@/utils/types";
import { toBiliRequestError } from "../shared/bilibiliApi";
import { syncModeLabel, SyncMode, toSyncMode } from "../shared/types";
import { fetchFavoriteFolders } from "./api";
import { FAVORITE_SYNC_BUSY, isFavoriteSyncRunning, tryRunExclusive } from "./lock";
import {
  buildFailurePatch,
  isCoolingDown,
  isResumableSingleCheckpoint,
  loadSingleFolderProgress,
  pageProgressFrom,
  saveSingleFolderProgress,
  withRateLimitCount,
} from "./progress";
import { syncFolderResources } from "./syncResources";

interface SingleFolderTask {
  folderId: number;
  folderTitle: string;
  isFullSync: boolean;
  mode: SyncMode;
  startedAt: number;
  checkpoint: FavoriteFolderSyncProgress | null;
}

function validateRequest(message: SyncFavoriteFolderRequest): string | null {
  const folderId = Number(message.folderId);
  if (!Number.isSafeInteger(folderId) || folderId <= 0) return "收藏夹信息不完整";
  if (typeof message.isFullSync !== "boolean") return "同步方式不完整";
  return null;
}

export async function handleSyncFavoriteFolder(
  message: SyncFavoriteFolderRequest,
): Promise<SyncFavoriteFolderResponse> {
  const invalidReason = validateRequest(message);
  if (invalidReason) return { success: false, error: invalidReason };
  if (isFavoriteSyncRunning()) return FAVORITE_SYNC_BUSY;

  const folderId = Number(message.folderId);
  const mode = toSyncMode(message.isFullSync);
  const previous = await loadSingleFolderProgress();

  const isSameTask = previous?.folderId === folderId && previous.mode === mode;
  if (isSameTask && isCoolingDown(previous)) {
    return {
      success: false,
      status: "paused",
      error: previous.message || "收藏夹同步正在冷却，请稍后继续",
      nextPage: previous.nextPage,
      retryAfter: previous.retryAfter,
    };
  }

  const checkpoint = isResumableSingleCheckpoint(previous, folderId, mode) ? previous : null;
  const task: SingleFolderTask = {
    folderId,
    folderTitle: message.folderTitle || "未知收藏夹",
    isFullSync: message.isFullSync,
    mode,
    startedAt: checkpoint?.startedAt ?? Date.now(),
    checkpoint,
  };
  return (await tryRunExclusive("single-folder", () => runTask(task))) ?? FAVORITE_SYNC_BUSY;
}

/** 执行同步并把结果（成功/失败）写入进度，整个过程都在锁内 */
async function runTask(task: SingleFolderTask): Promise<SyncFavoriteFolderResponse> {
  try {
    const folder = await syncFolder(task);
    return await markSuccess(task, folder);
  } catch (error) {
    console.error("同步单个收藏夹失败:", error);
    return markFailure(task, error);
  }
}

async function syncFolder(task: SingleFolderTask): Promise<FavoriteFolder> {
  const { folderId, isFullSync, mode, startedAt, checkpoint } = task;
  const { sessdata, folders } = await fetchFavoriteFolders();
  const folder = folders.find((item) => item.id === folderId);
  if (!folder) throw new Error("收藏夹不存在或无权访问");

  await saveFavFolders([folder]);
  await syncFolderResources(folder, sessdata, {
    isFullSync,
    resumeFrom: checkpoint,
    onProgress: (pageProgress) =>
      saveSingleFolderProgress({
        folderId,
        folderTitle: folder.title,
        mode,
        status: "syncing",
        ...pageProgress,
        startedAt,
        updatedAt: Date.now(),
        ...withRateLimitCount(checkpoint?.rateLimitCount),
      }),
  });
  return folder;
}

async function markSuccess(
  task: SingleFolderTask,
  folder: FavoriteFolder,
): Promise<SyncFavoriteFolderResponse> {
  const message = `「${folder.title}」${syncModeLabel(task.isFullSync)}同步成功`;
  const latest = await loadSingleFolderProgress();
  const pageProgress = latest
    ? pageProgressFrom(latest)
    : pageProgressFrom({ totalItems: folder.media_count });

  await saveSingleFolderProgress({
    folderId: task.folderId,
    folderTitle: folder.title,
    mode: task.mode,
    status: "success",
    ...pageProgress,
    startedAt: latest?.startedAt ?? task.startedAt,
    updatedAt: Date.now(),
    message,
  });
  return { success: true, message, folderId: task.folderId, mode: task.mode };
}

async function markFailure(
  task: SingleFolderTask,
  error: unknown,
): Promise<SyncFavoriteFolderResponse> {
  const { checkpoint } = task;
  // 优先使用同步过程中写入的最新断点；还没写入就退回到本次开始时的断点
  const base: FavoriteFolderSyncProgress = (await loadSingleFolderProgress()) ?? {
    folderId: task.folderId,
    folderTitle: task.folderTitle,
    mode: task.mode,
    status: "error",
    ...pageProgressFrom(checkpoint),
    currentPage: Math.max(0, (checkpoint?.nextPage ?? 1) - 1),
    startedAt: task.startedAt,
    updatedAt: Date.now(),
    ...withRateLimitCount(checkpoint?.rateLimitCount),
  };

  const patch = buildFailurePatch(
    toBiliRequestError(error),
    base.rateLimitCount,
    "触发 B 站访问风控，同步已暂停",
  );
  await saveSingleFolderProgress({ ...base, ...patch });

  return {
    success: false,
    status: patch.status,
    error: patch.message,
    nextPage: base.nextPage,
    ...(patch.status === "paused" ? { retryAfter: patch.retryAfter } : {}),
  };
}

/**
 * 前端轮询进度。若进度显示"同步中"但后台并没有任务在跑（如 service worker 被回收），
 * 则改为"已中断"，前端可据此提示用户从断点继续。
 */
export async function handleGetSingleFolderProgress(): Promise<FavoriteFolderSyncProgress | null> {
  const progress = await loadSingleFolderProgress();
  if (progress?.status !== "syncing" || isFavoriteSyncRunning("single-folder")) return progress;

  const interrupted: FavoriteFolderSyncProgress = {
    ...progress,
    status: "interrupted",
    updatedAt: Date.now(),
    message: `同步任务已中断，可从第 ${progress.nextPage} 页继续`,
  };
  await saveSingleFolderProgress(interrupted);
  return interrupted;
}
