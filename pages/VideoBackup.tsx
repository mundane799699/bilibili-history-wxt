import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  BookOpen,
  Check,
  CheckCircle2,
  CloudUpload,
  ExternalLink,
  FolderOpen,
  Info,
  LoaderCircle,
  LogIn,
  RefreshCw,
  RotateCcw,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { BackupPageHeader, BackupPageLayout } from "./backup/BackupPageHeader";
import {
  DEFAULT_VIDEO_BACKUP_DIR,
  VIDEO_BACKUP_BUTTON_ENABLED,
  VIDEO_BACKUP_CODEC,
  VIDEO_BACKUP_DIR,
  VIDEO_BACKUP_TASKS,
} from "../utils/constants";
import { getStorageValue, setStorageValue } from "../utils/storage";
import {
  cancelVideoBackupTask,
  clearFinishedVideoBackupTasks,
  getVideoBackupTasks,
  removeVideoBackupTask,
  retryVideoBackupTask,
  type VideoBackupStage,
  type VideoBackupTask,
} from "../utils/videoBackupQueue";
import {
  BAIDU_LOGIN_URL,
  baiduDirUrl,
  getBaiduQuota,
  getBaiduUserInfo,
  normalizePanPath,
  type BaiduQuota,
  type BaiduUserInfo,
} from "../utils/baiduPan";
import type { VideoCodecPreference } from "../utils/biliVideo";

/** 教程在新标签页中打开，不打断当前页面 */
const TUTORIAL_URL = browser.runtime.getURL("/video-backup-tutorial.html");

const STAGE_LABELS: Record<VideoBackupStage, string> = {
  queued: "排队中",
  resolve: "解析",
  download: "下载",
  mux: "合成",
  hash: "校验",
  upload: "上传",
  commit: "提交",
};

const CODEC_OPTIONS: { value: VideoCodecPreference; label: string; hint: string }[] = [
  { value: "avc", label: "AVC / H.264", hint: "兼容性最好，几乎所有设备都能播放" },
  { value: "hevc", label: "HEVC / H.265", hint: "体积更小，部分旧设备不支持" },
  { value: "av1", label: "AV1", hint: "体积最小，需要较新的播放器" },
];

const formatBytes = (bytes?: number) => {
  if (!bytes || bytes <= 0) return "0 B";
  if (bytes >= 1024 ** 4) return `${(bytes / 1024 ** 4).toFixed(2)} TB`;
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
};

