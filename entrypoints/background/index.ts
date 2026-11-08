/**
 * 后台 service worker 入口：只负责注册各类监听，具体逻辑见同目录下各模块。
 *
 * - alarms.ts                定时任务（历史同步 / WebDAV 自动同步 / 本地备份）
 * - messageRouter.ts         页面与 content script 发来的消息分发
 * - history.ts               观看历史同步与删除
 * - favorites/               收藏夹同步（单个 / 全部，断点续传与风控冷却）
 * - subscribedCollections.ts 订阅合集同步
 * - webdavAutoSync.ts        WebDAV 双向同步
 * - localBackup.ts           本地目录备份
 * - videoBackup.ts           视频备份到百度网盘
 * - shared/                  B 站请求客户端与通用工具
 */
import { BACKUP_REMINDER_LAST_DISMISSED_AT } from "@/utils/constants";
import { setStorageValue } from "@/utils/storage";
import { ensureAlarms, registerAlarmListener } from "./alarms";
import { registerMessageRouter } from "./messageRouter";

const openMainPage = () => browser.tabs.create({ url: browser.runtime.getURL("/my-history.html") });

export default defineBackground(() => {
  // MV3 要求监听器在 service worker 启动时同步注册
  registerAlarmListener();
  registerMessageRouter();

  (browser.action ?? browser.browserAction).onClicked.addListener(() => void openMainPage());

  browser.runtime.onInstalled.addListener(async (details) => {
    if (details.reason !== "install") return;
    // 首次安装不弹备份提醒：提醒间隔（7 天）从安装时开始计算
    await setStorageValue(BACKUP_REMINDER_LAST_DISMISSED_AT, Date.now());
    await openMainPage();
  });

  void ensureAlarms().catch((error) => console.error("初始化定时任务失败:", error));
});
