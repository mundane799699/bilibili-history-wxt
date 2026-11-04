import React, { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  // when provided, a page size selector is rendered
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [20, 50, 100, 200],
}) => {
  const totalPages = Math.ceil(totalItems / pageSize);
  const [jumpToPage, setJumpToPage] = useState("");

  useEffect(() => {
    setJumpToPage("");
  }, [currentPage]);

  const handleJumpToPage = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const page = parseInt(jumpToPage);
      if (!isNaN(page) && page >= 1 && page <= totalPages) {
        onPageChange(page);
      }
    }
  };

  const renderPageNumbers = () => {
    const pages = [];
    const maxVisiblePages = 5; // 比如： 1 2 3 4 5 ... 10

    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // 总是显示第一页
      pages.push(1);

      if (currentPage > 3) {
        pages.push("...");
      }

      // 计算中间显示的页码
      let start = Math.max(2, currentPage - 1);
      let end = Math.min(totalPages - 1, currentPage + 1);

      if (currentPage < 4) {
        end = 4;
      }
      if (currentPage > totalPages - 3) {
        start = totalPages - 3;
      }

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (currentPage < totalPages - 2) {
        pages.push("...");
      }

      // 总是显示最后一页
      pages.push(totalPages);
    }

    return pages.map((page, index) => {
      if (page === "...") {
        return (
          <span
            key={`ellipsis-${index}`}
            className="w-8 h-8 flex items-center justify-center text-ink-faint dark:text-night-muted"
          >
            ...
          </span>
        );
      }

      const pageNum = page as number;
      const isActive = currentPage === pageNum;

      return (
        <button
          key={pageNum}
          type="button"
          onClick={() => onPageChange(pageNum)}
          aria-label={`第 ${pageNum} 页`}
          aria-current={isActive ? "page" : undefined}
          className={`
            flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 dark:focus-visible:ring-offset-night
            ${
              isActive
                ? "bg-brand text-white"
                : "border border-line bg-white text-ink-soft hover:border-brand/25 hover:bg-brand-soft hover:text-brand-strong dark:border-night-line dark:bg-night-card dark:text-night-muted dark:hover:border-brand/40 dark:hover:bg-brand/10 dark:hover:text-brand"
            }
          `}
        >
          {pageNum}
        </button>
      );
    });
  };

  if (totalPages <= 1) return null;

  return (
    <nav
      className="mx-auto flex max-w-[1600px] select-none flex-wrap items-center justify-center gap-2 px-4 pb-2 sm:px-6"
      aria-label="历史记录分页"
    >
      {/* 上一页 */}
      <button
        type="button"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className="hidden h-9 items-center rounded-lg border border-line bg-white px-3 text-sm text-ink-soft transition-colors hover:border-brand/25 hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line disabled:hover:bg-white disabled:hover:text-ink-soft dark:border-night-line dark:bg-night-card dark:text-night-muted dark:hover:border-brand/40 dark:hover:bg-brand/10 dark:hover:text-brand dark:disabled:hover:border-neutral-700 dark:disabled:hover:bg-night-card dark:disabled:hover:text-night-muted dark:focus-visible:ring-offset-night sm:flex"
        aria-label="上一页"
      >
        <ChevronLeft className="mr-1 h-4 w-4" />
        上一页
      </button>

      {/* 页码 */}
      <div className="flex items-center gap-1.5">{renderPageNumbers()}</div>

      {/* 下一页 */}
      <button
        type="button"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className="flex h-9 items-center rounded-lg border border-line bg-white px-3 text-sm text-ink-soft transition-colors hover:border-brand/25 hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line disabled:hover:bg-white disabled:hover:text-ink-soft dark:border-night-line dark:bg-night-card dark:text-night-muted dark:hover:border-brand/40 dark:hover:bg-brand/10 dark:hover:text-brand dark:disabled:hover:border-neutral-700 dark:disabled:hover:bg-night-card dark:disabled:hover:text-night-muted dark:focus-visible:ring-offset-night"
        aria-label="下一页"
      >
        下一页
        <ChevronRight className="ml-1 h-4 w-4" />
      </button>

      {/* 统计信息 */}
      <span className="ml-2 text-sm tabular-nums text-ink-muted dark:text-night-muted">
        共 {totalPages} 页 / {totalItems} 个
      </span>

      {/* 每页条数 */}
      {onPageSizeChange && (
        <select
          aria-label="每页显示条数"
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="ml-2 h-9 cursor-pointer rounded-lg border border-line bg-white px-2 text-sm text-ink-soft outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20 dark:border-night-line dark:bg-night-card dark:text-night-muted dark:focus:border-brand dark:focus:ring-brand/20"
        >
          {pageSizeOptions.map((size) => (
            <option key={size} value={size}>
              {size} 条/页
            </option>
          ))}
        </select>
      )}

      {/* 跳转 */}
      <div className="ml-2 hidden items-center gap-2 md:flex">
        <span className="text-sm text-ink-muted dark:text-night-muted">跳至</span>
        <input
          type="number"
          min={1}
          max={totalPages}
          value={jumpToPage}
          onChange={(e) => setJumpToPage(e.target.value)}
          onKeyDown={handleJumpToPage}
          onBlur={() => {
            const page = parseInt(jumpToPage);
            if (!isNaN(page) && page >= 1 && page <= totalPages) {
              onPageChange(page);
            }
          }}
          aria-label="跳转页码"
          className="h-9 w-14 rounded-lg border border-line bg-white text-center text-sm tabular-nums text-ink-soft outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20 dark:border-night-line dark:bg-night-card dark:text-night-text dark:focus:border-brand dark:focus:ring-brand/20"
        />
        <span className="text-sm text-ink-muted dark:text-night-muted">页</span>
      </div>
    </nav>
  );
};
