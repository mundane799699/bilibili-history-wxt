/**
 * 历史记录本地目录自动备份。
 */
import { isLocalHistoryBackupDue, runLocalHistoryBackup } from "@/utils/localHistoryBackup";
import type { LocalHistoryBackupRequest, LocalHistoryBackupResult } from "@/utils/types";
import type { MessageHandlerMap } from "./shared/types";
import { getErrorMessage, singleFlight } from "./shared/utils";

/** 定时任务与手动触发共用同一次执行，避免重复写文件 */
const runLocalHistoryBackupOnce = singleFlight((allowEmpty: boolean) =>
  runLocalHistoryBackup(allowEmpty),
);

export async function runScheduledLocalBackup(): Promise<void> {
  if (!(await isLocalHistoryBackupDue())) return;

  const result = await runLocalHistoryBackupOnce(false);
  if (!result.success) console.warn("本地自动备份未完成:", result.error);
}

export const localBackupMessageHandlers: MessageHandlerMap = {
  runLocalHistoryBackup: (message: LocalHistoryBackupRequest) =>
    runLocalHistoryBackupOnce(Boolean(message.allowEmpty)).catch(
      (error): LocalHistoryBackupResult => ({
        success: false,
        errorCode: "WRITE_FAILED",
        error: getErrorMessage(error, "本地备份失败"),
      }),
    ),
};
