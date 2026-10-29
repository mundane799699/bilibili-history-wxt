import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  CloudDownload,
  CloudUpload,
  ExternalLink,
  Eye,
  EyeOff,
  Info,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  Save,
  Server,
  X,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { getStorageValue, setStorageValue } from "@/utils/storage";
import {
  WEBDAV_CONFIG,
  WEBDAV_LAST_SYNC,
  WEBDAV_AUTO_SYNC_ENABLED,
  WEBDAV_AUTO_SYNC_INTERVAL,
  WEBDAV_SYNC_ITEMS,
  DEFAULT_WEBDAV_SYNC_ITEMS,
  WebDavSyncItems,
  WebDavSyncKey,
} from "@/utils/constants";
import {
  WebDavConfig,
  testConnection,
  ensureDirectory,
  uploadFile,
  downloadFile,
  withWebDavOperationLock,
  loadWebDavConfig,
  sealWebDavConfig,
} from "@/utils/webdav";
import {
  getAllHistory,
  smartMergeHistory,
  getDeletedHistoryIds,
  getHistoryV2Backup,
  mergeHistoryV2Backup,
} from "@/utils/db";
import { Select } from "@/components/Select";
import { DATA_ITEMS } from "./dataItems";
import { BackupPageHeader, BackupPageLayout } from "./BackupPageHeader";

const HISTORY_V2_FILE = "history-v2.json";

/** 自动同步间隔，单位分钟 */
const AUTO_SYNC_INTERVAL_OPTIONS = [
  { value: "15", label: "每 15 分钟" },
  { value: "30", label: "每 30 分钟" },
  { value: "60", label: "每 1 小时" },
  { value: "120", label: "每 2 小时" },
  { value: "360", label: "每 6 小时" },
  { value: "720", label: "每 12 小时" },
  { value: "1440", label: "每 24 小时" },
  { value: "4320", label: "每 3 天" },
  { value: "10080", label: "每 7 天" },
  { value: "20160", label: "每 14 天" },
];

const mergeRemoteHistoryFiles = async (
  config: WebDavConfig,
): Promise<{ merged: number; skipped: number }> => {
  let merged = 0;
  let skipped = 0;
  const deletedHistoryIds = await getDeletedHistoryIds();
  const legacyRemote = await downloadFile(config, "history.json");
  if (legacyRemote) {
    const result = await smartMergeHistory(JSON.parse(legacyRemote), deletedHistoryIds);
    merged += result.merged;
    skipped += result.skipped;
  }

  const v2Remote = await downloadFile(config, HISTORY_V2_FILE);
  if (v2Remote) {
    const result = await mergeHistoryV2Backup(JSON.parse(v2Remote));
    merged += result.merged;
    skipped += result.skipped;
  }
  return { merged, skipped };
};

const uploadHistoryFiles = async (
  config: WebDavConfig,
): Promise<{ contentCount: number; eventCount: number }> => {
  const history = await getAllHistory();
  const v2 = await getHistoryV2Backup();
  // 只上传 v2 文件；旧版 history.json 不再写入，恢复时仍会读取以合并历史遗留数据
  if (!(await uploadFile(config, HISTORY_V2_FILE, JSON.stringify(v2)))) {
    throw new Error("上传历史记录失败");
  }
  return { contentCount: history.length, eventCount: v2.events.length };
};

let webDavOperation: Promise<void> | null = null;

const runWebDavOperation = async (task: () => Promise<void>): Promise<void> => {
  if (webDavOperation) throw new Error("WebDAV 操作正在进行中，请稍后再试");
  const promise = task();
  webDavOperation = promise;
  try {
    await promise;
  } finally {
    if (webDavOperation === promise) webDavOperation = null;
  }
};

/** 备份/恢复进度信息 */
interface SyncProgress {
  current: number;
  total: number;
  message: string;
}

const defaultConfig: WebDavConfig = {
  serverUrl: "",
  username: "",
  password: "",
  basePath: "/bilibili-history/",
};

