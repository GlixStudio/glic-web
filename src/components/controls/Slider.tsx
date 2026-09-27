import React, { useState } from 'react';
import { MaybeTooltip } from './Tooltip';
import type { HelpEntry } from '../../core/help';

interface SliderProps {
    label: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    onChange: (val: number) => void;
    /** Optional display formatter, e.g. exponent sliders showing 2^x. */
    format?: (val: number) => string;
    title?: string;
    help?: HelpEntry;
}

/** Pattrn-style value pill: editable for plain numeric sliders, display-only when formatted. */
const ValuePill: React.FC<{
    value: number;
    min: number;
    max: number;
    step: number;
    format?: (val: number) => string;
    onChange: (val: number) => void;
}> = ({ value, min, max, step, format, onChange }) => {
    const [draft, setDraft] = useState<string | null>(null);
    // reset any in-progress edit when the value changes from outside
    // (render-phase adjustment, per React's derived-state guidance)
    const [lastValue, setLastValue] = useState(value);
    if (value !== lastValue) {
        setLastValue(value);
        setDraft(null);
    }

    if (format) {
        return (
            <span className="px-2 py-0.5 min-w-12 text-center bg-cream-2 border border-ink rounded-md text-[11px] font-mono text-ink">
                {format(value)}
            </span>
        );
    }

    const commit = () => {
        if (draft === null) return;
        const n = parseFloat(draft);
        if (!Number.isNaN(n)) {
            const snapped = Math.round((n - min) / step) * step + min;
            onChange(Math.min(max, Math.max(min, snapped)));
        }
        setDraft(null);
    };

    return (
        <input
            value={draft ?? String(value)}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={e => {
                if (e.key === 'Enter') commit();
                if (e.key === 'Escape') setDraft(null);
            }}
            inputMode="numeric"
            className="px-2 py-0.5 w-14 text-right bg-cream-2 border border-ink rounded-md text-[11px] font-mono text-ink focus:outline-none focus:border-glx-orange"
        />
    );
};

export const Slider: React.FC<SliderProps> = ({ label, value, min, max, step = 1, onChange, format, title, help }) => {
    return (
        <MaybeTooltip help={help}>
        <div className="flex flex-col gap-1.5" title={help ? undefined : title}>
            <div className="flex justify-between items-center text-[10px] font-bold text-ink-2 uppercase tracking-wider">
                <span>{label}</span>
                <ValuePill value={value} min={min} max={max} step={step} format={format} onChange={onChange} />
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={e => onChange(parseFloat(e.target.value))}
                className="w-full h-1 cursor-pointer"
            />
        </div>
        </MaybeTooltip>
    );
};
