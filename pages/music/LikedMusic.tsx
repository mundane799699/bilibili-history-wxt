import { useState, useEffect } from "react";
import { useMusicPlayer } from "@/utils/musicPlayer";
import { VolumeControl } from "@/components/VolumeControl";
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

const LikedMusic = () => {
  const [likedMusic, setLikedMusic] = useState<LikedMusicType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 播放器在全局 store 中，切换到其他菜单也不会中断播放
  const current = useMusicPlayer((s) => s.current);
  const isPlaying = useMusicPlayer((s) => s.isPlaying);
  const isLoading = useMusicPlayer((s) => s.isLoading);
  const playError = useMusicPlayer((s) => s.error);
  const playMode = useMusicPlayer((s) => s.playMode);
  const play = useMusicPlayer((s) => s.play);
  const togglePlay = useMusicPlayer((s) => s.togglePlay);
  const next = useMusicPlayer((s) => s.next);
  const previous = useMusicPlayer((s) => s.previous);
  const cyclePlayMode = useMusicPlayer((s) => s.cyclePlayMode);
  const syncPlaylist = useMusicPlayer((s) => s.syncPlaylist);

  // 列表变化（如取消收藏）时同步到正在使用的播放列表
  useEffect(() => {
    syncPlaylist("liked", likedMusic);
  }, [likedMusic, syncPlaylist]);

  const handlePlay = (music: LikedMusicType) => {
    void play(music, likedMusic, "liked");
  };

  const handlePlayPause = () => {
    if (!current) {
      if (likedMusic.length > 0) handlePlay(likedMusic[0]);
      return;
    }
    togglePlay();
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

  const handleMusicRemoved = (bvid: string) => {
    setLikedMusic((prev) => prev.filter((music) => music.bvid !== bvid));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96 bg-wash/30 dark:bg-night">
        <div className="text-ink-muted dark:text-night-muted">加载中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-96 bg-wash/30 dark:bg-night">
        <div className="text-red-500 dark:text-red-400">{error}</div>
      </div>
    );
  }

  const currentMusic = current;
  const currentState = current ? { isPlaying, isLoading } : null;

  return (
    <div className="min-h-screen bg-wash/30 dark:bg-night">
      {/* 当前歌曲信息展示区域 */}
      <div className="sticky p-4 top-0 bg-white/90 dark:bg-night/90 backdrop-blur-md z-10 border-b border-line dark:border-night-line shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-semibold text-ink dark:text-night-text">我喜欢的音乐</h1>
              <span className="text-sm text-ink-muted dark:text-night-muted">
                ({likedMusic.length} 首)
              </span>
            </div>

            {/* 音乐控制栏 */}
            <div className="flex items-center justify-center gap-2">
              <button
                className="p-2 text-ink-soft dark:text-night-muted hover:bg-wash dark:hover:bg-night-line/60 rounded-full transition-colors duration-200 disabled:opacity-50"
                onClick={previous}
                disabled={!current || likedMusic.length === 0}
                title="上一首"
              >
                <SkipBack size={24} />
              </button>

              <button
                className={`p-2 rounded-full transition-colors duration-200 ${
                  currentState?.isPlaying
                    ? "bg-brand text-white hover:bg-brand-strong"
                    : "bg-wash dark:bg-night-line text-ink-soft dark:text-night-text hover:bg-wash dark:hover:bg-night-line/60"
                } ${currentState?.isLoading ? "cursor-not-allowed" : "cursor-pointer"}`}
                onClick={handlePlayPause}
                disabled={currentState?.isLoading}
                title={
                  currentState?.isLoading ? "加载中..." : currentState?.isPlaying ? "暂停" : "播放"
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
                className="p-2 text-ink-soft dark:text-night-muted hover:bg-wash dark:hover:bg-night-line/60 rounded-full transition-colors duration-200 disabled:opacity-50"
                onClick={next}
                disabled={!current || likedMusic.length === 0}
                title="下一首"
              >
                <SkipForward size={24} />
              </button>

              {/* 播放模式切换按钮 */}
              <button
                className={`p-2 rounded-full transition-colors duration-200 ${
                  playMode === "order"
                    ? "hover:bg-wash dark:hover:bg-night-line/60 text-ink-soft dark:text-night-muted"
                    : "bg-brand-soft dark:bg-brand/10 text-brand dark:text-brand hover:bg-pink-200 dark:hover:bg-brand/20"
                }`}
                onClick={cyclePlayMode}
                title={getPlayModeText()}
              >
                {getPlayModeIcon()}
              </button>

              <div className="ml-2 border-l border-line pl-2 dark:border-night-line">
                <VolumeControl />
              </div>
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
                  className="block text-sm font-medium text-ink dark:text-night-text hover:text-brand-strong dark:hover:text-brand truncate cursor-pointer"
                >
                  {currentMusic.title}
                </a>
                <a
                  href={`https://space.bilibili.com/${currentMusic.mid}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-ink-muted dark:text-night-muted hover:text-brand-strong dark:hover:text-brand truncate cursor-pointer"
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
                isPlaying={current?.bvid === music.bvid && isPlaying}
                isLoading={current?.bvid === music.bvid && isLoading}
                playError={playError?.bvid === music.bvid ? playError.message : undefined}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center min-h-96">
          <div className="text-ink-muted dark:text-night-muted">暂无喜欢的音乐</div>
        </div>
      )}
    </div>
  );
};

export default LikedMusic;
