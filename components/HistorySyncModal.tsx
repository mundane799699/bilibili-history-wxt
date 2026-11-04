import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  CloudDownload,
  Database,
  RefreshCw,
  X,
  Zap,
} from "lucide-react";
import { HISTORY_LAST_SYNC } from "../utils/constants";
import { getStorageValue } from "../utils/storage";
import { HistoryDisplayMode, SyncHistoryRequest, SyncHistoryResponse } from "../utils/types";

type SyncPhase = "idle" | "syncing" | "success" | "error";

interface SyncResult {
  message: string;
  completedAt?: number;
  totalHistoryCount?: number;
  refreshWarning?: string;
}

interface HistorySyncModalProps {
  open: boolean;
  onClose: () => void;
  onSyncSuccess: () => Promise<number>;
  displayMode: HistoryDisplayMode;
}

const formatDateTime = (timestamp: number) => new Date(timestamp).toLocaleString();

export const HistorySyncModal = ({
  open,
  onClose,
  onSyncSuccess,
  displayMode,
}: HistorySyncModalProps) => {
  const [isFullSync, setIsFullSync] = useState(false);
  const [syncPhase, setSyncPhase] = useState<SyncPhase>("idle");
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [isLastSyncLoaded, setIsLastSyncLoaded] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  const isSyncing = syncPhase === "syncing";

  useEffect(() => {
    if (!open) return;

    let isActive = true;
    setIsFullSync(false);
    setSyncPhase("idle");
    setSyncResult(null);
    setIsLastSyncLoaded(false);

    getStorageValue<number | null>(HISTORY_LAST_SYNC, null)
      .then((timestamp) => {
        if (isActive) setLastSyncAt(timestamp);
      })
      .catch(() => {
        if (isActive) setLastSyncAt(null);
      })
      .finally(() => {
        if (isActive) setIsLastSyncLoaded(true);
      });

    return () => {
      isActive = false;
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

  const handleSync = async () => {
    setSyncPhase("syncing");
    setSyncResult(null);

    try {
      const request: SyncHistoryRequest = {
        action: "syncHistory",
        isFullSync,
      };
      const response = (await browser.runtime.sendMessage(request)) as
        SyncHistoryResponse | undefined;

      if (!response) {
        throw new Error("未收到同步响应");
      }

      if (!response.success) {
        setSyncResult({ message: response.error || "未知错误" });
        setSyncPhase("error");
        return;
      }

      const completedAt = Date.now();
      let totalHistoryCount: number | undefined;
      let refreshWarning: string | undefined;

      try {
        totalHistoryCount = await onSyncSuccess();
      } catch (error) {
        console.error("Failed to refresh history after sync:", error);
        refreshWarning = "数据已同步，但页面刷新失败，请手动刷新";
      }

      setLastSyncAt(completedAt);
      setSyncResult({
        message: response.message,
        completedAt,
        totalHistoryCount,
        refreshWarning,
      });
      setSyncPhase("success");
    } catch (error) {
      setSyncResult({
        message: error instanceof Error ? error.message : "未知错误",
      });
      setSyncPhase("error");
    }
  };

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
        aria-labelledby="history-sync-title"
        tabIndex={-1}
        className="relative w-full max-w-lg rounded-2xl border border-transparent bg-white p-6 shadow-xl outline-none dark:border-night-line dark:bg-night-card"
      >
        <button
          type="button"
          onClick={handleClose}
          disabled={isSyncing}
          className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-wash hover:text-ink-soft disabled:cursor-not-allowed disabled:opacity-30 dark:text-night-muted dark:hover:bg-night-line/60 dark:hover:text-night-text"
          aria-label="关闭同步历史记录弹窗"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-start gap-3 pr-10">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-strong dark:bg-brand/10 dark:text-brand">
            <CloudDownload className="h-5 w-5" />
          </div>
          <div>
            <h2 id="history-sync-title" className="text-xl font-bold text-ink dark:text-night-text">
              同步历史记录
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-ink-muted dark:text-night-muted">
              从 B 站拉取观看历史并保存到本地。
            </p>
          </div>
        </div>

        {(syncPhase === "idle" || syncPhase === "syncing") && (
          <div className="mt-6">
            <fieldset disabled={isSyncing} className={isSyncing ? "opacity-60" : ""}>
              <legend className="text-sm font-semibold text-ink dark:text-night-text">
                选择同步方式
              </legend>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label
                  className={`group relative cursor-pointer rounded-xl border p-4 transition-all focus-within:ring-2 focus-within:ring-brand focus-within:ring-offset-2 dark:focus-within:ring-offset-neutral-900 ${
                    !isFullSync
                      ? "border-brand bg-brand-soft/80 shadow-sm ring-1 ring-brand dark:border-brand dark:bg-brand/10"
                      : "border-line hover:border-brand/30 hover:bg-wash dark:border-night-line dark:hover:border-brand/40 dark:hover:bg-night-line/60/70"
                  } ${isSyncing ? "cursor-not-allowed" : ""}`}
                >
                  <input
                    type="radio"
                    name="historySyncMode"
                    value="incremental"
                    checked={!isFullSync}
                    onChange={() => setIsFullSync(false)}
                    className="sr-only"
                  />
                  <span className="flex items-start justify-between gap-3">
                    <span
                      className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                        !isFullSync
                          ? "bg-brand-strong text-white dark:bg-brand"
                          : "bg-wash text-ink-muted group-hover:text-brand-strong dark:bg-night-line dark:text-night-muted dark:group-hover:text-brand"
                      }`}
                    >
                      <Zap className="h-4 w-4" />
                    </span>
                    <span
                      aria-hidden="true"
                      className={`mt-1 flex h-4 w-4 items-center justify-center rounded-full border ${
                        !isFullSync
                          ? "border-pink-600 bg-brand-strong dark:border-brand dark:bg-brand"
                          : "border-line bg-white dark:border-night-line dark:bg-night-card"
                      }`}
                    >
                      {!isFullSync && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                    </span>
                  </span>
                  <span className="mt-4 flex items-center gap-2">
                    <span className="text-sm font-semibold text-ink dark:text-night-text">
                      增量同步
                    </span>
                    <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-semibold text-brand-strong dark:bg-brand/20 dark:text-brand">
                      推荐
                    </span>
                  </span>
                  <span className="mt-2 block text-xs leading-relaxed text-ink-muted dark:text-night-muted">
                    只拉取最新变化；发现当前批次首尾记录均已存在时停止。
                  </span>
                </label>

                <label
                  className={`group relative cursor-pointer rounded-xl border p-4 transition-all focus-within:ring-2 focus-within:ring-amber-500 focus-within:ring-offset-2 dark:focus-within:ring-offset-neutral-900 ${
                    isFullSync
                      ? "border-amber-500 bg-amber-50/80 shadow-sm ring-1 ring-amber-500 dark:border-amber-500 dark:bg-amber-500/10"
                      : "border-line hover:border-amber-300 hover:bg-wash dark:border-night-line dark:hover:border-amber-500/40 dark:hover:bg-night-line/60/70"
                  } ${isSyncing ? "cursor-not-allowed" : ""}`}
                >
                  <input
                    type="radio"
                    name="historySyncMode"
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
                          : "bg-wash text-ink-muted group-hover:text-amber-600 dark:bg-night-line dark:text-night-muted dark:group-hover:text-amber-400"
                      }`}
                    >
                      <Database className="h-4 w-4" />
                    </span>
                    <span
                      aria-hidden="true"
                      className={`mt-1 flex h-4 w-4 items-center justify-center rounded-full border ${
                        isFullSync
                          ? "border-amber-500 bg-amber-500"
                          : "border-line bg-white dark:border-night-line dark:bg-night-card"
                      }`}
                    >
                      {isFullSync && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                    </span>
                  </span>
                  <span className="mt-4 block text-sm font-semibold text-ink dark:text-night-text">
                    全量同步
                  </span>
                  <span className="mt-2 block text-xs leading-relaxed text-ink-muted dark:text-night-muted">
                    从最新记录开始遍历全部历史，适合补全数据，耗时较长。
                  </span>
                </label>
              </div>
            </fieldset>

            <div className="mt-4 flex items-center gap-3 rounded-lg bg-wash px-3.5 py-3 dark:bg-night-line/70">
              <Clock3 className="h-4 w-4 shrink-0 text-ink-faint dark:text-night-muted" />
              <span className="text-xs font-medium text-ink-muted dark:text-night-muted">
                上次同步
              </span>
              <span className="ml-auto text-right text-xs font-medium tabular-nums text-ink-soft dark:text-night-muted">
                {!isLastSyncLoaded
                  ? "读取中..."
                  : lastSyncAt
                    ? formatDateTime(lastSyncAt)
                    : "尚未同步过"}
              </span>
            </div>
          </div>
        )}

        {syncPhase === "syncing" && (
          <div
            role="status"
            className="mt-5 flex items-center gap-3 rounded-lg border border-brand/25 bg-brand-soft p-4 text-brand-strong dark:border-brand/20 dark:bg-brand/10 dark:text-brand"
          >
            <RefreshCw className="h-5 w-5 shrink-0 animate-spin" />
            <p className="text-sm font-medium">
              {isFullSync ? "正在全量同步，请耐心等待..." : "正在同步最新历史记录..."}
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
              <div>
                <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                  {syncResult.message}
                </p>
                {syncResult.completedAt && (
                  <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-400">
                    完成时间：{formatDateTime(syncResult.completedAt)}
                  </p>
                )}
                {syncResult.totalHistoryCount !== undefined && (
                  <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">
                    当前本地共 {syncResult.totalHistoryCount.toLocaleString()}{" "}
                    {displayMode === "visit" ? "次观看" : "个内容"}
                  </p>
                )}
              </div>
            </div>
            {syncResult.refreshWarning && (
              <p className="mt-3 border-t border-emerald-200 pt-3 text-xs text-amber-700 dark:border-emerald-500/20 dark:text-amber-300">
                {syncResult.refreshWarning}
              </p>
            )}
          </div>
        )}

        {syncPhase === "error" && syncResult && (
          <div
            aria-live="polite"
            className="mt-6 flex gap-3 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-500/20 dark:bg-red-500/10"
          >
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
            <div>
              <p className="text-sm font-semibold text-red-800 dark:text-red-300">同步失败</p>
              <p className="mt-1 break-words text-sm text-red-700 dark:text-red-400">
                {syncResult.message}
              </p>
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3 border-t border-line pt-5 dark:border-night-line">
          {syncPhase === "success" ? (
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg bg-brand-strong px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-strong dark:bg-brand dark:hover:bg-brand-strong"
            >
              完成
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={handleClose}
                disabled={isSyncing}
                className="rounded-lg border border-line bg-white px-4 py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-wash disabled:cursor-not-allowed disabled:opacity-50 dark:border-night-line dark:bg-night-card dark:text-night-muted dark:hover:bg-night-line/60"
              >
                {syncPhase === "error" ? "关闭" : "取消"}
              </button>
              <button
                type="button"
                onClick={handleSync}
                disabled={isSyncing}
                className="inline-flex min-w-24 items-center justify-center gap-2 rounded-lg bg-brand-strong px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-strong disabled:cursor-not-allowed disabled:bg-brand dark:bg-brand dark:hover:bg-brand-strong dark:disabled:bg-brand/50"
              >
                {isSyncing && <RefreshCw className="h-4 w-4 animate-spin" />}
                {isSyncing
                  ? "正在同步..."
                  : syncPhase === "error"
                    ? "重试"
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
