/**
 * 观看历史：从 B 站拉取历史记录写入本地，以及处理"B 站网页端删除 → 同步删除"。
 */
import {
  HAS_FULL_SYNC,
  HISTORY_LAST_SYNC,
  HISTORY_SYNC_WATERMARK_VIEW_AT,
  IS_SYNC_DELETE_FROM_BILIBILI,
  SYNC_INTERVAL,
} from "@/utils/constants";
import { deleteHistoryContent, upsertHistorySnapshots } from "@/utils/db";
import { getStorageValue, setStorageValue } from "@/utils/storage";
import type {
  HistoryItem,
  HistorySyncProgress,
  HistorySyncProgressMessage,
  SyncHistoryRequest,
  SyncHistoryResponse,
} from "@/utils/types";
import { getSessdata, requestBiliApi } from "./shared/bilibiliApi";
import { MessageHandlerMap, syncModeLabel } from "./shared/types";
import { getMsUntilDue, sleep } from "./shared/utils";

const PAGE_SIZE = 30;
/** 每页之间的间隔，避免请求过于频繁 */
const PAGE_DELAY_MS = 1000;
/**
 * 增量同步的兜底翻页上限，防止水位异常时无限翻页。
 * 超出后报错且不推进水位，下次仍会从旧水位重新扫描。
 */
const MAX_INCREMENTAL_PAGES = 500;

const VALID_BUSINESSES: HistoryItem["business"][] = [
  "archive",
  "pgc",
  "article",
  "article-list",
  "live",
  "cheese",
];

interface HistoryCursor {
  max: number;
  view_at: number;
  is_end?: boolean;
}

interface HistoryCursorPage {
  cursor: HistoryCursor;
  list: any[] | null;
}

/** B 站接口返回的条目 → 本地 HistoryItem */
const toHistorySnapshot = (item: any): HistoryItem => ({
  id: item.history.oid,
  business: item.history.business,
  bvid: item.history.bvid,
  cid: item.history.cid,
  title: item.title,
  tag_name: item.tag_name,
  cover: item.cover || item.covers?.[0],
  view_at: item.view_at,
  uri: item.uri,
  author_name: item.author_name || "",
  author_mid: Number(item.author_mid) || 0,
  progress: item.progress,
  duration: item.duration,
  is_fav: item.is_fav === 1,
  uploaded: false,
});

const getValidViewTimes = (items: HistoryItem[]): number[] =>
  items
    .map((item) => Number(item.view_at))
    .filter((value) => Number.isSafeInteger(value) && value > 0);

/**
 * 按游标分页拉取历史记录。
 * - 全量：一直翻到服务端 is_end。
 * - 增量：翻到某页最早的记录早于上次的水位（view_at）即停止，页之间有重叠以防漏记。
 *
 * 每拉完一页把进度广播给扩展页面（不落 storage），同步弹窗据此实时展示。
 */
