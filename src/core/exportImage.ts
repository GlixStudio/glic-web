// Export helpers: print resolution metadata (DPI) for PNG and JPEG, selection
// bounds for cropping, and selection-to-alpha for cut-outs.

import type { Mask } from './selection';

const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
    }
    return t;
})();

const crc32 = (buf: Uint8Array): number => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
};

/**
 * Returns the PNG with a pHYs chunk (pixels per metre) right after IHDR,
 * replacing any existing one. Print tools read this as the file's DPI.
 */
export const setPngDpi = (png: Uint8Array, dpi: number): Uint8Array => {
    const sig = [137, 80, 78, 71, 13, 10, 26, 10];
    if (png.length < 33 || sig.some((b, i) => png[i] !== b)) throw new Error('not a PNG');
    const ppm = Math.round(dpi / 0.0254);
    const chunk = new Uint8Array(21);
    const dv = new DataView(chunk.buffer);
    dv.setUint32(0, 9);
    chunk.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
    dv.setUint32(8, ppm);
    dv.setUint32(12, ppm);
    chunk[16] = 1; // unit: metre
    dv.setUint32(17, crc32(chunk.subarray(4, 17)));

    const parts: Uint8Array[] = [png.subarray(0, 8)];
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    let off = 8;
    while (off + 12 <= png.length) {
        const len = view.getUint32(off);
        const type = String.fromCharCode(png[off + 4], png[off + 5], png[off + 6], png[off + 7]);
        const end = off + 12 + len;
        if (type !== 'pHYs') parts.push(png.subarray(off, end));
        if (type === 'IHDR') parts.push(chunk);
        off = end;
    }
    const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
    let o = 0;
    for (const p of parts) {
        out.set(p, o);
        o += p.length;
    }
    return out;
};

/** Reads the DPI from a PNG's pHYs chunk (null when absent). */
export const getPngDpi = (png: Uint8Array): number | null => {
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    let off = 8;
    while (off + 12 <= png.length) {
        const len = view.getUint32(off);
        const type = String.fromCharCode(png[off + 4], png[off + 5], png[off + 6], png[off + 7]);
        if (type === 'pHYs' && png[off + 16] === 1) return Math.round(view.getUint32(off + 8) * 0.0254);
        off += 12 + len;
    }
    return null;
};

/**
 * Sets the density in a JPEG's JFIF APP0 segment (browsers always write one).
 * Returns the input unchanged if no JFIF header is found.
 */
export const setJpegDpi = (jpg: Uint8Array, dpi: number): Uint8Array => {
    if (jpg[0] !== 0xff || jpg[1] !== 0xd8) throw new Error('not a JPEG');
    // APP0 marker at 2, length at 4..5, "JFIF\0" at 6..10, version 11..12, units 13, Xd 14..15, Yd 16..17
    if (jpg[2] !== 0xff || jpg[3] !== 0xe0 || String.fromCharCode(...jpg.subarray(6, 10)) !== 'JFIF') return jpg;
    const out = jpg.slice();
    const d = Math.max(1, Math.min(65535, Math.round(dpi)));
    out[13] = 1; // dots per inch
    out[14] = d >> 8;
    out[15] = d & 0xff;
    out[16] = d >> 8;
    out[17] = d & 0xff;
    return out;
};

/** Bounding box of all mask pixels above zero, or null for an empty mask. */
export const maskBounds = (mask: Mask, w: number, h: number): { x: number; y: number; w: number; h: number } | null => {
    let x0 = w;
    let y0 = h;
    let x1 = -1;
    let y1 = -1;
    for (let y = 0; y < h; y++) {
        const row = y * w;
        for (let x = 0; x < w; x++) {
            if (mask[row + x] === 0) continue;
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
        }
    }
    return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
};

export const cropImage = (img: ImageData, x: number, y: number, w: number, h: number): ImageData => {
    const out = new Uint8ClampedArray(w * h * 4);
    for (let r = 0; r < h; r++) {
        const s = ((y + r) * img.width + x) * 4;
        out.set(img.data.subarray(s, s + w * 4), r * w * 4);
    }
    return new ImageData(out, w, h);
};

/** Multiplies alpha by the mask: unselected areas become transparent. */
export const applyMaskAlpha = (img: ImageData, mask: Mask): ImageData => {
    const d = new Uint8ClampedArray(img.data);
    for (let i = 0; i < mask.length; i++) d[i * 4 + 3] = (d[i * 4 + 3] * mask[i]) / 255;
    return new ImageData(d, img.width, img.height);
};

/** Print size of a pixel dimension at a DPI. */
export const printSize = (px: number, dpi: number) => ({ inches: px / dpi, cm: (px / dpi) * 2.54 });
