import { describe, expect, it } from 'vitest';
import { CodecConfig } from '../../core/Codec';
import { COLORSPACES } from '../../core/ColorSpaces';
import type { Effect } from '../../core/effects';
import { autoTags, hasEncode, MAX_TAGS, toTag } from '../editorOutput';

const encoded = (patch: Partial<CodecConfig> = {}, extra: Partial<{ blendMode: string; effects: Effect[] }> = {}) => ({
    kind: 'pixel' as const,
    blendMode: (extra.blendMode ?? 'normal') as 'normal',
    effects: extra.effects ?? [],
    file: new Uint8Array([1]),
    resolved: Object.assign(new CodecConfig(), patch),
});
const pasted = { kind: 'pixel' as const, blendMode: 'normal' as const, effects: [], file: null, resolved: null };

describe('hasEncode', () => {
    it('needs a layer the codec made, not a pasted picture', () => {
        expect(hasEncode([])).toBe(false);
        expect(hasEncode([pasted])).toBe(false);
        expect(hasEncode([pasted, encoded()])).toBe(true);
    });
});

describe('autoTags', () => {
    it('names the preset, colour spaces, resolved wavelets, effects and blend modes', () => {
        const tags = autoTags(
            [
                encoded({ colorspace: COLORSPACES.HWB, transform_method: [44, 92, 0] }),
                encoded(
                    { colorspace: COLORSPACES.YCbCr, transform_method: [-1, 0, 0] },
                    { blendMode: 'colorDodge', effects: [{ id: 'e', type: 'pixelsort', enabled: true, params: {} } as unknown as Effect] }
                ),
            ],
            '~b- well tempered'
        );
        expect(tags[0]).toBe('well-tempered');
        expect(tags).toContain('hwb');
        expect(tags).toContain('ycbcr');
        expect(tags.filter(t => t === 'hwb')).toHaveLength(1);
        expect(tags).toContain('color-dodge');
        expect(tags.some(t => t.includes('sort'))).toBe(true);
        expect(tags.every(t => /^[\p{L}\p{N}_-]{1,32}$/u.test(t))).toBe(true);
        expect(tags.some(t => t.startsWith('b-'))).toBe(false);
    });

    it('stays within the API limit', () => {
        const many = Array.from({ length: 20 }, (_, i) => encoded({ colorspace: i % 16, transform_method: [i + 1, i + 2, i + 3] }));
        expect(autoTags(many, null).length).toBe(MAX_TAGS);
    });

    it('makes API-safe tags', () => {
        expect(toTag('~b- 4′33″')).toBe('b-4-33');
        expect(toTag('R-GGB-G')).toBe('r-ggb-g');
        expect(toTag('Daubechies 2')).toBe('daubechies-2');
    });
});
