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
            // 0 = no transform on that channel (e.g. a channel left untouched on purpose)
            for (const id of app!.config.transform_method) expect(id === 0 || isValidWaveletId(id), p.name).toBe(true);
        }
    });

    it('art-science presets carry a note, and never use RANDOM (they must re-perform exactly)', () => {
        for (const p of EXTRA_PRESETS.filter(e => e.note)) {
            const c = applyBuiltinPreset(p.name)!.config;
            expect(c.transform_method.every(v => v >= 0), p.name).toBe(true);
            expect(c.transform_type.every(v => v >= 0), p.name).toBe(true);
            expect(c.prediction_method.every(v => v !== -3), p.name).toBe(true);
        }
        expect(EXTRA_PRESETS.filter(e => e.note).length).toBeGreaterThanOrEqual(20);
    });

    it('each one uses at least one ~b- wavelet', () => {
        for (const p of EXTRA_PRESETS) {
            expect(p.config.transform_method!.some(id => id >= EXTRA_WAVELET_FIRST_ID), p.name).toBe(true);
        }
    });
});
