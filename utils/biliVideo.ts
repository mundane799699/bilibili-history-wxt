/**
 * B 站视频信息 / 播放地址 / DASH 流下载。
 *
 * 下载在扩展页面里直接 fetch：B 站 upos CDN 只校验 Referer，public/referrer.json 的
 * DNR 规则已为扩展发往 *.bilivideo.com / *.akamaized.net 的 GET 请求补上 Referer。
 * PCDN 节点（*.mcdn.bilivideo.cn 等）不在规则覆盖范围内，因此按 biliAudio 的策略
 * 优先使用官方 CDN，并依次尝试 backup_url。
 */
import { getStreamCandidates } from "./biliAudio";

export type VideoCodecPreference = "avc" | "hevc" | "av1";

/** B 站 codecid：7=AVC，12=HEVC，13=AV1 */
const CODEC_IDS: Record<VideoCodecPreference, number> = { avc: 7, hevc: 12, av1: 13 };

export const QUALITY_LABELS: Record<number, string> = {
  6: "240P",
  16: "360P",
  32: "480P",
  64: "720P",
  74: "720P60",
  80: "1080P",
  100: "智能修复",
  112: "1080P+",
  116: "1080P60",
  120: "4K",
  125: "HDR",
  126: "杜比视界",
  127: "8K",
};

export const CODEC_LABELS: Record<number, string> = { 7: "AVC", 12: "HEVC", 13: "AV1" };

export interface BiliVideoPage {
  cid: number;
  page: number;
  part: string;
  duration: number;
}

export interface BiliVideoInfo {
  bvid: string;
  aid: number;
  title: string;
  cover: string;
  ownerName: string;
  pages: BiliVideoPage[];
}

export async function fetchBiliVideoInfo(
  bvid: string,
  signal?: AbortSignal,
): Promise<BiliVideoInfo> {
  const response = await fetch(
    `https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`,
    { credentials: "include", signal },
  );
  const json = await response.json();
  if (json.code !== 0) throw new Error(json.message || `获取视频信息失败（code=${json.code}）`);
  const data = json.data;
  return {
    bvid: data.bvid,
    aid: data.aid,
    title: data.title,
    cover: data.pic,
    ownerName: data.owner?.name ?? "",
    pages: (data.pages ?? []).map((p: any) => ({
      cid: p.cid,
      page: p.page,
      part: p.part,
      duration: p.duration,
    })),
  };
}

export interface SelectedStreams {
  qualityId: number;
  qualityLabel: string;
  codecId: number;
  videoUrls: string[];
  audioUrls: string[];
  /** 预估大小（字节），用于空间/上限预检；拿不到时为 0 */
  estimatedSize: number;
}

/**
 * 选择要下载的音视频流：画质取最高（跳过杜比视界），同画质下按编码偏好挑选。
 */
export async function selectBiliStreams(
  bvid: string,
  cid: number,
  codecPreference: VideoCodecPreference,
  signal?: AbortSignal,
): Promise<SelectedStreams> {
  const params = new URLSearchParams({
    bvid,
    cid: String(cid),
    qn: "127",
    fnval: "4048",
    fnver: "0",
    fourk: "1",
  });
  const response = await fetch(`https://api.bilibili.com/x/player/playurl?${params}`, {
    credentials: "include",
    signal,
  });
  const json = await response.json();
  if (json.code !== 0) throw new Error(json.message || `获取播放地址失败（code=${json.code}）`);
  const dash = json.data?.dash;
  if (!dash?.video?.length) {
    throw new Error("该视频没有 DASH 流（可能是付费/番剧或旧格式视频），暂不支持备份");
  }

  const videos: any[] = dash.video.filter((v: any) => v.id !== 126);
  const candidates = videos.length > 0 ? videos : dash.video;
  const topQuality = Math.max(...candidates.map((v: any) => Number(v.id)));
  const sameQuality = candidates.filter((v: any) => Number(v.id) === topQuality);
  const preferredOrder = [
    CODEC_IDS[codecPreference],
    ...[7, 12, 13].filter((id) => id !== CODEC_IDS[codecPreference]),
  ];
  const video =
    preferredOrder
      .map((codecId) => sameQuality.find((v: any) => Number(v.codecid) === codecId))
      .find(Boolean) ?? sameQuality[0];

  const audios: any[] = dash.audio ?? [];
  const audio = [...audios].sort((a, b) => Number(b.bandwidth ?? 0) - Number(a.bandwidth ?? 0))[0];

  const duration = Number(dash.duration) || Number(json.data?.timelength ?? 0) / 1000 || 0;
  const estimatedSize = Math.round(
    (duration * (Number(video.bandwidth ?? 0) + Number(audio?.bandwidth ?? 0))) / 8,
  );

  return {
    qualityId: topQuality,
    qualityLabel: QUALITY_LABELS[topQuality] ?? String(topQuality),
    codecId: Number(video.codecid),
    videoUrls: getStreamCandidates(video),
    audioUrls: audio ? getStreamCandidates(audio) : [],
    estimatedSize,
  };
}

/** 把下载过程中的分块按 16MB 归并成 Blob，避免大量小 Uint8Array 常驻 JS 堆 */
const MERGE_THRESHOLD = 16 * 1024 * 1024;

async function downloadOnce(
  url: string,
  onProgress: (loaded: number, total: number) => void,
  signal?: AbortSignal,
): Promise<Blob> {
  const response = await fetch(url, { signal, credentials: "omit" });
  if (!response.ok || !response.body) {
    throw new Error(`HTTP ${response.status}`);
  }
  const total = Number(response.headers.get("content-length") ?? 0);
  const reader = response.body.getReader();
  const parts: Blob[] = [];
  let buffer: Uint8Array[] = [];
  let bufferSize = 0;
  let loaded = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer.push(value);
    bufferSize += value.length;
    loaded += value.length;
    if (bufferSize >= MERGE_THRESHOLD) {
      parts.push(new Blob(buffer as BlobPart[]));
      buffer = [];
      bufferSize = 0;
    }
    onProgress(loaded, total);
  }
  if (buffer.length) parts.push(new Blob(buffer as BlobPart[]));
  if (total && loaded !== total) {
    throw new Error(`下载不完整（${loaded}/${total}）`);
  }
  return new Blob(parts);
}

/** 依次尝试候选地址下载一条流 */
export async function downloadBiliStream(
  urls: string[],
  onProgress: (loaded: number, total: number) => void,
  signal?: AbortSignal,
): Promise<Blob> {
  if (urls.length === 0) throw new Error("没有可用的下载地址");
  const errors: string[] = [];
  for (const url of urls) {
    signal?.throwIfAborted();
    try {
      return await downloadOnce(url, onProgress, signal);
    } catch (error) {
      if (signal?.aborted) throw error;
      let host = url;
      try {
        host = new URL(url).hostname;
      } catch {
        // ignore
      }
      errors.push(`${host}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(`下载失败：${errors.join("；")}`);
}
