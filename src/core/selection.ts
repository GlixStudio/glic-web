// Selection masks for region-scoped glitching.
//
// A mask is a full-resolution Uint8ClampedArray (w*h), 0 = untouched, 255 = fully
// selected; intermediate values feather the composite. All functions are pure
// (they return new masks) except brushStamp, which paints in place for
// interactive performance.

export type Mask = Uint8ClampedArray;
export type CombineMode = 'replace' | 'add' | 'subtract';

export type SelectionTool = 'move' | 'rect' | 'ellipse' | 'lasso' | 'wand' | 'brush';

export interface ToolOptions {
    mode: CombineMode;
    tolerance: number;
    contiguous: boolean;
    brushSize: number;
    feather: number;
}

export const DEFAULT_TOOL_OPTIONS: ToolOptions = {
    mode: 'replace',
    tolerance: 32,
    contiguous: true,
    brushSize: 32,
    feather: 0,
};

export const newMask = (w: number, h: number): Mask => new Uint8ClampedArray(w * h);

const clampInt = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(v)));

/** Filled rectangle between two corners (any order), clamped to the image. */
export const rectMask = (w: number, h: number, ax: number, ay: number, bx: number, by: number): Mask => {
    const mask = newMask(w, h);
    const x0 = clampInt(Math.min(ax, bx), 0, w);
    const x1 = clampInt(Math.max(ax, bx), 0, w);
    const y0 = clampInt(Math.min(ay, by), 0, h);
    const y1 = clampInt(Math.max(ay, by), 0, h);
    for (let y = y0; y < y1; y++) mask.fill(255, y * w + x0, y * w + x1);
    return mask;
};

/** Ellipse inscribed in the rectangle between two corners, with ~1px soft edge. */
export const ellipseMask = (w: number, h: number, ax: number, ay: number, bx: number, by: number): Mask => {
    const mask = newMask(w, h);
    const cx = (ax + bx) / 2;
    const cy = (ay + by) / 2;
    const rx = Math.abs(bx - ax) / 2;
    const ry = Math.abs(by - ay) / 2;
    if (rx < 0.5 || ry < 0.5) return mask;
    const x0 = clampInt(cx - rx - 1, 0, w);
    const x1 = clampInt(cx + rx + 1, 0, w);
    const y0 = clampInt(cy - ry - 1, 0, h);
    const y1 = clampInt(cy + ry + 1, 0, h);
    for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
            const dx = (x + 0.5 - cx) / rx;
            const dy = (y + 0.5 - cy) / ry;
            const d = Math.sqrt(dx * dx + dy * dy);
            // soft edge roughly one pixel wide
            const edge = 1 / Math.max(rx, ry);
            const v = d <= 1 - edge ? 255 : d >= 1 ? 0 : Math.round(((1 - d) / edge) * 255);
            if (v > 0) mask[y * w + x] = v;
        }
    }
    return mask;
};

/** Even-odd scanline fill of a freehand polygon. */
export const lassoMask = (w: number, h: number, points: { x: number; y: number }[]): Mask => {
    const mask = newMask(w, h);
    const n = points.length;
    if (n < 3) return mask;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of points) {
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
    }
    const y0 = clampInt(minY, 0, h - 1);
    const y1 = clampInt(maxY, 0, h - 1);
    const xs: number[] = [];
    for (let y = y0; y <= y1; y++) {
        const yc = y + 0.5;
        xs.length = 0;
        for (let i = 0, j = n - 1; i < n; j = i++) {
            const a = points[i];
            const b = points[j];
            if (a.y <= yc !== b.y <= yc) {
                xs.push(a.x + ((yc - a.y) / (b.y - a.y)) * (b.x - a.x));
            }
        }
        xs.sort((p, q) => p - q);
        for (let k = 0; k + 1 < xs.length; k += 2) {
            const sx = clampInt(xs[k], 0, w);
            const ex = clampInt(xs[k + 1], 0, w);
            if (ex > sx) mask.fill(255, y * w + sx, y * w + ex);
        }
    }
    return mask;
};

