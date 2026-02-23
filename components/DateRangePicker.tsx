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
      <div
        className="group relative flex items-center bg-gray-50 hover:bg-white border border-gray-200 rounded-lg transition-all focus-within:ring-2 focus-within:ring-blue-100 focus-within:border-blue-400 focus-within:bg-white shadow-sm cursor-pointer"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="pl-3 flex items-center pointer-events-none">
          <CalendarIcon className="h-4 w-4 text-gray-400 group-hover:text-blue-500 transition-colors" />
        </div>
        <input
          type="text"
          readOnly
          placeholder="yyyy/mm/dd"
          className="bg-transparent border-none text-sm text-gray-600 focus:ring-0 py-1.5 pl-2 pr-1 outline-none w-[180px] cursor-pointer"
          value={displayText}
        />
        {displayText && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onChange("", "");
            }}
            className="pr-2 text-gray-400 hover:text-red-500 transition-colors z-10"
            title="清除日期"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 bg-white rounded-lg shadow-xl border border-gray-100 p-4 z-50 w-[320px] animate-in fade-in zoom-in-95 duration-200 select-none">
          <div className="flex justify-between items-center mb-4">
            <span className="font-medium text-gray-700">{currentMonth.format("YYYY年MM月")}</span>
            <div className="flex gap-2">
              <button onClick={prevMonth} className="p-1 hover:bg-gray-100 rounded">
                <ChevronLeft className="w-4 h-4 text-gray-500" />
              </button>
              <button onClick={nextMonth} className="p-1 hover:bg-gray-100 rounded">
                <ChevronRight className="w-4 h-4 text-gray-500" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 mb-2">
            {weekDays.map((d) => (
              <div key={d} className="text-center text-xs text-gray-400 py-1">
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

              let bgClass = "hover:bg-blue-50 text-gray-700";
              if (isStart || isEnd) bgClass = "bg-blue-500 text-white hover:bg-blue-600";
              else if (isInRange) bgClass = "bg-blue-50 text-blue-600";

              // Handle "picking" state visual cue (optional, kept simple for now)

              return (
                <button
                  key={idx}
                  onClick={() => handleDateClick(dateStr)}
                  className={`
                    aspect-square rounded-md text-sm transition-colors flex items-center justify-center
                    ${bgClass}
                  `}
                >
                  {date.date()}
                </button>
              );
            })}
          </div>

          <div className="flex justify-between mt-4 border-t pt-3">
            <button
              onClick={() => onChange("", "")}
              className="text-xs text-gray-500 hover:text-red-500"
            >
              清除
            </button>
            <button
              onClick={() => {
                const today = dayjs().format("YYYY-MM-DD");
                onChange(today, today);
              }}
              className="text-xs text-blue-500 hover:text-blue-600"
            >
              今天
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
