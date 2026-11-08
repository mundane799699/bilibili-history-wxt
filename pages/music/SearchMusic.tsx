import { Search } from "lucide-react";
import React, { useState, useRef, useEffect, useCallback } from "react";
import SongItem from "../../components/SongItem";
import { useMusicVolume } from "@/components/VolumeControl";
import { PlayerTrack, useMusicPlayer } from "@/utils/musicPlayer";

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

/** 搜索结果转成播放器曲目：标题去掉高亮标签，封面补全协议 */
const toPlayerTrack = (item: SearchResultItem): PlayerTrack => ({
  bvid: item.bvid,
  title: item.title.replace(/<[^>]*>/g, ""),
  author: item.author,
  mid: item.mid,
  pic: item.pic.startsWith("//") ? `https:${item.pic}` : item.pic,
});

const SearchMusic = () => {
  // 应用已保存的音量（与「我喜欢的音乐」页共用）
  useMusicVolume();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const pageRef = useRef(1);
  const numPagesRef = useRef(0);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // 播放器在全局 store 中，切换到其他菜单也不会中断播放
  const current = useMusicPlayer((s) => s.current);
  const isPlaying = useMusicPlayer((s) => s.isPlaying);
  const isLoading = useMusicPlayer((s) => s.isLoading);
  const playError = useMusicPlayer((s) => s.error);
  const play = useMusicPlayer((s) => s.play);
  const togglePlay = useMusicPlayer((s) => s.togglePlay);
  const stop = useMusicPlayer((s) => s.stop);

  const handlePlay = (item: SearchResultItem) => {
    if (current?.bvid === item.bvid) {
      togglePlay();
      return;
    }
    const track = toPlayerTrack(item);
    void play(track, [track], "search");
  };

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
        `https://api.bilibili.com/x/web-interface/search/type?page=${pageRef.current}&page_size=42&platform=pc&highlight=1&keyword=${searchQuery}&search_type=video&preload=true&com2co=true`,
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
    if (loading || pageRef.current > numPagesRef.current || !searchQuery.trim()) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `https://api.bilibili.com/x/web-interface/search/type?page=${pageRef.current}&page_size=42&platform=pc&highlight=1&keyword=${searchQuery}&search_type=video&preload=true&com2co=true`,
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
      },
    );

    observer.observe(loadMoreElement);

    return () => {
      observer.unobserve(loadMoreElement);
    };
  }, [loading, searchQuery, loadMore]); // 依赖项：当loading状态、搜索关键词或loadMore函数变化时重新创建observer

  return (
    <div className="min-h-screen bg-wash/30 dark:bg-night">
      {/* 搜索框区域 */}
      <div className="sticky top-0 z-20 backdrop-blur-md bg-white/70 dark:bg-night/80 border-b border-line/50 dark:border-night-line shadow-sm transition-all duration-300">
        <div className="max-w-4xl mx-auto p-4 md:p-6">
          <div className="relative flex items-center gap-3 group">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-ink-faint dark:text-night-muted group-focus-within:text-brand dark:group-focus-within:text-brand transition-colors duration-300">
                <Search size={20} />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="搜索你想听的歌曲..."
                className="w-full pl-11 pr-4 py-3.5 bg-white/80 dark:bg-night-card border border-line dark:border-night-line rounded-2xl text-ink-soft dark:text-night-text placeholder-ink-faint dark:placeholder-night-muted focus:bg-white dark:focus:bg-night-card focus:border-brand dark:focus:border-brand focus:ring-4 focus:ring-brand/20 dark:focus:ring-brand/20 transition-all duration-300 outline-none shadow-sm hover:border-brand/30 dark:hover:border-brand/30 hover:shadow-md disabled:opacity-70 disabled:cursor-not-allowed"
                disabled={loading}
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={loading}
              className="px-6 py-3.5 bg-brand text-white font-medium rounded-2xl hover:bg-brand-strong focus:outline-none focus:ring-4 focus:ring-pink-200 dark:focus:ring-brand/25 transition-all duration-300 shadow-md hover:shadow-lg disabled:opacity-70 disabled:cursor-not-allowed transform active:scale-95 flex items-center justify-center min-w-[5rem]"
            >
              {loading ? (
                <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
              ) : (
                "搜索"
              )}
            </button>
          </div>
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="max-w-6xl mx-auto mt-6 bg-red-50 dark:bg-red-500/5 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-200 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* 搜索结果 */}
      {searchResults.length > 0 && (
        <div className="mx-auto max-w-6xl py-2">
          <div className="space-y-4">
            {searchResults.map((item) => (
              <SongItem
                key={item.id}
                item={item}
                isPlaying={current?.bvid === item.bvid && isPlaying}
                isLoading={current?.bvid === item.bvid && isLoading}
                error={playError?.bvid === item.bvid ? playError.message : null}
                onPlay={handlePlay}
                onStop={stop}
              />
            ))}
          </div>
        </div>
      )}

      <div ref={loadMoreRef} className="text-center py-8 text-ink-muted dark:text-night-muted">
        {getLoadMoreText()}
      </div>
    </div>
  );
};

export default SearchMusic;
