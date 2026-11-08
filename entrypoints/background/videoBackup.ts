/**
 * 视频备份到百度网盘：入队与打开备份页面。
 * 实际下载/上传在插件页面里执行（见 utils/videoBackupWorker.ts），后台只负责入队和拉起页面。
 */
import { BAIDU_LOGIN_URL, getBaiduUserInfo } from "@/utils/baiduPan";
import { enqueueVideoBackup } from "@/utils/videoBackupQueue";
import type { MessageHandlerMap } from "./shared/types";

const MAIN_PAGE = "/my-history.html";
const VIDEO_BACKUP_PAGE = "/my-history.html#/video-backup";
const BVID_PATTERN = /^BV[0-9A-Za-z]{10}$/;

/**
 * 确保有一个插件页面在运行备份队列：已有页面则复用，否则在后台新开（不抢焦点）。
 * active=true 时切换到备份页并聚焦窗口。
 */
async function openVideoBackupPage(active: boolean): Promise<void> {
  const pageUrlPrefix = browser.runtime.getURL(MAIN_PAGE);
  const tabs = await browser.tabs.query({});
  const existing = tabs.find((tab) => tab.url?.startsWith(pageUrlPrefix));

  if (existing?.id === undefined) {
    await browser.tabs.create({ url: browser.runtime.getURL(VIDEO_BACKUP_PAGE), active });
    return;
  }
  if (!active) return;

  await browser.tabs.update(existing.id, {
    active: true,
    url: browser.runtime.getURL(VIDEO_BACKUP_PAGE),
  });
  if (existing.windowId !== undefined) {
    await browser.windows.update(existing.windowId, { focused: true });
  }
}

/** 明确未登录才返回 true；检查本身失败（网络等）不阻塞入队，执行时会再次检查 */
async function isBaiduLoggedOut(): Promise<boolean> {
  return getBaiduUserInfo().then(
    (user) => !user,
    (error) => {
      console.warn("检查百度网盘登录状态失败:", error);
      return false;
    },
  );
}

async function handleEnqueueVideoBackup(message: { bvid?: string; page?: number; title?: string }) {
  const bvid = String(message.bvid ?? "");
  if (!BVID_PATTERN.test(bvid)) return { success: false, error: "无法识别当前视频的 BV 号" };
  if (await isBaiduLoggedOut()) {
    return { success: false, needLogin: true, error: "请先登录百度网盘" };
  }

  const page = Math.max(1, Number(message.page) || 1);
  const result = await enqueueVideoBackup({ bvid, page, title: message.title });
  await openVideoBackupPage(false);
  return { success: true, status: result.status };
}

export const videoBackupMessageHandlers: MessageHandlerMap = {
  enqueueVideoBackup: handleEnqueueVideoBackup,

  openVideoBackupPage: async () => {
    await openVideoBackupPage(true);
    return { success: true };
  },

  openBaiduLogin: async () => {
    void browser.tabs.create({ url: BAIDU_LOGIN_URL });
    return { success: true };
  },
};
