import React from 'react';
import { useApp } from '../core/AppContext';
import { CodecConfig } from '../core/Codec';
import { getChannelNames } from '../core/ColorSpaces';
import { predict_name, MAX_PRED } from '../core/Predictions';
import { WAVELETNO, getWaveletDisplayName } from '../core/Wavelets';
import { Layers, Image as ImageIcon, Settings, Download, Copy } from 'lucide-react';
import { HELP, type HelpEntry } from '../core/help';
import { MaybeTooltip } from './controls/Tooltip';

// One page for all three channels: rows are parameters, columns are channels,
// labeled by what they carry in the active colorspace (mixer-style layout).

const CH_ACCENTS = ['text-rose-400', 'text-emerald-400', 'text-sky-400'];
const CH_DOTS = ['bg-rose-400', 'bg-emerald-400', 'bg-sky-400'];

const log2i = (v: number) => Math.round(Math.log2(Math.max(1, v)));

const PREDICTION_OPTIONS = [
    ...Array.from({ length: MAX_PRED }, (_, i) => ({ label: predict_name(i).replace('PRED_', ''), value: i })),
    { label: 'SAD', value: -1 },
    { label: 'BSAD', value: -2 },
    { label: 'RANDOM', value: -3 },
];

const WAVELET_OPTIONS = [
    { label: getWaveletDisplayName(0), value: 0 },
    ...Array.from({ length: WAVELETNO - 1 }, (_, i) => ({ label: getWaveletDisplayName(i + 1), value: i + 1 })),
    { label: 'Random', value: -1 },
];

const MSelect: React.FC<{
    value: number;
    options: { label: string; value: number }[];
    onChange: (v: number) => void;
    title?: string;
}> = ({ value, options, onChange, title }) => (
    <select
        value={String(value)}
        title={title}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full min-w-0 bg-zinc-900 border border-zinc-800 text-zinc-200 text-[11px] rounded-md px-1.5 py-1.5 focus:outline-none focus:border-blue-500 hover:border-zinc-700 transition-colors"
    >
        {options.map(o => (
            <option key={o.value} value={String(o.value)}>
                {o.label}
            </option>
        ))}
    </select>
);

const MSlider: React.FC<{
    value: number;
    min: number;
    max: number;
    step?: number;
    display: string;
    onChange: (v: number) => void;
}> = ({ value, min, max, step = 1, display, onChange }) => (
    <div className="flex flex-col gap-0.5 min-w-0">
        <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={e => onChange(parseFloat(e.target.value))}
            className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
        />
        <span className="text-[9px] text-zinc-500 font-mono text-center leading-none">{display}</span>
    </div>
);

const RowLabel: React.FC<{ children: React.ReactNode; help?: HelpEntry }> = ({ children, help }) => (
    <MaybeTooltip help={help}>
        <div className="text-[10px] text-zinc-400 font-medium uppercase tracking-wide pr-1 leading-tight cursor-help">
            {children}
        </div>
    </MaybeTooltip>
);

const SectionHeader: React.FC<{ icon: React.ReactNode; children: React.ReactNode }> = ({ icon, children }) => (
    <div className="col-span-4 flex items-center gap-2 text-zinc-400 uppercase text-[10px] font-bold tracking-wider pt-3 pb-1 border-b border-zinc-800/60">
        {icon} {children}
    </div>
);

