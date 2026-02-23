import {
  IS_SYNCING,
  HAS_FULL_SYNC,
  SYNC_INTERVAL,
  SYNC_TIME_REMAIN,
  IS_SYNC_DELETE_FROM_BILIBILI,
  IS_SYNCING_FAV,
  FAV_SYNC_INTERVAL,
  FAV_SYNC_TIME_REMAIN,
  SYNC_PROGRESS_HISTORY,
  SYNC_PROGRESS_FAV,
  HIDDEN_MENUS,
} from "../utils/constants";
import {
  openDB,
  getItem,
  deleteHistoryItem,
  saveFavFolders,
  saveFavResources,
  getFavResources,
  deleteFavResources,
} from "../utils/db";
import { getStorageValue, setStorageValue } from "../utils/storage";

export default defineBackground(() => {
  console.log("Hello background!", { id: browser.runtime.id });

  // 初始化定时任务
  browser.runtime.onInstalled.addListener(async (details) => {
    // 设置每分钟同步一次
    browser.alarms.create("syncHistory", {
      periodInMinutes: 1,
    });
    // 设置每分钟检查一次收藏夹同步
    browser.alarms.create("syncFavorites", {
      periodInMinutes: 1,
    });

    // 只在首次安装时打开设置页面并执行初始化同步
    if (details.reason === "install") {
      const url = browser.runtime.getURL("/my-history.html#/welcome");
      browser.tabs.create({ url });

      // 延迟执行，确保页面加载状态
      setTimeout(async () => {
        // 并行执行初始化同步
        const initHistory = async () => {
          await setStorageValue(IS_SYNCING, true);
          await setStorageValue(SYNC_PROGRESS_HISTORY, {
            current: 0,
            message: "正在初始化同步...",
          });
          try {
            await syncHistory(true);
          } catch (e) {
            console.error("History init failed", e);
          } finally {
            await setStorageValue(IS_SYNCING, false);
            await setStorageValue(SYNC_PROGRESS_HISTORY, { current: 0, message: "初始化同步完成" });
          }
        };
        const initFav = async () => {
          await setStorageValue(IS_SYNCING_FAV, true);
          // Initial placeholder
          await setStorageValue(SYNC_PROGRESS_FAV, {
            current: 0,
            total: 0,
            message: "正在初始化收藏夹...",
          });
          try {
            await syncFavorites();
          } catch (e) {
            console.error("Fav init failed", e);
          } finally {
            await setStorageValue(IS_SYNCING_FAV, false);
            // Completion state will be handled inside syncFavorites too, but good to ensure
          }
        };
        initHistory();
        initFav();
      }, 1000);
    }
  });

  const intervalSync = async (syncInterval: number) => {
    try {
      // 检查是否正在同步
      const isSyncing = await getStorageValue(IS_SYNCING);
      if (isSyncing) {
        console.log("同步正在进行中，跳过本次定时同步");
        return;
      }

      // 设置同步状态为进行中
      await setStorageValue(IS_SYNCING, true);
      await setStorageValue(SYNC_PROGRESS_HISTORY, { current: 0, message: "开始定时同步..." });

      // 执行增量同步
      await syncHistory(false);
    } catch (error) {
      console.error("定时同步失败:", error);
    } finally {
      // 无论成功还是失败，都重置同步状态
      await setStorageValue(IS_SYNCING, false);
      await setStorageValue(SYNC_PROGRESS_HISTORY, { current: 0, message: "同步结束" });
      // 重置当前同步剩余时间
      await setStorageValue(SYNC_TIME_REMAIN, syncInterval);
    }
  };

  const intervalFavSync = async (syncInterval: number) => {
    try {
      const isSyncing = await getStorageValue(IS_SYNCING_FAV);
      if (isSyncing) {
        console.log("收藏夹同步进行中，跳过本次");
        return;
      }

      await setStorageValue(IS_SYNCING_FAV, true);
      await syncFavorites();
    } catch (error) {
      console.error("定时收藏夹同步失败", error);
    } finally {
      await setStorageValue(IS_SYNCING_FAV, false);
      await setStorageValue(FAV_SYNC_TIME_REMAIN, syncInterval);
    }
  };

  // 监听定时任务
  browser.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === "syncHistory") {
      // 获取同步间隔
      const syncInterval = await getStorageValue(SYNC_INTERVAL, 1);
      // 获取当前同步剩余时间
      const syncRemain = await getStorageValue(SYNC_TIME_REMAIN, syncInterval);
      // 当前同步剩余时间减1
      const currentSyncRemain = syncRemain - 1;
      // 如果当前同步剩余时间大于0，则不进行同步
      if (currentSyncRemain > 0) {
        console.log(`还需${currentSyncRemain}分钟进行同步，暂时跳过`);
        // 更新同步剩余时间
        await setStorageValue(SYNC_TIME_REMAIN, currentSyncRemain);
        return;
      }
      // 使用提取的函数处理定时任务
      intervalSync(syncInterval);
    } else if (alarm.name === "syncFavorites") {
      // 检查是否隐藏了收藏夹功能
      const hiddenMenus = await getStorageValue<string[]>(HIDDEN_MENUS, []);
      if (hiddenMenus.includes("收藏夹")) {
        console.log("收藏夹功能已禁用，跳过同步");
        return;
      }

      // 默认改成15分钟同步一次
      const syncInterval = await getStorageValue(FAV_SYNC_INTERVAL, 15);
      const syncRemain = await getStorageValue(FAV_SYNC_TIME_REMAIN, syncInterval);
      const currentSyncRemain = syncRemain - 1;

      if (currentSyncRemain > 0) {
        console.log(`还需${currentSyncRemain}分钟进行收藏夹同步，暂时跳过`);
        await setStorageValue(FAV_SYNC_TIME_REMAIN, currentSyncRemain);
        return;
      }
      intervalFavSync(syncInterval);
    }
  });

  // 处理同步历史记录的消息
  const handleSyncHistory = async (message: any, sendResponse: (response: any) => void) => {
    try {
      // 检查是否正在同步
      const isSyncing = await getStorageValue(IS_SYNCING);
      if (isSyncing) {
        console.log("同步正在进行中，请稍后再试");
        sendResponse({
          success: false,
          error: "同步正在进行中，请稍后再试",
        });
        return;
      }

      // 设置同步状态为进行中
      await setStorageValue(IS_SYNCING, true);
      await setStorageValue(SYNC_PROGRESS_HISTORY, { current: 0, message: "准备开始同步..." });

      // 获取前端传递的isFullSync参数，如果没有则根据历史记录判断
      const forceFullSync = message.isFullSync || false;
      let syncResult = "";

      if (forceFullSync) {
        // 如果前端强制要求全量同步
        await syncHistory(true);
        syncResult = "全量同步成功";
        sendResponse({ success: true, message: syncResult });
      } else {
        // 之前有没有全量同步过
        const hasFullSync = await getStorageValue(HAS_FULL_SYNC, false);
        if (hasFullSync) {
          await syncHistory(false);
          syncResult = "增量同步成功";
          sendResponse({ success: true, message: syncResult });
        } else {
          // 如果没有同步记录，执行全量同步
          await syncHistory(true);
          await setStorageValue(HAS_FULL_SYNC, true);
          syncResult = "全量同步初始化成功";
          sendResponse({ success: true, message: syncResult });
        }
      }
    } catch (error) {
      console.error("同步失败:", error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : "未知错误",
      });
    } finally {
      // 无论成功还是失败，都重置同步状态
      await setStorageValue(IS_SYNCING, false);
      await setStorageValue(SYNC_PROGRESS_HISTORY, { current: 0, message: "同步完成" });
    }
  };

  const handleSyncFavorites = async (message: any, sendResponse: (response: any) => void) => {
    try {
      const isSyncing = await getStorageValue(IS_SYNCING_FAV);
      if (isSyncing) {
        sendResponse({ success: false, error: "收藏夹同步正在进行中" });
        return;
      }

      await setStorageValue(IS_SYNCING_FAV, true);
      await syncFavorites();
      sendResponse({ success: true, message: "收藏夹同步成功" });
    } catch (error) {
      console.error("同步收藏夹失败:", error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : "未知错误",
      });
    } finally {
      await setStorageValue(IS_SYNCING_FAV, false);
    }
  };

  // 处理删除历史记录的消息
  const handleDeleteHistoryItem = async (message: any, sendResponse: (response: any) => void) => {
    try {
      const syncDeleteFromBilibili = await getStorageValue(IS_SYNC_DELETE_FROM_BILIBILI, true);
      if (!syncDeleteFromBilibili) {
        sendResponse({ success: true, message: "同步删除未开启" });
        return;
      }
      await deleteHistoryItem(message.id);
      sendResponse({ success: true, message: "历史记录删除成功" });
    } catch (error) {
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : "删除失败",
      });
    }
  };

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "syncHistory") {
      handleSyncHistory(message, sendResponse);
      return true; // 保持消息通道开放
    } else if (message.action === "getCookies") {
      browser.cookies.getAll({ domain: "bilibili.com" }, (cookies) => {
        sendResponse({ success: true, cookies });
      });
      return true;
    } else if (message.action === "deleteHistoryItem") {
      handleDeleteHistoryItem(message, sendResponse);
      return true; // 保持消息通道开放
    } else if (message.action === "syncFavorites") {
      handleSyncFavorites(message, sendResponse);
      return true;
    }
  });

  // 全量同步历史记录
  async function syncHistory(isFullSync = false): Promise<boolean> {
    try {
      // 获取 B 站 cookie
      const cookies = await browser.cookies.getAll({
        domain: "bilibili.com",
      });
      const SESSDATA = cookies.find((cookie) => cookie.name === "SESSDATA")?.value;

      if (!SESSDATA) {
        throw new Error("未找到 B 站登录信息，请先登录 B 站");
      }

      let hasMore = true;
      let max = 0;
      let view_at = 0;
      const type = "all";
      const ps = 30;
      let totalSynced = 0;

      // 循环获取所有历史记录
      while (hasMore) {
        // 获取历史记录
        const response = await fetch(
          `https://api.bilibili.com/x/web-interface/history/cursor?max=${max}&view_at=${view_at}&type=${type}&ps=${ps}`,
          {
            headers: {
              Cookie: `SESSDATA=${SESSDATA}`,
            },
          },
        );

        if (!response.ok) {
          throw new Error("获取历史记录失败");
        }

        const data = await response.json();

        if (data.code !== 0) {
          throw new Error(data.message || "获取历史记录失败");
        }

        // 更新分页参数
        hasMore = data.data.list.length > 0;
        max = data.data.cursor.max;
        view_at = data.data.cursor.view_at;

        if (data.data.list.length > 0) {
          // 为每批数据创建新的事务
          const db = await openDB();
          const tx = db.transaction("history", "readwrite");
          const store = tx.objectStore("history");
          // 取出list中的第一条和最后一条
          if (!isFullSync) {
            const firstItem = data.data.list[0];
            const lastItem = data.data.list[data.data.list.length - 1];
            // 如果firstItem的bvid和lastItem的bvid在indexedDB中存在，则不进行同步
            const firstItemExists = await getItem(store, firstItem.history.oid);
            const lastItemExists = await getItem(store, lastItem.history.oid);
            if (firstItemExists && lastItemExists) {
              console.log("增量同步至此结束");
              hasMore = false;
            }
          }

          // 批量存储历史记录
          for (const item of data.data.list) {
            // put是异步的
            store.put({
              id: item.history.oid,
              business: item.history.business,
              bvid: item.history.bvid,
              cid: item.history.cid,
              title: item.title,
              tag_name: item.tag_name,
              cover: item.cover || (item.covers && item.covers[0]),
              view_at: item.view_at,
              uri: item.uri,
              author_name: item.author_name || "",
              author_mid: item.author_mid || "",
              progress: item.progress,
              duration: item.duration,
              timestamp: Date.now(),
              uploaded: false,
            });
          }

          totalSynced += data.data.list.length;
          // 更新同步进度
          await setStorageValue(SYNC_PROGRESS_HISTORY, {
            current: totalSynced,
            message: `正在同步... 已获取 ${totalSynced} 条`,
          });
          console.log(`同步了${data.data.list.length}条历史记录，总计：${totalSynced}`);

          // 等待事务完成
          await new Promise((resolve, reject) => {
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
          });

          // 添加延时，避免请求过于频繁
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      // 更新最后同步时间
      await browser.storage.local.set({ lastSync: Date.now() });
      await setStorageValue(SYNC_PROGRESS_HISTORY, { current: totalSynced, message: "同步完成" });

      return true;
    } catch (error) {
      console.error("同步历史记录失败:", error);
      await setStorageValue(SYNC_PROGRESS_HISTORY, {
        current: 0,
        message: `同步失败: ${error instanceof Error ? error.message : "未知错误"}`,
      });
      throw error;
    }
  }

  async function syncFavorites(): Promise<void> {
    try {
      const cookies = await browser.cookies.getAll({ domain: "bilibili.com" });
      const SESSDATA = cookies.find((c) => c.name === "SESSDATA")?.value;
      if (!SESSDATA) throw new Error("未登录 B 站");

      // 1. 获取用户信息 (MID)
      const navRes = await fetch("https://api.bilibili.com/x/web-interface/nav", {
        headers: { Cookie: `SESSDATA=${SESSDATA}` },
      });
      const navData = await navRes.json();
      if (navData.code !== 0) throw new Error("获取用户信息失败");
      const mid = navData.data.mid;

      // 2. 获取收藏夹列表
      const folderRes = await fetch(
        `https://api.bilibili.com/x/v3/fav/folder/created/list-all?up_mid=${mid}`,
        { headers: { Cookie: `SESSDATA=${SESSDATA}` } },
      );
      const folderData = await folderRes.json();
      if (folderData.code !== 0) throw new Error("获取收藏夹失败");

      const folders = folderData.data.list;
      if (folders && folders.length > 0) {
        // 添加 index 字段
        const foldersWithIndex = folders.map((f: any, idx: number) => ({
          ...f,
          index: idx,
        }));
        await saveFavFolders(foldersWithIndex);
        console.log(`同步了 ${folders.length} 个收藏夹`);
      }

      // 3. 同步每个收藏夹的资源
      // 计算总数
      const totalItems = folders.reduce(
        (sum: number, folder: any) => sum + (folder.media_count || 0),
        0,
      );
      let currentSynced = 0;

      await setStorageValue(SYNC_PROGRESS_FAV, {
        current: 0,
        total: totalItems,
        message: "开始同步收藏夹...",
      });

      for (const folder of folders || []) {
        console.log(`正在同步收藏夹: ${folder.title}`);

        // 用于记录本次API返回的所有资源ID，用于后续比对删除本地已取消收藏的资源
        const onlineResourceIds = new Set<number>();

        let hasMore = true;
        let page = 1;
        while (hasMore) {
          const res = await fetch(
            `https://api.bilibili.com/x/v3/fav/resource/list?media_id=${folder.id}&pn=${page}&ps=20`,
            { headers: { Cookie: `SESSDATA=${SESSDATA}` } },
          );
          const data = await res.json();
          if (data.code !== 0) {
            console.error(`获取收藏夹 ${folder.title} 资源失败:`, data.message);
            break;
          }

          const medias = data.data.medias;
          if (medias && medias.length > 0) {
            // 收集这一页的资源ID
            medias.forEach((m: any) => onlineResourceIds.add(m.id));

            // 补全 folder_id 和 index
            const resources = medias.map((m: any, idx: number) => ({
              ...m,
              folder_id: folder.id,
              // 使用全局索引 (page-1)*20 + idx
              index: (page - 1) * 20 + idx,
              // fix some fields mapping if needed, based on interface
              // data from API matches interface mostly
              id: m.id,
              bv_id: m.bv_id || m.bvid,
            }));

            await saveFavResources(resources);

            // 更新进度
            currentSynced += resources.length;
            await setStorageValue(SYNC_PROGRESS_FAV, {
              current: currentSynced,
              total: totalItems,
              message: `正在同步: ${folder.title}`,
            });

            hasMore = data.data.has_more;
            page++;
            await new Promise((resolve) => setTimeout(resolve, 500)); // limit rate
          } else {
            hasMore = false;
          }
        }

        // 4. 清理本地存在但线上已不存在的资源 (取消收藏的)
        try {
          const localResources = await getFavResources(folder.id);
          const idsToDelete = localResources
            .filter((item) => !onlineResourceIds.has(item.id))
            .map((item) => item.id);

          if (idsToDelete.length > 0) {
            await deleteFavResources(idsToDelete);
            console.log(
              `从收藏夹 "${folder.title}" 删除了 ${idsToDelete.length} 个已取消收藏的项目`,
            );
          }
        } catch (err) {
          console.error(`清理收藏夹 "${folder.title}" 本地数据失败:`, err);
        }
      }

      await setStorageValue(SYNC_PROGRESS_FAV, {
        current: totalItems,
        total: totalItems,
        message: "收藏夹同步完成",
      });
    } catch (error) {
      console.error("同步收藏夹过程出错:", error);
      throw error;
    }
  }
});
