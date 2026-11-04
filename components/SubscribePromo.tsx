import { Sparkles, X } from "lucide-react";

const baseUrl = import.meta.env.VITE_BASE_API || "https://bilibilihistory.mundane.ink";

const openPricing = () => {
  window.open(`${baseUrl}/pricing`, "_blank", "noopener");
};

/**
 * 订阅引导。两种形态：
 * - sidebar：侧边栏底部的小卡片，可关闭
 * - card：云同步页底部的大卡片
 * 是否展示由调用方根据会员状态决定。
 */
export const SubscribePromo = ({
  variant = "card",
  onDismiss,
}: {
  variant?: "sidebar" | "card";
  onDismiss?: () => void;
}) => {
  if (variant === "sidebar") {
    return (
      <div className="relative mx-2.5 mb-2 overflow-hidden rounded-xl border border-brand/25 bg-gradient-to-b from-brand-soft to-white p-3 dark:border-brand/20 dark:from-brand/10 dark:to-night-card">
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="关闭订阅引导"
            title="关闭"
            className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-white/70 hover:text-ink-soft dark:text-night-muted dark:hover:bg-night-line/60"
          >
            <X className="h-3 w-3" />
          </button>
        )}
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-brand-strong dark:text-brand" />
          <p className="text-[12.5px] font-semibold text-ink dark:text-night-text">
            解锁无限云同步
          </p>
        </div>
        <p className="mt-1 pr-4 text-[11.5px] leading-relaxed text-ink-muted dark:text-night-muted">
          免费版最多上传 500 条，会员不限量。
        </p>
        <button
          type="button"
          onClick={openPricing}
          className="mt-2 flex h-7 w-full items-center justify-center rounded-lg bg-brand text-[12px] font-medium text-white transition-colors hover:bg-brand-strong"
        >
          查看会员方案
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6 overflow-hidden rounded-2xl border border-brand/25 bg-gradient-to-br from-brand-soft via-white to-white p-5 dark:border-brand/20 dark:from-brand/10 dark:via-night-card dark:to-night-card">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand/15 text-brand-strong dark:bg-brand/20 dark:text-brand">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            <h3 className="text-[14.5px] font-semibold text-ink dark:text-night-text">
              会员解锁无限云同步
            </h3>
          </div>
          <p className="mt-2 max-w-lg text-[12.5px] leading-relaxed text-ink-muted dark:text-night-muted">
            免费用户最多上传 500
            条记录；会员不限量，多设备共享同一份观看历史，还能在网页端随时检索。
          </p>
          <p className="mt-2 text-[12.5px] text-ink-soft dark:text-night-text">
            <span className="font-medium text-brand-strong dark:text-brand">月会员 ¥9.9</span>
            <span className="mx-1.5 text-ink-faint">·</span>
            <span className="font-medium text-brand-strong dark:text-brand">年会员 ¥99</span>
          </p>
        </div>
        <button
          type="button"
          onClick={openPricing}
          className="inline-flex h-9 flex-shrink-0 items-center justify-center rounded-xl bg-brand px-4 text-[13px] font-medium text-white transition-colors hover:bg-brand-strong"
        >
          查看会员方案
        </button>
      </div>
    </div>
  );
};