/**
 * Magic wand: selects pixels whose max per-channel difference from the clicked
 * pixel is within `tolerance`. Contiguous = 4-connected flood fill; otherwise
 * the whole image is thresholded.
 */
export const magicWand = (
    img: ImageData,
    x: number,
    y: number,
    tolerance: number,
    contiguous: boolean
): Mask => {
    const { width: w, height: h, data } = img;
    const mask = newMask(w, h);
    const px = clampInt(x, 0, w - 1);
    const py = clampInt(y, 0, h - 1);
    const si = (py * w + px) * 4;
    const r0 = data[si];
    const g0 = data[si + 1];
    const b0 = data[si + 2];

    const matches = (i: number) => {
        const o = i * 4;
        return (
            Math.abs(data[o] - r0) <= tolerance &&
            Math.abs(data[o + 1] - g0) <= tolerance &&
            Math.abs(data[o + 2] - b0) <= tolerance
        );
    };

    if (!contiguous) {
        for (let i = 0; i < w * h; i++) if (matches(i)) mask[i] = 255;
        return mask;
    }

    const stack = new Int32Array(w * h);
    let top = 0;
    const start = py * w + px;
    stack[top++] = start;
    mask[start] = 255;
    while (top > 0) {
        const i = stack[--top];
        const ix = i % w;
        // left
        if (ix > 0 && mask[i - 1] === 0 && matches(i - 1)) {
            mask[i - 1] = 255;
            stack[top++] = i - 1;
        }
        // right
        if (ix < w - 1 && mask[i + 1] === 0 && matches(i + 1)) {
            mask[i + 1] = 255;
            stack[top++] = i + 1;
        }
        // up
        if (i >= w && mask[i - w] === 0 && matches(i - w)) {
            mask[i - w] = 255;
            stack[top++] = i - w;
        }
        // down
        if (i < w * (h - 1) && mask[i + w] === 0 && matches(i + w)) {
            mask[i + w] = 255;
            stack[top++] = i + w;
        }
    }
    return mask;
};

/** Paints (or erases) an anti-aliased disc into the mask, in place. */
export const brushStamp = (
    mask: Mask,
    w: number,
    h: number,
    cx: number,
    cy: number,
    radius: number,
    erase: boolean
) => {
    const x0 = clampInt(cx - radius - 1, 0, w - 1);
    const x1 = clampInt(cx + radius + 1, 0, w - 1);
    const y0 = clampInt(cy - radius - 1, 0, h - 1);
    const y1 = clampInt(cy + radius + 1, 0, h - 1);
    for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
            const d = Math.sqrt((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2);
            if (d > radius + 0.5) continue;
            const cov = d <= radius - 0.5 ? 255 : Math.round((radius + 0.5 - d) * 255);
            const i = y * w + x;
            mask[i] = erase ? Math.min(mask[i], 255 - cov) : Math.max(mask[i], cov);
        }
    }
};

export const combine = (base: Mask | null, addition: Mask, mode: CombineMode): Mask => {
    if (!base || mode === 'replace') return addition.slice();
    const out = base.slice();
    if (mode === 'add') {
        for (let i = 0; i < out.length; i++) out[i] = Math.max(out[i], addition[i]);
    } else {
        for (let i = 0; i < out.length; i++) out[i] = Math.max(0, out[i] - addition[i]);
    }
    return out;
};

export const invertMask = (mask: Mask): Mask => {
    const out = new Uint8ClampedArray(mask.length);
    for (let i = 0; i < mask.length; i++) out[i] = 255 - mask[i];
    return out;
};

export const isEmptyMask = (mask: Mask): boolean => {
    for (let i = 0; i < mask.length; i++) if (mask[i] !== 0) return false;
    return true;
};

