import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { GripVertical, Loader2, Pause, Play, SkipBack, SkipForward, X } from "lucide-react";
import { useMusicPlayer } from "@/utils/musicPlayer";
import { MINI_PLAYER_POSITION } from "@/utils/constants";
import { getStorageValue, setStorageValue } from "@/utils/storage";

/** 「我喜欢的音乐」页自带完整控制栏，不再重复显示迷你播放条 */
const HIDDEN_PATHS = ["/music/liked"];

/** 与视口边缘保持的最小距离 */
const EDGE_MARGIN = 8;
/** 指针移动超过这个距离才算拖拽，避免误伤点击 */
const DRAG_THRESHOLD = 4;

type Position = { x: number; y: number };

/** 模块级缓存：播放条卸载再挂载（如切到「我喜欢的音乐」再切回）时不必重新读 storage，避免位置闪动 */
let cachedPosition: Position | null | undefined;

const clampToViewport = (pos: Position, el: HTMLElement): Position => {
  const maxX = window.innerWidth - el.offsetWidth - EDGE_MARGIN;
  const maxY = window.innerHeight - el.offsetHeight - EDGE_MARGIN;
  return {
    x: Math.round(Math.min(Math.max(EDGE_MARGIN, pos.x), Math.max(EDGE_MARGIN, maxX))),
    y: Math.round(Math.min(Math.max(EDGE_MARGIN, pos.y), Math.max(EDGE_MARGIN, maxY))),
  };
};

/**
 * 拖拽位置管理：按住播放条空白处（或左侧把手）拖动，松手后位置持久化；双击把手恢复默认位置。
 */
