import { describe, it, expect } from 'vitest';
import { EXTRA_PRESETS } from '../extraPresets';
import { applyBuiltinPreset, BUILTIN_PRESET_NAMES } from '../presets';
import { isValidWaveletId } from '../Wavelets';
import { EXTRA_WAVELET_FIRST_ID } from '../extraWavelets';

describe('~b- presets', () => {
    it('are listed after the original presets and resolve through applyBuiltinPreset', () => {
        const names = EXTRA_PRESETS.map(p => p.name);
        expect(BUILTIN_PRESET_NAMES.slice(-names.length)).toEqual(names);
        expect(new Set(BUILTIN_PRESET_NAMES).size).toBe(BUILTIN_PRESET_NAMES.length);
        for (const p of EXTRA_PRESETS) {
            expect(p.name.startsWith('~b- ')).toBe(true);
            const app = applyBuiltinPreset(p.name);
            expect(app).not.toBeNull();
            expect(app!.separateChannels).toBe(p.separateChannels);
            for (const id of app!.config.transform_method) expect(isValidWaveletId(id)).toBe(true);
        }
    });

    it('each one uses at least one ~b- wavelet', () => {
        for (const p of EXTRA_PRESETS) {
            expect(p.config.transform_method!.some(id => id >= EXTRA_WAVELET_FIRST_ID), p.name).toBe(true);
        }
    });
});
