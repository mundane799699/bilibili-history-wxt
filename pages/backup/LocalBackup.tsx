import { DatabaseBackup } from "lucide-react";
import { LocalHistoryBackupPanel } from "@/components/LocalHistoryBackupPanel";
import { BackupPageHeader, BackupPageLayout } from "./BackupPageHeader";

const LocalBackup = () => (
  <BackupPageLayout>
    <BackupPageHeader
      icon={DatabaseBackup}
      title="本地目录备份"
      description="选择电脑上的一个目录，由浏览器定期把数据保存为 JSON 文件，不经过任何第三方。"
    />
    <div data-tour="backup-local">
      <LocalHistoryBackupPanel />
    </div>
  </BackupPageLayout>
);

export default LocalBackup;
