import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { getSubscribedCollectionResources, getSubscribedCollections } from "../utils/db";
import { SubscribedCollection, SubscribedCollectionResource } from "../utils/types";
import { ChevronDownIcon, LibraryBig, RefreshCw, Search, X } from "lucide-react";
import { Pagination } from "../components/Pagination";

type SearchType = "all" | "title" | "up" | "bvid" | "avid";

const SEARCH_OPTIONS: { value: SearchType; label: string }[] = [
  { value: "all", label: "综合搜索" },
  { value: "title", label: "视频标题" },
  { value: "up", label: "UP 主" },
  { value: "bvid", label: "视频 BV 号" },
  { value: "avid", label: "视频 AV 号" },
];

export const SubscribedCollections = () => {
  const [collections, setCollections] = useState<SubscribedCollection[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<number | null>(null);
  const [resources, setResources] = useState<SubscribedCollectionResource[]>([]);
  const [isSyncingCollections, setIsSyncingCollections] = useState(false);
  const [isSyncingResources, setIsSyncingResources] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [searchType, setSearchType] = useState<SearchType>("all");
  const [isSearchKindDropdownOpen, setIsSearchKindDropdownOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const pageSize = 50;

  const selectedCollection = collections.find(
    (collection) => collection.id === selectedCollectionId,
  );

  const loadCollections = async () => {
    const list = await getSubscribedCollections();
    const sortedList = list.sort((a, b) => a.index - b.index);
    setCollections(sortedList);
    setSelectedCollectionId((currentId) => {
      if (currentId && sortedList.some((collection) => collection.id === currentId))
        return currentId;
      return sortedList[0]?.id ?? null;
    });
  };

  const loadResources = async (collectionId: number) => {
    const list = await getSubscribedCollectionResources(collectionId);
    setResources(list.sort((a, b) => a.index - b.index));
    setCurrentPage(1);
    setKeyword("");
  };

  const refreshCollections = async () => {
    setIsSyncingCollections(true);
    try {
      const response = await browser.runtime.sendMessage({ action: "syncSubscribedCollections" });
      if (!response?.success) throw new Error(response?.error || "同步订阅合集失败");
      await loadCollections();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "同步订阅合集失败");
    } finally {
      setIsSyncingCollections(false);
    }
  };

  const refreshResources = async (collection: SubscribedCollection) => {
    setIsSyncingResources(true);
    try {
      const response = await browser.runtime.sendMessage({
        action: "syncSubscribedCollectionResources",
        collectionId: collection.id,
        mid: collection.mid,
      });
      if (!response?.success) throw new Error(response?.error || "同步合集内容失败");
      await loadResources(collection.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "同步合集内容失败");
    } finally {
      setIsSyncingResources(false);
    }
  };

  useEffect(() => {
    loadCollections().catch(() => toast.error("加载订阅合集缓存失败"));
    refreshCollections();
  }, []);

  useEffect(() => {
    if (!selectedCollection) {
      setResources([]);
      return;
    }

    loadResources(selectedCollection.id).catch(() => toast.error("加载合集内容缓存失败"));
    refreshResources(selectedCollection);
  }, [selectedCollectionId]);

  const filteredResources = resources.filter((item) => {
    if (!keyword) return true;
    const lowerKeyword = keyword.toLowerCase();

    switch (searchType) {
      case "title":
        return item.title.toLowerCase().includes(lowerKeyword);
      case "up":
        return item.author_name.toLowerCase().includes(lowerKeyword);
      case "bvid":
        return item.bvid.toLowerCase().includes(lowerKeyword);
      case "avid":
        return String(item.aid).includes(lowerKeyword);
      case "all":
      default:
        return (
          item.title.toLowerCase().includes(lowerKeyword) ||
          item.author_name.toLowerCase().includes(lowerKeyword) ||
          item.bvid.toLowerCase().includes(lowerKeyword) ||
          String(item.aid).includes(lowerKeyword)
        );
    }
  });

  const startIndex = (currentPage - 1) * pageSize;
  const currentResources = filteredResources.slice(startIndex, startIndex + pageSize);
  const searchLabel =
    SEARCH_OPTIONS.find((option) => option.value === searchType)?.label || "综合搜索";

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-[#0a0a0a]">
      <aside className="w-64 bg-white dark:bg-neutral-900 border-r border-gray-200 dark:border-neutral-800 overflow-y-auto flex-shrink-0">
        <div className="p-4 border-b border-gray-200 dark:border-neutral-800 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold flex items-center gap-2 min-w-0">
            <LibraryBig className="w-5 h-5 shrink-0" />
            <span className="truncate">我的订阅合集</span>
          </h2>
          <button
            type="button"
            title="同步订阅合集"
            aria-label="同步订阅合集"
            onClick={refreshCollections}
            disabled={isSyncingCollections}
            className="p-2 rounded-md text-gray-500 hover:bg-gray-100 hover:text-pink-500 disabled:opacity-50 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-pink-400 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncingCollections ? "animate-spin" : ""}`} />
          </button>
        </div>

        <div className="p-2">
          {collections.map((collection) => (
            <button
              key={collection.id}
              type="button"
              onClick={() => setSelectedCollectionId(collection.id)}
              className={`w-full p-3 rounded-lg text-left mb-1 transition-colors ${
                selectedCollectionId === collection.id
                  ? "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400"
                  : "hover:bg-gray-100 dark:hover:bg-neutral-800"
              }`}
            >
              <div className="font-medium truncate">{collection.title}</div>
              <div className="text-xs text-gray-400 dark:text-neutral-500 mt-1 truncate">
                {collection.upper?.name || "未知 UP 主"} · {collection.media_count} 个视频
              </div>
            </button>
          ))}

          {!isSyncingCollections && collections.length === 0 && (
            <div className="p-5 text-center text-sm text-gray-400 dark:text-neutral-500">
              暂无订阅合集
            </div>
          )}
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto" ref={contentRef}>
        <div className="p-6">
          {selectedCollection ? (
            <>
              <section className="mb-6 flex flex-col md:flex-row justify-between md:items-center gap-4 bg-white dark:bg-neutral-900 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-neutral-800">
                <div className="min-w-0">
                  <h1 className="text-xl font-bold flex items-center gap-2 min-w-0">
                    <span className="truncate">{selectedCollection.title}</span>
                    <span className="shrink-0 text-sm font-normal text-gray-500 dark:text-neutral-400 bg-gray-50 dark:bg-neutral-800 px-2 py-1 rounded-full border border-gray-100 dark:border-neutral-700">
                      {filteredResources.length} 个视频
                    </span>
                  </h1>
                  {selectedCollection.intro && (
                    <p className="mt-2 text-sm text-gray-500 dark:text-neutral-400 line-clamp-1">
                      {selectedCollection.intro}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto">
                  <div className="relative flex-1 md:w-[32rem] group flex items-center bg-gray-50 dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-full transition-all duration-300 shadow-sm hover:shadow-md focus-within:bg-white dark:focus-within:bg-neutral-800 focus-within:ring-2 focus-within:ring-blue-100 dark:focus-within:ring-blue-500/20 focus-within:border-blue-400 dark:focus-within:border-blue-500">
                    <div className="relative">
                      <button
                        type="button"
                        className="pl-4 pr-3 py-2 text-sm text-gray-600 dark:text-neutral-300 font-medium border-r border-gray-200 dark:border-neutral-700 hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-1 transition-colors whitespace-nowrap"
                        onClick={() => setIsSearchKindDropdownOpen((open) => !open)}
                      >
                        <span>{searchLabel}</span>
                        <ChevronDownIcon className="w-3 h-3 text-gray-400 dark:text-neutral-500" />
                      </button>

                      {isSearchKindDropdownOpen && (
                        <>
                          <button
                            type="button"
                            aria-label="关闭搜索类型菜单"
                            className="fixed inset-0 z-10 cursor-default"
                            onClick={() => setIsSearchKindDropdownOpen(false)}
                          />
                          <div className="absolute top-full left-0 mt-2 w-32 bg-white dark:bg-neutral-900 rounded-lg shadow-lg border border-gray-100 dark:border-neutral-800 py-1 z-20 overflow-hidden">
                            {SEARCH_OPTIONS.map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                                  searchType === option.value
                                    ? "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium"
                                    : "text-gray-600 dark:text-neutral-300 hover:bg-gray-50 dark:hover:bg-neutral-800"
                                }`}
                                onClick={() => {
                                  setSearchType(option.value);
                                  setIsSearchKindDropdownOpen(false);
                                  setCurrentPage(1);
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
                      className="flex-1 min-w-0 bg-transparent border-none focus:ring-0 pl-4 pr-10 py-2 text-sm text-gray-700 dark:text-neutral-100 placeholder-gray-400 dark:placeholder-neutral-500 focus:outline-none"
                      placeholder="搜索..."
                      value={keyword}
                      onChange={(event) => {
                        setKeyword(event.target.value);
                        setCurrentPage(1);
                      }}
                    />
                    {keyword ? (
                      <button
                        type="button"
                        aria-label="清空搜索"
                        onClick={() => {
                          setKeyword("");
                          setCurrentPage(1);
                        }}
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

                  <button
                    type="button"
                    title="同步合集内容"
                    aria-label="同步合集内容"
                    onClick={() => refreshResources(selectedCollection)}
                    disabled={isSyncingResources}
                    className="p-2.5 rounded-full text-gray-500 bg-gray-50 border border-gray-200 hover:bg-gray-100 hover:text-pink-500 disabled:opacity-50 dark:text-neutral-400 dark:bg-neutral-800 dark:border-neutral-700 dark:hover:bg-neutral-700 dark:hover:text-pink-400 transition-colors"
                  >
                    <RefreshCw className={`w-4 h-4 ${isSyncingResources ? "animate-spin" : ""}`} />
                  </button>
                </div>
              </section>

              {isSyncingResources && resources.length === 0 ? (
                <div className="text-center py-10 text-gray-500 dark:text-neutral-400">
                  正在同步合集内容...
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-6">
                    {currentResources.map((item) => (
                      <a
                        key={item.id}
                        href={`https://www.bilibili.com/video/${item.bvid}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="border border-gray-200 dark:border-neutral-800 rounded-lg overflow-hidden flex flex-col bg-white dark:bg-neutral-900 hover:shadow-md transition-shadow no-underline text-inherit"
                      >
                        <div className="relative w-full aspect-video bg-gray-100 dark:bg-neutral-800">
                          {item.cover ? (
                            <img
                              src={`${item.cover.replace("http:", "https:")}@760w_428h_1c.avif`}
                              alt={item.title}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-400 dark:text-neutral-500">
                              <LibraryBig className="w-8 h-8" />
                            </div>
                          )}
                        </div>
                        <div className="p-3 flex-1 flex flex-col">
                          <h3
                            className="m-0 text-sm leading-[1.4] h-10 overflow-hidden line-clamp-2"
                            title={item.title}
                          >
                            {item.title}
                          </h3>
                          <div className="flex justify-between items-center text-gray-500 dark:text-neutral-400 text-xs mt-2 gap-2">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                window.open(
                                  `https://space.bilibili.com/${item.author_mid}`,
                                  "_blank",
                                );
                              }}
                              className="hover:text-[#fb7299] transition-colors cursor-pointer truncate text-left"
                            >
                              {item.author_name}
                            </button>
                            <span className="shrink-0">
                              {item.pubdate
                                ? new Date(item.pubdate * 1000).toLocaleDateString()
                                : ""}
                            </span>
                          </div>
                        </div>
                      </a>
                    ))}
                  </div>

                  {currentResources.length === 0 && (
                    <div className="text-center py-16 text-gray-400 dark:text-neutral-500">
                      这个合集暂时没有可显示的视频
                    </div>
                  )}

                  <div className="mt-8">
                    <Pagination
                      currentPage={currentPage}
                      totalItems={filteredResources.length}
                      pageSize={pageSize}
                      onPageChange={(page) => {
                        setCurrentPage(page);
                        contentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                    />
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="h-full min-h-[24rem] flex flex-col items-center justify-center text-gray-400 dark:text-neutral-500">
              <LibraryBig className="w-12 h-12 mb-4" />
              <p>{isSyncingCollections ? "正在同步订阅合集..." : "还没有订阅任何合集"}</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default SubscribedCollections;
