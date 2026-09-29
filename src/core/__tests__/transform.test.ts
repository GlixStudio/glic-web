import { describe, it, expect } from 'vitest';
import {
    IDENTITY_TRANSFORM,
    isIdentity,
    mapPoint,
    transformImage,
    transformMask,
    untransformMask,
    type LayerTransform,
} from '../transform';

const T = (p: Partial<LayerTransform>): LayerTransform => ({ ...IDENTITY_TRANSFORM, ...p });

/** w x h image where pixel (x, y) = [x, y, 7, 255] */
const coords = (w: number, h: number) => {
    const d = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d.set([x, y, 7, 255], (y * w + x) * 4);
    return new ImageData(d, w, h);
};
const px = (im: ImageData, x: number, y: number) => Array.from(im.data.slice((y * im.width + x) * 4, (y * im.width + x) * 4 + 4));

describe('layer transforms', () => {
    it('identity is recognised and leaves pixels alone', () => {
        expect(isIdentity(IDENTITY_TRANSFORM)).toBe(true);
        expect(isIdentity(T({ rotation: 360 }))).toBe(true);
        expect(isIdentity(T({ x: 1 }))).toBe(false);
        const im = coords(6, 4);
        expect(Array.from(transformImage(im, IDENTITY_TRANSFORM).data)).toEqual(Array.from(im.data));
    });

    it('translation moves pixels and uncovers transparency', () => {
        const out = transformImage(coords(6, 4), T({ x: 2, y: 1 }));
        expect(px(out, 2, 1)).toEqual([0, 0, 7, 255]);
        expect(px(out, 5, 3)).toEqual([3, 2, 7, 255]);
        expect(px(out, 0, 0)[3]).toBe(0);
        expect(px(out, 1, 3)[3]).toBe(0);
    });

    it('flipX mirrors about the centre', () => {
        const out = transformImage(coords(6, 4), T({ flipX: true }));
        expect(px(out, 0, 2)).toEqual([5, 2, 7, 255]);
        expect(px(out, 5, 0)).toEqual([0, 0, 7, 255]);
    });

    it('rotation by 90° is exact and clockwise on screen', () => {
        const out = transformImage(coords(4, 4), T({ rotation: 90 }));
        // the top-left source pixel ends up top-right
        expect(px(out, 3, 0)).toEqual([0, 0, 7, 255]);
        expect(px(out, 0, 0)).toEqual([0, 3, 7, 255]);
    });

    it('mapPoint agrees with where pixels land', () => {
        const p = mapPoint(T({ rotation: 90 }), 4, 4, 0.5, 0.5);
        expect(p.x).toBeCloseTo(3.5);
        expect(p.y).toBeCloseTo(0.5);
    });

    it('scaling down leaves a transparent border and keeps the centre', () => {
        const flat = new ImageData(new Uint8ClampedArray(16 * 16 * 4).fill(200), 16, 16);
        const out = transformImage(flat, T({ scale: 0.5 }));
        expect(px(out, 8, 8)).toEqual([200, 200, 200, 200]);
        expect(px(out, 0, 0)[3]).toBe(0);
    });

    it('masks move with the same map, and untransform undoes it', () => {
        const m = new Uint8ClampedArray(6 * 4);
        m[1 * 6 + 1] = 255;
        const t = T({ x: 2, y: 1 });
        const moved = transformMask(m, 6, 4, t);
        expect(moved[2 * 6 + 3]).toBe(255);
        expect(untransformMask(moved, 6, 4, t)[1 * 6 + 1]).toBe(255);
        const rot = T({ rotation: 90, flipY: true, x: 1 });
        const back = untransformMask(transformMask(m, 6, 4, rot), 6, 4, rot);
        expect(back[1 * 6 + 1]).toBe(255);
    });
});
