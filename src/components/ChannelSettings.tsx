import React from 'react';
import { useApp } from '../core/AppContext';
import { Slider } from './controls/Slider';
import { Select } from './controls/Select';
import { predict_name, MAX_PRED } from '../core/Predictions';
import { WAVELETNO, getWaveletDisplayName } from '../core/Wavelets';
import { Layers, Image as ImageIcon, Settings, Download, Copy } from 'lucide-react';

const log2i = (v: number) => Math.round(Math.log2(Math.max(1, v)));

// prediction options in the original GUI order: 0..15, then SAD, BSAD, RANDOM
const PREDICTION_OPTIONS = [
    ...Array.from({ length: MAX_PRED }, (_, i) => ({ label: predict_name(i), value: i })),
    { label: predict_name(-1), value: -1 },
    { label: predict_name(-2), value: -2 },
    { label: predict_name(-3), value: -3 },
];

const WAVELET_OPTIONS = [
    { label: getWaveletDisplayName(0), value: 0 },
    ...Array.from({ length: WAVELETNO - 1 }, (_, i) => ({ label: getWaveletDisplayName(i + 1), value: i + 1 })),
    { label: getWaveletDisplayName(-1), value: -1 },
];

interface Props {
    /** channel to display; with separateChannels off, edits go to all channels */
    ch: number;
    applyToAll: boolean;
}

