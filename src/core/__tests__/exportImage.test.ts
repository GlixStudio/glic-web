import { describe, it, expect } from 'vitest';
import { deflateSync } from 'node:zlib';
import { setPngDpi, getPngDpi, setJpegDpi, maskBounds, cropImage, applyMaskAlpha, printSize } from '../exportImage';

// minimal valid 1x1 PNG built by hand
const tinyPng = (): Uint8Array => {
    const crcT = new Uint32Array(256).map((_, n) => {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        return c >>> 0;
    });
    const crc = (b: Uint8Array) => {
        let c = 0xffffffff;
        for (const x of b) c = crcT[(c ^ x) & 0xff] ^ (c >>> 8);
        return (c ^ 0xffffffff) >>> 0;
    };
    const chunk = (type: string, data: Uint8Array) => {
        const o = new Uint8Array(12 + data.length);
        const dv = new DataView(o.buffer);
        dv.setUint32(0, data.length);
        o.set([...type].map(c => c.charCodeAt(0)), 4);
        o.set(data, 8);
        dv.setUint32(8 + data.length, crc(o.subarray(4, 8 + data.length)));
        return o;
    };
    const ihdr = new Uint8Array([0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]);
    const idat = new Uint8Array(deflateSync(Buffer.from([0, 255, 0, 0])));
    const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', new Uint8Array())];
    const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
    let o = 0;
    for (const p of parts) {
        out.set(p, o);
        o += p.length;
    }
    return out;
};

describe('DPI metadata', () => {
    it('adds and replaces pHYs in a PNG', () => {
        const png = tinyPng();
        expect(getPngDpi(png)).toBeNull();
        const a = setPngDpi(png, 300);
        expect(getPngDpi(a)).toBe(300);
        const b = setPngDpi(a, 150);
        expect(getPngDpi(b)).toBe(150);
        expect(b.length).toBe(a.length); // replaced, not appended
    });

    it('rejects non-PNG input', () => {
        expect(() => setPngDpi(new Uint8Array(40), 300)).toThrow();
    });

    it('patches the JFIF density', () => {
        const jfif = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
        const out = setJpegDpi(jfif, 300);
        expect([out[13], (out[14] << 8) | out[15], (out[16] << 8) | out[17]]).toEqual([1, 300, 300]);
        expect(jfif[13]).toBe(0); // input untouched
    });

    it('print size', () => {
        expect(printSize(3000, 300).inches).toBe(10);
        expect(printSize(300, 300).cm).toBeCloseTo(2.54);
    });
});

describe('selection helpers', () => {
    it('bounds, crop, alpha', () => {
        const mask = new Uint8ClampedArray([0, 0, 0, 0, 255, 128, 0, 0, 0]);
        expect(maskBounds(mask, 3, 3)).toEqual({ x: 1, y: 1, w: 2, h: 1 });
        expect(maskBounds(new Uint8ClampedArray(4), 2, 2)).toBeNull();
        const img = new ImageData(new Uint8ClampedArray(9 * 4).map((_, i) => (i % 4 === 3 ? 255 : i)), 3, 3);
        const c = cropImage(img, 1, 1, 2, 1);
        expect(Array.from(c.data.subarray(0, 3))).toEqual([16, 17, 18]);
        const a = applyMaskAlpha(img, mask);
        expect([a.data[3], a.data[4 * 4 + 3], a.data[5 * 4 + 3]]).toEqual([0, 255, 128]);
    });
});
