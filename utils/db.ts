import { DBConfig, HistoryItem, LikedMusic } from "./types";
import dayjs from "dayjs";

const DB_CONFIG: DBConfig = {
  name: "bilibiliHistory",
  version: 4,
  stores: {
    history: {
      keyPath: "id",
      indexes: ["view_at"],
    },
    likedMusic: {
      keyPath: "bvid",
      indexes: ["added_at"],
    },
    favFolders: {
      keyPath: "id",
      indexes: ["mid"],
    },
    favResources: {
      keyPath: "id",
      indexes: ["folder_id", "fav_time"],
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
        const historyStore = db.createObjectStore("history", { keyPath: "id" });
        historyStore.createIndex("view_at", "view_at", { unique: false });

        const likedMusicStore = db.createObjectStore("likedMusic", {
          keyPath: "bvid",
        });
        likedMusicStore.createIndex("added_at", "added_at", { unique: false });

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
      } else if (oldVersion <= 2 && newVersion >= 3) {
        // 从版本2及以下升级到版本3及以上：创建likedMusic表（使用bvid作为主键）
        console.log("创建likedMusic表");

        const likedMusicStore = db.createObjectStore("likedMusic", {
          keyPath: "bvid",
        });
        likedMusicStore.createIndex("added_at", "added_at", { unique: false });

        console.log("likedMusic表创建完成");
      }

      if (oldVersion < 4 && newVersion >= 4) {
        console.log("创建收藏夹相关表");

        const favFoldersStore = db.createObjectStore("favFolders", {
          keyPath: "id",
        });
        favFoldersStore.createIndex("mid", "mid", { unique: false });

        const favResourcesStore = db.createObjectStore("favResources", {
          keyPath: "id",
        });
        favResourcesStore.createIndex("folder_id", "folder_id", { unique: false });
        favResourcesStore.createIndex("fav_time", "fav_time", { unique: false });

        console.log("收藏夹相关表创建完成");
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
  dateRange: { start: string; end: string } | null,
  businessType: string,
  searchType: "all" | "title" | "up" | "bvid" | "avid" = "all"
) => {
  return (
    matchKeyword(item, keyword, searchType) &&
    matchDate(item, dateRange) &&
    matchBusinessType(item, businessType)
  );
};

const matchBusinessType = (item: HistoryItem, businessType: string) => {
  if (!businessType || businessType === "all") return true;
  // 专栏有两种类型：article 和 article-list，这里统一处理
  if (businessType === "article") {
    return item.business === "article" || item.business === "article-list";
  }
  return item.business === businessType;
};

const matchDate = (
  item: HistoryItem,
  dateRange: { start: string; end: string } | null
) => {
  if (!dateRange || !dateRange.start) {
    return true;
  }
  const ts = Number(item.view_at);
  const d = dayjs(ts * 1000);
  const dateStr = d.format("YYYY-MM-DD");

  if (dateRange.start && !dateRange.end) {
    return dateStr === dateRange.start;
  }
  if (dateRange.start && dateRange.end) {
    return dateStr >= dateRange.start && dateStr <= dateRange.end;
  }
  return true;
};

const matchKeyword = (item: HistoryItem, keyword: string, searchType: "all" | "title" | "up" | "bvid" | "avid" = "all") => {
  if (!keyword) return true;
  const lowerKeyword = keyword.toLowerCase();

  switch (searchType) {
    case "title":
      return item.title.toLowerCase().includes(lowerKeyword);
    case "up":
      return (
        item.author_name.toLowerCase().includes(lowerKeyword) ||
        (item.author_mid && String(item.author_mid).toLowerCase().includes(lowerKeyword))
      );
    case "bvid":
      return item.bvid && item.bvid.toLowerCase().includes(lowerKeyword);
    case "avid":
      return item.id && String(item.id).includes(lowerKeyword);
    case "all":
    default:
      return (
        item.title.toLowerCase().includes(lowerKeyword) ||
        item.author_name.toLowerCase().includes(lowerKeyword) ||
        (item.bvid && item.bvid.toLowerCase().includes(lowerKeyword)) ||
        (item.author_mid && String(item.author_mid).toLowerCase().includes(lowerKeyword)) ||
        (item.id && String(item.id).includes(lowerKeyword))
      );
  }
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
  dateRange: { start: string; end: string } | null = null,
  businessType: string = "",
  searchType: "all" | "title" | "up" | "bvid" | "avid" = "all"
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
          if (matchCondition(value, keyword, dateRange, businessType, searchType)) {
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

// 喜欢音乐相关函数
export const saveLikedMusic = async (music: LikedMusic): Promise<void> => {
  const db = await openDB();
  const tx = db.transaction("likedMusic", "readwrite");
  const store = tx.objectStore("likedMusic");

  return new Promise((resolve, reject) => {
    const request = store.put(music);

    request.onsuccess = () => {
      console.log("喜欢的音乐已保存:", music.title);
      resolve();
    };

    request.onerror = () => {
      console.error("保存喜欢的音乐失败:", request.error);
      reject(request.error);
    };
  });
};

export const isLikedMusic = async (bvid: string): Promise<boolean> => {
  const db = await openDB();
  const tx = db.transaction("likedMusic", "readonly");
  const store = tx.objectStore("likedMusic");

  return new Promise((resolve, reject) => {
    const request = store.get(bvid);

    request.onsuccess = () => {
      resolve(!!request.result);
    };

    request.onerror = () => {
      console.error("检查音乐是否已喜欢失败:", request.error);
      reject(request.error);
    };
  });
};

export const getLikedMusic = async (
  lastAddedTime: number = Date.now(),
  pageSize: number = 20,
  keyword: string = ""
): Promise<{ items: LikedMusic[]; hasMore: boolean }> => {
  const db = await openDB();
  const tx = db.transaction("likedMusic", "readonly");
  const store = tx.objectStore("likedMusic");
  const index = store.index("added_at");

  const range = IDBKeyRange.upperBound(lastAddedTime, true);
  const request = index.openCursor(range, "prev");
  const items: LikedMusic[] = [];
  let hasMore = false;

  return new Promise((resolve, reject) => {
    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result as IDBCursorWithValue;

      if (cursor) {
        const value = cursor.value as LikedMusic;

        if (items.length < pageSize) {
          if (
            !keyword ||
            value.title.toLowerCase().includes(keyword.toLowerCase()) ||
            value.author.toLowerCase().includes(keyword.toLowerCase())
          ) {
            items.push(value);
          }
          cursor.continue();
        } else {
          hasMore = true;
          resolve({ items, hasMore });
        }
      } else {
        resolve({ items, hasMore });
      }
    };

    request.onerror = () => {
      console.error("获取喜欢音乐失败:", request.error);
      reject(request.error);
    };
  });
};

export const getAllLikedMusic = async (): Promise<LikedMusic[]> => {
  const db = await openDB();
  const tx = db.transaction("likedMusic", "readonly");
  const store = tx.objectStore("likedMusic");
  const index = store.index("added_at");

  return new Promise((resolve, reject) => {
    const request = index.openCursor(null, "prev");
    const items: LikedMusic[] = [];

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result as IDBCursorWithValue;

      if (cursor) {
        items.push(cursor.value as LikedMusic);
        cursor.continue();
      } else {
        resolve(items);
      }
    };

    request.onerror = () => {
      console.error("获取所有喜欢音乐失败:", request.error);
      reject(request.error);
    };
  });
};

export const getTotalLikedMusicCount = async (): Promise<number> => {
  const db = await openDB();
  const tx = db.transaction("likedMusic", "readonly");
  const store = tx.objectStore("likedMusic");

  return new Promise<number>((resolve, reject) => {
    const request = store.count();

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      console.error("获取喜欢音乐总数失败:", request.error);
      reject(request.error);
    };
  });
};

export const deleteLikedMusic = async (bvid: string): Promise<void> => {
  const db = await openDB();
  const tx = db.transaction("likedMusic", "readwrite");
  const store = tx.objectStore("likedMusic");

  return new Promise<void>((resolve, reject) => {
    const request = store.delete(bvid);

    request.onsuccess = () => {
      console.log("喜欢的音乐删除成功, bvid =", bvid);
      resolve();
    };

    request.onerror = () => {
      console.error("删除喜欢的音乐失败, bvid =", bvid, request.error);
      reject(request.error);
    };
  });
};

// deleteLikedMusicByBvid 现在与 deleteLikedMusic 功能相同，保留为别名
export const deleteLikedMusicByBvid = deleteLikedMusic;

export const clearLikedMusic = async (): Promise<void> => {
  const db = await openDB();
  const tx = db.transaction("likedMusic", "readwrite");
  const store = tx.objectStore("likedMusic");

  return new Promise<void>((resolve, reject) => {
    const request = store.clear();

    request.onsuccess = () => {
      console.log("喜欢的音乐已全部清空");
      resolve();
    };

    request.onerror = () => {
      console.error("清空喜欢的音乐失败:", request.error);
      reject(request.error);
    };
  });
};

export const importLikedMusic = async (musicList: LikedMusic[]): Promise<void> => {
  const db = await openDB();
  const tx = db.transaction("likedMusic", "readwrite");
  const store = tx.objectStore("likedMusic");

  return new Promise((resolve, reject) => {
    let operationsCompleted = 0;
    let operationsFailed = false;

    if (musicList.length === 0) {
      resolve();
      return;
    }

    musicList.forEach((music) => {
      if (operationsFailed) return;

      const request = store.put(music);
      request.onsuccess = () => {
        operationsCompleted++;
      };
      request.onerror = () => {
        if (!operationsFailed) {
          operationsFailed = true;
          console.error(
            "向 IndexedDB 中 put 喜欢音乐项目失败:",
            request.error,
            "项目:",
            music
          );
        }
      };
    });

    tx.oncomplete = () => {
      if (!operationsFailed) {
        console.log("所有喜欢音乐已成功导入。");
        resolve();
      } else {
        reject(new Error("部分或全部喜欢音乐项目导入失败，但事务意外完成。"));
      }
    };

    tx.onerror = () => {
      console.error("导入喜欢音乐事务失败:", tx.error);
      reject(tx.error);
    };
  });
};

import { FavoriteFolder, FavoriteResource } from "./types";

// 收藏夹相关函数
export const saveFavFolders = async (folders: FavoriteFolder[]): Promise<void> => {
  const db = await openDB();
  const tx = db.transaction("favFolders", "readwrite");
  const store = tx.objectStore("favFolders");

  return new Promise((resolve, reject) => {
    let operationsCompleted = 0;
    let operationsFailed = false;

    if (folders.length === 0) {
      resolve();
      return;
    }

    folders.forEach((folder) => {
      if (operationsFailed) return;
      const request = store.put(folder);
      request.onsuccess = () => operationsCompleted++;
      request.onerror = () => {
        if (!operationsFailed) {
          operationsFailed = true;
          reject(request.error);
        }
      };
    });

    tx.oncomplete = () => {
      if (!operationsFailed) resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
};

export const getFavFolders = async (mid?: number): Promise<FavoriteFolder[]> => {
  const db = await openDB();
  const tx = db.transaction("favFolders", "readonly");
  const store = tx.objectStore("favFolders");

  return new Promise((resolve, reject) => {
    let request;
    if (mid) {
      const index = store.index("mid");
      request = index.getAll(mid);
    } else {
      request = store.getAll();
    }
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const saveFavResources = async (resources: FavoriteResource[]): Promise<void> => {
  const db = await openDB();
  const tx = db.transaction("favResources", "readwrite");
  const store = tx.objectStore("favResources");

  return new Promise((resolve, reject) => {
    let operationsCompleted = 0;
    let operationsFailed = false;

    if (resources.length === 0) {
      resolve();
      return;
    }

    // 递归处理每一个资源，因为我们需要在put之前可能进行get操作（异步）
    // 虽然可以在事务中并行发起请求，但为了逻辑清晰，我们使用 Promise.all 或者计数器

    // 这里我们直接发起所有请求，利用IndexedDB的事务特性
    resources.forEach((res) => {
      if (operationsFailed) return;

      // 检查是否是失效视频
      if (res.title === "已失效视频") {
        const getReq = store.get(res.id);
        getReq.onsuccess = () => {
          const oldData = getReq.result as FavoriteResource;
          let dataToSave = res;

          // 如果本地有旧数据，且旧数据是有效的（标题不是已失效视频）
          // 那么保留旧数据的关键元数据
          if (oldData && oldData.title !== "已失效视频") {
            dataToSave = {
              ...res,
              title: oldData.title,
              cover: oldData.cover,
              intro: oldData.intro,
              upper: oldData.upper,
              ctime: oldData.ctime, // 保持创建时间
              // 可以根据需要保留更多字段
            };
            console.log(`[失效保护] 保留了视频 ${oldData.id} 的元数据: ${oldData.title}`);
          }

          const putReq = store.put(dataToSave);
          putReq.onsuccess = () => CheckComplete();
          putReq.onerror = HandleError;
        };
        getReq.onerror = HandleError;
      } else {
        // 正常视频直接保存
        const putReq = store.put(res);
        putReq.onsuccess = () => CheckComplete();
        putReq.onerror = HandleError;
      }

      function HandleError(e: Event) {
        if (!operationsFailed) {
          operationsFailed = true;
          reject((e.target as IDBRequest).error);
        }
      }

      function CheckComplete() {
        operationsCompleted++;
        if (operationsCompleted === resources.length && !operationsFailed) {
          // 此时不能resolve，因为外层还有tx.oncomplete
        }
      }
    });

    tx.oncomplete = () => {
      if (!operationsFailed) resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
};

export const getFavResources = async (folderId?: number): Promise<FavoriteResource[]> => {
  const db = await openDB();
  const tx = db.transaction("favResources", "readonly");
  const store = tx.objectStore("favResources");

  return new Promise((resolve, reject) => {
    let request;
    if (folderId) {
      const index = store.index("folder_id");
      request = index.getAll(folderId);
    } else {
      request = store.getAll();
    }
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};


export const deleteFavResources = async (ids: number[]): Promise<void> => {
  const db = await openDB();
  const tx = db.transaction("favResources", "readwrite");
  const store = tx.objectStore("favResources");

  return new Promise((resolve, reject) => {
    let operationsCompleted = 0;
    let operationsFailed = false;

    if (ids.length === 0) {
      resolve();
      return;
    }

    ids.forEach((id) => {
      if (operationsFailed) return;
      const request = store.delete(id);
      request.onsuccess = () => operationsCompleted++;
      request.onerror = () => {
        if (!operationsFailed) {
          operationsFailed = true;
          reject(request.error);
        }
      };
    });

    tx.oncomplete = () => {
      if (!operationsFailed) resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
};
