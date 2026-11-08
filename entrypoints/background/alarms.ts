/**
 * 定时任务。所有 alarm 都是每分钟触发一次，由各任务自己判断"距上次执行是否已到间隔"，
 * 这样用户修改间隔后无需重建 alarm。
 */
import { LOCAL_HISTORY_BACKUP_ALARM } from "@/utils/constants";
import { runScheduledCloudUpload } from "./cloudAutoUpload";
import { runScheduledHistorySync } from "./history";
import { runScheduledLocalBackup } from "./localBackup";
import { runScheduledWebDavSync } from "./webdavAutoSync";

interface ScheduledTask {
  label: string;
  run: () => Promise<void>;
}

/** alarm 名 → 任务。新增定时任务只需在这里加一项 */
const SCHEDULED_TASKS: Record<string, ScheduledTask> = {
  syncHistory: { label: "历史记录定时同步", run: runScheduledHistorySync },
  syncWebDav: { label: "WebDAV 自动同步", run: runScheduledWebDavSync },
  [LOCAL_HISTORY_BACKUP_ALARM]: { label: "本地自动备份", run: runScheduledLocalBackup },
  cloudAutoUpload: { label: "云端自动上传", run: runScheduledCloudUpload },
};

const ALARM_PERIOD_MINUTES = 1;

/** 确保每个 alarm 都存在且周期正确（Firefox 重启后 alarm 不会保留，因此每次启动都检查） */
export async function ensureAlarms(): Promise<void> {
  for (const name of Object.keys(SCHEDULED_TASKS)) {
    const alarm = await browser.alarms.get(name);
    if (alarm?.periodInMinutes !== ALARM_PERIOD_MINUTES) {
      await browser.alarms.create(name, { periodInMinutes: ALARM_PERIOD_MINUTES });
    }
  }
}

export function registerAlarmListener(): void {
  browser.alarms.onAlarm.addListener(async (alarm) => {
    const task = SCHEDULED_TASKS[alarm.name];
    if (!task) return;
    await task.run().catch((error) => console.error(`${task.label}失败:`, error));
  });
}
