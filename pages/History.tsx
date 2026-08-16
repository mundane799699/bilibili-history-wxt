import React, { useState, useEffect, useRef, useCallback } from "react";
import { HistoryItem } from "../components/HistoryItem";
import { HistorySyncModal } from "../components/HistorySyncModal";
import { HistoryViewSettingsModal } from "../components/HistoryViewSettingsModal";
import type { HistoryViewSettings } from "../components/HistoryViewSettingsModal";
import { getHistory, getHistoryPage, getTotalHistoryCount } from "../utils/db";
import { HistoryItem as HistoryItemType } from "../utils/types";
import { useDebounce } from "use-debounce";
import {
  RefreshCwIcon,
  ChevronDownIcon,
  Search,
  X,
  Filter,
  CloudDownload,
  Settings2,
} from "lucide-react";
import { Pagination } from "../components/Pagination";
import {
  DATE_SELECTION_MODE,
  GRID_COLUMNS,
  HISTORY_LOAD_MODE,
  HISTORY_PAGE_SIZE,
} from "../utils/constants";
import { DateRangePicker } from "../components/DateRangePicker";
import { getStorageValue, setStorageValue } from "../utils/storage";

const DEFAULT_PAGE_SIZE = 100;

export const History: React.FC = () => {
  const [history, setHistory] = useState<HistoryItemType[]>([]);
  const [keyword, setKeyword] = useState("");
  const [debouncedKeyword] = useDebounce(keyword, 500);

  // Date Range State
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [searchType, setSearchType] = useState<"all" | "title" | "up" | "bvid" | "avid">("all");
  const [isSearchKindDropdownOpen, setIsSearchKindDropdownOpen] = useState(false);
  const [selectedType, setSelectedType] = useState("all");
  const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [totalHistoryCount, setTotalHistoryCount] = useState(0);
  const [dateSelectionMode, setDateSelectionMode] = useState<"range" | "single">("range");
  const [gridColumns, setGridColumns] = useState<number | "auto">(4);
  // null means the stored value is not loaded yet
  const [loadMode, setLoadMode] = useState<"pagination" | "scroll" | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalFiltered, setTotalFiltered] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [isViewSettingsModalOpen, setIsViewSettingsModalOpen] = useState(false);

  const loadMoreRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const isLoadingRef = useRef<boolean>(false);
  const historyRef = useRef<HistoryItemType[]>([]);
  const hasMoreRef = useRef(true);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    getStorageValue(DATE_SELECTION_MODE, "range").then((mode) => {
      setDateSelectionMode(mode as "range" | "single");
    });
    getStorageValue<number | "auto">(GRID_COLUMNS, 4).then((cols) => {
      setGridColumns(cols);
    });
    getStorageValue<number>(HISTORY_PAGE_SIZE, DEFAULT_PAGE_SIZE).then((size) => {
      setPageSize(size);
    });
    getStorageValue(HISTORY_LOAD_MODE, "pagination").then((mode) => {
      setLoadMode(mode as "pagination" | "scroll");
    });
  }, []);

  const typeOptions = [
    { value: "all", label: "全部分类" },
    { value: "archive", label: "视频" },
    { value: "live", label: "直播" },
    { value: "pgc", label: "番剧" },
    { value: "article", label: "专栏" },
    { value: "cheese", label: "课堂" },
  ];

  const loadHistory = async (isAppend: boolean = false) => {
    if (isAppend && isLoadingRef.current) {
      return false;
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
        selectedType,
        searchType,
      );

      if (isAppend) {
        setHistory((prev) => [...prev, ...items]);
      } else {
        setHistory(items);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }

      setHasMore(hasMore);
      hasMoreRef.current = hasMore;
      return true;
    } catch (error) {
      console.error("Failed to load history:", error);
      return false;
    } finally {
      setIsLoading(false);
      isLoadingRef.current = false;
    }
  };

  // 保持最新的 loadHistory 引用，避免 Observer 闭包陈旧
  const loadHistoryRef = useRef(loadHistory);
  loadHistoryRef.current = loadHistory;

  // offset-based page load for pagination mode
  const loadPage = async (page: number) => {
    if (isLoadingRef.current) {
      return false;
    }
    try {
      setIsLoading(true);
      isLoadingRef.current = true;

      const { items, total } = await getHistoryPage(
        page,
        pageSize,
        debouncedKeyword,
        { start: startDate, end: endDate },
        selectedType,
        searchType,
      );

      setHistory(items);
      window.scrollTo({ top: 0, behavior: "smooth" });
      setTotalFiltered(total);
      setCurrentPage(page);
      return true;
    } catch (error) {
      console.error("Failed to load history:", error);
      return false;
    } finally {
      setIsLoading(false);
      isLoadingRef.current = false;
    }
  };

  const reload = () => {
    if (loadMode === "pagination") {
      return loadPage(1);
    }
    if (loadMode === "scroll") {
      return loadHistory(false);
    }
    return Promise.resolve(false);
  };

  useEffect(() => {
    // wait until the stored load mode is resolved to avoid a duplicated first load
    if (loadMode === null) {
      return;
    }
    void reload();
  }, [debouncedKeyword, startDate, endDate, selectedType, searchType, loadMode, pageSize]);

  useEffect(() => {
    getTotalCount();
  }, []);

  const getTotalCount = async () => {
    const count = await getTotalHistoryCount();
    setTotalHistoryCount(count);
    return count;
  };

  const handleSyncSuccess = async () => {
    const [count, refreshed] = await Promise.all([getTotalCount(), reload()]);
    if (!refreshed) {
      throw new Error("历史记录列表刷新失败");
    }
    return count;
  };

  const handleViewSettingsSave = async (settings: HistoryViewSettings) => {
    await Promise.all([
      setStorageValue(HISTORY_LOAD_MODE, settings.loadMode),
      setStorageValue(GRID_COLUMNS, settings.gridColumns),
    ]);
    setLoadMode(settings.loadMode);
    setGridColumns(settings.gridColumns);
  };

  // Observer 只创建一次，通过 ref 访问最新状态
  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && hasMoreRef.current && !isLoadingRef.current) {
          loadHistoryRef.current(true);
        }
      },
      {
        threshold: 0.1,
        rootMargin: "200px",
      },
    );

    // callback ref 在 useEffect 之前执行，此时 loadMoreRef.current 可能已有值
    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, []);

  // callback ref：loadMore div 挂载/卸载时自动 observe/unobserve
  const loadMoreCallbackRef = useCallback((node: HTMLDivElement | null) => {
    if (loadMoreRef.current && observerRef.current) {
      observerRef.current.unobserve(loadMoreRef.current);
    }
    loadMoreRef.current = node;
    if (node && observerRef.current) {
      observerRef.current.observe(node);
    }
  }, []);

  const getLoadMoreText = () => {
    if (history.length === 0) {
      return keyword.trim() ? "没有找到匹配的历史记录" : "暂无历史记录";
    }
    return isLoading ? "加载中..." : hasMore ? "向下滚动加载更多" : "没有更多了";
  };

  return (
    <div>
      <div
        data-tour="history-toolbar"
        className="sticky top-0 bg-white/95 dark:bg-[#0a0a0a]/95 backdrop-blur-sm z-20 border-b border-gray-100 dark:border-neutral-800 shadow-sm transition-all duration-300"
      >
        <div className="flex flex-col md:flex-row items-center justify-between px-6 py-4 gap-4 max-w-[1600px] mx-auto">
          {/* 左侧：统计与筛选 */}
          <div className="flex items-center gap-4 w-full md:w-auto">
            <button
              type="button"
              onClick={() => setIsSyncModalOpen(true)}
              className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg border border-pink-200 bg-pink-50 px-3 py-1.5 text-sm font-medium text-pink-600 shadow-sm transition-colors hover:border-pink-300 hover:bg-pink-100 dark:border-pink-500/30 dark:bg-pink-500/10 dark:text-pink-400 dark:hover:border-pink-500/50 dark:hover:bg-pink-500/20"
              title="同步历史记录"
              aria-label="同步历史记录"
            >
              <CloudDownload className="h-4 w-4" />
              <span>同步历史记录</span>
            </button>

            <button
              onClick={() => {
                void Promise.all([getTotalCount(), reload()]);
              }}
              className={`p-2  rounded-full bg-pink-50 text-pink-600 dark:hover:text-pink-400 transition-all shadow-sm border border-pink-200 dark:border-pink-500/30 dark:bg-pink-500/10 dark:text-pink-400 dark:hover:border-pink-500/50 dark:hover:bg-pink-500/20 hover:rotate-180 duration-500 ${
                isLoading ? "opacity-50 cursor-not-allowed" : ""
              }`}
              disabled={isLoading}
              title="刷新"
            >
              <RefreshCwIcon className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            </button>

            <span className="text-sm font-medium text-gray-500 dark:text-neutral-400 bg-gray-50 dark:bg-neutral-900 px-3 py-1.5 rounded-full whitespace-nowrap border border-gray-100 dark:border-neutral-800">
              {totalHistoryCount} 条记录
            </span>

            <div className="relative">
              <button
                className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 dark:bg-neutral-900 hover:bg-gray-100 dark:hover:bg-neutral-800 rounded-lg text-sm text-gray-700 dark:text-neutral-200 transition-colors border border-gray-200/50 dark:border-neutral-800"
                onClick={() => setIsTypeDropdownOpen(!isTypeDropdownOpen)}
              >
                <Filter className="w-3.5 h-3.5 text-gray-500 dark:text-neutral-400" />
                <span>{typeOptions.find((opt) => opt.value === selectedType)?.label}</span>
                <ChevronDownIcon className="w-3.5 h-3.5 text-gray-400 dark:text-neutral-500" />
              </button>

              {isTypeDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setIsTypeDropdownOpen(false)}
                  ></div>
                  <div className="absolute top-full left-0 mt-1 w-32 bg-white dark:bg-neutral-900 rounded-lg shadow-lg border border-gray-100 dark:border-neutral-800 py-1 z-20 animate-in fade-in zoom-in-95 duration-200">
                    {typeOptions.map((option) => (
                      <button
                        key={option.value}
                        className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                          selectedType === option.value
                            ? "bg-pink-50 dark:bg-pink-500/10 text-pink-600 dark:text-pink-400 font-medium"
                            : "text-gray-600 dark:text-neutral-300 hover:bg-gray-50 dark:hover:bg-neutral-800"
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

          {/* 中间：搜索框 (带类型选择) */}
          <div className="flex-1 w-full md:max-w-lg px-4 flex items-center">
            <div className="relative group w-full flex items-center bg-gray-50 dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-full transition-all duration-300 shadow-sm hover:shadow-md focus-within:bg-white dark:focus-within:bg-neutral-900 focus-within:ring-2 focus-within:ring-pink-100 dark:focus-within:ring-pink-500/20 focus-within:border-pink-400 dark:focus-within:border-pink-500">
              {/* 搜索类型下拉 */}
              <div className="relative">
                <button
                  className="pl-4 pr-3 py-2 text-sm text-gray-600 dark:text-neutral-300 font-medium cursor-pointer border-r border-gray-200 dark:border-neutral-800 hover:text-pink-600 dark:hover:text-pink-400 flex items-center gap-1 transition-colors whitespace-nowrap"
                  onClick={() => setIsSearchKindDropdownOpen(!isSearchKindDropdownOpen)}
                >
                  <span>
                    {searchType === "all" && "综合"}
                    {searchType === "title" && "标题"}
                    {searchType === "up" && "UP主"}
                    {searchType === "bvid" && "BV号"}
                    {searchType === "avid" && "AV号"}
                  </span>
                  <ChevronDownIcon className="w-3 h-3 text-gray-400 dark:text-neutral-500" />
                </button>

                {isSearchKindDropdownOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setIsSearchKindDropdownOpen(false)}
                    ></div>
                    <div className="absolute top-full left-0 mt-2 w-28 bg-white dark:bg-neutral-900 rounded-lg shadow-lg border border-gray-100 dark:border-neutral-800 py-1 z-20 animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
                      {[
                        { value: "all", label: "综合搜索" },
                        { value: "title", label: "视频标题" },
                        { value: "up", label: "UP主" },
                        { value: "bvid", label: "视频BV号" },
                        { value: "avid", label: "视频AV号" },
                      ].map((option) => (
                        <button
                          key={option.value}
                          className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                            searchType === option.value
                              ? "bg-pink-50 dark:bg-pink-500/10 text-pink-600 dark:text-pink-400 font-medium"
                              : "text-gray-600 dark:text-neutral-300 hover:bg-gray-50 dark:hover:bg-neutral-800"
                          }`}
                          onClick={() => {
                            setSearchType(option.value as any);
                            setIsSearchKindDropdownOpen(false);
                          }}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              <input
                type="text"
                className="flex-1 bg-transparent border-none focus:ring-0 pl-3 pr-10 py-2 text-sm text-gray-700 dark:text-neutral-100 placeholder-gray-400 dark:placeholder-neutral-500 focus:outline-none"
                placeholder={
                  searchType === "bvid"
                    ? "输入BV号..."
                    : searchType === "avid"
                      ? "输入AV号..."
                      : searchType === "up"
                        ? "输入UP主名称或UID..."
                        : "搜索..."
                }
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />

              {keyword ? (
                <button
                  onClick={() => setKeyword("")}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 dark:text-neutral-500 hover:text-gray-600 dark:hover:text-neutral-300 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : (
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-gray-400 dark:text-neutral-500" />
                </div>
              )}
            </div>
          </div>

          {/* 右侧：日期、刷新与视图设置 */}
          <div className="flex items-center gap-3 w-full md:w-auto justify-end">
            <DateRangePicker
              startDate={startDate}
              endDate={endDate}
              onChange={(start, end) => {
                setStartDate(start);
                setEndDate(end);
              }}
              mode={dateSelectionMode}
            />

            <button
              type="button"
              onClick={() => setIsViewSettingsModalOpen(true)}
              className="rounded-full border border-gray-200 bg-white p-2 text-gray-500 shadow-sm transition-colors hover:border-pink-200 hover:bg-pink-50 hover:text-pink-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:border-pink-500/30 dark:hover:bg-pink-500/10 dark:hover:text-pink-400"
              title="历史视图设置"
              aria-label="历史视图设置"
            >
              <Settings2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div
        className="p-6 pt-2 grid gap-5 mx-auto w-full"
        style={{
          gridTemplateColumns:
            gridColumns === "auto"
              ? "repeat(auto-fill, minmax(280px, 1fr))"
              : `repeat(${gridColumns}, minmax(0, 1fr))`,
        }}
      >
        {history.map((item) => (
          <HistoryItem
            key={`${item.id}-${item.view_at}`}
            item={item}
            onDelete={() => {
              setHistory((prev) => prev.filter((i) => i.id !== item.id));
              setTotalHistoryCount((prev) => prev - 1);
            }}
          />
        ))}
        {loadMode === "scroll" && (
          <div
            ref={loadMoreCallbackRef}
            className="col-span-full py-8 text-center text-gray-500 dark:text-neutral-400 text-sm"
          >
            {getLoadMoreText()}
          </div>
        )}
      </div>

      {loadMode === "pagination" && (
        <Pagination
          currentPage={currentPage}
          totalItems={totalFiltered}
          pageSize={pageSize}
          onPageChange={loadPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setStorageValue(HISTORY_PAGE_SIZE, size);
          }}
        />
      )}

      {history.length === 0 && !isLoading && (
        <div className="text-center py-20">
          <div className="text-gray-300 dark:text-neutral-700 mb-4">
            <Search className="w-16 h-16 mx-auto opacity-50" />
          </div>
          <p className="text-gray-500 dark:text-neutral-400 text-lg">
            {keyword || startDate || selectedType !== "all" || searchType !== "all"
              ? "没有找到相关记录"
              : "暂无历史记录"}
          </p>
          {(keyword || startDate || selectedType !== "all" || searchType !== "all") && (
            <button
              onClick={() => {
                setKeyword("");
                setStartDate("");
                setEndDate("");
                setSelectedType("all");
                setSearchType("all");
              }}
              className="mt-4 text-pink-500 dark:text-pink-400 hover:text-pink-600 dark:hover:text-pink-300 hover:underline text-sm"
            >
              清除所有筛选
            </button>
          )}
        </div>
      )}

      <HistorySyncModal
        open={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        onSyncSuccess={handleSyncSuccess}
      />

      <HistoryViewSettingsModal
        open={isViewSettingsModalOpen}
        loadMode={loadMode ?? "pagination"}
        gridColumns={gridColumns}
        onClose={() => setIsViewSettingsModalOpen(false)}
        onSave={handleViewSettingsSave}
      />
    </div>
  );
};
