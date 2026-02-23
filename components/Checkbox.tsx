import { Check } from "lucide-react";

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}

export const Checkbox = ({ checked, onChange, label }: CheckboxProps) => {
  return (
    <label className="flex items-center cursor-pointer group select-none py-2 px-1 rounded-md transition-colors hover:bg-gray-50/80">
      <div className="relative">
        <div
          className={`w-5 h-5 rounded-[4px] border transition-all duration-200 flex items-center justify-center
            ${
              checked
                ? "bg-blue-600 border-blue-600 shadow-sm"
                : "bg-white border-gray-300 group-hover:border-blue-400 shadow-sm"
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
      <span className="ml-3 text-sm text-gray-700 font-medium group-hover:text-blue-600 transition-colors">
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
