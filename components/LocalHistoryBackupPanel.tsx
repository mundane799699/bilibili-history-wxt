import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, FolderOpen, LoaderCircle, Play, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import {
  DEFAULT_LOCAL_HISTORY_BACKUP_INTERVAL_HOURS,
  DEFAULT_LOCAL_HISTORY_BACKUP_ITEMS,
  DEFAULT_LOCAL_HISTORY_BACKUP_RETENTION_COUNT,
  BackupItemKey,
  BackupItems,
  LOCAL_HISTORY_BACKUP_DIRECTORY_NAME,
  LOCAL_HISTORY_BACKUP_ENABLED,
  LOCAL_HISTORY_BACKUP_INTERVAL_HOURS,
  LOCAL_HISTORY_BACKUP_ITEMS,
  LOCAL_HISTORY_BACKUP_LAST_ATTEMPT_AT,
  LOCAL_HISTORY_BACKUP_LAST_CLEANUP_WARNING,
  LOCAL_HISTORY_BACKUP_LAST_ERROR,
  LOCAL_HISTORY_BACKUP_LAST_FILE_NAME,
  LOCAL_HISTORY_BACKUP_LAST_RECORD_COUNT,
  LOCAL_HISTORY_BACKUP_LAST_SUCCESS_AT,
  LOCAL_HISTORY_BACKUP_NEEDS_PERMISSION,
  LOCAL_HISTORY_BACKUP_RETENTION_COUNT,
} from "../utils/constants";
import {
  clearLocalBackupDirectoryHandle,
  getLocalBackupDirectoryHandle,
  saveLocalBackupDirectoryHandle,
} from "../utils/localBackupHandle";
import {
  isLocalDirectoryBackupSupported,
  validateLocalBackupDirectory,
} from "../utils/localHistoryBackup";
import { getStorageValue, setStorageValue, setStorageValues } from "../utils/storage";
import { LocalHistoryBackupResult } from "../utils/types";
import { Select } from "./Select";

const LOCAL_BACKUP_ITEM_OPTIONS: { key: BackupItemKey; label: string }[] = [
  { key: "history", label: "历史记录" },
  { key: "likedMusic", label: "喜欢的音乐" },
  { key: "favFolders", label: "收藏夹" },
  { key: "favResources", label: "收藏资源" },
  { key: "subscribedCollections", label: "订阅合集" },
  { key: "subscribedCollectionResources", label: "合集视频" },
];