export const ChannelMatrix: React.FC = () => {
    const { config, updateConfig, resolved } = useApp();
    const channelNames = getChannelNames(config.colorspace);

    const set = (ch: number, fn: (c: CodecConfig, i: number) => void) => updateConfig(c => fn(c, ch));

    const copyToOthers = (ch: number) =>
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

    // a per-channel slider/select row
    const sliders = (
        get: (ch: number) => number,
        min: number,
        max: number,
        display: (v: number) => string,
        apply: (c: CodecConfig, i: number, v: number) => void
    ) =>
        [0, 1, 2].map(ch => (
            <MSlider
                key={ch}
                value={get(ch)}
                min={min}
                max={max}
                display={display(get(ch))}
                onChange={v => set(ch, (c, i) => apply(c, i, v))}
            />
        ));

    const selects = (
        get: (ch: number) => number,
        options: { label: string; value: number }[],
        apply: (c: CodecConfig, i: number, v: number) => void
    ) =>
        [0, 1, 2].map(ch => (
            <MSelect key={ch} value={get(ch)} options={options} onChange={v => set(ch, (c, i) => apply(c, i, v))} />
        ));

    const hasRandom = [0, 1, 2].some(ch => config.transform_method[ch] === -1 || config.transform_type[ch] === -1);

    return (
        <div>
            {/* sticky channel header */}
            <div className="sticky top-0 z-10 bg-zinc-950 grid grid-cols-[5rem_repeat(3,1fr)] gap-x-2 pb-2 border-b border-zinc-800">
                <div className="text-[9px] text-zinc-600 self-end pb-0.5">CHANNEL</div>
                {[0, 1, 2].map(ch => (
                    <div key={ch} className="flex items-center justify-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${CH_DOTS[ch]}`} />
                        <span className={`text-sm font-black ${CH_ACCENTS[ch]}`}>{channelNames[ch]}</span>
                        <button
                            onClick={() => copyToOthers(ch)}
                            className="p-1 text-zinc-600 hover:text-zinc-300 transition-colors"
                            title={`Copy ${channelNames[ch]} settings to the other channels`}
                        >
                            <Copy className="w-3 h-3" />
                        </button>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-[5rem_repeat(3,1fr)] gap-x-2 gap-y-2.5 items-center">
                <SectionHeader icon={<Layers className="w-3 h-3" />}>Segmentation</SectionHeader>
                <RowLabel help={HELP.minBlock}>Min block</RowLabel>
                {sliders(ch => log2i(config.min_block_size[ch]), 1, 9, v => `${1 << v}px`, (c, i, v) => (c.min_block_size[i] = 1 << v))}
                <RowLabel help={HELP.maxBlock}>Max block</RowLabel>
                {sliders(ch => log2i(config.max_block_size[ch]), 1, 9, v => `${1 << v}px`, (c, i, v) => (c.max_block_size[i] = 1 << v))}
                <RowLabel help={HELP.threshold}>Threshold</RowLabel>
                {sliders(ch => Math.round(config.segmentation_precision[ch]), 5, 250, v => `${v}`, (c, i, v) => (c.segmentation_precision[i] = v))}

                <SectionHeader icon={<ImageIcon className="w-3 h-3" />}>Prediction</SectionHeader>
                <RowLabel help={HELP.prediction}>Method</RowLabel>
                {selects(ch => config.prediction_method[ch], PREDICTION_OPTIONS, (c, i, v) => (c.prediction_method[i] = v))}

                <SectionHeader icon={<Settings className="w-3 h-3" />}>Quantization</SectionHeader>
                <RowLabel help={HELP.quantization}>Value</RowLabel>
                {sliders(ch => config.quantization_value[ch], 0, 255, v => (v > 2 ? `÷${v / 2}` : 'off'), (c, i, v) => (c.quantization_value[i] = v))}
                <RowLabel help={HELP.clamping}>Clamp</RowLabel>
                {selects(
                    ch => config.clamp_method[ch],
                    [
                        { label: 'None', value: 0 },
                        { label: 'Mod 256', value: 1 },
                    ],
                    (c, i, v) => (c.clamp_method[i] = v)
                )}

                <SectionHeader icon={<Layers className="w-3 h-3" />}>Wavelet transform</SectionHeader>
                <RowLabel help={HELP.wavelet}>Wavelet</RowLabel>
                {selects(ch => config.transform_method[ch], WAVELET_OPTIONS, (c, i, v) => (c.transform_method[i] = v))}
                <RowLabel help={HELP.transformType}>Type</RowLabel>
                {selects(
                    ch => config.transform_type[ch],
                    [
                        { label: 'FWT', value: 0 },
                        { label: 'WPT', value: 1 },
                        { label: 'Random', value: -1 },
                    ],
                    (c, i, v) => (c.transform_type[i] = v)
                )}
                <RowLabel help={HELP.compression}>Compress</RowLabel>
                {sliders(ch => Math.round(config.transform_compress[ch]), 0, 255, v => `${v}`, (c, i, v) => (c.transform_compress[i] = v))}
                <RowLabel help={HELP.scale}>Scale</RowLabel>
                {sliders(ch => log2i(config.transform_scale[ch]), 2, 24, v => `2^${v}`, (c, i, v) => (c.transform_scale[i] = Math.pow(2, v)))}

                <SectionHeader icon={<Download className="w-3 h-3" />}>Final encoding</SectionHeader>
                <RowLabel help={HELP.encodingMethod}>Method</RowLabel>
                {selects(
                    ch => config.encoding_method[ch],
                    [
                        { label: 'RAW', value: 0 },
                        { label: 'PACKED', value: 1 },
                        { label: 'RLE', value: 2 },
                    ],
                    (c, i, v) => (c.encoding_method[i] = v)
                )}
            </div>

            {hasRandom && resolved && (
                <p className="text-[10px] text-zinc-500 italic mt-3 leading-relaxed">
                    last encode used:{' '}
                    {[0, 1, 2]
                        .map(
                            ch =>
                                `${channelNames[ch]}: ${getWaveletDisplayName(resolved.transform_method[ch])} ${
                                    resolved.transform_type[ch] === 1 ? 'WPT' : 'FWT'
                                }`
                        )
                        .join(' · ')}
                </p>
            )}
        </div>
    );
};
