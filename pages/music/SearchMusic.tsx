import { Search } from "lucide-react";
import React, { useState, useRef, useEffect, useCallback } from "react";
import SongItem from "../../components/SongItem";

// 定义搜索结果项的类型
export interface SearchResultItem {
  type: string;
  id: number;
  author: string;
  mid: number;
  typeid: string;
  typename: string;
  arcurl: string;
  aid: number;
  bvid: string;
  title: string;
  description: string;
  pic: string;
  play: number;
  video_review: number;
  favorites: number;
  tag: string;
  review: number;
  pubdate: number;
  senddate: number;
  duration: string;
  like: number;
  upic: string;
  danmaku: number;
  [key: string]: any;
}

const SearchMusic = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const pageRef = useRef(1);
  const numPagesRef = useRef(0);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const getLoadMoreText = () => {
    if (loading) {
      return "加载中...";
    }

    if (pageRef.current < numPagesRef.current) {
      return "向下滚动加载更多";
    }

    return "";
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      return;
    }

    setLoading(true);
    setError("");
    // 重置分页
    pageRef.current = 1;

    try {
      // https://api.bilibili.com/x/web-interface/search/type?page=1&page_size=42&platform=pc&highlight=1&keyword=brave+heart&search_type=video&preload=true&com2co=true
      const response = await fetch(
        `https://api.bilibili.com/x/web-interface/search/type?page=${pageRef.current}&page_size=42&platform=pc&highlight=1&keyword=${searchQuery}&search_type=video&preload=true&com2co=true`
      );
      const {
        data: { result, next, numPages },
      } = await response.json();

      setSearchResults(result || []);
      pageRef.current = next;
      numPagesRef.current = numPages;
    } catch (err) {
      setError("搜索失败，请稍后重试");
      console.error("搜索错误:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (
      loading ||
      pageRef.current > numPagesRef.current ||
      !searchQuery.trim()
    ) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `https://api.bilibili.com/x/web-interface/search/type?page=${pageRef.current}&page_size=42&platform=pc&highlight=1&keyword=${searchQuery}&search_type=video&preload=true&com2co=true`
      );
      const {
        data: { result, next, numPages },
      } = await response.json();

      // 追加新的搜索结果到现有结果
      setSearchResults((prev) => [...prev, ...(result || [])]);
      pageRef.current = next;
      numPagesRef.current = numPages;
    } catch (err) {
      setError("加载更多失败，请稍后重试");
      console.error("加载更多错误:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  // 使用 Intersection Observer 监听 loadMoreRef
  useEffect(() => {
    const loadMoreElement = loadMoreRef.current;
    if (!loadMoreElement) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        // 当 loadMoreRef 进入视口且可以加载更多时，触发加载
        if (
          entry.isIntersecting &&
          pageRef.current <= numPagesRef.current &&
          !loading &&
          searchQuery.trim()
        ) {
          loadMore();
        }
      },
      {
        rootMargin: "100px", // 提前100px开始加载
        threshold: 0.1,
      }
    );

    observer.observe(loadMoreElement);

    return () => {
      observer.unobserve(loadMoreElement);
    };
  }, [loading, searchQuery, loadMore]); // 依赖项：当loading状态、搜索关键词或loadMore函数变化时重新创建observer

  return (
    <div className="">
      {/* 搜索框区域 */}
      <div className="flex items-center gap-4 sticky p-4 top-0 bg-white z-10 border-b border-gray-200">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="请输入关键词"
          className="flex-1 px-4 py-3 text-lg border-2 border-gray-300 rounded-lg focus:border-pink-500 focus:outline-none"
          disabled={loading}
        />
        <button
          onClick={handleSearch}
          disabled={loading}
          className="px-6 py-3 bg-pink-400 text-white rounded-lg hover:bg-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
          ) : (
            <Search />
          )}
        </button>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* 搜索结果 */}
      {searchResults.length > 0 && (
        <div className="mx-auto max-w-6xl">
          <div className="space-y-4">
            {searchResults.map((item) => (
              <SongItem key={item.id} item={item} />
            ))}
          </div>
        </div>
      )}

      <div ref={loadMoreRef} className="text-center py-8 text-gray-500">
        {getLoadMoreText()}
      </div>
    </div>
  );
};

export default SearchMusic;
