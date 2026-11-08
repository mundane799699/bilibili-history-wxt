/**
 * 收藏夹相关的 B 站接口封装。
 */
import type { FavoriteFolder } from "@/utils/types";
import {
  BiliRequestError,
  fetchCurrentMid,
  getSessdata,
  isRetryableBiliError,
  requestBiliApi,
} from "../shared/bilibiliApi";
import { randomBetween, withRetry } from "../shared/utils";

export const FAVORITE_PAGE_SIZE = 20;
const PAGE_TIMEOUT_MS = 30_000;

export interface FavoriteFolderPage {
  medias: any[];
  hasMore: boolean;
}

/** 获取当前用户创建的全部收藏夹（附带本次请求使用的 sessdata，供后续翻页复用） */
export async function fetchFavoriteFolders(): Promise<{
  sessdata: string;
  folders: FavoriteFolder[];
}> {
  const sessdata = await getSessdata();
  const mid = await fetchCurrentMid(sessdata);
  const data = await requestBiliApi<{ list?: FavoriteFolder[] | null }>(
    `https://api.bilibili.com/x/v3/fav/folder/created/list-all?up_mid=${mid}`,
    { sessdata, label: "获取收藏夹失败" },
  );

  // 没有收藏夹时 list 为 null；字段缺失或不是数组则视为格式异常
  const list = data?.list;
  if (!data || !("list" in data) || (list !== null && !Array.isArray(list))) {
    throw new BiliRequestError("收藏夹数据格式异常", "data");
  }

  const folders = (list ?? []).map((folder, index) => ({
    ...folder,
    id: Number(folder.id),
    index,
  }));
  return { sessdata, folders };
}

/** 获取收藏夹的某一页资源；网络错误和 5xx 会带抖动重试 2 次 */
export async function fetchFavoriteFolderPage(
  folder: FavoriteFolder,
  page: number,
  sessdata: string,
): Promise<FavoriteFolderPage> {
  const label = `获取收藏夹「${folder.title}」第 ${page} 页失败`;
  const url = `https://api.bilibili.com/x/v3/fav/resource/list?media_id=${folder.id}&pn=${page}&ps=${FAVORITE_PAGE_SIZE}`;

  const data = await withRetry(
    () => requestBiliApi(url, { sessdata, label, timeoutMs: PAGE_TIMEOUT_MS }),
    {
      retryDelaysMs: [2000, 5000].map((ms) => ms + randomBetween(0, 500)),
      shouldRetry: isRetryableBiliError,
      onRetry: (_, retryCount, delayMs) =>
        console.warn(`${label}，${delayMs}ms 后重试 (${retryCount}/2)`),
    },
  );

  if (!data || (data.medias != null && !Array.isArray(data.medias))) {
    throw new BiliRequestError(`${label}：收藏夹资源数据格式异常`, "data");
  }
  return { medias: data.medias ?? [], hasMore: Boolean(data.has_more) };
}
