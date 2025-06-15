import { HistoryItem } from "@/utils/types";
import apiClient from "@/utils/apiClient";

export const uploadBatchHistory = async (batch: HistoryItem[]) => {
  // 直接上传，不需要字段转换
  const response = await apiClient.post("/api/history", batch);
  return response;
};
