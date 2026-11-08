/**
 * 同步单个收藏夹里的资源（视频）。被"单个收藏夹同步"和"全部收藏夹同步"共用。
 */
import { deleteFavResources, getFavResources, saveFavResources } from "@/utils/db";
import type { FavoriteFolder } from "@/utils/types";
import { randomBetween, sleep } from "../shared/utils";
import { FAVORITE_PAGE_SIZE, fetchFavoriteFolderPage } from "./api";
import type { FolderPageProgress } from "./progress";

const PAGE_DELAY_MIN_MS = 1500;
const PAGE_DELAY_MAX_MS = 3000;

export interface SyncFolderResourcesOptions {
  isFullSync: boolean;
  /** 断点续传：从上次中断处继续 */
  resumeFrom?: Pick<FolderPageProgress, "nextPage" | "processedItems" | "onlineResourceIds"> | null;
  /** 每处理完一页回调一次，调用方据此持久化断点 */
  onProgress?: (progress: FolderPageProgress) => Promise<void>;
}

/**
 * 逐页拉取并保存收藏夹资源。
 * - 增量：某页首尾资源都已存在于本地，说明后面都是旧数据，保存当前页后停止。
 * - 全量：翻完所有页后，删除本地存在但线上已取消收藏的资源。
 */
export async function syncFolderResources(
  folder: FavoriteFolder,
  sessdata: string,
  { isFullSync, resumeFrom, onProgress }: SyncFolderResourcesOptions,
): Promise<void> {
  console.log(`正在同步收藏夹: ${folder.title} (${isFullSync ? "全量" : "增量"})`);

  const localResources = await getFavResources(folder.id);
  const localIds = new Set(localResources.map((item) => item.id));
  const onlineIds = new Set<number>(resumeFrom?.onlineResourceIds ?? []);
  let processedItems = resumeFrom?.processedItems ?? 0;
  let page = Math.max(1, resumeFrom?.nextPage ?? 1);

  const report = (currentPage: number) =>
    onProgress?.({
      currentPage,
      nextPage: currentPage + 1,
      processedItems,
      totalItems: folder.media_count,
      onlineResourceIds: [...onlineIds],
    });

  await report(page - 1);

  while (true) {
    const { medias, hasMore } = await fetchFavoriteFolderPage(folder, page, sessdata);
    if (medias.length === 0) {
      if (hasMore) throw new Error(`收藏夹「${folder.title}」分页数据异常`);
      await report(page);
      break;
    }

    const resourceIds = medias.map((media) => Number(media.id));
    if (resourceIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
      throw new Error(`收藏夹「${folder.title}」资源数据格式异常`);
    }
    resourceIds.forEach((id) => onlineIds.add(id));

    // 必须在保存本页之前判断，否则本页数据会被当成"本地已有"
    const reachedLocalBoundary =
      !isFullSync && localIds.has(resourceIds[0]) && localIds.has(resourceIds.at(-1)!);

    await saveFavResources(
      medias.map((media, index) => ({
        ...media,
        folder_id: folder.id,
        index: (page - 1) * FAVORITE_PAGE_SIZE + index,
        id: resourceIds[index],
        bv_id: media.bv_id || media.bvid,
      })),
    );
    processedItems += medias.length;
    await report(page);

    if (!hasMore || reachedLocalBoundary) break;
    page += 1;
    await sleep(randomBetween(PAGE_DELAY_MIN_MS, PAGE_DELAY_MAX_MS));
  }

  // 增量模式可能提前停止，没有完整的线上列表，因此只有全量模式才清理
  if (isFullSync) await removeUnfavoritedResources(folder, localResources, onlineIds);
}

async function removeUnfavoritedResources(
  folder: FavoriteFolder,
  localResources: { id: number }[],
  onlineIds: Set<number>,
): Promise<void> {
  const idsToDelete = localResources
    .filter((item) => !onlineIds.has(item.id))
    .map((item) => item.id);
  if (idsToDelete.length === 0) return;

  await deleteFavResources(folder.id, idsToDelete);
  console.log(`从收藏夹 "${folder.title}" 删除了 ${idsToDelete.length} 个已取消收藏的项目`);
}
