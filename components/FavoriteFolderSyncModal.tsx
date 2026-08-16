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
import { FAVORITE_FOLDER_SYNC_PROGRESS } from "../utils/constants";
import { setStorageValue } from "../utils/storage";
import {
  FavoriteFolder,
  FavoriteFolderSyncProgress,
  SyncFavoriteFolderRequest,
  SyncFavoriteFolderResponse,
} from "../utils/types";

type SyncPhase = "idle" | "syncing" | "paused" | "interrupted" | "success" | "error";

interface SyncResult {
  message: string;
  refreshWarning?: string;
}

interface FavoriteFolderSyncModalProps {
  folder: FavoriteFolder | null;
  onClose: () => void;
  onSyncSuccess: (folderId: number) => Promise<void>;
}

const formatCountdown = (milliseconds: number): string => {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

export const FavoriteFolderSyncModal = ({
  folder,
  onClose,
  onSyncSuccess,
}: FavoriteFolderSyncModalProps) => {
  const [isFullSync, setIsFullSync] = useState(false);
  const [syncPhase, setSyncPhase] = useState<SyncPhase>("idle");
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [progress, setProgress] = useState<FavoriteFolderSyncProgress | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  const isSyncing = syncPhase === "syncing";
  const progressPercent =
    progress && progress.totalItems > 0
      ? Math.min(100, Math.round((progress.processedItems / progress.totalItems) * 100))
      : 0;
  const retryAfter = progress?.retryAfter ?? 0;
  const cooldownRemaining = Math.max(0, retryAfter - now);
  const isCoolingDown = syncPhase === "paused" && cooldownRemaining > 0;
  const resumePage = progress?.nextPage ?? 1;

  useEffect(() => {
    if (!folder) return;

    setIsFullSync(false);
    setSyncPhase("idle");
    setSyncResult(null);
    setProgress(null);

    let isActive = true;
    const applyProgress = (next: FavoriteFolderSyncProgress | null) => {
      if (!isActive || !next || next.folderId !== folder.id) return;

      setProgress(next);
      setIsFullSync(next.mode === "full");
      if (next.status === "syncing") {
        setSyncPhase("syncing");
        return;
      }

      if (next.status === "success") {
        setSyncResult({ message: next.message || "收藏夹同步成功" });
        setSyncPhase("success");
        return;
      }

      if (next.status === "paused") {
        setNow(Date.now());
        setSyncResult({ message: next.message || "触发 B 站访问风控，进度已保存" });
        setSyncPhase("paused");
        return;
      }

      if (next.status === "interrupted") {
        setSyncResult({ message: next.message || "同步任务已中断，进度已保存" });
        setSyncPhase("interrupted");
        return;
      }

      setSyncResult({ message: next.message || "未知错误" });
      setSyncPhase("error");
    };

    const loadProgress = async () => {
      try {
        const next = (await browser.runtime.sendMessage({
          action: "getFavoriteFolderSyncProgress",
        })) as FavoriteFolderSyncProgress | null;
        applyProgress(next);
      } catch (error) {
        console.error("读取收藏夹同步进度失败:", error);
      }
    };

    const handleStorageChange = (
      changes: { [key: string]: Browser.storage.StorageChange },
      areaName: string,
    ) => {
      if (areaName !== "local" || !changes[FAVORITE_FOLDER_SYNC_PROGRESS]) return;
      applyProgress(
        (changes[FAVORITE_FOLDER_SYNC_PROGRESS].newValue as FavoriteFolderSyncProgress) || null,
      );
    };

    browser.storage.onChanged.addListener(handleStorageChange);
    void loadProgress();

    return () => {
      isActive = false;
      browser.storage.onChanged.removeListener(handleStorageChange);
    };
  }, [folder]);

  useEffect(() => {
    if (syncPhase !== "paused" || cooldownRemaining <= 0) return;

    const timerId = window.setTimeout(() => setNow(Date.now()), Math.min(1000, cooldownRemaining));
    return () => window.clearTimeout(timerId);
  }, [cooldownRemaining, syncPhase]);

  useEffect(() => {
    if (!folder) return;

    previousActiveElementRef.current = document.activeElement as HTMLElement | null;
    const frameId = window.requestAnimationFrame(() => dialogRef.current?.focus());

    return () => {
      window.cancelAnimationFrame(frameId);
      previousActiveElementRef.current?.focus();
    };
  }, [folder]);

  useEffect(() => {
    if (!folder) return;

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
  }, [folder, isSyncing, onClose]);

  const handleClose = () => {
    if (isSyncing) return;
    if (syncPhase === "success" && progress?.folderId === folder?.id) {
      void setStorageValue(FAVORITE_FOLDER_SYNC_PROGRESS, null);
    }
    onClose();
  };

  const handleBackgroundSync = () => {
    toast.success("同步已转入后台，任务会继续执行");
    onClose();
  };

  const handleSync = async () => {
    if (!folder) return;

    setSyncPhase("syncing");
    setSyncResult(null);

    try {
      const request: SyncFavoriteFolderRequest = {
        action: "syncFavoriteFolder",
        folderId: folder.id,
        folderTitle: folder.title,
        isFullSync,
      };
      const response = (await browser.runtime.sendMessage(request)) as
        SyncFavoriteFolderResponse | undefined;

      if (!response) throw new Error("未收到同步响应");
      if (!response.success) {
        const responseStatus = response.status;
        if (responseStatus) {
          setProgress((current) =>
            current
              ? {
                  ...current,
                  status: responseStatus,
                  nextPage: response.nextPage ?? current.nextPage,
                  retryAfter: response.retryAfter ?? current.retryAfter,
                  message: response.error,
                }
              : {
                  folderId: folder.id,
                  folderTitle: folder.title,
                  mode: isFullSync ? "full" : "incremental",
                  status: responseStatus,
                  currentPage: Math.max(0, (response.nextPage ?? 1) - 1),
                  nextPage: response.nextPage ?? 1,
                  processedItems: 0,
                  totalItems: folder.media_count,
                  onlineResourceIds: [],
                  startedAt: Date.now(),
                  updatedAt: Date.now(),
                  message: response.error,
                  retryAfter: response.retryAfter,
                },
          );
        }
        setSyncResult({ message: response.error || "未知错误" });
        setSyncPhase(responseStatus || "error");
        return;
      }

      let refreshWarning: string | undefined;
      try {
        await onSyncSuccess(response.folderId);
      } catch (error) {
        console.error("收藏夹同步成功后刷新页面失败:", error);
        refreshWarning = "数据已同步，但页面刷新失败，请手动刷新";
      }

      setSyncResult({ message: response.message, refreshWarning });
      setSyncPhase("success");
    } catch (error) {
      setSyncResult({
        message: error instanceof Error ? error.message : "未知错误",
      });
      setSyncPhase("error");
    }
  };

  if (!folder) return null;

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
        aria-labelledby="favorite-folder-sync-title"
        tabIndex={-1}
        className="relative w-full max-w-lg rounded-2xl border border-transparent bg-white p-6 shadow-xl outline-none dark:border-neutral-800 dark:bg-neutral-900"
      >
        <button
          type="button"
          onClick={handleClose}
          disabled={isSyncing}
          className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-30 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          aria-label="关闭收藏夹同步弹窗"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-start gap-3 pr-10">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-pink-50 text-pink-600 dark:bg-pink-500/10 dark:text-pink-400">
            <CloudDownload className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2
              id="favorite-folder-sync-title"
              className="text-xl font-bold text-gray-900 dark:text-neutral-100"
            >
              同步收藏夹
            </h2>
            <p
              className="mt-1 truncate text-sm font-medium text-gray-700 dark:text-neutral-300"
              title={folder.title}
            >
              「{folder.title}」
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
                  className={`group relative rounded-xl border p-4 transition-all focus-within:ring-2 focus-within:ring-pink-500 focus-within:ring-offset-2 dark:focus-within:ring-offset-neutral-900 ${
                    !isFullSync
                      ? "border-pink-500 bg-pink-50/80 shadow-sm ring-1 ring-pink-500 dark:bg-pink-500/10"
                      : "border-gray-200 hover:border-pink-300 hover:bg-gray-50 dark:border-neutral-700 dark:hover:border-pink-500/40 dark:hover:bg-neutral-800/70"
                  } ${isSyncing ? "cursor-not-allowed" : "cursor-pointer"}`}
                >
                  <input
                    type="radio"
                    name="favoriteFolderSyncMode"
                    value="incremental"
                    checked={!isFullSync}
                    onChange={() => setIsFullSync(false)}
                    className="sr-only"
                  />
                  <span className="flex items-start justify-between gap-3">
                    <span
                      className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                        !isFullSync
                          ? "bg-pink-600 text-white dark:bg-pink-500"
                          : "bg-gray-100 text-gray-500 group-hover:text-pink-600 dark:bg-neutral-800 dark:text-neutral-400 dark:group-hover:text-pink-400"
                      }`}
                    >
                      <Zap className="h-4 w-4" />
                    </span>
                    <span
                      aria-hidden="true"
                      className={`mt-1 flex h-4 w-4 items-center justify-center rounded-full border ${
                        !isFullSync
                          ? "border-pink-600 bg-pink-600 dark:border-pink-400 dark:bg-pink-400"
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
                    <span className="rounded-full bg-pink-100 px-2 py-0.5 text-[10px] font-semibold text-pink-700 dark:bg-pink-500/20 dark:text-pink-300">
                      推荐
                    </span>
                  </span>
                  <span className="mt-2 block text-xs leading-relaxed text-gray-500 dark:text-neutral-400">
                    从最新内容开始翻页，遇到本地已同步边界后停止。
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
                    name="favoriteFolderSyncMode"
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
                    遍历全部内容并清理已取消收藏的本地记录，耗时较长。
                  </span>
                </label>
              </div>
            </fieldset>
          </div>
        )}

        {syncPhase === "syncing" && (
          <div
            role="status"
            className="mt-5 rounded-lg border border-pink-200 bg-pink-50 p-4 text-pink-700 dark:border-pink-500/20 dark:bg-pink-500/10 dark:text-pink-300"
          >
            <div className="flex items-center gap-3">
              <RefreshCw className="h-5 w-5 shrink-0 animate-spin" />
              <p className="text-sm font-medium">
                正在{isFullSync ? "全量" : "增量"}同步「{folder.title}」...
              </p>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-pink-100 dark:bg-pink-950/60">
              <div
                className={`h-full rounded-full bg-pink-600 transition-[width] duration-300 dark:bg-pink-400 ${
                  !isFullSync ? "animate-pulse" : ""
                }`}
                style={{
                  width: progress?.totalItems ? `${Math.max(4, progressPercent)}%` : "4%",
                }}
              />
            </div>
            <p className="mt-2 text-xs text-pink-600 dark:text-pink-300">
              {progress?.currentPage
                ? progress.totalItems > 0
                  ? `已检查 ${progress.processedItems} / ${progress.totalItems} 条（${progressPercent}%），第 ${progress.currentPage} 页`
                  : `已检查 ${progress.processedItems} 条，第 ${progress.currentPage} 页`
                : "正在获取合集信息..."}
            </p>
          </div>
        )}

        {syncPhase === "success" && syncResult && (
          <div
            aria-live="polite"
            className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/20 dark:bg-emerald-500/10"
          >
            <div className="flex gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                {syncResult.message}
              </p>
            </div>
            {syncResult.refreshWarning && (
              <p className="mt-3 border-t border-emerald-200 pt-3 text-xs text-amber-700 dark:border-emerald-500/20 dark:text-amber-300">
                {syncResult.refreshWarning}
              </p>
            )}
          </div>
        )}

        {syncPhase === "paused" && syncResult && (
          <div
            aria-live="polite"
            className="mt-6 flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/20 dark:bg-amber-500/10"
          >
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                触发 B 站访问风控，已暂停同步
              </p>
              <p className="mt-1 break-words text-sm text-amber-700 dark:text-amber-400">
                {syncResult.message}
              </p>
              <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                进度已保存，将从第 {resumePage} 页继续
                {isCoolingDown && `；请等待 ${formatCountdown(cooldownRemaining)}`}
              </p>
            </div>
          </div>
        )}

        {(syncPhase === "error" || syncPhase === "interrupted") && syncResult && (
          <div
            aria-live="polite"
            className="mt-6 flex gap-3 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-500/20 dark:bg-red-500/10"
          >
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
            <div>
              <p className="text-sm font-semibold text-red-800 dark:text-red-300">
                {syncPhase === "interrupted" ? "同步已中断" : "同步失败"}
              </p>
              <p className="mt-1 break-words text-sm text-red-700 dark:text-red-400">
                {syncResult.message}
              </p>
              <p className="mt-2 text-xs text-red-700 dark:text-red-300">
                {syncPhase === "interrupted"
                  ? `可从第 ${resumePage} 页继续`
                  : `重试时将从第 ${resumePage} 页开始`}
              </p>
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3 border-t border-gray-100 pt-5 dark:border-neutral-800">
          {syncPhase === "success" ? (
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg bg-pink-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-pink-700 dark:bg-pink-500 dark:hover:bg-pink-600"
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
                  {syncPhase === "error" || syncPhase === "paused" || syncPhase === "interrupted"
                    ? "关闭"
                    : "取消"}
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
                disabled={isSyncing || isCoolingDown}
                className="inline-flex min-w-28 items-center justify-center gap-2 rounded-lg bg-pink-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-pink-700 disabled:cursor-not-allowed disabled:bg-pink-400 dark:bg-pink-500 dark:hover:bg-pink-600 dark:disabled:bg-pink-500/50"
              >
                {isSyncing && <RefreshCw className="h-4 w-4 animate-spin" />}
                {isSyncing
                  ? "正在同步..."
                  : syncPhase === "paused"
                    ? isCoolingDown
                      ? `继续同步（${formatCountdown(cooldownRemaining)}）`
                      : `从第 ${resumePage} 页继续`
                    : syncPhase === "interrupted"
                      ? `从第 ${resumePage} 页继续`
                      : syncPhase === "error"
                        ? resumePage > 1
                          ? `从第 ${resumePage} 页重试`
                          : "重试"
                        : isFullSync
                          ? "开始全量同步"
                          : "开始增量同步"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
