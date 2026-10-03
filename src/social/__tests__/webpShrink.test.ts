// The upload shrinker against the real libwebp (the same WASM the browser worker
// loads): lossless must round-trip bit for bit, lossy must decode at the right
// size, and nothing comes back over the target.

import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import encode, { init as initEncode } from '@jsquash/webp/encode.js';
import decode, { init as initDecode } from '@jsquash/webp/decode.js';
import { identical, makePreview, psnr, shrinkToWebp, type WebpCodec } from '../webpShrink';

const wasm = (p: string) => WebAssembly.compile(readFileSync(`node_modules/@jsquash/webp/codec/${p}`));
const codec: WebpCodec = { encode: (img, o) => encode(img, o), decode: b => decode(b) };

beforeAll(async () => {
    await initEncode(await wasm('enc/webp_enc_simd.wasm'));
    await initDecode(await wasm('dec/webp_dec.wasm'));
});

/** seeded noise so every run sees the same image */
const noise = (w: number, h: number, seed = 1, alpha = false) => {
    const d = new Uint8ClampedArray(w * h * 4);
    // mulberry32
    let s = seed >>> 0;
    const next = () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) & 255;
    };
    for (let i = 0; i < d.length; i++) d[i] = (i & 3) === 3 && !alpha ? 255 : next();
    return new ImageData(d, w, h);
};

/** banded "glitch": hard edges, few colours, compresses well losslessly */
const bands = (w: number, h: number) => {
    const d = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            const b = ((x >> 3) ^ (y >> 5)) & 7;
            d[i] = b * 36;
            d[i + 1] = (b * 91) & 255;
            d[i + 2] = 255 - b * 30;
            // semi-transparent strip: premultiplication would round these
            d[i + 3] = x < 16 ? 37 : 255;
        }
    return new ImageData(d, w, h);
};

/** photo-like: smooth gradients with film grain and shifted glitch blocks */
const grainy = (w: number, h: number) => {
    const d = new Uint8ClampedArray(w * h * 4);
    let s = 99;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) * 12;
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            const blk = ((x >> 5) * 7 + (y >> 4) * 13) % 11 === 0 ? 40 : 0;
            d[i] = 128 + 100 * Math.sin(x / 90) + rnd() + blk;
            d[i + 1] = 128 + 90 * Math.cos(y / 70) + rnd();
            d[i + 2] = (x + y) / 9 + rnd() - blk;
            d[i + 3] = 255;
        }
    return new ImageData(d, w, h);
};

describe('shrinkToWebp', () => {
    it('keeps a compressible image lossless and bit-identical, alpha included', async () => {
        const img = bands(640, 480);
        const r = await shrinkToWebp(img, 200_000, codec);
        expect(r.mode).toBe('lossless');
        expect(r.bytes.byteLength).toBeLessThanOrEqual(200_000);
        expect(identical(await decode(r.bytes.buffer as ArrayBuffer), img)).toBe(true);
    });

    it('prefers near-lossless (full colour resolution) over lossy', async () => {
        const img = grainy(600, 450);
        const lossless = await encode(img, { lossless: 1, exact: 1, quality: 75, method: 4 });
        const r = await shrinkToWebp(img, Math.round(lossless.byteLength * 0.7), codec);
        expect(r.mode).toBe('near-lossless');
        expect(r.psnr).toBeGreaterThan(38);
        expect(r.bytes.byteLength).toBeLessThan(lossless.byteLength * 0.7);
    });

    it('falls back to high-quality lossy when lossless cannot fit', async () => {
        const img = noise(256, 256, 7);
        // noise is ~256 KB raw; lossless cannot get it far below that
        const r = await shrinkToWebp(img, 60_000, codec);
        expect(r.mode).toBe('lossy');
        expect(r.bytes.byteLength).toBeLessThanOrEqual(60_000);
        expect(r.scale).toBe(1);
        const back = await decode(r.bytes.buffer as ArrayBuffer);
        expect([back.width, back.height]).toEqual([256, 256]);
        expect(r.psnr).toBeCloseTo(psnr(back, img), 5);
    });

    it('reduces pixels only as a last resort, and says so', async () => {
        const img = noise(400, 400, 3);
        const r = await shrinkToWebp(img, 15_000, codec);
        expect(r.scale).toBeLessThan(1);
        expect(r.bytes.byteLength).toBeLessThanOrEqual(15_000);
        expect(r.width).toBe(Math.round(400 * r.scale));
    });
});

describe('makePreview', () => {
    it('skips small images and shrinks big ones to the long side', async () => {
        expect(await makePreview(bands(300, 200), 20_000, codec)).toBeNull();
        const p = await makePreview(bands(3000, 1500), 5_000_000, codec);
        expect(p).toMatchObject({ width: 960, height: 480 });
    });
});
