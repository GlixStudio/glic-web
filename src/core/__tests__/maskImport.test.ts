import { describe, it, expect } from 'vitest';
import { extractMask, placeMask, DEFAULT_DEFINITION, DEFAULT_PLACEMENT, fitFactors } from '../maskImport';
import { combine } from '../selection';

const img = (w: number, h: number, px: [number, number, number, number][]) => {
    const d = new Uint8ClampedArray(w * h * 4);
    px.forEach((p, i) => d.set(p, i * 4));
    return new ImageData(d, w, h);
};

describe('extractMask', () => {
    const four = img(2, 2, [
        [255, 255, 255, 255],
        [0, 0, 0, 255],
        [255, 0, 0, 255],
        [255, 255, 255, 0],
    ]);

    it('luminance respects alpha by default', () => {
        expect(Array.from(extractMask(four, DEFAULT_DEFINITION))).toEqual([255, 0, 54, 0]);
        expect(Array.from(extractMask(four, { ...DEFAULT_DEFINITION, useAlpha: false }))[3]).toBe(255);
    });

    it('alpha, channel and invert sources', () => {
        expect(Array.from(extractMask(four, { ...DEFAULT_DEFINITION, source: 'alpha' }))).toEqual([255, 255, 255, 0]);
        expect(Array.from(extractMask(four, { ...DEFAULT_DEFINITION, source: 'red', useAlpha: false }))).toEqual([255, 0, 255, 255]);
        expect(Array.from(extractMask(four, { ...DEFAULT_DEFINITION, invert: true, useAlpha: false }))).toEqual([0, 255, 201, 0]);
    });

    it('color match with tolerance, softness and threshold', () => {
        const def = { ...DEFAULT_DEFINITION, source: 'color' as const, color: [255, 0, 0] as [number, number, number], tolerance: 10, softness: 0 };
        expect(Array.from(extractMask(four, def))).toEqual([0, 0, 255, 0]);
        const g = img(3, 1, [
            [100, 100, 100, 255],
            [110, 100, 100, 255],
            [200, 100, 100, 255],
        ]);
        const soft = extractMask(g, { ...DEFAULT_DEFINITION, source: 'color', color: [100, 100, 100], tolerance: 0, softness: 40 });
        expect(soft[0]).toBe(255);
        expect(soft[1]).toBeGreaterThan(0);
        expect(soft[1]).toBeLessThan(255);
        expect(soft[2]).toBe(0);
    });

    it('levels and threshold', () => {
        const g = img(3, 1, [
            [50, 50, 50, 255],
            [128, 128, 128, 255],
            [200, 200, 200, 255],
        ]);
        expect(Array.from(extractMask(g, { ...DEFAULT_DEFINITION, black: 50, white: 200 }))).toEqual([0, 133, 255]);
        expect(Array.from(extractMask(g, { ...DEFAULT_DEFINITION, threshold: 128 }))).toEqual([0, 255, 255]);
    });
});

describe('placeMask', () => {
    const src = new Uint8ClampedArray([255, 0, 0, 0]); // 2x2, top-left on

    it('stretch at identity size is a copy', () => {
        expect(Array.from(placeMask(src, 2, 2, 2, 2, DEFAULT_PLACEMENT))).toEqual([255, 0, 0, 0]);
    });

    it('stretch to 4x4 keeps the top-left quadrant on', () => {
        const out = placeMask(src, 2, 2, 4, 4, DEFAULT_PLACEMENT);
        expect(out[0]).toBe(255);
        expect(out[15]).toBe(0);
    });

    it('flips and rotations move the lit corner', () => {
        expect(Array.from(placeMask(src, 2, 2, 2, 2, { ...DEFAULT_PLACEMENT, flipX: true }))).toEqual([0, 255, 0, 0]);
        expect(Array.from(placeMask(src, 2, 2, 2, 2, { ...DEFAULT_PLACEMENT, flipY: true }))).toEqual([0, 0, 255, 0]);
        // 90° clockwise: top-left goes to top-right
        expect(Array.from(placeMask(src, 2, 2, 2, 2, { ...DEFAULT_PLACEMENT, rotation: 90 }))).toEqual([0, 255, 0, 0]);
        expect(Array.from(placeMask(src, 2, 2, 2, 2, { ...DEFAULT_PLACEMENT, rotation: 180 }))).toEqual([0, 0, 0, 255]);
    });

    it('offset and half scale leave the outside empty, tile repeats', () => {
        const full = new Uint8ClampedArray(4).fill(255);
        const half = placeMask(full, 2, 2, 8, 8, { ...DEFAULT_PLACEMENT, scale: 0.5 });
        expect(half[0]).toBe(0);
        expect(half[4 * 8 + 4]).toBe(255);
        const tiled = placeMask(src, 2, 2, 4, 4, { ...DEFAULT_PLACEMENT, fit: 'none', tile: true });
        // the tile phase is anchored at the canvas center
        expect([tiled[5], tiled[7], tiled[13], tiled[15]]).toEqual([255, 255, 255, 255]);
        expect(tiled[0]).toBe(0);
        const moved = placeMask(src, 2, 2, 2, 2, { ...DEFAULT_PLACEMENT, offsetX: 1, fit: 'none' });
        expect(Array.from(moved)).toEqual([0, 255, 0, 0]);
    });

    it('a preview at half resolution matches the full placement downsampled', () => {
        const big = new Uint8ClampedArray(16 * 16);
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) big[y * 16 + x] = x < 8 ? 255 : 0;
        const p = { ...DEFAULT_PLACEMENT, fit: 'none' as const, offsetX: 4 };
        const full = placeMask(big, 16, 16, 32, 32, p);
        const prev = placeMask(big, 16, 16, 16, 16, p, 0.5);
        // left edge of the lit area: full at x = 8+4 = 12, preview at 6
        expect(full[16 * 32 + 11]).toBe(0);
        expect(full[16 * 32 + 12]).toBe(255);
        expect(prev[8 * 16 + 5]).toBe(0);
        expect(prev[8 * 16 + 6]).toBe(255);
    });

    it('fit factors', () => {
        expect(fitFactors('contain', 100, 50, 200, 200)).toEqual([2, 2]);
        expect(fitFactors('cover', 100, 50, 200, 200)).toEqual([4, 4]);
        expect(fitFactors('stretch', 100, 50, 200, 200)).toEqual([2, 4]);
    });
});

describe('combine intersect', () => {
    it('keeps the minimum', () => {
        const a = new Uint8ClampedArray([255, 100, 0]);
        const b = new Uint8ClampedArray([50, 255, 255]);
        expect(Array.from(combine(a, b, 'intersect'))).toEqual([50, 100, 0]);
    });
});
