import { markAllHistoryAsUnuploaded } from "@/utils/db";
import { isQuotaMessage, uploadPendingHistory } from "@/utils/cloudUpload";
import { CLOUD_AUTO_UPLOAD_ENABLED } from "@/utils/constants";
import { getStorageValue, setStorageValue } from "@/utils/storage";
import { toast } from "react-hot-toast";
import { useEffect, useState } from "react";
import { useUserStore } from "@/utils/store";
import { LoginModal } from "@/components/LoginModal";
import { UserInfo } from "@/components/UserInfo";
import { SubscribePromo } from "@/components/SubscribePromo";
import {
  getMembershipStatus,
  isMembershipValid,
  type MembershipStatus,
} from "@/services/membership";
import { Card, CardTitle, PageHeader, Button } from "@/components/ui/Primitives";
import {
  CheckCircle2,
  DownloadCloud,
  ExternalLink,
  Loader2,
  RotateCcw,
  Sparkles,
  UploadCloud,
  XCircle,
} from "lucide-react";

const CloudSync = () => {
  const { userInfo } = useUserStore();
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [membership, setMembership] = useState<MembershipStatus | null>(null);
  const isMember = Boolean(membership?.active);
  const [autoUploadEnabled, setAutoUploadEnabled] = useState(true);

  useEffect(() => {
    getStorageValue(CLOUD_AUTO_UPLOAD_ENABLED, true).then(setAutoUploadEnabled);
  }, []);

  const handleAutoUploadToggle = async (enabled: boolean) => {
    setAutoUploadEnabled(enabled);
    await setStorageValue(CLOUD_AUTO_UPLOAD_ENABLED, enabled);
  };

  // 登录状态变化（例如在官网登录后切回插件）时重新拉取会员信息
  useEffect(() => {
    let isActive = true;
    setMembership(null);
    getMembershipStatus()
      .then((status) => {
        if (isActive) setMembership(status);
      })
      .catch(() => {});
    return () => {
      isActive = false;
    };
  }, [userInfo?.id]);
  const [uploadInfo, setUploadInfo] = useState({
    isUploading: false,
    isOpen: false,
    totalCount: 0,
    successCount: 0,
    failedCount: 0,
    message: "",
  });

  const handleUpload = async () => {
    // 检查用户是否已登录
    if (!userInfo) {
      setShowLoginModal(true);
      return;
    }

    try {
      const result = await uploadPendingHistory((progress) =>
        setUploadInfo({
          isUploading: true,
          isOpen: true,
          totalCount: progress.totalCount,
          successCount: progress.successCount,
          failedCount: progress.failedCount,
          message: progress.stopMessage,
        }),
      );
      if (result.totalCount === 0) toast.success("没有需要上传的数据");
    } catch (error) {
      console.error("上传数据失败:", error);
    } finally {
      setUploadInfo((prev) => ({ ...prev, isUploading: false }));
    }
  };

  const handleDownload = () => {
    // TODO: 实现从云端获取数据的逻辑
    console.log("从云端获取数据");
  };

  const handleViewCloudData = () => {
    const baseUrl = import.meta.env.VITE_BASE_API || "https://bilibilihistory.mundane.ink";
    window.open(`${baseUrl}/dashboard`, "_blank");
  };

  const handleUpgrade = () => {
    const baseUrl = import.meta.env.VITE_BASE_API || "https://bilibilihistory.mundane.ink";
    window.open(`${baseUrl}/pricing`, "_blank");
  };

  const handleResetHistory = async () => {
    await markAllHistoryAsUnuploaded();
    toast.success("已将本地所有数据设置为未上传");
  };

  const progress =
    uploadInfo.totalCount > 0
      ? Math.round(
          ((uploadInfo.successCount + uploadInfo.failedCount) / uploadInfo.totalCount) * 100,
        )
      : 0;

  return (
    <div className="mx-auto max-w-[880px] px-6 py-8 pb-16">
      <PageHeader
        title="云同步"
        description="把浏览器里的历史记录同步到云端，换设备也能接着找。免费用户最多上传 500 条，会员不限量。"
      />

      <UserInfo membership={membership} />

      <Card className="mt-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[14px] font-semibold text-ink dark:text-night-text">
              自动上传到云端
            </p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted dark:text-night-muted">
              开启后每小时在后台自动上传新的历史记录，仅对有效期内的会员生效。
              {membership && !isMembershipValid(membership) && autoUploadEnabled && (
                <span className="text-brand-strong dark:text-brand">
                  当前不是会员，暂不会自动上传。
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={autoUploadEnabled}
            aria-label="自动上传历史记录到云端"
            onClick={() => handleAutoUploadToggle(!autoUploadEnabled)}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-900 ${
              autoUploadEnabled ? "bg-brand" : "bg-ink-faint/40 dark:bg-night-line"
            }`}
          >
            <span
              className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                autoUploadEnabled ? "translate-x-[22px]" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
      </Card>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Card className="flex flex-col">
          <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-brand-soft text-brand-strong dark:bg-brand/10 dark:text-brand">
            <UploadCloud className="h-4 w-4" />
          </div>
          <h3 className="text-[14px] font-semibold text-ink dark:text-night-text">上传到云端</h3>
          <p className="mt-1 flex-1 text-[12.5px] leading-relaxed text-ink-muted dark:text-night-muted">
            把本地尚未同步的记录分批上传，已经传过的不会重复上传。
          </p>
          <Button className="mt-4 w-full" onClick={handleUpload}>
            开始上传
          </Button>
        </Card>

        <Card className="flex flex-col">
          <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-brand-soft text-brand-strong dark:bg-brand/10 dark:text-brand">
            <ExternalLink className="h-4 w-4" />
          </div>
          <h3 className="text-[14px] font-semibold text-ink dark:text-night-text">查看云端数据</h3>
          <p className="mt-1 flex-1 text-[12.5px] leading-relaxed text-ink-muted dark:text-night-muted">
            在网页端仪表盘浏览已经同步的记录，支持搜索与筛选。
          </p>
          <Button className="mt-4 w-full" onClick={handleViewCloudData}>
            打开仪表盘
          </Button>
        </Card>

        <Card className="flex flex-col">
          <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-brand-soft text-brand-strong dark:bg-brand/10 dark:text-brand">
            <DownloadCloud className="h-4 w-4" />
          </div>
          <h3 className="flex items-center gap-2 text-[14px] font-semibold text-ink dark:text-night-text">
            从云端取回
            <span className="rounded-full bg-wash px-2 py-0.5 text-[11px] font-normal text-ink-muted dark:bg-night-line dark:text-night-muted">
              待开发
            </span>
          </h3>
          <p className="mt-1 flex-1 text-[12.5px] leading-relaxed text-ink-muted dark:text-night-muted">
            把云端记录拉回本地。目前请先用 JSON 或 WebDAV 备份恢复数据。
          </p>
          <Button className="mt-4 w-full" disabled>
            暂不可用
          </Button>
        </Card>

        <Card className="flex flex-col">
          <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-brand-soft text-brand-strong dark:bg-brand/10 dark:text-brand">
            <RotateCcw className="h-4 w-4" />
          </div>
          <h3 className="text-[14px] font-semibold text-ink dark:text-night-text">重置上传标记</h3>
          <p className="mt-1 flex-1 text-[12.5px] leading-relaxed text-ink-muted dark:text-night-muted">
            把所有本地记录改回未上传，下次上传会重新同步一遍。
          </p>
          <Button className="mt-4 w-full" onClick={handleResetHistory}>
            标记为未上传
          </Button>
        </Card>
      </div>

      <Card className="mt-6">
        <CardTitle hint="云端只保留每个视频最近一次观看；完整观看次数保存在本地、JSON 和 WebDAV v2 备份中。">
          使用说明
        </CardTitle>
        <ul className="space-y-2 text-[13px] text-ink-soft dark:text-night-muted">
          <li className="flex gap-2">
            <span className="mt-[7px] h-1 w-1 flex-shrink-0 rounded-full bg-ink-faint" />
            点击「开始上传」把本地数据同步到云端服务器。
          </li>
          <li className="flex gap-2">
            <span className="mt-[7px] h-1 w-1 flex-shrink-0 rounded-full bg-ink-faint" />
            点击「打开仪表盘」查看已经同步到云端的数据。
          </li>
          <li className="flex gap-2">
            <span className="mt-[7px] h-1 w-1 flex-shrink-0 rounded-full bg-ink-faint" />
            上传成功后记录会被标记为已上传，重复点击不会重复上传。
          </li>
          <li className="flex gap-2">
            <span className="mt-[7px] h-1 w-1 flex-shrink-0 rounded-full bg-ink-faint" />
            会员开启「自动上传到云端」后，插件每小时会在后台自动上传一次，无需手动操作。
          </li>
        </ul>
      </Card>

      {!isMember && <SubscribePromo variant="card" />}

      {/* 上传进度弹窗 */}
      {uploadInfo.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="mx-4 flex max-h-[90vh] w-full max-w-md flex-col rounded-2xl border border-line bg-white shadow-lift dark:border-night-line dark:bg-night-card">
            <div className="border-b border-line px-6 py-4 dark:border-night-line">
              <h2 className="text-[15px] font-semibold text-ink dark:text-night-text">数据上传</h2>
            </div>

            <div className="flex-grow overflow-y-auto p-6">
              <div className="mb-6 text-center">
                {uploadInfo.isUploading ? (
                  <>
                    <Loader2 className="mx-auto h-8 w-8 animate-spin text-brand" />
                    <h3 className="mt-3 text-[14px] font-medium text-ink dark:text-night-text">
                      正在上传…
                    </h3>
                    <p className="mt-1 text-[12.5px] text-ink-muted dark:text-night-muted">
                      请稍候，不要关闭此页面
                    </p>
                  </>
                ) : (
                  <>
                    {uploadInfo.failedCount === 0 && uploadInfo.successCount > 0 ? (
                      <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
                    ) : (
                      <XCircle className="mx-auto h-8 w-8 text-red-500" />
                    )}
                    <h3 className="mt-3 text-[14px] font-medium text-ink dark:text-night-text">
                      上传{uploadInfo.failedCount > 0 ? "完成" : "成功"}
                    </h3>
                  </>
                )}
              </div>

              <div className="mb-5">
                <div className="mb-1.5 flex justify-between text-[12.5px]">
                  <span className="text-ink-muted dark:text-night-muted">进度</span>
                  <span className="font-medium tabular-nums text-ink dark:text-night-text">
                    {progress}%
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-wash dark:bg-night-line">
                  <div
                    className="h-full rounded-full bg-brand transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 rounded-xl bg-wash p-4 text-center dark:bg-night-line/40">
                <div>
                  <p className="text-[12px] text-ink-muted dark:text-night-muted">总计</p>
                  <p className="mt-0.5 text-xl font-semibold tabular-nums text-ink dark:text-night-text">
                    {uploadInfo.totalCount}
                  </p>
                </div>
                <div>
                  <p className="text-[12px] text-ink-muted dark:text-night-muted">成功</p>
                  <p className="mt-0.5 text-xl font-semibold tabular-nums text-emerald-600">
                    {uploadInfo.successCount}
                  </p>
                </div>
                <div>
                  <p className="text-[12px] text-ink-muted dark:text-night-muted">失败</p>
                  <p className="mt-0.5 text-xl font-semibold tabular-nums text-red-500">
                    {uploadInfo.failedCount}
                  </p>
                </div>
              </div>

              {uploadInfo.message && (
                <div className="mt-4 rounded-xl bg-red-50 px-3 py-2.5 text-center text-[12.5px] text-red-600 dark:bg-red-500/10 dark:text-red-400">
                  {uploadInfo.message}
                </div>
              )}

              {isQuotaMessage(uploadInfo.message) && !uploadInfo.isUploading && (
                <Button className="mt-5 w-full" onClick={handleUpgrade}>
                  <Sparkles className="h-4 w-4" />
                  升级会员，解锁不限量上传
                </Button>
              )}
            </div>

            {!uploadInfo.isUploading && (
              <div className="flex justify-end border-t border-line px-6 py-3 dark:border-night-line">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setUploadInfo((prev) => ({ ...prev, isOpen: false }))}
                >
                  关闭
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 登录提示弹窗 */}
      <LoginModal isOpen={showLoginModal} onClose={() => setShowLoginModal(false)} />
    </div>
  );
};

export default CloudSync;