export const LocalHistoryBackupPanel = () => {
  const supported = isLocalDirectoryBackupSupported();
  const [enabled, setEnabled] = useState(false);
  const [backupItems, setBackupItems] = useState<BackupItems>(DEFAULT_LOCAL_HISTORY_BACKUP_ITEMS);
  const [intervalHours, setIntervalHours] = useState(DEFAULT_LOCAL_HISTORY_BACKUP_INTERVAL_HOURS);
  const [retentionCount, setRetentionCount] = useState(
    DEFAULT_LOCAL_HISTORY_BACKUP_RETENTION_COUNT,
  );
  const [directoryName, setDirectoryName] = useState("");
  const [directoryConfigured, setDirectoryConfigured] = useState(false);
  const [lastAttemptAt, setLastAttemptAt] = useState(0);
  const [lastSuccessAt, setLastSuccessAt] = useState(0);
  const [lastFileName, setLastFileName] = useState("");
  const [lastRecordCount, setLastRecordCount] = useState(0);
  const [lastError, setLastError] = useState("");
  const [cleanupWarning, setCleanupWarning] = useState("");
  const [needsPermission, setNeedsPermission] = useState(false);
  const [isSelectingDirectory, setIsSelectingDirectory] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  const loadSettings = async () => {
    const [
      storedEnabled,
      storedBackupItems,
      storedInterval,
      storedRetention,
      storedDirectoryName,
      storedLastAttempt,
      storedLastSuccess,
      storedLastFile,
      storedRecordCount,
      storedError,
      storedCleanupWarning,
    ] = await Promise.all([
      getStorageValue(LOCAL_HISTORY_BACKUP_ENABLED, false),
      getStorageValue<BackupItems>(LOCAL_HISTORY_BACKUP_ITEMS, DEFAULT_LOCAL_HISTORY_BACKUP_ITEMS),
      getStorageValue(
        LOCAL_HISTORY_BACKUP_INTERVAL_HOURS,
        DEFAULT_LOCAL_HISTORY_BACKUP_INTERVAL_HOURS,
      ),
      getStorageValue(
        LOCAL_HISTORY_BACKUP_RETENTION_COUNT,
        DEFAULT_LOCAL_HISTORY_BACKUP_RETENTION_COUNT,
      ),
      getStorageValue(LOCAL_HISTORY_BACKUP_DIRECTORY_NAME, ""),
      getStorageValue(LOCAL_HISTORY_BACKUP_LAST_ATTEMPT_AT, 0),
      getStorageValue(LOCAL_HISTORY_BACKUP_LAST_SUCCESS_AT, 0),
      getStorageValue(LOCAL_HISTORY_BACKUP_LAST_FILE_NAME, ""),
      getStorageValue(LOCAL_HISTORY_BACKUP_LAST_RECORD_COUNT, 0),
      getStorageValue(LOCAL_HISTORY_BACKUP_LAST_ERROR, ""),
      getStorageValue(LOCAL_HISTORY_BACKUP_LAST_CLEANUP_WARNING, ""),
    ]);

    setEnabled(Boolean(storedEnabled));
    setBackupItems({ ...DEFAULT_LOCAL_HISTORY_BACKUP_ITEMS, ...storedBackupItems });
    setIntervalHours(Number(storedInterval));
    setRetentionCount(Number(storedRetention));
    setDirectoryName(String(storedDirectoryName));
    setLastAttemptAt(Number(storedLastAttempt));
    setLastSuccessAt(Number(storedLastSuccess));
    setLastFileName(String(storedLastFile));
    setLastRecordCount(Number(storedRecordCount));
    setLastError(String(storedError));
    setCleanupWarning(String(storedCleanupWarning));

    try {
      const handle = await getLocalBackupDirectoryHandle();
      setDirectoryConfigured(Boolean(handle));
      if (!handle) {
        setNeedsPermission(false);
        return;
      }
      const permission = await handle.queryPermission({ mode: "readwrite" });
      setNeedsPermission(permission !== "granted");
    } catch (error) {
      setDirectoryConfigured(false);
      setLastError(error instanceof Error ? error.message : "读取备份目录失败");
    }
  };

  useEffect(() => {
    void loadSettings();

    const handleStorageChange = (
      changes: Record<string, Browser.storage.StorageChange>,
      areaName: string,
    ) => {
      if (
        areaName === "local" &&
        Object.keys(changes).some((key) => key.startsWith("localHistoryBackup"))
      ) {
        void loadSettings();
      }
    };

    browser.storage.onChanged.addListener(handleStorageChange);
    return () => browser.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  const ensurePermission = async (): Promise<FileSystemDirectoryHandle> => {
    const handle = await getLocalBackupDirectoryHandle();
    if (!handle) throw new Error("请先选择备份目录");

    let permission = await handle.queryPermission({ mode: "readwrite" });
    if (permission !== "granted")
      permission = await handle.requestPermission({ mode: "readwrite" });
    if (permission !== "granted") throw new Error("没有获得备份目录读写权限");

    await validateLocalBackupDirectory(handle);
    await setStorageValues({
      [LOCAL_HISTORY_BACKUP_NEEDS_PERMISSION]: false,
      [LOCAL_HISTORY_BACKUP_LAST_ERROR]: "",
    });
    setNeedsPermission(false);
    setLastError("");
    return handle;
  };

  const runNow = async (allowEmpty = false): Promise<void> => {
    if (isRunning) return;
    setIsRunning(true);
    try {
      await ensurePermission();
      const result = (await browser.runtime.sendMessage({
        action: "runLocalHistoryBackup",
        allowEmpty,
      })) as LocalHistoryBackupResult;

      if (!result.success) {
        if (result.errorCode === "EMPTY_HISTORY_ANOMALY" && !allowEmpty) {
          const confirmed = window.confirm(
            "当前历史记录为 0 条，继续会生成空备份。旧备份不会在本次操作中被清理，确定继续吗？",
          );
          if (confirmed) {
            setIsRunning(false);
            await runNow(true);
          }
          return;
        }
        throw new Error(result.error || "历史记录备份失败");
      }

      await loadSettings();
      toast.success(
        result.cleanupWarning
          ? `本地备份成功；${result.cleanupWarning}`
          : `本地备份成功：${result.summary || "已写入所选数据"}`,
      );
    } catch (error) {
      console.error("立即备份历史记录失败:", error);
      toast.error(error instanceof Error ? error.message : "历史记录备份失败");
      await loadSettings();
    } finally {
      setIsRunning(false);
    }
  };

  const selectDirectory = async () => {
    if (!supported || isSelectingDirectory) return;
    setIsSelectingDirectory(true);
    try {
      const handle = await window.showDirectoryPicker({
        id: "bilibili-history-backup",
        mode: "readwrite",
      });
      await validateLocalBackupDirectory(handle);
      await saveLocalBackupDirectoryHandle(handle);
      await setStorageValues({
        [LOCAL_HISTORY_BACKUP_DIRECTORY_NAME]: handle.name,
        [LOCAL_HISTORY_BACKUP_NEEDS_PERMISSION]: false,
        [LOCAL_HISTORY_BACKUP_LAST_ERROR]: "",
        [LOCAL_HISTORY_BACKUP_LAST_CLEANUP_WARNING]: "",
      });
      await loadSettings();
      toast.success(`已选择备份目录：${handle.name}`);
      if (enabled) await runNow();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error(error instanceof Error ? error.message : "选择备份目录失败");
    } finally {
      setIsSelectingDirectory(false);
    }
  };

  const removeDirectory = async () => {
    try {
      await setStorageValue(LOCAL_HISTORY_BACKUP_ENABLED, false);
      await clearLocalBackupDirectoryHandle();
      await setStorageValues({
        [LOCAL_HISTORY_BACKUP_DIRECTORY_NAME]: "",
        [LOCAL_HISTORY_BACKUP_LAST_ERROR]: "",
        [LOCAL_HISTORY_BACKUP_LAST_CLEANUP_WARNING]: "",
        [LOCAL_HISTORY_BACKUP_NEEDS_PERMISSION]: false,
      });
      await loadSettings();
      toast.success("已移除备份目录配置，已有备份文件不会被删除");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "移除备份目录失败");
    }
  };

  const toggleEnabled = async (nextEnabled: boolean) => {
    try {
      if (nextEnabled) await ensurePermission();
      await setStorageValue(LOCAL_HISTORY_BACKUP_ENABLED, nextEnabled);
      setEnabled(nextEnabled);
      toast.success(nextEnabled ? "已开启历史记录本地自动备份" : "已关闭历史记录本地自动备份");
      if (nextEnabled && !lastSuccessAt) await runNow();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "操作失败");
      await loadSettings();
    }
  };

  const toggleBackupItem = async (key: BackupItemKey) => {
    const selectedCount = Object.values(backupItems).filter(Boolean).length;
    if (backupItems[key] && selectedCount === 1) {
      toast.error("请至少保留一项备份内容");
      return;
    }

    const next = { ...backupItems, [key]: !backupItems[key] };
    setBackupItems(next);
    await setStorageValue(LOCAL_HISTORY_BACKUP_ITEMS, next);
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <div className="border-b border-gray-100 px-5 py-4 dark:border-neutral-800">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
            <FolderOpen className="h-4.5 w-4.5" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-950 dark:text-neutral-100">自动备份至本地</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-neutral-400">
              浏览器运行期间，定期将所选数据写入你选择的目录
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-5 p-5">
        {!supported ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
            当前浏览器不支持自动写入本地目录，请使用 WebDAV 或手动导出备份。
          </div>
        ) : (
          <>
            <div className="rounded-xl bg-gray-50 px-4 py-3 dark:bg-neutral-800/70">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 dark:text-neutral-400">备份目录</p>
                  <p className="mt-1 truncate text-sm font-medium text-gray-800 dark:text-neutral-100">
                    {directoryConfigured ? directoryName || "已选择目录" : "尚未选择"}
                  </p>
                </div>
                {needsPermission && (
                  <span className="shrink-0 text-xs font-medium text-amber-600 dark:text-amber-400">
                    需要重新授权
                  </span>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void selectDirectory()}
                  disabled={isSelectingDirectory || isRunning}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-medium text-white transition-colors hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-neutral-800"
                >
                  {isSelectingDirectory && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
                  {isSelectingDirectory
                    ? "正在选择..."
                    : directoryConfigured
                      ? "更换目录"
                      : "选择目录"}
                </button>
                {directoryConfigured && needsPermission && (
                  <button
                    type="button"
                    onClick={() => void ensurePermission().then(() => loadSettings())}
                    disabled={isRunning}
                    className="min-h-9 rounded-lg border border-amber-300 px-3 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-500/30 dark:text-amber-300 dark:hover:bg-amber-500/10 dark:focus-visible:ring-offset-neutral-800"
                  >
                    重新授权
                  </button>
                )}
                {directoryConfigured && (
                  <>
                    <button
                      type="button"
                      onClick={() => void runNow()}
                      disabled={isRunning || isSelectingDirectory}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800 dark:focus-visible:ring-offset-neutral-800"
                    >
                      {isRunning ? (
                        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Play className="h-3.5 w-3.5" />
                      )}
                      {isRunning ? "备份中..." : "立即备份"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void removeDirectory()}
                      disabled={isRunning || isSelectingDirectory}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 disabled:cursor-not-allowed disabled:opacity-50 dark:text-neutral-400 dark:hover:bg-neutral-700"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      移除目录
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-800 dark:text-neutral-200">
                  启用本地自动备份
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-neutral-400">
                  关闭后仍可立即备份
                </p>
              </div>
              <label
                className={directoryConfigured ? "cursor-pointer" : "cursor-not-allowed"}
                aria-label="启用本地自动备份"
              >
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={enabled}
                  disabled={!directoryConfigured || isRunning || isSelectingDirectory}
                  onChange={(event) => void toggleEnabled(event.target.checked)}
                />
                <span className="relative block h-6 w-11 rounded-full bg-gray-300 ring-offset-2 after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:bg-emerald-600 peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-500 peer-disabled:opacity-50 dark:bg-neutral-700 dark:ring-offset-neutral-900" />
              </label>
            </div>

            <fieldset disabled={isRunning}>
              <legend className="mb-2 flex w-full items-center justify-between gap-3 text-sm font-medium text-gray-700 dark:text-neutral-300">
                <span>备份内容</span>
                <button
                  type="button"
                  onClick={() => {
                    const allSelected = Object.fromEntries(
                      LOCAL_BACKUP_ITEM_OPTIONS.map((item) => [item.key, true]),
                    ) as BackupItems;
                    setBackupItems(allSelected);
                    void setStorageValue(LOCAL_HISTORY_BACKUP_ITEMS, allSelected);
                  }}
                  className="rounded-md px-2 py-1 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
                >
                  全部选择
                </button>
              </legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {LOCAL_BACKUP_ITEM_OPTIONS.map((item) => (
                  <label
                    key={item.key}
                    className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 ${
                      backupItems[item.key]
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200"
                        : "border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={backupItems[item.key]}
                      onChange={() => void toggleBackupItem(item.key)}
                      className="h-4 w-4 accent-emerald-600 focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1 dark:accent-emerald-500"
                    />
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Select
                label="备份周期"
                value={String(intervalHours)}
                onChange={(value) => {
                  const next = Number(value);
                  setIntervalHours(next);
                  void setStorageValue(LOCAL_HISTORY_BACKUP_INTERVAL_HOURS, next);
                }}
                disabled={!directoryConfigured}
                options={[
                  { value: "6", label: "每 6 小时" },
                  { value: "12", label: "每 12 小时" },
                  { value: "24", label: "每 24 小时" },
                  { value: "72", label: "每 3 天" },
                  { value: "168", label: "每 7 天" },
                ]}
              />
              <Select
                label="保留份数"
                value={String(retentionCount)}
                onChange={(value) => {
                  const next = Number(value);
                  setRetentionCount(next);
                  void setStorageValue(LOCAL_HISTORY_BACKUP_RETENTION_COUNT, next);
                }}
                disabled={!directoryConfigured}
                options={[
                  { value: "7", label: "7 份" },
                  { value: "14", label: "14 份" },
                  { value: "30", label: "30 份" },
                  { value: "60", label: "60 份" },
                ]}
              />
            </div>

            <dl className="space-y-2 text-xs text-gray-600 dark:text-neutral-400">
              <div className="flex justify-between gap-3">
                <dt>最近成功</dt>
                <dd className="text-right font-medium tabular-nums text-gray-700 dark:text-neutral-200">
                  {lastSuccessAt ? new Date(lastSuccessAt).toLocaleString() : "尚未备份"}
                </dd>
              </div>
              {lastFileName && (
                <div className="flex justify-between gap-3">
                  <dt className="shrink-0">最近文件</dt>
                  <dd className="break-all text-right text-gray-700 dark:text-neutral-200">
                    {lastFileName}
                  </dd>
                </div>
              )}
              {lastSuccessAt > 0 && backupItems.history && (
                <div className="flex justify-between gap-3">
                  <dt>观看次数</dt>
                  <dd className="tabular-nums">{lastRecordCount.toLocaleString()} 次</dd>
                </div>
              )}
              {!lastSuccessAt && lastAttemptAt > 0 && (
                <div className="flex justify-between gap-3">
                  <dt>最近尝试</dt>
                  <dd className="tabular-nums">{new Date(lastAttemptAt).toLocaleString()}</dd>
                </div>
              )}
            </dl>

            {(lastError || needsPermission) && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{lastError || "备份目录权限已失效，请点击“重新授权”"}</span>
              </div>
            )}
            {cleanupWarning && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{cleanupWarning}</span>
              </div>
            )}
            <p className="flex items-start gap-2 text-xs leading-5 text-gray-600 dark:text-neutral-400">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              本地目录自动备份仅包含已勾选的数据；浏览器恢复运行后会补做错过的任务。
            </p>
          </>
        )}
      </div>
    </section>
  );
};
