// glic-web's own presets, built around the ~b- wavelets (see extraWavelets.ts).
// Names start with "~b-" so they sort after the original GLIC presets. Values are
// CodecConfig fields directly (not the ControlP5 slider indices of presets.json).

import { CodecConfig } from './Codec';

export interface ExtraPreset {
    name: string;
    separateChannels: boolean;
    config: Partial<CodecConfig>;
}

const tri = (v: number) => [v, v, v];

export const EXTRA_PRESETS: ExtraPreset[] = [
    {
        name: '~b- bleach bath',
        separateChannels: false,
        config: { colorspace: 9, transform_method: tri(72), quantization_value: tri(60), transform_compress: tri(30), prediction_method: tri(9), min_block_size: tri(2), max_block_size: tri(256) },
    },
    {
        name: '~b- rotor grid',
        separateChannels: false,
        config: { colorspace: 9, transform_method: tri(74), transform_type: tri(1), quantization_value: tri(25), prediction_method: tri(9), min_block_size: tri(2), max_block_size: tri(256) },
    },
    {
        name: '~b- static tv',
        separateChannels: false,
        config: { colorspace: 1, transform_method: tri(81), quantization_value: tri(60), prediction_method: tri(9), min_block_size: tri(8), max_block_size: tri(64), encoding_method: tri(2) },
    },
    {
        name: '~b- paik blocks',
        separateChannels: true,
        config: { colorspace: 0, transform_method: tri(76), quantization_value: tri(110), prediction_method: [9, 3, 15], min_block_size: tri(16), max_block_size: tri(128) },
    },
    {
        name: '~b- ghost blur',
        separateChannels: false,
        config: { colorspace: 8, transform_method: tri(77), quantization_value: tri(60), prediction_method: tri(9), min_block_size: tri(4), max_block_size: tri(256) },
    },
    {
        name: '~b- morlet moire',
        separateChannels: false,
        config: { colorspace: 3, transform_method: tri(80), transform_type: tri(1), quantization_value: tri(50), prediction_method: tri(9) },
    },
    {
        name: '~b- bior storm',
        separateChannels: false,
        config: { colorspace: 15, transform_method: tri(68), quantization_value: tri(110), transform_compress: tri(30), prediction_method: tri(9), min_block_size: tri(4), max_block_size: tri(64) },
    },
    {
        name: '~b- slant wreck',
        separateChannels: false,
        config: { colorspace: 1, transform_method: tri(82), quantization_value: tri(60), prediction_method: tri(9), min_block_size: tri(2), max_block_size: tri(32) },
    },
    {
        name: '~b- fade out',
        separateChannels: false,
        config: { colorspace: 11, transform_method: tri(73), quantization_value: tri(40), transform_compress: tri(60), clamp_method: tri(1), prediction_method: tri(9), min_block_size: tri(2), max_block_size: tri(256) },
    },
    {
        name: '~b- sinc smear',
        separateChannels: false,
        config: { colorspace: 4, transform_method: tri(79), quantization_value: tri(20), transform_compress: tri(100), prediction_method: tri(9), min_block_size: tri(8), max_block_size: tri(256) },
    },
    {
        name: '~b- spline soft',
        separateChannels: false,
        config: { colorspace: 7, transform_method: tri(78), transform_type: tri(1), quantization_value: tri(30), prediction_method: tri(9), min_block_size: tri(4), max_block_size: tri(128) },
    },
    {
        name: '~b- tri-channel',
        separateChannels: true,
        config: { colorspace: 1, transform_method: [72, 75, 69], quantization_value: [40, 40, 110], transform_compress: [60, 60, 30], prediction_method: [9, 9, 9], min_block_size: tri(2), max_block_size: tri(256) },
    },
    {
        name: '~b- lattice noir',
        separateChannels: false,
        config: { colorspace: 14, transform_method: tri(71), quantization_value: tri(12), transform_compress: tri(200), prediction_method: tri(9), min_block_size: tri(2), max_block_size: tri(256) },
    },
    {
        name: '~b- rotor wash',
        separateChannels: false,
        config: { colorspace: 6, transform_method: tri(75), quantization_value: tri(40), transform_compress: tri(60), prediction_method: tri(9), min_block_size: tri(4), max_block_size: tri(128), transform_scale: tri(1 << 8) },
    },
];

export const applyExtraPreset = (name: string): { config: CodecConfig; separateChannels: boolean } | null => {
    const p = EXTRA_PRESETS.find(e => e.name === name);
    if (!p) return null;
    const config = new CodecConfig();
    Object.assign(config, p.config);
    return { config, separateChannels: p.separateChannels };
};
