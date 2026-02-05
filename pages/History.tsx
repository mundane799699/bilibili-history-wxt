import React, { useState, useEffect, useRef } from "react";
import { HistoryItem } from "../components/HistoryItem";
import { getHistory, getTotalHistoryCount } from "../utils/db";
import { HistoryItem as HistoryItemType } from "../utils/types";
import { useDebounce } from "use-debounce";
import {
  RefreshCwIcon,
  ChevronDownIcon,
  Search,
  X,
  Filter,
} from "lucide-react";
import { DateRangePicker } from "../components/DateRangePicker";

export const History: React.FC = () => {
  const [history, setHistory] = useState<HistoryItemType[]>([]);
  const [keyword, setKeyword] = useState("");
  const [debouncedKeyword] = useDebounce(keyword, 500);

  // Date Range State
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [selectedType, setSelectedType] = useState("all");
  const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [totalHistoryCount, setTotalHistoryCount] = useState(0);

  const loadMoreRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const isLoadingRef = useRef<boolean>(false);
  const historyRef = useRef<HistoryItemType[]>([]);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

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

      let lastViewTime: number | "" = "";
      if (isAppend && historyRef.current.length > 0) {
        lastViewTime = historyRef.current[historyRef.current.length - 1].view_at;
      }

      const { items, hasMore } = await getHistory(
        lastViewTime,
        100,
        debouncedKeyword,
        { start: startDate, end: endDate },
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

  useEffect(() => {
    loadHistory(false);
  }, [debouncedKeyword, startDate, endDate, selectedType]);

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
    observerRef.current = new IntersectionObserver((entries) => {
      const [entry] = entries;
      if (entry.isIntersecting && hasMore && !isLoadingRef.current) {
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
  }, [hasMore, debouncedKeyword, startDate, endDate, selectedType]);

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
      <div className="sticky top-0 bg-white/95 backdrop-blur-sm z-20 border-b border-gray-100 shadow-sm transition-all duration-300">
        <div className="flex flex-col md:flex-row items-center justify-between px-6 py-4 gap-4 max-w-[1600px] mx-auto">

          {/* 左侧：统计与筛选 */}
          <div className="flex items-center gap-4 w-full md:w-auto">
            <span className="text-sm font-medium text-gray-500 bg-gray-50 px-3 py-1.5 rounded-full whitespace-nowrap border border-gray-100">
              {totalHistoryCount} 条记录
            </span>

            <div className="relative">
              <button
                className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 rounded-lg text-sm text-gray-700 transition-colors border border-gray-200/50"
                onClick={() => setIsTypeDropdownOpen(!isTypeDropdownOpen)}
              >
                <Filter className="w-3.5 h-3.5 text-gray-500" />
                <span>
                  {typeOptions.find((opt) => opt.value === selectedType)?.label}
                </span>
                <ChevronDownIcon className="w-3.5 h-3.5 text-gray-400" />
              </button>

              {isTypeDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setIsTypeDropdownOpen(false)}
                  ></div>
                  <div className="absolute top-full left-0 mt-1 w-32 bg-white rounded-lg shadow-lg border border-gray-100 py-1 z-20 animate-in fade-in zoom-in-95 duration-200">
                    {typeOptions.map((option) => (
                      <button
                        key={option.value}
                        className={`w-full text-left px-4 py-2 text-sm transition-colors ${selectedType === option.value
                          ? "bg-blue-50 text-blue-600 font-medium"
                          : "text-gray-600 hover:bg-gray-50"
                          }`}
                        onClick={() => {
                          setSelectedType(option.value);
                          setIsTypeDropdownOpen(false);
                        }}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* 中间：搜索框 (二合一) */}
          <div className="flex-1 w-full md:max-w-xl px-4">
            <div className="relative group w-full transition-all duration-300 transform hover:scale-[1.01]">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
              </div>
              <input
                type="text"
                className="block w-full pl-10 pr-10 py-2 bg-gray-50 border border-gray-200 rounded-full text-sm placeholder-gray-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all shadow-sm group-hover:shadow-md"
                placeholder="搜索视频标题或UP主..."
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
              {keyword && (
                <button
                  onClick={() => setKeyword("")}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* 右侧：日期与刷新 */}
          <div className="flex items-center gap-3 w-full md:w-auto justify-end">
            <DateRangePicker
              startDate={startDate}
              endDate={endDate}
              onChange={(start, end) => {
                setStartDate(start);
                setEndDate(end);
              }}
            />

            <button
              onClick={() => {
                getTotalCount();
                loadHistory(false);
              }}
              className={`p-2 bg-white text-gray-500 rounded-full hover:bg-blue-50 hover:text-blue-600 transition-all shadow-sm border border-gray-200 hover:border-blue-200 hover:rotate-180 duration-500 ${isLoading ? "opacity-50 cursor-not-allowed" : ""
                }`}
              disabled={isLoading}
              title="刷新"
            >
              <RefreshCwIcon className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            </button>
          </div>

        </div>
      </div>

      <div className="p-6 pt-2 grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-6 max-w-[1600px] mx-auto">
        {history.map((item) => (
          <HistoryItem key={`${item.id}-${item.view_at}`} item={item} />
        ))}
        {history.length > 0 && (
          <div
            ref={loadMoreRef}
            className="col-span-full py-8 text-center text-gray-500 text-sm"
          >
            {getLoadMoreText()}
          </div>
        )}
      </div>

      {history.length === 0 && !isLoading && (
        <div className="text-center py-20">
          <div className="text-gray-300 mb-4">
            <Search className="w-16 h-16 mx-auto opacity-50" />
          </div>
          <p className="text-gray-500 text-lg">
            {keyword || startDate || selectedType !== 'all' ? "没有找到相关记录" : "暂无历史记录"}
          </p>
          {(keyword || startDate || selectedType !== 'all') && (
            <button
              onClick={() => {
                setKeyword("");
                setStartDate("");
                setEndDate("");
                setSelectedType("all");
              }}
              className="mt-4 text-blue-500 hover:text-blue-600 hover:underline text-sm"
            >
              清除所有筛选
            </button>
          )}
        </div>
      )}
    </div>
  );
};
