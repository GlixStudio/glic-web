// Loading of the bundled GLIC presets (converted from the original's serialized
// ControlP5 GUI state) and user presets (localStorage).
//
// The JSON stores raw GUI controller values, so the mapping follows the original
// readValues() exactly:
//  - ch{i}pred / ch{i}trans / ch{i}encoding are LIST INDICES, not values:
//      prediction index 0..15 -> same value, 16 -> SAD(-1), 17 -> BSAD(-2), 18 -> RANDOM(-3)
//      wavelet index 0 -> NONE(0), 1..67 -> same id, 68 -> RANDOM(-1)
//  - ch{i}min/max are exponents: size = 1 << trunc(v)
//  - ch{i}scale is an exponent: scale = trunc(2^v)  (v may be fractional)
//  - ch{i}clamp / ch{i}transtype are radio-button one-hot arrays
//  - separate_channels off means channel 0's settings drive all three channels

import presetsData from './presets.json';
import { CodecConfig } from './Codec';
import { EXTRA_PRESETS, applyExtraPreset } from './extraPresets';
import { storageKey } from './storage';

type RawPreset = Record<string, number | number[]>;

export interface PresetApplication {
    config: CodecConfig;
    separateChannels: boolean;
}

export const BUILTIN_PRESET_NAMES: string[] = [
    ...Object.keys(presetsData).sort(),
    ...EXTRA_PRESETS.map(e => e.name),
];

const num = (p: RawPreset, key: string, def: number): number => {
    const v = p[key];
    return typeof v === 'number' ? v : def;
};

const predFromIndex = (idx: number): number => {
    if (idx >= 0 && idx <= 15) return idx;
    if (idx === 16) return -1; // PRED_SAD
    if (idx === 17) return -2; // PRED_BSAD
    if (idx === 18) return -3; // PRED_RANDOM
    return 0;
};

const waveletFromIndex = (idx: number): number => {
    if (idx >= 0 && idx <= 67) return idx;
    if (idx === 68) return -1; // RANDOM
    return 0;
};

export const applyBuiltinPreset = (name: string): PresetApplication | null => {
    const extra = applyExtraPreset(name);
    if (extra) return extra;
    const p = (presetsData as Record<string, RawPreset>)[name];
    if (!p) return null;

    const config = new CodecConfig();
    config.colorspace = Math.trunc(num(p, 'colorspace', 9));
    const r = Math.trunc(num(p, 'color_outside_r', 128));
    const g = Math.trunc(num(p, 'color_outside_g', 128));
    const b = Math.trunc(num(p, 'color_outside_b', 128));
    config.color_outside = ((0xff << 24) | ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff)) >>> 0;

    const sepArr = p['separate_channels'];
    const separateChannels = Array.isArray(sepArr) && (sepArr[0] ?? 0) > 0.5;

    for (let i = 0; i < 3; i++) {
        // when "separate channels" was off, the original applied channel 0 everywhere
        const ch = separateChannels ? i : 0;

        config.min_block_size[i] = 1 << Math.trunc(num(p, `ch${ch}min`, 1));
        config.max_block_size[i] = 1 << Math.trunc(num(p, `ch${ch}max`, 8));
        config.segmentation_precision[i] = num(p, `ch${ch}thr`, 15);

        config.prediction_method[i] = predFromIndex(Math.trunc(num(p, `ch${ch}pred`, 7)));
        config.quantization_value[i] = Math.trunc(num(p, `ch${ch}quant`, 0));

        const clampArr = p[`ch${ch}clamp`];
        config.clamp_method[i] = Array.isArray(clampArr) && (clampArr[1] ?? 0) > 0.5 ? 1 : 0;

        const ttArr = p[`ch${ch}transtype`];
        if (Array.isArray(ttArr) && ttArr.length >= 3) {
            config.transform_type[i] = ttArr[2] > 0.5 ? -1 : ttArr[1] > 0.5 ? 1 : 0;
        } else {
            config.transform_type[i] = 0;
        }

        config.transform_method[i] = waveletFromIndex(Math.trunc(num(p, `ch${ch}trans`, 0)));
        config.transform_compress[i] = num(p, `ch${ch}compress`, 0);
        config.transform_scale[i] = Math.trunc(Math.pow(2, num(p, `ch${ch}scale`, 20)));
        config.encoding_method[i] = Math.trunc(num(p, `ch${ch}encoding`, 0));
    }

    return { config, separateChannels };
};

// --- custom presets (localStorage) ---

export interface StoredPreset {
    config: CodecConfig;
    separateChannels: boolean;
}

const STORAGE_KEY = storageKey('custom_presets_v2');

export const loadCustomPresets = (): Record<string, StoredPreset> => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw) as Record<string, StoredPreset>;
        const result: Record<string, StoredPreset> = {};
        for (const [name, sp] of Object.entries(parsed)) {
            result[name] = {
                config: Object.assign(new CodecConfig(), sp.config),
                separateChannels: !!sp.separateChannels,
            };
        }
        return result;
    } catch {
        return {};
    }
};

export const saveCustomPresets = (presets: Record<string, StoredPreset>) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
};

export const exportPresetsJson = (presets: Record<string, StoredPreset>): string =>
    JSON.stringify(presets, null, 2);

export const importPresetsJson = (json: string): Record<string, StoredPreset> => {
    const parsed = JSON.parse(json) as Record<string, StoredPreset>;
    const result: Record<string, StoredPreset> = {};
    for (const [name, sp] of Object.entries(parsed)) {
        if (!sp || typeof sp !== 'object' || !sp.config) continue;
        result[name] = {
            config: Object.assign(new CodecConfig(), sp.config),
            separateChannels: !!sp.separateChannels,
        };
    }
    return result;
};
