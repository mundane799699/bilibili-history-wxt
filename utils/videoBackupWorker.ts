/**
 * 视频备份执行器：在扩展页面（my-history.html）里运行。
 *
 * - 用 Web Lock 保证多个插件标签页里只有一个在跑；持有锁的页面关闭后，锁自动释放，
 *   其他打开着的插件页面会接手。
 * - 取得锁时把遗留的 running 任务重置为 pending（上一个执行者已经不在了）。
 * - 流程：解析视频 → 下载视频流/音频流 → 本地合流为 MP4 → 计算分片 MD5 → 上传百度网盘。
 */
import {
  DEFAULT_VIDEO_BACKUP_DIR,
  VIDEO_BACKUP_CODEC,
  VIDEO_BACKUP_DIR,
  VIDEO_BACKUP_TASKS,
} from "./constants";
import { getStorageValue } from "./storage";
import {
  getVideoBackupTasks,
  mutateVideoBackupTasks,
  updateVideoBackupTask,
  type VideoBackupTask,
} from "./videoBackupQueue";
import {
  downloadBiliStream,
  fetchBiliVideoInfo,
  selectBiliStreams,
  type VideoCodecPreference,
} from "./biliVideo";
import { muxDashToMp4 } from "./mp4Mux";
import {
  BAIDU_NORMAL_FILE_LIMIT,
  getBaiduQuota,
  getBaiduUserInfo,
  normalizePanPath,
  sanitizePanFileName,
  uploadToBaiduPan,
} from "./baiduPan";

const WORKER_LOCK = "video-backup-worker";
const PROGRESS_WRITE_INTERVAL = 800;

let started = false;

class TaskCanceledError extends Error {
  constructor() {
    super("已取消");
  }
}