/** Fraction of the image selected (mean coverage, 0..1). */
export const coverage = (mask: Mask): number => {
    let sum = 0;
    for (let i = 0; i < mask.length; i++) sum += mask[i];
    return sum / (mask.length * 255);
};

const boxBlurPass = (src: Float32Array, dst: Float32Array, w: number, h: number, r: number, horizontal: boolean) => {
    const len = horizontal ? w : h;
    const lines = horizontal ? h : w;
    const stride = horizontal ? 1 : w;
    const lineStride = horizontal ? w : 1;
    const norm = 1 / (2 * r + 1);
    for (let l = 0; l < lines; l++) {
        const off = l * lineStride;
        let acc = 0;
        for (let i = -r; i <= r; i++) {
            const k = Math.min(len - 1, Math.max(0, i));
            acc += src[off + k * stride];
        }
        for (let i = 0; i < len; i++) {
            dst[off + i * stride] = acc * norm;
            const addI = Math.min(len - 1, i + r + 1);
            const subI = Math.max(0, i - r);
            acc += src[off + addI * stride] - src[off + subI * stride];
        }
    }
};

/** Softens mask edges with three box-blur passes (~gaussian, sigma ≈ radius/2). */
export const feather = (mask: Mask, w: number, h: number, radius: number): Mask => {
    if (radius <= 0) return mask.slice();
    const r = Math.max(1, Math.round(radius / 3));
    const a = Float32Array.from(mask);
    const b = new Float32Array(mask.length);
    for (let pass = 0; pass < 3; pass++) {
        boxBlurPass(a, b, w, h, r, true);
        boxBlurPass(b, a, w, h, r, false);
    }
    const out = new Uint8ClampedArray(mask.length);
    for (let i = 0; i < mask.length; i++) out[i] = a[i];
    return out;
};

/** out = mask·glitched + (1−mask)·source, per pixel including alpha. */
export const compositeWithMask = (source: ImageData, glitched: ImageData, mask: Mask): ImageData => {
    const n = mask.length;
    const out = new Uint8ClampedArray(n * 4);
    const s = source.data;
    const g = glitched.data;
    for (let i = 0; i < n; i++) {
        const m = mask[i] / 255;
        const im = 1 - m;
        const o = i * 4;
        out[o] = g[o] * m + s[o] * im;
        out[o + 1] = g[o + 1] * m + s[o + 1] * im;
        out[o + 2] = g[o + 2] * m + s[o + 2] * im;
        out[o + 3] = g[o + 3] * m + s[o + 3] * im;
    }
    return new ImageData(out, source.width, source.height);
};

/**
 * Translucent tint + edge highlight for the viewer overlay. An optional region
 * limits the output to [x0,x1)x[y0,y1) for cheap partial updates (edge tests
 * still sample the full mask).
 */
export const maskOverlay = (
    mask: Mask,
    w: number,
    h: number,
    x0 = 0,
    y0 = 0,
    x1 = w,
    y1 = h
): ImageData => {
    const rw = x1 - x0;
    const rh = y1 - y0;
    const out = new Uint8ClampedArray(rw * rh * 4);
    for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
            const i = y * w + x;
            const m = mask[i];
            if (m === 0) continue;
            const o = ((y - y0) * rw + (x - x0)) * 4;
            const inside = m >= 128;
            const isEdge =
                inside &&
                ((x > 0 && mask[i - 1] < 128) ||
                    (x < w - 1 && mask[i + 1] < 128) ||
                    (y > 0 && mask[i - w] < 128) ||
                    (y < h - 1 && mask[i + w] < 128));
            if (isEdge) {
                out[o] = 255;
                out[o + 1] = 255;
                out[o + 2] = 255;
                out[o + 3] = 230;
            } else {
                out[o] = 59;
                out[o + 1] = 130;
                out[o + 2] = 246;
                out[o + 3] = Math.round(m * 0.3);
            }
        }
    }
    return new ImageData(out, rw, rh);
};
