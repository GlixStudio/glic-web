import React from 'react';

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
}

export const Slider: React.FC<SliderProps> = ({ label, value, min, max, step = 1, onChange, format, title }) => {
    return (
        <div className="flex flex-col gap-1.5" title={title}>
            <div className="flex justify-between text-xs font-medium text-zinc-400 uppercase tracking-wider">
                <span>{label}</span>
                <span className="text-zinc-200 font-mono">{format ? format(value) : value}</span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={e => onChange(parseFloat(e.target.value))}
                className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500 hover:accent-blue-400 transition-all"
            />
        </div>
    );
};
