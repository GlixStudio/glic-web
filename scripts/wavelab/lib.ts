// Shared helpers for the wavelet/preset lab: a synthetic test scene, a tiny PNG
// writer, contact-sheet layout. Run scripts with `npx vite-node scripts/wavelab/<x>.ts`.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import '../../src/core/__tests__/setup';

export const makeScene = (w: number, h: number): ImageData => {
    const d = new Uint8ClampedArray(w * h * 4);
    let s = 99;
    const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 0x100000000);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const fx = x / w, fy = y / h;
            // sky gradient
            let r = 40 + 160 * fy, g = 90 + 120 * fy, b = 200 - 60 * fy;
            // sun
            const dx = fx - 0.72, dy = fy - 0.28;
            if (dx * dx + dy * dy < 0.012) { r = 255; g = 220; b = 120; }
            // mountains
            const ridge = 0.55 + 0.12 * Math.sin(fx * 9) + 0.06 * Math.sin(fx * 23 + 1);
            if (fy > ridge) { const sh = 0.5 + 0.5 * Math.sin(fx * 40); r = 50 + 40 * sh; g = 70 + 50 * sh; b = 60 + 30 * sh; }
            // ground stripes
            if (fy > 0.78) { const st = Math.floor(fx * 24) % 2; r = st ? 200 : 90; g = st ? 60 : 160; b = st ? 40 : 40; }
            // checker patch
            if (fx > 0.05 && fx < 0.3 && fy > 0.05 && fy < 0.25) { const c = (Math.floor(fx * 60) + Math.floor(fy * 60)) % 2 ? 235 : 20; r = g = b = c; }
            // noisy texture patch
            if (fx > 0.4 && fx < 0.6 && fy > 0.6 && fy < 0.76) { const n = rnd() * 255; r = n; g = n * 0.6; b = 255 - n; }
            // thin dark lines
            if (Math.abs(fy - 0.45) < 0.004 || Math.abs(fx - 0.5) < 0.004) { r = g = b = 15; }
            const i = (y * w + x) * 4;
            d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
        }
    }
    return new ImageData(d, w, h);
};

/** photo-like scene: soft clouds, a face-like blob, film grain */
export const makePhoto = (w: number, h: number): ImageData => {
    const d = new Uint8ClampedArray(w * h * 4);
    let s = 7;
    const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 0x100000000);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const fx = x / w, fy = y / h;
            const cloud = 0.5 + 0.25 * Math.sin(fx * 7 + Math.sin(fy * 5) * 2) + 0.25 * Math.sin(fy * 9 + Math.cos(fx * 4) * 3);
            let r = 120 + 100 * cloud, g = 100 + 80 * cloud * fy, b = 140 + 90 * (1 - cloud);
            const dx = (fx - 0.5) * 1.3, dy = fy - 0.5;
            const rr = dx * dx + dy * dy;
            if (rr < 0.09) { const sh = 1 - rr / 0.09; r = 220 * sh + 60; g = 170 * sh + 40; b = 140 * sh + 40; }
            if (rr < 0.09 && Math.abs(dy + 0.08) < 0.015 && Math.abs(Math.abs(dx) - 0.12) < 0.03) { r = g = b = 30; }
            const grain = (rnd() - 0.5) * 24;
            const i = (y * w + x) * 4;
            d[i] = r + grain; d[i + 1] = g + grain; d[i + 2] = b + grain; d[i + 3] = 255;
        }
    }
    return new ImageData(d, w, h);
};

const crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (buf: Uint8Array) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length); const dv = new DataView(out.buffer);
    dv.setUint32(0, data.length); out.set([...type].map(c => c.charCodeAt(0)), 4); out.set(data, 8);
    dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length))); return out;
};
export const writePng = (path: string, img: ImageData) => {
    const { width: w, height: h, data } = img;
    const raw = new Uint8Array((w * 3 + 1) * h);
    for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) { const i = (y * w + x) * 4, o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = data[i]; raw[o + 1] = data[i + 1]; raw[o + 2] = data[i + 2]; } }
    const ihdr = new Uint8Array(13); const dv = new DataView(ihdr.buffer); dv.setUint32(0, w); dv.setUint32(4, h); ihdr[8] = 8; ihdr[9] = 2;
    const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', new Uint8Array(deflateSync(raw))), chunk('IEND', new Uint8Array(0))];
    writeFileSync(path, Buffer.concat(parts.map(p => Buffer.from(p))));
};

/** lays tiles (all same size) in a grid with a gap; returns the sheet */
export const contactSheet = (tiles: ImageData[], cols: number, gap = 4): ImageData => {
    const tw = tiles[0].width, th = tiles[0].height;
    const rows = Math.ceil(tiles.length / cols);
    const w = cols * tw + (cols + 1) * gap, h = rows * th + (rows + 1) * gap;
    const out = new ImageData(w, h); out.data.fill(255);
    tiles.forEach((t, i) => {
        const cx = gap + (i % cols) * (tw + gap), cy = gap + Math.floor(i / cols) * (th + gap);
        for (let y = 0; y < th; y++) out.data.set(t.data.subarray(y * tw * 4, (y + 1) * tw * 4), ((cy + y) * w + cx) * 4);
    });
    return out;
};

export const stats = (img: ImageData) => {
    let sum = 0, sum2 = 0; const n = img.width * img.height; const px = img.data;
    for (let i = 0; i < n; i++) { const v = (px[i * 4] + px[i * 4 + 1] + px[i * 4 + 2]) / 3; sum += v; sum2 += v * v; }
    const mean = sum / n; return { mean: Math.round(mean), std: Math.round(Math.sqrt(Math.max(0, sum2 / n - mean * mean))) };
};
