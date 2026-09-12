import React, { useState, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, X } from "lucide-react";
import dayjs from "dayjs";
import isBetween from "dayjs/plugin/isBetween";

dayjs.extend(isBetween);

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onChange: (start: string, end: string) => void;
  mode?: "range" | "single";
}

export const DateRangePicker: React.FC<DateRangePickerProps> = ({
  startDate,
  endDate,
  onChange,
  mode = "range",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(dayjs());
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync current month with selected start date if getting open
  useEffect(() => {
    if (isOpen && startDate) {
      setCurrentMonth(dayjs(startDate));
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const handleDateClick = (dateStr: string) => {
    if (mode === "single") {
      onChange(dateStr, dateStr);
      setIsOpen(false);
      return;
    }

    if (!startDate && !endDate) {
      onChange(dateStr, "");
    } else if (startDate && !endDate) {
      if (dateStr < startDate) {
        // Correct selection if user clicks earlier date
        onChange(dateStr, startDate);
        setIsOpen(false);
      } else {
        onChange(startDate, dateStr);
        setIsOpen(false);
      }
    } else {
      // Reset and start new selection
      onChange(dateStr, "");
    }
  };

  const nextMonth = () => setCurrentMonth(currentMonth.add(1, "month"));
  const prevMonth = () => setCurrentMonth(currentMonth.subtract(1, "month"));

  const generateDays = () => {
    const startOfMonth = currentMonth.startOf("month");
    const endOfMonth = currentMonth.endOf("month");
    const daysInMonth = startOfMonth.daysInMonth();
    const paddingDays = startOfMonth.day() === 0 ? 6 : startOfMonth.day() - 1; // Start Monday

    const days = [];
    for (let i = 0; i < paddingDays; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(startOfMonth.date(i));
    }
    return days;
  };

  const days = generateDays();
  const weekDays = ["一", "二", "三", "四", "五", "六", "日"];

  const displayText = startDate
    ? endDate && startDate !== endDate
      ? `${startDate} ~ ${endDate}`
      : startDate
    : "";

  return (
    <div className="relative" ref={containerRef}>
      <div className="group relative flex h-10 items-center rounded-lg border border-gray-200 bg-white transition-colors hover:border-pink-200 hover:bg-pink-50 focus-within:ring-2 focus-within:ring-pink-500 focus-within:ring-offset-2 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-pink-500/40 dark:hover:bg-pink-500/10 dark:focus-within:ring-offset-[#0a0a0a]">
        <button
          type="button"
          className="flex h-full min-w-0 items-center gap-2 px-3 text-sm text-gray-700 focus-visible:outline-none dark:text-neutral-300"
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          aria-haspopup="dialog"
          aria-label={displayText ? `已选日期：${displayText}` : "选择日期"}
        >
          <CalendarIcon className="h-4 w-4 shrink-0 text-gray-500 transition-colors group-hover:text-pink-600 dark:text-neutral-400 dark:group-hover:text-pink-300" />
          <span
            className={`max-w-[180px] truncate whitespace-nowrap ${
              displayText
                ? "text-gray-700 dark:text-neutral-200"
                : "text-gray-500 dark:text-neutral-500"
            }`}
          >
            {displayText || "选择日期"}
          </span>
        </button>
        {displayText && (
          <button
            type="button"
            onClick={() => {
              onChange("", "");
            }}
            className="flex h-full w-9 shrink-0 items-center justify-center rounded-r-lg text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-red-500 dark:text-neutral-400 dark:hover:bg-red-500/10 dark:hover:text-red-300"
            title="清除日期"
            aria-label="清除日期"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {isOpen && (
        <div
          className="absolute right-0 top-full z-50 mt-2 w-[min(320px,calc(100vw-2rem))] select-none rounded-xl border border-gray-200 bg-white p-4 shadow-[0_14px_36px_rgba(15,23,42,0.16)] dark:border-neutral-700 dark:bg-neutral-900"
          role="dialog"
          aria-label="选择历史记录日期"
        >
          <div className="flex justify-between items-center mb-4">
            <span className="font-medium text-gray-700 dark:text-neutral-200">
              {currentMonth.format("YYYY年MM月")}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={prevMonth}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white"
                aria-label="上个月"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={nextMonth}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white"
                aria-label="下个月"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 mb-2">
            {weekDays.map((d) => (
              <div key={d} className="text-center text-xs text-gray-400 dark:text-neutral-500 py-1">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {days.map((date, idx) => {
              if (!date) return <div key={idx} />;
              const dateStr = date.format("YYYY-MM-DD");
              const isSelected =
                startDate === dateStr ||
                endDate === dateStr ||
                (startDate && endDate && dateStr > startDate && dateStr < endDate);

              const isStart = startDate === dateStr;
              const isEnd = endDate === dateStr;
              const isInRange = startDate && endDate && dateStr > startDate && dateStr < endDate;

              let bgClass =
                "hover:bg-pink-50 dark:hover:bg-pink-500/10 text-gray-700 dark:text-neutral-200";
              if (isStart || isEnd) bgClass = "bg-pink-500 text-white hover:bg-pink-600";
              else if (isInRange)
                bgClass = "bg-pink-50 dark:bg-pink-500/15 text-pink-600 dark:text-pink-400";

              // Handle "picking" state visual cue (optional, kept simple for now)

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleDateClick(dateStr)}
                  aria-label={date.format("YYYY年MM月DD日")}
                  aria-pressed={Boolean(isSelected)}
                  className={`
                    flex aspect-square items-center justify-center rounded-md text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500
                    ${bgClass}
                  `}
                >
                  {date.date()}
                </button>
              );
            })}
          </div>

          <div className="flex justify-between mt-4 border-t border-gray-200 dark:border-neutral-800 pt-3">
            <button
              type="button"
              onClick={() => onChange("", "")}
              className="rounded text-xs text-gray-600 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:text-neutral-400 dark:hover:text-red-300"
            >
              清除
            </button>
            <button
              type="button"
              onClick={() => {
                const today = dayjs().format("YYYY-MM-DD");
                onChange(today, today);
                setIsOpen(false);
              }}
              className="rounded text-xs font-medium text-pink-700 hover:text-pink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 dark:text-pink-300 dark:hover:text-pink-200"
            >
              今天
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
