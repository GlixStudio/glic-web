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
        <span className="text-[10px] font-bold text-ink-2 uppercase tracking-wider">{label}</span>
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            onClick={() => onChange(!checked)}
            className={`relative w-9 h-5 rounded-full border border-ink transition-colors ${checked ? 'bg-glx-green' : 'bg-ink'}`}
        >
            <span
                className={`absolute left-0 top-[1px] w-4 h-4 rounded-full transition-transform ${
                    checked ? 'translate-x-[1.05rem] bg-ink' : 'translate-x-0.5 bg-cream-2'
                }`}
            />
        </button>
    </label>
    </MaybeTooltip>
);
