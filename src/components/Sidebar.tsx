import React, { useState } from 'react';
import { useApp } from '../core/AppContext';
import { GlobalSettings } from './GlobalSettings';
import { ChannelSettings } from './ChannelSettings';
import { ChannelMatrix } from './ChannelMatrix';
import { FiltersPanel } from './FiltersPanel';
import { TilesetPanel } from './TilesetPanel';
import { ActionBar } from './ActionBar';
import { Toggle } from './controls/Toggle';
import { HELP } from '../core/help';

export const Sidebar: React.FC = () => {
    const { separateChannels, setSeparateChannels } = useApp();
    const [activeTab, setActiveTab] = useState(0);

    const tabs = ['Global', 'Channels'];
    const tab = Math.min(activeTab, tabs.length - 1);

    // the sidebar only widens where the extra room is used: the channel matrix
    const wide = separateChannels && tab === 1;

    return (
        <div
            className={`${
                wide ? 'w-[30rem] max-w-[65vw]' : 'w-80'
            } max-w-[94vw] bg-cream border-r border-ink flex flex-col h-full z-20 transition-[width] duration-200`}
        >
            {/* segmented tabs, Pattrn style */}
            <div className="flex gap-1.5 p-2 border-b border-line bg-cream">
                {tabs.map((t, i) => (
                    <button
                        key={t}
                        data-tour={i === 1 ? 'tab-channels' : undefined}
                        className={`flex-1 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded-md border border-ink transition-colors ${
                            tab === i ? 'bg-glx-orange text-ink' : 'bg-cream-2 text-ink hover:bg-white'
                        }`}
                        onClick={() => setActiveTab(i)}
                    >
                        {t}
                    </button>
                ))}
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar bg-cream">
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
        </div>
    );
};