const useDraggablePosition = (enabled: boolean) => {
  const barRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<Position | null>(cachedPosition ?? null);
  const [dragging, setDragging] = useState(false);
  /** 本次按下后是否发生了拖拽，用于拦截松手时触发的链接点击 */
  const draggedRef = useRef(false);

  useEffect(() => {
    if (cachedPosition !== undefined) return;
    void getStorageValue<Position | null>(MINI_PLAYER_POSITION, null).then((saved) => {
      cachedPosition = saved;
      setPosition(saved);
    });
  }, []);

  const commit = useCallback((next: Position | null) => {
    cachedPosition = next;
    setPosition(next);
    void setStorageValue(MINI_PLAYER_POSITION, next);
  }, []);

  // 挂载或窗口尺寸变化时，确保播放条不会落在视口外
  useLayoutEffect(() => {
    if (!enabled || !position || !barRef.current) return;
    const fixed = clampToViewport(position, barRef.current);
    if (fixed.x !== position.x || fixed.y !== position.y) setPosition(fixed);
  }, [enabled, position]);

  useEffect(() => {
    if (!enabled) return;
    const onResize = () => {
      const el = barRef.current;
      if (el && cachedPosition) setPosition(clampToViewport(cachedPosition, el));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [enabled]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
    const el = barRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    let latest: Position | null = null;
    draggedRef.current = false;

    // 监听挂在 window 上而不是 setPointerCapture，这样单纯点击标题链接时 click 仍落在链接上
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!draggedRef.current) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        draggedRef.current = true;
        setDragging(true);
      }
      latest = clampToViewport({ x: rect.left + dx, y: rect.top + dy }, el);
      setPosition(latest);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      setDragging(false);
      if (latest) commit(latest);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  /** 拖拽结束时松手位置可能在标题链接上，拦截这一次点击 */
  const onClickCapture = (e: React.MouseEvent) => {
    if (!draggedRef.current) return;
    draggedRef.current = false;
    e.preventDefault();
    e.stopPropagation();
  };

  const resetPosition = () => commit(null);

  return { barRef, position, dragging, onPointerDown, onClickCapture, resetPosition };
};

/**
 * 全局迷你播放条：在其他菜单页面浏览时也能看到并控制正在播放的音乐，可拖拽到任意位置。
 */
export const MiniPlayer = () => {
  const location = useLocation();
  const current = useMusicPlayer((s) => s.current);
  const isPlaying = useMusicPlayer((s) => s.isPlaying);
  const isLoading = useMusicPlayer((s) => s.isLoading);
  const error = useMusicPlayer((s) => s.error);
  const playlistLength = useMusicPlayer((s) => s.playlist.length);
  const togglePlay = useMusicPlayer((s) => s.togglePlay);
  const next = useMusicPlayer((s) => s.next);
  const previous = useMusicPlayer((s) => s.previous);
  const stop = useMusicPlayer((s) => s.stop);

  const visible = !!current && !HIDDEN_PATHS.includes(location.pathname);
  const { barRef, position, dragging, onPointerDown, onClickCapture, resetPosition } =
    useDraggablePosition(visible);

  if (!visible || !current) return null;

  const errorMessage = error?.bvid === current.bvid ? error.message : null;
  const canSkip = playlistLength > 1;
  const iconButton =
    "rounded-full p-1.5 text-ink-soft transition-colors duration-200 hover:bg-wash disabled:opacity-40 disabled:hover:bg-transparent dark:text-night-muted dark:hover:bg-night-line/60";

  return (
    <div
      ref={barRef}
      onPointerDown={onPointerDown}
      onClickCapture={onClickCapture}
      style={position ? { left: position.x, top: position.y } : undefined}
      className={`fixed z-[90] flex w-[26rem] max-w-[calc(100vw-2rem)] touch-none select-none items-center gap-2 rounded-2xl border border-line bg-white/95 p-2 pr-3 backdrop-blur-md dark:border-night-line dark:bg-night-card/95 ${
        position ? "" : "bottom-4 left-1/2 -translate-x-1/2"
      } ${dragging ? "cursor-grabbing shadow-2xl" : "cursor-grab shadow-lg"}`}
    >
      <div
        className="flex-shrink-0 text-ink-faint dark:text-night-muted"
        onDoubleClick={resetPosition}
        title="拖动可移动位置，双击恢复默认位置"
      >
        <GripVertical size={16} />
      </div>
      <img
        src={current.pic}
        alt={current.title}
        draggable={false}
        className="h-10 w-16 flex-shrink-0 rounded-lg object-cover"
      />
      <div className="min-w-0 flex-1">
        <a
          href={`https://www.bilibili.com/video/${current.bvid}`}
          target="_blank"
          rel="noopener noreferrer"
          draggable={false}
          className="block truncate text-sm font-medium text-ink hover:text-brand-strong dark:text-night-text dark:hover:text-brand"
          title={current.title}
        >
          {current.title}
        </a>
        <div
          className={`truncate text-xs ${errorMessage ? "text-red-500 dark:text-red-400" : "text-ink-muted dark:text-night-muted"}`}
        >
          {errorMessage ?? current.author}
        </div>
      </div>
      <div className="flex flex-shrink-0 cursor-default items-center gap-1">
        <button className={iconButton} onClick={previous} disabled={!canSkip} title="上一首">
          <SkipBack size={18} />
        </button>
        <button
          className={`rounded-full p-1.5 transition-colors duration-200 ${
            isPlaying
              ? "bg-brand text-white hover:bg-brand-strong"
              : "bg-wash text-ink-soft hover:bg-wash dark:bg-night-line dark:text-night-text"
          }`}
          onClick={togglePlay}
          disabled={isLoading}
          title={isLoading ? "加载中..." : isPlaying ? "暂停" : "播放"}
        >
          {isLoading ? (
            <Loader2 size={18} className="animate-spin" />
          ) : isPlaying ? (
            <Pause size={18} />
          ) : (
            <Play size={18} />
          )}
        </button>
        <button className={iconButton} onClick={next} disabled={!canSkip} title="下一首">
          <SkipForward size={18} />
        </button>
        <button className={iconButton} onClick={stop} title="停止并关闭">
          <X size={18} />
        </button>
      </div>
    </div>
  );
};
