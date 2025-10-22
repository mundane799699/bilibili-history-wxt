import { useState, useEffect, useRef } from "react";
import { Howl } from "howler";
import {
  SkipBack,
  Play,
  Pause,
  SkipForward,
  Loader2,
  Repeat,
  Repeat1,
  Shuffle,
} from "lucide-react";
import { getAllLikedMusic } from "../../utils/db";
import { LikedMusic as LikedMusicType } from "../../utils/types";
import LikedMusicItem from "../../components/LikedMusicItem";
import { getStorageValue, setStorageValue } from "../../utils/storage";

type PlayMode = "order" | "loop" | "random";

const LikedMusic = () => {
  const [likedMusic, setLikedMusic] = useState<LikedMusicType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 音频播放状态管理
  const [currentPlaying, setCurrentPlaying] = useState<string | null>(null);
  const [playingStates, setPlayingStates] = useState<
    Record<string, { isPlaying: boolean; isLoading: boolean; error?: string }>
  >({});
  const [playMode, setPlayMode] = useState<PlayMode>("order"); // 播放模式：顺序、单曲循环、随机
  const playModeRef = useRef<PlayMode>(playMode); // 用于存储最新的播放模式，避免闭包问题
  const howlRef = useRef<Howl | null>(null);

  // 同步 playMode 到 ref，确保始终获取最新值
  useEffect(() => {
    playModeRef.current = playMode;
  }, [playMode]);

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

  // 处理歌曲播放结束后的自动切换逻辑
  const handleMusicEnd = (endedBvid: string) => {
    console.log("endedBvid:", endedBvid);
    setPlayingStates((prev) => ({
      ...prev,
      [endedBvid]: { isPlaying: false, isLoading: false },
    }));

    console.log("当前播放模式:", playModeRef.current);
    // 单曲循环模式：重新播放当前歌曲
    if (playModeRef.current === "loop") {
      const currentMusic = likedMusic.find((music) => music.bvid === endedBvid);
      console.log("currentMusic:", currentMusic);
      if (currentMusic) {
        console.log("单曲循环，重新播放:", currentMusic.title);
        setTimeout(() => {
          handlePlay(currentMusic);
        }, 500);
      }
      return;
    }

    // 找到当前音乐在播放列表中的索引
    const currentIndex = likedMusic.findIndex(
      (music) => music.bvid === endedBvid
    );

    // 随机播放模式
    if (playModeRef.current === "random") {
      if (likedMusic.length > 1) {
        // 随机选择一首不是当前歌曲的音乐
        let randomIndex;
        do {
          randomIndex = Math.floor(Math.random() * likedMusic.length);
        } while (randomIndex === currentIndex && likedMusic.length > 1);

        const nextMusic = likedMusic[randomIndex];
        console.log("随机播放下一首:", nextMusic.title);
        setTimeout(() => {
          handlePlay(nextMusic);
        }, 500);
      }
      return;
    }

    // 顺序播放模式
    if (currentIndex >= 0 && currentIndex < likedMusic.length - 1) {
      // 如果有下一首歌，自动播放
      const nextMusic = likedMusic[currentIndex + 1];
      console.log("自动播放下一首:", nextMusic.title);
      setTimeout(() => {
        handlePlay(nextMusic);
      }, 500); // 延迟500ms播放下一首，避免状态冲突
    } else {
      // 如果没有下一首歌，停止播放
      console.log("播放列表结束，停止播放");
      setCurrentPlaying(null);
    }
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
        console.log("当前点击的音乐正在播放");
        return;
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
          handleMusicEnd(bvid);
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

    // 随机播放模式：随机选择下一首
    if (playMode === "random") {
      if (likedMusic.length > 1) {
        let randomIndex;
        do {
          randomIndex = Math.floor(Math.random() * likedMusic.length);
        } while (randomIndex === currentIndex && likedMusic.length > 1);
        handlePlay(likedMusic[randomIndex]);
      }
      return;
    }

    // 顺序播放和单曲循环模式：都按顺序切换到下一首
    if (currentIndex < likedMusic.length - 1) {
      handlePlay(likedMusic[currentIndex + 1]);
    } else {
      // 如果是最后一首，跳到第一首
      handlePlay(likedMusic[0]);
    }
  };

  const togglePlayMode = () => {
    setPlayMode((prevMode) => {
      if (prevMode === "order") {
        return "loop";
      } else if (prevMode === "loop") {
        return "random";
      } else {
        return "order";
      }
    });
  };

  const getPlayModeIcon = () => {
    switch (playMode) {
      case "order":
        return <Repeat size={20} />;
      case "loop":
        return <Repeat1 size={20} />;
      case "random":
        return <Shuffle size={20} />;
    }
  };

  const getPlayModeText = () => {
    switch (playMode) {
      case "order":
        return "顺序播放";
      case "loop":
        return "单曲循环";
      case "random":
        return "随机播放";
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

  // 加载喜欢的音乐列表
  useEffect(() => {
    loadLikedMusic();
  }, []);

  // 从本地存储加载播放模式
  useEffect(() => {
    const loadPlayMode = async () => {
      const savedMode = await getStorageValue<PlayMode>('music_play_mode', 'order');
      setPlayMode(savedMode);
    };
    loadPlayMode();
  }, []);

  // 当播放模式改变时保存到本地存储
  useEffect(() => {
    setStorageValue('music_play_mode', playMode);
  }, [playMode]);

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
                className={`p-2 rounded-full transition-colors duration-200 ${
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

              {/* 播放模式切换按钮 */}
              <button
                className={`p-2 rounded-full transition-colors duration-200 ${
                  playMode === "order"
                    ? "hover:bg-gray-100 text-gray-600"
                    : "bg-pink-100 text-pink-500 hover:bg-pink-200"
                }`}
                onClick={togglePlayMode}
                title={getPlayModeText()}
              >
                {getPlayModeIcon()}
              </button>
            </div>
          </div>

          {/* 当前播放信息 */}
          {currentMusic && (
            <div className="flex items-center gap-4 w-96">
              <img
                src={currentMusic.pic}
                alt={currentMusic.title}
                className="w-16 h-10 object-cover rounded-lg"
              />
              <div className="min-w-0">
                <a
                  href={`https://www.bilibili.com/video/${currentMusic.bvid}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-sm font-medium text-gray-900 truncate cursor-pointer"
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
