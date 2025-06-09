import { HistoryItem } from "@/utils/types";
import apiClient from "@/utils/apiClient";

export const uploadBatchHistory = async (batch: HistoryItem[]) => {
  // 因为字段刚开始设计的时候没统一，所以需要转换一下
  const uploadBatch = batch.map((item) => ({
    ...item,
    tagName: item.tag_name,
    authorName: item.author_name,
    authorMid: item.author_mid,
  }));
  const response = await apiClient.post("/api/history", uploadBatch);
  return response;
};
