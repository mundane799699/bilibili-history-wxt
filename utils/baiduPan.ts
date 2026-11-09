/**
 * 百度网盘网页版接口封装。
 *
 * 复用浏览器里 pan.baidu.com 的登录态（BDUSS 等 Cookie 由浏览器自动携带，
 * 扩展拥有 <all_urls> host 权限，扩展页面里 fetch 不受 CORS 限制）。
 *
 * 上传流程（与 BaiduPCS-Rust 一致）：
 *   precreate（提交 4MB 分片 MD5 列表，拿 uploadid；return_type=2 表示秒传成功）
 *   → superfile2 逐片上传（partseq 从 0 开始）
 *   → create 合并分片生成文件（rtype=1 同名自动重命名）
 */
import SparkMD5 from "spark-md5";

const PAN_ORIGIN = "https://pan.baidu.com";
const APP_ID = "250528";
const DEFAULT_UPLOAD_HOST = "d.pcs.baidu.com";
/** 普通用户分片固定 4MB；会员也接受 4MB，统一使用避免按等级分支 */
export const BAIDU_SLICE_SIZE = 4 * 1024 * 1024;
/** 普通用户单文件上限 4GB */
export const BAIDU_NORMAL_FILE_LIMIT = 4 * 1024 * 1024 * 1024;

const COMMON_QUERY = { app_id: APP_ID, clienttype: "0", web: "1", channel: "chunlei" };

export class BaiduPanError extends Error {
  errno: number;
  constructor(message: string, errno = -1) {
    super(message);
    this.errno = errno;
  }
}

const ERRNO_MESSAGES: Record<number, string> = {
  [-6]: "百度网盘登录已失效，请重新登录",
  [-7]: "文件或目录名不合法",
  [-8]: "文件或目录已存在",
  [-9]: "文件或目录不存在",
  [-10]: "网盘空间不足",
  2: "参数错误",
  10: "创建文件失败",
  31023: "参数错误",
  31024: "没有访问权限",
  31061: "文件已存在",
  31062: "文件名非法",
  31064: "上传路径错误",
  31190: "分片缺失，请重试",
  31299: "第一个分片的大小小于 4MB",
  31363: "分片缺失",
  31364: "超出分片大小限制",
};

const describeErrno = (errno: number, fallback?: string) =>
  ERRNO_MESSAGES[errno] ?? (fallback ? `${fallback}（errno=${errno}）` : `errno=${errno}`);

const buildUrl = (base: string, query: Record<string, string>) => {
  const url = new URL(base);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  return url.toString();
};

const requestJson = async <T = any>(
  url: string,
  init: RequestInit = {},
  signal?: AbortSignal,
): Promise<T> => {
  const response = await fetch(url, { credentials: "include", ...init, signal });
  const text = await response.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new BaiduPanError(`百度网盘返回了非 JSON 响应（HTTP ${response.status}）`);
  }
  return data as T;
};

const formBody = (fields: Record<string, string>) => {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) body.set(key, value);
  return body;
};

/**
 * 百度接口在扩展环境下会看到 chrome-extension:// 的 Origin，这里用会话级 DNR 规则
 * 把本扩展发往百度网盘的请求改成网页版的 Origin/Referer，保持与网页版一致。
 */
let headerRuleReady: Promise<void> | null = null;
export const ensureBaiduHeaderRule = () => {
  if (headerRuleReady) return headerRuleReady;
  headerRuleReady = (async () => {
    const dnr = (browser as any).declarativeNetRequest;
    if (!dnr?.updateSessionRules) return;
    const ruleId = 9101;
    try {
      await dnr.updateSessionRules({
        removeRuleIds: [ruleId],
        addRules: [
          {
            id: ruleId,
            priority: 10,
            action: {
              type: "modifyHeaders",
              requestHeaders: [
                { header: "origin", operation: "set", value: PAN_ORIGIN },
                { header: "referer", operation: "set", value: `${PAN_ORIGIN}/disk/main` },
              ],
            },
            condition: {
              requestDomains: ["pan.baidu.com", "pcs.baidu.com", "baidupcs.com"],
              initiatorDomains: [location.hostname],
              resourceTypes: ["xmlhttprequest"],
            },
          },
        ],
      });
    } catch (error) {
      console.warn("注册百度网盘请求头规则失败，将直接请求:", error);
    }
  })();
  return headerRuleReady;
};

export interface BaiduUserInfo {
  name: string;
  avatar: string;
  vipType: number;
  vipLabel: string;
}

const VIP_LABELS: Record<number, string> = { 0: "普通用户", 1: "会员", 2: "超级会员" };

