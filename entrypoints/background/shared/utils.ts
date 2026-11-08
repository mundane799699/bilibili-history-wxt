import { getStorageValue } from "@/utils/storage";

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** [minMs, maxMs] 之间的随机整数，用于给请求间隔加抖动，降低触发风控的概率 */
export const randomBetween = (minMs: number, maxMs: number): number =>
  Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;

export const getErrorMessage = (error: unknown, fallback = "未知错误"): string =>
  error instanceof Error && error.message ? error.message : fallback;

/**
 * 把异步函数包装成"单飞"：执行期间重复调用直接复用同一个 Promise，
 * 避免定时任务与手动触发并发跑同一件事。
 */
export function singleFlight<A extends unknown[], T>(
  fn: (...args: A) => Promise<T>,
): (...args: A) => Promise<T> {
  let inflight: Promise<T> | null = null;
  return (...args) => {
    inflight ??= fn(...args).finally(() => {
      inflight = null;
    });
    return inflight;
  };
}

/**
 * 失败时按 retryDelaysMs 依次等待后重试；数组长度即最大重试次数。
 * shouldRetry 返回 false 的错误会立即抛出。
 */
export async function withRetry<T>(
  task: () => Promise<T>,
  options: {
    retryDelaysMs: number[];
    shouldRetry: (error: unknown) => boolean;
    onRetry?: (error: unknown, retryCount: number, delayMs: number) => void;
  },
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await task();
    } catch (error) {
      const delayMs = options.retryDelaysMs[attempt];
      if (delayMs === undefined || !options.shouldRetry(error)) throw error;
      options.onRetry?.(error, attempt + 1, delayMs);
      await sleep(delayMs);
    }
  }
}

/**
 * 距离下次应执行还剩多少毫秒（<= 0 表示已到期）。
 * lastRunKey 存的是上次成功执行的时间戳。
 */
export async function getMsUntilDue(lastRunKey: string, intervalMinutes: number): Promise<number> {
  const lastRunAt = await getStorageValue<number>(lastRunKey, 0);
  return lastRunAt + intervalMinutes * 60_000 - Date.now();
}
