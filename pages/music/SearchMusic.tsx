import { Search, Play, User, Eye, Heart, Clock } from "lucide-react";
import React, { useState } from "react";

// 定义搜索结果项的类型
interface SearchResultItem {
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

// 格式化时间戳
const formatDate = (timestamp: number): string => {
  if (timestamp === 0) return "";
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString("zh-CN");
};

// 清理HTML标签
const cleanHtml = (html: string): string => {
  return html.replace(/<[^>]*>/g, "");
};

const SearchMusic = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setLoading(true);
    setError("");

    try {
      // https://api.bilibili.com/x/web-interface/search/type?page=1&page_size=42&platform=pc&highlight=1&keyword=brave+heart&search_type=video&preload=true&com2co=true
      const response = await fetch(
        `https://api.bilibili.com/x/web-interface/search/type?page=1&page_size=42&platform=pc&highlight=1&keyword=${searchQuery}&search_type=video&preload=true&com2co=true`
      );
      const {
        data: { result, next, numPages },
      } = await response.json();

      setSearchResults(result || []);
    } catch (err) {
      setError("搜索失败，请稍后重试");
      console.error("搜索错误:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const getCover = (item: SearchResultItem) => {
    let cover = "";
    switch (item.type) {
      case "video":
        cover = `https:${item.pic}@672w_378h_1c_!web-search-common-cover.avif`;
        break;
      case "ketang":
        cover = `${item.pic}@672w_378h_1c_!web-search-common-cover.avif`;
        break;
      default:
        cover = item.pic;
    }
    return cover;
  };

  // 视频项组件
  const VideoItem = ({ item }: { item: SearchResultItem }) => (
    <div className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow duration-300 overflow-hidden">
      <div className="flex gap-4 p-4 items-center">
        {/* 视频封面 */}
        <div className="flex-shrink-0 w-40 h-24 relative">
          <img
            src={getCover(item)}
            alt={cleanHtml(item.title)}
            className="w-full h-full object-cover rounded-lg"
          />
          <div className="absolute bottom-1 right-1 bg-black bg-opacity-70 text-white text-xs px-1 rounded">
            {item.duration}
          </div>
        </div>

        {/* 视频信息 */}
        <div className="flex-1 min-w-0">
          {/* 标题 */}
          <h3
            className="text-lg font-semibold text-gray-900 mb-2 truncate hover:text-pink-600 cursor-pointer"
            onClick={() => window.open(item.arcurl, "_blank")}
            dangerouslySetInnerHTML={{ __html: item.title }}
          />

          {/* UP主信息 */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm text-gray-600 hover:text-pink-600 cursor-pointer">
              {item.author}
            </span>
            <span className="text-xs text-gray-400">
              {formatDate(item.pubdate)}
            </span>
          </div>

          {/* 描述 */}
          <p className="text-sm text-gray-600 mb-3 truncate">
            {item.description}
          </p>
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center gap-2">
          <button className="p-2">
            <Play size={20} />
          </button>
          <button className="p-2">
            <Heart size={20} />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="">
      {/* 搜索框区域 */}
      <div className="flex items-center gap-4 mb-8 sticky pt-2 top-0 bg-white z-10 px-4">
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
              <VideoItem key={item.id} item={item} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchMusic;
