import { useEffect, useRef } from "react";
import { DatabaseBackup, ShieldAlert, X } from "lucide-react";

export type BackupReminderReason = "routine" | "storage-risk";

interface DataBackupReminderModalProps {
  open: boolean;
  reason: BackupReminderReason;
  onClose: () => void;
  onBackup: () => void;
}

export const DataBackupReminderModal = ({
  open,
  reason,
  onClose,
  onBackup,
}: DataBackupReminderModalProps) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

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
        onClose();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusableElements = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
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
  }, [onClose, open]);

  if (!open) return null;

  const isStorageRisk = reason === "storage-risk";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm animate-in fade-in duration-200"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="data-backup-reminder-title"
        tabIndex={-1}
        className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-transparent bg-white p-6 shadow-xl outline-none dark:border-neutral-800 dark:bg-neutral-900"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-500 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          aria-label="关闭数据备份提醒"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-start gap-3 pr-10">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
            {isStorageRisk ? (
              <ShieldAlert className="h-5 w-5" />
            ) : (
              <DatabaseBackup className="h-5 w-5" />
            )}
          </div>
          <div>
            <h2
              id="data-backup-reminder-title"
              className="text-xl font-bold text-gray-900 dark:text-neutral-100"
            >
              请及时备份你的数据
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-neutral-400">
              为重要数据保留一份浏览器之外的副本
            </p>
          </div>
        </div>

        {isStorageRisk && (
          <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-relaxed text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
            检测到当前存储保护状态异常，建议立即备份。
          </div>
        )}

        <div className="mt-5 space-y-3 text-sm leading-relaxed text-gray-600 dark:text-neutral-300">
          <p>
            历史记录保存在当前浏览器的本地存储中。清理浏览器数据、卸载或重装扩展、浏览器异常、设备故障等情况，都可能导致数据永久丢失。
          </p>
          <p>
            扩展作者无法访问或恢复未备份的本地数据，请定期导出 JSON 文件，或配置 WebDAV 自动备份。
          </p>
        </div>

        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm leading-relaxed text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
          建议：重要数据至少保留一份浏览器之外的备份。
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            我已了解
          </button>
          <button
            type="button"
            onClick={onBackup}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-neutral-900"
          >
            <DatabaseBackup className="h-4 w-4" />
            立即备份
          </button>
        </div>
      </div>
    </div>
  );
};
