import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  CloudDownload,
  Database,
  History,
  RefreshCw,
  X,
  Zap,
} from "lucide-react";
import { HISTORY_LAST_SYNC } from "../utils/constants";
import { getStorageValue } from "../utils/storage";
import { HistorySyncMode, SyncHistoryRequest, SyncHistoryResponse } from "../utils/types";

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
}

const formatDateTime = (timestamp: number) => new Date(timestamp).toLocaleString();

const SYNC_MODE_OPTIONS = [
  {
    mode: "incremental",
    title: "增量同步",
    description: "只拉取最新变化；发现当前批次首尾记录均已存在时停止。",
    badge: null,
    icon: Zap,
    selectedCard:
      "border-blue-500 bg-blue-50/80 shadow-sm ring-1 ring-blue-500 dark:border-blue-500 dark:bg-blue-500/10",
    idleCard:
      "border-gray-200 hover:border-blue-300 hover:bg-gray-50 dark:border-neutral-700 dark:hover:border-blue-500/40 dark:hover:bg-neutral-800/70",
    selectedIcon: "bg-blue-600 text-white dark:bg-blue-500",
    idleIcon:
      "bg-gray-100 text-gray-500 group-hover:text-blue-600 dark:bg-neutral-800 dark:text-neutral-400 dark:group-hover:text-blue-400",
    selectedRadio: "border-blue-600 bg-blue-600 dark:border-blue-400 dark:bg-blue-400",
  },
  {
    mode: "smart",
    title: "智能同步",
    description: "完整对齐服务器保留区间；删除线上已消失的记录，保留更早本地历史。",
    badge: "推荐",
    icon: History,
    selectedCard:
      "border-emerald-500 bg-emerald-50/80 shadow-sm ring-1 ring-emerald-500 dark:border-emerald-500 dark:bg-emerald-500/10",
    idleCard:
      "border-gray-200 hover:border-emerald-300 hover:bg-gray-50 dark:border-neutral-700 dark:hover:border-emerald-500/40 dark:hover:bg-neutral-800/70",
    selectedIcon: "bg-emerald-600 text-white dark:bg-emerald-500",
    idleIcon:
      "bg-gray-100 text-gray-500 group-hover:text-emerald-600 dark:bg-neutral-800 dark:text-neutral-400 dark:group-hover:text-emerald-400",
    selectedRadio: "border-emerald-600 bg-emerald-600 dark:border-emerald-400 dark:bg-emerald-400",
  },
  {
    mode: "full",
    title: "全量同步",
    description: "从最新记录开始遍历全部线上历史，适合主动补全数据，耗时较长。",
    badge: null,
    icon: Database,
    selectedCard:
      "border-amber-500 bg-amber-50/80 shadow-sm ring-1 ring-amber-500 dark:border-amber-500 dark:bg-amber-500/10",
    idleCard:
      "border-gray-200 hover:border-amber-300 hover:bg-gray-50 dark:border-neutral-700 dark:hover:border-amber-500/40 dark:hover:bg-neutral-800/70",
    selectedIcon: "bg-amber-500 text-white",
    idleIcon:
      "bg-gray-100 text-gray-500 group-hover:text-amber-600 dark:bg-neutral-800 dark:text-neutral-400 dark:group-hover:text-amber-400",
    selectedRadio: "border-amber-500 bg-amber-500",
  },
] as const;

