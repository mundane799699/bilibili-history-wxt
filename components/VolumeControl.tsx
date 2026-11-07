import { useEffect, useState } from "react";
import { Howler } from "howler";
import { Volume1, Volume2, VolumeX } from "lucide-react";
import { MUSIC_VOLUME, MUSIC_VOLUME_BEFORE_MUTE } from "@/utils/constants";
import { getStorageValue, setStorageValue } from "@/utils/storage";

const DEFAULT_VOLUME = 0.8;

const clamp = (value: number) => Math.min(1, Math.max(0, value));

/**
 * 读取已保存的音量并应用到 Howler 全局音量。
 * Howler.volume 对之后新建的 Howl（含 html5 模式）同样生效，所以切歌后音量保持不变。
 */
export const useMusicVolume = () => {
  const [volume, setVolumeState] = useState(DEFAULT_VOLUME);
  const [lastVolume, setLastVolume] = useState(DEFAULT_VOLUME);

  useEffect(() => {
    Promise.all([
      getStorageValue<number>(MUSIC_VOLUME, DEFAULT_VOLUME),
      getStorageValue<number>(MUSIC_VOLUME_BEFORE_MUTE, DEFAULT_VOLUME),
    ]).then(([saved, beforeMute]) => {
      const next = clamp(Number(saved));
      setVolumeState(next);
      setLastVolume(clamp(Number(beforeMute)) || DEFAULT_VOLUME);
      Howler.volume(next);
    });
  }, []);

  const setVolume = (value: number) => {
    const next = clamp(value);
    setVolumeState(next);
    Howler.volume(next);
    void setStorageValue(MUSIC_VOLUME, next);
    if (next > 0) {
      setLastVolume(next);
      void setStorageValue(MUSIC_VOLUME_BEFORE_MUTE, next);
    }
  };

  const toggleMute = () => setVolume(volume > 0 ? 0 : lastVolume || DEFAULT_VOLUME);

  return { volume, setVolume, toggleMute };
};

export const VolumeControl = () => {
  const { volume, setVolume, toggleMute } = useMusicVolume();
  const percent = Math.round(volume * 100);
  const Icon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={toggleMute}
        className="rounded-full p-2 text-ink-soft transition-colors duration-200 hover:bg-wash dark:text-night-muted dark:hover:bg-night-line/60"
        title={volume === 0 ? "取消静音" : "静音"}
        aria-label={volume === 0 ? "取消静音" : "静音"}
      >
        <Icon size={20} />
      </button>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={percent}
        onChange={(event) => setVolume(Number(event.target.value) / 100)}
        className="volume-slider w-24"
        style={{ "--volume-percent": `${percent}%` } as React.CSSProperties}
        title={`音量 ${percent}%`}
        aria-label="音量"
      />
      <span className="w-8 text-right text-xs tabular-nums text-ink-muted dark:text-night-muted">
        {percent}
      </span>
    </div>
  );
};
