import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  CloudDownload,
  Database,
  Minimize2,
  RefreshCw,
  X,
  Zap,
} from "lucide-react";
import toast from "react-hot-toast";
import { ALL_FAVORITE_FOLDERS_SYNC_PROGRESS } from "../utils/constants";
import {
  AllFavoriteFoldersSyncProgress,
  FavoriteFolder,
  SyncAllFavoriteFoldersRequest,
} from "../utils/types";

type SyncPhase = "idle" | "syncing" | "success" | "error" | "complete";

interface FailedFolder {
  id: number;
  title: string;
  error: string;
}

interface AllFavoriteFoldersSyncModalProps {
  folders: FavoriteFolder[];
  open: boolean;
  onClose: () => void;
  onSyncComplete: () => Promise<void>;
}

export const AllFavoriteFoldersSyncModal = ({
  folders,
  open,
  onClose,
  onSyncComplete,
}: AllFavoriteFoldersSyncModalProps) => {
  const [isFullSync, setIsFullSync] = useState(false);
  const [syncPhase, setSyncPhase] = useState<SyncPhase>("idle");
  const [completedCount, setCompletedCount] = useState(0);
  const [currentFolderTitle, setCurrentFolderTitle] = useState("");
  const [failedFolders, setFailedFolders] = useState<FailedFolder[]>([]);
  const [refreshWarning, setRefreshWarning] = useState<string>();
  const [errorMessage, setErrorMessage] = useState<string>();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  const isSyncing = syncPhase === "syncing";
  const successCount = completedCount - failedFolders.length;
  const progress = folders.length === 0 ? 0 : Math.round((completedCount / folders.length) * 100);

  useEffect(() => {
    if (!open) {
      if (syncPhase !== "syncing") {
        setSyncPhase("idle");
        setCompletedCount(0);
        setCurrentFolderTitle("");
        setFailedFolders([]);
        setRefreshWarning(undefined);
        setErrorMessage(undefined);
      }
      return;
    }

    let isActive = true;
    const applyProgress = (next: AllFavoriteFoldersSyncProgress | null) => {
      if (!isActive || !next) return;

      setSyncPhase(next.status);
      setCompletedCount(next.completedCount);
      setCurrentFolderTitle(next.currentFolderTitle);
      setFailedFolders(next.failedFolders);
      setIsFullSync(next.mode === "full");
      setErrorMessage(next.message);
    };

    const loadProgress = async () => {
      try {
        const next = (await browser.runtime.sendMessage({
          action: "getAllFavoriteFoldersSyncProgress",
        })) as AllFavoriteFoldersSyncProgress | null;
        applyProgress(next);
      } catch (error) {
        console.error("读取全局同步进度失败:", error);
      }
    };

    const handleStorageChange = (
      changes: { [key: string]: Browser.storage.StorageChange },
      areaName: string,
    ) => {
      if (areaName !== "local" || !changes[ALL_FAVORITE_FOLDERS_SYNC_PROGRESS]) return;
      applyProgress(
        (changes[ALL_FAVORITE_FOLDERS_SYNC_PROGRESS].newValue as AllFavoriteFoldersSyncProgress) ||
          null,
      );
    };

    browser.storage.onChanged.addListener(handleStorageChange);
    void loadProgress();

    return () => {
      isActive = false;
      browser.storage.onChanged.removeListener(handleStorageChange);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    previousActiveElementRef.current = document.activeElement as HTMLElement | null;
    const frameId = window.requestAnimationFrame(() => dialogRef.current?.focus());

    return () => {
      window.cancelAnimationFrame(frameId);
      previousActiveElementRef.current?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (!isSyncing) onClose();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusableElements = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusableElements.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isSyncing, onClose, open]);

  const handleClose = () => {
    if (!isSyncing) onClose();
  };

  const handleBackgroundSync = () => {
    toast.success("同步已转入后台，任务会继续执行");
    onClose();
  };

  const handleSync = async () => {
    if (folders.length === 0) return;

    setSyncPhase("syncing");
    setCompletedCount(0);
    setFailedFolders([]);
    setRefreshWarning(undefined);
    setErrorMessage(undefined);

    try {
      const request: SyncAllFavoriteFoldersRequest = {
        action: "syncAllFavoriteFolders",
        folders: folders.map((f) => ({ id: f.id, title: f.title })),
        isFullSync,
      };
      const response = (await browser.runtime.sendMessage(request)) as {
        success: boolean;
        error?: string;
      };

      if (!response?.success) {
        const progress = await browser.storage.local.get(ALL_FAVORITE_FOLDERS_SYNC_PROGRESS);
        const activeProgress = progress[
          ALL_FAVORITE_FOLDERS_SYNC_PROGRESS
        ] as AllFavoriteFoldersSyncProgress | null;
        if (activeProgress?.status === "syncing") {
          setSyncPhase("syncing");
          setCompletedCount(activeProgress.completedCount);
          setCurrentFolderTitle(activeProgress.currentFolderTitle);
          setFailedFolders(activeProgress.failedFolders);
          return;
        }
        throw new Error(response?.error || "发起同步失败");
      }
    } catch (error) {
      console.error("发起全部收藏夹同步失败:", error);
      setFailedFolders([
        { id: 0, title: "全局错误", error: error instanceof Error ? error.message : "未知错误" },
      ]);
      setErrorMessage(error instanceof Error ? error.message : "未知错误");
      setSyncPhase("error");
    }
  };

  useEffect(() => {
    if (syncPhase === "success") {
      void onSyncComplete()
        .catch((error) => {
          console.error("全部收藏夹同步完成后刷新页面失败:", error);
          setRefreshWarning("数据已同步，但页面刷新失败，请手动刷新");
        })
        .finally(() => browser.storage.local.remove(ALL_FAVORITE_FOLDERS_SYNC_PROGRESS));
      setSyncPhase("complete");
    }
  }, [syncPhase, onSyncComplete]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm animate-in fade-in duration-200"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) handleClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="all-favorite-folders-sync-title"
        tabIndex={-1}
        className="relative w-full max-w-lg rounded-2xl border border-transparent bg-white p-6 shadow-xl outline-none dark:border-neutral-800 dark:bg-neutral-900"
      >
        <button
          type="button"
          onClick={handleClose}
          disabled={isSyncing}
          className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-30 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          aria-label="关闭同步所有收藏夹弹窗"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-start gap-3 pr-10">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
            <CloudDownload className="h-5 w-5" />
          </div>
          <div>
            <h2
              id="all-favorite-folders-sync-title"
              className="text-xl font-bold text-gray-900 dark:text-neutral-100"
            >
              同步所有收藏夹
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-neutral-400">
              将按顺序同步 {folders.length} 个收藏夹
            </p>
          </div>
        </div>

        {(syncPhase === "idle" || syncPhase === "syncing") && (
          <div className="mt-6">
            <fieldset disabled={isSyncing} className={isSyncing ? "opacity-60" : ""}>
              <legend className="text-sm font-semibold text-gray-800 dark:text-neutral-200">
                选择同步方式
              </legend>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label
                  className={`group relative rounded-xl border p-4 transition-all focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2 dark:focus-within:ring-offset-neutral-900 ${
                    !isFullSync
                      ? "border-blue-500 bg-blue-50/80 shadow-sm ring-1 ring-blue-500 dark:bg-blue-500/10"
                      : "border-gray-200 hover:border-blue-300 hover:bg-gray-50 dark:border-neutral-700 dark:hover:border-blue-500/40 dark:hover:bg-neutral-800/70"
                  } ${isSyncing ? "cursor-not-allowed" : "cursor-pointer"}`}
                >
                  <input
                    type="radio"
                    name="allFavoriteFoldersSyncMode"
                    value="incremental"
                    checked={!isFullSync}
                    onChange={() => setIsFullSync(false)}
                    className="sr-only"
                  />
                  <span className="flex items-start justify-between gap-3">
                    <span
                      className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                        !isFullSync
                          ? "bg-blue-600 text-white dark:bg-blue-500"
                          : "bg-gray-100 text-gray-500 group-hover:text-blue-600 dark:bg-neutral-800 dark:text-neutral-400 dark:group-hover:text-blue-400"
                      }`}
                    >
                      <Zap className="h-4 w-4" />
                    </span>
                    <span
                      aria-hidden="true"
                      className={`mt-1 flex h-4 w-4 items-center justify-center rounded-full border ${
                        !isFullSync
                          ? "border-blue-600 bg-blue-600 dark:border-blue-400 dark:bg-blue-400"
                          : "border-gray-300 bg-white dark:border-neutral-600 dark:bg-neutral-900"
                      }`}
                    >
                      {!isFullSync && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                    </span>
                  </span>
                  <span className="mt-4 flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900 dark:text-neutral-100">
                      增量同步
                    </span>
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-500/20 dark:text-blue-300">
                      推荐
                    </span>
                  </span>
                  <span className="mt-2 block text-xs leading-relaxed text-gray-500 dark:text-neutral-400">
                    每个收藏夹同步到本地已有内容后停止。
                  </span>
                </label>

                <label
                  className={`group relative rounded-xl border p-4 transition-all focus-within:ring-2 focus-within:ring-amber-500 focus-within:ring-offset-2 dark:focus-within:ring-offset-neutral-900 ${
                    isFullSync
                      ? "border-amber-500 bg-amber-50/80 shadow-sm ring-1 ring-amber-500 dark:bg-amber-500/10"
                      : "border-gray-200 hover:border-amber-300 hover:bg-gray-50 dark:border-neutral-700 dark:hover:border-amber-500/40 dark:hover:bg-neutral-800/70"
                  } ${isSyncing ? "cursor-not-allowed" : "cursor-pointer"}`}
                >
                  <input
                    type="radio"
                    name="allFavoriteFoldersSyncMode"
                    value="full"
                    checked={isFullSync}
                    onChange={() => setIsFullSync(true)}
                    className="sr-only"
                  />
                  <span className="flex items-start justify-between gap-3">
                    <span
                      className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                        isFullSync
                          ? "bg-amber-500 text-white"
                          : "bg-gray-100 text-gray-500 group-hover:text-amber-600 dark:bg-neutral-800 dark:text-neutral-400 dark:group-hover:text-amber-400"
                      }`}
                    >
                      <Database className="h-4 w-4" />
                    </span>
                    <span
                      aria-hidden="true"
                      className={`mt-1 flex h-4 w-4 items-center justify-center rounded-full border ${
                        isFullSync
                          ? "border-amber-500 bg-amber-500"
                          : "border-gray-300 bg-white dark:border-neutral-600 dark:bg-neutral-900"
                      }`}
                    >
                      {isFullSync && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                    </span>
                  </span>
                  <span className="mt-4 block text-sm font-semibold text-gray-900 dark:text-neutral-100">
                    全量同步
                  </span>
                  <span className="mt-2 block text-xs leading-relaxed text-gray-500 dark:text-neutral-400">
                    遍历所有收藏夹的全部内容，耗时较长。
                  </span>
                </label>
              </div>
            </fieldset>
          </div>
        )}

        {syncPhase === "syncing" && (
          <div
            role="status"
            aria-live="polite"
            className="mt-5 rounded-lg border border-blue-200 bg-blue-50 p-4 text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300"
          >
            <div className="flex items-center gap-3">
              <RefreshCw className="h-5 w-5 shrink-0 animate-spin" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" title={currentFolderTitle}>
                  正在同步「{currentFolderTitle}」
                </p>
                <p className="mt-1 text-xs opacity-80">
                  {Math.min(completedCount + 1, folders.length)} / {folders.length}
                </p>
              </div>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-blue-100 dark:bg-blue-950/50">
              <div
                className="h-full rounded-full bg-blue-600 transition-all duration-300 dark:bg-blue-400"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {(syncPhase === "complete" || syncPhase === "error") && (
          <div
            aria-live="polite"
            className={`mt-6 rounded-lg border p-4 ${
              syncPhase === "error"
                ? "border-red-200 bg-red-50 dark:border-red-500/20 dark:bg-red-500/10"
                : failedFolders.length === 0
                  ? "border-emerald-200 bg-emerald-50 dark:border-emerald-500/20 dark:bg-emerald-500/10"
                  : "border-amber-200 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/10"
            }`}
          >
            <div className="flex gap-3">
              {syncPhase === "error" ? (
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
              ) : failedFolders.length === 0 ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
              )}
              <div className="min-w-0">
                <p
                  className={`text-sm font-semibold ${
                    syncPhase === "error"
                      ? "text-red-800 dark:text-red-300"
                      : failedFolders.length === 0
                        ? "text-emerald-800 dark:text-emerald-300"
                        : "text-amber-800 dark:text-amber-300"
                  }`}
                >
                  {syncPhase === "error"
                    ? `同步失败：${errorMessage || "未知错误"}`
                    : failedFolders.length === 0
                      ? `已成功同步全部 ${successCount} 个收藏夹`
                      : `同步完成：成功 ${successCount} 个，失败 ${failedFolders.length} 个`}
                </p>
                {failedFolders.length > 0 && (
                  <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-xs text-amber-700 dark:text-amber-400">
                    {failedFolders.map((folder) => (
                      <li key={folder.id} className="break-words">
                        「{folder.title}」：{folder.error}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            {refreshWarning && (
              <p className="mt-3 border-t border-current/10 pt-3 text-xs text-amber-700 dark:text-amber-300">
                {refreshWarning}
              </p>
            )}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3 border-t border-gray-100 pt-5 dark:border-neutral-800">
          {syncPhase === "complete" ? (
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              完成
            </button>
          ) : (
            <>
              {!isSyncing && (
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
                >
                  {syncPhase === "error" ? "关闭" : "取消"}
                </button>
              )}
              {isSyncing && (
                <button
                  type="button"
                  onClick={handleBackgroundSync}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
                >
                  <Minimize2 className="h-4 w-4" />
                  后台同步
                </button>
              )}
              <button
                type="button"
                onClick={handleSync}
                disabled={isSyncing || folders.length === 0}
                className="inline-flex min-w-28 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400 dark:bg-blue-500 dark:hover:bg-blue-600 dark:disabled:bg-blue-500/50"
              >
                {isSyncing && <RefreshCw className="h-4 w-4 animate-spin" />}
                {isSyncing ? "正在同步..." : isFullSync ? "开始全部全量同步" : "开始全部增量同步"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
