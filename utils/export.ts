import { HistoryItem } from "./types";
import { getAllHistory } from "./db";

/**
 * 将历史记录转换为CSV格式
 * @param items 历史记录列表
 * @returns CSV格式的字符串
 */
const convertToCSV = (items: HistoryItem[]): string => {
  // CSV 表头
  const headers = ["标题", "观看时间", "类型", "链接", "封面"].join(",");

  // 转换每条记录为CSV行
  const rows = items.map((item) => {
    const viewTime = new Date(item.viewTime * 1000).toLocaleString();
    const type =
      item.business === "archive" || item.business === "pgc"
        ? "视频"
        : item.business === "article" || item.business === "article-list"
        ? "专栏"
        : item.business === "live"
        ? "直播"
        : "其他";

    const url =
      item.business === "archive" || item.business === "pgc"
        ? `https://www.bilibili.com/video/${item.bvid}`
        : item.business === "article" || item.business === "article-list"
        ? `https://www.bilibili.com/read/cv${item.id}`
        : item.business === "live"
        ? `https://live.bilibili.com/${item.id}`
        : "";

    // 处理字段中可能包含逗号的情况
    const escapeField = (field: string) => {
      if (field.includes(",") || field.includes('"') || field.includes("\n")) {
        return `"${field.replace(/"/g, '""')}"`;
      }
      return field;
    };

    return [
      escapeField(item.title),
      escapeField(viewTime),
      escapeField(type),
      escapeField(url),
      escapeField(item.cover || ""),
    ].join(",");
  });

  // 组合表头和数据行
  return [headers, ...rows].join("\n");
};

/**
 * 导出历史记录为CSV文件
 */
export const exportHistoryToCSV = async (): Promise<void> => {
  try {
    // 获取所有历史记录
    const items = await getAllHistory();

    // 转换为CSV
    const csv = convertToCSV(items);

    // 创建Blob对象
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });

    // 创建下载链接
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;

    // 设置文件名（包含当前日期）
    const date = new Date().toISOString().split("T")[0];
    link.download = `bilibili-history-${date}.csv`;

    // 触发下载
    document.body.appendChild(link);
    link.click();

    // 清理
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error("导出历史记录失败:", error);
    throw error;
  }
};