const formatTime = (ts?: number) => {
  if (!ts) return "";
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const cardClass =
  "overflow-hidden rounded-2xl border border-line bg-white dark:border-night-line dark:bg-night-card";
const secondaryButton =
  "inline-flex min-h-9 shrink-0 items-center whitespace-nowrap justify-center gap-1.5 rounded-lg border border-line bg-white px-3 text-sm font-medium text-ink-soft transition-colors hover:bg-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50 dark:border-night-line dark:bg-night-card dark:text-night-text dark:hover:bg-night-line/60";
const primaryButton =
  "inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-brand-strong px-4 text-sm font-medium text-white transition-colors hover:bg-brand-strong/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:bg-wash disabled:text-ink-muted dark:bg-brand dark:hover:bg-brand-strong dark:disabled:bg-night-line dark:disabled:text-night-muted";
const iconButton =
  "inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-wash hover:text-ink-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:text-night-muted dark:hover:bg-night-line/60 dark:hover:text-night-text";
const inputClass =
  "w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink outline-none transition-colors placeholder:text-ink-muted focus:border-brand focus:ring-2 focus:ring-brand/20 dark:border-night-line dark:bg-night dark:text-night-text";

const BaiduAccountCard = () => {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<BaiduUserInfo | null>(null);
  const [quota, setQuota] = useState<BaiduQuota | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const info = await getBaiduUserInfo();
      setUser(info);
      setQuota(info ? await getBaiduQuota().catch(() => null) : null);
    } catch (e) {
      setUser(null);
      setQuota(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    // 从登录页切回来时自动刷新
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  return (
    <section className={cardClass}>
      <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          {user?.avatar ? (
            <img
              src={user.avatar}
              alt=""
              referrerPolicy="no-referrer"
              className="h-10 w-10 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-wash text-ink-muted dark:bg-night-line">
              <CloudUpload className="h-5 w-5" />
            </div>
          )}
          <div className="min-w-0">
            {loading ? (
              <p className="text-sm text-ink-muted">正在检查百度网盘登录状态…</p>
            ) : user ? (
              <>
                <p className="flex items-center gap-1.5 text-sm font-medium text-ink dark:text-night-text">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  {user.name}
                  <span className="rounded bg-wash px-1.5 py-0.5 text-xs font-normal text-ink-muted dark:bg-night-line dark:text-night-muted">
                    {user.vipLabel}
                  </span>
                </p>
                {quota && (
                  <p className="mt-1 text-xs text-ink-muted dark:text-night-muted">
                    已用 {formatBytes(quota.used)} / {formatBytes(quota.total)}，剩余{" "}
                    {formatBytes(quota.free)}
                    {user.vipType === 0 && "　·　普通用户单文件上限 4GB"}
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="flex items-center gap-1.5 text-sm font-medium text-ink dark:text-night-text">
                  <XCircle className="h-4 w-4 text-ink-faint" />
                  未登录百度网盘
                </p>
                <p className="mt-1 text-xs text-ink-muted dark:text-night-muted">
                  {error || "在浏览器中登录 pan.baidu.com 后即可使用，插件复用网页版登录状态"}
                </p>
              </>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {!loading && !user && (
            <a href={BAIDU_LOGIN_URL} target="_blank" rel="noreferrer" className={primaryButton}>
              <LogIn className="h-4 w-4" />
              去登录
            </a>
          )}
          <button
            type="button"
            onClick={() => void refresh()}
            className={secondaryButton}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            刷新
          </button>
        </div>
      </div>
    </section>
  );
};

const SettingsCard = () => {
  const [dir, setDir] = useState(DEFAULT_VIDEO_BACKUP_DIR);
  const [savedDir, setSavedDir] = useState(DEFAULT_VIDEO_BACKUP_DIR);
  const [codec, setCodec] = useState<VideoCodecPreference>("avc");
  const [buttonEnabled, setButtonEnabled] = useState(true);

  useEffect(() => {
    void Promise.all([
      getStorageValue<string>(VIDEO_BACKUP_DIR, DEFAULT_VIDEO_BACKUP_DIR),
      getStorageValue<VideoCodecPreference>(VIDEO_BACKUP_CODEC, "avc"),
      getStorageValue<boolean>(VIDEO_BACKUP_BUTTON_ENABLED, true),
    ]).then(([d, c, b]) => {
      setDir(d);
      setSavedDir(d);
      setCodec(c);
      setButtonEnabled(b !== false);
    });
  }, []);

  const dirSaved = normalizePanPath(dir || DEFAULT_VIDEO_BACKUP_DIR) === savedDir;

  const saveDir = async () => {
    const normalized = normalizePanPath(dir || DEFAULT_VIDEO_BACKUP_DIR);
    await setStorageValue(VIDEO_BACKUP_DIR, normalized);
    setDir(normalized);
    setSavedDir(normalized);
    toast.success("备份目录已保存");
  };

  const changeCodec = async (value: VideoCodecPreference) => {
    setCodec(value);
    await setStorageValue(VIDEO_BACKUP_CODEC, value);
  };

  const toggleButton = async () => {
    const next = !buttonEnabled;
    setButtonEnabled(next);
    await setStorageValue(VIDEO_BACKUP_BUTTON_ENABLED, next);
  };

  return (
    <section className={cardClass}>
      <div className="space-y-5 p-5">
        <div>
          <label
            htmlFor="video-backup-dir"
            className="mb-1.5 block text-sm font-medium text-ink-soft dark:text-night-muted"
          >
            保存到网盘目录
          </label>
          <div className="flex gap-2">
            <input
              id="video-backup-dir"
              value={dir}
              onChange={(e) => setDir(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void saveDir()}
              placeholder={DEFAULT_VIDEO_BACKUP_DIR}
              className={inputClass}
            />
            <button
              type="button"
              onClick={() => void saveDir()}
              disabled={dirSaved}
              className={`${primaryButton} min-w-[84px]`}
            >
              {dirSaved ? (
                <>
                  <Check className="h-4 w-4" />
                  已保存
                </>
              ) : (
                "保存"
              )}
            </button>
            <a
              href={baiduDirUrl(savedDir)}
              target="_blank"
              rel="noreferrer"
              className={`${secondaryButton} w-10 px-0`}
              title="在网盘中打开"
            >
              <FolderOpen className="h-4 w-4" />
            </a>
          </div>
          <p className="mt-1.5 text-xs text-ink-muted dark:text-night-muted">
            支持多级目录，例如 /B站视频备份/2026；目录不存在会自动创建，同名文件会自动重命名。
          </p>
        </div>

        <div>
          <p className="mb-1.5 text-sm font-medium text-ink-soft dark:text-night-muted">
            视频编码偏好
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {CODEC_OPTIONS.map((option) => (
              <button
                type="button"
                key={option.value}
                onClick={() => void changeCodec(option.value)}
                className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                  codec === option.value
                    ? "border-brand bg-brand-soft/60 dark:bg-brand/10"
                    : "border-line hover:bg-wash dark:border-night-line dark:hover:bg-night-line/60"
                }`}
              >
                <span className="block text-sm font-medium text-ink dark:text-night-text">
                  {option.label}
                </span>
                <span className="mt-0.5 block text-xs text-ink-muted dark:text-night-muted">
                  {option.hint}
                </span>
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-ink-muted dark:text-night-muted">
            始终选择你的账号可用的最高画质；该画质没有偏好的编码时自动换用其他编码。
          </p>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-ink dark:text-night-text">
              在视频页显示「备份该视频」按钮
            </p>
            <p className="mt-1 text-xs text-ink-muted dark:text-night-muted">
              按钮位于播放器下方工具栏右侧
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={buttonEnabled}
            onClick={() => void toggleButton()}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
              buttonEnabled ? "bg-brand-strong dark:bg-brand" : "bg-ink-faint dark:bg-night-line"
            }`}
          >
            <span
              className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                buttonEnabled ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
      </div>
    </section>
  );
};

const statusBadge = (task: VideoBackupTask) => {
  switch (task.status) {
    case "done":
      return (
        <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">已完成</span>
      );
    case "error":
      return <span className="text-xs font-medium text-red-500">失败</span>;
    case "canceled":
      return <span className="text-xs font-medium text-ink-muted">已取消</span>;
    case "pending":
      return <span className="text-xs font-medium text-ink-muted">排队中</span>;
    default:
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-strong dark:text-brand">
          <LoaderCircle className="h-3 w-3 animate-spin" />
          {STAGE_LABELS[task.stage]}
        </span>
      );
  }
};

const TaskRow = ({ task }: { task: VideoBackupTask }) => {
  const running = task.status === "running";
  const active = running || task.status === "pending";
  const dir = task.remotePath
    ? task.remotePath.slice(0, task.remotePath.lastIndexOf("/")) || "/"
    : "";

  return (
    <li className="flex gap-3 px-5 py-4">
      <a
        href={`https://www.bilibili.com/video/${task.bvid}${task.page > 1 ? `?p=${task.page}` : ""}`}
        target="_blank"
        rel="noreferrer"
        className="hidden h-[54px] w-24 shrink-0 overflow-hidden rounded-lg bg-wash sm:block dark:bg-night-line"
      >
        {task.cover && (
          <img
            src={`${task.cover.replace(/^http:/, "https:")}@192w_108h_1c.webp`}
            alt=""
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
          />
        )}
      </a>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <a
            href={`https://www.bilibili.com/video/${task.bvid}${task.page > 1 ? `?p=${task.page}` : ""}`}
            target="_blank"
            rel="noreferrer"
            className="line-clamp-1 text-sm font-medium text-ink hover:text-brand-strong dark:text-night-text"
            title={task.title}
          >
            {task.title}
          </a>
          <div className="flex shrink-0 items-center gap-1">
            {statusBadge(task)}
            {task.status === "done" && dir && (
              <a
                href={baiduDirUrl(dir)}
                target="_blank"
                rel="noreferrer"
                className={iconButton}
                title="在网盘中查看"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
            {(task.status === "error" || task.status === "canceled" || task.status === "done") && (
              <button
                type="button"
                className={iconButton}
                title="重新备份"
                onClick={() => void retryVideoBackupTask(task.id)}
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            )}
            {active ? (
              <button
                type="button"
                className={iconButton}
                title="取消"
                onClick={() => void cancelVideoBackupTask(task.id)}
              >
                <X className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                className={iconButton}
                title="删除记录"
                onClick={() => void removeVideoBackupTask(task.id)}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
        <p
          className={`mt-1 line-clamp-2 break-all text-xs ${
            task.status === "error" ? "text-red-500" : "text-ink-muted dark:text-night-muted"
          }`}
        >
          {[
            task.bvid + (task.page > 1 ? ` P${task.page}` : ""),
            task.qualityLabel,
            task.fileSize ? formatBytes(task.fileSize) : "",
            task.status === "done" ? task.remotePath : task.message,
            running && task.speed ? `${formatBytes(task.speed)}/s` : "",
            !active ? formatTime(task.finishedAt ?? task.updatedAt) : "",
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {running && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-wash dark:bg-night-line">
            <div
              className="h-full rounded-full bg-brand transition-[width] duration-500"
              style={{ width: `${Math.round(Math.min(1, task.progress) * 100)}%` }}
            />
          </div>
        )}
      </div>
    </li>
  );
};

const VideoBackup = () => {
  const [tasks, setTasks] = useState<VideoBackupTask[]>([]);

  useEffect(() => {
    void getVideoBackupTasks().then(setTasks);
    const listener = (changes: Record<string, Browser.storage.StorageChange>, area: string) => {
      if (area === "local" && changes[VIDEO_BACKUP_TASKS]) {
        setTasks((changes[VIDEO_BACKUP_TASKS].newValue ?? []) as VideoBackupTask[]);
      }
    };
    browser.storage.onChanged.addListener(listener);
    return () => browser.storage.onChanged.removeListener(listener);
  }, []);

  const hasActive = useMemo(
    () => tasks.some((t) => t.status === "pending" || t.status === "running"),
    [tasks],
  );
  const hasFinished = tasks.some((t) => t.status === "done" || t.status === "canceled");

  return (
    <BackupPageLayout>
      <BackupPageHeader
        icon={CloudUpload}
        title="视频备份"
        description="在 B 站视频页点击「备份该视频」，插件会以你账号可用的最高画质下载视频，在本地合成为 MP4 后上传到你的百度网盘，避免收藏的视频失效。"
        action={
          <a href={TUTORIAL_URL} target="_blank" rel="noreferrer" className={secondaryButton}>
            <BookOpen className="h-4 w-4" />
            使用教程
          </a>
        }
      />

      <div className="space-y-5">
        <BaiduAccountCard />
        <SettingsCard />

        <section className={cardClass}>
          <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-3.5 dark:border-night-line">
            <h2 className="font-semibold text-ink dark:text-night-text">备份任务</h2>
            {hasFinished && (
              <button
                type="button"
                onClick={() => void clearFinishedVideoBackupTasks()}
                className="text-xs text-ink-muted hover:text-ink-soft dark:text-night-muted dark:hover:text-night-text"
              >
                清除已完成
              </button>
            )}
          </div>
          {hasActive && (
            <div className="flex items-start gap-2 border-b border-line bg-wash/60 px-5 py-2.5 text-xs leading-5 text-ink-soft dark:border-night-line dark:bg-night-line/40 dark:text-night-muted">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              备份在插件页面中进行，请保持至少一个插件页面打开（可以切到其他标签页做别的事）。页面关闭后未完成的任务会在下次打开时重新开始。
            </div>
          )}
          {tasks.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-ink-muted dark:text-night-muted">
              还没有备份任务。打开任意 B 站视频页，点击工具栏中的「备份该视频」即可开始。
              <a
                href={TUTORIAL_URL}
                target="_blank"
                rel="noreferrer"
                className="ml-1 text-brand-strong hover:underline dark:text-brand"
              >
                查看教程
              </a>
            </p>
          ) : (
            <ul className="divide-y divide-line dark:divide-night-line">
              {tasks.map((task) => (
                <TaskRow key={task.id} task={task} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </BackupPageLayout>
  );
};

export default VideoBackup;
