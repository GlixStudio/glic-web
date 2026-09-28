// Turning an arbitrary image into a selection mask: first decide WHAT in the
// image means "selected" (the definition), then WHERE it lands on the canvas
// (the placement: fit, scale, rotate, offset, flip, tile). Both are pure and
// resolution-independent so the import dialog can preview them at low res and
// apply them at full res with identical results.

import type { Mask } from './selection';

export type MaskSource = 'luminance' | 'alpha' | 'red' | 'green' | 'blue' | 'saturation' | 'color';

export interface MaskDefinition {
    source: MaskSource;
    /** target color for source 'color' */
    color: [number, number, number];
    /** 'color': distance (0..255) still counted as a full match */
    tolerance: number;
    /** 'color': extra distance over which the match fades out */
    softness: number;
    /** levels remap: values <= black become 0, >= white become 255 */
    black: number;
    white: number;
    /** hard edge at this value (after levels); null keeps the grays */
    threshold: number | null;
    invert: boolean;
    /** transparent pixels count as unselected (ignored for source 'alpha') */
    useAlpha: boolean;
}

export const DEFAULT_DEFINITION: MaskDefinition = {
    source: 'luminance',
    color: [255, 255, 255],
    tolerance: 40,
    softness: 20,
    black: 0,
    white: 255,
    threshold: null,
    invert: false,
    useAlpha: true,
};

export const MASK_SOURCES: { value: MaskSource; label: string }[] = [
    { value: 'luminance', label: 'Brightness (white = selected)' },
    { value: 'alpha', label: 'Transparency (opaque = selected)' },
    { value: 'color', label: 'Pick a color' },
    { value: 'red', label: 'Red channel' },
    { value: 'green', label: 'Green channel' },
    { value: 'blue', label: 'Blue channel' },
    { value: 'saturation', label: 'Saturation (vivid = selected)' },
];

/** Reads the image through the definition; the result has the image's own size. */
export const extractMask = (img: ImageData, def: MaskDefinition): Mask => {
    const n = img.width * img.height;
    const d = img.data;
    const out = new Uint8ClampedArray(n);
    const lo = Math.min(def.black, def.white - 1);
    const range = Math.max(1, def.white - lo);
    const [cr, cg, cb] = def.color;
    const tol = def.tolerance;
    const soft = Math.max(0, def.softness);
    for (let i = 0; i < n; i++) {
        const o = i * 4;
        const r = d[o];
        const g = d[o + 1];
        const b = d[o + 2];
        let v: number;
        switch (def.source) {
            case 'alpha':
                v = d[o + 3];
                break;
            case 'red':
                v = r;
                break;
            case 'green':
                v = g;
                break;
            case 'blue':
                v = b;
                break;
            case 'saturation': {
                const mx = Math.max(r, g, b);
                const mn = Math.min(r, g, b);
                v = mx === 0 ? 0 : ((mx - mn) / mx) * 255;
                break;
            }
            case 'color': {
                // perceptually weighted RGB distance, scaled so pure opposites ~255
                const dr = r - cr;
                const dg = g - cg;
                const db = b - cb;
                const dist = Math.sqrt(0.3 * dr * dr + 0.59 * dg * dg + 0.11 * db * db);
                v = dist <= tol ? 255 : soft > 0 && dist < tol + soft ? 255 * (1 - (dist - tol) / soft) : 0;
                break;
            }
            default:
                v = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        }
        // levels
        v = ((v - lo) / range) * 255;
        if (v < 0) v = 0;
        else if (v > 255) v = 255;
        if (def.threshold !== null) v = v >= def.threshold ? 255 : 0;
        if (def.invert) v = 255 - v;
        if (def.useAlpha && def.source !== 'alpha') v = (v * d[o + 3]) / 255;
        out[i] = v;
    }
    return out;
};

export type MaskFit = 'stretch' | 'contain' | 'cover' | 'none';

