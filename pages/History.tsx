import React, { useState, useEffect, useRef, useCallback } from "react";
import { HistoryItem } from "../components/HistoryItem";
import { HistorySyncModal } from "../components/HistorySyncModal";
import { HistoryViewSettingsModal } from "../components/HistoryViewSettingsModal";
import type { HistoryViewSettings } from "../components/HistoryViewSettingsModal";
import { getHistory, getHistoryPage, getTotalHistoryCount } from "../utils/db";
import { HistoryDisplayMode, HistoryEvent, HistoryListItem } from "../utils/types";
import { useDebounce } from "use-debounce";
import {
  RefreshCwIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  Search,
  X,
  Filter,
  CloudDownload,
  Settings2,
  AlertCircle,
  LoaderCircle,
} from "lucide-react";
import { Pagination } from "../components/Pagination";
import {
  DATE_SELECTION_MODE,
  GRID_COLUMNS,
  HISTORY_DISPLAY_MODE,
  HISTORY_LOAD_MODE,
  HISTORY_PAGE_SIZE,
  HISTORY_TOOLBAR_EXPANDED,
} from "../utils/constants";
import { DateRangePicker } from "../components/DateRangePicker";
import { getStorageValue, setStorageValue } from "../utils/storage";

const DEFAULT_PAGE_SIZE = 100;

const getHistoryItemKey = (item: HistoryListItem) =>
  "event_id" in item ? item.event_id : `${item.business}:${item.id}`;

const HistoryCardSkeleton = () => (
  <div
    className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
    aria-hidden="true"
  >
    <div className="aspect-video animate-pulse bg-gray-200 motion-reduce:animate-none dark:bg-neutral-800" />
    <div className="space-y-3 p-3.5">
      <div className="h-4 w-11/12 animate-pulse rounded bg-gray-200 motion-reduce:animate-none dark:bg-neutral-800" />
      <div className="h-4 w-7/12 animate-pulse rounded bg-gray-200 motion-reduce:animate-none dark:bg-neutral-800" />
      <div className="flex justify-between pt-1">
        <div className="h-3 w-20 animate-pulse rounded bg-gray-100 motion-reduce:animate-none dark:bg-neutral-800" />
        <div className="h-3 w-28 animate-pulse rounded bg-gray-100 motion-reduce:animate-none dark:bg-neutral-800" />
      </div>
    </div>
  </div>
);

