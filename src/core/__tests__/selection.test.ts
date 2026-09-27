import { describe, it, expect } from 'vitest';
import {
    rectMask,
    ellipseMask,
    lassoMask,
    magicWand,
    brushStamp,
    combine,
    invertMask,
    isEmptyMask,
    coverage,
    feather,
    compositeWithMask,
    maskOverlay,
    luminanceMask,
    maskToImageData,
    newMask,
} from '../selection';

describe('rectMask', () => {
    it('fills the rectangle regardless of corner order and clamps to image', () => {
        const m = rectMask(10, 10, 8, 8, 2, 2);
        expect(m[3 * 10 + 3]).toBe(255);
        expect(m[1 * 10 + 1]).toBe(0);
        const clamped = rectMask(10, 10, -5, -5, 4, 4);
        expect(clamped[0]).toBe(255);
        expect(coverage(clamped)).toBeCloseTo(16 / 100, 5);
    });
});

describe('ellipseMask', () => {
    it('selects center, not corners', () => {
        const m = ellipseMask(20, 20, 0, 0, 20, 20);
        expect(m[10 * 20 + 10]).toBe(255);
        expect(m[0]).toBe(0);
        expect(m[19]).toBe(0);
    });
});

describe('lassoMask', () => {
    it('fills a triangle', () => {
        const m = lassoMask(20, 20, [
            { x: 1, y: 1 },
            { x: 18, y: 1 },
            { x: 1, y: 18 },
        ]);
        expect(m[3 * 20 + 3]).toBe(255); // inside
        expect(m[18 * 20 + 18]).toBe(0); // outside hypotenuse
        expect(isEmptyMask(m)).toBe(false);
    });

    it('needs at least 3 points', () => {
        expect(isEmptyMask(lassoMask(10, 10, [{ x: 1, y: 1 }, { x: 5, y: 5 }]))).toBe(true);
    });
});

const twoRegionImage = (): ImageData => {
    // left half black, right half white, one gray pixel at (0,0)
    const w = 10;
    const h = 4;
    const d = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const v = x < 5 ? 0 : 255;
            const o = (y * w + x) * 4;
            d[o] = d[o + 1] = d[o + 2] = v;
            d[o + 3] = 255;
        }
    }
    d[0] = d[1] = d[2] = 128;
    return new ImageData(d, w, h);
};

describe('magicWand', () => {
    it('contiguous flood stays within the clicked region', () => {
        const img = twoRegionImage();
        const m = magicWand(img, 2, 2, 10, true);
        expect(m[2 * 10 + 2]).toBe(255); // black side
        expect(m[2 * 10 + 7]).toBe(0); // white side
        expect(m[0]).toBe(0); // gray pixel outside tolerance
    });

    it('non-contiguous selects all matching pixels', () => {
        const img = twoRegionImage();
        const m = magicWand(img, 7, 2, 10, false);
        expect(m[2 * 10 + 7]).toBe(255);
        expect(m[2 * 10 + 2]).toBe(0);
    });

    it('tolerance widens the match', () => {
        const img = twoRegionImage();
        const m = magicWand(img, 2, 0, 200, true);
        expect(m[0]).toBe(255); // gray now within tolerance and connected
    });
});

describe('brushStamp', () => {
    it('paints and erases a disc', () => {
        const m = newMask(20, 20);
        brushStamp(m, 20, 20, 10, 10, 4, false);
        expect(m[10 * 20 + 10]).toBe(255);
        expect(m[0]).toBe(0);
        brushStamp(m, 20, 20, 10, 10, 2, true);
        expect(m[10 * 20 + 10]).toBe(0);
        expect(m[10 * 20 + 13]).toBeGreaterThan(0); // ring remains
    });
});

