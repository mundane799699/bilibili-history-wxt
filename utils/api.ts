import { HistoryItem, SyncResponse } from "./types";

const API_BASE = "https://api.bilibili.com/x/v2/history";

export const fetchHistory = async (page: number = 1): Promise<HistoryItem[]> => {
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
