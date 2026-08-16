import { useEffect, useRef } from "react";
import { AlertTriangle, LoaderCircle, Trash2 } from "lucide-react";
import { FavoriteFolder } from "../utils/types";

interface ClearFavoriteFolderModalProps {
  folder: FavoriteFolder | null;
  localResourceCount: number;
  isClearing: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export const ClearFavoriteFolderModal = ({
  folder,
  localResourceCount,
  isClearing,
  onClose,
  onConfirm,
}: ClearFavoriteFolderModalProps) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const isClearingRef = useRef(isClearing);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    isClearingRef.current = isClearing;
    onCloseRef.current = onClose;
  }, [isClearing, onClose]);

  useEffect(() => {
    if (!folder) return;

    previousActiveElementRef.current = document.activeElement as HTMLElement | null;
    const frameId = window.requestAnimationFrame(() => dialogRef.current?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isClearingRef.current) onCloseRef.current();
      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusableElements = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [tabindex]:not([tabindex="-1"])',
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
    return () => {
      window.cancelAnimationFrame(frameId);
      document.removeEventListener("keydown", handleKeyDown);
      previousActiveElementRef.current?.focus();
    };
  }, [folder]);

  if (!folder) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm animate-in fade-in duration-200"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isClearing) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="clear-favorite-folder-title"
        aria-describedby="clear-favorite-folder-description"
        tabIndex={-1}
        className="w-full max-w-md rounded-2xl border border-transparent bg-white p-6 shadow-xl outline-none dark:border-neutral-800 dark:bg-neutral-900"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2
              id="clear-favorite-folder-title"
              className="text-lg font-bold text-gray-900 dark:text-neutral-100"
            >
              确认清空本地收藏？
            </h2>
            <p
              id="clear-favorite-folder-description"
              className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-neutral-400"
            >
              将永久删除插件本地保存的「{folder.title}」中 {localResourceCount}
              条收藏记录。此操作不会取消 B 站线上收藏，下次同步时可能重新下载。
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isClearing}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => void onConfirm()}
            disabled={isClearing}
            className="inline-flex min-w-24 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-400 dark:bg-red-500 dark:hover:bg-red-600"
          >
            {isClearing ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            {isClearing ? "正在清空..." : "确认清空"}
          </button>
        </div>
      </div>
    </div>
  );
};
