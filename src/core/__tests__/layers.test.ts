import { describe, it, expect } from 'vitest';
import { compositeLayers, makeLayer, makeAdjustmentLayer, layerRender, cloneLayer, type BlendMode } from '../layers';
import { makeEffect } from '../effects';
import { compositeWithMask, rectMask, feather } from '../selection';

const img = (w: number, h: number, rgba: [number, number, number, number]): ImageData => {
    const d = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) d.set(rgba, i * 4);
    return new ImageData(d, w, h);
};

const px = (im: ImageData, i = 0) => Array.from(im.data.slice(i * 4, i * 4 + 4));

describe('blend modes', () => {
    const cases: [BlendMode, [number, number, number], [number, number, number], [number, number, number]][] = [
        // [mode, layer rgb, base rgb, expected rgb]
        ['normal', [200, 10, 128], [50, 50, 50], [200, 10, 128]],
        ['multiply', [128, 255, 0], [128, 100, 200], [64, 100, 0]],
        ['screen', [128, 0, 255], [128, 100, 200], [192, 100, 255]],
        ['darken', [10, 200, 128], [50, 50, 128], [10, 50, 128]],
        ['lighten', [10, 200, 128], [50, 50, 128], [50, 200, 128]],
        ['difference', [200, 50, 0], [50, 200, 0], [150, 150, 0]],
        ['add', [200, 100, 0], [100, 100, 0], [255, 200, 0]],
        ['subtract', [50, 200, 0], [100, 100, 0], [50, 0, 0]],
        ['exclusion', [255, 0, 128], [100, 100, 0], [155, 100, 128]],
        ['divide', [255, 0, 128], [100, 0, 64], [100, 0, 128]],
        ['colorDodge', [0, 255, 128], [100, 100, 0], [100, 255, 0]],
        ['colorBurn', [255, 0, 128], [100, 100, 255], [100, 0, 255]],
        ['hardLight', [64, 200, 0], [128, 128, 0], [64, 200, 0]],
        ['linearLight', [128, 0, 255], [100, 200, 100], [101, 0, 255]],
    ];

    for (const [mode, layerRgb, baseRgb, expected] of cases) {
        it(mode, () => {
            const source = img(2, 2, [...baseRgb, 255] as [number, number, number, number]);
            const layer = makeLayer('L', img(2, 2, [...layerRgb, 255] as [number, number, number, number]));
            layer.blendMode = mode;
            const out = compositeLayers(source, [layer]);
            expect(px(out).slice(0, 3)).toEqual(expected);
        });
    }

    it('overlay: dark base doubles-multiplies, light base screens', () => {
        const source = img(2, 1, [0, 0, 0, 255]);
        source.data.set([64, 64, 64, 255], 0); // dark base
        source.data.set([200, 200, 200, 255], 4); // light base
        const layer = makeLayer('L', img(2, 1, [128, 128, 128, 255]));
        layer.blendMode = 'overlay';
        const out = compositeLayers(source, [layer]);
        expect(px(out, 0)[0]).toBe(Math.round((2 * 128 * 64) / 255)); // 64
        expect(px(out, 1)[0]).toBe(Math.round(255 - (2 * 127 * 55) / 255)); // 200
    });
});

