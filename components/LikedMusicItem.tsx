import { Play, Pause, Loader2, Square, Trash2 } from "lucide-react";
import { useState } from "react";
import dayjs from "dayjs";
import { deleteLikedMusic } from "../utils/db";
import { LikedMusic } from "../utils/types";

interface LikedMusicItemProps {
  music: LikedMusic;
  onRemoved?: () => void;
  onPlay: () => void;
  onStop: () => void;
  isPlaying: boolean;
  isLoading: boolean;
  playError?: string;
}

const LikedMusicItem = ({
  music,
  onRemoved,
  onPlay,
  onStop,
  isPlaying,
  isLoading,
  playError
}: LikedMusicItemProps) => {
  // 取消收藏状态管理
  const [removing, setRemoving] = useState(false);

  // 格式化时间戳
  const formatDate = (timestamp: number): string => {
    return dayjs(timestamp).format("YYYY-MM-DD HH:mm:ss");
  };

  const handleRemove = async () => {
    if (removing) return;

    setRemoving(true);
    try {
      await deleteLikedMusic(music.bvid);
      console.log("取消收藏成功:", music.title);
      onRemoved?.();
    } catch (error) {
      console.error("取消收藏失败:", error);
    } finally {
      setRemoving(false);
    }
  };


  return (
    <div className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow duration-300 overflow-hidden">
      <div className="flex gap-4 p-4 items-center">
        {/* 音乐封面 */}
        <div className="flex-shrink-0 w-32 h-20 relative">
          <img
            src={music.pic}
            alt={music.title}
            className="w-full h-full object-cover rounded-lg"
          />
        </div>

        {/* 音乐信息 */}
        <div className="flex-1 min-w-0">
          {/* 标题 */}
          <h3
            className="text-lg font-semibold text-gray-900 mb-2 truncate hover:text-pink-600 cursor-pointer"
            onClick={() =>
              window.open(
                `https://www.bilibili.com/video/${music.bvid}`,
                "_blank"
              )
            }
          >
            {music.title}
          </h3>

          {/* UP主信息 */}
          <div className="flex items-center gap-2 mb-2">
            <a
              href={`https://space.bilibili.com/${music.mid}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-gray-600 hover:text-pink-600 cursor-pointer"
            >
              {music.author}
            </a>
            <span className="text-xs text-gray-400">
              收藏于 {formatDate(music.added_at)}
            </span>
          </div>

          {/* 错误提示 */}
          {playError && (
            <div className="text-red-500 text-xs mb-2 flex items-center gap-1">
              <span>⚠️</span>
              <span>{playError}</span>
            </div>
          )}
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center gap-2">
          <button
            className="p-2 hover:bg-gray-100 rounded-full transition-colors duration-200"
            onClick={onStop}
            title="停止"
          >
            <Square size={20} />
          </button>
          <button
            className={`p-2 rounded-full transition-colors duration-200 ${
              isPlaying
                ? "bg-pink-500 text-white hover:bg-pink-600"
                : "hover:bg-gray-100"
            } ${isLoading ? "cursor-not-allowed" : "cursor-pointer"}`}
            onClick={onPlay}
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
            className={`p-2 rounded-full transition-colors duration-200 hover:bg-gray-100 ${
              removing ? "cursor-not-allowed" : "cursor-pointer"
            }`}
            onClick={handleRemove}
            disabled={removing}
            title={removing ? "处理中..." : "取消收藏"}
          >
            {removing ? (
              <Loader2 size={20} className="animate-spin" />
            ) : (
              <Trash2 size={20} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LikedMusicItem;
