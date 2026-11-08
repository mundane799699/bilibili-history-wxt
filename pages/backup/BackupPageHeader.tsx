import type { LucideIcon } from "lucide-react";

interface BackupPageHeaderProps {
  icon: LucideIcon;
  title: string;
  description: string;
  /** 标题右侧的操作区（可选） */
  action?: React.ReactNode;
}

export const BackupPageHeader = ({
  icon: Icon,
  title,
  description,
  action,
}: BackupPageHeaderProps) => (
  <header className="mb-7">
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-soft text-brand-strong dark:bg-brand/10 dark:text-brand">
        <Icon className="h-4 w-4" />
      </div>
      <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.02em] text-ink dark:text-night-text">
        {title}
      </h1>
      {action && <div className="ml-auto shrink-0">{action}</div>}
    </div>
    <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-ink-muted dark:text-night-muted">
      {description}
    </p>
  </header>
);

export const BackupPageLayout = ({ children }: { children: React.ReactNode }) => (
  <main className="min-h-screen bg-wash/50 text-ink dark:bg-night dark:text-night-text">
    <div className="mx-auto max-w-3xl px-4 py-8 pb-20 sm:px-6">{children}</div>
  </main>
);
