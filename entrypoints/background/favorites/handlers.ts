/**
 * 收藏夹模块对外暴露的消息处理函数。
 */
import { replaceFavFolders } from "@/utils/db";
import type { RefreshFavoriteFoldersResponse } from "@/utils/types";
import type { MessageHandlerMap } from "../shared/types";
import { handleGetAllFoldersProgress, handleSyncAllFavoriteFolders } from "./allFoldersSync";
import { fetchFavoriteFolders } from "./api";
import { isFavoriteSyncRunning } from "./lock";
import { isCoolingDown, loadAllFoldersProgress, loadSingleFolderProgress } from "./progress";
import { handleGetSingleFolderProgress, handleSyncFavoriteFolder } from "./singleFolderSync";

/** 只刷新收藏夹目录（不拉资源）；同步进行中或风控冷却期间跳过，避免额外请求 */
async function handleRefreshFavoriteFolders(): Promise<RefreshFavoriteFoldersResponse> {
  if (isFavoriteSyncRunning()) {
    return { success: false, error: "收藏夹同步正在进行中，已跳过目录刷新" };
  }

  const progresses = await Promise.all([loadSingleFolderProgress(), loadAllFoldersProgress()]);
  if (progresses.some((progress) => isCoolingDown(progress))) {
    return { success: false, error: "收藏夹同步正在冷却，已跳过目录刷新" };
  }

  const { folders } = await fetchFavoriteFolders();
  await replaceFavFolders(folders);
  return { success: true, folderCount: folders.length };
}

export const favoriteMessageHandlers: MessageHandlerMap = {
  syncFavoriteFolder: handleSyncFavoriteFolder,
  syncAllFavoriteFolders: handleSyncAllFavoriteFolders,
  getFavoriteFolderSyncProgress: handleGetSingleFolderProgress,
  getAllFavoriteFoldersSyncProgress: handleGetAllFoldersProgress,
  refreshFavoriteFolders: handleRefreshFavoriteFolders,
};
