/**
 * 收藏夹同步进度（断点）的持久化与校验。
 * 进度存在 storage 里，前端弹窗轮询读取；后台被回收后也能凭它断点续传。
 */
import {
  ALL_FAVORITE_FOLDERS_SYNC_PROGRESS,
  FAVORITE_FOLDER_SYNC_PROGRESS,
} from "@/utils/constants";
import { getStorageValue, setStorageValue } from "@/utils/storage";
import type { AllFavoriteFoldersSyncProgress, FavoriteFolderSyncProgress } from "@/utils/types";
import type { BiliRequestError } from "../shared/bilibiliApi";
import type { SyncMode } from "../shared/types";

/** 触发风控后的冷却时间，连续触发时逐级加长：10 → 30 → 60 分钟 */
const RATE_LIMIT_COOLDOWNS_MS = [10, 30, 60].map((minutes) => minutes * 60_000);

/** 单个收藏夹内的翻页进度 */
export interface FolderPageProgress {
  currentPage: number;
  nextPage: number;
  processedItems: number;
  totalItems: number;
  onlineResourceIds: number[];
}

/** 从已有断点中取出翻页进度；没有断点时返回初始值 */
export const pageProgressFrom = (
  checkpoint?: Partial<FolderPageProgress> | null,
): FolderPageProgress => ({
  currentPage: checkpoint?.currentPage ?? 0,
  nextPage: checkpoint?.nextPage ?? 1,
  processedItems: checkpoint?.processedItems ?? 0,
  totalItems: checkpoint?.totalItems ?? 0,
  onlineResourceIds: checkpoint?.onlineResourceIds ?? [],
});

/** 非空时附带 rateLimitCount，保证风控计数在断点间延续 */
export const withRateLimitCount = (count?: number) => (count ? { rateLimitCount: count } : {});

// ========== 存取 ==========

async function saveOrRemove<T>(key: string, value: T | null): Promise<void> {
  if (value === null) return browser.storage.local.remove(key);
  return setStorageValue(key, value);
}

export const loadSingleFolderProgress = () =>
  getStorageValue<FavoriteFolderSyncProgress | null>(FAVORITE_FOLDER_SYNC_PROGRESS, null);

export const saveSingleFolderProgress = (progress: FavoriteFolderSyncProgress | null) =>
  saveOrRemove(FAVORITE_FOLDER_SYNC_PROGRESS, progress);

export const loadAllFoldersProgress = () =>
  getStorageValue<AllFavoriteFoldersSyncProgress | null>(ALL_FAVORITE_FOLDERS_SYNC_PROGRESS, null);

export const saveAllFoldersProgress = (progress: AllFavoriteFoldersSyncProgress | null) =>
  saveOrRemove(ALL_FAVORITE_FOLDERS_SYNC_PROGRESS, progress);

// ========== 风控冷却 ==========

/** 处于风控暂停且冷却时间未到 */
export const isCoolingDown = (
  progress: { status: string; retryAfter?: number } | null,
  now = Date.now(),
): boolean =>
  progress?.status === "paused" && Boolean(progress.retryAfter && now < progress.retryAfter);

/**
 * 根据失败原因生成进度补丁：
 * - 风控：暂停并进入冷却，冷却时长随连续风控次数递增；
 * - 其他：标记为 error，前端可以手动继续。
 */
export function buildFailurePatch(
  error: BiliRequestError,
  previousRateLimitCount: number | undefined,
  rateLimitedMessage: string,
) {
  const updatedAt = Date.now();
  if (error.kind !== "rate_limited") {
    return { status: "error", errorKind: error.kind, message: error.message, updatedAt } as const;
  }

  const rateLimitCount = (previousRateLimitCount ?? 0) + 1;
  const cooldownIndex = Math.min(rateLimitCount - 1, RATE_LIMIT_COOLDOWNS_MS.length - 1);
  return {
    status: "paused",
    errorKind: "rate_limited",
    rateLimitCount,
    retryAfter: updatedAt + RATE_LIMIT_COOLDOWNS_MS[cooldownIndex],
    message: rateLimitedMessage,
    updatedAt,
  } as const;
}

// ========== 断点校验 ==========

/** 单个收藏夹：上次未完成且是同一个收藏夹、同一种模式，才可以续传 */
export const isResumableSingleCheckpoint = (
  progress: FavoriteFolderSyncProgress | null,
  folderId: number,
  mode: SyncMode,
): progress is FavoriteFolderSyncProgress =>
  progress !== null &&
  progress.status !== "success" &&
  progress.folderId === folderId &&
  progress.mode === mode &&
  Number.isSafeInteger(progress.nextPage) &&
  progress.nextPage >= 1;

const isSameFolderList = (a: unknown, b: number[]) =>
  Array.isArray(a) && a.length === b.length && a.every((id, index) => id === b[index]);

/**
 * 全部收藏夹：校验断点是否属于本次任务（收藏夹列表、模式一致），并修正字段。
 * 不可续传时返回 null。兼容旧版本断点里缺少 currentFolderIndex / currentFolderId 的情况。
 */
export function normalizeAllFoldersCheckpoint(
  progress: AllFavoriteFoldersSyncProgress | null,
  folderIds: number[],
  mode: SyncMode,
): AllFavoriteFoldersSyncProgress | null {
  if (
    !progress ||
    progress.status === "success" ||
    progress.mode !== mode ||
    !isSameFolderList(progress.folderIds, folderIds) ||
    !Number.isSafeInteger(progress.nextPage) ||
    progress.nextPage < 1
  ) {
    return null;
  }

  const hasExplicitIndex = Number.isSafeInteger(progress.currentFolderIndex);
  const currentFolderIndex = hasExplicitIndex
    ? progress.currentFolderIndex
    : progress.completedCount;
  const isIndexValid =
    Number.isSafeInteger(currentFolderIndex) &&
    currentFolderIndex >= 0 &&
    currentFolderIndex < folderIds.length &&
    (!hasExplicitIndex || progress.completedCount === currentFolderIndex);
  if (!isIndexValid) return null;

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
}
