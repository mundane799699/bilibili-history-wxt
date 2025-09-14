import { Play, Pause, Loader2, Square, Trash2 } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { Howl } from "howler";
import dayjs from "dayjs";
import { deleteLikedMusic } from "../utils/db";
import { LikedMusic } from "../utils/types";

interface LikedMusicItemProps {
  music: LikedMusic;
  onRemoved?: () => void;
}

const LikedMusicItem = ({ music, onRemoved }: LikedMusicItemProps) => {
  // 音频播放状态管理
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const howlRef = useRef<Howl | null>(null);

  // 取消收藏状态管理
  const [removing, setRemoving] = useState(false);

  // 组件卸载时清理音频资源
  useEffect(() => {
    return () => {
      if (howlRef.current) {
        howlRef.current.stop();
        howlRef.current.unload();
      }
    };
  }, []);

  // 格式化时间戳
  const formatDate = (timestamp: number): string => {
    return dayjs(timestamp).format("YYYY-MM-DD HH:mm:ss");
  };

  const handlePlay = async () => {
    try {
      setError(null);

      // 如果已经有音频实例且正在播放，则暂停
      if (isPlaying && howlRef.current) {
        howlRef.current.pause();
        setIsPlaying(false);
        return;
      }

      // 如果已经有音频实例但暂停了，则继续播放
      if (howlRef.current && !isPlaying) {
        howlRef.current.play();
        return;
      }

      // 如果没有音频实例，则创建新的
      setIsLoading(true);

      // 获取视频信息
      const response = await fetch(
        `https://api.bilibili.com/x/web-interface/view?bvid=${music.bvid}`
      );
      const { data, code, message } = await response.json();
      if (code !== 0) {
        throw new Error(message || "获取视频信息失败");
      }
      const { cid } = data;

      // 获取播放地址
      const response2 = await fetch(
        `https://api.bilibili.com/x/player/playurl?fnval=16&bvid=${music.bvid}&cid=${cid}`
      );
      const {
        data: data2,
        code: code2,
        message: message2,
      } = await response2.json();
      if (code2 !== 0) {
        throw new Error(message2 || "获取播放地址失败");
      }

      const { dash } = data2;
      if (!dash || !dash.audio || dash.audio.length === 0) {
        throw new Error("未找到音频流");
      }

      const url = getUpUrl(dash.audio[0]);

      // 创建新的Howl实例
      howlRef.current = new Howl({
        src: [url],
        format: ["m4a", "mp3"],
        html5: true,
        onload: () => {
          setIsLoading(false);
        },
        onplay: () => {
          setIsPlaying(true);
          setIsLoading(false);
        },
        onpause: () => {
          setIsPlaying(false);
        },
        onend: () => {
          setIsPlaying(false);
          setIsLoading(false);
        },
        onplayerror: (id: any, error: any) => {
          console.error("播放错误:", error);
          setError("音频播放失败");
          setIsPlaying(false);
          setIsLoading(false);
        },
        onloaderror: (id: any, error: any) => {
          console.error("加载错误:", error);
          setError("音频加载失败");
          setIsPlaying(false);
          setIsLoading(false);
        },
      });

      // 播放音频
      howlRef.current.play();
    } catch (error) {
      console.error("播放失败:", error);
      setError(error instanceof Error ? error.message : "播放失败");
      setIsPlaying(false);
      setIsLoading(false);
    }
  };

  const handleStop = () => {
    if (howlRef.current) {
      howlRef.current.stop();
      howlRef.current.unload();
      howlRef.current = null;
    }
    setIsPlaying(false);
    setIsLoading(false);
    setError(null);
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
      setError(error instanceof Error ? error.message : "取消收藏失败");
    } finally {
      setRemoving(false);
    }
  };

  const getUpUrl = (obj: any) => {
    const url1 = obj.baseUrl || "";
    const url2 = obj.backup_url?.[0] || "";
    const url3 = obj.backup_url?.[1] || "";

    // 找到第一个不是https://xy 开头的url
    const urlList = [url1, url2, url3].filter(
      (url) => !url.startsWith("https://xy")
    );
    return urlList[0] || url1;
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
          {error && (
            <div className="text-red-500 text-xs mb-2 flex items-center gap-1">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center gap-2">
          <button
            className="p-2 hover:bg-gray-100 rounded-full transition-colors duration-200"
            onClick={handleStop}
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
            onClick={handlePlay}
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
