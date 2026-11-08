import type { FavoriteFolderSyncErrorKind } from "@/utils/types";

/** 错误分类：决定失败后是重试、暂停冷却还是直接报错 */
export type BiliErrorKind = FavoriteFolderSyncErrorKind;

export class BiliRequestError extends Error {
  constructor(
    message: string,
    readonly kind: BiliErrorKind = "unknown",
    readonly status?: number,
  ) {
    super(message);
    this.name = "BiliRequestError";
  }
}

/** 把任意异常归一化为 BiliRequestError，便于按 kind 统一处理 */
export function toBiliRequestError(error: unknown): BiliRequestError {
  if (error instanceof BiliRequestError) return error;
  if (
    error instanceof DOMException &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  ) {
    return new BiliRequestError("请求超时", "network");
  }
  if (error instanceof TypeError) {
    return new BiliRequestError(error.message || "网络请求失败", "network");
  }
  return new BiliRequestError(error instanceof Error ? error.message : "未知错误", "unknown");
}

/** 网络抖动或服务端 5xx 值得重试；风控、登录失效、数据异常重试也没用 */
export const isRetryableBiliError = (error: unknown): boolean => {
  const { kind } = toBiliRequestError(error);
  return kind === "network" || kind === "server";
};

/** 从浏览器 cookie 中读取 B 站登录凭证 */
export async function getSessdata(): Promise<string> {
  const cookies = await browser.cookies.getAll({ domain: "bilibili.com" });
  const sessdata = cookies.find((cookie) => cookie.name === "SESSDATA")?.value;
  if (!sessdata) throw new Error("未找到 B 站登录信息，请先登录 B 站");
  return sessdata;
}

interface BiliRequestOptions {
  sessdata: string;
  /** 失败时的错误前缀，例如 "获取收藏夹失败" */
  label: string;
  timeoutMs?: number;
}

/**
 * 请求 B 站 API 并返回响应中的 data 字段。
 * 所有失败（网络、HTTP 状态码、业务 code）都会被转换成带 kind 的 BiliRequestError，
 * 调用方无需再各自判断 412/429/401 等情况。
 */
export async function requestBiliApi<T = any>(
  url: string,
  { sessdata, label, timeoutMs }: BiliRequestOptions,
): Promise<T> {
  const withLabel = (error: unknown) => {
    const normalized = toBiliRequestError(error);
    return new BiliRequestError(`${label}：${normalized.message}`, normalized.kind);
  };

  const response = await fetch(url, {
    headers: { Cookie: `SESSDATA=${sessdata}` },
    signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
  }).catch((error) => {
    throw withLabel(error);
  });
  assertHttpOk(response, label);

  const body = await response.json().catch((error) => {
    throw withLabel(error);
  });
  assertBiliCodeOk(body, label);
  return body.data as T;
}

function assertHttpOk(response: Response, label: string): void {
  const { status } = response;
  if (status === 412 || status === 429) {
    throw new BiliRequestError(`${label}：HTTP ${status}`, "rate_limited", status);
  }
  if (status === 401 || status === 403) {
    throw new BiliRequestError("登录状态无效，请重新登录 B 站", "auth", status);
  }
  if (!response.ok) {
    const kind = status >= 500 ? "server" : "unknown";
    throw new BiliRequestError(`${label}：HTTP ${status}`, kind, status);
  }
}

function assertBiliCodeOk(body: { code?: number; message?: string }, label: string): void {
  // B 站风控有时以 HTTP 200 + code -412 的形式返回
  if (body?.code === -412) {
    throw new BiliRequestError(`${label}：${body.message || "触发访问风控"}`, "rate_limited", 412);
  }
  if (body?.code !== 0) {
    throw new BiliRequestError(`${label}：${body?.message || "接口返回失败"}`, "unknown");
  }
}

/** 获取当前登录用户的 mid */
export async function fetchCurrentMid(sessdata: string): Promise<number> {
  const nav = await requestBiliApi<{ mid?: number }>(
    "https://api.bilibili.com/x/web-interface/nav",
    { sessdata, label: "获取用户信息失败" },
  );
  const mid = Number(nav?.mid);
  if (!Number.isSafeInteger(mid) || mid <= 0) {
    throw new BiliRequestError("获取用户信息失败：未登录或数据异常", "data");
  }
  return mid;
}
