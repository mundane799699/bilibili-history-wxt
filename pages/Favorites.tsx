import { useEffect, useState, useRef } from "react";
import { getFavFolders, getFavResources } from "../utils/db";
import {
  FavoriteFolder,
  FavoriteResource,
  RefreshFavoriteFoldersRequest,
  RefreshFavoriteFoldersResponse,
  FavoriteFolderSyncProgress,
  AllFavoriteFoldersSyncProgress,
} from "../utils/types";
import { FAVORITE_FOLDER_SYNC_PROGRESS, ALL_FAVORITE_FOLDERS_SYNC_PROGRESS } from "../utils/constants";
import { Folder, Video, Search, X, ChevronDownIcon, CloudDownload, RefreshCw } from "lucide-react";
import { Pagination } from "../components/Pagination";
import { FavoriteFolderSyncModal } from "../components/FavoriteFolderSyncModal";
import { AllFavoriteFoldersSyncModal } from "../components/AllFavoriteFoldersSyncModal";

export const Favorites = () => {
  const [folders, setFolders] = useState<FavoriteFolder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const [resources, setResources] = useState<FavoriteResource[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [searchType, setSearchType] = useState<"all" | "title" | "up" | "bvid" | "avid">("all");
  const [isSearchKindDropdownOpen, setIsSearchKindDropdownOpen] = useState(false);
  const [syncTargetFolder, setSyncTargetFolder] = useState<FavoriteFolder | null>(null);
  const [isAllFoldersSyncOpen, setIsAllFoldersSyncOpen] = useState(false);
  const [syncProgress, setSyncProgress] = useState<FavoriteFolderSyncProgress | null>(null);
  const [allSyncProgress, setAllSyncProgress] = useState<AllFavoriteFoldersSyncProgress | null>(null);
  const pageSize = 50;

  const contentRef = useRef<HTMLDivElement>(null);
  const hasRefreshedFolderDirectoryRef = useRef(false);

  useEffect(() => {
    if (hasRefreshedFolderDirectoryRef.current) return;
    hasRefreshedFolderDirectoryRef.current = true;

    const initializeFolders = async () => {
      // 先展示本地目录，再从网络刷新，网络失败时仍可使用 IndexedDB 中的数据。
      await loadFolders();

      try {
        const request: RefreshFavoriteFoldersRequest = {
          action: "refreshFavoriteFolders",
        };
        const response = (await browser.runtime.sendMessage(request)) as
          RefreshFavoriteFoldersResponse | undefined;

        if (!response) throw new Error("未收到收藏夹目录刷新响应");
        if (!response.success) throw new Error(response.error || "刷新收藏夹目录失败");

        await loadFolders();
      } catch (error) {
        console.error("从网络刷新收藏夹目录失败，继续使用本地数据", error);
      }
    };

    void initializeFolders();
  }, []);

  useEffect(() => {
    if (folders.length === 0) {
      if (selectedFolderId !== null) {
        setSelectedFolderId(null);
        setResources([]);
      }
      return;
    }

    if (selectedFolderId === null || !folders.some((folder) => folder.id === selectedFolderId)) {
      // Default select first folder
      setSelectedFolderId(folders[0].id);
    }
  }, [folders, selectedFolderId]);

  useEffect(() => {
    if (selectedFolderId !== null) {
      void loadResources(selectedFolderId);
    }
  }, [selectedFolderId]);

  useEffect(() => {
    const loadProgress = async () => {
      const data = await browser.storage.local.get([
        FAVORITE_FOLDER_SYNC_PROGRESS,
        ALL_FAVORITE_FOLDERS_SYNC_PROGRESS,
      ]);
      if (data[FAVORITE_FOLDER_SYNC_PROGRESS]) {
        setSyncProgress(data[FAVORITE_FOLDER_SYNC_PROGRESS] as FavoriteFolderSyncProgress);
      }
      if (data[ALL_FAVORITE_FOLDERS_SYNC_PROGRESS]) {
        setAllSyncProgress(data[ALL_FAVORITE_FOLDERS_SYNC_PROGRESS] as AllFavoriteFoldersSyncProgress);
      }
    };
    void loadProgress();

    const listener = (changes: any) => {
      if (changes[FAVORITE_FOLDER_SYNC_PROGRESS]) {
        const newProg = changes[FAVORITE_FOLDER_SYNC_PROGRESS].newValue as FavoriteFolderSyncProgress | null;
        setSyncProgress(newProg);
        if (newProg && (newProg.status === "success" || newProg.status === "error")) {
          if (selectedFolderId !== null) {
            void loadResources(selectedFolderId, { resetSearch: false, showLoading: false });
          }
          void loadFolders();
        }
      }
      if (changes[ALL_FAVORITE_FOLDERS_SYNC_PROGRESS]) {
        const newProg = changes[ALL_FAVORITE_FOLDERS_SYNC_PROGRESS].newValue as AllFavoriteFoldersSyncProgress | null;
        setAllSyncProgress(newProg);
        if (newProg && (newProg.status === "success" || newProg.status === "error")) {
          void loadFolders();
        }
      }
    };
    browser.storage.local.onChanged.addListener(listener);
    return () => {
      browser.storage.local.onChanged.removeListener(listener);
    };
  }, [selectedFolderId]);

  const loadFolders = async () => {
    try {
      const list = await getFavFolders();
      // Sort by index
      const sortedList = list.sort((a, b) => (a.index || 0) - (b.index || 0));
      setFolders(sortedList);
      return true;
    } catch (error) {
      console.error("加载收藏夹失败", error);
      return false;
    }
  };

  const loadResources = async (
    folderId: number,
    { resetSearch = true, showLoading = true }: { resetSearch?: boolean; showLoading?: boolean } = {},
  ) => {
    if (showLoading) setLoading(true);
    try {
      const list = await getFavResources(folderId);
      // Sort by index
      const sortedList = list.sort((a, b) => (a.index || 0) - (b.index || 0));
      setResources(sortedList);
      setCurrentPage(1);
      if (resetSearch) setKeyword("");
      return true;
    } catch (error) {
      console.error("加载收藏资源失败", error);
      return false;
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const handleFolderSyncSuccess = async (folderId: number) => {
    const foldersRefreshed = await loadFolders();
    const resourcesRefreshed =
      selectedFolderId === folderId ? await loadResources(folderId, { resetSearch: false }) : true;

    if (!foldersRefreshed || !resourcesRefreshed) {
      throw new Error("收藏夹页面刷新失败");
    }
  };

  const handleAllFoldersSyncComplete = async () => {
    const foldersRefreshed = await loadFolders();
    const resourcesRefreshed =
      selectedFolderId !== null
        ? await loadResources(selectedFolderId, { resetSearch: false })
        : true;

    if (!foldersRefreshed || !resourcesRefreshed) {
      throw new Error("收藏夹页面刷新失败");
    }
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    // Scroll to top of content
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  };

  const filteredResources = resources.filter((item) => {
    if (!keyword) return true;
    const lowerKeyword = keyword.toLowerCase();

    switch (searchType) {
      case "title":
        return item.title.toLowerCase().includes(lowerKeyword);
      case "up":
        return item.upper?.name.toLowerCase().includes(lowerKeyword);
      case "bvid":
        return item.bvid && item.bvid.toLowerCase().includes(lowerKeyword);
      case "avid":
        return item.id && String(item.id).includes(lowerKeyword);
      case "all":
      default:
        return (
          item.title.toLowerCase().includes(lowerKeyword) ||
          item.upper?.name.toLowerCase().includes(lowerKeyword) ||
          (item.bvid && item.bvid.toLowerCase().includes(lowerKeyword)) ||
          (item.id && String(item.id).includes(lowerKeyword))
        );
    }
  });

  const startIndex = (currentPage - 1) * pageSize;
  const currentResources = filteredResources.slice(startIndex, startIndex + pageSize);

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-[#0a0a0a]">
      {/* 左侧收藏夹列表 */}
      <div className="w-64 bg-white dark:bg-neutral-900 border-r border-gray-200 dark:border-neutral-800 overflow-y-auto flex-shrink-0">
        <div className="flex items-center justify-between gap-2 border-b border-gray-200 p-4 dark:border-neutral-800">
          <h2 className="flex min-w-0 items-center gap-2 text-lg font-bold">
            <Folder className="h-5 w-5 shrink-0" />
            <span className="truncate">收藏夹</span>
          </h2>
          <button
            type="button"
            onClick={() => setIsAllFoldersSyncOpen(true)}
            disabled={folders.length === 0}
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-blue-200 bg-white/80 px-2 py-1 text-xs font-medium text-blue-600 shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-500/30 dark:bg-neutral-900/80 dark:text-blue-400 dark:hover:border-blue-500/50 dark:hover:bg-blue-500/20"
            title="同步所有收藏夹"
            aria-label="同步所有收藏夹"
          >
            <CloudDownload className="h-3.5 w-3.5" />
            <span>同步所有</span>
          </button>
        </div>

        {allSyncProgress && allSyncProgress.status === "syncing" && (
          <div
            role="status"
            className="m-2 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin text-indigo-600 dark:text-indigo-400" />
                <p className="text-xs font-semibold truncate">
                  {allSyncProgress.currentFolderTitle
                    ? `正在同步「${allSyncProgress.currentFolderTitle}」`
                    : "正在准备..."}
                </p>
              </div>
              <span className="text-[10px] font-medium opacity-80 shrink-0">
                {allSyncProgress.completedCount}/{allSyncProgress.totalFolders}
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-indigo-100 dark:bg-indigo-950/60">
              <div
                className="h-full rounded-full bg-indigo-600 transition-[width] duration-300 dark:bg-indigo-400"
                style={{
                  width: allSyncProgress.totalFolders
                    ? `${Math.max(4, Math.floor((allSyncProgress.completedCount / allSyncProgress.totalFolders) * 100))}%`
                    : "4%",
                }}
              />
            </div>
          </div>
        )}

        {!allSyncProgress?.status?.includes("syncing") && syncProgress && syncProgress.status === "syncing" && (
          <div
            role="status"
            className="m-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300"
          >
            <div className="flex items-center gap-2">
              <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin text-blue-600 dark:text-blue-400" />
              <p className="text-xs font-semibold truncate">
                同步「{syncProgress.folderTitle}」
              </p>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-blue-100 dark:bg-blue-950/60">
              <div
                className={`h-full rounded-full bg-blue-600 transition-[width] duration-300 dark:bg-blue-400 ${
                  syncProgress.mode !== "full" ? "animate-pulse" : ""
                }`}
                style={{
                  width: syncProgress.totalItems
                    ? `${Math.max(4, Math.floor((syncProgress.processedItems / syncProgress.totalItems) * 100))}%`
                    : "4%",
                }}
              />
            </div>
            <p className="mt-1.5 text-[11px] text-blue-600 dark:text-blue-300 truncate">
              {syncProgress.currentPage
                ? syncProgress.totalItems > 0
                  ? `${syncProgress.processedItems}/${syncProgress.totalItems} (${Math.floor((syncProgress.processedItems / syncProgress.totalItems) * 100)}%) 第${syncProgress.currentPage}页`
                  : `已检查 ${syncProgress.processedItems} 条，第${syncProgress.currentPage}页`
                : "正在获取合集信息..."}
            </p>
          </div>
        )}

        <div className="p-2">
          {folders.map((folder) => (
            <div
              key={folder.id}
              className={`p-3 rounded-lg cursor-pointer mb-1 transition-colors ${
                selectedFolderId === folder.id
                  ? "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400"
                  : "hover:bg-gray-100 dark:hover:bg-neutral-800"
              }`}
              onClick={() => setSelectedFolderId(folder.id)}
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium" title={folder.title}>
                    {folder.title}
                  </div>
                  <div className="mt-1 text-xs text-gray-400 dark:text-neutral-500">
                    {folder.media_count}个内容
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setSyncTargetFolder(folder);
                  }}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md border border-blue-200 bg-white/80 px-2 py-1 text-xs font-medium text-blue-600 shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-100 dark:border-blue-500/30 dark:bg-neutral-900/80 dark:text-blue-400 dark:hover:border-blue-500/50 dark:hover:bg-blue-500/20"
                  title={`同步收藏夹：${folder.title}`}
                  aria-label={`同步收藏夹：${folder.title}`}
                >
                  <CloudDownload className="h-3.5 w-3.5" />
                  <span>同步</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 右侧内容列表 */}
      <div className="flex-1 overflow-y-auto" ref={contentRef}>
        <div className="p-6">
          {selectedFolderId && (
            <div className="mb-6 flex flex-col md:flex-row justify-between md:items-center gap-4 bg-white dark:bg-neutral-900 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-neutral-800">
              <h1 className="text-xl font-bold flex items-center gap-2">
                {folders.find((f) => f.id === selectedFolderId)?.title}
                <span className="text-sm font-normal text-gray-500 dark:text-neutral-400 bg-gray-50 dark:bg-neutral-800 px-2 py-1 rounded-full border border-gray-100 dark:border-neutral-700 whitespace-nowrap">
                  {filteredResources.length} 个内容
                </span>
              </h1>

              <div className="relative w-full md:max-w-xl group flex items-center bg-gray-50 dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-full transition-all duration-300 shadow-sm hover:shadow-md focus-within:bg-white dark:focus-within:bg-neutral-800 focus-within:ring-2 focus-within:ring-blue-100 dark:focus-within:ring-blue-500/20 focus-within:border-blue-400 dark:focus-within:border-blue-500">
                {/* 搜索类型下拉 */}
                <div className="relative">
                  <button
                    className="pl-4 pr-3 py-2 text-sm text-gray-600 dark:text-neutral-300 font-medium cursor-pointer border-r border-gray-200 dark:border-neutral-700 hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-1 transition-colors whitespace-nowrap"
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
                                ? "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium"
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
                  className="flex-1 bg-transparent border-none focus:ring-0 pl-4 pr-10 py-2 text-sm text-gray-700 dark:text-neutral-100 placeholder-gray-400 dark:placeholder-neutral-500 focus:outline-none"
                  placeholder={
                    searchType === "bvid"
                      ? "输入BV号..."
                      : searchType === "avid"
                        ? "输入AV号..."
                        : searchType === "up"
                          ? "输入UP主名称..."
                          : "搜索..."
                  }
                  value={keyword}
                  onChange={(e) => {
                    setKeyword(e.target.value);
                    setCurrentPage(1);
                  }}
                />
                {keyword ? (
                  <button
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
            </div>
          )}

          <div className="w-full">
            {loading ? (
              <div className="text-center py-10 text-gray-500 dark:text-neutral-400">加载中...</div>
            ) : (
              <>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-6">
                  {currentResources.map((item) => (
                    <div
                      key={item.id}
                      className="border border-gray-200 dark:border-neutral-800 rounded-lg overflow-hidden flex flex-col bg-white dark:bg-neutral-900 hover:shadow-md transition-shadow"
                    >
                      <a
                        href={`https://www.bilibili.com/video/${item.bvid}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="no-underline text-inherit flex flex-col h-full"
                      >
                        <div>
                          <div className="relative w-full aspect-video">
                            <img
                              src={`${item.cover.replace("http:", "https:")}@760w_428h_1c.avif`}
                              alt={item.title}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          </div>
                          <div className="p-3 flex-1 flex flex-col">
                            <div className="flex items-start justify-between gap-2">
                              <h3
                                className="m-0 text-sm leading-[1.4] h-10 overflow-hidden line-clamp-2 flex-1"
                                title={item.title}
                              >
                                {item.title}
                              </h3>
                            </div>
                            <div className="flex justify-between items-center text-gray-500 dark:text-neutral-400 text-xs mt-2">
                              <span
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  window.open(
                                    `https://space.bilibili.com/${item.upper?.mid}`,
                                    "_blank",
                                  );
                                }}
                                className="hover:text-[#fb7299] transition-colors cursor-pointer truncate mr-2"
                              >
                                {item.upper?.name}
                              </span>
                              <span className="shrink-0">
                                {new Date(
                                  (item.fav_time || item.ctime) * 1000,
                                ).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                        </div>
                      </a>
                    </div>
                  ))}
                  {currentResources.length === 0 && (
                    <div className="col-span-full text-center py-10 text-gray-400 dark:text-neutral-500">
                      这个收藏夹是空的
                    </div>
                  )}
                </div>
                <div className="mt-8">
                  <Pagination
                    currentPage={currentPage}
                    totalItems={filteredResources.length}
                    pageSize={pageSize}
                    onPageChange={handlePageChange}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <FavoriteFolderSyncModal
        folder={syncTargetFolder}
        onClose={() => setSyncTargetFolder(null)}
        onSyncSuccess={handleFolderSyncSuccess}
      />
      <AllFavoriteFoldersSyncModal
        folders={folders}
        open={isAllFoldersSyncOpen}
        onClose={() => setIsAllFoldersSyncOpen(false)}
        onSyncComplete={handleAllFoldersSyncComplete}
      />
    </div>
  );
};

export default Favorites;
