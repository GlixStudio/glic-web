import { describe, it, expect } from 'vitest';
import { EFFECTS, applyEffects, makeEffect, effectsKey, gaussianBlur, type EffectType } from '../effects';

const img = (w: number, h: number, fn: (x: number, y: number) => [number, number, number]): ImageData => {
    const d = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            d.set([...fn(x, y), 255], (y * w + x) * 4);
        }
    return new ImageData(d, w, h);
};

const px = (im: ImageData, x: number, y = 0) => Array.from(im.data.slice((y * im.width + x) * 4, (y * im.width + x) * 4 + 4));
const run = (type: EffectType, im: ImageData, params = {}) => applyEffects(im, [makeEffect(type, params)]);

const gradient = img(16, 8, x => [x * 16, 255 - x * 16, (x * 37) % 256]);

describe('effects registry', () => {
    it('every effect keeps size, alpha, and never mutates its input', () => {
        for (const def of EFFECTS) {
            const src = img(9, 7, (x, y) => [x * 20, y * 30, (x * y * 7) % 256]);
            const before = Array.from(src.data);
            const out = run(def.type, src);
            expect(out.width, def.type).toBe(9);
            expect(out.height, def.type).toBe(7);
            expect(Array.from(src.data), `${def.type} mutated input`).toEqual(before);
            expect(out.data).not.toBe(src.data);
            for (let i = 3; i < out.data.length; i += 4) expect(out.data[i], def.type).toBe(255);
        }
    });

    it('defaults fill every declared param', () => {
        for (const def of EFFECTS) {
            const fx = makeEffect(def.type);
            for (const p of def.params) expect(fx.params[p.key], `${def.type}.${p.key}`).toBe(p.default);
        }
    });

    it('disabled effects and empty stacks pass the image through', () => {
        const fx = makeEffect('invert');
        fx.enabled = false;
        expect(applyEffects(gradient, [fx])).toBe(gradient);
        expect(applyEffects(gradient, [])).toBe(gradient);
    });

    it('effectsKey ignores ids and disabled effects', () => {
        const a = makeEffect('blur', { radius: 3 });
        const b = makeEffect('blur', { radius: 3 });
        const off = makeEffect('invert');
        off.enabled = false;
        expect(effectsKey([a])).toBe(effectsKey([b, off]));
        expect(effectsKey([a])).not.toBe(effectsKey([makeEffect('blur', { radius: 4 })]));
    });
});

describe('adjustments', () => {
    it('neutral brightness/contrast, hue/sat and levels are identity', () => {
        for (const t of ['brightnessContrast', 'hueSaturation', 'levels'] as const) {
            const out = run(t, gradient);
            for (let i = 0; i < out.data.length; i++) expect(Math.abs(out.data[i] - gradient.data[i]), t).toBeLessThanOrEqual(1);
        }
    });

    it('invert', () => {
        expect(px(run('invert', img(1, 1, () => [10, 200, 255])), 0)).toEqual([245, 55, 0, 255]);
    });

    it('posterize to 2 levels snaps to black/white', () => {
        expect(px(run('posterize', img(2, 1, x => (x ? [200, 200, 200] : [60, 60, 60])), { levels: 2 }), 0)).toEqual([0, 0, 0, 255]);
        expect(px(run('posterize', img(2, 1, x => (x ? [200, 200, 200] : [60, 60, 60])), { levels: 2 }), 1)).toEqual([255, 255, 255, 255]);
    });

    it('threshold splits on luma', () => {
        const out = run('threshold', img(2, 1, x => (x ? [200, 200, 200] : [60, 60, 60])), { level: 128 });
        expect(px(out, 0)).toEqual([0, 0, 0, 255]);
        expect(px(out, 1)).toEqual([255, 255, 255, 255]);
    });

    it('levels input range stretches', () => {
        const out = run('levels', img(1, 1, () => [100, 50, 150]), { inBlack: 50, inWhite: 150 });
        expect(px(out, 0)).toEqual([128, 0, 255, 255]);
    });

    it('hue +120 rotates red to green; saturation -100 goes gray', () => {
        expect(px(run('hueSaturation', img(1, 1, () => [255, 0, 0]), { hue: 120 }), 0)).toEqual([0, 255, 0, 255]);
        const g = px(run('hueSaturation', img(1, 1, () => [200, 40, 90]), { saturation: -100 }), 0);
        expect(g[0]).toBe(g[1]);
        expect(g[1]).toBe(g[2]);
    });
});

