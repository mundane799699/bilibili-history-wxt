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
            if (
                containerRef.current &&
                !containerRef.current.contains(event.target as Node)
            ) {
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
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
                    {label}
                </label>
            )}
            <button
                type="button"
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
                className={`
          flex items-center justify-between w-full px-3 py-2.5 text-left bg-white border rounded-lg shadow-sm transition-all duration-200 outline-none
          ${disabled ? "bg-gray-50 cursor-not-allowed opacity-70" : "hover:border-blue-300 focus:ring-2 focus:ring-blue-100 focus:border-blue-400 cursor-pointer"}
          ${isOpen ? "border-blue-500 ring-4 ring-blue-50/50" : "border-gray-200"}
        `}
            >
                <span className={`text-sm truncate ${selectedOption ? "text-gray-900 font-medium" : "text-gray-400"}`}>
                    {selectedOption ? selectedOption.label : "Select..."}
                </span>
                <div className={`transform transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}>
                    <ChevronDown size={16} className={`text-gray-400 ${isOpen ? 'text-blue-500' : ''}`} />
                </div>
            </button>

            {isOpen && !disabled && (
                <div className="absolute z-50 w-full mt-1.5 bg-white border border-gray-100 rounded-lg shadow-xl animate-in fade-in zoom-in-95 duration-100 origin-top overflow-hidden">
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
                  ${option.value === value
                                        ? "bg-blue-50 text-blue-700 font-medium border-l-2 border-blue-500"
                                        : "text-gray-700 hover:bg-gray-50 border-l-2 border-transparent"
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
