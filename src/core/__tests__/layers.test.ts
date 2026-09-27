import { describe, it, expect } from 'vitest';
import { compositeLayers, makeLayer, type BlendMode } from '../layers';
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
