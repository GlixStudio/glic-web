// Layer transforms (Photoshop's Move / Free Transform), non-destructive: a layer
// keeps its original full-frame pixels and mask, and this warp is applied at
// composite time. Everything pivots on the canvas centre:
//
//   dest = C + (x, y) + R(rotation) · S(scale, flips) · (src − C)
//
// Pixels that land outside the source frame are transparent (alpha 0) and mask
// values outside it are 0, so a moved layer uncovers what lies beneath it.

import type { Mask } from './selection';

export interface LayerTransform {
    x: number;
    y: number;
    /** uniform scale factor (1 = 100%) */
    scale: number;
    /** degrees, clockwise on screen */
    rotation: number;
    flipX: boolean;
    flipY: boolean;
}

export const IDENTITY_TRANSFORM: LayerTransform = { x: 0, y: 0, scale: 1, rotation: 0, flipX: false, flipY: false };

export const isIdentity = (t: LayerTransform | undefined): boolean =>
    !t || (t.x === 0 && t.y === 0 && t.scale === 1 && t.rotation % 360 === 0 && !t.flipX && !t.flipY);

export const transformKey = (t: LayerTransform): string =>
    `${t.x},${t.y},${t.scale},${t.rotation},${+t.flipX},${+t.flipY}`;

/** 2x2 linear part (rotation · scale · flip) of the forward map */
const linear = (t: LayerTransform) => {
    const r = (t.rotation * Math.PI) / 180;
    const c = Math.cos(r);
    const s = Math.sin(r);
    const sx = t.scale * (t.flipX ? -1 : 1);
    const sy = t.scale * (t.flipY ? -1 : 1);
    return { a: c * sx, b: -s * sy, c: s * sx, d: c * sy }; // [a b; c d]
};

/** forward map of a point from layer (source) space to canvas space */
export const mapPoint = (t: LayerTransform, w: number, h: number, px: number, py: number) => {
    const { a, b, c, d } = linear(t);
    const cx = w / 2;
    const cy = h / 2;
    const dx = px - cx;
    const dy = py - cy;
    return { x: cx + t.x + a * dx + b * dy, y: cy + t.y + c * dx + d * dy };
};

/** sampler setup: for each destination pixel centre, where it reads from in the source */
const inverseMap = (t: LayerTransform, w: number, h: number) => {
    const { a, b, c, d } = linear(t);
    const det = a * d - b * c;
    const ia = d / det;
    const ib = -b / det;
    const ic = -c / det;
    const id = a / det;
    const cx = w / 2;
    const cy = h / 2;
    // src = C + L⁻¹ (dest − C − T), evaluated at pixel centres
    return (x: number, y: number) => {
        const dx = x + 0.5 - cx - t.x;
        const dy = y + 0.5 - cy - t.y;
        return { sx: cx + ia * dx + ib * dy - 0.5, sy: cy + ic * dx + id * dy - 0.5 };
    };
};

/** crisp (nearest) sampling keeps glitch blocks hard; only scaling or free rotation needs filtering */
const needsFiltering = (t: LayerTransform) => t.scale !== 1 || t.rotation % 90 !== 0;

/** warps an image; outside the source frame is transparent */
export const transformImage = (img: ImageData, t: LayerTransform): ImageData => {
    const { width: w, height: h, data: src } = img;
    const out = new ImageData(w, h);
    const d = out.data;
    const map = inverseMap(t, w, h);
    const smooth = needsFiltering(t);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const { sx, sy } = map(x, y);
            const o = (y * w + x) * 4;
            if (!smooth) {
                const ix = Math.round(sx);
                const iy = Math.round(sy);
                if (ix < 0 || iy < 0 || ix >= w || iy >= h) continue;
                const s = (iy * w + ix) * 4;
                d[o] = src[s];
                d[o + 1] = src[s + 1];
                d[o + 2] = src[s + 2];
                d[o + 3] = src[s + 3];
                continue;
            }
            // bilinear; taps outside the frame count as transparent
            const x0 = Math.floor(sx);
            const y0 = Math.floor(sy);
            const fx = sx - x0;
            const fy = sy - y0;
            if (x0 < -1 || y0 < -1 || x0 >= w || y0 >= h) continue;
            let r = 0, g = 0, b = 0, a = 0;
            for (let k = 0; k < 4; k++) {
                const xx = x0 + (k & 1);
                const yy = y0 + (k >> 1);
                if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
                const wgt = (k & 1 ? fx : 1 - fx) * (k >> 1 ? fy : 1 - fy);
                const s = (yy * w + xx) * 4;
                const aw = src[s + 3] * wgt; // premultiplied, so edges fade instead of darkening
                r += src[s] * aw;
                g += src[s + 1] * aw;
                b += src[s + 2] * aw;
                a += aw;
            }
            if (a <= 0) continue;
            d[o] = r / a;
            d[o + 1] = g / a;
            d[o + 2] = b / a;
            d[o + 3] = a;
        }
    }
    return out;
};

/** forward map at pixel centres: where layer pixel (x, y) lands on the canvas */
const forwardMap = (t: LayerTransform, w: number, h: number) => (x: number, y: number) => {
    const p = mapPoint(t, w, h, x + 0.5, y + 0.5);
    return { sx: p.x - 0.5, sy: p.y - 0.5 };
};

/** warps a mask like its layer's pixels (layer space -> canvas); outside the source frame is 0 */
export const transformMask = (mask: Mask, w: number, h: number, t: LayerTransform): Mask =>
    warpMask(mask, w, h, inverseMap(t, w, h), needsFiltering(t));

/** the opposite direction: a canvas-space mask (e.g. the selection) expressed in layer space */
export const untransformMask = (mask: Mask, w: number, h: number, t: LayerTransform): Mask =>
    warpMask(mask, w, h, forwardMap(t, w, h), needsFiltering(t));

const warpMask = (
    mask: Mask,
    w: number,
    h: number,
    map: (x: number, y: number) => { sx: number; sy: number },
    smooth: boolean
): Mask => {
    const out = new Uint8ClampedArray(w * h);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const { sx, sy } = map(x, y);
            if (!smooth) {
                const ix = Math.round(sx);
                const iy = Math.round(sy);
                if (ix >= 0 && iy >= 0 && ix < w && iy < h) out[y * w + x] = mask[iy * w + ix];
                continue;
            }
            const x0 = Math.floor(sx);
            const y0 = Math.floor(sy);
            const fx = sx - x0;
            const fy = sy - y0;
            let v = 0;
            for (let k = 0; k < 4; k++) {
                const xx = x0 + (k & 1);
                const yy = y0 + (k >> 1);
                if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
                v += mask[yy * w + xx] * (k & 1 ? fx : 1 - fx) * (k >> 1 ? fy : 1 - fy);
            }
            out[y * w + x] = v;
        }
    }
    return out;
};
