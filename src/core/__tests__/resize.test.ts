import { describe, it, expect } from 'vitest';
import { resampleImage, resampleMask, resizeCanvas, resizeCanvasMask, anchorOffset } from '../resize';

const gray = (w: number, h: number, vals: number[]) => {
    const d = new Uint8ClampedArray(w * h * 4);
    vals.forEach((v, i) => d.set([v, v, v, 255], i * 4));
    return new ImageData(d, w, h);
};
const lum = (img: ImageData) => Array.from({ length: img.width * img.height }, (_, i) => img.data[i * 4]);

describe('resample', () => {
    it('nearest doubles pixels exactly', () => {
        const out = resampleImage(gray(2, 1, [0, 200]), 4, 2, 'nearest');
        expect(lum(out)).toEqual([0, 0, 200, 200, 0, 0, 200, 200]);
    });

    it('smooth downscale box-averages', () => {
        const out = resampleImage(gray(4, 2, [0, 100, 200, 250, 0, 100, 200, 250]), 2, 1, 'smooth');
        expect(lum(out)).toEqual([50, 225]);
    });

    it('smooth upscale interpolates and keeps the ends', () => {
        const out = lum(resampleImage(gray(2, 1, [0, 200]), 8, 1, 'smooth'));
        expect(out[0]).toBe(0);
        expect(out[7]).toBe(200);
        for (let i = 1; i < 8; i++) expect(out[i]).toBeGreaterThanOrEqual(out[i - 1]);
    });

    it('masks resample like images', () => {
        expect(Array.from(resampleMask(new Uint8ClampedArray([255, 0]), 2, 1, 4, 1, 'nearest'))).toEqual([255, 255, 0, 0]);
    });

    it('same size is a no-op', () => {
        const img = gray(2, 2, [1, 2, 3, 4]);
        expect(resampleImage(img, 2, 2, 'smooth')).toBe(img);
    });
});

describe('canvas size', () => {
    it('anchor offsets', () => {
        expect(anchorOffset(10, 10, 20, 30, { x: 0.5, y: 1 })).toEqual([5, 20]);
        expect(anchorOffset(10, 10, 4, 4, { x: 0.5, y: 0.5 })).toEqual([-3, -3]);
    });

    it('extends with fill, centered', () => {
        const out = resizeCanvas(gray(1, 1, [100]), 3, 1, { x: 0.5, y: 0.5 }, [255, 0, 0, 255]);
        expect(Array.from(out.data)).toEqual([255, 0, 0, 255, 100, 100, 100, 255, 255, 0, 0, 255]);
    });

    it('crops from the top-left and bottom-right anchors', () => {
        const src = gray(3, 1, [10, 20, 30]);
        expect(lum(resizeCanvas(src, 1, 1, { x: 0, y: 0 }, [0, 0, 0, 0]))).toEqual([10]);
        expect(lum(resizeCanvas(src, 1, 1, { x: 1, y: 0 }, [0, 0, 0, 0]))).toEqual([30]);
    });

    it('masks: new area unselected', () => {
        expect(Array.from(resizeCanvasMask(new Uint8ClampedArray([255]), 1, 1, 2, 1, { x: 0, y: 0 }))).toEqual([255, 0]);
    });
});