export interface MaskPlacement {
    fit: MaskFit;
    /** multiplier on top of the fit (1 = 100%) */
    scale: number;
    /** degrees, clockwise */
    rotation: number;
    /** shift of the mask center from the canvas center, in canvas pixels */
    offsetX: number;
    offsetY: number;
    flipX: boolean;
    flipY: boolean;
    /** repeat the mask to fill the canvas (pattern / tile work) */
    tile: boolean;
}

export const DEFAULT_PLACEMENT: MaskPlacement = {
    fit: 'stretch',
    scale: 1,
    rotation: 0,
    offsetX: 0,
    offsetY: 0,
    flipX: false,
    flipY: false,
    tile: false,
};

/** Per-axis size factors the fit mode applies before the user scale. */
export const fitFactors = (fit: MaskFit, sw: number, sh: number, tw: number, th: number): [number, number] => {
    switch (fit) {
        case 'stretch':
            return [tw / sw, th / sh];
        case 'contain': {
            const s = Math.min(tw / sw, th / sh);
            return [s, s];
        }
        case 'cover': {
            const s = Math.max(tw / sw, th / sh);
            return [s, s];
        }
        default:
            return [1, 1];
    }
};

/**
 * Places a source mask (sw x sh) onto a tw x th canvas by inverse mapping with
 * bilinear sampling. `unit` converts canvas pixels to output pixels: pass
 * preview/canvas when rendering a scaled-down preview of a full-size placement.
 */
export const placeMask = (
    src: Mask,
    sw: number,
    sh: number,
    tw: number,
    th: number,
    p: MaskPlacement,
    unit = 1
): Mask => {
    const out = new Uint8ClampedArray(tw * th);
    if (sw === 0 || sh === 0) return out;
    // fit is computed against the full-size canvas (tw/unit), then brought to output px
    const [fx, fy] = fitFactors(p.fit, sw, sh, tw / unit, th / unit);
    const kx = fx * p.scale * unit * (p.flipX ? -1 : 1);
    const ky = fy * p.scale * unit * (p.flipY ? -1 : 1);
    if (kx === 0 || ky === 0) return out;
    const rad = (p.rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const cx = tw / 2 + p.offsetX * unit;
    const cy = th / 2 + p.offsetY * unit;
    const scx = sw / 2;
    const scy = sh / 2;
    for (let y = 0; y < th; y++) {
        const dy = y + 0.5 - cy;
        for (let x = 0; x < tw; x++) {
            const dx = x + 0.5 - cx;
            // undo rotation (clockwise on screen = standard rotation in y-down space)
            const rx = dx * cos + dy * sin;
            const ry = -dx * sin + dy * cos;
            let u = rx / kx + scx - 0.5;
            let v = ry / ky + scy - 0.5;
            if (p.tile) {
                u = ((u % sw) + sw) % sw;
                v = ((v % sh) + sh) % sh;
            } else if (u < -0.5 || v < -0.5 || u > sw - 0.5 || v > sh - 0.5) {
                continue;
            }
            // bilinear, edge-clamped (wrapped when tiling)
            const u0 = Math.floor(u);
            const v0 = Math.floor(v);
            const tu = u - u0;
            const tv = v - v0;
            const xa = p.tile ? (u0 + sw) % sw : Math.max(0, u0);
            const xb = p.tile ? (u0 + 1) % sw : Math.min(sw - 1, u0 + 1);
            const ya = p.tile ? (v0 + sh) % sh : Math.max(0, v0);
            const yb = p.tile ? (v0 + 1) % sh : Math.min(sh - 1, v0 + 1);
            const a = src[ya * sw + xa];
            const b = src[ya * sw + xb];
            const c = src[yb * sw + xa];
            const d = src[yb * sw + xb];
            out[y * tw + x] = (a + (b - a) * tu) * (1 - tv) + (c + (d - c) * tu) * tv;
        }
    }
    return out;
};