describe('non-separable blend modes', () => {
    const lum = (p: number[]) => 0.3 * p[0] + 0.59 * p[1] + 0.11 * p[2];

    it('luminosity keeps the base hue, takes the layer lightness', () => {
        const source = img(1, 1, [200, 40, 40, 255]);
        const layer = makeLayer('L', img(1, 1, [30, 30, 30, 255]));
        layer.blendMode = 'luminosity';
        const out = px(compositeLayers(source, [layer]));
        expect(Math.abs(lum(out) - 30)).toBeLessThan(1.5);
        expect(out[0]).toBeGreaterThan(out[1]); // still red-dominant
    });

    it('color keeps the base lightness, takes the layer hue', () => {
        const source = img(1, 1, [120, 120, 120, 255]);
        const layer = makeLayer('L', img(1, 1, [0, 0, 255, 255]));
        layer.blendMode = 'color';
        const out = px(compositeLayers(source, [layer]));
        expect(Math.abs(lum(out) - 120)).toBeLessThan(1.5);
        expect(out[2]).toBeGreaterThan(out[0]);
    });

    it('saturation of a gray layer desaturates the base', () => {
        const source = img(1, 1, [200, 40, 40, 255]);
        const layer = makeLayer('L', img(1, 1, [90, 90, 90, 255]));
        layer.blendMode = 'saturation';
        const out = px(compositeLayers(source, [layer]));
        expect(out[0]).toBe(out[1]);
        expect(out[1]).toBe(out[2]);
    });

    it('softLight with mid-gray layer is identity', () => {
        const source = img(1, 1, [30, 128, 220, 255]);
        const layer = makeLayer('L', img(1, 1, [127.5, 127.5, 127.5, 255]));
        layer.blendMode = 'softLight';
        const out = px(compositeLayers(source, [layer]));
        expect(out.slice(0, 3).map((v, i) => Math.abs(v - [30, 128, 220][i]) <= 1)).toEqual([true, true, true]);
    });
});

describe('compositeLayers', () => {
    it('no layers returns the source', () => {
        const source = img(3, 3, [1, 2, 3, 255]);
        expect(Array.from(compositeLayers(source, []).data)).toEqual(Array.from(source.data));
    });

    it('hidden and zero-opacity layers are skipped', () => {
        const source = img(2, 2, [10, 10, 10, 255]);
        const a = makeLayer('a', img(2, 2, [200, 200, 200, 255]));
        a.visible = false;
        const b = makeLayer('b', img(2, 2, [250, 250, 250, 255]));
        b.opacity = 0;
        expect(px(compositeLayers(source, [a, b]))).toEqual([10, 10, 10, 255]);
    });

    it('mismatched dimensions are skipped', () => {
        const source = img(2, 2, [10, 10, 10, 255]);
        const wrong = makeLayer('w', img(3, 3, [200, 200, 200, 255]));
        expect(px(compositeLayers(source, [wrong]))).toEqual([10, 10, 10, 255]);
    });

    it('opacity 50 lands midway', () => {
        const source = img(2, 2, [100, 0, 0, 255]);
        const layer = makeLayer('L', img(2, 2, [200, 0, 0, 255]));
        layer.opacity = 50;
        expect(px(compositeLayers(source, [layer]))[0]).toBe(150);
    });

    it('mask restricts the layer to its region', () => {
        const source = img(4, 1, [0, 0, 0, 255]);
        const layer = makeLayer('L', img(4, 1, [200, 0, 0, 255]));
        layer.mask = rectMask(4, 1, 0, 0, 2, 1); // left two pixels
        const out = compositeLayers(source, [layer]);
        expect(px(out, 0)[0]).toBe(200);
        expect(px(out, 1)[0]).toBe(200);
        expect(px(out, 2)[0]).toBe(0);
        expect(px(out, 3)[0]).toBe(0);
    });

    it('stacks top layer over bottom layer', () => {
        const source = img(2, 1, [0, 0, 0, 255]);
        const bottom = makeLayer('b', img(2, 1, [100, 0, 0, 255]));
        const top = makeLayer('t', img(2, 1, [200, 0, 0, 255]));
        top.mask = rectMask(2, 1, 0, 0, 1, 1); // covers only pixel 0
        const out = compositeLayers(source, [bottom, top]);
        expect(px(out, 0)[0]).toBe(200); // top wins where masked
        expect(px(out, 1)[0]).toBe(100); // bottom shows elsewhere
    });

    it('single Normal/100% masked layer matches the old compositeWithMask exactly', () => {
        const w = 24;
        const h = 24;
        let s = 5;
        const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) & 0xff;
        const src = new Uint8ClampedArray(w * h * 4);
        const gli = new Uint8ClampedArray(w * h * 4);
        for (let i = 0; i < src.length; i++) {
            src[i] = rnd();
            gli[i] = rnd();
        }
        const source = new ImageData(src, w, h);
        const glitched = new ImageData(gli, w, h);
        const mask = feather(rectMask(w, h, 4, 4, 20, 20), w, h, 5); // soft values too

        const expected = compositeWithMask(source, glitched, mask);
        const layer = makeLayer('L', glitched);
        layer.mask = mask;
        const got = compositeLayers(source, [layer]);

        for (let i = 0; i < expected.data.length; i++) {
            expect(Math.abs(got.data[i] - expected.data[i]), `byte ${i}`).toBeLessThanOrEqual(1);
        }
    });
});

