/**
 * 从 B 站页面链接中识别视频。支持：
 * - /video/BV1xx…、/video/av170001（大小写不敏感，兼容 bv2av 等脚本改写后的链接）
 * - /list/watchlater?bvid=BV…、/list/ml{id}?bvid=BV…（稍后再看 / 收藏夹播放页），
 *   没有 bvid 时退回 oid（即 aid）
 * 番剧页 /bangumi/play/ 不是普通稿件，不支持。
 */
export interface BiliVideoTarget {
  /** 有 BV 号时优先使用；只有 av 号时为空，需要调用方换算 */
  bvid?: string;
  aid?: number;
  page: number;
}

const BVID_BODY = /^[0-9A-Za-z]{10}$/;

/** 规范化 BV 号：前缀统一大写，主体区分大小写保持原样 */
export const normalizeBvid = (raw: string | null | undefined): string | undefined => {
  if (!raw || raw.length !== 12 || raw.slice(0, 2).toUpperCase() !== "BV") return undefined;
  const body = raw.slice(2);
  return BVID_BODY.test(body) ? `BV${body}` : undefined;
};

export const normalizeAid = (raw: string | number | null | undefined): number | undefined => {
  const aid = Number(String(raw ?? "").replace(/^av/i, ""));
  return Number.isSafeInteger(aid) && aid > 0 ? aid : undefined;
};

const parsePage = (params: URLSearchParams) => {
  const page = Number(params.get("p") ?? "1");
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
};

export function parseBiliVideoUrl(href: string): BiliVideoTarget | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (!/(^|\.)bilibili\.com$/.test(url.hostname)) return null;

  const page = parsePage(url.searchParams);

  const videoMatch = url.pathname.match(/^\/video\/([^/?#]+)/);
  if (videoMatch) {
    const id = videoMatch[1];
    const bvid = normalizeBvid(id);
    if (bvid) return { bvid, page };
    const aid = /^av\d+$/i.test(id) ? normalizeAid(id) : undefined;
    return aid ? { aid, page } : null;
  }

  if (/^\/list\//.test(url.pathname)) {
    const bvid = normalizeBvid(url.searchParams.get("bvid"));
    if (bvid) return { bvid, page };
    const aid = normalizeAid(url.searchParams.get("oid") ?? url.searchParams.get("aid"));
    return aid ? { aid, page } : null;
  }

  return null;
}

/** 用于判断"是否切换到了另一个视频" */
export const biliVideoTargetKey = (target: BiliVideoTarget) =>
  `${target.bvid ?? `av${target.aid}`}-p${target.page}`;
