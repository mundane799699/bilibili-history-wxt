import { Heart, Play, Pause, Loader2, Square } from "lucide-react";
import { SearchResultItem } from "../pages/music/SearchMusic";
import { useState, useEffect } from "react";
import { saveLikedMusic, deleteLikedMusic, isLikedMusic } from "../utils/db";
import { LikedMusic } from "../utils/types";
import { toast } from "react-hot-toast";
import { formatDuration } from "../utils/common";

interface SongItemProps {
  item: SearchResultItem;
  isPlaying: boolean;
  isLoading: boolean;
  error: string | null;
  onPlay: (item: SearchResultItem) => void;
  onStop: () => void;
}

const SontItem = ({ item, isPlaying, isLoading, error, onPlay, onStop }: SongItemProps) => {
  // 收藏状态管理
  const [isLiked, setIsLiked] = useState(false);
  const [likeLoading, setLikeLoading] = useState(false);

  // 组件加载时检查收藏状态
  useEffect(() => {
    const checkLikedStatus = async () => {
      try {
        const liked = await isLikedMusic(item.bvid);
        setIsLiked(liked);
      } catch (error) {
        console.error("检查收藏状态失败:", error);
      }
    };
    checkLikedStatus();
  }, [item.bvid]);

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

  const handleLike = async () => {
    if (likeLoading) {
      return;
    }
    if (item.type !== "video" || !item.bvid) {
      toast("暂不支持的类型", {
        icon: "🙂",
      });
      return;
    }

    setLikeLoading(true);
    try {
      if (isLiked) {
        // 取消收藏
        await deleteLikedMusic(item.bvid);
        setIsLiked(false);
        console.log("取消收藏成功:", item.title);
      } else {
        // 添加收藏
        const likedMusic: LikedMusic = {
          bvid: item.bvid,
          title: cleanHtml(item.title),
          author: item.author,
          mid: item.mid,
          pic: getCover(item),
          added_at: Date.now(),
        };
        await saveLikedMusic(likedMusic);
        setIsLiked(true);
        console.log("收藏成功:", item.title);
      }
    } catch (error) {
      console.error("操作失败:", error);
    } finally {
      setLikeLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-night-card border border-transparent dark:border-night-line rounded-lg shadow-md hover:shadow-lg hover:bg-wash dark:hover:bg-night-line/60 transition-all duration-300 overflow-hidden">
      <div className="flex gap-4 p-4 items-center">
        {/* 视频封面 */}
        <div className="flex-shrink-0 w-40 h-24 relative">
          <img
            src={getCover(item)}
            alt={cleanHtml(item.title)}
            className="w-full h-full object-cover rounded-lg"
          />
          <div className="absolute bottom-1 right-1 bg-black bg-opacity-70 text-white text-xs px-1 rounded">
            {formatDuration(item.duration)}
          </div>
        </div>

        {/* 视频信息 */}
        <div className="flex-1 min-w-0">
          {/* 标题 */}
          <div className="truncate">
            <a
              href={item.arcurl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-lg font-semibold text-ink dark:text-night-text mb-2 hover:text-brand-strong dark:hover:text-brand cursor-pointer"
              dangerouslySetInnerHTML={{ __html: item.title }}
            />
          </div>

          {/* UP主信息 */}
          <div className="flex items-center gap-2 mb-2">
            <a
              href={`https://space.bilibili.com/${item.mid}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-ink-soft dark:text-night-muted hover:text-brand-strong dark:hover:text-brand cursor-pointer"
            >
              {item.author}
            </a>
            <span className="text-xs text-ink-faint dark:text-night-muted">
              {formatDate(item.pubdate)}
            </span>
          </div>

          {/* 描述 */}
          <p className="text-sm text-ink-soft dark:text-night-muted mb-3 truncate">
            {item.description}
          </p>

          {/* 错误提示 */}
          {error && (
            <div className="text-red-500 dark:text-red-400 text-xs mb-2 flex items-center gap-1">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center gap-2">
          <button
            className="p-2 text-ink-soft dark:text-night-muted hover:bg-wash dark:hover:bg-night-line/60 rounded-full transition-colors duration-200"
            onClick={onStop}
            title="停止"
          >
            <Square size={20} />
          </button>
          <button
            className={`p-2 rounded-full transition-colors duration-200 ${
              isPlaying
                ? "bg-brand text-white hover:bg-brand-strong"
                : "text-ink-soft dark:text-night-muted hover:bg-wash dark:hover:bg-night-line/60"
            } ${isLoading ? "cursor-not-allowed" : "cursor-pointer"}`}
            onClick={() => onPlay(item)}
            disabled={isLoading}
            title={isLoading ? "加载中..." : isPlaying ? "暂停" : "播放"}
          >
            {isLoading ? (
              <Loader2 size={20} className="animate-spin" />
            ) : isPlaying ? (
              <Pause size={20} />
            ) : (
              <Play size={20} />
            )}
          </button>
          <button
            className={`p-2 rounded-full transition-colors duration-200 ${
              isLiked
                ? "bg-brand text-white hover:bg-brand-strong"
                : "text-ink-soft dark:text-night-muted hover:bg-wash dark:hover:bg-night-line/60"
            } ${likeLoading ? "cursor-not-allowed" : "cursor-pointer"}`}
            onClick={handleLike}
            disabled={likeLoading}
            title={likeLoading ? "处理中..." : isLiked ? "取消收藏" : "收藏"}
          >
            {likeLoading ? (
              <Loader2 size={20} className="animate-spin" />
            ) : (
              <Heart size={20} fill={isLiked ? "currentColor" : "none"} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SontItem;
