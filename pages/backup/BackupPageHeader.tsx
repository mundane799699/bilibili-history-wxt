import type { LucideIcon } from "lucide-react";

interface BackupPageHeaderProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

export const BackupPageHeader = ({ icon: Icon, title, description }: BackupPageHeaderProps) => (
  <header className="mb-8">
    <div className="flex items-center gap-3">
      <Icon className="h-7 w-7 text-pink-600 dark:text-pink-400" />
      <h1 className="text-2xl font-bold tracking-tight text-gray-950 dark:text-white">{title}</h1>
    </div>
    <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600 dark:text-neutral-400">
      {description}
    </p>
  </header>
);

export const BackupPageLayout = ({ children }: { children: React.ReactNode }) => (
  <main className="min-h-screen bg-gray-50/70 text-gray-900 dark:bg-[#0a0a0a] dark:text-neutral-100">
    <div className="mx-auto max-w-3xl px-4 py-8 pb-20 sm:px-6">{children}</div>
  </main>
);