/** 获取登录用户信息，未登录返回 null */
/**
 * 检查百度网盘登录状态并获取用户信息，未登录返回 null。
 *
 * 不能只看 xpan/nas?method=uinfo：未登录时它也可能返回 errno=0，导致误判为已登录，
 * 直到上传阶段取 bdstoken 才报「登录已失效」。因此以上传真正依赖的 bdstoken 为准。
 */
export async function getBaiduUserInfo(signal?: AbortSignal): Promise<BaiduUserInfo | null> {
  await ensureBaiduHeaderRule();
  try {
    await getBdstoken(signal);
  } catch (error) {
    if (error instanceof BaiduPanError && error.errno === -6) return null;
    throw error;
  }

  const data = await requestJson(
    buildUrl(`${PAN_ORIGIN}/rest/2.0/xpan/nas`, { method: "uinfo", ...COMMON_QUERY }),
    {},
    signal,
  ).catch(() => null);
  if (data && (data.errno === -6 || data.errno === 111 || data.errno === -3)) return null;
  if (!data || data.errno !== 0) {
    // bdstoken 已拿到说明登录有效，只是用户信息接口异常，返回基础信息即可
    return { name: "百度用户", avatar: "", vipType: 0, vipLabel: VIP_LABELS[0] };
  }
  const vipType = Number(data.vip_type ?? 0);
  return {
    name: data.netdisk_name || data.baidu_name || "百度用户",
    avatar: data.avatar_url || "",
    vipType,
    vipLabel: VIP_LABELS[vipType] ?? "普通用户",
  };
}

export interface BaiduQuota {
  total: number;
  used: number;
  free: number;
}

export async function getBaiduQuota(signal?: AbortSignal): Promise<BaiduQuota> {
  const data = await requestJson(
    buildUrl(`${PAN_ORIGIN}/api/quota`, { checkfree: "1", checkexpire: "1", ...COMMON_QUERY }),
    {},
    signal,
  );
  if (data.errno !== 0) {
    throw new BaiduPanError(describeErrno(data.errno, "获取网盘容量失败"), data.errno);
  }
  const total = Number(data.total ?? 0);
  const used = Number(data.used ?? 0);
  return { total, used, free: Number(data.free ?? Math.max(0, total - used)) };
}

/** 网页版写接口需要 bdstoken；先走 gettemplatevariable，失败再兜底 loginStatus */
export async function getBdstoken(signal?: AbortSignal): Promise<string> {
  try {
    const data = await requestJson(
      buildUrl(`${PAN_ORIGIN}/api/gettemplatevariable`, {
        fields: JSON.stringify(["bdstoken"]),
        ...COMMON_QUERY,
      }),
      {},
      signal,
    );
    if (data.errno === 0 && data.result?.bdstoken) return String(data.result.bdstoken);
    if (data.errno === -6) throw new BaiduPanError(describeErrno(-6), -6);
  } catch (error) {
    if (error instanceof BaiduPanError && error.errno === -6) throw error;
    if (signal?.aborted) throw error;
  }
  const data = await requestJson(
    buildUrl(`${PAN_ORIGIN}/api/loginStatus`, COMMON_QUERY),
    {},
    signal,
  );
  const token = data?.login_info?.bdstoken;
  if (!token) throw new BaiduPanError("未登录百度网盘，请先在浏览器中登录 pan.baidu.com", -6);
  return String(token);
}

/** 规范化网盘路径：以 / 开头、去掉结尾 /、折叠重复斜杠 */
export const normalizePanPath = (path: string) => {
  const cleaned = `/${path.trim()}`.replace(/\\/g, "/").replace(/\/+/g, "/");
  return cleaned.length > 1 ? cleaned.replace(/\/$/, "") : "/";
};

/**
 * 文件名中去掉网盘不允许的字符。
 * 百度网盘不接受 emoji 等 4 字节 UTF-8 字符（返回 errno -7「文件或目录名不合法」），
 * 因此一并去掉 BMP 之外的字符、emoji 及其变体选择符 / 零宽连接符。
 */
export const sanitizePanFileName = (name: string, maxLength = 120) => {
  const cleaned = name
    .replace(/[\u{10000}-\u{10FFFF}]|\p{Extended_Pictographic}|[​-‏︀-️]/gu, "")
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "");
  return (cleaned || "untitled").slice(0, maxLength);
};

