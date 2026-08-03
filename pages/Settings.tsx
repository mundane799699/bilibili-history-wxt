import { useState, useEffect } from "react";
import { AlertTriangle, Check, FolderOpen, HardDrive, RefreshCw } from "lucide-react";
import { clearHistory, saveHistory } from "../utils/db";
import { getStorageValue, setStorageValue, setStorageValues } from "../utils/storage";
import {
  IS_SYNC_DELETE,
  SYNC_INTERVAL,
  IS_SYNC_DELETE_FROM_BILIBILI,
  HIDE_USER_INFO,
  HIDDEN_MENUS,
  DATE_SELECTION_MODE,
  HISTORY_LOAD_MODE,
  DEFAULT_LOCAL_HISTORY_BACKUP_INTERVAL_HOURS,
  DEFAULT_LOCAL_HISTORY_BACKUP_RETENTION_COUNT,
  LOCAL_HISTORY_BACKUP_DIRECTORY_NAME,
  LOCAL_HISTORY_BACKUP_ENABLED,
  LOCAL_HISTORY_BACKUP_INTERVAL_HOURS,
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
  exportHistoryToCSV,
  exportHistoryToJSON,
  exportLikedMusicToJSON,
  exportLikedMusicToCSV,
} from "../utils/export";
import toast from "react-hot-toast";
import { HistoryItem, LikedMusic, LocalHistoryBackupResult } from "../utils/types";
import { importLikedMusic } from "../utils/db";
import { Checkbox } from "../components/Checkbox";
import { Select } from "../components/Select";
import { checkStorageHealth, formatStorageSize, StorageHealthReport } from "../utils/storageHealth";
import {
  clearLocalBackupDirectoryHandle,
  getLocalBackupDirectoryHandle,
  saveLocalBackupDirectoryHandle,
} from "../utils/localBackupHandle";
import {
  isLocalDirectoryBackupSupported,
  validateLocalBackupDirectory,
} from "../utils/localHistoryBackup";

