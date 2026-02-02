import React, { useState, useEffect, useRef, useCallback } from "react";
import { HistoryItem } from "../components/HistoryItem";
import { getHistory, clearHistory, getTotalHistoryCount } from "../utils/db";
import { HistoryItem as HistoryItemType } from "../utils/types";
import { useDebounce } from "use-debounce";
import { RefreshCwIcon, ChevronDownIcon } from "lucide-react";

export const History: React.FC = () => {
  const [history, setHistory] = useState<HistoryItemType[]>([]);
  const [keyword, setKeyword] = useState("");
  const [authorKeyword, setAuthorKeyword] = useState("");
  const [debouncedKeyword] = useDebounce(keyword, 500);
  const [debouncedAuthorKeyword] = useDebounce(authorKeyword, 500);
  const [date, setDate] = useState("");
  const [selectedType, setSelectedType] = useState("all");
  const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [totalHistoryCount, setTotalHistoryCount] = useState(0);

  const loadMoreRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const isLoadingRef = useRef<boolean>(false);

  const typeOptions = [
    { value: "all", label: "全部分类" },
    { value: "archive", label: "视频" },
    { value: "live", label: "直播" },
    { value: "pgc", label: "番剧" },
    { value: "article", label: "专栏" },
    { value: "cheese", label: "课堂" },
  ];

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
        date,
        selectedType
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
  }, [debouncedKeyword, debouncedAuthorKeyword, date, selectedType]);

  useEffect(() => {
    getTotalCount();
  }, []);

  const getTotalCount = async () => {
    const count = await getTotalHistoryCount();
    setTotalHistoryCount(count);
  };

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
  }, [hasMore, debouncedKeyword, debouncedAuthorKeyword, date, selectedType]);

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
      <div className="flex justify-between items-center mb-5 sticky top-0 bg-white py-4 px-10 z-10 border-b border-gray-200 shadow-sm">
        <span className="text-sm font-medium text-gray-600 bg-gray-100 px-3 py-1.5 rounded-full">
          总记录数：{totalHistoryCount}
        </span>
        <div className="flex items-center gap-4">
          <div className="relative z-20">
            {/* 遮罩层，用于点击外部关闭下拉菜单 */}
            {isTypeDropdownOpen && (
              <div
                className="fixed inset-0 z-10"
                onClick={() => setIsTypeDropdownOpen(false)}
              ></div>
            )}

            {/* 触发按钮 */}
            <button
              onClick={() => setIsTypeDropdownOpen(!isTypeDropdownOpen)}
              className={`
                flex items-center justify-between gap-2 px-4 py-2 
                bg-gray-50 hover:bg-gray-100 
                border transition-all duration-200
                text-gray-700 text-sm font-medium
                rounded-lg min-w-[120px] outline-none
                ${isTypeDropdownOpen
                  ? 'border-blue-500 ring-2 ring-blue-100 bg-white'
                  : 'border-gray-200'
                }
              `}
            >
              <span>
                {typeOptions.find(opt => opt.value === selectedType)?.label || "全部分类"}
              </span>
              <ChevronDownIcon
                className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${isTypeDropdownOpen ? 'rotate-180 text-blue-500' : ''}`}
              />
            </button>

            {/* 下拉菜单 */}
            {isTypeDropdownOpen && (
              <div className="absolute top-full right-0 mt-2 w-[140px] bg-white border border-gray-100 rounded-xl shadow-xl z-30 py-1 overflow-hidden animate-in fade-in zoom-in-95 duration-100 origin-top-right">
                {typeOptions.map((option) => (
                  <div
                    key={option.value}
                    onClick={() => {
                      setSelectedType(option.value);
                      setIsTypeDropdownOpen(false);
                    }}
                    className={`
                      px-4 py-2.5 text-sm cursor-pointer transition-colors
                      flex items-center justify-between
                      ${selectedType === option.value
                        ? 'bg-blue-50 text-blue-600 font-medium'
                        : 'text-gray-700 hover:bg-gray-50'
                      }
                    `}
                  >
                    {option.label}
                    {selectedType === option.value && (
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
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
          <button
            onClick={() => {
              loadHistory(false);
              getTotalCount();
            }}
            className="p-2 border border-gray-200 rounded-full bg-gray-50 hover:bg-gray-100 disabled:bg-gray-200 disabled:cursor-not-allowed disabled:text-gray-400"
          >
            <RefreshCwIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="w-full px-6">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-6">
          {history.map((item) => (
            <HistoryItem
              key={item.id}
              item={item}
              onDelete={() => {
                // 从列表中移除被删除的项
                setHistory((prev) => prev.filter((h) => h.id !== item.id));
                getTotalCount();
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
