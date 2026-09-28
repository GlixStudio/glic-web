// Image size (resample) and canvas size (crop / extend) for the source image,
// layer renders and masks. Pure JS so every buffer is resized the same way.

import type { Mask } from './selection';

export type ResampleMethod = 'nearest' | 'smooth';

/**
 * Resamples interleaved channel data (4 = RGBA, 1 = mask).
 * 'nearest' keeps hard pixels (pixel art, laser work); 'smooth' box-averages on
 * downscale and interpolates bilinearly on upscale, per axis.
 */
const resampleChannels = (
    src: Uint8ClampedArray,
    w: number,
    h: number,
    nw: number,
    nh: number,
    ch: number,
    method: ResampleMethod
): Uint8ClampedArray<ArrayBuffer> => {
    const out = new Uint8ClampedArray(nw * nh * ch);
    if (method === 'nearest') {
        const xs = new Int32Array(nw);
        for (let x = 0; x < nw; x++) xs[x] = Math.min(w - 1, Math.floor(((x + 0.5) * w) / nw));
        for (let y = 0; y < nh; y++) {
            const sy = Math.min(h - 1, Math.floor(((y + 0.5) * h) / nh));
            for (let x = 0; x < nw; x++) {
                const si = (sy * w + xs[x]) * ch;
                const di = (y * nw + x) * ch;
                for (let c = 0; c < ch; c++) out[di + c] = src[si + c];
            }
        }
        return out;
    }
    // separable: horizontal pass into float buffer, then vertical
    const tmp = new Float32Array(nw * h * ch);
    resampleAxis(src, tmp, w, h, nw, ch, true);
    const out2 = new Float32Array(nw * nh * ch);
    resampleAxis(tmp, out2, nw, h, nh, ch, false);
    for (let i = 0; i < out.length; i++) out[i] = out2[i];
    return out;
};

/** one axis of the smooth resampler: box filter when shrinking, bilinear when growing */
const resampleAxis = (
    src: ArrayLike<number>,
    dst: Float32Array,
    w: number,
    h: number,
    n: number,
    ch: number,
    horizontal: boolean
) => {
    const len = horizontal ? w : h;
    const lines = horizontal ? h : w;
    const outW = horizontal ? n : w;
    const scale = len / n;
    const idxSrc = (line: number, i: number) => (horizontal ? (line * w + i) * ch : (i * w + line) * ch);
    const idxDst = (line: number, i: number) => (horizontal ? (line * outW + i) * ch : (i * outW + line) * ch);
    for (let line = 0; line < lines; line++) {
        for (let i = 0; i < n; i++) {
            const d = idxDst(line, i);
            if (scale > 1) {
                const a = i * scale;
                const b = a + scale;
                for (let c = 0; c < ch; c++) {
                    let acc = 0;
                    for (let k = Math.floor(a); k < Math.ceil(b) && k < len; k++) {
                        const wgt = Math.min(b, k + 1) - Math.max(a, k);
                        acc += src[idxSrc(line, k) + c] * wgt;
                    }
                    dst[d + c] = acc / scale;
                }
            } else {
                const p = (i + 0.5) * scale - 0.5;
                const k0 = Math.max(0, Math.floor(p));
                const k1 = Math.min(len - 1, k0 + 1);
                const t = Math.min(1, Math.max(0, p - k0));
                for (let c = 0; c < ch; c++) {
                    const v0 = src[idxSrc(line, k0) + c];
                    const v1 = src[idxSrc(line, k1) + c];
                    dst[d + c] = v0 + (v1 - v0) * t;
                }
            }
        }
    }
};

export const resampleImage = (img: ImageData, nw: number, nh: number, method: ResampleMethod): ImageData => {
    if (nw === img.width && nh === img.height) return img;
    return new ImageData(resampleChannels(img.data, img.width, img.height, nw, nh, 4, method), nw, nh);
};

export const resampleMask = (mask: Mask, w: number, h: number, nw: number, nh: number, method: ResampleMethod): Mask => {
    if (nw === w && nh === h) return mask;
    return resampleChannels(mask, w, h, nw, nh, 1, method);
};

/** Anchor as fractions: 0 = left/top, 0.5 = center, 1 = right/bottom. */
export interface Anchor {
    x: 0 | 0.5 | 1;
    y: 0 | 0.5 | 1;
}

/** Where the old content's top-left lands on the new canvas. */
export const anchorOffset = (w: number, h: number, nw: number, nh: number, a: Anchor): [number, number] => [
    Math.round((nw - w) * a.x),
    Math.round((nh - h) * a.y),
];

const recanvas = (
    src: Uint8ClampedArray,
    w: number,
    h: number,
    nw: number,
    nh: number,
    ch: number,
    a: Anchor,
    fill: ArrayLike<number>
): Uint8ClampedArray<ArrayBuffer> => {
    const out = new Uint8ClampedArray(nw * nh * ch);
    if (fill.length === ch && Array.from(fill).some(v => v !== 0)) {
        for (let i = 0; i < nw * nh; i++) for (let c = 0; c < ch; c++) out[i * ch + c] = fill[c];
    }
    const [dx, dy] = anchorOffset(w, h, nw, nh, a);
    const x0 = Math.max(0, dx);
    const x1 = Math.min(nw, dx + w);
    if (x1 <= x0) return out;
    for (let y = Math.max(0, dy); y < Math.min(nh, dy + h); y++) {
        const sy = y - dy;
        out.set(src.subarray((sy * w + (x0 - dx)) * ch, (sy * w + (x1 - dx)) * ch), (y * nw + x0) * ch);
    }
    return out;
};

/** Crops or extends the canvas; new area is filled with `fill` (RGBA). */
export const resizeCanvas = (img: ImageData, nw: number, nh: number, a: Anchor, fill: [number, number, number, number]): ImageData =>
    new ImageData(recanvas(img.data, img.width, img.height, nw, nh, 4, a, fill), nw, nh);

/** Same for a mask; new area is unselected. */
export const resizeCanvasMask = (mask: Mask, w: number, h: number, nw: number, nh: number, a: Anchor): Mask =>
    recanvas(mask, w, h, nw, nh, 1, a, [0]);

/** Largest dimension the app accepts (keeps the canvas and codec buffers sane). */
export const MAX_DIMENSION = 12000;