/** 创建目录（已存在视为成功） */
export async function ensureBaiduDir(dir: string, bdstoken: string, signal?: AbortSignal) {
  const path = normalizePanPath(dir);
  if (path === "/") return;

  // 先查目录是否已存在：已存在就直接用。
  // 不能直接调 create —— 网盘对已存在的同名目录默认会自动重命名，
  // 每次备份都会多出一个「目录名_时间戳」的空目录。
  const listed = await requestJson(
    buildUrl(`${PAN_ORIGIN}/api/list`, { dir: path, num: "1", page: "1", ...COMMON_QUERY }),
    {},
    signal,
  );
  if (listed.errno === 0) return;
  if (listed.errno !== -9) {
    throw new BaiduPanError(describeErrno(listed.errno, "检查网盘目录失败"), listed.errno);
  }

  // 不存在才创建；rtype=0 表示同名时不重命名（并发创建撞上同名时返回已存在）
  const data = await requestJson(
    buildUrl(`${PAN_ORIGIN}/api/create`, { a: "commit", bdstoken, ...COMMON_QUERY }),
    {
      method: "POST",
      body: formBody({ path, isdir: "1", rtype: "0", block_list: "[]" }),
    },
    signal,
  );
  // -8 / 31061：目录已存在
  if (data.errno === 0 || data.errno === -8 || data.errno === 31061) return;
  throw new BaiduPanError(describeErrno(data.errno, "创建网盘目录失败"), data.errno);
}

