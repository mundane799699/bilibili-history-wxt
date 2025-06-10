import { DBConfig, HistoryItem } from "./types";
import dayjs from "dayjs";

const DB_CONFIG: DBConfig = {
  name: "bilibiliHistory",
  version: 1,
  stores: {
    history: {
      keyPath: "id",
      indexes: ["viewTime"],
    },
  },
};

export const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_CONFIG.name, DB_CONFIG.version);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      // onupgradeneeded会在首次创建数据库或者升级时触发
      console.log("onupgradeneeded");
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains("history")) {
        const store = db.createObjectStore("history", { keyPath: "id" });
        // 创建viewTime索引
        store.createIndex("viewTime", "viewTime", { unique: false });
      }
    };
  });
};

export const saveHistory = async (history: HistoryItem[]): Promise<void> => {
  const db = await openDB();
  const tx = db.transaction("history", "readwrite");
  const store = tx.objectStore("history");

  return new Promise((resolve, reject) => {
    let operationsCompleted = 0;
    let operationsFailed = false;

    if (history.length === 0) {
      resolve();
      return;
    }

    history.forEach((item) => {
      if (operationsFailed) return;

      const request = store.put(item);
      request.onsuccess = () => {
        operationsCompleted++;
      };
      request.onerror = () => {
        if (!operationsFailed) {
          operationsFailed = true;
          console.error(
            "向 IndexedDB 中 put 项目失败:",
            request.error,
            "项目:",
            item
          );
        }
      };
    });

    tx.oncomplete = () => {
      if (!operationsFailed) {
        console.log("所有历史记录已成功保存/更新。");
        resolve();
      } else {
        reject(new Error("部分或全部历史记录项保存失败，但事务意外完成。"));
      }
    };

    tx.onerror = () => {
      console.error("保存/更新历史记录事务失败:", tx.error);
      reject(tx.error);
    };
  });
};

const matchCondition = (
  item: HistoryItem,
  keyword: string,
  authorKeyword: string,
  date: string
) => {
  return (
    matchKeyword(item, keyword) &&
    matchAuthorKeyword(item, authorKeyword) &&
    matchDate(item, date)
  );
};

const matchDate = (item: HistoryItem, date: string) => {
  if (!date) {
    return true;
  }
  const ts = Number(item.viewTime);
  const d = dayjs(ts * 1000);
  const dateStr = d.format("YYYY-MM-DD");
  return dateStr === date;
};

const matchKeyword = (item: HistoryItem, keyword: string) => {
  return !keyword || item.title.toLowerCase().includes(keyword.toLowerCase());
};

const matchAuthorKeyword = (item: HistoryItem, authorKeyword: string) => {
  return (
    !authorKeyword ||
    item.author_name.toLowerCase().includes(authorKeyword.toLowerCase())
  );
};

export const getHistory = async (
  lastViewTime: any = "",
  pageSize: number = 20,
  keyword: string = "",
  authorKeyword: string = "",
  date: string = ""
): Promise<{ items: HistoryItem[]; hasMore: boolean }> => {
  const db = await openDB();
  const tx = db.transaction("history", "readonly");
  const store = tx.objectStore("history");
  const index = store.index("viewTime");

  let range = null;
  if (lastViewTime) {
    range = IDBKeyRange.upperBound(lastViewTime, true);
  }

  // 使用游标按viewTime降序获取指定页的数据
  const request = index.openCursor(range, "prev");
  const items: HistoryItem[] = [];
  let hasMore = false;

  return new Promise((resolve, reject) => {
    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result as IDBCursorWithValue;

      if (cursor) {
        const value = cursor.value as HistoryItem;

        // 如果还没收集够数据，继续收集
        if (items.length < pageSize) {
          if (matchCondition(value, keyword, authorKeyword, date)) {
            items.push(value);
          }
          cursor.continue();
        } else {
          // 已经收集够数据，检查是否还有更多
          hasMore = true;
          resolve({
            items,
            hasMore,
          });
        }
      } else {
        // 没有更多数据了
        resolve({
          items,
          hasMore,
        });
      }
    };

    request.onerror = () => reject(request.error);
  });
};