export const ChannelSettings: React.FC<Props> = ({ ch, applyToAll }) => {
    const { config, updateConfig, resolved } = useApp();

    const set = (fn: (c: typeof config, i: number) => void) =>
        updateConfig(c => {
            if (applyToAll) {
                for (let i = 0; i < 3; i++) fn(c, i);
            } else {
                fn(c, ch);
            }
        });

    const copyToOthers = () =>
        updateConfig(c => {
            for (let i = 0; i < 3; i++) {
                if (i === ch) continue;
                c.min_block_size[i] = c.min_block_size[ch];
                c.max_block_size[i] = c.max_block_size[ch];
                c.segmentation_precision[i] = c.segmentation_precision[ch];
                c.prediction_method[i] = c.prediction_method[ch];
                c.quantization_value[i] = c.quantization_value[ch];
                c.clamp_method[i] = c.clamp_method[ch];
                c.transform_type[i] = c.transform_type[ch];
                c.transform_method[i] = c.transform_method[ch];
                c.transform_compress[i] = c.transform_compress[ch];
                c.transform_scale[i] = c.transform_scale[ch];
                c.encoding_method[i] = c.encoding_method[ch];
            }
        });

    const resolvedNote =
        resolved &&
        (config.transform_method[ch] === -1 || config.transform_type[ch] === -1) &&
        `last encode used: ${getWaveletDisplayName(resolved.transform_method[ch])} / ${
            resolved.transform_type[ch] === 1 ? 'WPT' : 'FWT'
        }`;

    return (
        <div className="flex flex-col gap-3">
            {!applyToAll && (
                <button
                    onClick={copyToOthers}
                    className="flex items-center justify-center gap-2 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-900 hover:bg-zinc-800 rounded-lg border border-zinc-800 transition-all"
                    title="Copy this channel's settings to the other two channels"
                >
                    <Copy className="w-3 h-3" /> Copy to other channels
                </button>
            )}

            {/* Segmentation */}
            <div className="space-y-2.5 p-3 bg-zinc-900/50 rounded-lg border border-zinc-800/50">
                <div className="flex items-center gap-2 text-zinc-400 uppercase text-xs font-bold tracking-wider mb-2">
                    <Layers className="w-3 h-3" /> Segmentation
                </div>
                <Slider
                    label="Min block"
                    value={log2i(config.min_block_size[ch])}
                    min={1}
                    max={9}
                    step={1}
                    format={v => `${1 << v}px`}
                    onChange={v => set((c, i) => (c.min_block_size[i] = 1 << v))}
                />
                <Slider
                    label="Max block"
                    value={log2i(config.max_block_size[ch])}
                    min={1}
                    max={9}
                    step={1}
                    format={v => `${1 << v}px`}
                    onChange={v => set((c, i) => (c.max_block_size[i] = 1 << v))}
                />
                <Slider
                    label="Threshold"
                    value={Math.round(config.segmentation_precision[ch])}
                    min={5}
                    max={250}
                    title="Lower splits more aggressively into small blocks"
                    onChange={v => set((c, i) => (c.segmentation_precision[i] = v))}
                />
            </div>

            {/* Prediction */}
            <div className="space-y-2.5 p-3 bg-zinc-900/50 rounded-lg border border-zinc-800/50">
                <div className="flex items-center gap-2 text-zinc-400 uppercase text-xs font-bold tracking-wider mb-2">
                    <ImageIcon className="w-3 h-3" /> Prediction
                </div>
                <Select
                    label="Method"
                    value={config.prediction_method[ch]}
                    options={PREDICTION_OPTIONS}
                    onChange={v => set((c, i) => (c.prediction_method[i] = v))}
                />
            </div>

            {/* Quantization */}
            <div className="space-y-2.5 p-3 bg-zinc-900/50 rounded-lg border border-zinc-800/50">
                <div className="flex items-center gap-2 text-zinc-400 uppercase text-xs font-bold tracking-wider mb-2">
                    <Settings className="w-3 h-3" /> Quantization
                </div>
                <Slider
                    label="Value"
                    value={config.quantization_value[ch]}
                    min={0}
                    max={255}
                    format={v => (v > 2 ? `${v} (÷${v / 2})` : `${v} (off)`)}
                    title="Residuals are divided by value/2 before encoding"
                    onChange={v => set((c, i) => (c.quantization_value[i] = v))}
                />
                <Select
                    label="Clamping"
                    value={config.clamp_method[ch]}
                    options={[
                        { label: 'None (-255..255)', value: 0 },
                        { label: 'Mod 256', value: 1 },
                    ]}
                    onChange={v => set((c, i) => (c.clamp_method[i] = v))}
                />
            </div>

            {/* Transformation */}
            <div className="space-y-2.5 p-3 bg-zinc-900/50 rounded-lg border border-zinc-800/50">
                <div className="flex items-center gap-2 text-zinc-400 uppercase text-xs font-bold tracking-wider mb-2">
                    <Layers className="w-3 h-3" /> Wavelet transform
                </div>
                <Select
                    label="Wavelet"
                    value={config.transform_method[ch]}
                    options={WAVELET_OPTIONS}
                    onChange={v => set((c, i) => (c.transform_method[i] = v))}
                />
                <Select
                    label="Type"
                    value={config.transform_type[ch]}
                    options={[
                        { label: 'FWT (fast wavelet)', value: 0 },
                        { label: 'WPT (wavelet packet)', value: 1 },
                        { label: 'Random', value: -1 },
                    ]}
                    onChange={v => set((c, i) => (c.transform_type[i] = v))}
                />
                {resolvedNote && <p className="text-[10px] text-zinc-500 italic">{resolvedNote}</p>}
                <Slider
                    label="Compression"
                    value={Math.round(config.transform_compress[ch])}
                    min={0}
                    max={255}
                    title="Zeroes small wavelet coefficients (0 = off)"
                    onChange={v => set((c, i) => (c.transform_compress[i] = v))}
                />
                <Slider
                    label="Scale"
                    value={log2i(config.transform_scale[ch])}
                    min={2}
                    max={24}
                    step={1}
                    format={v => `2^${v}`}
                    title="Coefficient storage scale - lower is heavier degradation"
                    onChange={v => set((c, i) => (c.transform_scale[i] = Math.pow(2, v)))}
                />
            </div>

            {/* Encoding */}
            <div className="space-y-2.5 p-3 bg-zinc-900/50 rounded-lg border border-zinc-800/50">
                <div className="flex items-center gap-2 text-zinc-400 uppercase text-xs font-bold tracking-wider mb-2">
                    <Download className="w-3 h-3" /> Final encoding
                </div>
                <Select
                    label="Method"
                    value={config.encoding_method[ch]}
                    options={[
                        { label: 'RAW', value: 0 },
                        { label: 'PACKED', value: 1 },
                        { label: 'RLE', value: 2 },
                    ]}
                    onChange={v => set((c, i) => (c.encoding_method[i] = v))}
                />
            </div>
        </div>
    );
};
