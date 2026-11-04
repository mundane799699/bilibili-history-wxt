import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { LAST_SEEN_UPDATE_VERSION, UPDATE_HISTORY } from "../utils/constants";
import { getStorageValue, setStorageValue } from "../utils/storage";

const latestUpdate = UPDATE_HISTORY[0];

interface UpdateNoticeModalProps {
  onOpenChange?: (open: boolean) => void;
  onReady?: () => void;
}

export const UpdateNoticeModal = ({ onOpenChange, onReady }: UpdateNoticeModalProps) => {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    let isActive = true;

    if (!latestUpdate) {
      onOpenChange?.(false);
      onReady?.();
      return undefined;
    }

    getStorageValue<string>(LAST_SEEN_UPDATE_VERSION, "")
      .then((lastSeenVersion) => {
        if (!isActive) return;

        const shouldOpen = lastSeenVersion !== latestUpdate.version;
        setIsOpen(shouldOpen);
        onOpenChange?.(shouldOpen);
      })
      .catch((error) => {
        if (!isActive) return;

        console.error("读取版本更新状态失败:", error);
        setIsOpen(true);
        onOpenChange?.(true);
      })
      .finally(() => {
        if (isActive) onReady?.();
      });

    return () => {
      isActive = false;
    };
  }, [onOpenChange, onReady]);

  const handleClose = async () => {
    try {
      if (latestUpdate) {
        await setStorageValue(LAST_SEEN_UPDATE_VERSION, latestUpdate.version);
      }
    } catch (error) {
      console.error("保存版本更新状态失败:", error);
    } finally {
      setIsOpen(false);
      onOpenChange?.(false);
    }
  };

  if (!isOpen || !latestUpdate) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-xl border border-transparent bg-white p-6 shadow-xl dark:border-night-line dark:bg-night-card">
        <button
          type="button"
          onClick={handleClose}
          className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-wash hover:text-ink-soft dark:text-night-muted dark:hover:bg-night-line/60 dark:hover:text-night-text"
          aria-label="关闭更新提示"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="pr-10">
          <p className="mb-2 text-sm font-medium text-brand dark:text-brand-strong">版本更新</p>
          <h2 className="text-xl font-bold text-ink dark:text-night-text">
            v{latestUpdate.version}
          </h2>
          <p className="mt-1 text-sm text-ink-muted dark:text-night-muted">{latestUpdate.date}</p>
        </div>

        <div className="mt-5 rounded-lg bg-wash p-4 dark:bg-night-line/70">
          <ul className="space-y-2">
            {latestUpdate.changes.map((change) => (
              <li
                key={change}
                className="flex gap-2 text-sm leading-relaxed text-ink-soft dark:text-night-text"
              >
                <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand" />
                <span>{change}</span>
              </li>
            ))}
          </ul>
        </div>

        <button
          type="button"
          onClick={handleClose}
          className="mt-6 w-full rounded-lg bg-brand dark:bg-brand-strong px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-strong"
        >
          我知道了
        </button>
      </div>
    </div>
  );
};