describe('combine / invert', () => {
    const a = rectMask(10, 10, 0, 0, 5, 10);
    const b = rectMask(10, 10, 3, 0, 8, 10);

    it('add is union', () => {
        const m = combine(a, b, 'add');
        expect(m[4]).toBe(255); // x=4 in a
        expect(m[7]).toBe(255); // x=7 in b
        expect(m[9]).toBe(0);
    });

    it('subtract removes', () => {
        const m = combine(a, b, 'subtract');
        expect(m[1]).toBe(255);
        expect(m[4]).toBe(0);
    });

    it('replace ignores base; invert is involutive', () => {
        const m = combine(a, b, 'replace');
        expect(Array.from(m)).toEqual(Array.from(b));
        expect(Array.from(invertMask(invertMask(a)))).toEqual(Array.from(a));
    });
});

describe('feather', () => {
    it('softens edges symmetrically and keeps interior solid', () => {
        const m = rectMask(40, 40, 10, 10, 30, 30);
        const f = feather(m, 40, 40, 6);
        expect(f[20 * 40 + 20]).toBe(255); // deep interior
        expect(f[20 * 40 + 10]).toBeGreaterThan(0);
        expect(f[20 * 40 + 10]).toBeLessThan(255); // softened edge
        expect(f[20 * 40 + 9]).toBeLessThan(f[20 * 40 + 11]); // falls off outward
        // horizontal symmetry
        expect(Math.abs(f[20 * 40 + 8] - f[20 * 40 + 31])).toBeLessThanOrEqual(2);
    });

    it('radius 0 is identity', () => {
        const m = rectMask(10, 10, 2, 2, 8, 8);
        expect(Array.from(feather(m, 10, 10, 0))).toEqual(Array.from(m));
    });
});

describe('compositeWithMask', () => {
    it('lerps between source and glitched', () => {
        const w = 2;
        const h = 1;
        const src = new ImageData(new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 255]), w, h);
        const gli = new ImageData(new Uint8ClampedArray([200, 100, 50, 255, 200, 100, 50, 255]), w, h);
        const mask = new Uint8ClampedArray([255, 0]);
        const out = compositeWithMask(src, gli, mask);
        expect(Array.from(out.data.slice(0, 4))).toEqual([200, 100, 50, 255]); // selected
        expect(Array.from(out.data.slice(4, 8))).toEqual([0, 0, 0, 255]); // untouched
    });
});

describe('mask import/export helpers', () => {
    it('luminanceMask maps white/black/alpha correctly', () => {
        const d = new Uint8ClampedArray([
            255, 255, 255, 255, // white -> 255
            0, 0, 0, 255, // black -> 0
            255, 255, 255, 0, // transparent white -> 0
            255, 255, 255, 128, // half-transparent white -> ~128
        ]);
        const m = luminanceMask(new ImageData(d, 4, 1));
        expect(m[0]).toBe(255);
        expect(m[1]).toBe(0);
        expect(m[2]).toBe(0);
        expect(Math.abs(m[3] - 128)).toBeLessThanOrEqual(1);
    });

    it('maskToImageData -> luminanceMask round-trips exactly', () => {
        const m = feather(rectMask(16, 16, 4, 4, 12, 12), 16, 16, 4);
        const back = luminanceMask(maskToImageData(m, 16, 16));
        for (let i = 0; i < m.length; i++) {
            expect(Math.abs(back[i] - m[i]), `idx ${i}`).toBeLessThanOrEqual(1);
        }
    });
});

describe('maskOverlay', () => {
    it('marks interior with tint and boundary with edge color', () => {
        const m = rectMask(10, 10, 2, 2, 8, 8);
        const o = maskOverlay(m, 10, 10);
        const at = (x: number, y: number) => Array.from(o.data.slice((y * 10 + x) * 4, (y * 10 + x) * 4 + 4));
        expect(at(2, 2)[3]).toBe(230); // edge alpha
        expect(at(2, 2)[0]).toBe(255); // edge is white
        expect(at(5, 5)[2]).toBe(246); // interior blue tint
        expect(at(0, 0)[3]).toBe(0); // outside transparent
    });
});
