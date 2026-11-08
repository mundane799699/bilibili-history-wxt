/**
 * WebDAV 自动双向同步：先拉取远端并合并到本地，再把本地推送到远端，避免单向覆盖丢数据。
 */
import {
  DEFAULT_WEBDAV_SYNC_ITEMS,
  WEBDAV_AUTO_SYNC_ENABLED,
  WEBDAV_AUTO_SYNC_INTERVAL,
  WEBDAV_LAST_SYNC,
  WEBDAV_SYNC_ITEMS,
  WebDavSyncItems,
  WebDavSyncKey,
} from "@/utils/constants";
import {
  getAllFavFolders,
  getAllFavResources,
  getAllHistory,
  getAllLikedMusic,
  getAllSubscribedCollectionResources,
  getAllSubscribedCollections,
  getDeletedHistoryIds,
  getHistoryV2Backup,
  importFavFolders,
  importSubscribedCollections,
  mergeHistoryV2Backup,
  smartMergeFavResources,
  smartMergeHistory,
  smartMergeLikedMusic,
  smartMergeSubscribedCollectionResources,
} from "@/utils/db";
import { getStorageValue, setStorageValue } from "@/utils/storage";
import { ensureDirectory, loadWebDavConfig, withWebDavOperationLock } from "@/utils/webdav";
import { createWebDavTransferSession, digestArray, digestHistoryV2 } from "@/utils/webdavTransfer";
import { getMsUntilDue, singleFlight } from "./shared/utils";

type TransferSession = Awaited<ReturnType<typeof createWebDavTransferSession>>;

/** 一类可同步的数据：如何从远端拉取合并、如何推送到远端 */
interface WebDavSyncEntry {
  key: WebDavSyncKey;
  label: string;
  pull: (transfer: TransferSession) => Promise<void>;
  /** 推送并返回用于日志的摘要 */
  push: (transfer: TransferSession) => Promise<string>;
}

/** 普通数组型数据：一个文件对应一个 store */
const arrayEntry = (
  key: WebDavSyncKey,
  label: string,
  file: string,
  getAll: () => Promise<unknown[]>,
  merge: (items: any[]) => Promise<unknown>,
): WebDavSyncEntry => ({
  key,
  label,
  pull: (transfer) =>
    transfer.pull(file, {
      digest: digestArray,
      getLocalCount: async () => (await getAll()).length,
      merge,
    }),
  push: async (transfer) => {
    const data = await getAll();
    await transfer.push(file, data, { digest: digestArray });
    return `${label} ${data.length}`;
  },
});

/**
 * 历史记录比较特殊：
 * - 拉取时同时读旧版 history.json（合并历史遗留数据，跳过已删除的记录）和新版 history-v2.json；
 * - 推送时只写 history-v2.json，旧版文件不再写入。
 */
const historyEntry: WebDavSyncEntry = {
  key: "history",
  label: "历史",
  pull: async (transfer) => {
    const deletedHistoryIds = await getDeletedHistoryIds();
    await transfer.pull("history.json", {
      digest: digestArray,
      getLocalCount: async () => (await getAllHistory()).length,
      merge: (data) => smartMergeHistory(data, deletedHistoryIds),
    });
    await transfer.pull("history-v2.json", {
      digest: digestHistoryV2,
      getLocalCount: async () => (await getHistoryV2Backup()).events.length,
      merge: mergeHistoryV2Backup,
    });
  },
  push: async (transfer) => {
    const [contents, v2] = await Promise.all([getAllHistory(), getHistoryV2Backup()]);
    await transfer.push("history-v2.json", v2, { digest: digestHistoryV2 });
    return `历史 ${contents.length} 个内容 / ${v2.events.length} 次观看`;
  },
};

// 文件名与合并策略需与 WebDavSync 页面保持一致
const SYNC_ENTRIES: WebDavSyncEntry[] = [
  historyEntry,
  arrayEntry("likedMusic", "音乐", "likedMusic.json", getAllLikedMusic, smartMergeLikedMusic),
  arrayEntry("favFolders", "收藏夹", "favFolders.json", getAllFavFolders, importFavFolders),
  arrayEntry(
    "favResources",
    "收藏",
    "favResources.json",
    getAllFavResources,
    smartMergeFavResources,
  ),
  arrayEntry(
    "subscribedCollections",
    "订阅合集",
    "subscribedCollections.json",
    getAllSubscribedCollections,
    importSubscribedCollections,
  ),
  arrayEntry(
    "subscribedCollectionResources",
    "合集视频",
    "subscribedCollectionResources.json",
    getAllSubscribedCollectionResources,
    smartMergeSubscribedCollectionResources,
  ),
];

/** 拉取 → 合并 → 推送（仅同步用户勾选的数据项） */
async function autoSyncWebDav(): Promise<void> {
  const config = await loadWebDavConfig();
  if (!config?.serverUrl) {
    console.log("WebDAV 未配置，跳过自动同步");
    return;
  }

  const enabledKeys = await getStorageValue<WebDavSyncItems>(
    WEBDAV_SYNC_ITEMS,
    DEFAULT_WEBDAV_SYNC_ITEMS,
  );
  const entries = SYNC_ENTRIES.filter((entry) => enabledKeys[entry.key]);
  if (entries.length === 0) {
    console.log("WebDAV 同步数据项均未勾选，跳过自动同步");
    return;
  }

  console.log(`开始 WebDAV 双向同步（${entries.map((entry) => entry.label).join("、")}）...`);
  if (!(await ensureDirectory(config))) throw new Error("WebDAV 备份目录创建失败");

  const transfer = await createWebDavTransferSession(config);
  const summary: string[] = [];
  try {
    console.log("[WebDAV 同步] 步骤 1/2：拉取并合并远端数据...");
    for (const entry of entries) await entry.pull(transfer);

    console.log("[WebDAV 同步] 步骤 2/2：推送本地数据到远端...");
    for (const entry of entries) summary.push(await entry.push(transfer));
  } finally {
    // 中途失败也要保存传输状态，已完成的部分仍然有效
    await transfer.finish();
  }

  const { downloaded, skippedDownloads, uploaded, skippedUploads } = transfer.stats;
  console.log(
    `[WebDAV 同步] 下载 ${downloaded} 个文件（跳过未变化的 ${skippedDownloads} 个），上传 ${uploaded} 个文件（跳过未变化的 ${skippedUploads} 个）`,
  );

  await setStorageValue(WEBDAV_LAST_SYNC, Date.now());
  console.log(`WebDAV 双向同步完成：${summary.join("，")}`);
}

/** 同一时刻只跑一次；withWebDavOperationLock 还会与前端页面的手动 WebDAV 操作互斥 */
const runWebDavSyncOnce = singleFlight(() => withWebDavOperationLock(autoSyncWebDav));

/** 定时任务：开启了自动同步且距上次同步超过设定间隔才执行 */
export async function runScheduledWebDavSync(): Promise<void> {
  const enabled = await getStorageValue(WEBDAV_AUTO_SYNC_ENABLED, false);
  if (!enabled) return;

  const intervalMinutes = await getStorageValue(WEBDAV_AUTO_SYNC_INTERVAL, 30);
  const msUntilDue = await getMsUntilDue(WEBDAV_LAST_SYNC, intervalMinutes);
  if (msUntilDue > 0) {
    console.log(`WebDAV 自动同步：还需 ${Math.ceil(msUntilDue / 60_000)} 分钟，暂时跳过`);
    return;
  }

  await runWebDavSyncOnce();
}
