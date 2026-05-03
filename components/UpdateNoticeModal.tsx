import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { LAST_SEEN_UPDATE_VERSION, UPDATE_HISTORY } from "../utils/constants";
import { getStorageValue, setStorageValue } from "../utils/storage";

const latestUpdate = UPDATE_HISTORY[0];

export const UpdateNoticeModal = () => {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!latestUpdate) {
      return;
    }

    getStorageValue<string>(LAST_SEEN_UPDATE_VERSION, "").then((lastSeenVersion) => {
      setIsOpen(lastSeenVersion !== latestUpdate.version);
    });
  }, []);

  const handleClose = async () => {
    if (latestUpdate) {
      await setStorageValue(LAST_SEEN_UPDATE_VERSION, latestUpdate.version);
    }
    setIsOpen(false);
  };

  if (!isOpen || !latestUpdate) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-xl border border-transparent bg-white p-6 shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
        <button
          type="button"
          onClick={handleClose}
          className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          aria-label="关闭更新提示"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="pr-10">
          <p className="mb-2 text-sm font-medium text-pink-500 dark:text-pink-600">版本更新</p>
          <h2 className="text-xl font-bold text-gray-900 dark:text-neutral-100">
            v{latestUpdate.version}
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-neutral-400">{latestUpdate.date}</p>
        </div>

        <div className="mt-5 rounded-lg bg-gray-50 p-4 dark:bg-neutral-800/70">
          <ul className="space-y-2">
            {latestUpdate.changes.map((change) => (
              <li
                key={change}
                className="flex gap-2 text-sm leading-relaxed text-gray-700 dark:text-neutral-200"
              >
                <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-pink-500" />
                <span>{change}</span>
              </li>
            ))}
          </ul>
        </div>

        <button
          type="button"
          onClick={handleClose}
          className="mt-6 w-full rounded-lg bg-pink-500 dark:bg-pink-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
        >
          我知道了
        </button>
      </div>
    </div>
  );
};
