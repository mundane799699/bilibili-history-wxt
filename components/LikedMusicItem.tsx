import { Play, Pause, Loader2, Square, Trash2 } from "lucide-react";
import { useState } from "react";
import dayjs from "dayjs";
import { deleteLikedMusic } from "../utils/db";
import { LikedMusic } from "../utils/types";

interface LikedMusicItemProps {
  music: LikedMusic;
  onRemoved?: () => void;
  onPlay: () => void;
  isPlaying: boolean;
  isLoading: boolean;
  playError?: string;
}

// 波动动画组件
const WaveAnimation = () => {
  return (
    <div className="flex items-center justify-center space-x-1">
      <div
        className="w-1 h-4 bg-pink-500 rounded-full animate-pulse"
        style={{
          animationDelay: "0ms",
          animationDuration: "800ms",
        }}
      ></div>
      <div
        className="w-1 h-6 bg-pink-500 rounded-full animate-pulse"
        style={{
          animationDelay: "200ms",
          animationDuration: "800ms",
        }}
      ></div>
      <div
        className="w-1 h-3 bg-pink-500 rounded-full animate-pulse"
        style={{
          animationDelay: "400ms",
          animationDuration: "800ms",
        }}
      ></div>
      <div
        className="w-1 h-5 bg-pink-500 rounded-full animate-pulse"
        style={{
          animationDelay: "600ms",
          animationDuration: "800ms",
        }}
      ></div>
    </div>
  );
};

const LikedMusicItem = ({
  music,
  onRemoved,
  onPlay,
  isPlaying,
  playError,
}: LikedMusicItemProps) => {
  // 取消收藏状态管理
  const [removing, setRemoving] = useState(false);

  // 格式化时间戳
  const formatDate = (timestamp: number): string => {
    return dayjs(timestamp).format("YYYY-MM-DD HH:mm:ss");
  };

  const handleRemove = async (e: React.MouseEvent) => {
    e.stopPropagation();
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
    <div
      className="bg-white rounded-lg shadow-md hover:shadow-lg hover:bg-gray-50 transition-shadow duration-300 overflow-hidden cursor-pointer"
      onClick={() => onPlay()}
    >
      <div className="flex gap-4 p-4 items-center">
        {/* 音乐封面 */}
        <div className="flex-shrink-0 w-32 h-20 relative">
          <img
            src={music.pic}
            alt={music.title}
            className="w-full h-full object-cover rounded-lg"
          />
          {/* 播放状态指示器 */}
          {isPlaying && (
            <div className="absolute inset-0 bg-black bg-opacity-30 rounded-lg flex items-center justify-center">
              <WaveAnimation />
            </div>
          )}
        </div>

        {/* 音乐信息 */}
        <div className="flex-1 min-w-0">
          {/* 标题 */}
          <div className="truncate">
            <a
              href={`https://www.bilibili.com/video/${music.bvid}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-lg font-semibold text-gray-900 mb-2  hover:text-pink-600 cursor-pointer"
              onClick={(e) => e.stopPropagation()}
            >
              {music.title}
            </a>
          </div>

          {/* UP主信息 */}
          <div className="flex items-center gap-2 mb-2">
            <a
              href={`https://space.bilibili.com/${music.mid}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-gray-600 hover:text-pink-600 cursor-pointer"
              onClick={(e) => e.stopPropagation()}
            >
              {music.author}
            </a>
            <span className="text-xs text-gray-400">收藏于 {formatDate(music.added_at)}</span>
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
            className={`p-2 rounded-full transition-colors duration-200 hover:bg-gray-100 ${
              removing ? "cursor-not-allowed" : "cursor-pointer"
            }`}
            onClick={handleRemove}
            disabled={removing}
            title={removing ? "处理中..." : "取消收藏"}
          >
            {removing ? <Loader2 size={20} className="animate-spin" /> : <Trash2 size={20} />}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LikedMusicItem;
