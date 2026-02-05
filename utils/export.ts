import { HistoryItem, LikedMusic } from "./types";
import { getAllHistory, getAllLikedMusic } from "./db";
import { getTypeTag, getContentUrl } from "./common";

/**
 * 将历史记录转换为CSV格式
 * @param items 历史记录列表
 * @returns CSV格式的字符串
 */
const convertToCSV = (items: HistoryItem[]): string => {
  // CSV 表头
  const headers = [
    "标题",
    "观看时间",
    "类型",
    "链接",
    "封面",
    "作者",
    "作者主页",
  ].join(",");

  // 转换每条记录为CSV行
  const rows = items.map((item) => {
    const viewAt = new Date(item.view_at * 1000).toLocaleString();
    const type = getTypeTag(item.business);
    const url = getContentUrl(item);
    const authorUrl = `https://space.bilibili.com/${item.author_mid}`;

    // 处理字段中可能包含逗号的情况
    const escapeField = (field: string) => {
      if (field.includes(",") || field.includes('"') || field.includes("\n")) {
        return `"${field.replace(/"/g, '""')}"`;
      }
      return field;
    };

    return [
      escapeField(item.title),
      escapeField(viewAt),
      escapeField(type),
      escapeField(url),
      escapeField(item.cover || ""),
      escapeField(item.author_name || ""),
      escapeField(authorUrl),
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

/**
 * 导出历史记录为JSON文件
 */
export const exportHistoryToJSON = async (): Promise<void> => {
  try {
    // 获取所有历史记录
    const items = await getAllHistory();

    // 转换为JSON字符串
    const json = JSON.stringify(items, null, 2); // null, 2 用于格式化输出，使其更易读

    // 创建Blob对象
    const blob = new Blob([json], { type: "application/json;charset=utf-8" });

    // 创建下载链接
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;

    // 设置文件名（包含当前日期）
    const date = new Date().toISOString().split("T")[0];
    link.download = `bilibili-history-${date}.json`;

    // 触发下载
    document.body.appendChild(link);
    link.click();

    // 清理
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error("导出历史记录为JSON失败:", error);
    throw error;
  }
};

/**
 * 导出喜欢音乐为JSON文件
 */
export const exportLikedMusicToJSON = async (): Promise<void> => {
  try {
    const items = await getAllLikedMusic();

    const json = JSON.stringify(items, null, 2);

    const blob = new Blob([json], { type: "application/json;charset=utf-8" });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;

    const date = new Date().toISOString().split("T")[0];
    link.download = `bilibili-liked-music-${date}.json`;

    document.body.appendChild(link);
    link.click();

    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error("导出喜欢音乐为JSON失败:", error);
    throw error;
  }
};

/**
 * 将喜欢的音乐记录转换为CSV格式
 */
const convertLikedMusicToCSV = (items: LikedMusic[]): string => {
  // CSV 表头
  const headers = [
    "标题",
    "作者",
    "BV号",
    "添加时间",
    "封面"
  ].join(",");

  // 转换每条记录为CSV行
  const rows = items.map((item) => {
    const addedAt = new Date(item.added_at * 1000).toLocaleString();
    const author = item.author || ""; // LikedMusic type check

    const escapeField = (field: string) => {
      if (field.includes(",") || field.includes('"') || field.includes("\n")) {
        return `"${field.replace(/"/g, '""')}"`;
      }
      return field;
    };

    return [
      escapeField(item.title),
      escapeField(author),
      escapeField(item.bvid),
      escapeField(addedAt),
      escapeField(item.pic || ""),
    ].join(",");
  });

  // 组合表头和数据行
  return [headers, ...rows].join("\n");
};

/**
 * 导出喜欢音乐为CSV文件
 */
export const exportLikedMusicToCSV = async (): Promise<void> => {
  try {
    const items = await getAllLikedMusic();

    const csv = convertLikedMusicToCSV(items);

    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;

    const date = new Date().toISOString().split("T")[0];
    link.download = `bilibili-liked-music-${date}.csv`;

    document.body.appendChild(link);
    link.click();

    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error("导出喜欢音乐为CSV失败:", error);
    throw error;
  }
};
