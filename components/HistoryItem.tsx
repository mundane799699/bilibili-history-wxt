import { HistoryDisplayMode, HistoryEvent, HistoryListItem } from "../utils/types";
import { formatDuration, getContentUrl, getTypeTag } from "../utils/common";
import { LoaderCircle, Trash2 } from "lucide-react";
import { checkIsFavorited, deleteHistoryContent, deleteHistoryEvent } from "../utils/db";
import React, { useState, useEffect } from "react";
import { getStorageValue } from "../utils/storage";
import { toast } from "react-hot-toast";
import { IS_SYNC_DELETE } from "../utils/constants";

interface HistoryItemProps {
  item: HistoryListItem;
  displayMode: HistoryDisplayMode;
  onDelete?: () => void | Promise<void>;
}

const historyDateFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const deleteBilibiliHistory = async (business: string, id: number): Promise<void> => {
  // 从background script获取cookie
  const cookies = await new Promise<Browser.cookies.Cookie[]>((resolve, reject) => {
    browser.runtime.sendMessage({ action: "getCookies" }, (response) => {
      if (browser.runtime.lastError) {
        reject(browser.runtime.lastError);
        return;
      }
      if (response.success) {
        resolve(response.cookies);
      } else {
        reject(new Error(response.error));
      }
    });
  });

  const bili_jct = cookies.find((cookie) => cookie.name === "bili_jct")?.value;
  const SESSDATA = cookies.find((cookie) => cookie.name === "SESSDATA")?.value;

  if (!bili_jct || !SESSDATA) {
    throw new Error("未找到必要的Cookie,请先登录B站");
  }

  const kid = `${business}_${id}`;
  const response = await fetch("https://api.bilibili.com/x/v2/history/delete", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `kid=${kid}&csrf=${bili_jct}`,
  });

  if (!response.ok) {
    throw new Error(`删除 B 站历史记录失败：${response.statusText || response.status}`);
  }

  const data = await response.json();
  if (data.code !== 0) {
    throw new Error(data.message || "删除 B 站历史记录失败");
  }
};

