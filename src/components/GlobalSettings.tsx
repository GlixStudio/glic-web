import React from 'react';
import { useApp } from '../core/AppContext';
import { Select } from './controls/Select';
import { Toggle } from './controls/Toggle';
import { COLORSPACES, getColorSpaceName } from '../core/ColorSpaces';
import { PresetManager } from './PresetManager';
import { Settings } from 'lucide-react';

export const GlobalSettings: React.FC = () => {
    const { config, updateConfig, separateChannels, setSeparateChannels } = useApp();

    return (
        <div className="flex flex-col gap-4">
            <div className="space-y-3">
                <div className="flex items-center gap-2 text-zinc-400 uppercase text-xs font-bold tracking-wider mb-2">
                    <Settings className="w-3 h-3" /> Global
                </div>
                <PresetManager />
                <Select
                    label="Color space"
                    value={config.colorspace}
                    options={Object.values(COLORSPACES).map(v => ({ label: getColorSpaceName(v as number), value: v as number }))}
                    onChange={v => updateConfig(c => (c.colorspace = v))}
                />
                <Toggle
                    label="Separate channels"
                    checked={separateChannels}
                    onChange={setSeparateChannels}
                    title="Off: one set of settings drives all three channels. On: tune each channel individually."
                />
            </div>
        </div>
    );
};