export const History: React.FC = () => {
  const [history, setHistory] = useState<HistoryListItem[]>([]);
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
  const [displayMode, setDisplayMode] = useState<HistoryDisplayMode>("content");
  // null means the stored value is not loaded yet
  const [loadMode, setLoadMode] = useState<"pagination" | "scroll" | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalFiltered, setTotalFiltered] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [isViewSettingsModalOpen, setIsViewSettingsModalOpen] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [isToolbarExpanded, setIsToolbarExpanded] = useState(true);

  const loadMoreRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const isLoadingRef = useRef<boolean>(false);
  const historyRef = useRef<HistoryListItem[]>([]);
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
    getStorageValue<HistoryDisplayMode>(HISTORY_DISPLAY_MODE, "content").then((mode) => {
      setDisplayMode(mode === "visit" ? "visit" : "content");
    });
    getStorageValue(HISTORY_TOOLBAR_EXPANDED, true).then(setIsToolbarExpanded);
  }, []);

  useEffect(() => {
    if (!isSearchKindDropdownOpen && !isTypeDropdownOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setIsSearchKindDropdownOpen(false);
      setIsTypeDropdownOpen(false);
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isSearchKindDropdownOpen, isTypeDropdownOpen]);

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
      setLoadError("");

      let cursor = null;
      if (isAppend && historyRef.current.length > 0) {
        const lastItem = historyRef.current[historyRef.current.length - 1];
        cursor = {
          view_at: lastItem.view_at,
          event_id: "event_id" in lastItem ? lastItem.event_id : undefined,
          id: lastItem.id,
        };
      }

      const { items, hasMore } = await getHistory(
        cursor,
        100,
        debouncedKeyword,
        { start: startDate, end: endDate },
        selectedType,
        searchType,
        displayMode,
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
      setLoadError("历史记录加载失败，请检查本地数据后重试。");
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
      setLoadError("");

      const { items, total } = await getHistoryPage(
        page,
        pageSize,
        debouncedKeyword,
        { start: startDate, end: endDate },
        selectedType,
        searchType,
        displayMode,
      );

      setHistory(items);
      window.scrollTo({ top: 0, behavior: "smooth" });
      setTotalFiltered(total);
      setCurrentPage(page);
      return true;
    } catch (error) {
      console.error("Failed to load history:", error);
      setLoadError("历史记录加载失败，请检查本地数据后重试。");
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
  }, [
    debouncedKeyword,
    startDate,
    endDate,
    selectedType,
    searchType,
    loadMode,
    pageSize,
    displayMode,
  ]);

  useEffect(() => {
    void getTotalCount().catch((error) => {
      console.error("Failed to load history count:", error);
      setLoadError("历史记录数量读取失败，请刷新后重试。");
    });
  }, [displayMode]);

  const getTotalCount = async () => {
    const count = await getTotalHistoryCount(displayMode);
    setTotalHistoryCount(count);
    return count;
  };

  const handleRefresh = async () => {
    try {
      await Promise.all([getTotalCount(), reload()]);
    } catch (error) {
      console.error("Failed to refresh history:", error);
      setLoadError("历史记录刷新失败，请稍后重试。");
    }
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

  const handleDisplayModeChange = async (mode: HistoryDisplayMode) => {
    if (mode === displayMode) return;
    await setStorageValue(HISTORY_DISPLAY_MODE, mode);
    setCurrentPage(1);
    setHistory([]);
    historyRef.current = [];
    setDisplayMode(mode);
  };

  const handleHistoryDelete = (deletedItem: HistoryListItem) => {
    const deletedKey = getHistoryItemKey(deletedItem);

    // The database is already updated by HistoryItem. Remove only the deleted card here instead
    // of reloading the list, which would reset the current page and scroll position.
    setHistory((items) => items.filter((item) => getHistoryItemKey(item) !== deletedKey));
    setTotalHistoryCount((count) => Math.max(0, count - 1));
    setTotalFiltered((count) => Math.max(0, count - 1));
  };

  const handleToolbarToggle = () => {
    const nextExpanded = !isToolbarExpanded;
    setIsToolbarExpanded(nextExpanded);
    setIsSearchKindDropdownOpen(false);
    setIsTypeDropdownOpen(false);
    void setStorageValue(HISTORY_TOOLBAR_EXPANDED, nextExpanded).catch((error) => {
      console.error("Failed to save history toolbar state:", error);
    });
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

  const hasActiveFilters =
    Boolean(keyword || startDate || endDate) || selectedType !== "all" || searchType !== "all";
  const isInitialLoading = loadMode === null || (isLoading && history.length === 0);

  return (
    <main className="min-h-screen bg-gray-50/70 pb-10 text-gray-900 dark:bg-[#0a0a0a] dark:text-neutral-100">
      <header
        data-tour="history-toolbar"
        className="sticky top-0 z-30 border-b border-gray-200/80 bg-white/95 backdrop-blur-md dark:border-neutral-800 dark:bg-[#0a0a0a]/95"
      >
        <div className="mx-auto max-w-[1600px] px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h1 className="text-xl font-semibold tracking-[-0.02em] text-gray-950 dark:text-white sm:text-2xl">
                  历史记录
                </h1>
                <span className="whitespace-nowrap text-sm tabular-nums text-gray-500 dark:text-neutral-400">
                  {totalHistoryCount} {displayMode === "visit" ? "次观看" : "个内容"}
                </span>
              </div>
              <p className="mt-1 hidden text-sm text-gray-500 dark:text-neutral-400 sm:block">
                搜索、筛选并管理你的本地观看记录
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsSyncModalOpen(true)}
                className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-lg bg-pink-500 px-3.5 text-sm font-medium text-white transition-colors hover:bg-pink-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2 dark:bg-pink-500 dark:hover:bg-pink-400 dark:hover:text-neutral-950 dark:focus-visible:ring-offset-[#0a0a0a]"
              >
                <CloudDownload className="h-4 w-4" />
                <span className="hidden sm:inline">同步记录</span>
              </button>
              <button
                type="button"
                onClick={() => void handleRefresh()}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition-colors hover:border-pink-200 hover:bg-pink-50 hover:text-pink-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:border-pink-500/40 dark:hover:bg-pink-500/10 dark:hover:text-pink-400 dark:focus-visible:ring-offset-[#0a0a0a]"
                disabled={isLoading}
                title="刷新历史记录"
                aria-label="刷新历史记录"
              >
                <RefreshCwIcon
                  className={`h-4 w-4 ${isLoading ? "animate-spin motion-reduce:animate-none" : ""}`}
                />
              </button>
              <button
                type="button"
                onClick={() => setIsViewSettingsModalOpen(true)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition-colors hover:border-pink-200 hover:bg-pink-50 hover:text-pink-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:border-pink-500/40 dark:hover:bg-pink-500/10 dark:hover:text-pink-400 dark:focus-visible:ring-offset-[#0a0a0a]"
                title="历史视图设置"
                aria-label="历史视图设置"
              >
                <Settings2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleToolbarToggle}
                className={`relative inline-flex h-10 w-10 items-center justify-center rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#0a0a0a] ${
                  isToolbarExpanded
                    ? "border-gray-200 bg-white text-gray-600 hover:border-pink-200 hover:bg-pink-50 hover:text-pink-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:border-pink-500/40 dark:hover:bg-pink-500/10 dark:hover:text-pink-400"
                    : "border-pink-200 bg-pink-50 text-pink-700 hover:bg-pink-100 dark:border-pink-500/30 dark:bg-pink-500/10 dark:text-pink-300 dark:hover:bg-pink-500/20"
                }`}
                title={isToolbarExpanded ? "收起搜索与筛选" : "展开搜索与筛选"}
                aria-label={isToolbarExpanded ? "收起搜索与筛选" : "展开搜索与筛选"}
                aria-expanded={isToolbarExpanded}
                aria-controls="history-toolbar-filters"
              >
                {isToolbarExpanded ? (
                  <ChevronUpIcon className="h-4 w-4" />
                ) : (
                  <ChevronDownIcon className="h-4 w-4" />
                )}
                {!isToolbarExpanded && hasActiveFilters && (
                  <span
                    className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-pink-500"
                    aria-hidden="true"
                  />
                )}
              </button>
            </div>
          </div>

          <div
            id="history-toolbar-filters"
            className={`grid transition-[grid-template-rows,opacity,margin] duration-200 ease-out motion-reduce:transition-none ${
              isToolbarExpanded
                ? "mt-4 grid-rows-[1fr] opacity-100"
                : "mt-0 grid-rows-[0fr] opacity-0"
            }`}
            aria-hidden={!isToolbarExpanded}
            inert={!isToolbarExpanded}
          >
            <div className="min-h-0 overflow-hidden">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
                <div
                  className="group relative flex h-10 min-w-0 flex-1 items-center rounded-lg border border-gray-200 bg-gray-50 transition-colors focus-within:border-pink-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-pink-100 dark:border-neutral-700 dark:bg-neutral-900 dark:focus-within:border-pink-500 dark:focus-within:ring-pink-500/20"
                  role="search"
                >
                  <div className="relative h-full shrink-0">
                    <button
                      type="button"
                      className="flex h-full items-center gap-1.5 whitespace-nowrap border-r border-gray-200 px-3 text-sm font-medium text-gray-700 transition-colors hover:text-pink-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-pink-500 dark:border-neutral-700 dark:text-neutral-300 dark:hover:text-pink-400"
                      onClick={() => {
                        setIsSearchKindDropdownOpen(!isSearchKindDropdownOpen);
                        setIsTypeDropdownOpen(false);
                      }}
                      aria-expanded={isSearchKindDropdownOpen}
                      aria-haspopup="menu"
                    >
                      <span>
                        {searchType === "all" && "综合"}
                        {searchType === "title" && "标题"}
                        {searchType === "up" && "UP主"}
                        {searchType === "bvid" && "BV号"}
                        {searchType === "avid" && "AV号"}
                      </span>
                      <ChevronDownIcon className="h-3.5 w-3.5 text-gray-400 dark:text-neutral-500" />
                    </button>

                    {isSearchKindDropdownOpen && (
                      <>
                        <div
                          className="fixed inset-0 z-10 cursor-default"
                          onClick={() => setIsSearchKindDropdownOpen(false)}
                        />
                        <div
                          className="absolute left-0 top-full z-20 mt-2 w-32 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-[0_10px_30px_rgba(15,23,42,0.12)] dark:border-neutral-700 dark:bg-neutral-900"
                          role="menu"
                        >
                          {[
                            { value: "all", label: "综合搜索" },
                            { value: "title", label: "视频标题" },
                            { value: "up", label: "UP主" },
                            { value: "bvid", label: "视频BV号" },
                            { value: "avid", label: "视频AV号" },
                          ].map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              role="menuitemradio"
                              aria-checked={searchType === option.value}
                              className={`w-full px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-pink-500 ${
                                searchType === option.value
                                  ? "bg-pink-50 font-medium text-pink-700 dark:bg-pink-500/10 dark:text-pink-300"
                                  : "text-gray-700 hover:bg-gray-50 dark:text-neutral-300 dark:hover:bg-neutral-800"
                              }`}
                              onClick={() => {
                                setSearchType(
                                  option.value as "all" | "title" | "up" | "bvid" | "avid",
                                );
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

                  <Search className="ml-3 h-4 w-4 shrink-0 text-gray-400 dark:text-neutral-500" />
                  <input
                    type="search"
                    className="history-search-input h-full min-w-0 flex-1 border-none bg-transparent px-2.5 pr-10 text-sm text-gray-800 placeholder:text-gray-500 focus:outline-none focus:ring-0 dark:text-neutral-100 dark:placeholder:text-neutral-500"
                    aria-label="搜索历史记录"
                    placeholder={
                      searchType === "bvid"
                        ? "输入 BV 号"
                        : searchType === "avid"
                          ? "输入 AV 号"
                          : searchType === "up"
                            ? "输入 UP 主名称或 UID"
                            : "搜索标题、UP 主或视频编号"
                    }
                    value={keyword}
                    onChange={(event) => setKeyword(event.target.value)}
                  />

                  {keyword && (
                    <button
                      type="button"
                      onClick={() => setKeyword("")}
                      className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-gray-500 transition-colors hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-pink-500 dark:text-neutral-400 dark:hover:text-neutral-100"
                      aria-label="清除搜索内容"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div
                    className="inline-flex h-10 shrink-0 items-center rounded-lg border border-gray-200 bg-gray-100 p-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                    role="group"
                    aria-label="历史记录显示方式"
                  >
                    {(
                      [
                        { value: "content", label: "按视频" },
                        { value: "visit", label: "按观看" },
                      ] as const
                    ).map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => void handleDisplayModeChange(option.value)}
                        aria-pressed={displayMode === option.value}
                        className={`h-8 rounded-md px-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 ${
                          displayMode === option.value
                            ? "bg-white font-medium text-pink-700 shadow-sm dark:bg-neutral-800 dark:text-pink-300"
                            : "text-gray-600 hover:text-gray-950 dark:text-neutral-400 dark:hover:text-white"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>

                  <div className="relative">
                    <button
                      type="button"
                      className="flex h-10 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 transition-colors hover:border-pink-200 hover:bg-pink-50 hover:text-pink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:border-pink-500/40 dark:hover:bg-pink-500/10 dark:hover:text-pink-300 dark:focus-visible:ring-offset-[#0a0a0a]"
                      onClick={() => {
                        setIsTypeDropdownOpen(!isTypeDropdownOpen);
                        setIsSearchKindDropdownOpen(false);
                      }}
                      aria-expanded={isTypeDropdownOpen}
                      aria-haspopup="menu"
                    >
                      <Filter className="h-4 w-4" />
                      <span>
                        {typeOptions.find((option) => option.value === selectedType)?.label}
                      </span>
                      <ChevronDownIcon className="h-3.5 w-3.5 text-gray-400 dark:text-neutral-500" />
                    </button>

                    {isTypeDropdownOpen && (
                      <>
                        <div
                          className="fixed inset-0 z-10 cursor-default"
                          onClick={() => setIsTypeDropdownOpen(false)}
                        />
                        <div
                          className="absolute left-0 top-full z-20 mt-2 w-32 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-[0_10px_30px_rgba(15,23,42,0.12)] dark:border-neutral-700 dark:bg-neutral-900"
                          role="menu"
                        >
                          {typeOptions.map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              role="menuitemradio"
                              aria-checked={selectedType === option.value}
                              className={`w-full px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-pink-500 ${
                                selectedType === option.value
                                  ? "bg-pink-50 font-medium text-pink-700 dark:bg-pink-500/10 dark:text-pink-300"
                                  : "text-gray-700 hover:bg-gray-50 dark:text-neutral-300 dark:hover:bg-neutral-800"
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

                  <DateRangePicker
                    startDate={startDate}
                    endDate={endDate}
                    onChange={(start, end) => {
                      setStartDate(start);
                      setEndDate(end);
                    }}
                    mode={dateSelectionMode}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {loadError && (
        <div className="mx-auto mt-5 flex max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-6">
          <div
            className="flex w-full items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200"
            role="alert"
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{loadError}</span>
            </span>
            <button
              type="button"
              onClick={() => void reload()}
              className="shrink-0 font-medium underline decoration-red-300 underline-offset-4 hover:text-red-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:hover:text-white"
            >
              重新加载
            </button>
          </div>
        </div>
      )}

      <section
        className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6"
        aria-labelledby="history-list-title"
      >
        <h2 id="history-list-title" className="sr-only">
          历史记录列表
        </h2>
        <div
          className="history-grid grid w-full gap-4 sm:gap-5"
          data-grid-columns={gridColumns}
          style={{
            gridTemplateColumns:
              gridColumns === "auto"
                ? "repeat(auto-fill, minmax(260px, 1fr))"
                : `repeat(${gridColumns}, minmax(0, 1fr))`,
          }}
          aria-busy={isInitialLoading}
        >
          {isInitialLoading && (
            <span className="sr-only" role="status">
              正在加载历史记录
            </span>
          )}
          {isInitialLoading
            ? Array.from({ length: 8 }, (_, index) => <HistoryCardSkeleton key={index} />)
            : history.map((item) => (
                <HistoryItem
                  key={getHistoryItemKey(item)}
                  item={item}
                  displayMode={displayMode}
                  onDelete={() => handleHistoryDelete(item)}
                />
              ))}

          {loadMode === "scroll" && history.length > 0 && (
            <div
              ref={loadMoreCallbackRef}
              className="col-span-full flex min-h-20 items-center justify-center gap-2 py-6 text-sm text-gray-500 dark:text-neutral-400"
              role="status"
            >
              {isLoading && (
                <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" />
              )}
              {getLoadMoreText()}
            </div>
          )}
        </div>
      </section>

      {loadMode === "pagination" && history.length > 0 && (
        <Pagination
          currentPage={currentPage}
          totalItems={totalFiltered}
          pageSize={pageSize}
          onPageChange={loadPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            void setStorageValue(HISTORY_PAGE_SIZE, size);
          }}
        />
      )}

      {history.length === 0 && !isInitialLoading && !loadError && (
        <div className="mx-auto flex max-w-lg flex-col items-center px-6 py-20 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 text-gray-400 dark:bg-neutral-900 dark:text-neutral-500">
            <Search className="h-5 w-5" />
          </div>
          <h2 className="mt-5 text-lg font-semibold text-gray-900 dark:text-neutral-100">
            {hasActiveFilters ? "没有找到匹配的记录" : "还没有历史记录"}
          </h2>
          <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-neutral-400">
            {hasActiveFilters
              ? "试试更换关键词、分类或日期范围。"
              : "同步 B 站历史后，你的观看记录会显示在这里。"}
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => {
                setKeyword("");
                setStartDate("");
                setEndDate("");
                setSelectedType("all");
                setSearchType("all");
              }}
              className="mt-5 inline-flex h-10 items-center rounded-lg border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 transition-colors hover:border-pink-200 hover:bg-pink-50 hover:text-pink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:border-pink-500/40 dark:hover:bg-pink-500/10 dark:hover:text-pink-300 dark:focus-visible:ring-offset-[#0a0a0a]"
            >
              清除所有筛选
            </button>
          )}
          {!hasActiveFilters && (
            <button
              type="button"
              onClick={() => setIsSyncModalOpen(true)}
              className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg bg-pink-500 px-4 text-sm font-medium text-white transition-colors hover:bg-pink-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#0a0a0a]"
            >
              <CloudDownload className="h-4 w-4" />
              同步历史记录
            </button>
          )}
        </div>
      )}

      <HistorySyncModal
        open={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        onSyncSuccess={handleSyncSuccess}
        displayMode={displayMode}
      />

      <HistoryViewSettingsModal
        open={isViewSettingsModalOpen}
        loadMode={loadMode ?? "pagination"}
        gridColumns={gridColumns}
        onClose={() => setIsViewSettingsModalOpen(false)}
        onSave={handleViewSettingsSave}
      />
    </main>
  );
};