export async function syncHistory(
  isFullSync: boolean,
): Promise<Pick<HistorySyncProgress, "fetchedItems" | "newItems">> {
  const sessdata = await getSessdata();
  const previousWatermark = await getStorageValue<number>(HISTORY_SYNC_WATERMARK_VIEW_AT, 0);
  let newestViewAt = previousWatermark;
  let cursor: HistoryCursor = { max: 0, view_at: 0 };
  console.log(`${syncModeLabel(isFullSync)}同步开始`);

  const progress: HistorySyncProgress = {
    status: "syncing",
    mode: isFullSync ? "full" : "incremental",
    pages: 0,
    fetchedItems: 0,
    newItems: 0,
    newestViewAt: 0,
    oldestViewAt: 0,
    targetViewAt: isFullSync ? 0 : previousWatermark,
    startedAt: Date.now(),
    updatedAt: Date.now(),
  };
  const reportProgress = async (patch: Partial<HistorySyncProgress> = {}) => {
    Object.assign(progress, patch, { updatedAt: Date.now() });
    const message: HistorySyncProgressMessage = {
      action: "historySyncProgress",
      progress: { ...progress },
    };
    // 没有打开的扩展页面时 sendMessage 会因无人接收而 reject，进度只是展示用，忽略即可
    await browser.runtime.sendMessage(message).catch(() => {});
  };
  await reportProgress();

  try {
    for (let page = 1; ; page++) {
      const data = await requestBiliApi<HistoryCursorPage>(
        `https://api.bilibili.com/x/web-interface/history/cursor?max=${cursor.max}&view_at=${cursor.view_at}&type=all&ps=${PAGE_SIZE}`,
        { sessdata, label: "获取历史记录失败" },
      );
      const list = data.list ?? [];
      // 只有 is_end 或空列表才代表真正翻完；仅看 list.length 会在 cursor 归零后从头再来，造成死循环
      if (list.length === 0) break;
      cursor = data.cursor;

      const snapshots = list.map(toHistorySnapshot);
      const { newEvents } = await upsertHistorySnapshots(snapshots, "bilibili");

      const viewTimes = getValidViewTimes(snapshots);
      newestViewAt = Math.max(newestViewAt, ...viewTimes);

      await reportProgress({
        pages: page,
        fetchedItems: progress.fetchedItems + snapshots.length,
        newItems: progress.newItems + newEvents,
        newestViewAt: Math.max(progress.newestViewAt, ...viewTimes),
        oldestViewAt: viewTimes.length > 0 ? Math.min(...viewTimes) : progress.oldestViewAt,
      });

      const reachedWatermark =
        !isFullSync &&
        previousWatermark > 0 &&
        viewTimes.length > 0 &&
        Math.min(...viewTimes) < previousWatermark;
      if (cursor.is_end || reachedWatermark) break;

      if (!isFullSync && page >= MAX_INCREMENTAL_PAGES) {
        throw new Error(`增量同步已达到 ${MAX_INCREMENTAL_PAGES} 页保护上限，本轮未推进同步水位`);
      }
      await sleep(PAGE_DELAY_MS);
    }
  } catch (error) {
    await reportProgress({ status: "error" });
    throw error;
  }
  console.log(`${syncModeLabel(isFullSync)}同步结束`);

  if (isFullSync) await setStorageValue(HAS_FULL_SYNC, true);
  if (newestViewAt > 0) await setStorageValue(HISTORY_SYNC_WATERMARK_VIEW_AT, newestViewAt);
  await setStorageValue(HISTORY_LAST_SYNC, Date.now());
  await reportProgress({ status: "success" });

  return { fetchedItems: progress.fetchedItems, newItems: progress.newItems };
}

/** 定时任务：距上次成功同步超过用户设置的间隔才执行增量同步 */
export async function runScheduledHistorySync(): Promise<void> {
  const intervalMinutes = await getStorageValue(SYNC_INTERVAL, 30);
  const msUntilDue = await getMsUntilDue(HISTORY_LAST_SYNC, intervalMinutes);
  if (msUntilDue > 0) {
    console.log(`还需${Math.ceil(msUntilDue / 60_000)}分钟进行历史记录同步，暂时跳过`);
    return;
  }
  await syncHistory(false);
}

/** B 站网页端删除了一条历史（由 content script 转发），按设置决定是否同步删除本地记录 */
async function handleDeleteHistoryItem(message: { id?: unknown; business?: unknown }) {
  const id = Number(message?.id);
  const business = message?.business as HistoryItem["business"];
  if (!Number.isSafeInteger(id) || id <= 0 || !VALID_BUSINESSES.includes(business)) {
    return { success: false, error: "历史记录信息不完整" };
  }

  const syncDeleteEnabled = await getStorageValue(IS_SYNC_DELETE_FROM_BILIBILI, true);
  if (!syncDeleteEnabled) return { success: true, message: "同步删除未开启" };

  await deleteHistoryContent(business, id, "bilibili-page");
  return { success: true, message: "历史记录删除成功" };
}

export const historyMessageHandlers: MessageHandlerMap = {
  syncHistory: async ({ isFullSync }: SyncHistoryRequest): Promise<SyncHistoryResponse> => {
    const { fetchedItems, newItems } = await syncHistory(Boolean(isFullSync));
    const summary =
      newItems > 0 ? `，共拉取 ${fetchedItems} 条，新增 ${newItems} 条` : "，没有新的观看记录";
    return { success: true, message: `${syncModeLabel(Boolean(isFullSync))}同步成功${summary}` };
  },

  deleteHistoryItem: handleDeleteHistoryItem,

  getCookies: async () => {
    const cookies = await browser.cookies.getAll({ domain: "bilibili.com" });
    return { success: true, cookies };
  },
};
