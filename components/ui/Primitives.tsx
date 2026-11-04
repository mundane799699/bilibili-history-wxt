import type { ReactNode } from "react";

/**
 * 页面级共享组件：与官网（bilibilihistory.com）保持同一套视觉语言。
 * 统一使用 design tokens（brand / ink / line / wash / night），不再散落写死颜色。
 */

export function PageHeader({
  title,
  description,
  actions,
  meta,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.02em] text-ink dark:text-night-text">
            {title}
          </h1>
          {meta}
        </div>
        {description && (
          <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-ink-muted dark:text-night-muted">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({
  children,
  className = "",
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border border-line bg-white shadow-card dark:border-night-line dark:bg-night-card ${padded ? "p-5" : ""} ${className}`}
    >
      {children}
    </div>
  );
}

export function CardTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink dark:text-night-text">
        {children}
      </h2>
      {hint && <p className="mt-1 text-[12.5px] text-ink-muted dark:text-night-muted">{hint}</p>}
    </div>
  );
}

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-xl text-[13.5px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-night";

const sizes: Record<string, string> = {
  md: "h-10 px-4",
  sm: "h-8 px-3 text-[12.5px]",
  lg: "h-11 px-5",
};

const variants: Record<string, string> = {
  primary: "bg-brand text-white hover:bg-brand-strong shadow-[0_1px_2px_rgba(251,114,153,0.35)]",
  secondary:
    "border border-line bg-white text-ink-soft hover:border-brand/30 hover:bg-brand-soft hover:text-brand-strong dark:border-night-line dark:bg-night-card dark:text-night-text dark:hover:border-brand/40 dark:hover:bg-brand/10",
  ghost:
    "text-ink-muted hover:bg-wash hover:text-ink-soft dark:text-night-muted dark:hover:bg-night-line/60 dark:hover:text-night-text",
};

export function Button({
  children,
  variant = "primary",
  size = "md",
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
}) {
  return (
    <button className={`${buttonBase} ${sizes[size]} ${variants[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
      {icon && (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-wash text-ink-faint dark:bg-night-line dark:text-night-muted">
          {icon}
        </div>
      )}
      <p className="text-[15px] font-medium text-ink dark:text-night-text">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-ink-muted dark:text-night-muted">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
