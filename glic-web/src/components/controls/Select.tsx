import React from 'react';

interface SelectProps {
  label: string;
  value: number | string;
  options: { label: string; value: number | string }[];
  onChange: (val: any) => void;
}

export const Select: React.FC<SelectProps> = ({ label, value, options, onChange }) => {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">{label}</span>
      <div className="relative">
        <select
            value={value}
            onChange={(e) => {
                const val = e.target.value;
                // Try to parse as number if original value was number
                const num = parseFloat(val);
                onChange(isNaN(num) ? val : num);
            }}
            className="w-full bg-zinc-900 border border-zinc-700 text-zinc-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 appearance-none transition-all hover:border-zinc-600"
        >
            {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
                {opt.label}
            </option>
            ))}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-zinc-400">
            <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
        </div>
      </div>
    </div>
  );
};
