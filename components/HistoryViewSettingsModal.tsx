import { useEffect, useRef, useState } from "react";
import { ChevronsDown, List, Minus, Plus, Settings2, X } from "lucide-react";

export type HistoryLoadMode = "pagination" | "scroll";

export interface HistoryViewSettings {
  loadMode: HistoryLoadMode;
  gridColumns: number | "auto";
}

interface HistoryViewSettingsModalProps extends HistoryViewSettings {
  open: boolean;
  onClose: () => void;
  onSave: (settings: HistoryViewSettings) => Promise<void>;
}

const MIN_GRID_COLUMNS = 2;
const MAX_GRID_COLUMNS = 8;

const loadModeOptions: {
  value: HistoryLoadMode;
  label: string;
  description: string;
  icon: typeof List;
}[] = [
  {
    value: "pagination",
    label: "分页加载",
    description: "按页浏览历史记录，可快速跳转页面。",
    icon: List,
  },
  {
    value: "scroll",
    label: "下拉加载",
    description: "滚动到页面底部时自动加载更多记录。",
    icon: ChevronsDown,
  },
];

export const HistoryViewSettingsModal = ({
  open,
  loadMode,
  gridColumns,
  onClose,
  onSave,
}: HistoryViewSettingsModalProps) => {
  const [draftLoadMode, setDraftLoadMode] = useState<HistoryLoadMode>(loadMode);
  const [draftGridColumns, setDraftGridColumns] = useState<number | "auto">(gridColumns);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraftLoadMode(loadMode);
    setDraftGridColumns(gridColumns);
    setIsSaving(false);
    setErrorMessage("");
  }, [gridColumns, loadMode, open]);

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
        if (!isSaving) onClose();
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
  }, [isSaving, onClose, open]);

  const handleClose = () => {
    if (!isSaving) onClose();
  };

  const handleColumnChange = (delta: number) => {
    if (draftGridColumns === "auto") {
      setDraftGridColumns(4); // Default to 4 when switching from auto
      return;
    }
    setDraftGridColumns((current) => {
      const currentNum = current as number;
      return Math.max(MIN_GRID_COLUMNS, Math.min(MAX_GRID_COLUMNS, currentNum + delta));
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    setErrorMessage("");

    try {
      await onSave({
        loadMode: draftLoadMode,
        gridColumns: draftGridColumns,
      });
      onClose();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "保存设置失败");
    } finally {
      setIsSaving(false);
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
        aria-labelledby="history-view-settings-title"
        tabIndex={-1}
        className="relative w-full max-w-md rounded-xl border border-transparent bg-white p-6 shadow-xl outline-none dark:border-neutral-800 dark:bg-neutral-900"
      >
        <button
          type="button"
          onClick={handleClose}
          disabled={isSaving}
          className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-30 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          aria-label="关闭历史视图设置弹窗"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-start gap-3 pr-10">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-pink-50 text-pink-600 dark:bg-pink-500/10 dark:text-pink-400">
            <Settings2 className="h-5 w-5" />
          </div>
          <div>
            <h2
              id="history-view-settings-title"
              className="text-xl font-bold text-gray-900 dark:text-neutral-100"
            >
              历史视图设置
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-neutral-400">
              调整历史记录的加载和排列方式。
            </p>
          </div>
        </div>

        <fieldset className="mt-6" disabled={isSaving}>
          <legend className="text-sm font-semibold text-gray-800 dark:text-neutral-200">
            加载方式
          </legend>
          <div className="mt-3 grid gap-3 grid-cols-1">
            {loadModeOptions.map((option) => {
              const Icon = option.icon;
              const isSelected = draftLoadMode === option.value;

              return (
                <label
                  key={option.value}
                  className={`cursor-pointer rounded-lg border p-4 transition-colors focus-within:ring-2 focus-within:ring-pink-500 focus-within:ring-offset-2 dark:focus-within:ring-offset-neutral-900 ${
                    isSelected
                      ? "border-pink-500 bg-pink-50 ring-1 ring-pink-500 dark:border-pink-500 dark:bg-pink-500/10"
                      : "border-gray-200 hover:border-pink-300 hover:bg-gray-50 dark:border-neutral-700 dark:hover:border-pink-500/40 dark:hover:bg-neutral-800/70"
                  }`}
                >
                  <input
                    type="radio"
                    name="historyLoadMode"
                    value={option.value}
                    checked={isSelected}
                    onChange={() => setDraftLoadMode(option.value)}
                    className="sr-only"
                  />
                  <span className="flex items-center gap-2">
                    <Icon
                      className={`h-4 w-4 ${
                        isSelected
                          ? "text-pink-600 dark:text-pink-400"
                          : "text-gray-400 dark:text-neutral-500"
                      }`}
                    />
                    <span className="text-sm font-medium text-gray-800 dark:text-neutral-200">
                      {option.label}
                    </span>
                  </span>
                  <span className="mt-2 block text-xs leading-relaxed text-gray-500 dark:text-neutral-400">
                    {option.description}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="mt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-800 dark:text-neutral-200">每行列数</p>
              <p className="mt-1 text-xs text-gray-500 dark:text-neutral-400">
                可设置为 {MIN_GRID_COLUMNS} 至 {MAX_GRID_COLUMNS} 列或自适应。
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDraftGridColumns("auto")}
                disabled={isSaving}
                className={`text-xs px-3 py-1.5 rounded-md transition-colors border ${
                  draftGridColumns === "auto"
                    ? "border-pink-500 bg-pink-50 text-pink-600 dark:border-pink-500 dark:bg-pink-500/10 dark:text-pink-400"
                    : "border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100 dark:border-neutral-700 dark:bg-neutral-800/70 dark:text-neutral-300 dark:hover:bg-neutral-700"
                }`}
              >
                自适应
              </button>
              <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1 dark:border-neutral-700 dark:bg-neutral-800/70">
                <button
                  type="button"
                  onClick={() => handleColumnChange(-1)}
                  disabled={
                    isSaving ||
                    (draftGridColumns !== "auto" && draftGridColumns <= MIN_GRID_COLUMNS)
                  }
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-white hover:text-pink-600 disabled:cursor-not-allowed disabled:opacity-30 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-pink-400"
                  aria-label="减少列数"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="min-w-12 text-center text-sm font-semibold tabular-nums text-gray-800 dark:text-neutral-200">
                  {draftGridColumns === "auto" ? "自动" : `${draftGridColumns} 列`}
                </span>
                <button
                  type="button"
                  onClick={() => handleColumnChange(1)}
                  disabled={
                    isSaving ||
                    (draftGridColumns !== "auto" && draftGridColumns >= MAX_GRID_COLUMNS)
                  }
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-white hover:text-pink-600 disabled:cursor-not-allowed disabled:opacity-30 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-pink-400"
                  aria-label="增加列数"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {errorMessage && (
          <p
            role="alert"
            className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400"
          >
            {errorMessage}
          </p>
        )}

        <div className="mt-7 flex justify-end gap-3">
          <button
            type="button"
            onClick={handleClose}
            disabled={isSaving}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="rounded-lg bg-pink-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-pink-700 disabled:cursor-not-allowed disabled:bg-pink-400 dark:bg-pink-500 dark:hover:bg-pink-600 dark:disabled:bg-pink-500/50"
          >
            {isSaving ? "保存中..." : "保存设置"}
          </button>
        </div>
      </div>
    </div>
  );
};
