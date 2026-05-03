import { useState, useRef, useEffect } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

interface Option {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  label?: string;
  disabled?: boolean;
}

export const Select = ({ value, onChange, options, label, disabled = false }: SelectProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOption = options.find((opt) => opt.value === value);

  return (
    <div className="relative w-full" ref={containerRef}>
      {label && (
        <label className="block text-xs font-semibold text-gray-500 dark:text-neutral-400 mb-1.5 uppercase tracking-wide">
          {label}
        </label>
      )}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`
          flex items-center justify-between w-full px-3 py-2.5 text-left bg-white dark:bg-neutral-900 border rounded-lg shadow-sm transition-all duration-200 outline-none
          ${disabled ? "bg-gray-50 dark:bg-neutral-800 cursor-not-allowed opacity-70" : "hover:border-blue-300 dark:hover:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-500/20 focus:border-blue-400 dark:focus:border-blue-500 cursor-pointer"}
          ${isOpen ? "border-blue-500 ring-4 ring-blue-50/50 dark:ring-blue-500/15" : "border-gray-200 dark:border-neutral-700"}
        `}
      >
        <span
          className={`text-sm truncate ${selectedOption ? "text-gray-900 dark:text-neutral-100 font-medium" : "text-gray-400 dark:text-neutral-500"}`}
        >
          {selectedOption ? selectedOption.label : "Select..."}
        </span>
        <div
          className={`transform transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        >
          <ChevronDown
            size={16}
            className={`text-gray-400 dark:text-neutral-500 ${isOpen ? "text-blue-500 dark:text-blue-400" : ""}`}
          />
        </div>
      </button>

      {isOpen && !disabled && (
        <div className="absolute z-50 w-full mt-1.5 bg-white dark:bg-neutral-900 border border-gray-100 dark:border-neutral-800 rounded-lg shadow-xl animate-in fade-in zoom-in-95 duration-100 origin-top overflow-hidden">
          <div className="max-h-60 overflow-auto py-1">
            {options.map((option) => (
              <div
                key={option.value}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={`
                  px-3 py-2.5 text-sm cursor-pointer transition-colors
                  ${
                    option.value === value
                      ? "bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 font-medium border-l-2 border-blue-500"
                      : "text-gray-700 dark:text-neutral-300 hover:bg-gray-50 dark:hover:bg-neutral-800 border-l-2 border-transparent"
                  }
                `}
              >
                {option.label}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
