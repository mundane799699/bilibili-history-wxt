import {
  DEFAULT_LOCAL_HISTORY_BACKUP_INTERVAL_HOURS,
  DEFAULT_LOCAL_HISTORY_BACKUP_RETENTION_COUNT,
  LOCAL_HISTORY_BACKUP_ENABLED,
  LOCAL_HISTORY_BACKUP_INTERVAL_HOURS,
  LOCAL_HISTORY_BACKUP_LAST_ATTEMPT_AT,
  LOCAL_HISTORY_BACKUP_LAST_CLEANUP_WARNING,
  LOCAL_HISTORY_BACKUP_LAST_ERROR,
  LOCAL_HISTORY_BACKUP_LAST_FILE_NAME,
  LOCAL_HISTORY_BACKUP_LAST_RECORD_COUNT,
  LOCAL_HISTORY_BACKUP_LAST_SUCCESS_AT,
  LOCAL_HISTORY_BACKUP_NEEDS_PERMISSION,
  LOCAL_HISTORY_BACKUP_RETENTION_COUNT,
} from "./constants";
import { getAllHistory } from "./db";
import { getLocalBackupDirectoryHandle } from "./localBackupHandle";
import { getStorageValue, setStorageValues } from "./storage";
import { LocalHistoryBackupErrorCode, LocalHistoryBackupResult } from "./types";

const AUTO_BACKUP_FILE_PATTERN = /^bilibili-history-\d{4}-\d{2}-\d{2}-\d{6}\.json$/;

const toErrorMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : "未知错误";
};

const updateFailureState = async (
  errorCode: LocalHistoryBackupErrorCode,
  error: string,
  needsPermission = false,
): Promise<LocalHistoryBackupResult> => {
  await setStorageValues({
    [LOCAL_HISTORY_BACKUP_LAST_ERROR]: error,
    [LOCAL_HISTORY_BACKUP_NEEDS_PERMISSION]: needsPermission,
  });
  return { success: false, errorCode, error };
};

const pad = (value: number, length = 2): string => String(value).padStart(length, "0");

