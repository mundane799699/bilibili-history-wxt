import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const labelId = useId();
  const listboxId = useId();

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
      if (event.key === "Escape") {
        event.preventDefault();
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const selectedOption = options.find((opt) => opt.value === value);

  return (
    <div className="relative w-full" ref={containerRef}>
      {label && (
        <span
          id={labelId}
          className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-neutral-300"
        >
          {label}
        </span>
      )}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-labelledby={label ? labelId : undefined}
        className={`flex min-h-10 w-full items-center justify-between rounded-lg border bg-white px-3 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-pink-500/20 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:opacity-60 dark:bg-neutral-950 dark:disabled:bg-neutral-800 ${
          isOpen
            ? "border-pink-500 ring-2 ring-pink-500/20"
            : "border-gray-300 hover:border-gray-400 dark:border-neutral-700 dark:hover:border-neutral-600"
        }`}
      >
        <span
          className={`truncate ${selectedOption ? "font-medium text-gray-900 dark:text-neutral-100" : "text-gray-500 dark:text-neutral-500"}`}
        >
          {selectedOption ? selectedOption.label : "请选择"}
        </span>
        <span
          aria-hidden="true"
          className={`transform transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        >
          <ChevronDown className="h-4 w-4 text-gray-500 dark:text-neutral-400" />
        </span>
      </button>

      {isOpen && !disabled && (
        <div
          id={listboxId}
          role="listbox"
          aria-labelledby={label ? labelId : undefined}
          className="absolute z-50 mt-1.5 w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
        >
          <div className="max-h-60 overflow-auto p-1">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={option.value === value}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                  triggerRef.current?.focus();
                }}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 ${
                  option.value === value
                    ? "bg-pink-50 font-medium text-pink-700 dark:bg-pink-500/10 dark:text-pink-300"
                    : "text-gray-700 hover:bg-gray-50 dark:text-neutral-300 dark:hover:bg-neutral-800"
                }`}
              >
                <span>{option.label}</span>
                {option.value === value && <Check className="h-4 w-4" aria-hidden="true" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
