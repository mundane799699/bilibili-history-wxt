import { STORAGE_LAST_WARNING } from "./constants";
import { getStorageValue, setStorageValue } from "./storage";

const STORAGE_ERROR_NAMES = new Set(["QuotaExceededError", "AbortError", "UnknownError"]);

export interface StorageWarning {
  name: string;
  message: string;
  context: string;
  timestamp: number;
}

export interface StorageHealthReport {
  supported: boolean;
  unlimitedStorageGranted: boolean;
  storageProtected: boolean;
  persisted: boolean;
  persistenceRequested: boolean;
  usage: number;
  quota: number;
  checkedAt: number;
  errors: StorageWarning[];
  lastWarning: StorageWarning | null;
}

let persistenceRequest: Promise<boolean> | null = null;

const toStorageWarning = (error: unknown, context: string): StorageWarning => {
  const name =
    error instanceof DOMException || error instanceof Error ? error.name : "UnknownError";
  const message = error instanceof Error ? error.message : String(error);

  return {
    name,
    message,
    context,
    timestamp: Date.now(),
  };
};

export const isStorageRiskError = (error: unknown): boolean => {
  if (!(error instanceof DOMException) && !(error instanceof Error)) return false;
  return STORAGE_ERROR_NAMES.has(error.name);
};

export const recordStorageWarning = async (
  error: unknown,
  context: string,
): Promise<StorageWarning | null> => {
  if (!isStorageRiskError(error)) return null;

  const warning = toStorageWarning(error, context);
  try {
    await setStorageValue(STORAGE_LAST_WARNING, warning);
  } catch (storageError) {
    console.error("记录存储异常失败:", storageError);
  }
  return warning;
};

const requestPersistentStorage = async (storage: StorageManager): Promise<boolean> => {
  if (!persistenceRequest) {
    persistenceRequest = storage
      .persist()
      .then((granted) => {
        if (!granted) persistenceRequest = null;
        return granted;
      })
      .catch((error) => {
        persistenceRequest = null;
        throw error;
      });
  }
  return persistenceRequest;
};

export const checkStorageHealth = async (
  requestPersistence = true,
): Promise<StorageHealthReport> => {
  const errors: StorageWarning[] = [];
  const storage = navigator.storage;
  const lastWarning = await getStorageValue<StorageWarning | null>(STORAGE_LAST_WARNING, null);
  let unlimitedStorageGranted = false;

  try {
    unlimitedStorageGranted = await browser.permissions.contains({
      permissions: ["unlimitedStorage"],
    });
  } catch (error) {
    errors.push(toStorageWarning(error, "unlimited-storage-permission"));
  }

  if (!storage) {
    errors.push({
      name: "NotSupportedError",
      message: "当前浏览器不支持 Storage Manager API",
      context: "storage-health",
      timestamp: Date.now(),
    });
    return {
      supported: false,
      unlimitedStorageGranted,
      storageProtected: unlimitedStorageGranted,
      persisted: false,
      persistenceRequested: false,
      usage: 0,
      quota: 0,
      checkedAt: Date.now(),
      errors,
      lastWarning,
    };
  }

  let persisted = false;
  let persistenceRequested = false;
  let usage = 0;
  let quota = 0;

  try {
    persisted = await storage.persisted();
  } catch (error) {
    errors.push(toStorageWarning(error, "storage-persisted"));
  }

  if (requestPersistence && !persisted) {
    persistenceRequested = true;
    try {
      persisted = await requestPersistentStorage(storage);
    } catch (error) {
      errors.push(toStorageWarning(error, "storage-persist"));
    }
  }

  try {
    const estimate = await storage.estimate();
    usage = estimate.usage ?? 0;
    quota = estimate.quota ?? 0;
  } catch (error) {
    errors.push(toStorageWarning(error, "storage-estimate"));
  }

  return {
    supported: true,
    unlimitedStorageGranted,
    storageProtected: unlimitedStorageGranted || persisted,
    persisted,
    persistenceRequested,
    usage,
    quota,
    checkedAt: Date.now(),
    errors,
    lastWarning,
  };
};

export const formatStorageSize = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** unitIndex;
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};
