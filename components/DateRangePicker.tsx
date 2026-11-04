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
      <div className="group relative flex h-10 items-center rounded-lg border border-line bg-white transition-colors hover:border-brand/25 hover:bg-brand-soft focus-within:ring-2 focus-within:ring-brand focus-within:ring-offset-2 dark:border-night-line dark:bg-night-card dark:hover:border-brand/40 dark:hover:bg-brand/10 dark:focus-within:ring-offset-night">
        <button
          type="button"
          className="flex h-full min-w-0 items-center gap-2 px-3 text-sm text-ink-soft focus-visible:outline-none dark:text-night-muted"
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          aria-haspopup="dialog"
          aria-label={displayText ? `已选日期：${displayText}` : "选择日期"}
        >
          <CalendarIcon className="h-4 w-4 shrink-0 text-ink-muted transition-colors group-hover:text-brand-strong dark:text-night-muted dark:group-hover:text-brand" />
          <span
            className={`max-w-[180px] truncate whitespace-nowrap ${
              displayText
                ? "text-ink-soft dark:text-night-text"
                : "text-ink-muted dark:text-night-muted"
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
            className="flex h-full w-9 shrink-0 items-center justify-center rounded-r-lg text-ink-muted transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-red-500 dark:text-night-muted dark:hover:bg-red-500/10 dark:hover:text-red-300"
            title="清除日期"
            aria-label="清除日期"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {isOpen && (
        <div
          className="absolute right-0 top-full z-50 mt-2 w-[min(320px,calc(100vw-2rem))] select-none rounded-xl border border-line bg-white p-4 shadow-[0_14px_36px_rgba(15,23,42,0.16)] dark:border-night-line dark:bg-night-card"
          role="dialog"
          aria-label="选择历史记录日期"
        >
          <div className="flex justify-between items-center mb-4">
            <span className="font-medium text-ink-soft dark:text-night-text">
              {currentMonth.format("YYYY年MM月")}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={prevMonth}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-wash hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:text-night-muted dark:hover:bg-night-line/60 dark:hover:text-white"
                aria-label="上个月"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={nextMonth}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-wash hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:text-night-muted dark:hover:bg-night-line/60 dark:hover:text-white"
                aria-label="下个月"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 mb-2">
            {weekDays.map((d) => (
              <div
                key={d}
                className="text-center text-xs text-ink-faint dark:text-night-muted py-1"
              >
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
                "hover:bg-brand-soft dark:hover:bg-brand/10 text-ink-soft dark:text-night-text";
              if (isStart || isEnd) bgClass = "bg-brand text-white hover:bg-brand-strong";
              else if (isInRange)
                bgClass = "bg-brand-soft dark:bg-brand/15 text-brand-strong dark:text-brand";

              // Handle "picking" state visual cue (optional, kept simple for now)

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleDateClick(dateStr)}
                  aria-label={date.format("YYYY年MM月DD日")}
                  aria-pressed={Boolean(isSelected)}
                  className={`
                    flex aspect-square items-center justify-center rounded-md text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand
                    ${bgClass}
                  `}
                >
                  {date.date()}
                </button>
              );
            })}
          </div>

          <div className="flex justify-between mt-4 border-t border-line dark:border-night-line pt-3">
            <button
              type="button"
              onClick={() => onChange("", "")}
              className="rounded text-xs text-ink-soft hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:text-night-muted dark:hover:text-red-300"
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
              className="rounded text-xs font-medium text-brand-strong hover:text-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:text-brand dark:hover:text-brand"
            >
              今天
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
