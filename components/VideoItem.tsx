import { Heart, Play } from "lucide-react";
import { SearchResultItem } from "../pages/music/SearchMusic";

const VideoItem = ({ item }: { item: SearchResultItem }) => {
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

  return (
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
};

export default VideoItem;