const WebDavBackup = () => {
  // ===== WebDAV 配置状态 =====
  const [config, setConfig] = useState<WebDavConfig>(defaultConfig);
  const [showPassword, setShowPassword] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSync, setLastSync] = useState<number | null>(null);

  // ===== 同步操作状态 =====
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);

  // ===== 备份模式对话框 =====
  const [showBackupDialog, setShowBackupDialog] = useState(false);
  const backupDialogRef = useRef<HTMLDivElement>(null);
  const closeDialogButtonRef = useRef<HTMLButtonElement>(null);

  // ===== 同步数据项勾选（持久化，后台自动同步共用） =====
  const [selectedKeys, setSelectedKeys] = useState<WebDavSyncItems>(DEFAULT_WEBDAV_SYNC_ITEMS);
  const [manualBackupItems, setManualBackupItems] =
    useState<WebDavSyncItems>(DEFAULT_WEBDAV_SYNC_ITEMS);

  const toggleSelected = (key: WebDavSyncKey) =>
    setSelectedKeys((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      setStorageValue(WEBDAV_SYNC_ITEMS, next);
      return next;
    });

  const getSelectedItems = () => {
    const items = DATA_ITEMS.filter((d) => selectedKeys[d.key]);
    if (items.length === 0) toast.error("请至少勾选一项要同步的数据");
    return items;
  };

  // ===== 自动同步状态 =====
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false);
  const [autoSyncInterval, setAutoSyncInterval] = useState(30);

  // 加载已保存的配置
  useEffect(() => {
    const loadConfig = async () => {
      const saved = await loadWebDavConfig();
      if (saved) setConfig(saved);
      const syncTime = await getStorageValue<number | null>(WEBDAV_LAST_SYNC, null);
      if (syncTime) setLastSync(syncTime);

      const enabled = await getStorageValue<boolean>(WEBDAV_AUTO_SYNC_ENABLED, false);
      setAutoSyncEnabled(enabled);
      const interval = await getStorageValue<number>(WEBDAV_AUTO_SYNC_INTERVAL, 30);
      setAutoSyncInterval(interval);

      const syncItems = await getStorageValue<WebDavSyncItems>(
        WEBDAV_SYNC_ITEMS,
        DEFAULT_WEBDAV_SYNC_ITEMS,
      );
      // Merge over defaults so newly added keys get a value
      setSelectedKeys({ ...DEFAULT_WEBDAV_SYNC_ITEMS, ...syncItems });
    };
    loadConfig();
  }, []);

  // ===== WebDAV 配置操作 =====

  const handleTestConnection = async () => {
    if (!config.serverUrl) {
      toast.error("请先填写服务器地址");
      return;
    }
    setIsTesting(true);
    try {
      const ok = await testConnection(config);
      if (ok) {
        toast.success("连接成功！");
      } else {
        toast.error("连接失败，请检查服务器地址和凭证");
      }
    } catch {
      toast.error("连接测试出错");
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveConfig = async () => {
    if (!config.serverUrl) {
      toast.error("请先填写服务器地址");
      return;
    }
    setIsSaving(true);
    try {
      await setStorageValue(WEBDAV_CONFIG, await sealWebDavConfig(config));
      toast.success("配置已保存");
    } catch {
      toast.error("保存配置失败");
    } finally {
      setIsSaving(false);
    }
  };

  // ===== WebDAV 备份 =====

  const handleBackup = async () => {
    if (!config.serverUrl) {
      toast.error("请先配置 WebDAV 服务器");
      return;
    }

    const items = getSelectedItems();
    if (items.length === 0) return;

    try {
      await runWebDavOperation(() =>
        withWebDavOperationLock(async () => {
          setIsBackingUp(true);
          setSyncProgress({ current: 0, total: items.length, message: "准备备份数据..." });
          // 确保远程目录存在
          if (!(await ensureDirectory(config))) throw new Error("WebDAV 备份目录创建失败");

          const summary: string[] = [];
          for (const [i, item] of items.entries()) {
            setSyncProgress({
              current: i,
              total: items.length,
              message: `正在备份${item.label}...`,
            });
            if (item.key === "history") {
              const counts = await uploadHistoryFiles(config);
              summary.push(`历史记录 ${counts.contentCount} 个内容 / ${counts.eventCount} 次观看`);
            } else {
              const data = await item.getAll();
              const ok = await uploadFile(config, item.file, JSON.stringify(data));
              if (!ok) throw new Error(`上传${item.label}失败`);
              summary.push(`${item.label} ${data.length} 条`);
            }
          }

          // 记录同步时间（数值时间戳）
          const now = Date.now();
          await setStorageValue(WEBDAV_LAST_SYNC, now);
          setLastSync(now);

          setSyncProgress({ current: items.length, total: items.length, message: "备份完成！" });
          toast.success(`备份完成！${summary.join("，")}`);
        }),
      );
    } catch (error: any) {
      console.error("WebDAV 备份失败:", error);
      toast.error(error.message || "备份失败，请检查配置");
    } finally {
      setIsBackingUp(false);
      setTimeout(() => setSyncProgress(null), 3000);
    }
  };

  // ===== WebDAV 双向同步（拉取+合并+推送） =====

  const handleBidirectionalSync = async () => {
    if (!config.serverUrl) {
      toast.error("请先配置 WebDAV 服务器");
      return;
    }

    const items = getSelectedItems();
    if (items.length === 0) return;
    const total = items.length * 2;

    try {
      await runWebDavOperation(() =>
        withWebDavOperationLock(async () => {
          setIsBackingUp(true);
          setSyncProgress({ current: 0, total, message: "准备双向同步..." });
          if (!(await ensureDirectory(config))) throw new Error("WebDAV 备份目录创建失败");

          // 第一步：拉取远端数据并合并
          let totalMerged = 0;
          let totalSkipped = 0;
          for (const [i, item] of items.entries()) {
            setSyncProgress({ current: i, total, message: `步骤 1/2：拉取${item.label}...` });
            if (item.key === "history") {
              const result = await mergeRemoteHistoryFiles(config);
              totalMerged += result.merged;
              totalSkipped += result.skipped;
            } else {
              const remote = await downloadFile(config, item.file);
              if (remote) {
                const result = await item.merge(JSON.parse(remote));
                totalMerged += result.merged;
                totalSkipped += result.skipped;
              }
            }
          }

          // 第二步：推送合并后的最新数据
          let totalPushed = 0;
          for (const [i, item] of items.entries()) {
            setSyncProgress({
              current: items.length + i,
              total,
              message: `步骤 2/2：推送${item.label}...`,
            });
            if (item.key === "history") {
              const counts = await uploadHistoryFiles(config);
              totalPushed += counts.eventCount;
            } else {
              const data = await item.getAll();
              const ok = await uploadFile(config, item.file, JSON.stringify(data));
              if (!ok) throw new Error(`上传${item.label}失败`);
              totalPushed += data.length;
            }
          }

          const now = Date.now();
          await setStorageValue(WEBDAV_LAST_SYNC, now);
          setLastSync(now);

          setSyncProgress({ current: total, total, message: "双向同步完成！" });
          toast.success(
            `双向同步完成！合并 ${totalMerged} 条，跳过 ${totalSkipped} 条，推送 ${totalPushed} 条`,
          );
        }),
      );
    } catch (error: any) {
      console.error("WebDAV 双向同步失败:", error);
      toast.error(error.message || "双向同步失败，请检查配置");
    } finally {
      setIsBackingUp(false);
      setTimeout(() => setSyncProgress(null), 3000);
    }
  };

  // ===== WebDAV 恢复 =====

  const handleRestore = async () => {
    if (!config.serverUrl) {
      toast.error("请先配置 WebDAV 服务器");
      return;
    }

    const items = getSelectedItems();
    if (items.length === 0) return;

    try {
      await runWebDavOperation(() =>
        withWebDavOperationLock(async () => {
          setIsRestoring(true);
          setSyncProgress({
            current: 0,
            total: items.length,
            message: "正在从 WebDAV 下载数据...",
          });
          let totalMerged = 0;
          let totalSkipped = 0;
          for (const [i, item] of items.entries()) {
            setSyncProgress({
              current: i,
              total: items.length,
              message: `正在恢复${item.label}...`,
            });
            if (item.key === "history") {
              const result = await mergeRemoteHistoryFiles(config);
              totalMerged += result.merged;
              totalSkipped += result.skipped;
            } else {
              const remote = await downloadFile(config, item.file);
              if (remote) {
                const result = await item.merge(JSON.parse(remote));
                totalMerged += result.merged;
                totalSkipped += result.skipped;
              }
            }
          }

          // 记录同步时间
          const now = Date.now();
          await setStorageValue(WEBDAV_LAST_SYNC, now);
          setLastSync(now);

          setSyncProgress({ current: items.length, total: items.length, message: "恢复完成！" });
          toast.success(`恢复完成！合并 ${totalMerged} 条，跳过 ${totalSkipped} 条（本地更新）`);
        }),
      );
    } catch (error: any) {
      console.error("WebDAV 恢复失败:", error);
      toast.error(error.message || "恢复失败，请检查配置");
    } finally {
      setIsRestoring(false);
      setTimeout(() => setSyncProgress(null), 3000);
    }
  };

  // ===== 进度条百分比 =====
  const progressPercent =
    syncProgress && syncProgress.total > 0
      ? Math.round((syncProgress.current / syncProgress.total) * 100)
      : 0;

  // ===== 自动同步操作 =====

  const handleAutoSyncToggle = async (enabled: boolean) => {
    setAutoSyncEnabled(enabled);
    await setStorageValue(WEBDAV_AUTO_SYNC_ENABLED, enabled);
    if (enabled) {
      toast.success(`已开启自动同步，每 ${autoSyncInterval} 分钟备份一次`);
    } else {
      toast.success("已关闭自动同步");
    }
  };

  const handleIntervalChange = async (interval: number) => {
    setAutoSyncInterval(interval);
    await setStorageValue(WEBDAV_AUTO_SYNC_INTERVAL, interval);
  };

  useEffect(() => {
    if (!showBackupDialog) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeDialogButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setShowBackupDialog(false);
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = backupDialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [showBackupDialog]);

  return (
    <BackupPageLayout>
      <BackupPageHeader
        icon={Server}
        title="WebDAV 备份"
        description="把数据同步到你自己的 WebDAV 服务（坚果云、Nextcloud、群晖 NAS 等），适合多设备共享。"
      />

      <article
        data-tour="backup-webdav"
        className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4 dark:border-neutral-800">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-pink-50 text-pink-600 dark:bg-pink-500/10 dark:text-pink-400">
              <Server className="h-[18px] w-[18px]" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-950 dark:text-neutral-100">WebDAV 同步</h3>
              <p className="mt-1 text-sm text-gray-600 dark:text-neutral-400">
                {lastSync ? `上次同步：${new Date(lastSync).toLocaleString()}` : "尚未同步过"}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium text-pink-600 transition-colors hover:bg-pink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2 dark:text-pink-400 dark:hover:bg-pink-500/10 dark:focus-visible:ring-offset-neutral-900"
            onClick={() => {
              const url = browser.runtime.getURL("/webdav-tutorial.html");
              browser.tabs.create({ url });
            }}
          >
            配置教程
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="space-y-6 p-5">
          <section className="space-y-4 rounded-xl bg-gray-50 p-4 dark:bg-neutral-800/60">
            <div>
              <label
                htmlFor="webdav-server-url"
                className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-neutral-300"
              >
                服务器地址
              </label>
              <input
                id="webdav-server-url"
                type="url"
                autoComplete="url"
                placeholder="例如：https://dav.jianguoyun.com/dav"
                value={config.serverUrl}
                onChange={(e) => setConfig({ ...config, serverUrl: e.target.value })}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-500 focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100 dark:placeholder:text-neutral-500"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="webdav-username"
                  className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-neutral-300"
                >
                  用户名
                </label>
                <input
                  id="webdav-username"
                  type="text"
                  autoComplete="username"
                  placeholder="WebDAV 用户名"
                  value={config.username}
                  onChange={(e) => setConfig({ ...config, username: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-500 focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100 dark:placeholder:text-neutral-500"
                />
              </div>
              <div>
                <label
                  htmlFor="webdav-password"
                  className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-neutral-300"
                >
                  密码
                </label>
                <div className="relative">
                  <input
                    id="webdav-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="密码 / 应用密码"
                    value={config.password}
                    onChange={(e) => setConfig({ ...config, password: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 pr-11 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-500 focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100 dark:placeholder:text-neutral-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                    aria-label={showPassword ? "隐藏密码" : "显示密码"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>

            <div>
              <label
                htmlFor="webdav-base-path"
                className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-neutral-300"
              >
                远程路径
              </label>
              <input
                id="webdav-base-path"
                type="text"
                placeholder="/bilibili-history/"
                value={config.basePath}
                onChange={(e) => setConfig({ ...config, basePath: e.target.value })}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-500 focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100 dark:placeholder:text-neutral-500"
              />
            </div>

            <p className="flex items-start gap-2 text-xs leading-5 text-gray-600 dark:text-neutral-400">
              <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-500 dark:text-neutral-500" />
              凭证仅保存在本地浏览器存储中，密码会加密，不会发送给第三方。
            </p>

            <div className="flex flex-wrap gap-3 pt-1">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isTesting || !config.serverUrl}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800 dark:focus-visible:ring-offset-neutral-900"
              >
                {isTesting ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                {isTesting ? "正在测试" : "测试连接"}
              </button>
              <button
                type="button"
                onClick={handleSaveConfig}
                disabled={isSaving || !config.serverUrl}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-pink-600 px-4 text-sm font-medium text-white transition-colors hover:bg-pink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-pink-500 dark:hover:bg-pink-600 dark:focus-visible:ring-offset-neutral-900"
              >
                {isSaving ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {isSaving ? "正在保存" : "保存配置"}
              </button>
            </div>
          </section>

          {!config.serverUrl && (
            <div className="flex items-start gap-2 rounded-lg bg-gray-50 px-3 py-2.5 text-xs leading-5 text-gray-600 dark:bg-neutral-800 dark:text-neutral-400">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              请先填写并保存服务器配置，再使用自动同步和手动备份。
            </div>
          )}

          <div
            data-tour="backup-webdav-auto"
            className="space-y-4 border-t border-gray-100 pt-6 dark:border-neutral-800"
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-800 dark:text-neutral-200">
                  启用自动同步
                </p>
                <p className="mt-1 text-xs text-gray-600 dark:text-neutral-400">
                  开启后在后台定时同步下方勾选的数据，只传输有变化的文件；关闭后仍可手动同步。
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={autoSyncEnabled}
                aria-label="启用 WebDAV 自动同步"
                onClick={() => handleAutoSyncToggle(!autoSyncEnabled)}
                disabled={!config.serverUrl}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-neutral-900 ${
                  autoSyncEnabled
                    ? "bg-pink-600 dark:bg-pink-500"
                    : "bg-gray-300 dark:bg-neutral-700"
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                    autoSyncEnabled ? "translate-x-[22px]" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>
            {autoSyncEnabled && (
              <Select
                label="同步间隔"
                value={String(autoSyncInterval)}
                onChange={(value) => handleIntervalChange(Number(value))}
                options={AUTO_SYNC_INTERVAL_OPTIONS}
              />
            )}
          </div>

          <div
            data-tour="backup-sync"
            className="border-t border-gray-100 pt-6 dark:border-neutral-800"
          >
            {syncProgress && (
              <div
                className="mb-5 rounded-xl bg-pink-50 p-4 text-pink-800 dark:bg-pink-500/10 dark:text-pink-200"
                role="status"
                aria-live="polite"
              >
                <div className="mb-2 flex justify-between gap-3 text-sm font-medium">
                  <span>{syncProgress.message}</span>
                  <span className="tabular-nums">{progressPercent}%</span>
                </div>
                <div
                  className="h-2 w-full overflow-hidden rounded-full bg-pink-200 dark:bg-pink-500/20"
                  role="progressbar"
                  aria-label="WebDAV 同步进度"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progressPercent}
                >
                  <div
                    className="h-full rounded-full bg-pink-600 transition-[width] duration-500 dark:bg-pink-400"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            )}

            <fieldset className="mb-5">
              <legend className="mb-2 text-sm font-medium text-gray-700 dark:text-neutral-300">
                同步内容
                <span className="ml-2 text-xs font-normal text-gray-500 dark:text-neutral-400">
                  自动同步与手动操作共用
                </span>
              </legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {DATA_ITEMS.map((item) => (
                  <label
                    key={item.key}
                    className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                      selectedKeys[item.key]
                        ? "border-pink-200 bg-pink-50 text-pink-800 dark:border-pink-500/30 dark:bg-pink-500/10 dark:text-pink-200"
                        : "border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedKeys[item.key]}
                      onChange={() => toggleSelected(item.key)}
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
                onClick={() => setShowBackupDialog(true)}
                disabled={isBackingUp || isRestoring || !config.serverUrl}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-pink-600 px-4 text-sm font-medium text-white transition-colors hover:bg-pink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-pink-500 dark:hover:bg-pink-600 dark:focus-visible:ring-offset-neutral-900"
              >
                {isBackingUp ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <CloudUpload className="h-4 w-4" />
                )}
                {isBackingUp ? "正在备份" : "备份到 WebDAV"}
              </button>

              <button
                type="button"
                onClick={handleRestore}
                disabled={isBackingUp || isRestoring || !config.serverUrl}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800 dark:focus-visible:ring-offset-neutral-900"
              >
                {isRestoring ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <CloudDownload className="h-4 w-4" />
                )}
                {isRestoring ? "正在恢复" : "从 WebDAV 恢复"}
              </button>
            </div>

            <div className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              恢复时会智能合并，仅在远端记录更新时覆盖本地数据。
            </div>
          </div>
        </div>
      </article>

      {showBackupDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-8"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowBackupDialog(false);
          }}
        >
          <div
            ref={backupDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="backup-mode-title"
            aria-describedby="backup-mode-description"
            className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-neutral-900"
          >
            <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4 dark:border-neutral-800">
              <div>
                <h3
                  id="backup-mode-title"
                  className="text-lg font-semibold text-gray-950 dark:text-neutral-100"
                >
                  选择备份模式
                </h3>
                <p
                  id="backup-mode-description"
                  className="mt-1 text-sm leading-6 text-gray-600 dark:text-neutral-400"
                >
                  多设备使用推荐双向同步；强制覆盖会替换远端文件。
                </p>
              </div>
              <button
                ref={closeDialogButtonRef}
                type="button"
                onClick={() => setShowBackupDialog(false)}
                aria-label="关闭备份模式选择"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 p-5">
              <button
                type="button"
                onClick={() => {
                  setShowBackupDialog(false);
                  handleBidirectionalSync();
                }}
                className="flex w-full items-start gap-3 rounded-xl border border-pink-200 bg-pink-50 p-4 text-left transition-colors hover:border-pink-300 hover:bg-pink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2 dark:border-pink-500/30 dark:bg-pink-500/10 dark:hover:bg-pink-500/15 dark:focus-visible:ring-offset-neutral-900"
              >
                <ArrowLeftRight className="mt-0.5 h-5 w-5 shrink-0 text-pink-600 dark:text-pink-400" />
                <span>
                  <span className="block font-semibold text-pink-900 dark:text-pink-200">
                    双向同步
                    <span className="ml-2 rounded-full bg-pink-600 px-2 py-0.5 text-[11px] font-medium text-white dark:bg-pink-500">
                      推荐
                    </span>
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-pink-800 dark:text-pink-200">
                    先拉取远端数据并智能合并，再将最新数据推送回去，适合多设备使用。
                  </span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowBackupDialog(false);
                  handleBackup();
                }}
                className="flex w-full items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-left transition-colors hover:border-amber-300 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:border-amber-500/30 dark:bg-amber-500/10 dark:hover:bg-amber-500/15 dark:focus-visible:ring-offset-neutral-900"
              >
                <CloudUpload className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400" />
                <span>
                  <span className="block font-semibold text-amber-900 dark:text-amber-200">
                    强制覆盖远端
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-amber-800 dark:text-amber-200">
                    直接用本地数据替换远端文件。仅在确认本地数据最新时使用。
                  </span>
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </BackupPageLayout>
  );
};

export default WebDavBackup;