const Settings = () => {
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isSyncDelete, setIsSyncDelete] = useState(false);
  const [isSyncDeleteFromBilibili, setIsSyncDeleteFromBilibili] = useState(true);
  const [isHideUserInfo, setIsHideUserInfo] = useState(false);
  const [hiddenMenus, setHiddenMenus] = useState<string[]>([]);
  const [dateSelectionMode, setDateSelectionMode] = useState<"range" | "single">("range");
  const [historyLoadMode, setHistoryLoadMode] = useState<"pagination" | "scroll">("pagination");

  const [showResetResultDialog, setShowResetResultDialog] = useState(false);
  const [resetResult, setResetResult] = useState("");
  const [isResetLoading, setIsResetLoading] = useState(false);
  const [resetStatus, setResetStatus] = useState("");

  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const [exportSource, setExportSource] = useState<"history" | "music">("history");
  const [exportFormat, setExportFormat] = useState<"csv" | "json">("json");

  const [syncInterval, setSyncInterval] = useState<number | string>(1);
  const [storageHealth, setStorageHealth] = useState<StorageHealthReport | null>(null);
  const [isCheckingStorage, setIsCheckingStorage] = useState(false);
  const [storageHealthError, setStorageHealthError] = useState("");

  const localBackupSupported = isLocalDirectoryBackupSupported();
  const [localBackupEnabled, setLocalBackupEnabled] = useState(false);
  const [localBackupIntervalHours, setLocalBackupIntervalHours] = useState(
    DEFAULT_LOCAL_HISTORY_BACKUP_INTERVAL_HOURS,
  );
  const [localBackupRetentionCount, setLocalBackupRetentionCount] = useState(
    DEFAULT_LOCAL_HISTORY_BACKUP_RETENTION_COUNT,
  );
  const [localBackupDirectoryName, setLocalBackupDirectoryName] = useState("");
  const [localBackupDirectoryConfigured, setLocalBackupDirectoryConfigured] = useState(false);
  const [localBackupLastAttemptAt, setLocalBackupLastAttemptAt] = useState(0);
  const [localBackupLastSuccessAt, setLocalBackupLastSuccessAt] = useState(0);
  const [localBackupLastFileName, setLocalBackupLastFileName] = useState("");
  const [localBackupLastRecordCount, setLocalBackupLastRecordCount] = useState(0);
  const [localBackupLastError, setLocalBackupLastError] = useState("");
  const [localBackupCleanupWarning, setLocalBackupCleanupWarning] = useState("");
  const [localBackupNeedsPermission, setLocalBackupNeedsPermission] = useState(false);
  const [isSelectingLocalBackupDirectory, setIsSelectingLocalBackupDirectory] = useState(false);
  const [isRunningLocalBackup, setIsRunningLocalBackup] = useState(false);

  const refreshStorageHealth = async (showSuccess = false) => {
    setIsCheckingStorage(true);
    setStorageHealthError("");
    try {
      const report = await checkStorageHealth(true);
      setStorageHealth(report);
      if (showSuccess) toast.success("存储保护状态已刷新");
    } catch (error) {
      console.error("检查存储保护状态失败:", error);
      setStorageHealthError(error instanceof Error ? error.message : "未知错误");
      if (showSuccess) toast.error("存储保护状态检查失败");
    } finally {
      setIsCheckingStorage(false);
    }
  };

  const loadLocalBackupSettings = async () => {
    const [
      enabled,
      intervalHours,
      retentionCount,
      directoryName,
      lastAttemptAt,
      lastSuccessAt,
      lastFileName,
      lastRecordCount,
      lastError,
      cleanupWarning,
    ] = await Promise.all([
      getStorageValue(LOCAL_HISTORY_BACKUP_ENABLED, false),
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

    setLocalBackupEnabled(Boolean(enabled));
    setLocalBackupIntervalHours(Number(intervalHours));
    setLocalBackupRetentionCount(Number(retentionCount));
    setLocalBackupDirectoryName(String(directoryName));
    setLocalBackupLastAttemptAt(Number(lastAttemptAt));
    setLocalBackupLastSuccessAt(Number(lastSuccessAt));
    setLocalBackupLastFileName(String(lastFileName));
    setLocalBackupLastRecordCount(Number(lastRecordCount));
    setLocalBackupLastError(String(lastError));
    setLocalBackupCleanupWarning(String(cleanupWarning));

    try {
      const handle = await getLocalBackupDirectoryHandle();
      setLocalBackupDirectoryConfigured(Boolean(handle));
      if (handle) {
        try {
          const permission = await handle.queryPermission({ mode: "readwrite" });
          setLocalBackupNeedsPermission(permission !== "granted");
        } catch (error) {
          console.error("检查本地备份目录权限失败:", error);
          setLocalBackupNeedsPermission(true);
        }
      } else {
        setLocalBackupNeedsPermission(false);
      }
    } catch (error) {
      console.error("读取本地备份目录状态失败:", error);
      setLocalBackupDirectoryConfigured(false);
      setLocalBackupLastError(error instanceof Error ? error.message : "读取备份目录失败");
    }
  };

  useEffect(() => {
    // 加载设置
    const loadSettings = async () => {
      const syncDelete = await getStorageValue(IS_SYNC_DELETE, false);
      const syncDeleteFromBilibili = await getStorageValue(IS_SYNC_DELETE_FROM_BILIBILI, true);
      const hideUserInfo = await getStorageValue(HIDE_USER_INFO, false);
      const menus = await getStorageValue(HIDDEN_MENUS, []);
      const storedSyncInterval = await getStorageValue(SYNC_INTERVAL, 1);
      const storedDateMode = await getStorageValue(DATE_SELECTION_MODE, "range");
      const storedHistoryLoadMode = await getStorageValue(HISTORY_LOAD_MODE, "pagination");

      setIsSyncDelete(syncDelete);
      setIsSyncDeleteFromBilibili(syncDeleteFromBilibili);
      setIsHideUserInfo(hideUserInfo);
      setHiddenMenus(menus);
      setSyncInterval(storedSyncInterval);
      setDateSelectionMode(storedDateMode as "range" | "single");
      setHistoryLoadMode(storedHistoryLoadMode as "pagination" | "scroll");
    };
    loadSettings();
    void refreshStorageHealth();
    void loadLocalBackupSettings();
  }, []);

  useEffect(() => {
    const handleStorageChange = (
      changes: Record<string, Browser.storage.StorageChange>,
      areaName: string,
    ) => {
      if (
        areaName === "local" &&
        Object.keys(changes).some((key) => key.startsWith("localHistoryBackup"))
      ) {
        void loadLocalBackupSettings();
      }
    };

    browser.storage.onChanged.addListener(handleStorageChange);
    return () => browser.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  const handleSyncDeleteChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.checked;
    setIsSyncDelete(newValue);
    await setStorageValue(IS_SYNC_DELETE, newValue);
  };

  const handleSyncDeleteFromBilibiliChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.checked;
    setIsSyncDeleteFromBilibili(newValue);
    await setStorageValue(IS_SYNC_DELETE_FROM_BILIBILI, newValue);
  };

  const handleHideUserInfoChange = async (checked: boolean) => {
    setIsHideUserInfo(checked);
    await setStorageValue(HIDE_USER_INFO, checked);
  };

  const toggleHiddenMenu = async (title: string, checked: boolean) => {
    let newMenus;
    if (!checked) {
      // if unchecked, remove from hidden (show it)
      // logic: hiddenMenus contains items to HIDE.
      // Checkbox "Hide XXX". Checked = Included in hiddenMenus.
      // So if checkbox says "Hide Favorites" is checked, we add to list.
      // Wait, toggleHiddenMenu logic was:
      // if includes -> remove. else -> add.
      // Checkbox onChange gives NEW checked state.
      // If checked=true (user wants to Hide), we Add to list.
      // If checked=false (user wants to Show), we Remove from list.
      newMenus = hiddenMenus.filter((t) => t !== title);
    } else {
      newMenus = [...hiddenMenus, title];
    }
    // Correct logic re-check:
    // If we receive `checked` as true, it means "Hide this menu". So title should be in hiddenMenus.
    if (checked) {
      if (!hiddenMenus.includes(title)) newMenus = [...hiddenMenus, title];
      else newMenus = hiddenMenus;
    } else {
      newMenus = hiddenMenus.filter((t) => t !== title);
    }

    setHiddenMenus(newMenus);
    await setStorageValue(HIDDEN_MENUS, newMenus);
  };

  const handleSyncIntervalChange = async (val: string | number) => {
    setSyncInterval(val);
    const num = Number(val);
    if (!isNaN(num) && num >= 1) {
      await setStorageValue(SYNC_INTERVAL, num);
    }
  };

  const ensureLocalBackupPermission = async (): Promise<FileSystemDirectoryHandle> => {
    const handle = await getLocalBackupDirectoryHandle();
    if (!handle) throw new Error("请先选择备份目录");

    let permission = await handle.queryPermission({ mode: "readwrite" });
    if (permission !== "granted") {
      permission = await handle.requestPermission({ mode: "readwrite" });
    }
    if (permission !== "granted") throw new Error("没有获得备份目录读写权限");

    await validateLocalBackupDirectory(handle);
    await setStorageValues({
      [LOCAL_HISTORY_BACKUP_NEEDS_PERMISSION]: false,
      [LOCAL_HISTORY_BACKUP_LAST_ERROR]: "",
    });
    setLocalBackupNeedsPermission(false);
    setLocalBackupLastError("");
    return handle;
  };

  const runLocalBackupNow = async (allowEmpty = false): Promise<void> => {
    if (isRunningLocalBackup) return;
    setIsRunningLocalBackup(true);
    try {
      await ensureLocalBackupPermission();
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
            setIsRunningLocalBackup(false);
            await runLocalBackupNow(true);
          }
          return;
        }
        throw new Error(result.error || "历史记录备份失败");
      }

      await loadLocalBackupSettings();
      if (result.cleanupWarning) {
        toast.success(`历史记录备份成功；${result.cleanupWarning}`);
      } else {
        toast.success(`历史记录备份成功，共 ${result.recordCount ?? 0} 条`);
      }
    } catch (error) {
      console.error("立即备份历史记录失败:", error);
      const message = error instanceof Error ? error.message : "历史记录备份失败";
      toast.error(message);
      await loadLocalBackupSettings();
    } finally {
      setIsRunningLocalBackup(false);
    }
  };

  const handleSelectLocalBackupDirectory = async () => {
    if (!localBackupSupported || isSelectingLocalBackupDirectory) return;
    setIsSelectingLocalBackupDirectory(true);
    try {
      const newHandle = await window.showDirectoryPicker({
        id: "bilibili-history-backup",
        mode: "readwrite",
      });
      await validateLocalBackupDirectory(newHandle);
      await saveLocalBackupDirectoryHandle(newHandle);
      await setStorageValues({
        [LOCAL_HISTORY_BACKUP_DIRECTORY_NAME]: newHandle.name,
        [LOCAL_HISTORY_BACKUP_NEEDS_PERMISSION]: false,
        [LOCAL_HISTORY_BACKUP_LAST_ERROR]: "",
        [LOCAL_HISTORY_BACKUP_LAST_CLEANUP_WARNING]: "",
      });
      await loadLocalBackupSettings();
      toast.success(`已选择备份目录：${newHandle.name}`);
      if (localBackupEnabled) await runLocalBackupNow();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error("选择本地备份目录失败:", error);
      toast.error(error instanceof Error ? error.message : "选择备份目录失败");
    } finally {
      setIsSelectingLocalBackupDirectory(false);
    }
  };

  const handleReauthorizeLocalBackupDirectory = async () => {
    try {
      await ensureLocalBackupPermission();
      await loadLocalBackupSettings();
      toast.success("备份目录已重新授权");
    } catch (error) {
      console.error("重新授权备份目录失败:", error);
      toast.error(error instanceof Error ? error.message : "重新授权失败");
    }
  };

  const handleRemoveLocalBackupDirectory = async () => {
    try {
      await setStorageValue(LOCAL_HISTORY_BACKUP_ENABLED, false);
      await clearLocalBackupDirectoryHandle();
      await setStorageValues({
        [LOCAL_HISTORY_BACKUP_DIRECTORY_NAME]: "",
        [LOCAL_HISTORY_BACKUP_LAST_ERROR]: "",
        [LOCAL_HISTORY_BACKUP_LAST_CLEANUP_WARNING]: "",
        [LOCAL_HISTORY_BACKUP_NEEDS_PERMISSION]: false,
      });
      setLocalBackupEnabled(false);
      setLocalBackupDirectoryConfigured(false);
      setLocalBackupDirectoryName("");
      setLocalBackupNeedsPermission(false);
      setLocalBackupLastError("");
      setLocalBackupCleanupWarning("");
      toast.success("已移除备份目录配置，已有备份文件不会被删除");
    } catch (error) {
      console.error("移除备份目录失败:", error);
      toast.error(error instanceof Error ? error.message : "移除备份目录失败");
    }
  };

  const handleLocalBackupToggle = async (enabled: boolean) => {
    try {
      if (enabled) {
        await ensureLocalBackupPermission();
      }
      await setStorageValue(LOCAL_HISTORY_BACKUP_ENABLED, enabled);
      setLocalBackupEnabled(enabled);
      if (enabled) {
        toast.success("已开启历史记录本地自动备份");
        if (!localBackupLastSuccessAt) await runLocalBackupNow();
      } else {
        toast.success("已关闭历史记录本地自动备份");
      }
    } catch (error) {
      console.error("切换历史记录本地自动备份失败:", error);
      toast.error(error instanceof Error ? error.message : "操作失败");
      await loadLocalBackupSettings();
    }
  };

  const handleLocalBackupIntervalChange = async (value: string) => {
    const intervalHours = Number(value);
    setLocalBackupIntervalHours(intervalHours);
    await setStorageValue(LOCAL_HISTORY_BACKUP_INTERVAL_HOURS, intervalHours);
  };

  const handleLocalBackupRetentionChange = async (value: string) => {
    const retentionCount = Number(value);
    setLocalBackupRetentionCount(retentionCount);
    await setStorageValue(LOCAL_HISTORY_BACKUP_RETENTION_COUNT, retentionCount);
  };

  const handleReset = async () => {
    try {
      setIsResetLoading(true);
      setResetStatus("正在清空历史记录...");
      await clearHistory();
      setResetStatus("正在清理备份目录授权...");
      await clearLocalBackupDirectoryHandle();
      setResetStatus("正在清理存储...");
      await browser.storage.local.clear();
      setLocalBackupEnabled(false);
      setLocalBackupDirectoryConfigured(false);
      setLocalBackupDirectoryName("");
      setLocalBackupLastError("");
      setLocalBackupCleanupWarning("");
      setLocalBackupNeedsPermission(false);
      setResetStatus("正在重新加载...");
      setResetResult("恢复出厂设置成功！");
    } catch (error) {
      console.error("恢复出厂设置失败:", error);
      setResetResult("恢复出厂设置失败，请重试！");
    } finally {
      setIsResetLoading(false);
      setResetStatus("");
      setShowResetResultDialog(true);
      setShowConfirmDialog(false);
    }
  };

  const handleExport = async () => {
    try {
      setIsExporting(true);
      if (exportSource === "history") {
        if (exportFormat === "csv") {
          await exportHistoryToCSV();
          toast.success("历史记录(CSV)导出成功！");
        } else {
          await exportHistoryToJSON();
          toast.success("历史记录(JSON)导出成功！");
        }
      } else {
        // Music
        if (exportFormat === "csv") {
          await exportLikedMusicToCSV();
          toast.success("音乐(CSV)导出成功！");
        } else {
          await exportLikedMusicToJSON();
          toast.success("音乐(JSON)导出成功！");
        }
      }
    } catch (error) {
      console.error(`导出失败:`, error);
      toast.error(`导出失败，请重试！`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async () => {
    if (exportFormat === "csv") {
      toast.error("暂不支持导入CSV格式数据");
      return;
    }

    try {
      setIsImporting(true);
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = ".json";

      fileInput.onchange = async (event) => {
        const file = (event.target as HTMLInputElement).files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = async (e) => {
            try {
              const jsonContent = e.target?.result as string;

              if (exportSource === "history") {
                const items = JSON.parse(jsonContent) as HistoryItem[];
                if (!Array.isArray(items) || items.some((item) => typeof item.id === "undefined")) {
                  toast.error("文件格式错误，请确保是历史记录JSON");
                  return;
                }
                await saveHistory(items);
                toast.success("历史记录导入成功！");
              } else {
                // Music
                const items = JSON.parse(jsonContent) as LikedMusic[];
                if (
                  !Array.isArray(items) ||
                  items.some((item) => typeof item.bvid === "undefined")
                ) {
                  toast.error("文件格式错误，请确保是音乐JSON");
                  return;
                }
                await importLikedMusic(items);
                toast.success("音乐导入成功！");
              }
            } catch (parseError) {
              console.error("解析文件失败:", parseError);
              toast.error("导入失败，文件内容错误");
            } finally {
              setIsImporting(false);
            }
          };
          reader.readAsText(file);
        } else {
          setIsImporting(false);
        }
      };

      fileInput.click();
    } catch (error) {
      console.error(`导入失败:`, error);
      toast.error("导入失败，请重试。");
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="p-4 flex flex-col container mx-auto items-center pb-20 min-h-screen bg-gray-50/30 dark:bg-[#0a0a0a] text-gray-900 dark:text-neutral-100">
      {/* 恢复出厂设置 */}
      <div className="w-full max-w-md mb-8 rounded-lg bg-gray-50 dark:bg-neutral-900 hover:bg-gray-100 dark:hover:bg-neutral-800 border border-transparent dark:border-neutral-800 hover:border-gray-200 dark:hover:border-neutral-700 transition-all duration-300 ease-in-out">
        <div className="flex items-center justify-between p-4 ">
          <div>
            <h3 className="text-lg font-medium text-gray-800 dark:text-neutral-100">
              恢复出厂设置
            </h3>
            <p className="text-sm text-gray-400 dark:text-neutral-500">清空所有数据，无法恢复</p>
          </div>
          <button
            onClick={() => setShowConfirmDialog(true)}
            className="px-4 py-2 text-sm text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 border border-red-200 dark:border-red-500/20 rounded-lg transition-colors disabled:opacity-50"
            disabled={isResetLoading}
          >
            恢复出厂
          </button>
        </div>
      </div>

      {/* Edge/Chromium 存储保护 */}
      <div className="w-full max-w-md mb-8 rounded-xl bg-gray-50 dark:bg-neutral-900 shadow-sm border border-gray-100 dark:border-neutral-800">
        <div className="p-5">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400">
                <HardDrive className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-800 dark:text-neutral-100 mb-1">
                  本地存储保护
                </h3>
                <p className="text-sm text-gray-500 dark:text-neutral-400">
                  检查 IndexedDB 持久化状态和可用容量
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void refreshStorageHealth(true)}
              disabled={isCheckingStorage}
              className="p-2 rounded-lg text-gray-500 dark:text-neutral-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors disabled:opacity-50"
              title="刷新存储保护状态"
            >
              <RefreshCw className={`w-4 h-4 ${isCheckingStorage ? "animate-spin" : ""}`} />
            </button>
          </div>

          {storageHealth ? (
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-500 dark:text-neutral-400">扩展存储保护</span>
                <span
                  className={
                    storageHealth.storageProtected
                      ? "font-medium text-green-600 dark:text-green-400"
                      : "font-medium text-amber-600 dark:text-amber-400"
                  }
                >
                  {storageHealth.storageProtected ? "已启用" : "未启用"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-gray-500 dark:text-neutral-400">保护方式</span>
                <span className="text-right font-medium text-gray-700 dark:text-neutral-200">
                  {storageHealth.unlimitedStorageGranted
                    ? "unlimitedStorage 权限"
                    : storageHealth.persisted
                      ? "浏览器持久化存储"
                      : "无"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500 dark:text-neutral-400">当前使用量</span>
                <span className="font-medium text-gray-700 dark:text-neutral-200">
                  {formatStorageSize(storageHealth.usage)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500 dark:text-neutral-400">估算配额</span>
                <span className="font-medium text-gray-700 dark:text-neutral-200">
                  {formatStorageSize(storageHealth.quota)}
                </span>
              </div>

              {storageHealth.unlimitedStorageGranted && !storageHealth.persisted && (
                <div className="rounded-lg border border-blue-200 dark:border-blue-500/20 bg-blue-50 dark:bg-blue-500/10 px-3 py-2 text-blue-700 dark:text-blue-300">
                  unlimitedStorage
                  权限已生效。浏览器未单独标记持久化存储不影响扩展存储保护，无需手动授权。
                </div>
              )}

              {!storageHealth.storageProtected && (
                <div className="rounded-lg border border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-amber-700 dark:text-amber-300">
                  未检测到 unlimitedStorage 权限或浏览器持久化存储。请先重新加载扩展，并建议定期导出
                  JSON 或配置 WebDAV 备份。
                </div>
              )}

              {(storageHealth.errors.length > 0 || storageHealthError) && (
                <div className="rounded-lg border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/10 px-3 py-2 text-red-700 dark:text-red-300">
                  存储状态检测出现异常：
                  {storageHealthError || storageHealth.errors.map((error) => error.name).join("、")}
                  。建议立即导出 JSON 或检查 WebDAV 备份。
                </div>
              )}

              {storageHealth.lastWarning && (
                <div className="rounded-lg border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/10 px-3 py-2 text-red-700 dark:text-red-300">
                  最近一次存储写入异常：{storageHealth.lastWarning.name}（
                  {new Date(storageHealth.lastWarning.timestamp).toLocaleString()}
                  ）。建议立即检查备份。
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-neutral-400">
              {isCheckingStorage ? "正在检查存储状态..." : storageHealthError || "暂无存储信息"}
            </p>
          )}
        </div>
      </div>

      {/* 历史记录本地目录自动备份 */}
      <div className="w-full max-w-md mb-8 rounded-xl bg-gray-50 dark:bg-neutral-900 shadow-sm border border-gray-100 dark:border-neutral-800">
        <div className="p-5">
          <div className="flex items-start gap-3 mb-5">
            <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <FolderOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-800 dark:text-neutral-100 mb-1">
                自动备份历史记录到本地目录
              </h3>
              <p className="text-sm text-gray-500 dark:text-neutral-400">
                浏览器运行期间，定期把历史记录保存为 JSON 文件
              </p>
            </div>
          </div>

          {!localBackupSupported ? (
            <div className="rounded-lg border border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/10 px-3 py-3 text-sm text-amber-700 dark:text-amber-300">
              当前浏览器暂不支持自动写入本地目录。你仍可以使用历史记录 JSON 手动导出或 WebDAV
              自动备份。
            </div>
          ) : (
            <div className="space-y-5">
              <div className="rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-950/40 px-3 py-3">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <p className="text-xs text-gray-500 dark:text-neutral-400 mb-1">备份目录</p>
                    <p className="text-sm font-medium text-gray-800 dark:text-neutral-100 truncate">
                      {localBackupDirectoryConfigured
                        ? localBackupDirectoryName || "已选择目录"
                        : "尚未选择"}
                    </p>
                  </div>
                  {localBackupNeedsPermission && (
                    <span className="shrink-0 text-xs font-medium text-amber-600 dark:text-amber-400">
                      需要重新授权
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void handleSelectLocalBackupDirectory()}
                    disabled={isSelectingLocalBackupDirectory || isRunningLocalBackup}
                    className="px-3 py-2 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSelectingLocalBackupDirectory
                      ? "正在选择..."
                      : localBackupDirectoryConfigured
                        ? "更换目录"
                        : "选择目录"}
                  </button>
                  {localBackupDirectoryConfigured && localBackupNeedsPermission && (
                    <button
                      type="button"
                      onClick={() => void handleReauthorizeLocalBackupDirectory()}
                      disabled={isRunningLocalBackup}
                      className="px-3 py-2 text-xs font-medium rounded-lg border border-amber-300 dark:border-amber-500/30 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors disabled:opacity-50"
                    >
                      重新授权
                    </button>
                  )}
                  {localBackupDirectoryConfigured && (
                    <>
                      <button
                        type="button"
                        onClick={() => void runLocalBackupNow()}
                        disabled={isRunningLocalBackup || isSelectingLocalBackupDirectory}
                        className="px-3 py-2 text-xs font-medium rounded-lg border border-blue-300 dark:border-blue-500/30 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors disabled:opacity-50"
                      >
                        {isRunningLocalBackup ? "备份中..." : "立即备份"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleRemoveLocalBackupDirectory()}
                        disabled={isRunningLocalBackup || isSelectingLocalBackupDirectory}
                        className="px-3 py-2 text-xs font-medium rounded-lg text-gray-500 dark:text-neutral-400 hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors disabled:opacity-50"
                      >
                        移除目录
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-neutral-200">
                    启用自动备份
                  </p>
                  <p className="text-xs text-gray-500 dark:text-neutral-400 mt-0.5">
                    关闭后仍可使用“立即备份”
                  </p>
                </div>
                <label
                  className={`relative inline-flex items-center shrink-0 ${
                    localBackupDirectoryConfigured ? "cursor-pointer" : "cursor-not-allowed"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={localBackupEnabled}
                    disabled={
                      !localBackupDirectoryConfigured ||
                      isRunningLocalBackup ||
                      isSelectingLocalBackupDirectory
                    }
                    onChange={(event) => void handleLocalBackupToggle(event.target.checked)}
                    aria-label="启用历史记录本地自动备份"
                  />
                  <div className="w-11 h-6 bg-gray-200 dark:bg-neutral-700 peer-focus:outline-none rounded-full peer peer-disabled:opacity-50 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 dark:after:border-neutral-600 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Select
                  label="备份周期"
                  value={String(localBackupIntervalHours)}
                  onChange={(value) => void handleLocalBackupIntervalChange(value)}
                  disabled={!localBackupDirectoryConfigured}
                  options={[
                    // { value: String(1 / 60), label: "每 1 分钟（测试用）" },
                    { value: "6", label: "每 6 小时" },
                    { value: "12", label: "每 12 小时" },
                    { value: "24", label: "每 24 小时" },
                    { value: "72", label: "每 3 天" },
                    { value: "168", label: "每 7 天" },
                  ]}
                />
                <Select
                  label="保留份数"
                  value={String(localBackupRetentionCount)}
                  onChange={(value) => void handleLocalBackupRetentionChange(value)}
                  disabled={!localBackupDirectoryConfigured}
                  options={[
                    { value: "7", label: "7 份" },
                    { value: "14", label: "14 份" },
                    { value: "30", label: "30 份" },
                    { value: "60", label: "60 份" },
                  ]}
                />
              </div>

              <div className="space-y-2 text-xs text-gray-500 dark:text-neutral-400">
                <div className="flex items-center justify-between gap-3">
                  <span>最近成功</span>
                  <span className="text-right font-medium text-gray-700 dark:text-neutral-200">
                    {localBackupLastSuccessAt
                      ? new Date(localBackupLastSuccessAt).toLocaleString()
                      : "尚未备份"}
                  </span>
                </div>
                {localBackupLastFileName && (
                  <div className="flex items-start justify-between gap-3">
                    <span className="shrink-0">最近文件</span>
                    <span className="text-right break-all text-gray-700 dark:text-neutral-200">
                      {localBackupLastFileName}
                    </span>
                  </div>
                )}
                {localBackupLastSuccessAt > 0 && (
                  <div className="flex items-center justify-between gap-3">
                    <span>历史记录</span>
                    <span className="font-medium text-gray-700 dark:text-neutral-200">
                      {localBackupLastRecordCount.toLocaleString()} 条
                    </span>
                  </div>
                )}
                {!localBackupLastSuccessAt && localBackupLastAttemptAt > 0 && (
                  <div className="flex items-center justify-between gap-3">
                    <span>最近尝试</span>
                    <span>{new Date(localBackupLastAttemptAt).toLocaleString()}</span>
                  </div>
                )}
              </div>

              {(localBackupLastError || localBackupNeedsPermission) && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{localBackupLastError || "备份目录权限已失效，请点击“重新授权”"}</span>
                </div>
              )}

              {localBackupCleanupWarning && (
                <div className="rounded-lg border border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                  {localBackupCleanupWarning}
                </div>
              )}

              <p className="text-xs leading-relaxed text-gray-400 dark:text-neutral-500">
                自动备份仅包含历史记录。浏览器关闭或设备休眠期间不会执行，恢复运行后会补做。
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 侧边栏菜单管理 */}
      <div className="w-full max-w-md mb-8 rounded-xl bg-gray-50 dark:bg-neutral-900 shadow-sm border border-gray-100 dark:border-neutral-800">
        <div className="p-5">
          <h3 className="text-lg font-bold text-gray-800 dark:text-neutral-100 mb-1">
            侧边栏菜单管理
          </h3>
          <p className="text-sm text-gray-500 dark:text-neutral-400 mb-6">
            选择需要隐藏并禁用的菜单项
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Checkbox
              label="隐藏用户信息"
              checked={isHideUserInfo}
              onChange={handleHideUserInfoChange}
            />

            {["收藏夹", "合集", "听歌", "云同步", "WebDAV", "关于", "反馈"].map((title) => (
              <Checkbox
                key={title}
                label={`隐藏${title}`}
                checked={hiddenMenus.includes(title)}
                onChange={(checked) => toggleHiddenMenu(title, checked)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* 界面管理 */}
      <div className="w-full max-w-md mb-8 rounded-xl bg-gray-50 dark:bg-neutral-900 shadow-sm border border-gray-100 dark:border-neutral-800">
        <div className="p-5">
          <h3 className="text-lg font-bold text-gray-800 dark:text-neutral-100 mb-1">界面管理</h3>
          <p className="text-sm text-gray-500 dark:text-neutral-400 mb-6">自定义界面显示与交互</p>

          <div className="flex flex-col gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-neutral-300 block mb-3">
                日期选择方式
              </label>
              <div className="flex gap-6">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="radio"
                    name="dateSelectionMode"
                    value="range"
                    checked={dateSelectionMode === "range"}
                    onChange={async () => {
                      setDateSelectionMode("range");
                      await setStorageValue(DATE_SELECTION_MODE, "range");
                    }}
                    className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-neutral-700 transition-all cursor-pointer"
                  />
                  <span className="text-sm text-gray-600 dark:text-neutral-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    范围选择 (起始 - 结束)
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="radio"
                    name="dateSelectionMode"
                    value="single"
                    checked={dateSelectionMode === "single"}
                    onChange={async () => {
                      setDateSelectionMode("single");
                      await setStorageValue(DATE_SELECTION_MODE, "single");
                    }}
                    className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-neutral-700 transition-all cursor-pointer"
                  />
                  <span className="text-sm text-gray-600 dark:text-neutral-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    单日选择 (点选日期)
                  </span>
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 数据管理 */}
      <div className="w-full max-w-md mb-8 rounded-xl bg-gray-50 dark:bg-neutral-900 shadow-sm border border-gray-100 dark:border-neutral-800">
        <div className="p-5">
          <h3 className="text-lg font-bold text-gray-800 dark:text-neutral-100 mb-6">数据管理</h3>

          <div className="flex flex-col gap-5">
            <div className="flex flex-col sm:flex-row gap-4">
              {/* 数据源选择 */}
              <div className="flex-1">
                <Select
                  label="导出内容"
                  value={exportSource}
                  onChange={(val) => setExportSource(val as "history" | "music")}
                  options={[
                    { value: "history", label: "历史记录" },
                    { value: "music", label: "我喜欢的音乐" },
                  ]}
                />
              </div>

              {/* 格式选择 */}
              <div className="flex-1">
                <Select
                  label="导出格式"
                  value={exportFormat}
                  onChange={(val) => setExportFormat(val as "csv" | "json")}
                  options={[
                    { value: "json", label: "JSON" },
                    { value: "csv", label: "CSV" },
                  ]}
                />
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-2">
              <button
                onClick={handleImport}
                disabled={isImporting || exportFormat === "csv"}
                className="px-5 py-2.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white border border-gray-300 rounded-lg transition-all hover:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                title={exportFormat === "csv" ? "CSV格式不支持导入" : "导入所选内容的JSON文件"}
              >
                {isImporting ? "导入中..." : "导入 (JSON)"}
              </button>
              <button
                onClick={handleExport}
                disabled={isExporting}
                className="px-5 py-2.5 text-sm font-medium bg-blue-600 text-white border rounded-lg shadow-md hover:shadow-lg border-gray-300 hover:bg-blue-700 transition-all transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              >
                {isExporting ? "导出中..." : "导出"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 历史记录加载方式 */}
      <div className="w-full max-w-md mb-8 rounded-xl bg-gray-50 dark:bg-neutral-900 shadow-sm border border-gray-100 dark:border-neutral-800">
        <div className="p-5">
          <h3 className="text-lg font-bold text-gray-800 dark:text-neutral-100 mb-1">
            历史记录加载方式
          </h3>
          <p className="text-sm text-gray-500 dark:text-neutral-400 mb-6">
            控制历史记录页面的数据加载方式
          </p>

          <div className="flex gap-6">
            {(
              [
                { value: "pagination", label: "分页加载" },
                { value: "scroll", label: "下拉加载" },
              ] as const
            ).map((option) => (
              <label key={option.value} className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="radio"
                  name="historyLoadMode"
                  value={option.value}
                  checked={historyLoadMode === option.value}
                  onChange={async () => {
                    setHistoryLoadMode(option.value);
                    await setStorageValue(HISTORY_LOAD_MODE, option.value);
                  }}
                  className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-neutral-700 transition-all cursor-pointer"
                />
                <span className="text-sm text-gray-600 dark:text-neutral-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  {option.label}
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="w-full max-w-md mb-8 rounded-xl bg-gray-50 dark:bg-neutral-900 shadow-sm border border-gray-100 dark:border-neutral-800 hover:border-gray-200 dark:hover:border-neutral-700 transition-colors">
        <div className="flex items-center justify-between p-5">
          <div className="pr-4">
            <h3 className="text-base font-medium text-gray-800 dark:text-neutral-100">
              同步删除：插件 -&gt; B站
            </h3>
            <p className="text-xs text-gray-400 dark:text-neutral-500 mt-1">
              删除本地记录时同步删除B站记录
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={isSyncDelete}
              onChange={handleSyncDeleteChange}
            />
            <div className="w-11 h-6 bg-gray-200 dark:bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 dark:after:border-neutral-600 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
          </label>
        </div>
      </div>

      <div className="w-full max-w-md mb-8 rounded-xl bg-gray-50 dark:bg-neutral-900 shadow-sm border border-gray-100 dark:border-neutral-800 hover:border-gray-200 dark:hover:border-neutral-700 transition-colors">
        <div className="flex items-center justify-between p-5">
          <div className="pr-4">
            <h3 className="text-base font-medium text-gray-800 dark:text-neutral-100">
              同步删除：B站 -&gt; 插件
            </h3>
            <p className="text-xs text-gray-400 dark:text-neutral-500 mt-1">
              B站删记录时同步删除本地记录
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={isSyncDeleteFromBilibili}
              onChange={handleSyncDeleteFromBilibiliChange}
            />
            <div className="w-11 h-6 bg-gray-200 dark:bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 dark:after:border-neutral-600 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
          </label>
        </div>
      </div>

      <div className="w-full max-w-md mb-8 rounded-xl bg-gray-50 dark:bg-neutral-900 shadow-sm border border-gray-100 dark:border-neutral-800 hover:border-gray-200 dark:hover:border-neutral-700 transition-colors">
        <div className="flex items-center justify-between p-5">
          <div>
            <h3 className="text-base font-medium text-gray-800 dark:text-neutral-100">
              历史记录自动同步时间间隔
            </h3>
            <p className="text-xs text-fuchsia-500 mt-1">单位：分钟</p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => handleSyncIntervalChange(Number(syncInterval) - 1)}
              className="w-8 h-8 flex items-center justify-center text-gray-500 dark:text-neutral-300 bg-gray-100 dark:bg-neutral-800 rounded-full hover:bg-gray-200 dark:hover:bg-neutral-700 transition-colors disabled:opacity-50"
              disabled={Number(syncInterval) <= 1}
            >
              -
            </button>
            <input
              type="number"
              value={syncInterval}
              onChange={(e) => handleSyncIntervalChange(e.target.value)}
              onBlur={() => {
                const num = Number(syncInterval);
                if (isNaN(num) || num < 1) {
                  handleSyncIntervalChange(1);
                }
              }}
              className="w-16 text-center text-lg text-gray-700 dark:text-neutral-100 font-mono font-medium bg-transparent border-b border-transparent hover:border-gray-300 dark:hover:border-neutral-600 focus:border-fuchsia-500 outline-none transition-colors"
            />
            <button
              onClick={() => handleSyncIntervalChange(Number(syncInterval) + 1)}
              className="w-8 h-8 flex items-center justify-center text-white bg-fuchsia-500 rounded-full hover:bg-fuchsia-600 transition-colors shadow-sm"
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* 确认弹窗 */}
      {/* ... (Dialog code) ... */}
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-neutral-900 p-6 rounded-xl shadow-xl max-w-sm w-full mx-4 border border-transparent dark:border-neutral-800">
            <h3 className="text-lg font-bold text-gray-900 dark:text-neutral-100 mb-2">
              确认恢复出厂设置？
            </h3>
            <p className="text-gray-500 dark:text-neutral-400 mb-6 text-sm leading-relaxed">
              此操作将<span className="text-red-600 font-medium">永久删除</span>
              所有本地存储的历史记录和偏好设置。
            </p>
            {isResetLoading && (
              <p className="text-blue-600 mb-4 text-sm animate-pulse">{resetStatus}</p>
            )}
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowConfirmDialog(false)}
                className="px-4 py-2 text-sm text-gray-600 dark:text-neutral-300 hover:bg-gray-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
                disabled={isResetLoading}
              >
                取消
              </button>
              <button
                onClick={handleReset}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors shadow-sm"
                disabled={isResetLoading}
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {showResetResultDialog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white dark:bg-neutral-900 p-6 rounded-xl shadow-xl max-w-sm w-full mx-4 text-center border border-transparent dark:border-neutral-800">
            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check size={24} />
            </div>
            <p className="text-lg text-gray-800 dark:text-neutral-100 mb-6 font-medium">
              {resetResult}
            </p>
            <button
              onClick={() => setShowResetResultDialog(false)}
              className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              确定
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