export const HistorySyncModal = ({ open, onClose, onSyncSuccess }: HistorySyncModalProps) => {
  const [syncMode, setSyncMode] = useState<HistorySyncMode>("smart");
  const [syncPhase, setSyncPhase] = useState<SyncPhase>("idle");
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [isLastSyncLoaded, setIsLastSyncLoaded] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  const isSyncing = syncPhase === "syncing";
  const selectedMode = SYNC_MODE_OPTIONS.find((option) => option.mode === syncMode)!;

  useEffect(() => {
    if (!open) return;

    let isActive = true;
    setSyncMode("smart");
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
        mode: syncMode,
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
        className="relative max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto rounded-2xl border border-transparent bg-white p-6 shadow-xl outline-none dark:border-neutral-800 dark:bg-neutral-900"
      >
        <button
          type="button"
          onClick={handleClose}
          disabled={isSyncing}
          className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-30 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          aria-label="关闭同步历史记录弹窗"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-start gap-3 pr-10">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-pink-50 text-pink-600 dark:bg-pink-500/10 dark:text-pink-400">
            <CloudDownload className="h-5 w-5" />
          </div>
          <div>
            <h2
              id="history-sync-title"
              className="text-xl font-bold text-gray-900 dark:text-neutral-100"
            >
              同步历史记录
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-neutral-400">
              从 B 站拉取观看历史并保存到本地。
            </p>
          </div>
        </div>

        {(syncPhase === "idle" || syncPhase === "syncing") && (
          <div className="mt-6">
            <fieldset disabled={isSyncing} className={isSyncing ? "opacity-60" : ""}>
              <legend className="text-sm font-semibold text-gray-800 dark:text-neutral-200">
                选择同步方式
              </legend>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {SYNC_MODE_OPTIONS.map((option) => {
                  const isSelected = syncMode === option.mode;
                  const ModeIcon = option.icon;

                  return (
                    <label
                      key={option.mode}
                      className={`group relative cursor-pointer rounded-xl border p-4 transition-all focus-within:ring-2 focus-within:ring-offset-2 dark:focus-within:ring-offset-neutral-900 ${
                        isSelected ? option.selectedCard : option.idleCard
                      } ${isSyncing ? "cursor-not-allowed" : ""}`}
                    >
                      <input
                        type="radio"
                        name="historySyncMode"
                        value={option.mode}
                        checked={isSelected}
                        onChange={() => setSyncMode(option.mode)}
                        className="sr-only"
                      />
                      <span className="flex items-start justify-between gap-3">
                        <span
                          className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                            isSelected ? option.selectedIcon : option.idleIcon
                          }`}
                        >
                          <ModeIcon className="h-4 w-4" />
                        </span>
                        <span
                          aria-hidden="true"
                          className={`mt-1 flex h-4 w-4 items-center justify-center rounded-full border ${
                            isSelected
                              ? option.selectedRadio
                              : "border-gray-300 bg-white dark:border-neutral-600 dark:bg-neutral-900"
                          }`}
                        >
                          {isSelected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                        </span>
                      </span>
                      <span className="mt-4 flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900 dark:text-neutral-100">
                          {option.title}
                        </span>
                        {option.badge && (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                            {option.badge}
                          </span>
                        )}
                      </span>
                      <span className="mt-2 block text-xs leading-relaxed text-gray-500 dark:text-neutral-400">
                        {option.description}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <div className="mt-4 flex items-center gap-3 rounded-lg bg-gray-50 px-3.5 py-3 dark:bg-neutral-800/70">
              <Clock3 className="h-4 w-4 shrink-0 text-gray-400 dark:text-neutral-500" />
              <span className="text-xs font-medium text-gray-500 dark:text-neutral-400">
                上次同步
              </span>
              <span className="ml-auto text-right text-xs font-medium tabular-nums text-gray-700 dark:text-neutral-300">
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
            className="mt-5 flex items-center gap-3 rounded-lg border border-pink-200 bg-pink-50 p-4 text-pink-700 dark:border-pink-500/20 dark:bg-pink-500/10 dark:text-pink-300"
          >
            <RefreshCw className="h-5 w-5 shrink-0 animate-spin" />
            <p className="text-sm font-medium">
              {syncMode === "full"
                ? "正在全量同步，请耐心等待..."
                : syncMode === "smart"
                  ? "正在获取完整服务器历史并对齐本地记录..."
                  : "正在同步最新历史记录..."}
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
                    当前本地共 {syncResult.totalHistoryCount.toLocaleString()} 条记录
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
              <button
                type="button"
                onClick={handleClose}
                disabled={isSyncing}
                className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                {syncPhase === "error" ? "关闭" : "取消"}
              </button>
              <button
                type="button"
                onClick={handleSync}
                disabled={isSyncing}
                className="inline-flex min-w-24 items-center justify-center gap-2 rounded-lg bg-pink-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-pink-700 disabled:cursor-not-allowed disabled:bg-pink-400 dark:bg-pink-500 dark:hover:bg-pink-600 dark:disabled:bg-pink-500/50"
              >
                {isSyncing && <RefreshCw className="h-4 w-4 animate-spin" />}
                {isSyncing
                  ? "正在同步..."
                  : syncPhase === "error"
                    ? "重试"
                    : `开始${selectedMode.title}`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
