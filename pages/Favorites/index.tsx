import { useEffect, useState, useRef } from "react";
import { getFavFolders, getFavResources } from "../../utils/db";
import { FavoriteFolder, FavoriteResource } from "../../utils/types";
import { Folder, Video } from "lucide-react";
import { Pagination } from "../../components/Pagination";

export const Favorites = () => {
  const [folders, setFolders] = useState<FavoriteFolder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const [resources, setResources] = useState<FavoriteResource[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;

  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadFolders();
  }, []);

  useEffect(() => {
    if (selectedFolderId) {
      loadResources(selectedFolderId);
    } else if (folders.length > 0) {
      // Default select first folder
      setSelectedFolderId(folders[0].id);
    }
  }, [folders, selectedFolderId]);

  const loadFolders = async () => {
    try {
      const list = await getFavFolders();
      // Sort by index
      const sortedList = list.sort((a, b) => (a.index || 0) - (b.index || 0));
      setFolders(sortedList);
    } catch (error) {
      console.error("加载收藏夹失败", error);
    }
  };

  const loadResources = async (folderId: number) => {
    setLoading(true);
    try {
      const list = await getFavResources(folderId);
      // Sort by index
      const sortedList = list.sort((a, b) => (a.index || 0) - (b.index || 0));
      setResources(sortedList);
      setCurrentPage(1);
    } catch (error) {
      console.error("加载收藏资源失败", error);
    } finally {
      setLoading(false);
    }
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    // Scroll to top of content
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  };

  const startIndex = (currentPage - 1) * pageSize;
  const currentResources = resources.slice(startIndex, startIndex + pageSize);

  return (
    <div className="flex h-screen bg-gray-50">
      {/* 左侧收藏夹列表 */}
      <div className="w-64 bg-white border-r overflow-y-auto flex-shrink-0">
        <div className="p-4 border-b">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Folder className="w-5 h-5" />
            我的收藏夹
          </h2>
        </div>
        <div className="p-2">
          {folders.map((folder) => (
            <div
              key={folder.id}
              className={`p-3 rounded-lg cursor-pointer mb-1 transition-colors ${
                selectedFolderId === folder.id ? "bg-blue-50 text-blue-600" : "hover:bg-gray-100"
              }`}
              onClick={() => setSelectedFolderId(folder.id)}
            >
              <div className="font-medium truncate">{folder.title}</div>
              <div className="text-xs text-gray-400 mt-1">{folder.media_count}个内容</div>
            </div>
          ))}
        </div>
      </div>

      {/* 右侧内容列表 */}
      <div className="flex-1 overflow-y-auto" ref={contentRef}>
        <div className="p-6">
          {selectedFolderId && (
            <div className="mb-6">
              <h1 className="text-2xl font-bold">
                {folders.find((f) => f.id === selectedFolderId)?.title}
              </h1>
            </div>
          )}

          <div className="w-full">
            {loading ? (
              <div className="text-center py-10 text-gray-500">加载中...</div>
            ) : (
              <>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-6">
                  {currentResources.map((item) => (
                    <div
                      key={item.id}
                      className="border border-gray-200 rounded-lg overflow-hidden flex flex-col bg-white hover:shadow-md transition-shadow"
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
                            <div className="flex justify-between items-center text-gray-500 text-xs mt-2">
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
                    <div className="col-span-full text-center py-10 text-gray-400">
                      这个收藏夹是空的
                    </div>
                  )}
                </div>
                <div className="mt-8">
                  <Pagination
                    currentPage={currentPage}
                    totalItems={resources.length}
                    pageSize={pageSize}
                    onPageChange={handlePageChange}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
