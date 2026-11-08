import { create } from "zustand";
import { Howl } from "howler";
import { getAudioUrl } from "@/utils/biliAudio";
import { getStorageValue, setStorageValue } from "@/utils/storage";

/**
 * 全局音乐播放器。
 *
 * Howl 实例放在模块作用域而不是某个页面组件里，这样在 my-history 内切换路由时
 * 页面组件卸载也不会中断播放，可以一边浏览历史记录一边听歌。
 * 「我喜欢的音乐」「搜索」页面和全局迷你播放条（MiniPlayer）共用这一份状态。
 */

export type PlayMode = "order" | "loop" | "random";

/** 播放列表来源：用于在「我喜欢的音乐」列表变化（如取消收藏）时同步播放列表 */
export type PlaylistSource = "liked" | "search";

export interface PlayerTrack {
  bvid: string;
  title: string;
  author: string;
  mid: number;
  pic: string;
}

interface MusicPlayerState {
  playlist: PlayerTrack[];
  source: PlaylistSource | null;
  current: PlayerTrack | null;
  isPlaying: boolean;
  isLoading: boolean;
  /** 最近一次播放失败的歌曲与原因 */
  error: { bvid: string; message: string } | null;
  playMode: PlayMode;

  /** 播放指定歌曲；传入 playlist 时同时替换播放列表 */
  play: (track: PlayerTrack, playlist?: PlayerTrack[], source?: PlaylistSource) => Promise<void>;
  togglePlay: () => void;
  next: () => void;
  previous: () => void;
  stop: () => void;
  cyclePlayMode: () => void;
  /** 来源一致时更新播放列表（不影响当前播放） */
  syncPlaylist: (source: PlaylistSource, playlist: PlayerTrack[]) => void;
}

const PLAY_MODE_KEY = "music_play_mode";

let howl: Howl | null = null;
/** 每次切歌自增，用于丢弃过期的异步请求结果（快速连点切歌时） */
let playToken = 0;

const releaseHowl = () => {
  if (!howl) return;
  howl.stop();
  howl.unload();
  howl = null;
};

const fetchAudioUrl = async (bvid: string): Promise<string> => {
  const viewRes = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, {
    credentials: "include",
  });
  const view = await viewRes.json();
  if (view.code !== 0) throw new Error(view.message || "获取视频信息失败");

  const playRes = await fetch(
    `https://api.bilibili.com/x/player/playurl?fnval=16&bvid=${bvid}&cid=${view.data.cid}`,
    { credentials: "include" },
  );
  const playurl = await playRes.json();
  if (playurl.code !== 0) throw new Error(playurl.message || "获取播放地址失败");

  const audio = playurl.data?.dash?.audio;
  if (!audio || audio.length === 0) throw new Error("未找到音频流");
  return getAudioUrl(audio[0]);
};

const pickRandomIndex = (length: number, exclude: number) => {
  if (length <= 1) return 0;
  let index;
  do {
    index = Math.floor(Math.random() * length);
  } while (index === exclude);
  return index;
};

export const useMusicPlayer = create<MusicPlayerState>((set, get) => {
  const fail = (bvid: string, message: string) => {
    set({ isPlaying: false, isLoading: false, error: { bvid, message } });
  };

  /** 播放结束后按播放模式决定下一首 */
  const handleEnd = () => {
    const { playMode, playlist, current } = get();
    set({ isPlaying: false });
    if (!current) return;

    if (playMode === "loop") {
      howl?.play();
      return;
    }

    const index = playlist.findIndex((t) => t.bvid === current.bvid);
    if (playMode === "random") {
      if (playlist.length > 1) void get().play(playlist[pickRandomIndex(playlist.length, index)]);
      return;
    }

    // 顺序播放：到列表末尾就停下
    if (index >= 0 && index < playlist.length - 1) {
      void get().play(playlist[index + 1]);
    }
  };

  return {
    playlist: [],
    source: null,
    current: null,
    isPlaying: false,
    isLoading: false,
    error: null,
    playMode: "order",

    play: async (track, playlist, source) => {
      if (playlist) set({ playlist, source: source ?? null });

      // 点击的就是当前歌曲：已暂停则继续，正在播放则保持
      if (get().current?.bvid === track.bvid && howl) {
        if (!get().isPlaying) howl.play();
        return;
      }

      const token = ++playToken;
      releaseHowl();
      set({ current: track, isPlaying: false, isLoading: true, error: null });

      try {
        const url = await fetchAudioUrl(track.bvid);
        if (token !== playToken) return;

        const instance = new Howl({
          src: [url],
          format: ["m4a", "mp3"],
          html5: true,
          onplay: () => set({ isPlaying: true, isLoading: false }),
          onpause: () => set({ isPlaying: false }),
          onstop: () => set({ isPlaying: false }),
          onend: handleEnd,
          onplayerror: (_id, err) => {
            console.error("播放错误:", err);
            if (howl === instance) fail(track.bvid, "音频播放失败");
          },
          onloaderror: (_id, err) => {
            console.error("加载错误:", err);
            if (howl === instance) fail(track.bvid, "音频加载失败");
          },
        });
        howl = instance;
        instance.play();
      } catch (err) {
        if (token !== playToken) return;
        console.error("播放失败:", err);
        fail(track.bvid, err instanceof Error ? err.message : "播放失败");
      }
    },

    togglePlay: () => {
      const { current, isPlaying, isLoading, playlist } = get();
      if (isLoading) return;
      if (!current || !howl) {
        const target = current ?? playlist[0];
        if (target) void get().play(target);
        return;
      }
      if (isPlaying) howl.pause();
      else howl.play();
    },

    next: () => {
      const { playlist, current, playMode } = get();
      if (playlist.length === 0) return;
      const index = current ? playlist.findIndex((t) => t.bvid === current.bvid) : -1;
      const nextIndex =
        playMode === "random"
          ? pickRandomIndex(playlist.length, index)
          : (index + 1) % playlist.length;
      void get().play(playlist[nextIndex]);
    },

    previous: () => {
      const { playlist, current } = get();
      if (playlist.length === 0) return;
      const index = current ? playlist.findIndex((t) => t.bvid === current.bvid) : 0;
      const prevIndex = index > 0 ? index - 1 : playlist.length - 1;
      void get().play(playlist[prevIndex]);
    },

    stop: () => {
      playToken++;
      releaseHowl();
      set({ current: null, isPlaying: false, isLoading: false, error: null });
    },

    cyclePlayMode: () => {
      const order: PlayMode[] = ["order", "loop", "random"];
      const next = order[(order.indexOf(get().playMode) + 1) % order.length];
      set({ playMode: next });
      void setStorageValue(PLAY_MODE_KEY, next);
    },

    syncPlaylist: (source, playlist) => {
      if (get().source === source) set({ playlist });
    },
  };
});

void getStorageValue<PlayMode>(PLAY_MODE_KEY, "order").then((mode) => {
  useMusicPlayer.setState({ playMode: mode });
});
