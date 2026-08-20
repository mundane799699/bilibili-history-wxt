import { HistoryItem } from "./types";

export const formatDuration = (duration?: number | string): string => {
  if (duration === undefined || duration === null) return "00:00";

  if (typeof duration === "string" && duration.includes(":")) {
    const parts = duration.split(":");
    if (parts.length === 2) {
      return `${parts[0].padStart(2, "0")}:${parts[1].padStart(2, "0")}`;
    }
    if (parts.length === 3) {
      return `${parts[0]}:${parts[1].padStart(2, "0")}:${parts[2].padStart(2, "0")}`;
    }
  }

  const seconds = Number(duration);
  if (!Number.isFinite(seconds)) return "00:00";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${remainingSeconds
      .toString()
      .padStart(2, "0")}`;
  }

  return `${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
};

export const getTypeTag = (business: string): string => {
  switch (business) {
    case "live":
      return "直播";
    case "article":
    case "article-list":
      return "专栏";
    case "cheese":
      return "课堂";
    case "pgc":
      return "番剧";
    case "archive":
      return "视频";
    default:
      return "其他";
  }
};

export const getContentUrl = (item: HistoryItem): string => {
  switch (item.business) {
    case "archive":
      return `https://www.bilibili.com/video/${item.bvid}`;
    case "pgc":
      return item.uri || "";
    case "article":
      return `https://www.bilibili.com/read/cv${item.id}`;
    case "article-list":
      return `https://www.bilibili.com/read/cv${item.cid ?? item.id}`;
    case "live":
      return `https://live.bilibili.com/${item.id}`;
    case "cheese":
      return item.uri || "";
    default:
      const videoUrl = `https://www.bilibili.com/video/${item.bvid}`;
      return item.progress && item.progress > 0 ? `${videoUrl}?t=${item.progress}` : videoUrl;
  }
};
