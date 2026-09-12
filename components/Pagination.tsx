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
            className="w-8 h-8 flex items-center justify-center text-gray-400 dark:text-neutral-500"
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
            flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#0a0a0a]
            ${
              isActive
                ? "bg-pink-500 text-white"
                : "border border-gray-200 bg-white text-gray-600 hover:border-pink-200 hover:bg-pink-50 hover:text-pink-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:border-pink-500/40 dark:hover:bg-pink-500/10 dark:hover:text-pink-300"
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
        className="hidden h-9 items-center rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-600 transition-colors hover:border-pink-200 hover:bg-pink-50 hover:text-pink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-gray-200 disabled:hover:bg-white disabled:hover:text-gray-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:border-pink-500/40 dark:hover:bg-pink-500/10 dark:hover:text-pink-300 dark:disabled:hover:border-neutral-700 dark:disabled:hover:bg-neutral-900 dark:disabled:hover:text-neutral-300 dark:focus-visible:ring-offset-[#0a0a0a] sm:flex"
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
        className="flex h-9 items-center rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-600 transition-colors hover:border-pink-200 hover:bg-pink-50 hover:text-pink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-gray-200 disabled:hover:bg-white disabled:hover:text-gray-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:border-pink-500/40 dark:hover:bg-pink-500/10 dark:hover:text-pink-300 dark:disabled:hover:border-neutral-700 dark:disabled:hover:bg-neutral-900 dark:disabled:hover:text-neutral-300 dark:focus-visible:ring-offset-[#0a0a0a]"
        aria-label="下一页"
      >
        下一页
        <ChevronRight className="ml-1 h-4 w-4" />
      </button>

      {/* 统计信息 */}
      <span className="ml-2 text-sm tabular-nums text-gray-500 dark:text-neutral-400">
        共 {totalPages} 页 / {totalItems} 个
      </span>

      {/* 每页条数 */}
      {onPageSizeChange && (
        <select
          aria-label="每页显示条数"
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="ml-2 h-9 cursor-pointer rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-600 outline-none transition-colors focus:border-pink-500 focus:ring-2 focus:ring-pink-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:focus:border-pink-500 dark:focus:ring-pink-500/20"
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
        <span className="text-sm text-gray-500 dark:text-neutral-400">跳至</span>
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
          className="h-9 w-14 rounded-lg border border-gray-200 bg-white text-center text-sm tabular-nums text-gray-700 outline-none transition-colors focus:border-pink-500 focus:ring-2 focus:ring-pink-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:focus:border-pink-500 dark:focus:ring-pink-500/20"
        />
        <span className="text-sm text-gray-500 dark:text-neutral-400">页</span>
      </div>
    </nav>
  );
};
