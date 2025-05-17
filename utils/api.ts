import { HistoryItem, SyncResponse } from "./types";

const API_BASE = "https://api.bilibili.com/x/v2/history";

export const fetchHistory = async (
  page: number = 1
): Promise<HistoryItem[]> => {
  const response = await fetch(`${API_BASE}?pn=${page}&ps=20`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch history");
  }

  const data: SyncResponse = await response.json();

  if (data.code !== 0) {
    throw new Error(data.message);
  }

  return data.data.list;
};

export const getContentUrl = (item: HistoryItem): string => {
  switch (item.business) {
    case "archive":
    case "pgc":
      return item.uri || "";
    case "article":
    case "article-list":
      return `https://www.bilibili.com/read/cv${item.id}`;
    case "live":
      return `https://live.bilibili.com/${item.id}`;
    case "cheese":
      return item.uri || "";
    default:
      return `https://www.bilibili.com/video/${item.bvid}`;
  }
};
