import React, { useState } from 'react';
import { useApp } from '../core/AppContext';
import { HELP, type HelpEntry } from '../core/help';
import { Tooltip } from './controls/Tooltip';
import { isNarrowWidth } from '../core/viewport';
import { useTourReveal } from '../core/tour';
import { LayersPanel } from './LayersPanel';
import { MasksPanel } from './MasksPanel';
import { Layers, SquareDashed, ChevronUp, Combine } from 'lucide-react';

type Tab = 'layers' | 'masks';

/** Right-hand floating dock: Layers and the Masks library as tabs. */
export const Dock: React.FC = () => {
    const { originalImage, layers, masks, flatten } = useApp();
    const [tab, setTab] = useState<Tab>('layers');
    // tablets in portrait and phones: start as a pill so the image stays visible
    const [collapsed, setCollapsed] = useState(isNarrowWidth);
    useTourReveal(what => {
        if (what !== 'dock-layers' && what !== 'dock-masks') return;
        setCollapsed(false);
        setTab(what === 'dock-masks' ? 'masks' : 'layers');
    });

    if (!originalImage) return null;

    const stop = {
        onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
        onPointerUp: (e: React.PointerEvent) => e.stopPropagation(),
    };

    if (collapsed) {
        return (
            <button
                onClick={() => setCollapsed(false)}
                {...stop}
                className="absolute right-4 top-16 z-10 flex items-center gap-1.5 px-3 py-1.5 bg-cream-2 border border-ink rounded-lg text-xs text-ink hover:bg-white transition-colors"
                title="Show layers & masks"
            >
                <Layers className="w-3.5 h-3.5" /> {layers.length} · <SquareDashed className="w-3.5 h-3.5" /> {masks.length}
            </button>
        );
    }

    const tabBtn = (id: Tab, icon: React.ReactNode, label: string, count: number, help: HelpEntry) => (
        <Tooltip help={help}>
            <button
                onClick={() => setTab(id)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-colors ${
                    tab === id ? 'bg-glx-orange text-ink' : 'text-ink-2 hover:text-ink'
                }`}
            >
                {icon} {label}
                <span className="font-mono">{count}</span>
            </button>
        </Tooltip>
    );

    return (
        <div
            data-tour="dock"
            className="absolute right-2 sm:right-4 top-16 z-10 w-[min(18rem,calc(100%-1rem))] bg-cream border border-ink rounded-lg flex flex-col max-h-[75%]"
            {...stop}
        >
            <div className="flex items-center justify-between px-1.5 py-1 border-b border-line">
                <div data-tour="dock-tabs" className="flex items-center gap-0.5">
                    {tabBtn('layers', <Layers className="w-3 h-3" />, 'Layers', layers.length, HELP.layersPanel)}
                    {tabBtn('masks', <SquareDashed className="w-3 h-3" />, 'Masks', masks.length, HELP.masksPanel)}
                </div>
                <div className="flex items-center gap-0.5">
                    {tab === 'layers' && layers.length > 0 && (
                        <Tooltip help={HELP.flatten}>
                            <button onClick={flatten} className="p-1 text-ink-2 hover:text-ink transition-colors">
                                <Combine className="w-3.5 h-3.5" />
                            </button>
                        </Tooltip>
                    )}
                    <button onClick={() => setCollapsed(true)} className="p-1 text-ink-2 hover:text-ink transition-colors" title="Collapse">
                        <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>
            {tab === 'layers' ? <LayersPanel /> : <MasksPanel />}
        </div>
    );
};
