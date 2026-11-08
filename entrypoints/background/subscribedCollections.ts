/**
 * 订阅合集：同步合集列表与合集内的视频。
 */
import { replaceSubscribedCollectionResources, replaceSubscribedCollections } from "@/utils/db";
import type { SubscribedCollection, SubscribedCollectionResource } from "@/utils/types";
import {
  BiliRequestError,
  fetchCurrentMid,
  getSessdata,
  requestBiliApi,
} from "./shared/bilibiliApi";
import type { MessageHandlerMap } from "./shared/types";

const COLLECTION_PAGE_SIZE = 50;
const RESOURCE_PAGE_SIZE = 30;

const toCollection = (item: any, index: number): SubscribedCollection => ({
  id: item.id,
  mid: item.mid,
  title: item.title || "未命名合集",
  cover: item.cover || "",
  intro: item.intro || "",
  ctime: item.ctime || 0,
  mtime: item.mtime || 0,
  media_count: item.media_count || 0,
  upper: item.upper || { mid: item.mid, name: "未知 UP 主", face: "" },
  index,
});

const toCollectionResource = (
  collectionId: number,
  media: any,
  index: number,
): SubscribedCollectionResource => ({
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
  index,
});

/** 拉取全部订阅合集，整体替换本地数据 */
async function syncSubscribedCollections(): Promise<void> {
  const sessdata = await getSessdata();
  const mid = await fetchCurrentMid(sessdata);
  const collections: SubscribedCollection[] = [];

  for (let page = 1; ; page++) {
    const data = await requestBiliApi<{ list?: any[] | null; count?: number }>(
      `https://api.bilibili.com/x/v3/fav/folder/collected/list?pn=${page}&ps=${COLLECTION_PAGE_SIZE}&up_mid=${mid}&platform=web&web_location=333.1387`,
      { sessdata, label: "获取订阅合集失败" },
    );
    if (!data || !("list" in data) || (data.list !== null && !Array.isArray(data.list))) {
      throw new BiliRequestError("订阅合集数据格式异常", "data");
    }
    // 总数只能从响应里取得，所以第一页总会请求
    const total = Number(data.count);
    if (!Number.isSafeInteger(total) || total < 0) {
      throw new BiliRequestError("订阅合集数量格式异常", "data");
    }

    const list = data.list ?? [];
    collections.push(...list.map((item, i) => toCollection(item, collections.length + i)));

    // 已取满，或遇到空页（接口异常保护，防止死循环）
    if (collections.length >= total || list.length === 0) break;
  }

  await replaceSubscribedCollections(collections);
}

/** 拉取某个合集里的全部视频，整体替换本地数据 */
async function syncSubscribedCollectionResources(collectionId: number): Promise<void> {
  const sessdata = await getSessdata();
  const resources: SubscribedCollectionResource[] = [];

  for (let page = 1; ; page++) {
    const data = await requestBiliApi<{ medias?: any[] | null; has_more?: boolean }>(
      `https://api.bilibili.com/x/space/fav/season/list?season_id=${collectionId}&pn=${page}&ps=${RESOURCE_PAGE_SIZE}`,
      { sessdata, label: "获取合集内容失败" },
    );
    const medias = data?.medias ?? [];
    resources.push(
      ...medias.map((media, i) => toCollectionResource(collectionId, media, resources.length + i)),
    );

    // 没有更多，或遇到空页（接口异常保护，防止死循环）
    if (!data?.has_more || medias.length === 0) break;
  }

  await replaceSubscribedCollectionResources(collectionId, resources);
}

export const subscribedCollectionMessageHandlers: MessageHandlerMap = {
  syncSubscribedCollections: async () => {
    await syncSubscribedCollections();
    return { success: true, message: "订阅合集同步成功" };
  },

  syncSubscribedCollectionResources: async (message: { collectionId?: unknown }) => {
    const collectionId = Number(message.collectionId);
    if (!Number.isFinite(collectionId)) return { success: false, error: "合集信息不完整" };

    await syncSubscribedCollectionResources(collectionId);
    return { success: true, message: "合集内容同步成功" };
  },
};
