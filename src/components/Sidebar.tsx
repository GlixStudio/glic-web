import React, { useState } from 'react';
import { useApp } from '../core/AppContext';
import { GlobalSettings } from './GlobalSettings';
import { ChannelSettings } from './ChannelSettings';
import { ChannelMatrix } from './ChannelMatrix';
import { FiltersPanel } from './FiltersPanel';
import { TilesetPanel } from './TilesetPanel';
import { ActionBar } from './ActionBar';
import { AboutModal } from './AboutModal';
import { Toggle } from './controls/Toggle';
import { HELP } from '../core/help';
import { Info } from 'lucide-react';

export const Sidebar: React.FC = () => {
    const { separateChannels, setSeparateChannels } = useApp();
    const [activeTab, setActiveTab] = useState(0);
    const [showAbout, setShowAbout] = useState(false);

    const tabs = ['Global', 'Channels'];
    const tab = Math.min(activeTab, tabs.length - 1);

    // the sidebar only widens where the extra room is used: the channel matrix
    const wide = separateChannels && tab === 1;

    return (
        <div
            className={`${
                wide ? 'w-[30rem] max-w-[65vw]' : 'w-80'
            } max-w-[94vw] bg-zinc-950 border-r border-zinc-900 flex flex-col h-full shadow-2xl z-20 transition-[width] duration-200`}
        >
            <div className="px-5 py-4 border-b border-zinc-900 bg-zinc-950 flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-black text-white tracking-tighter">
                        <span className="text-blue-500">GLIC</span> WEB
                    </h1>
                    <p className="text-[11px] text-zinc-500">GLitch Image Codec</p>
                </div>
                <button
                    className="p-2 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 transition-all"
                    onClick={() => setShowAbout(true)}
                    title="About & keyboard shortcuts"
                >
                    <Info className="w-4 h-4" />
                </button>
            </div>

            <div className="flex border-b border-zinc-900 bg-zinc-950/50">
                {tabs.map((t, i) => (
                    <button
                        key={t}
                        className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider transition-all ${
                            tab === i
                                ? 'text-blue-500 border-b-2 border-blue-500 bg-zinc-900/50'
                                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/30'
                        }`}
                        onClick={() => setActiveTab(i)}
                    >
                        {t}
                    </button>
                ))}
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar bg-zinc-950">
                <div className="p-4 space-y-4">
                    {tab === 0 ? (
                        <GlobalSettings />
                    ) : (
                        <>
                            <Toggle
                                label="Separate channels"
                                help={HELP.separateChannels}
                                checked={separateChannels}
                                onChange={setSeparateChannels}
                            />
                            {separateChannels ? <ChannelMatrix /> : <ChannelSettings />}
                        </>
                    )}

                    <FiltersPanel />
                    <TilesetPanel />
                </div>
            </div>

            <ActionBar />

            <AboutModal open={showAbout} onClose={() => setShowAbout(false)} />
        </div>
    );
};