/** 获取上传服务器列表，失败时回退默认 d.pcs.baidu.com */
async function locateUploadHosts(signal?: AbortSignal): Promise<string[]> {
  try {
    const data = await requestJson(
      buildUrl("https://pcs.baidu.com/rest/2.0/pcs/file", {
        method: "locateupload",
        upload_version: "2.0",
        app_id: APP_ID,
      }),
      {},
      signal,
    );
    const hosts = new Set<string>();
    if (typeof data.host === "string" && data.host) hosts.add(data.host);
    for (const item of data.servers ?? []) {
      const server = String(item?.server ?? "");
      if (server.startsWith("https://")) hosts.add(server.replace(/^https:\/\//, "").split("/")[0]);
    }
    hosts.add(DEFAULT_UPLOAD_HOST);
    return [...hosts];
  } catch (error) {
    if (signal?.aborted) throw error;
    return [DEFAULT_UPLOAD_HOST];
  }
}

const sliceCount = (size: number) => Math.max(1, Math.ceil(size / BAIDU_SLICE_SIZE));

const sliceOf = (file: Blob, index: number) =>
  file.slice(index * BAIDU_SLICE_SIZE, Math.min(file.size, (index + 1) * BAIDU_SLICE_SIZE));

/** 计算每个 4MB 分片的 MD5，作为 precreate/create 的 block_list */
export async function computeBlockList(
  file: Blob,
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<string[]> {
  const total = sliceCount(file.size);
  const list: string[] = [];
  for (let i = 0; i < total; i++) {
    signal?.throwIfAborted();
    const buffer = await sliceOf(file, i).arrayBuffer();
    list.push(SparkMD5.ArrayBuffer.hash(buffer));
    onProgress?.(i + 1, total);
  }
  return list;
}

export interface BaiduUploadProgress {
  stage: "hash" | "upload" | "commit";
  /** 已处理字节 */
  loaded: number;
  total: number;
}

export interface BaiduUploadResult {
  path: string;
  fsId: string;
  size: number;
  rapid: boolean;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });

/**
 * 上传 Blob 到百度网盘。
 * @param file 文件内容
 * @param remotePath 完整网盘路径（含文件名）
 */
export async function uploadToBaiduPan(
  file: Blob,
  remotePath: string,
  options: {
    onProgress?: (progress: BaiduUploadProgress) => void;
    onLog?: (message: string) => void;
    signal?: AbortSignal;
  } = {},
): Promise<BaiduUploadResult> {
  const { onProgress, onLog, signal } = options;
  await ensureBaiduHeaderRule();

  const path = normalizePanPath(remotePath);
  const dir = path.slice(0, path.lastIndexOf("/")) || "/";
  const bdstoken = await getBdstoken(signal);
  await ensureBaiduDir(dir, bdstoken, signal);

  onLog?.(`计算分片校验值（${sliceCount(file.size)} 片）`);
  const blockList = await computeBlockList(
    file,
    (done, total) =>
      onProgress?.({
        stage: "hash",
        loaded: Math.min(file.size, done * BAIDU_SLICE_SIZE),
        total: file.size,
      }),
    signal,
  );
  const blockListJson = JSON.stringify(blockList);
  const localMtime = String(Math.floor(Date.now() / 1000));

  const precreate = await requestJson(
    buildUrl(`${PAN_ORIGIN}/api/precreate`, { bdstoken, ...COMMON_QUERY }),
    {
      method: "POST",
      body: formBody({
        path,
        size: String(file.size),
        isdir: "0",
        autoinit: "1",
        rtype: "1",
        block_list: blockListJson,
        local_mtime: localMtime,
      }),
    },
    signal,
  );
  if (precreate.errno !== 0) {
    throw new BaiduPanError(describeErrno(precreate.errno, "预创建上传失败"), precreate.errno);
  }

  if (precreate.return_type === 2) {
    const info = precreate.info ?? {};
    onLog?.("网盘中已有相同文件，秒传成功");
    onProgress?.({ stage: "commit", loaded: file.size, total: file.size });
    return {
      path: String(info.path ?? precreate.path ?? path),
      fsId: String(info.fs_id ?? ""),
      size: file.size,
      rapid: true,
    };
  }

  const uploadId = String(precreate.uploadid ?? "");
  if (!uploadId) throw new BaiduPanError("预创建未返回 uploadid");

  const totalSlices = blockList.length;
  const pending: number[] =
    Array.isArray(precreate.block_list) && precreate.block_list.length > 0
      ? precreate.block_list.map(Number)
      : Array.from({ length: totalSlices }, (_, i) => i);
  const pendingSet = new Set(pending);
  let uploadedBytes = 0;
  for (let i = 0; i < totalSlices; i++) {
    if (!pendingSet.has(i)) uploadedBytes += sliceOf(file, i).size;
  }
  if (pending.length < totalSlices) {
    onLog?.(`服务器已有 ${totalSlices - pending.length} 个分片，跳过`);
  }

  const hosts = await locateUploadHosts(signal);
  let hostIndex = 0;
  onLog?.(`开始上传 ${pending.length} 个分片，上传服务器 ${hosts[0]}`);

  for (const partseq of pending) {
    const slice = sliceOf(file, partseq);
    let attempt = 0;
    while (true) {
      signal?.throwIfAborted();
      const host = hosts[hostIndex % hosts.length];
      try {
        const form = new FormData();
        form.append("file", slice, "blob");
        const data = await requestJson(
          buildUrl(`https://${host}/rest/2.0/pcs/superfile2`, {
            method: "upload",
            type: "tmpfile",
            path,
            uploadid: uploadId,
            uploadsign: "0",
            partseq: String(partseq),
            bdstoken,
            ...COMMON_QUERY,
          }),
          { method: "POST", body: form },
          signal,
        );
        if (data.error_code || !data.md5) {
          throw new BaiduPanError(
            `分片上传失败：${data.error_msg || describeErrno(Number(data.error_code ?? -1))}`,
            Number(data.error_code ?? -1),
          );
        }
        if (data.md5 !== blockList[partseq]) {
          // 服务端返回的 md5 与本地不一致时以服务端为准，create 时提交服务端值
          blockList[partseq] = data.md5;
        }
        break;
      } catch (error) {
        if (signal?.aborted) throw error;
        attempt++;
        if (attempt >= 4) throw error;
        hostIndex++;
        onLog?.(
          `第 ${partseq + 1} 片上传失败，${attempt * 2}s 后重试：${error instanceof Error ? error.message : error}`,
        );
        await sleep(attempt * 2000, signal);
      }
    }
    uploadedBytes += slice.size;
    onProgress?.({ stage: "upload", loaded: uploadedBytes, total: file.size });
  }

  onProgress?.({ stage: "commit", loaded: file.size, total: file.size });
  const created = await requestJson(
    buildUrl(`${PAN_ORIGIN}/api/create`, { isdir: "0", rtype: "1", bdstoken, ...COMMON_QUERY }),
    {
      method: "POST",
      body: formBody({
        path,
        size: String(file.size),
        isdir: "0",
        uploadid: uploadId,
        rtype: "1",
        block_list: JSON.stringify(blockList),
        local_mtime: localMtime,
      }),
    },
    signal,
  );
  if (created.errno !== 0) {
    throw new BaiduPanError(describeErrno(created.errno, "合并分片失败"), created.errno);
  }

  return {
    path: String(created.path ?? path),
    fsId: String(created.fs_id ?? ""),
    size: Number(created.size ?? file.size),
    rapid: false,
  };
}

export const BAIDU_LOGIN_URL = `${PAN_ORIGIN}/disk/main`;

/** 网盘网页中打开某个目录 */
export const baiduDirUrl = (dir: string) =>
  `${PAN_ORIGIN}/disk/main#/index?category=all&path=${encodeURIComponent(normalizePanPath(dir))}`;