describe('layer memory budget', () => {
    it('allows many small layers, blocks past the budget', async () => {
        const { canAddLayer, layerUsageBytes, LAYER_MEMORY_BUDGET } = await import('../layers');
        const small = [makeLayer('a', img(8, 8, [0, 0, 0, 255]))];
        expect(layerUsageBytes(small)).toBe(8 * 8 * 4);
        expect(canAddLayer(small, 8, 8).ok).toBe(true);
        // fake a stack that already fills the budget (metadata-only check)
        const big = makeLayer('big', img(4, 4, [0, 0, 0, 255]));
        big.file = { byteLength: LAYER_MEMORY_BUDGET } as unknown as Uint8Array;
        expect(canAddLayer([big], 1024, 1024).ok).toBe(false);
        expect(canAddLayer([big], 1024, 1024).usedMB).toBeGreaterThan(0);
    });
});

describe('layer effects', () => {
    it('pixel layer effects apply before blending', () => {
        const source = img(2, 2, [0, 0, 0, 255]);
        const layer = makeLayer('L', img(2, 2, [10, 20, 30, 255]), { effects: [makeEffect('invert')] });
        expect(px(compositeLayers(source, [layer]))).toEqual([245, 235, 225, 255]);
    });

    it('the effected render is cached until the effects change', () => {
        const layer = makeLayer('L', img(2, 2, [10, 20, 30, 255]), { effects: [makeEffect('invert')] });
        const a = layerRender(layer);
        expect(layerRender({ ...layer, opacity: 40 })).toBe(a);
        const tweaked = { ...layer, effects: [makeEffect('posterize', { levels: 2 })] };
        expect(layerRender(tweaked)).not.toBe(a);
        expect(layerRender(makeLayer('plain', layer.result!))).toBe(layer.result);
    });

    it('adjustment layers affect everything below, not above', () => {
        const source = img(1, 1, [10, 10, 10, 255]);
        const adj = makeAdjustmentLayer('Invert', [makeEffect('invert')]);
        expect(px(compositeLayers(source, [adj]))).toEqual([245, 245, 245, 255]);
        const below = makeLayer('below', img(1, 1, [100, 0, 0, 255]));
        expect(px(compositeLayers(source, [below, adj]))).toEqual([155, 255, 255, 255]);
        const above = makeLayer('above', img(1, 1, [7, 7, 7, 255]));
        expect(px(compositeLayers(source, [below, adj, above]))).toEqual([7, 7, 7, 255]);
    });

    it('adjustment layers honor mask and opacity', () => {
        const source = img(2, 1, [100, 100, 100, 255]);
        const adj = makeAdjustmentLayer('Invert', [makeEffect('invert')], new Uint8ClampedArray([255, 0]));
        adj.opacity = 50;
        const out = compositeLayers(source, [adj]);
        expect(px(out, 0)[0]).toBe(128); // 100 -> 155 at 50%
        expect(px(out, 1)[0]).toBe(100);
    });

    it('an adjustment layer with no enabled effects is a no-op', () => {
        const source = img(1, 1, [1, 2, 3, 255]);
        const fx = makeEffect('invert');
        fx.enabled = false;
        expect(px(compositeLayers(source, [makeAdjustmentLayer('A', [fx])]))).toEqual([1, 2, 3, 255]);
    });

    it('cloneLayer gets a new id and an independent effect stack', () => {
        const layer = makeLayer('L', img(1, 1, [0, 0, 0, 255]), { effects: [makeEffect('blur')] });
        const copy = cloneLayer(layer, 'L copy');
        expect(copy.id).not.toBe(layer.id);
        copy.effects[0].params.radius = 9;
        expect(layer.effects[0].params.radius).toBe(2);
        expect(copy.result).toBe(layer.result);
    });
});
