import React, { useState } from 'react';
import { useApp } from '../core/AppContext';
import { DEFAULT_FILTERS } from '../core/filters';
import { Slider } from './controls/Slider';
import { Image as ImageIcon, ChevronDown, ChevronUp } from 'lucide-react';

export const FiltersPanel: React.FC = () => {
    const { processed, filters, setFilters } = useApp();
    const [expanded, setExpanded] = useState(true);

    if (!processed) return null;

    const update = (key: keyof typeof filters, value: number) => setFilters({ ...filters, [key]: value });

    return (
        <div className="border-t border-zinc-800 pt-4">
            <div className="w-full flex items-center justify-between mb-3">
                <button
                    onClick={() => setExpanded(e => !e)}
                    className="flex items-center gap-2 text-zinc-400 uppercase text-xs font-bold tracking-wider hover:text-zinc-300 transition-colors"
                >
                    <ImageIcon className="w-3 h-3" /> Adjustments
                    {expanded ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
                </button>
                <button
                    onClick={() => setFilters({ ...DEFAULT_FILTERS })}
                    className="px-2 py-1 text-[10px] font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-900 hover:bg-zinc-800 rounded border border-zinc-800 transition-all"
                >
                    Reset
                </button>
            </div>
            {expanded && (
                <div className="space-y-2">
                    <Slider label="Hue" value={filters.hue} min={-180} max={180} format={v => `${v}°`} onChange={v => update('hue', v)} />
                    <Slider label="Saturation" value={filters.saturation} min={0} max={200} format={v => `${v}%`} onChange={v => update('saturation', v)} />
                    <Slider label="Brightness" value={filters.brightness} min={0} max={200} format={v => `${v}%`} onChange={v => update('brightness', v)} />
                    <Slider label="Contrast" value={filters.contrast} min={0} max={200} format={v => `${v}%`} onChange={v => update('contrast', v)} />
                </div>
            )}
        </div>
    );
};
