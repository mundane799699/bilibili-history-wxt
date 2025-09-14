import { useState, useEffect, useRef } from "react";
import { Howl } from "howler";
import { getAllLikedMusic } from "../../utils/db";
import { LikedMusic as LikedMusicType } from "../../utils/types";
import LikedMusicItem from "../../components/LikedMusicItem";

const LikedMusic = () => {
  const [likedMusic, setLikedMusic] = useState<LikedMusicType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 音频播放状态管理
  const [currentPlaying, setCurrentPlaying] = useState<string | null>(null);
  const [playingStates, setPlayingStates] = useState<Record<string, { isPlaying: boolean; isLoading: boolean; error?: string }>>({});
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
      setPlayingStates(prev => ({
        ...prev,
        [bvid]: { ...prev[bvid], error: undefined }
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
        setPlayingStates(prev => ({
          ...prev,
          [currentPlaying]: { ...prev[currentPlaying], isPlaying: false, isLoading: false }
        }));
      }

      // 设置加载状态
      setPlayingStates(prev => ({
        ...prev,
        [bvid]: { isPlaying: false, isLoading: true }
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
          setPlayingStates(prev => ({
            ...prev,
            [bvid]: { isPlaying: false, isLoading: false }
          }));
        },
        onplay: () => {
          setPlayingStates(prev => ({
            ...prev,
            [bvid]: { isPlaying: true, isLoading: false }
          }));
        },
        onpause: () => {
          setPlayingStates(prev => ({
            ...prev,
            [bvid]: { isPlaying: false, isLoading: false }
          }));
        },
        onend: () => {
          setPlayingStates(prev => ({
            ...prev,
            [bvid]: { isPlaying: false, isLoading: false }
          }));
          setCurrentPlaying(null);
        },
        onplayerror: (_id: any, error: any) => {
          console.error("播放错误:", error);
          setPlayingStates(prev => ({
            ...prev,
            [bvid]: { isPlaying: false, isLoading: false, error: "音频播放失败" }
          }));
          setCurrentPlaying(null);
        },
        onloaderror: (_id: any, error: any) => {
          console.error("加载错误:", error);
          setPlayingStates(prev => ({
            ...prev,
            [bvid]: { isPlaying: false, isLoading: false, error: "音频加载失败" }
          }));
          setCurrentPlaying(null);
        },
      });

      // 播放音频
      howlRef.current.play();
    } catch (error) {
      console.error("播放失败:", error);
      setPlayingStates(prev => ({
        ...prev,
        [music.bvid]: {
          isPlaying: false,
          isLoading: false,
          error: error instanceof Error ? error.message : "播放失败"
        }
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
    setPlayingStates(prev => ({
      ...prev,
      [bvid]: { isPlaying: false, isLoading: false }
    }));
    setCurrentPlaying(null);
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

  return (
    <div className="">
      {/* 当前歌曲信息展示区域 */}
      <div className="flex items-center gap-4 sticky p-4 top-0 bg-white z-10 border-b border-gray-200">
        <h1 className="text-xl font-semibold text-gray-800">我喜欢的音乐</h1>
        <span className="text-sm text-gray-500">({likedMusic.length} 首)</span>
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
