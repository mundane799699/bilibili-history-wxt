import { useState, useEffect, useRef } from "react";
import { Howl } from "howler";
import { SkipBack, Play, Pause, SkipForward, Loader2 } from "lucide-react";
import { getAllLikedMusic } from "../../utils/db";
import { LikedMusic as LikedMusicType } from "../../utils/types";
import LikedMusicItem from "../../components/LikedMusicItem";

const LikedMusic = () => {
  const [likedMusic, setLikedMusic] = useState<LikedMusicType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 音频播放状态管理
  const [currentPlaying, setCurrentPlaying] = useState<string | null>(null);
  const [playingStates, setPlayingStates] = useState<
    Record<string, { isPlaying: boolean; isLoading: boolean; error?: string }>
  >({});
  const howlRef = useRef<Howl | null>(null);

  // 组件卸载时清理音频资源
  useEffect(() => {
    return () => {
      if (howlRef.current) {
        howlRef.current.stop();
        howlRef.current.unload();
      }
    };
  }, []);

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

  const handlePlay = async (music: LikedMusicType) => {
    try {
      const bvid = music.bvid;

      // 更新状态：清除错误信息
      setPlayingStates((prev) => ({
        ...prev,
        [bvid]: { ...prev[bvid], error: undefined },
      }));

      // 如果当前音乐正在播放，则暂停
      if (currentPlaying === bvid && howlRef.current) {
        const currentState = playingStates[bvid];
        if (currentState?.isPlaying) {
          howlRef.current.pause();
          return;
        } else {
          // 如果是暂停状态，继续播放
          howlRef.current.play();
          return;
        }
      }

      // 如果有其他音乐在播放，先停止并重置其状态
      if (howlRef.current && currentPlaying) {
        howlRef.current.stop();
        howlRef.current.unload();
        howlRef.current = null;

        // 重置前一首音乐的播放状态
        setPlayingStates((prev) => ({
          ...prev,
          [currentPlaying]: {
            ...prev[currentPlaying],
            isPlaying: false,
            isLoading: false,
          },
        }));
      }

      // 设置加载状态
      setPlayingStates((prev) => ({
        ...prev,
        [bvid]: { isPlaying: false, isLoading: true },
      }));
      setCurrentPlaying(bvid);

      // 获取视频信息
      const response = await fetch(
        `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`
      );
      const { data, code, message } = await response.json();
      if (code !== 0) {
        throw new Error(message || "获取视频信息失败");
      }
      const { cid } = data;

      // 获取播放地址
      const response2 = await fetch(
        `https://api.bilibili.com/x/player/playurl?fnval=16&bvid=${bvid}&cid=${cid}`
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
          setPlayingStates((prev) => ({
            ...prev,
            [bvid]: { isPlaying: false, isLoading: false },
          }));
        },
        onplay: () => {
          setPlayingStates((prev) => ({
            ...prev,
            [bvid]: { isPlaying: true, isLoading: false },
          }));
        },
        onpause: () => {
          setPlayingStates((prev) => ({
            ...prev,
            [bvid]: { isPlaying: false, isLoading: false },
          }));
        },
        onend: () => {
          setPlayingStates((prev) => ({
            ...prev,
            [bvid]: { isPlaying: false, isLoading: false },
          }));
          setCurrentPlaying(null);
        },
        onplayerror: (_id: any, error: any) => {
          console.error("播放错误:", error);
          setPlayingStates((prev) => ({
            ...prev,
            [bvid]: {
              isPlaying: false,
              isLoading: false,
              error: "音频播放失败",
            },
          }));
          setCurrentPlaying(null);
        },
        onloaderror: (_id: any, error: any) => {
          console.error("加载错误:", error);
          setPlayingStates((prev) => ({
            ...prev,
            [bvid]: {
              isPlaying: false,
              isLoading: false,
              error: "音频加载失败",
            },
          }));
          setCurrentPlaying(null);
        },
      });

      // 播放音频
      howlRef.current.play();
    } catch (error) {
      console.error("播放失败:", error);
      setPlayingStates((prev) => ({
        ...prev,
        [music.bvid]: {
          isPlaying: false,
          isLoading: false,
          error: error instanceof Error ? error.message : "播放失败",
        },
      }));
      setCurrentPlaying(null);
    }
  };

  const handleStop = (bvid: string) => {
    if (howlRef.current && currentPlaying === bvid) {
      howlRef.current.stop();
      howlRef.current.unload();
      howlRef.current = null;
    }
    setPlayingStates((prev) => ({
      ...prev,
      [bvid]: { isPlaying: false, isLoading: false },
    }));
    setCurrentPlaying(null);
  };

  const handlePlayPause = () => {
    if (!currentPlaying) {
      // 如果没有播放音乐，播放第一首
      if (likedMusic.length > 0) {
        handlePlay(likedMusic[0]);
      }
      return;
    }

    // 如果有音乐正在播放，切换播放/暂停状态
    const currentState = playingStates[currentPlaying];
    if (currentState?.isPlaying) {
      if (howlRef.current) {
        howlRef.current.pause();
      }
    } else {
      if (howlRef.current) {
        howlRef.current.play();
      }
    }
  };

  const handlePrevious = () => {
    if (!currentPlaying || likedMusic.length === 0) return;

    const currentIndex = likedMusic.findIndex(
      (music) => music.bvid === currentPlaying
    );
    if (currentIndex > 0) {
      handlePlay(likedMusic[currentIndex - 1]);
    } else {
      // 如果是第一首，跳到最后一首
      handlePlay(likedMusic[likedMusic.length - 1]);
    }
  };

  const handleNext = () => {
    if (!currentPlaying || likedMusic.length === 0) return;

    const currentIndex = likedMusic.findIndex(
      (music) => music.bvid === currentPlaying
    );
    if (currentIndex < likedMusic.length - 1) {
      handlePlay(likedMusic[currentIndex + 1]);
    } else {
      // 如果是最后一首，跳到第一首
      handlePlay(likedMusic[0]);
    }
  };

  const loadLikedMusic = async () => {
    try {
      setLoading(true);
      const musicList = await getAllLikedMusic();
      setLikedMusic(musicList);
    } catch (err) {
      console.error("加载喜欢音乐失败:", err);
      setError("加载喜欢音乐失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLikedMusic();
  }, []);

  const handleMusicRemoved = (bvid: string) => {
    setLikedMusic((prev) => prev.filter((music) => music.bvid !== bvid));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-red-500">{error}</div>
      </div>
    );
  }

  // 获取当前播放的音乐信息
  const currentMusic = currentPlaying
    ? likedMusic.find((music) => music.bvid === currentPlaying)
    : null;
  const currentState = currentPlaying ? playingStates[currentPlaying] : null;

  return (
    <div className="min-h-screen">
      {/* 当前歌曲信息展示区域 */}
      <div className="sticky p-4 top-0 bg-white z-10 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-semibold text-gray-800">
                我喜欢的音乐
              </h1>
              <span className="text-sm text-gray-500">
                ({likedMusic.length} 首)
              </span>
            </div>

            {/* 音乐控制栏 */}
            <div className="flex items-center justify-center gap-2">
              <button
                className="p-2 hover:bg-gray-100 rounded-full transition-colors duration-200 disabled:opacity-50"
                onClick={handlePrevious}
                disabled={!currentPlaying || likedMusic.length === 0}
                title="上一首"
              >
                <SkipBack size={24} />
              </button>

              <button
                className={`p-3 rounded-full transition-colors duration-200 ${
                  currentState?.isPlaying
                    ? "bg-pink-500 text-white hover:bg-pink-600"
                    : "bg-gray-100 hover:bg-gray-200"
                } ${
                  currentState?.isLoading
                    ? "cursor-not-allowed"
                    : "cursor-pointer"
                }`}
                onClick={handlePlayPause}
                disabled={currentState?.isLoading}
                title={
                  currentState?.isLoading
                    ? "加载中..."
                    : currentState?.isPlaying
                    ? "暂停"
                    : "播放"
                }
              >
                {currentState?.isLoading ? (
                  <Loader2 size={24} className="animate-spin" />
                ) : currentState?.isPlaying ? (
                  <Pause size={24} />
                ) : (
                  <Play size={24} />
                )}
              </button>

              <button
                className="p-2 hover:bg-gray-100 rounded-full transition-colors duration-200 disabled:opacity-50"
                onClick={handleNext}
                disabled={!currentPlaying || likedMusic.length === 0}
                title="下一首"
              >
                <SkipForward size={24} />
              </button>
            </div>
          </div>

          {/* 当前播放信息 */}
          {currentMusic && (
            <div className="flex items-center gap-4">
              <img
                src={currentMusic.pic}
                alt={currentMusic.title}
                className="w-32 h-20 object-cover rounded-lg"
              />
              <div className="min-w-0 max-w-xs">
                <a
                  href={`https://www.bilibili.com/video/${currentMusic.bvid}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-gray-900 truncate cursor-pointer"
                >
                  {currentMusic.title}
                </a>
                <a
                  href={`https://space.bilibili.com/${currentMusic.mid}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-gray-500 truncate cursor-pointer"
                >
                  {currentMusic.author}
                </a>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 歌单列表 */}
      {likedMusic.length > 0 ? (
        <div className="mx-auto max-w-6xl p-4">
          <div className="space-y-4">
            {likedMusic.map((music) => (
              <LikedMusicItem
                key={music.bvid}
                music={music}
                onRemoved={() => handleMusicRemoved(music.bvid)}
                onPlay={() => handlePlay(music)}
                onStop={() => handleStop(music.bvid)}
                isPlaying={playingStates[music.bvid]?.isPlaying || false}
                isLoading={playingStates[music.bvid]?.isLoading || false}
                playError={playingStates[music.bvid]?.error}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center min-h-96">
          <div className="text-gray-500">暂无喜欢的音乐</div>
        </div>
      )}
    </div>
  );
};

export default LikedMusic;
