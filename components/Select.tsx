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
          className="mb-1.5 block text-sm font-medium text-ink-soft dark:text-night-muted"
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
        className={`flex min-h-10 w-full items-center justify-between rounded-lg border bg-white px-3 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand/20 disabled:cursor-not-allowed disabled:bg-wash disabled:opacity-60 dark:bg-night dark:disabled:bg-neutral-800 ${
          isOpen
            ? "border-brand ring-2 ring-brand/20"
            : "border-line hover:border-gray-400 dark:border-night-line dark:hover:border-night-line"
        }`}
      >
        <span
          className={`truncate ${selectedOption ? "font-medium text-ink dark:text-night-text" : "text-ink-muted dark:text-night-muted"}`}
        >
          {selectedOption ? selectedOption.label : "请选择"}
        </span>
        <span
          aria-hidden="true"
          className={`transform transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        >
          <ChevronDown className="h-4 w-4 text-ink-muted dark:text-night-muted" />
        </span>
      </button>

      {isOpen && !disabled && (
        <div
          id={listboxId}
          role="listbox"
          aria-labelledby={label ? labelId : undefined}
          className="absolute z-50 mt-1.5 w-full overflow-hidden rounded-xl border border-line bg-white shadow-lg dark:border-night-line dark:bg-night-card"
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
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                  option.value === value
                    ? "bg-brand-soft font-medium text-brand-strong dark:bg-brand/10 dark:text-brand"
                    : "text-ink-soft hover:bg-wash dark:text-night-muted dark:hover:bg-night-line/60"
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
