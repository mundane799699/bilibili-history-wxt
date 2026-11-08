/**
 * 云同步自动上传：有效会员且开启了"自动上传"时，每小时把新的历史记录上传到云端。
 */
import { getMembershipStatus, isMembershipValid } from "@/services/membership";
import { uploadPendingHistory } from "@/utils/cloudUpload";
import {
  CLOUD_AUTO_UPLOAD_ENABLED,
  CLOUD_AUTO_UPLOAD_INTERVAL_MINUTES,
  CLOUD_AUTO_UPLOAD_LAST_CHECK,
} from "@/utils/constants";
import { getStorageValue, setStorageValue } from "@/utils/storage";
import { getMsUntilDue, singleFlight } from "./shared/utils";

async function autoUploadToCloud(): Promise<void> {
  // 先记录检查时间：无论是否会员、上传是否成功，都等一小时后再检查，避免每分钟请求会员接口
  await setStorageValue(CLOUD_AUTO_UPLOAD_LAST_CHECK, Date.now());

  const membership = await getMembershipStatus();
  if (!isMembershipValid(membership)) {
    console.log("云端自动上传：未登录或不是有效会员，跳过");
    return;
  }

  const { totalCount, successCount, failedCount, stopMessage } = await uploadPendingHistory();
  if (totalCount === 0) {
    console.log("云端自动上传：没有需要上传的记录");
    return;
  }
  console.log(
    `云端自动上传完成：共 ${totalCount} 条，成功 ${successCount} 条，失败 ${failedCount} 条`,
    stopMessage,
  );
}

const runAutoUploadOnce = singleFlight(autoUploadToCloud);

/** 定时任务：开关打开（默认打开）且距上次检查满一小时才执行 */
export async function runScheduledCloudUpload(): Promise<void> {
  const enabled = await getStorageValue(CLOUD_AUTO_UPLOAD_ENABLED, true);
  if (!enabled) return;

  const msUntilDue = await getMsUntilDue(
    CLOUD_AUTO_UPLOAD_LAST_CHECK,
    CLOUD_AUTO_UPLOAD_INTERVAL_MINUTES,
  );
  if (msUntilDue > 0) return;

  await runAutoUploadOnce();
}
