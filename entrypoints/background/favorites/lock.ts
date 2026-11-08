/**
 * 收藏夹同步互斥锁：同一时间只允许一个收藏夹同步任务运行，
 * 避免并发请求放大 B 站风控概率，也避免两个任务互相覆盖进度。
 */

export type FavoriteSyncTask = "single-folder" | "all-folders";

export const FAVORITE_SYNC_BUSY = {
  success: false,
  error: "收藏夹同步正在进行中，请稍后再试",
} as const;

let runningTask: FavoriteSyncTask | null = null;

/** 不传 task 时判断是否有任意任务在运行 */
export const isFavoriteSyncRunning = (task?: FavoriteSyncTask): boolean =>
  task ? runningTask === task : runningTask !== null;

/**
 * 加锁执行任务；已有任务在运行时返回 null。
 * 检查和加锁是同步完成的，不存在并发窗口。
 */
export function tryRunExclusive<T>(
  task: FavoriteSyncTask,
  run: () => Promise<T>,
): Promise<T> | null {
  if (runningTask) return null;
  runningTask = task;
  return run().finally(() => {
    runningTask = null;
  });
}
