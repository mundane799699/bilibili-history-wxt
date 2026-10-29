import { useEffect, useState } from "react";
import {
  ArrowLeftRight,
  CheckCircle2,
  Download,
  FileJson2,
  Info,
  LoaderCircle,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { getStorageValue, setStorageValue } from "@/utils/storage";
import {
  DEFAULT_WEBDAV_SYNC_ITEMS,
  BACKUP_LAST_EXPORT_AT,
  MANUAL_BACKUP_ITEMS,
  WebDavSyncItems,
} from "@/utils/constants";
import {
  importFavFolders,
  smartMergeHistory,
  smartMergeLikedMusic,
  smartMergeFavResources,
  importSubscribedCollections,
  smartMergeSubscribedCollectionResources,
  getDeletedHistoryIds,
  getHistoryV2Backup,
  mergeHistoryV2Backup,
} from "@/utils/db";
import { HistoryItem, HistoryV2Backup, LikedMusic } from "@/utils/types";
import { DATA_ITEMS } from "./dataItems";
import { BackupPageHeader, BackupPageLayout } from "./BackupPageHeader";

const JsonBackup = () => {
  const [manualBackupItems, setManualBackupItems] =
    useState<WebDavSyncItems>(DEFAULT_WEBDAV_SYNC_ITEMS);
  // ===== 手动导出/导入状态 =====
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    const loadItems = async () => {
      const savedManualItems = await getStorageValue<WebDavSyncItems>(
        MANUAL_BACKUP_ITEMS,
        DEFAULT_WEBDAV_SYNC_ITEMS,
      );
      setManualBackupItems({ ...DEFAULT_WEBDAV_SYNC_ITEMS, ...savedManualItems });
    };
    loadItems();
  }, []);

  // ===== 手动导出全部数据 =====

  const handleExportAll = async () => {
    const selectedItems = DATA_ITEMS.filter((item) => manualBackupItems[item.key]);
    if (selectedItems.length === 0) {
      toast.error("请至少选择一项要备份的数据");
      return;
    }

    setIsExporting(true);
    try {
      const data: Record<string, unknown> = {
        exportTime: new Date().toISOString(),
        version: "2.0",
      };

      const counts: string[] = [];
      for (const item of selectedItems) {
        const items = await item.getAll();
        data[item.key] = items;
        counts.push(`${item.label} ${items.length} 条`);
        if (item.key === "history") {
          const v2 = await getHistoryV2Backup();
          data.formatVersion = 2;
          data.historyEvents = v2.events;
          data.historyTombstones = v2.tombstones;
          counts[counts.length - 1] =
            `历史记录 ${items.length} 个内容 / ${v2.events.length} 次观看`;
        }
      }

      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `bilibili-history-backup-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      try {
        await setStorageValue(BACKUP_LAST_EXPORT_AT, Date.now());
      } catch (error) {
        console.error("记录完整数据导出时间失败:", error);
      }

      toast.success(`导出成功：${counts.join("，")}`);
    } catch (error) {
      console.error("导出数据失败:", error);
      toast.error("导出失败，请重试");
    } finally {
      setIsExporting(false);
    }
  };

  // ===== 手动导入数据 =====

  const handleImportAll = async () => {
    setIsImporting(true);
    try {
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = ".json";

      fileInput.onchange = async (event) => {
        const file = (event.target as HTMLInputElement).files?.[0];
        if (!file) {
          setIsImporting(false);
          return;
        }

        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            const content = e.target?.result as string;
            const data = JSON.parse(content);

            let totalMerged = 0;
            let totalSkipped = 0;

            // 智能识别格式：支持任意数据项组合和旧版单独数组格式
            const deletedHistoryIds = await getDeletedHistoryIds();
            if (Array.isArray(data)) {
              // 兼容旧版单独数组格式（历史记录或音乐）
              if (data.length > 0 && "view_at" in data[0]) {
                const result = await smartMergeHistory(data as HistoryItem[], deletedHistoryIds);
                totalMerged = result.merged;
                totalSkipped = result.skipped;
              } else if (data.length > 0 && "bvid" in data[0] && "added_at" in data[0]) {
                const result = await smartMergeLikedMusic(data as LikedMusic[]);
                totalMerged = result.merged;
                totalSkipped = result.skipped;
              } else {
                toast.error("无法识别的数据格式");
                setIsImporting(false);
                return;
              }
            } else {
              let recognized = false;
              const isStandaloneHistoryV2 =
                data.schemaVersion === 2 &&
                Array.isArray(data.events) &&
                Array.isArray(data.tombstones);

              if (isStandaloneHistoryV2) {
                const result = await mergeHistoryV2Backup(data as HistoryV2Backup);
                totalMerged += result.merged;
                totalSkipped += result.skipped;
                recognized = true;
              }
              if (Array.isArray(data.historyEvents)) {
                const result = await mergeHistoryV2Backup({
                  schemaVersion: 2,
                  events: data.historyEvents,
                  tombstones: Array.isArray(data.historyTombstones) ? data.historyTombstones : [],
                  updatedAt: Date.now(),
                });
                totalMerged += result.merged;
                totalSkipped += result.skipped;
                recognized = true;
              }
              if (Array.isArray(data.history)) {
                const result = await smartMergeHistory(data.history, deletedHistoryIds);
                totalMerged += result.merged;
                totalSkipped += result.skipped;
                recognized = true;
              }
              if (Array.isArray(data.likedMusic)) {
                const result = await smartMergeLikedMusic(data.likedMusic);
                totalMerged += result.merged;
                totalSkipped += result.skipped;
                recognized = true;
              }
              if (Array.isArray(data.favFolders)) {
                await importFavFolders(data.favFolders);
                totalMerged += data.favFolders.length;
                recognized = true;
              }
              if (Array.isArray(data.favResources)) {
                const result = await smartMergeFavResources(data.favResources);
                totalMerged += result.merged;
                totalSkipped += result.skipped;
                recognized = true;
              }
              if (Array.isArray(data.subscribedCollections)) {
                await importSubscribedCollections(data.subscribedCollections);
                totalMerged += data.subscribedCollections.length;
                recognized = true;
              }
              if (Array.isArray(data.subscribedCollectionResources)) {
                const result = await smartMergeSubscribedCollectionResources(
                  data.subscribedCollectionResources,
                );
                totalMerged += result.merged;
                totalSkipped += result.skipped;
                recognized = true;
              }

              if (!recognized) {
                toast.error("无法识别的文件格式");
                setIsImporting(false);
                return;
              }
            }

            toast.success(`导入完成！合并 ${totalMerged} 条，跳过 ${totalSkipped} 条（本地更新）`);
          } catch (parseError) {
            console.error("解析导入文件失败:", parseError);
            toast.error("导入失败，文件内容格式错误");
          } finally {
            setIsImporting(false);
          }
        };
        reader.readAsText(file);
      };

      // 用户取消选择文件时
      fileInput.addEventListener("cancel", () => {
        setIsImporting(false);
      });

      fileInput.click();
    } catch (error) {
      console.error("导入数据失败:", error);
      toast.error("导入失败，请重试");
      setIsImporting(false);
    }
  };

  return (
    <BackupPageLayout>
      <BackupPageHeader
        icon={FileJson2}
        title="JSON 文件备份"
        description="把数据下载为 JSON 文件离线保存或迁移到其他浏览器，也可以从已有文件恢复。"
      />

      <div className="space-y-5">
        <article
          data-tour="backup-manual"
          className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
        >
          <div className="flex items-start gap-3 border-b border-gray-100 px-5 py-4 dark:border-neutral-800">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-pink-50 text-pink-600 dark:bg-pink-500/10 dark:text-pink-400">
              <FileJson2 className="h-4.5 w-4.5" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-950 dark:text-neutral-100">JSON 文件</h3>
              <p className="mt-1 text-sm text-gray-600 dark:text-neutral-400">
                下载到设备保存，或从已有文件恢复。
              </p>
            </div>
          </div>

          <div className="p-5">
            <fieldset className="mb-5">
              <div className="mb-2 flex items-center justify-between gap-3">
                <legend className="text-sm font-medium text-gray-700 dark:text-neutral-300">
                  备份内容
                </legend>
                <button
                  type="button"
                  onClick={() => {
                    setManualBackupItems(DEFAULT_WEBDAV_SYNC_ITEMS);
                    void setStorageValue(MANUAL_BACKUP_ITEMS, DEFAULT_WEBDAV_SYNC_ITEMS);
                  }}
                  className="rounded-md px-2 py-1 text-xs font-medium text-pink-600 transition-colors hover:bg-pink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 dark:text-pink-400 dark:hover:bg-pink-500/10"
                >
                  全部选择
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {DATA_ITEMS.map((item) => (
                  <label
                    key={item.key}
                    className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                      manualBackupItems[item.key]
                        ? "border-pink-200 bg-pink-50 text-pink-800 dark:border-pink-500/30 dark:bg-pink-500/10 dark:text-pink-200"
                        : "border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={manualBackupItems[item.key]}
                      onChange={() => {
                        const next = {
                          ...manualBackupItems,
                          [item.key]: !manualBackupItems[item.key],
                        };
                        setManualBackupItems(next);
                        void setStorageValue(MANUAL_BACKUP_ITEMS, next);
                      }}
                      className="h-4 w-4 accent-pink-600 focus:ring-2 focus:ring-pink-500 focus:ring-offset-1 dark:accent-pink-500"
                    />
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={handleExportAll}
                disabled={isExporting}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-pink-600 px-4 text-sm font-medium text-white transition-colors hover:bg-pink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-pink-500 dark:hover:bg-pink-600 dark:focus-visible:ring-offset-neutral-900"
              >
                {isExporting ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {isExporting ? "正在生成文件" : "下载备份文件"}
              </button>

              <button
                type="button"
                onClick={handleImportAll}
                disabled={isImporting}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800 dark:focus-visible:ring-offset-neutral-900"
              >
                {isImporting ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {isImporting ? "正在导入" : "导入数据"}
              </button>
            </div>

            <div className="mt-4 flex items-start gap-2 rounded-lg bg-gray-50 px-3 py-2.5 text-xs leading-5 text-gray-600 dark:bg-neutral-800 dark:text-neutral-300">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              导出文件仅包含已勾选的数据；导入时会智能合并，并兼容旧版历史记录或音乐 JSON。
            </div>
          </div>
        </article>

        <aside className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
          <h3 className="text-sm font-semibold text-gray-950 dark:text-neutral-100">备份说明</h3>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-gray-600 dark:text-neutral-300">
            <li className="flex items-start gap-2.5">
              <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-pink-600 dark:text-pink-400" />
              <span>WebDAV 适合多设备同步；JSON 文件适合离线保存和迁移。</span>
            </li>
            <li className="flex items-start gap-2.5">
              <ArrowLeftRight className="mt-1 h-4 w-4 shrink-0 text-pink-600 dark:text-pink-400" />
              <span>恢复和导入默认智能合并，不会覆盖本地更新的记录。</span>
            </li>
            <li className="flex items-start gap-2.5">
              <ShieldCheck className="mt-1 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>数据只写入你选择的目录或服务器，不经过第三方中转。</span>
            </li>
          </ul>
        </aside>
      </div>
    </BackupPageLayout>
  );
};

export default JsonBackup;
