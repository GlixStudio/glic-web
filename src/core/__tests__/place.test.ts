import { describe, it, expect } from 'vitest';
import { placeOnCanvas } from '../place';

const solid = (w: number, h: number, rgba: number[]) => {
    const d = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) d.set(rgba, i * 4);
    return new ImageData(d, w, h);
};

describe('placeOnCanvas', () => {
    it('centres a smaller image at its own size; the mask is its footprint', () => {
        const p = placeOnCanvas(solid(2, 2, [9, 8, 7, 255]), 6, 4);
        expect(p.scaled).toBe(false);
        expect(Array.from(p.result.data.slice((1 * 6 + 2) * 4, (1 * 6 + 2) * 4 + 4))).toEqual([9, 8, 7, 255]);
        expect(p.mask[1 * 6 + 2]).toBe(255);
        expect(p.mask[1 * 6 + 3]).toBe(255);
        expect(p.mask[0]).toBe(0);
        expect(p.mask.reduce((a, v) => a + (v > 0 ? 1 : 0), 0)).toBe(4);
    });

    it("keeps the image's own transparency in the mask", () => {
        const p = placeOnCanvas(solid(2, 2, [1, 2, 3, 100]), 2, 2);
        expect(p.mask[0]).toBe(100);
        expect(p.result.data[3]).toBe(255);
    });

    it('shrinks a larger image to fit, keeping proportions', () => {
        const p = placeOnCanvas(solid(8, 4, [5, 5, 5, 255]), 4, 4);
        expect(p.scaled).toBe(true);
        // 8x4 -> 4x2, centred vertically: rows 1..2 covered, rows 0 and 3 not
        expect(p.mask[0]).toBe(0);
        expect(p.mask[1 * 4]).toBe(255);
        expect(p.mask[3 * 4 + 3]).toBe(0);
    });
});
