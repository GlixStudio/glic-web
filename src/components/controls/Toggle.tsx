import React from 'react';

interface ToggleProps {
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    title?: string;
}

export const Toggle: React.FC<ToggleProps> = ({ label, checked, onChange, title }) => (
    <label className="flex items-center justify-between gap-2 cursor-pointer select-none" title={title}>
        <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">{label}</span>
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            onClick={() => onChange(!checked)}
            className={`relative w-9 h-5 rounded-full transition-colors ${checked ? 'bg-blue-600' : 'bg-zinc-700'}`}
        >
            <span
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                    checked ? 'translate-x-4' : 'translate-x-0.5'
                }`}
            />
        </button>
    </label>
);
