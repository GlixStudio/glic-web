import React from 'react';
import { MaybeTooltip } from './Tooltip';
import type { HelpEntry } from '../../core/help';

interface ToggleProps {
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    title?: string;
    help?: HelpEntry;
}

export const Toggle: React.FC<ToggleProps> = ({ label, checked, onChange, title, help }) => (
    <MaybeTooltip help={help}>
    <label className="flex items-center justify-between gap-2 cursor-pointer select-none" title={help ? undefined : title}>
        <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">{label}</span>
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            onClick={() => onChange(!checked)}
            className={`relative w-9 h-5 rounded-full transition-colors ${checked ? 'bg-blue-600' : 'bg-zinc-700'}`}
        >
            <span
                className={`absolute left-0 top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                    checked ? 'translate-x-[1.125rem]' : 'translate-x-0.5'
                }`}
            />
        </button>
    </label>
    </MaybeTooltip>
);
