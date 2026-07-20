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
          onClick={() => onPageChange(pageNum)}
          className={`
            min-w-[32px] h-8 px-2 flex items-center justify-center rounded-md text-sm font-medium transition-colors
            ${
              isActive
                ? "bg-[#00aeec] text-white"
                : "bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 text-gray-600 dark:text-neutral-300 hover:border-[#00aeec] hover:text-[#00aeec] dark:hover:border-[#00aeec] dark:hover:text-[#00aeec]"
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
    <div className="flex items-center justify-center gap-2 py-6 select-none flex-wrap">
      {/* 上一页 */}
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className="h-8 px-3 border border-gray-200 dark:border-neutral-800 rounded-md bg-white dark:bg-neutral-900 text-gray-600 dark:text-neutral-300 text-sm hover:border-[#00aeec] hover:text-[#00aeec] dark:hover:border-[#00aeec] dark:hover:text-[#00aeec] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-gray-200 dark:disabled:hover:border-neutral-800 disabled:hover:text-gray-600 dark:disabled:hover:text-neutral-300 hidden sm:flex items-center"
      >
        <ChevronLeft className="w-4 h-4 mr-1" />
        上一页
      </button>

      {/* 页码 */}
      <div className="flex items-center gap-1.5">{renderPageNumbers()}</div>

      {/* 下一页 */}
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className="h-8 px-3 border border-gray-200 dark:border-neutral-800 rounded-md bg-white dark:bg-neutral-900 text-gray-600 dark:text-neutral-300 text-sm hover:border-[#00aeec] hover:text-[#00aeec] dark:hover:border-[#00aeec] dark:hover:text-[#00aeec] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-gray-200 dark:disabled:hover:border-neutral-800 disabled:hover:text-gray-600 dark:disabled:hover:text-neutral-300 flex items-center"
      >
        下一页
        <ChevronRight className="w-4 h-4 ml-1" />
      </button>

      {/* 统计信息 */}
      <span className="text-sm text-gray-500 dark:text-neutral-400 ml-4">
        共 {totalPages} 页 / {totalItems} 个
      </span>

      {/* 每页条数 */}
      {onPageSizeChange && (
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="h-8 px-2 ml-2 border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-gray-600 dark:text-neutral-300 rounded-md text-sm outline-none cursor-pointer focus:border-[#00aeec] dark:focus:border-[#00aeec] transition-colors"
        >
          {pageSizeOptions.map((size) => (
            <option key={size} value={size}>
              {size} 条/页
            </option>
          ))}
        </select>
      )}

      {/* 跳转 */}
      <div className="flex items-center gap-2 ml-2">
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
          className="w-12 h-8 border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-gray-700 dark:text-neutral-100 rounded-md text-center text-sm outline-none focus:border-[#00aeec] dark:focus:border-[#00aeec] transition-colors"
        />
        <span className="text-sm text-gray-500 dark:text-neutral-400">页</span>
      </div>
    </div>
  );
};