describe('filters', () => {
    it('blur preserves a flat field and softens an edge', () => {
        const flat = img(12, 12, () => [90, 90, 90]);
        expect(px(gaussianBlur(flat, 3), 5, 5)).toEqual([90, 90, 90, 255]);
        const edge = img(20, 1, x => (x < 10 ? [0, 0, 0] : [255, 255, 255]));
        const b = gaussianBlur(edge, 2);
        expect(b.data[9 * 4]).toBeGreaterThan(0);
        expect(b.data[10 * 4]).toBeLessThan(255);
    });

    it('unsharp mask increases edge contrast', () => {
        const edge = img(20, 1, x => (x < 10 ? [100, 100, 100] : [150, 150, 150]));
        const s = run('sharpen', edge, { amount: 200, radius: 2 });
        expect(s.data[9 * 4]).toBeLessThan(100);
        expect(s.data[10 * 4]).toBeGreaterThan(150);
    });

    it('noise is deterministic per seed', () => {
        const a = run('noise', gradient, { seed: 5 });
        const b = run('noise', gradient, { seed: 5 });
        const c = run('noise', gradient, { seed: 6 });
        expect(Array.from(a.data)).toEqual(Array.from(b.data));
        expect(Array.from(a.data)).not.toEqual(Array.from(c.data));
    });

    it('mosaic averages each cell', () => {
        const out = run('pixelate', img(2, 1, x => (x ? [200, 0, 0] : [0, 0, 100])), { size: 2 });
        expect(px(out, 0)).toEqual([100, 0, 50, 255]);
        expect(px(out, 1)).toEqual([100, 0, 50, 255]);
    });

    it('vignette leaves the center and darkens corners', () => {
        const flat = img(21, 21, () => [200, 200, 200]);
        const out = run('vignette', flat, { amount: 80, size: 20 });
        expect(px(out, 10, 10)).toEqual([200, 200, 200, 255]);
        expect(out.data[0]).toBeLessThan(60);
    });
});

describe('glitch effects', () => {
    it('rgb split moves red and blue, keeps green', () => {
        const src = img(5, 1, x => (x === 2 ? [255, 255, 255] : [0, 0, 0]));
        const out = run('rgbShift', src, { redX: 1, redY: 0, blueX: -1, blueY: 0 });
        expect(px(out, 3)).toEqual([255, 0, 0, 255]);
        expect(px(out, 1)).toEqual([0, 0, 255, 255]);
        expect(px(out, 2)).toEqual([0, 255, 0, 255]);
    });

    it('pixel sort orders an in-range run by brightness', () => {
        const vals = [200, 100, 150, 120];
        const src = img(4, 1, x => [vals[x], vals[x], vals[x]]);
        const out = run('pixelSort', src, { low: 0, high: 255 });
        expect([0, 1, 2, 3].map(x => px(out, x)[0])).toEqual([100, 120, 150, 200]);
        const rev = run('pixelSort', src, { low: 0, high: 255, order: 1 });
        expect([0, 1, 2, 3].map(x => px(rev, x)[0])).toEqual([200, 150, 120, 100]);
    });

    it('pixel sort leaves out-of-range pixels in place', () => {
        const vals = [250, 100, 50, 10];
        const src = img(4, 1, x => [vals[x], vals[x], vals[x]]);
        const out = run('pixelSort', src, { low: 20, high: 240 });
        expect([0, 1, 2, 3].map(x => px(out, x)[0])).toEqual([250, 50, 100, 10]);
    });

    it('scanlines darken every nth row', () => {
        const out = run('scanlines', img(2, 4, () => [200, 200, 200]), { spacing: 2, thickness: 1, intensity: 50 });
        expect(px(out, 0, 0)[0]).toBe(100);
        expect(px(out, 0, 1)[0]).toBe(200);
    });

    it('slice shift is a per-row permutation', () => {
        const src = img(32, 32, (x, y) => [x * 8, y * 8, 0]);
        const out = run('sliceShift', src, { amount: 50, height: 4, density: 100, seed: 3 });
        let moved = 0;
        for (let y = 0; y < 32; y++) {
            const row = (im: ImageData) => Array.from({ length: 32 }, (_, x) => px(im, x, y)[0]).sort((a, b) => a - b);
            expect(row(out)).toEqual(row(src));
            if (px(out, 0, y)[0] !== px(src, 0, y)[0]) moved++;
        }
        expect(moved).toBeGreaterThan(0);
    });
});
