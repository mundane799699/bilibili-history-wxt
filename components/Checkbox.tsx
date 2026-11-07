import { Check } from "lucide-react";

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}

export const Checkbox = ({ checked, onChange, label }: CheckboxProps) => {
  return (
    <label className="flex items-center cursor-pointer group select-none py-2 px-1 rounded-md transition-colors hover:bg-wash/80 dark:hover:bg-night-line/60">
      <div className="relative">
        <div
          className={`w-5 h-5 rounded-[4px] border transition-all duration-200 flex items-center justify-center
            ${
              checked
                ? "bg-brand border-brand shadow-sm"
                : "bg-white dark:bg-night-card border-line dark:border-night-line group-hover:border-brand/40 dark:group-hover:border-brand shadow-sm"
            }
          `}
        >
          <Check
            size={14}
            className={`text-white transform transition-transform duration-200 ${
              checked ? "scale-100 opacity-100" : "scale-50 opacity-0"
            }`}
            strokeWidth={3}
          />
        </div>
      </div>
      <span className="ml-3 text-sm text-ink-soft dark:text-night-muted font-medium group-hover:text-brand-strong dark:group-hover:text-brand transition-colors">
        {label}
      </span>
      <input
        type="checkbox"
        className="hidden"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
};