const formatBytes = (bytes: number) => {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(0, Math.round(bytes / 1024))} KB`;
};

/** 节流写入进度，避免频繁写 storage */
const createProgressReporter = (taskId: string, signal: AbortSignal) => {
  let lastWrite = 0;
  let pending: Partial<VideoBackupTask> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = async () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    // 已取消/删除的任务不再写进度，避免覆盖「已取消」状态
    if (!pending || signal.aborted) {
      pending = null;
      return;
    }
    const patch = pending;
    pending = null;
    lastWrite = Date.now();
    await updateVideoBackupTask(taskId, patch);
  };

  const report = (patch: Partial<VideoBackupTask>, force = false) => {
    pending = { ...(pending ?? {}), ...patch };
    if (force || Date.now() - lastWrite >= PROGRESS_WRITE_INTERVAL) {
      void flush();
    } else if (!timer) {
      timer = setTimeout(() => void flush(), PROGRESS_WRITE_INTERVAL);
    }
  };

  return { report, flush };
};

async function runTask(task: VideoBackupTask, signal: AbortSignal) {
  const { report, flush } = createProgressReporter(task.id, signal);
  try {
    report({ stage: "resolve", progress: 0, message: "检查百度网盘登录状态" }, true);
    const user = await getBaiduUserInfo(signal);
    if (!user) throw new Error("未登录百度网盘，请先在浏览器中登录 pan.baidu.com 后重试");

    report({ message: "解析视频信息" });
    const info = await fetchBiliVideoInfo(task.bvid, signal);
    const page = info.pages.find((p) => p.page === task.page) ?? info.pages[0];
    if (!page) throw new Error("没有找到视频分 P");

    const codec = await getStorageValue<VideoCodecPreference>(VIDEO_BACKUP_CODEC, "avc");
    const streams = await selectBiliStreams(info.bvid, page.cid, codec, signal);

    const multiPage = info.pages.length > 1;
    const baseName = multiPage ? `${info.title}_P${page.page}_${page.part}` : info.title;
    const fileName = `${sanitizePanFileName(baseName)}_${info.bvid}${multiPage ? `_p${page.page}` : ""}.mp4`;
    const dir = normalizePanPath(
      await getStorageValue<string>(VIDEO_BACKUP_DIR, DEFAULT_VIDEO_BACKUP_DIR),
    );
    const remotePath = `${dir === "/" ? "" : dir}/${fileName}`;

    report(
      {
        title: multiPage ? `${info.title} · P${page.page} ${page.part}` : info.title,
        cover: info.cover,
        qualityLabel: streams.qualityLabel,
        message: `画质 ${streams.qualityLabel}，预计 ${formatBytes(streams.estimatedSize)}`,
      },
      true,
    );

    if (user.vipType === 0 && streams.estimatedSize > BAIDU_NORMAL_FILE_LIMIT) {
      throw new Error("视频预计超过 4GB，百度网盘普通用户无法上传单个超过 4GB 的文件");
    }
    try {
      const quota = await getBaiduQuota(signal);
      if (streams.estimatedSize > 0 && quota.free < streams.estimatedSize) {
        throw new Error(`网盘剩余空间不足（剩余 ${formatBytes(quota.free)}）`);
      }
    } catch (error) {
      if (signal.aborted) throw error;
      if (error instanceof Error && error.message.startsWith("网盘剩余空间不足")) throw error;
      // 容量查询失败不阻塞上传
    }

    // ---- 下载 ----
    let videoLoaded = 0;
    let videoTotal = 0;
    let audioLoaded = 0;
    let audioTotal = 0;
    const reportDownload = () => {
      const total = videoTotal + audioTotal || streams.estimatedSize || 1;
      report({
        stage: "download",
        progress: Math.min(1, (videoLoaded + audioLoaded) / total),
        message: `下载中 ${formatBytes(videoLoaded + audioLoaded)}${
          videoTotal + audioTotal ? ` / ${formatBytes(videoTotal + audioTotal)}` : ""
        }`,
      });
    };
    report({ stage: "download", progress: 0, message: "开始下载" }, true);
    const [videoBlob, audioBlob] = await Promise.all([
      downloadBiliStream(
        streams.videoUrls,
        (loaded, total) => {
          videoLoaded = loaded;
          videoTotal = total;
          reportDownload();
        },
        signal,
      ),
      streams.audioUrls.length
        ? downloadBiliStream(
            streams.audioUrls,
            (loaded, total) => {
              audioLoaded = loaded;
              audioTotal = total;
              reportDownload();
            },
            signal,
          )
        : Promise.resolve(null),
    ]);

    // ---- 合流 ----
    report({ stage: "mux", progress: 0, message: "合成 MP4" }, true);
    const { blob: mp4 } = await muxDashToMp4(videoBlob, audioBlob);
    signal.throwIfAborted();
    if (user.vipType === 0 && mp4.size > BAIDU_NORMAL_FILE_LIMIT) {
      throw new Error("视频超过 4GB，百度网盘普通用户无法上传单个超过 4GB 的文件");
    }
    report({ fileSize: mp4.size, progress: 1 }, true);

    // ---- 上传 ----
    let lastBytes = 0;
    let lastTime = Date.now();
    let speed = 0;
    const result = await uploadToBaiduPan(mp4, remotePath, {
      signal,
      onLog: (message) => report({ message }),
      onProgress: ({ stage, loaded, total }) => {
        if (stage === "upload") {
          const now = Date.now();
          if (now - lastTime >= 1000) {
            speed = ((loaded - lastBytes) * 1000) / (now - lastTime);
            lastBytes = loaded;
            lastTime = now;
          }
          report({
            stage,
            progress: loaded / total,
            speed,
            message: `上传中 ${formatBytes(loaded)} / ${formatBytes(total)}`,
          });
        } else if (stage === "hash") {
          lastBytes = 0;
          lastTime = Date.now();
          report({ stage, progress: loaded / total, message: "计算分片校验值" });
        } else {
          report({ stage, progress: 1, speed: undefined, message: "提交文件" }, true);
        }
      },
    });

    await flush();
    await updateVideoBackupTask(task.id, {
      status: "done",
      stage: "commit",
      progress: 1,
      speed: undefined,
      remotePath: result.path,
      fileSize: result.size,
      message: result.rapid ? "秒传成功" : "备份完成",
      finishedAt: Date.now(),
    });
  } finally {
    await flush();
  }
}

/** 监听任务被取消/删除，触发 abort */
const watchCancellation = (taskId: string, controller: AbortController) => {
  const listener = (changes: Record<string, Browser.storage.StorageChange>, area: string) => {
    if (area !== "local" || !changes[VIDEO_BACKUP_TASKS]) return;
    const tasks = (changes[VIDEO_BACKUP_TASKS].newValue ?? []) as VideoBackupTask[];
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === "canceled") controller.abort(new TaskCanceledError());
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
};

/** 等待有新的 pending 任务 */
const waitForPending = () =>
  new Promise<void>((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      browser.storage.onChanged.removeListener(listener);
      resolve();
    };
    const listener = (changes: Record<string, Browser.storage.StorageChange>, area: string) => {
      if (area !== "local" || !changes[VIDEO_BACKUP_TASKS]) return;
      const tasks = (changes[VIDEO_BACKUP_TASKS].newValue ?? []) as VideoBackupTask[];
      if (tasks.some((t) => t.status === "pending")) done();
    };
    browser.storage.onChanged.addListener(listener);
    // 注册监听前可能刚好有任务入队，补查一次
    void getVideoBackupTasks().then((tasks) => {
      if (tasks.some((t) => t.status === "pending")) done();
    });
  });

async function workerLoop() {
  // 上一个执行者已经不在（否则拿不到锁），把遗留的 running 任务放回队列
  await mutateVideoBackupTasks((tasks) => {
    for (const task of tasks) {
      if (task.status === "running") {
        task.status = "pending";
        task.stage = "queued";
        task.progress = 0;
        task.speed = undefined;
        task.message = "页面关闭导致中断，重新排队";
      }
    }
  });

  while (true) {
    const next = await mutateVideoBackupTasks((tasks) => {
      // 队列按创建时间倒序存放，最早入队的先执行
      const pending = tasks.filter((t) => t.status === "pending");
      const task = pending[pending.length - 1];
      if (!task) return null;
      task.status = "running";
      task.stage = "resolve";
      task.progress = 0;
      task.message = "准备中";
      task.updatedAt = Date.now();
      return { ...task };
    });

    if (!next) {
      await waitForPending();
      continue;
    }

    const controller = new AbortController();
    const stopWatching = watchCancellation(next.id, controller);
    try {
      await runTask(next, controller.signal);
    } catch (error) {
      if (!controller.signal.aborted) {
        console.error("视频备份失败:", error);
        await updateVideoBackupTask(next.id, {
          status: "error",
          speed: undefined,
          message: error instanceof Error ? error.message : String(error),
          finishedAt: Date.now(),
        });
      }
    } finally {
      stopWatching();
    }
  }
}

/** 在扩展页面启动执行器（幂等） */
export function startVideoBackupWorker() {
  if (started || typeof navigator === "undefined" || !navigator.locks?.request) return;
  started = true;
  void navigator.locks.request(WORKER_LOCK, () => workerLoop());
}

/** 是否还有未完成任务（供 UI 提示「请保持页面打开」） */
export const hasActiveVideoBackupTasks = async () =>
  (await getVideoBackupTasks()).some((t) => t.status === "pending" || t.status === "running");