const formatBackupTimestamp = (date: Date): string => {
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`,
  ].join("-");
};

const fileExists = async (
  directoryHandle: FileSystemDirectoryHandle,
  fileName: string,
): Promise<boolean> => {
  try {
    await directoryHandle.getFileHandle(fileName);
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") return false;
    throw error;
  }
};

const createUniqueBackupFileName = async (
  directoryHandle: FileSystemDirectoryHandle,
): Promise<string> => {
  const baseTime = Date.now();
  for (let offsetSeconds = 0; offsetSeconds < 120; offsetSeconds += 1) {
    const fileName = `bilibili-history-${formatBackupTimestamp(
      new Date(baseTime + offsetSeconds * 1000),
    )}.json`;
    if (!(await fileExists(directoryHandle, fileName))) return fileName;
  }
  throw new Error("短时间内生成的备份文件过多，请稍后再试");
};

const cleanupOldBackups = async (
  directoryHandle: FileSystemDirectoryHandle,
  retentionCount: number,
): Promise<void> => {
  const backupFiles: string[] = [];
  for await (const [name, handle] of directoryHandle.entries()) {
    if (handle.kind === "file" && AUTO_BACKUP_FILE_PATTERN.test(name)) {
      backupFiles.push(name);
    }
  }

  backupFiles.sort((left, right) => right.localeCompare(left));
  const normalizedRetention = Math.min(100, Math.max(1, Math.floor(retentionCount)));
  for (const fileName of backupFiles.slice(normalizedRetention)) {
    await directoryHandle.removeEntry(fileName);
  }
};

export const isLocalDirectoryBackupSupported = (): boolean => {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
};

export const buildHistoryBackupJson = async (): Promise<{
  json: string;
  recordCount: number;
}> => {
  const history = await getAllHistory();
  return {
    json: JSON.stringify(history, null, 2),
    recordCount: history.length,
  };
};

export const validateLocalBackupDirectory = async (
  directoryHandle: FileSystemDirectoryHandle,
): Promise<void> => {
  const permission = await directoryHandle.queryPermission({ mode: "readwrite" });
  if (permission !== "granted") {
    throw new Error("没有获得目录读写权限");
  }

  const testFileName = `bilibili-history-backup-access-test-${Date.now()}.tmp`;
  const fileHandle = await directoryHandle.getFileHandle(testFileName, { create: true });
  const writable = await fileHandle.createWritable();
  try {
    await writable.write("Bilibili history backup access test");
    await writable.close();
  } catch (error) {
    try {
      await writable.abort();
    } catch {
      // 保留原始写入错误。
    }
    throw error;
  }

  try {
    await directoryHandle.removeEntry(testFileName);
  } catch (error) {
    throw new Error(`目录可写，但无法删除测试文件：${toErrorMessage(error)}`);
  }
};

export const isLocalHistoryBackupDue = async (): Promise<boolean> => {
  const enabled = await getStorageValue(LOCAL_HISTORY_BACKUP_ENABLED, false);
  if (!enabled) return false;

  const lastSuccessAt = await getStorageValue<number>(LOCAL_HISTORY_BACKUP_LAST_SUCCESS_AT, 0);
  const intervalHours = await getStorageValue<number>(
    LOCAL_HISTORY_BACKUP_INTERVAL_HOURS,
    DEFAULT_LOCAL_HISTORY_BACKUP_INTERVAL_HOURS,
  );
  const intervalMs = Math.max(1 / 60, intervalHours) * 60 * 60 * 1000;
  return lastSuccessAt === 0 || Date.now() - lastSuccessAt >= intervalMs;
};

export const runLocalHistoryBackup = async (
  allowEmpty = false,
): Promise<LocalHistoryBackupResult> => {
  await setStorageValues({ [LOCAL_HISTORY_BACKUP_LAST_ATTEMPT_AT]: Date.now() });

  let directoryHandle: FileSystemDirectoryHandle | null;
  try {
    directoryHandle = await getLocalBackupDirectoryHandle();
  } catch (error) {
    return updateFailureState("NO_DIRECTORY", `读取备份目录失败：${toErrorMessage(error)}`);
  }
  if (!directoryHandle) {
    return updateFailureState("NO_DIRECTORY", "尚未选择备份目录");
  }

  let permission: PermissionState;
  try {
    permission = await directoryHandle.queryPermission({ mode: "readwrite" });
  } catch (error) {
    return updateFailureState(
      "PERMISSION_REQUIRED",
      `无法检查备份目录权限：${toErrorMessage(error)}`,
      true,
    );
  }
  if (permission !== "granted") {
    return updateFailureState("PERMISSION_REQUIRED", "备份目录需要重新授权", true);
  }

  let backupData: Awaited<ReturnType<typeof buildHistoryBackupJson>>;
  try {
    backupData = await buildHistoryBackupJson();
  } catch (error) {
    return updateFailureState("READ_FAILED", `读取历史记录失败：${toErrorMessage(error)}`);
  }

  const previousRecordCount = await getStorageValue<number>(
    LOCAL_HISTORY_BACKUP_LAST_RECORD_COUNT,
    0,
  );
  const emptyHistoryAnomaly = previousRecordCount > 0 && backupData.recordCount === 0;
  if (!allowEmpty && emptyHistoryAnomaly) {
    return updateFailureState(
      "EMPTY_HISTORY_ANOMALY",
      "当前历史记录变为 0 条，为保护旧备份已停止自动写入",
    );
  }

  let fileName: string;
  try {
    fileName = await createUniqueBackupFileName(directoryHandle);
    const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    try {
      await writable.write(backupData.json);
      await writable.close();
    } catch (error) {
      try {
        await writable.abort();
      } catch {
        // 保留原始写入错误。
      }
      throw error;
    }
  } catch (error) {
    return updateFailureState("WRITE_FAILED", `写入备份文件失败：${toErrorMessage(error)}`);
  }

  const completedAt = Date.now();
  const retentionCount = await getStorageValue<number>(
    LOCAL_HISTORY_BACKUP_RETENTION_COUNT,
    DEFAULT_LOCAL_HISTORY_BACKUP_RETENTION_COUNT,
  );
  let cleanupWarning = "";
  if (emptyHistoryAnomaly) {
    cleanupWarning = "本次生成了空备份，为保护已有数据已跳过旧文件清理";
  } else {
    try {
      await cleanupOldBackups(directoryHandle, retentionCount);
    } catch (error) {
      cleanupWarning = `旧备份清理失败：${toErrorMessage(error)}`;
    }
  }

  await setStorageValues({
    [LOCAL_HISTORY_BACKUP_LAST_SUCCESS_AT]: completedAt,
    [LOCAL_HISTORY_BACKUP_LAST_FILE_NAME]: fileName,
    [LOCAL_HISTORY_BACKUP_LAST_RECORD_COUNT]: backupData.recordCount,
    [LOCAL_HISTORY_BACKUP_LAST_ERROR]: "",
    [LOCAL_HISTORY_BACKUP_LAST_CLEANUP_WARNING]: cleanupWarning,
    [LOCAL_HISTORY_BACKUP_NEEDS_PERMISSION]: false,
  });

  return {
    success: true,
    fileName,
    recordCount: backupData.recordCount,
    completedAt,
    cleanupWarning: cleanupWarning || undefined,
  };
};
