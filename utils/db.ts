import { DBConfig, HistoryItem } from "./types";
import dayjs from "dayjs";

const DB_CONFIG: DBConfig = {
  name: "bilibiliHistory",
  version: 2,
  stores: {
    history: {
      keyPath: "id",
      indexes: ["view_at"],
    },
  },
};

export const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_CONFIG.name, DB_CONFIG.version);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = async (event) => {
      console.log("onupgradeneeded");
      const db = (event.target as IDBOpenDBRequest).result;
      const transaction = (event.target as IDBOpenDBRequest).transaction!;
      const oldVersion = event.oldVersion;
      const newVersion = event.newVersion || DB_CONFIG.version;

      console.log(`数据库升级: ${oldVersion} -> ${newVersion}`);

      // 首次创建数据库 (oldVersion === 0)
      if (oldVersion === 0) {
        const store = db.createObjectStore("history", { keyPath: "id" });
        store.createIndex("view_at", "view_at", { unique: false });
        console.log("首次创建数据库和索引");
      } else if (oldVersion === 1 && newVersion >= 2) {
        // 从版本1升级到版本2：重命名viewTime字段为view_at
        console.log("开始迁移数据：viewTime -> view_at");

        // 获取现有的对象存储
        const store = transaction.objectStore("history");

        // 删除旧的viewTime索引
        if (store.indexNames.contains("viewTime")) {
          store.deleteIndex("viewTime");
          console.log("删除旧的viewTime索引");
        }

        // 创建新的view_at索引
        store.createIndex("view_at", "view_at", { unique: false });
        console.log("创建新的view_at索引");

        // 迁移数据：将viewTime字段重命名为view_at
        const getAllRequest = store.getAll();
        getAllRequest.onsuccess = () => {
          const allRecords = getAllRequest.result;
          console.log(`开始迁移 ${allRecords.length} 条记录`);

          allRecords.forEach((record: any) => {
            if (record.viewTime !== undefined) {
              // 将viewTime重命名为view_at
              record.view_at = record.viewTime;
              delete record.viewTime;

              // 更新记录
              store.put(record);
            }
          });

          console.log("数据迁移完成");
        };

        getAllRequest.onerror = () => {
          console.error("数据迁移失败:", getAllRequest.error);
        };
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
  const ts = Number(item.view_at);
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

export const getTotalHistoryCount = async (): Promise<number> => {
  const db = await openDB();
  const tx = db.transaction("history", "readonly");
  const store = tx.objectStore("history");

  return new Promise<number>((resolve, reject) => {
    const request = store.count();

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      console.error("获取历史记录总数失败:", request.error);
      reject(request.error);
    };
  });
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
  const index = store.index("view_at");

  let range = null;
  if (lastViewTime) {
    range = IDBKeyRange.upperBound(lastViewTime, true);
  }

  // 使用游标按view_at降序获取指定页的数据
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

export const deleteHistoryItem = async (id: number): Promise<void> => {
  const db = await openDB();
  const tx = db.transaction("history", "readwrite");
  const store = tx.objectStore("history");

  return new Promise<void>((resolve, reject) => {
    const request = store.delete(id);

    request.onsuccess = () => {
      console.log("历史记录删除成功, id =", id);
      resolve();
    };

    request.onerror = () => {
      console.error("删除历史记录失败, id =", id, request.error);
      reject(request.error);
    };
  });
};

export const getAllHistory = async (): Promise<HistoryItem[]> => {
  const db = await openDB();
  const tx = db.transaction("history", "readonly");
  const store = tx.objectStore("history");
  const index = store.index("view_at");

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

export const getUnUploadedHistory = async (): Promise<HistoryItem[]> => {
  const db = await openDB();
  const tx = db.transaction("history", "readonly");
  const store = tx.objectStore("history");
  const index = store.index("view_at");

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

export const markAllHistoryAsUnuploaded = async (): Promise<void> => {
  const db = await openDB();
  const tx = db.transaction("history", "readwrite");
  const store = tx.objectStore("history");

  return new Promise<void>((resolve, reject) => {
    const request = store.openCursor();
    let updatedCount = 0;

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result as IDBCursorWithValue;

      if (cursor) {
        const item = cursor.value as HistoryItem;
        // 只有在尚未标记为未上传时才更新
        if (item.uploaded !== false) {
          const updatedItem = { ...item, uploaded: false };
          const updateRequest = cursor.update(updatedItem);
          updateRequest.onsuccess = () => {
            updatedCount++;
          };
        }
        cursor.continue();
      } else {
        // 游标完成，事务将自动完成。
      }
    };

    request.onerror = () => {
      console.error("在标记所有历史记录为未上传时发生错误:", request.error);
      reject(request.error);
    };

    tx.oncomplete = () => {
      console.log(`成功将 ${updatedCount} 条历史记录标记为未上传。`);
      resolve();
    };

    tx.onerror = () => {
      console.error("标记所有历史记录为未上传的事务失败:", tx.error);
      reject(tx.error);
    };
  });
};