export const HistoryItem: React.FC<HistoryItemProps> = ({ item, displayMode, onDelete }) => {
  const [isFav, setIsFav] = useState(item.is_fav === true);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (item.is_fav === true) return;
    checkIsFavorited(item.id).then((res) => setIsFav(res));
  }, [item.id, item.is_fav]);

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isDeleting) return;

    try {
      setIsDeleting(true);
      if (displayMode === "visit") {
        if (!("event_id" in item)) throw new Error("观看事件信息不完整");
        await deleteHistoryEvent(item as HistoryEvent);
        await onDelete?.();
        return;
      }

      const isSyncDelete = await getStorageValue(IS_SYNC_DELETE, true);
      if (isSyncDelete) {
        // 先删除B站服务器上的历史记录
        await deleteBilibiliHistory(item.business, item.id);
        console.log("删除B站服务器上的历史记录成功");
      }
      await deleteHistoryContent(item.business, item.id);
      await onDelete?.();
    } catch (error) {
      console.error("删除历史记录失败:", error);
      toast.error(error instanceof Error ? error.message : "删除历史记录失败");
    } finally {
      setIsDeleting(false);
    }
  };

  const getProgressText = () => {
    if (item.progress === -1) return "100%"; // Should not be called if progress is -1 for this text
    if (
      item.progress === undefined ||
      item.duration === undefined ||
      item.progress === null ||
      item.duration === null ||
      item.duration === 0
    )
      return "";
    const percentage = Math.min(100, Math.round((item.progress / item.duration) * 100));
    return `${formatDuration(item.progress)} / ${formatDuration(item.duration)} · ${percentage}%`;
  };

  const contentUrl = getContentUrl(item);
  const deleteLabel = displayMode === "visit" ? "删除本次本地观看记录" : "删除该内容的全部记录";
  const viewDate = new Date(item.view_at * 1000);
  const hasValidViewDate = !Number.isNaN(viewDate.getTime());
  const formattedViewAt = hasValidViewDate ? historyDateFormatter.format(viewDate) : "时间未知";

  return (
    <article
      className={`history-card group overflow-hidden rounded-xl border bg-white transition-[border-color,transform,opacity] duration-200 hover:-translate-y-0.5 hover:border-pink-200 focus-within:border-pink-300 dark:bg-neutral-900 dark:hover:border-pink-500/40 dark:focus-within:border-pink-500/50 ${
        isDeleting
          ? "pointer-events-none border-gray-200 opacity-60 dark:border-neutral-800"
          : "border-gray-200 dark:border-neutral-800"
      }`}
      aria-busy={isDeleting}
    >
      <a
        href={contentUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="relative block aspect-video overflow-hidden bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-pink-500 dark:bg-neutral-800"
        aria-label={`打开：${item.title || "未命名内容"}`}
      >
        <img
          src={`${item.cover}@760w_428h_1c.avif`}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.02] motion-reduce:transition-none"
          onError={(event) => {
            const image = event.currentTarget;
            if (image.dataset.fallbackApplied) {
              image.style.display = "none";
              return;
            }
            image.dataset.fallbackApplied = "true";
            image.src = item.cover;
          }}
        />

        {item.progress !== -1 && (item.progress ?? 0) > 0 && (item.duration ?? 0) > 0 && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-black/35">
            <div
              className="h-full bg-pink-500"
              style={{
                width: `${Math.min(100, ((item.progress || 0) / (item.duration || 1)) * 100)}%`,
              }}
            />
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-2 bottom-2 flex items-end justify-between gap-2">
          {item.progress !== -1 && (item.progress ?? 0) > 0 && (item.duration ?? 0) > 0 ? (
            <span className="rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white backdrop-blur-sm">
              {getProgressText()}
            </span>
          ) : (
            <span />
          )}
          {getTypeTag(item.business) !== "视频" && (
            <span className="rounded-md bg-pink-500 px-2 py-1 text-xs font-medium text-white">
              {getTypeTag(item.business)}
            </span>
          )}
        </div>

        {item.progress === -1 && (
          <span className="absolute left-2 top-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
            已看完
          </span>
        )}

        {isFav && (
          <span className="absolute right-2 top-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
            已收藏
          </span>
        )}
      </a>

      <div className="p-3.5">
        <div className="flex items-start gap-2">
          <a
            href={contentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="min-w-0 flex-1 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
          >
            <h3
              className="line-clamp-2 min-h-10 text-sm font-medium leading-5 text-gray-900 transition-colors hover:text-pink-700 dark:text-neutral-100 dark:hover:text-pink-300"
              title={item.title || "未命名内容"}
            >
              {item.title || "未命名内容"}
            </h3>
          </a>
          <button
            type="button"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:cursor-wait dark:text-neutral-400 dark:hover:bg-red-500/10 dark:hover:text-red-300"
            onClick={handleDelete}
            disabled={isDeleting}
            title={deleteLabel}
            aria-label={isDeleting ? "正在删除历史记录" : deleteLabel}
          >
            {isDeleting ? (
              <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </button>
        </div>

        <div className="mt-2 flex min-w-0 items-center justify-between gap-3 text-xs text-gray-500 dark:text-neutral-400">
          <a
            href={`https://space.bilibili.com/${item.author_mid}`}
            target="_blank"
            rel="noopener noreferrer"
            className="min-w-0 truncate rounded-sm transition-colors hover:text-pink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 dark:hover:text-pink-300"
            title={item.author_name || "未知 UP 主"}
          >
            {item.author_name || "未知 UP 主"}
          </a>
          <time
            className="shrink-0 whitespace-nowrap tabular-nums"
            dateTime={hasValidViewDate ? viewDate.toISOString() : undefined}
            title={hasValidViewDate ? viewDate.toLocaleString() : "时间信息不可用"}
          >
            {formattedViewAt}
          </time>
        </div>
      </div>
    </article>
  );
};
