import { HistoryItem } from "./types";

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
