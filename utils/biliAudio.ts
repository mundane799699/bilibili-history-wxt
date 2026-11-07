/**
 * 从 B 站 playurl 返回的 dash.audio 条目里挑出可以在扩展页面直接播放的音频地址。
 *
 * playurl 的 baseUrl 经常是 PCDN 节点（如 *.mcdn.bilivideo.cn、*.edge.mountaintoys.cn），
 * 这些域名不在 public/referrer.json 的 DNR 规则里，请求不会被补上
 * Referer: https://www.bilibili.com，于是返回 403。
 * 因此优先使用 DNR 已覆盖的官方 CDN（*.bilivideo.com / *.akamaized.net）。
 */
const hostRank = (url: string) => {
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    return 99;
  }
  if (host.endsWith(".bilivideo.com")) return 0;
  if (host.endsWith(".akamaized.net")) return 1;
  return 2;
};

export const getAudioUrl = (audio: any): string => {
  const candidates = [audio?.baseUrl, audio?.base_url, ...(audio?.backup_url ?? [])].filter(
    (url): url is string => typeof url === "string" && url.length > 0,
  );
  // sort 是稳定排序，同一档内保持 B 站返回的原始顺序
  return [...new Set(candidates)].sort((a, b) => hostRank(a) - hostRank(b))[0] ?? "";
};
