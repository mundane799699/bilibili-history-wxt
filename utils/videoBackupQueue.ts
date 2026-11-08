/**
 * 视频备份任务队列：任务持久化在 browser.storage.local（VIDEO_BACKUP_TASKS）。
 *
 * background（入队）和扩展页面（执行/展示）都会改写这个数组，
 * 所有读-改-写都通过 Web Locks 串行化（扩展页面与 service worker 同源，锁互通），
 * 避免进度写入覆盖掉刚入队的任务。
 */
import { VIDEO_BACKUP_TASKS } from "./constants";
import { getStorageValue, setStorageValue } from "./storage";

export type VideoBackupStatus = "pending" | "running" | "done" | "error" | "canceled";

export type VideoBackupStage =
  "queued" | "resolve" | "download" | "mux" | "hash" | "upload" | "commit";

export interface VideoBackupTask {
  id: string;
  bvid: string;
  /** 分 P 序号，从 1 开始 */
  page: number;
  title: string;
  cover?: string;
  status: VideoBackupStatus;
  stage: VideoBackupStage;
  /** 当前阶段进度 0-1 */
  progress: number;
  /** 上传速度（字节/秒），仅 upload 阶段有值 */
  speed?: number;
  message?: string;
  qualityLabel?: string;
  fileSize?: number;
  remotePath?: string;
  createdAt: number;
  updatedAt: number;
  finishedAt?: number;
}

const TASKS_LOCK = "video-backup-tasks";
const MAX_FINISHED_TASKS = 200;

const withTasksLock = async <T>(fn: () => Promise<T>): Promise<T> => {
  if (typeof navigator !== "undefined" && navigator.locks?.request) {
    return navigator.locks.request(TASKS_LOCK, fn);
  }
  return fn();
};

export const getVideoBackupTasks = () => getStorageValue<VideoBackupTask[]>(VIDEO_BACKUP_TASKS, []);

export const mutateVideoBackupTasks = <T>(mutate: (tasks: VideoBackupTask[]) => T): Promise<T> =>
  withTasksLock(async () => {
    const tasks = [...(await getVideoBackupTasks())];
    const result = mutate(tasks);
    await setStorageValue(VIDEO_BACKUP_TASKS, tasks);
    return result;
  });

export const updateVideoBackupTask = (id: string, patch: Partial<VideoBackupTask>) =>
  mutateVideoBackupTasks((tasks) => {
    const index = tasks.findIndex((t) => t.id === id);
    if (index < 0) return null;
    tasks[index] = { ...tasks[index], ...patch, updatedAt: Date.now() };
    return tasks[index];
  });

export type EnqueueResult =
  { status: "queued"; task: VideoBackupTask } | { status: "exists"; task: VideoBackupTask };

/** 入队；同一视频同一分 P 已在排队/进行中则不重复添加 */
export const enqueueVideoBackup = (input: {
  bvid: string;
  page: number;
  title?: string;
  cover?: string;
}): Promise<EnqueueResult> =>
  mutateVideoBackupTasks((tasks) => {
    const existing = tasks.find(
      (t) =>
        t.bvid === input.bvid &&
        t.page === input.page &&
        (t.status === "pending" || t.status === "running"),
    );
    if (existing) return { status: "exists", task: existing } as const;

    const now = Date.now();
    const task: VideoBackupTask = {
      id: `${input.bvid}-p${input.page}-${now}`,
      bvid: input.bvid,
      page: input.page,
      title: input.title || input.bvid,
      cover: input.cover,
      status: "pending",
      stage: "queued",
      progress: 0,
      createdAt: now,
      updatedAt: now,
    };
    tasks.unshift(task);

    // 只保留最近的已结束任务，防止无限增长
    let finished = 0;
    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i];
      if (t.status === "pending" || t.status === "running") continue;
      finished++;
      if (finished > MAX_FINISHED_TASKS) {
        tasks.splice(i, 1);
        i--;
      }
    }
    return { status: "queued", task } as const;
  });

export const retryVideoBackupTask = (id: string) =>
  updateVideoBackupTask(id, {
    status: "pending",
    stage: "queued",
    progress: 0,
    speed: undefined,
    message: undefined,
    finishedAt: undefined,
  });

export const cancelVideoBackupTask = (id: string) =>
  mutateVideoBackupTasks((tasks) => {
    const task = tasks.find((t) => t.id === id);
    if (!task || (task.status !== "pending" && task.status !== "running")) return;
    task.status = "canceled";
    task.message = "已取消";
    task.speed = undefined;
    task.updatedAt = Date.now();
    task.finishedAt = Date.now();
  });

export const removeVideoBackupTask = (id: string) =>
  mutateVideoBackupTasks((tasks) => {
    const index = tasks.findIndex((t) => t.id === id);
    if (index >= 0 && tasks[index].status !== "running") tasks.splice(index, 1);
  });

export const clearFinishedVideoBackupTasks = () =>
  mutateVideoBackupTasks((tasks) => {
    for (let i = tasks.length - 1; i >= 0; i--) {
      if (tasks[i].status === "done" || tasks[i].status === "canceled") tasks.splice(i, 1);
    }
  });
