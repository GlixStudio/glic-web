import React, { useRef, useState } from 'react';
import { useApp } from '../core/AppContext';
import { Select } from './controls/Select';
import { cloneConfig } from '../core/Codec';
import {
    BUILTIN_PRESET_NAMES,
    applyBuiltinPreset,
    loadCustomPresets,
    saveCustomPresets,
    exportPresetsJson,
    importPresetsJson,
    type StoredPreset,
} from '../core/presets';
import { Save, Trash2, Upload, Download } from 'lucide-react';
import { downloadBlob, timestampedFilename } from '../core/imageio';

export const PresetManager: React.FC = () => {
    const { config, setConfig, separateChannels, setSeparateChannels, toast } = useApp();
    const [selected, setSelected] = useState<string>('');
    const [custom, setCustom] = useState<Record<string, StoredPreset>>(() => loadCustomPresets());
    const [saveName, setSaveName] = useState('');
    const [showSave, setShowSave] = useState(false);
    const importInputRef = useRef<HTMLInputElement>(null);

    const apply = (name: string) => {
        setSelected(name);
        if (!name) return;

        if (custom[name]) {
            setConfig(cloneConfig(custom[name].config));
            setSeparateChannels(custom[name].separateChannels);
            return;
        }
        const res = applyBuiltinPreset(name);
        if (res) {
            setConfig(res.config);
            setSeparateChannels(res.separateChannels);
        }
    };

    const savePreset = () => {
        const name = saveName.trim();
        if (!name) return;
        const next = { ...custom, [name]: { config: cloneConfig(config), separateChannels } };
        setCustom(next);
        saveCustomPresets(next);
        setSelected(name);
        setShowSave(false);
        setSaveName('');
        toast('success', `Preset “${name}” saved`);
    };

    const deletePreset = () => {
        if (!custom[selected]) return;
        const next = { ...custom };
        delete next[selected];
        setCustom(next);
        saveCustomPresets(next);
        toast('info', `Preset “${selected}” deleted`);
        setSelected('');
    };

    const exportPresets = () => {
        if (Object.keys(custom).length === 0) {
            toast('info', 'No custom presets to export');
            return;
        }
        downloadBlob(new Blob([exportPresetsJson(custom)], { type: 'application/json' }), timestampedFilename('glic-presets', 'json'));
    };

    const importPresets = (file: File) => {
        file.text()
            .then(text => {
                const imported = importPresetsJson(text);
                const count = Object.keys(imported).length;
                if (!count) {
                    toast('error', 'No presets found in file');
                    return;
                }
                const next = { ...custom, ...imported };
                setCustom(next);
                saveCustomPresets(next);
                toast('success', `Imported ${count} preset${count > 1 ? 's' : ''}`);
            })
            .catch(() => toast('error', 'Could not parse preset file'));
    };

    const options = [
        { label: '— select preset —', value: '' },
        ...Object.keys(custom)
            .sort()
            .map(k => ({ label: `★ ${k}`, value: k })),
        ...BUILTIN_PRESET_NAMES.map(k => ({ label: k, value: k })),
    ];

    return (
        <div className="space-y-2">
            <div className="flex gap-2 items-end">
                <div className="flex-1 min-w-0">
                    <Select label="Preset" value={selected} options={options} onChange={apply} />
                </div>
                <button
                    onClick={() => setShowSave(s => !s)}
                    className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg border border-zinc-700 transition-colors"
                    title="Save current settings as preset"
                >
                    <Save className="w-4 h-4" />
                </button>
                {custom[selected] && (
                    <button
                        onClick={deletePreset}
                        className="p-2 bg-zinc-800 hover:bg-red-900/60 text-zinc-300 hover:text-red-300 rounded-lg border border-zinc-700 transition-colors"
                        title="Delete this custom preset"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                )}
            </div>

            {showSave && (
                <div className="flex gap-2">
                    <input
                        autoFocus
                        value={saveName}
                        onChange={e => setSaveName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && savePreset()}
                        placeholder="Preset name"
                        className="flex-1 min-w-0 bg-zinc-900 border border-zinc-700 text-zinc-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
                    />
                    <button
                        onClick={savePreset}
                        disabled={!saveName.trim()}
                        className="px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white text-sm font-bold rounded-lg transition-colors"
                    >
                        Save
                    </button>
                </div>
            )}

            <div className="flex gap-2 text-[11px]">
                <button
                    onClick={exportPresets}
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 text-zinc-400 hover:text-zinc-200 bg-zinc-900 hover:bg-zinc-800 rounded border border-zinc-800 transition-all"
                >
                    <Download className="w-3 h-3" /> Export
                </button>
                <button
                    onClick={() => importInputRef.current?.click()}
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 text-zinc-400 hover:text-zinc-200 bg-zinc-900 hover:bg-zinc-800 rounded border border-zinc-800 transition-all"
                >
                    <Upload className="w-3 h-3" /> Import
                </button>
                <input
                    ref={importInputRef}
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) importPresets(f);
                        e.target.value = '';
                    }}
                />
            </div>
        </div>
    );
};