export const deleteDB = () => {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_CONFIG.name);
    request.onsuccess = () => {
      console.log("数据库删除成功");
      resolve();
    };
    request.onerror = () => {
      console.error("数据库删除失败:", request.error);
      reject(request.error);
    };
  });
};

export const getItem = async (
  store: IDBObjectStore,
  key: string
): Promise<any> => {
  return new Promise((resolve) => {
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result);
  });
};

export const clearHistory = async (): Promise<void> => {
  const db = await openDB();
  const tx = db.transaction("history", "readwrite");
  const store = tx.objectStore("history");

  return new Promise<void>((resolve, reject) => {
    const request = store.clear();

    request.onsuccess = () => {
      console.log("历史记录已清空");
      resolve();
    };

    request.onerror = () => {
      console.error("清空历史记录失败:", request.error);
      reject(request.error);
    };
  });
};

export const deleteHistoryItem = async (id: string): Promise<void> => {
  const db = await openDB();
  const tx = db.transaction("history", "readwrite");
  const store = tx.objectStore("history");

  return new Promise<void>((resolve, reject) => {
    const request = store.delete(id);

    request.onsuccess = () => {
      console.log("历史记录删除成功");
      resolve();
    };

    request.onerror = () => {
      console.error("删除历史记录失败:", request.error);
      reject(request.error);
    };
  });
};

export const getAllHistory = async (): Promise<HistoryItem[]> => {
  const db = await openDB();
  const tx = db.transaction("history", "readonly");
  const store = tx.objectStore("history");
  const index = store.index("viewTime");

  return new Promise((resolve, reject) => {
    const request = index.openCursor(null, "prev");
    const items: HistoryItem[] = [];

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result as IDBCursorWithValue;

      if (cursor) {
        items.push(cursor.value as HistoryItem);
        cursor.continue();
      } else {
        resolve(items);
      }
    };

    request.onerror = () => reject(request.error);
  });
};

export const getUnuploadedHistory = async (): Promise<HistoryItem[]> => {
  const db = await openDB();
  const tx = db.transaction("history", "readonly");
  const store = tx.objectStore("history");
  const index = store.index("viewTime");

  return new Promise((resolve, reject) => {
    const request = index.openCursor(null, "prev");
    const items: HistoryItem[] = [];

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result as IDBCursorWithValue;

      if (cursor) {
        const item = cursor.value as HistoryItem;
        // 获取uploaded不为true的数据（包括undefined和false）
        if (item.uploaded !== true) {
          items.push(item);
        }
        cursor.continue();
      } else {
        resolve(items);
      }
    };

    request.onerror = () => reject(request.error);
  });
};

export const markHistoryAsUploaded = async (
  historyItems: HistoryItem[]
): Promise<void> => {
  const db = await openDB();
  const tx = db.transaction("history", "readwrite");
  const store = tx.objectStore("history");

  return new Promise((resolve, reject) => {
    let operationsCompleted = 0;
    let operationsFailed = false;

    if (historyItems.length === 0) {
      resolve();
      return;
    }

    historyItems.forEach((item) => {
      if (operationsFailed) return;

      // 更新item的uploaded字段
      const updatedItem = { ...item, uploaded: true };
      const request = store.put(updatedItem);

      request.onsuccess = () => {
        operationsCompleted++;
      };

      request.onerror = () => {
        if (!operationsFailed) {
          operationsFailed = true;
          console.error(
            "更新 IndexedDB 中项目的uploaded状态失败:",
            request.error,
            "项目:",
            item
          );
        }
      };
    });

    tx.oncomplete = () => {
      if (!operationsFailed) {
        console.log(`成功标记 ${historyItems.length} 条历史记录为已上传。`);
        resolve();
      } else {
        reject(new Error("部分或全部历史记录项更新失败，但事务意外完成。"));
      }
    };

    tx.onerror = () => {
      console.error("更新历史记录uploaded状态事务失败:", tx.error);
      reject(tx.error);
    };
  });
};
