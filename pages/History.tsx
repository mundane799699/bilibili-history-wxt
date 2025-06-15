import React, { useState, useEffect, useRef, useCallback } from "react";
import { HistoryItem } from "../components/HistoryItem";
import { getHistory, clearHistory } from "../utils/db";
import { HistoryItem as HistoryItemType } from "../utils/types";
import { useDebounce } from "use-debounce";

export const History: React.FC = () => {
  const [history, setHistory] = useState<HistoryItemType[]>([]);
  const [keyword, setKeyword] = useState("");
  const [authorKeyword, setAuthorKeyword] = useState("");
  const [debouncedKeyword] = useDebounce(keyword, 500);
  const [debouncedAuthorKeyword] = useDebounce(authorKeyword, 500);
  const [date, setDate] = useState("");
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  const loadMoreRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const isLoadingRef = useRef<boolean>(false);

  const loadHistory = async (isAppend: boolean = false) => {
    if (isLoadingRef.current) {
      return;
    }

    try {
      setIsLoading(true);
      isLoadingRef.current = true;

      // 使用函数式更新来获取最新的history值
      const lastViewTime = isAppend
        ? await new Promise<number | "">((resolve) => {
            setHistory((currentHistory) => {
              const lastTime =
                currentHistory.length > 0
                  ? currentHistory[currentHistory.length - 1].view_at
                  : "";
              resolve(lastTime);
              return currentHistory;
            });
          })
        : "";

      const { items, hasMore } = await getHistory(
        lastViewTime,
        100,
        debouncedKeyword,
        debouncedAuthorKeyword,
        date
      );

      if (isAppend) {
        setHistory((prev) => [...prev, ...items]);
      } else {
        setHistory(items);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }

      setHasMore(hasMore);
    } catch (error) {
      console.error("Failed to load history:", error);
    } finally {
      setIsLoading(false);
      isLoadingRef.current = false;
    }
  };

  // 当debouncedKeyword或debouncedAuthorKeyword变化时重新加载数据
  useEffect(() => {
    loadHistory(false);
  }, [debouncedKeyword, debouncedAuthorKeyword, date]);

  useEffect(() => {
    const options = {
      threshold: 0.1,
      rootMargin: "200px",
    };
    // 设置Intersection Observer
    observerRef.current = new IntersectionObserver((entries) => {
      const [entry] = entries;
      if (entry.isIntersecting && hasMore && !isLoadingRef.current) {
        // 闭包陷阱，这个函数会捕获第一次渲染时的history值
        // debouncedKeyword也是一样的问题
        loadHistory(true);
      }
    }, options);

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [hasMore, debouncedKeyword, debouncedAuthorKeyword, date]);

  const getLoadMoreText = () => {
    if (history.length === 0) {
      return keyword.trim() ? "没有找到匹配的历史记录" : "暂无历史记录";
    }
    return isLoading
      ? "加载中..."
      : hasMore
      ? "向下滚动加载更多"
      : "没有更多了";
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-5 sticky top-0 bg-white py-4 px-10 z-10 border-b border-gray-200">
        <a
          href="https://bilibilihistory.com"
          target="_blank"
          className="text-2xl font-bold text-pink-400 hover:text-pink-500"
        >
          Bilibili 无限历史记录
        </a>
        <div className="flex items-center">
          <div className="flex items-center mr-2 gap-2">
            <button
              className="px-3 py-2 border border-gray-200 rounded-l bg-gray-50 hover:bg-gray-100 disabled:bg-gray-200 disabled:cursor-not-allowed disabled:text-gray-400"
              disabled={!date}
              onClick={() => {
                if (date) {
                  const currentDate = new Date(date);
                  currentDate.setDate(currentDate.getDate() - 1);
                  setDate(currentDate.toISOString().split("T")[0]);
                }
              }}
            >
              -
            </button>
            <input
              type="date"
              className="px-2 py-2 border border-gray-200"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
              }}
            />
            <button
              className="px-3 py-2 border border-gray-200 rounded-r bg-gray-50 hover:bg-gray-100 disabled:bg-gray-200 disabled:cursor-not-allowed disabled:text-gray-400"
              disabled={!date}
              onClick={() => {
                if (date) {
                  const currentDate = new Date(date);
                  currentDate.setDate(currentDate.getDate() + 1);
                  setDate(currentDate.toISOString().split("T")[0]);
                }
              }}
            >
              +
            </button>
          </div>
          <div className="relative mr-2">
            <input
              type="text"
              className="w-[200px] px-2 py-2 border border-gray-200 rounded"
              placeholder="搜索UP主..."
              value={authorKeyword}
              onChange={(e) => setAuthorKeyword(e.target.value)}
            />
            {authorKeyword && (
              <button
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-full p-1 transition-colors"
                onClick={() => setAuthorKeyword("")}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}
          </div>
          <div className="relative mr-2">
            <input
              type="text"
              className="w-[300px] px-2 py-2 border border-gray-200 rounded"
              placeholder="搜索标题..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
            {keyword && (
              <button
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-full p-1 transition-colors"
                onClick={() => setKeyword("")}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="max-w-[1200px] mx-auto">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-5">
          {history.map((item) => (
            <HistoryItem
              key={item.id}
              item={item}
              onDelete={() => {
                // 从列表中移除被删除的项
                setHistory((prev) => prev.filter((h) => h.id !== item.id));
              }}
            />
          ))}
        </div>
        <div ref={loadMoreRef} className="text-center my-8">
          {getLoadMoreText()}
        </div>
      </div>
    </div>
  );
};
