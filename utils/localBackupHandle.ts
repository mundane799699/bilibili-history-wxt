const LOCAL_BACKUP_DB_NAME = "bilibiliLocalBackup";
const LOCAL_BACKUP_DB_VERSION = 1;
const LOCAL_BACKUP_HANDLE_STORE = "handles";
const HISTORY_BACKUP_DIRECTORY_KEY = "historyBackupDirectory";

const openLocalBackupDatabase = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(LOCAL_BACKUP_DB_NAME, LOCAL_BACKUP_DB_VERSION);

    request.onerror = () => reject(request.error ?? new Error("无法打开本地备份配置"));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(LOCAL_BACKUP_HANDLE_STORE)) {
        db.createObjectStore(LOCAL_BACKUP_HANDLE_STORE);
      }
    };
  });
};

const isDirectoryHandle = (value: unknown): value is FileSystemDirectoryHandle => {
  if (!value || typeof value !== "object") return false;
  const handle = value as Partial<FileSystemDirectoryHandle>;
  return handle.kind === "directory" && typeof handle.getFileHandle === "function";
};

export const saveLocalBackupDirectoryHandle = async (
  handle: FileSystemDirectoryHandle,
): Promise<void> => {
  const db = await openLocalBackupDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(LOCAL_BACKUP_HANDLE_STORE, "readwrite");
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("保存备份目录失败"));
      transaction.onabort = () => reject(transaction.error ?? new Error("保存备份目录失败"));
      transaction.objectStore(LOCAL_BACKUP_HANDLE_STORE).put(handle, HISTORY_BACKUP_DIRECTORY_KEY);
    });
  } finally {
    db.close();
  }
};

export const getLocalBackupDirectoryHandle =
  async (): Promise<FileSystemDirectoryHandle | null> => {
    const db = await openLocalBackupDatabase();
    try {
      const value = await new Promise<unknown>((resolve, reject) => {
        const transaction = db.transaction(LOCAL_BACKUP_HANDLE_STORE, "readonly");
        const request = transaction
          .objectStore(LOCAL_BACKUP_HANDLE_STORE)
          .get(HISTORY_BACKUP_DIRECTORY_KEY);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("读取备份目录失败"));
      });
      return isDirectoryHandle(value) ? value : null;
    } finally {
      db.close();
    }
  };

export const clearLocalBackupDirectoryHandle = async (): Promise<void> => {
  const db = await openLocalBackupDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(LOCAL_BACKUP_HANDLE_STORE, "readwrite");
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("清除备份目录失败"));
      transaction.onabort = () => reject(transaction.error ?? new Error("清除备份目录失败"));
      transaction.objectStore(LOCAL_BACKUP_HANDLE_STORE).delete(HISTORY_BACKUP_DIRECTORY_KEY);
    });
  } finally {
    db.close();
  }
};
