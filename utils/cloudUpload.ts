/**
 * 把本地尚未上传的历史记录分批上传到云端。云同步页面手动上传与后台自动上传共用。
 */
import { uploadBatchHistory } from "@/services/history";
import { getUnUploadedHistory, markHistoryAsUploaded } from "@/utils/db";

const BATCH_SIZE = 100;

/** 服务端返回这两种提示时说明额度已用完，后续批次也不会成功，直接停止 */
export const FREE_LIMIT_MESSAGE = "免费用户最多可以上传500条历史记录";
export const EXPIRED_MESSAGE = "您的会员已过期，无法上传更多记录";
export const isQuotaMessage = (message?: string) =>
  message === FREE_LIMIT_MESSAGE || message === EXPIRED_MESSAGE;

export interface CloudUploadProgress {
  totalCount: number;
  successCount: number;
  failedCount: number;
  /** 因额度不足而中止时的服务端提示 */
  stopMessage: string;
}

/**
 * @param onProgress 开始时和每批完成后回调一次，页面用来刷新进度弹窗
 */
export async function uploadPendingHistory(
  onProgress?: (progress: CloudUploadProgress) => void,
): Promise<CloudUploadProgress> {
  const pending = await getUnUploadedHistory();
  const progress: CloudUploadProgress = {
    totalCount: pending.length,
    successCount: 0,
    failedCount: 0,
    stopMessage: "",
  };
  if (pending.length === 0) return progress;
  onProgress?.({ ...progress });

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const { success, message } = (await uploadBatchHistory(batch)) as {
      success?: boolean;
      message?: string;
    };

    if (success) {
      await markHistoryAsUploaded(batch);
      progress.successCount += batch.length;
    } else if (isQuotaMessage(message)) {
      progress.failedCount = progress.totalCount - progress.successCount;
      progress.stopMessage = message!;
    } else {
      progress.failedCount += batch.length;
    }
    onProgress?.({ ...progress });
    if (progress.stopMessage) break;
  }
  return progress;
}
