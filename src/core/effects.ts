// Non-destructive layer effects (think Photoshop smart filters + adjustment
// layers). Every effect is a pure ImageData -> ImageData function over a flat
// param record, described by a small schema so the UI can render any of them
// generically. Nothing here mutates its input: the compositor caches and
// reuses layer renders, so an in-place write would corrupt them.
//
// Effects that need randomness (noise, slice shift) take an explicit seed and
// hash per pixel, so recompositing never makes the image shimmer.

export type EffectType =
    | 'brightnessContrast'
    | 'hueSaturation'
    | 'levels'
    | 'invert'
    | 'posterize'
    | 'threshold'
    | 'blur'
    | 'sharpen'
    | 'noise'
    | 'pixelate'
    | 'vignette'
    | 'rgbShift'
    | 'scanlines'
    | 'pixelSort'
    | 'sliceShift';

export type EffectParams = Record<string, number>;

export interface Effect {
    id: string;
    type: EffectType;
    enabled: boolean;
    params: EffectParams;
}

export interface EffectParamDef {
    key: string;
    label: string;
    min: number;
    max: number;
    step?: number;
    default: number;
    /** discrete choice rendered as a picker; value = option index */
    options?: string[];
    unit?: string;
}

export type EffectGroup = 'adjust' | 'filter' | 'glitch';

export interface EffectDef {
    type: EffectType;
    label: string;
    group: EffectGroup;
    params: EffectParamDef[];
    apply: (img: ImageData, p: EffectParams) => ImageData;
}

export const EFFECT_GROUPS: { id: EffectGroup; label: string }[] = [
    { id: 'adjust', label: 'Adjustments' },
    { id: 'filter', label: 'Filters' },
    { id: 'glitch', label: 'Glitch' },
];

// --- helpers ---

const clone = (img: ImageData) => new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);

/** applies a per-channel 256-entry lookup table to RGB, alpha untouched */
const applyLut = (img: ImageData, lut: Uint8ClampedArray): ImageData => {
    const out = clone(img);
    const d = out.data;
    for (let i = 0; i < d.length; i += 4) {
        d[i] = lut[d[i]];
        d[i + 1] = lut[d[i + 1]];
        d[i + 2] = lut[d[i + 2]];
    }
    return out;
};

const lutFrom = (fn: (v: number) => number): Uint8ClampedArray => {
    const lut = new Uint8ClampedArray(256);
    for (let v = 0; v < 256; v++) lut[v] = Math.round(fn(v));
    return lut;
};

const luma = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

/** deterministic 0..1 hash of (index, seed) - mulberry-style integer mix */
const hash01 = (i: number, seed: number): number => {
    let t = (i * 0x9e3779b1 + seed * 0x85ebca6b) | 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** one horizontal + vertical running-sum box pass over all four channels (edges clamp) */
const boxBlurPass = (src: Uint8ClampedArray, w: number, h: number, r: number): ImageDataArray => {
    const tmp = new Float32Array(src.length);
    const out = new Uint8ClampedArray(src.length);
    const span = 2 * r + 1;
    // horizontal: running sum along each row
    for (let y = 0; y < h; y++) {
        const row = y * w * 4;
        let a0 = 0, a1 = 0, a2 = 0, a3 = 0;
        for (let k = -r; k <= r; k++) {
            const o = row + Math.min(w - 1, Math.max(0, k)) * 4;
            a0 += src[o]; a1 += src[o + 1]; a2 += src[o + 2]; a3 += src[o + 3];
        }
        for (let x = 0; x < w; x++) {
            const o = row + x * 4;
            tmp[o] = a0 / span; tmp[o + 1] = a1 / span; tmp[o + 2] = a2 / span; tmp[o + 3] = a3 / span;
            const add = row + Math.min(w - 1, x + r + 1) * 4;
            const sub = row + Math.max(0, x - r) * 4;
            a0 += src[add] - src[sub]; a1 += src[add + 1] - src[sub + 1];
            a2 += src[add + 2] - src[sub + 2]; a3 += src[add + 3] - src[sub + 3];
        }
    }
    // vertical: one accumulator per column, walked row by row (cache-friendly)
    const stride = w * 4;
    const acc = new Float32Array(stride);
    for (let k = -r; k <= r; k++) {
        const row = Math.min(h - 1, Math.max(0, k)) * stride;
        for (let i = 0; i < stride; i++) acc[i] += tmp[row + i];
    }
    for (let y = 0; y < h; y++) {
        const row = y * stride;
        const add = Math.min(h - 1, y + r + 1) * stride;
        const sub = Math.max(0, y - r) * stride;
        for (let i = 0; i < stride; i++) {
            out[row + i] = acc[i] / span;
            acc[i] += tmp[add + i] - tmp[sub + i];
        }
    }
    return out;
};

/** gaussian approximation: three box passes (radius ~ standard deviation) */
export const gaussianBlur = (img: ImageData, radius: number): ImageData => {
    if (radius <= 0) return clone(img);
    // box sizes for a 3-pass gaussian of sigma = radius (Kovesi)
    const sigma = radius;
    const wIdeal = Math.sqrt((12 * sigma * sigma) / 3 + 1);
    let wl = Math.floor(wIdeal);
    if (wl % 2 === 0) wl--;
    const wu = wl + 2;
    const m = Math.round((12 * sigma * sigma - 3 * wl * wl - 12 * wl - 9) / (-4 * wl - 4));
    let d: ImageDataArray = img.data;
    for (let i = 0; i < 3; i++) {
        const size = i < m ? wl : wu;
        d = boxBlurPass(d, img.width, img.height, Math.max(0, (size - 1) / 2));
    }
    return new ImageData(d, img.width, img.height);
};

const rgbToHsl = (r: number, g: number, b: number): [number, number, number] => {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h: number;
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return [h / 6, s, l];
};

const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
};

const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
    if (s === 0) return [l * 255, l * 255, l * 255];
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return [hue2rgb(p, q, h + 1 / 3) * 255, hue2rgb(p, q, h) * 255, hue2rgb(p, q, h - 1 / 3) * 255];
};

// --- effect implementations ---

const brightnessContrast = (img: ImageData, p: EffectParams) => {
    const k = ((100 + p.contrast) / 100) ** 2;
    return applyLut(img, lutFrom(v => (v - 127.5) * k + 127.5 + p.brightness));
};

const hueSaturation = (img: ImageData, p: EffectParams) => {
    const out = clone(img);
    const d = out.data;
    const dh = p.hue / 360;
    const sk = 1 + p.saturation / 100;
    const lk = p.lightness / 100;
    for (let i = 0; i < d.length; i += 4) {
        let [h, s, l] = rgbToHsl(d[i], d[i + 1], d[i + 2]);
        h = (h + dh + 1) % 1;
        s = Math.min(1, s * sk);
        // Photoshop-style lightness: blend toward white or black
        l = lk >= 0 ? l + (1 - l) * lk : l * (1 + lk);
        const [r, g, b] = hslToRgb(h, s, l);
        d[i] = r;
        d[i + 1] = g;
        d[i + 2] = b;
    }
    return out;
};

const levels = (img: ImageData, p: EffectParams) => {
    const lo = p.inBlack;
    const hi = Math.max(lo + 1, p.inWhite);
    return applyLut(
        img,
        lutFrom(v => {
            const t = Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
            return p.outBlack + (p.outWhite - p.outBlack) * t ** (1 / p.gamma);
        })
    );
};

const invert = (img: ImageData) => applyLut(img, lutFrom(v => 255 - v));

const posterize = (img: ImageData, p: EffectParams) => {
    const n = Math.max(2, Math.round(p.levels)) - 1;
    return applyLut(img, lutFrom(v => (Math.round((v / 255) * n) / n) * 255));
};

const threshold = (img: ImageData, p: EffectParams) => {
    const out = clone(img);
    const d = out.data;
    for (let i = 0; i < d.length; i += 4) {
        const v = luma(d[i], d[i + 1], d[i + 2]) >= p.level ? 255 : 0;
        d[i] = d[i + 1] = d[i + 2] = v;
    }
    return out;
};

const blur = (img: ImageData, p: EffectParams) => gaussianBlur(img, p.radius);

const sharpen = (img: ImageData, p: EffectParams) => {
    const soft = gaussianBlur(img, p.radius).data;
    const out = clone(img);
    const d = out.data;
    const k = p.amount / 100;
    for (let i = 0; i < d.length; i += 4) {
        for (let c = 0; c < 3; c++) {
            const diff = d[i + c] - soft[i + c];
            if (Math.abs(diff) >= p.threshold) d[i + c] = d[i + c] + diff * k;
        }
    }
    return out;
};

const noise = (img: ImageData, p: EffectParams) => {
    const out = clone(img);
    const d = out.data;
    const amp = (p.amount / 100) * 255;
    const mono = p.mono === 1;
    for (let i = 0, px = 0; i < d.length; i += 4, px++) {
        if (mono) {
            const n = (hash01(px, p.seed) - 0.5) * amp;
            d[i] += n;
            d[i + 1] += n;
            d[i + 2] += n;
        } else {
            d[i] += (hash01(px * 3, p.seed) - 0.5) * amp;
            d[i + 1] += (hash01(px * 3 + 1, p.seed) - 0.5) * amp;
            d[i + 2] += (hash01(px * 3 + 2, p.seed) - 0.5) * amp;
        }
    }
    return out;
};

const pixelate = (img: ImageData, p: EffectParams) => {
    const { width: w, height: h } = img;
    const s = Math.max(1, Math.round(p.size));
    const src = img.data;
    const out = clone(img);
    const d = out.data;
    for (let by = 0; by < h; by += s) {
        for (let bx = 0; bx < w; bx += s) {
            const ex = Math.min(w, bx + s);
            const ey = Math.min(h, by + s);
            let r = 0, g = 0, b = 0, a = 0;
            for (let y = by; y < ey; y++) {
                for (let x = bx; x < ex; x++) {
                    const o = (y * w + x) * 4;
                    r += src[o];
                    g += src[o + 1];
                    b += src[o + 2];
                    a += src[o + 3];
                }
            }
            const n = (ex - bx) * (ey - by);
            for (let y = by; y < ey; y++) {
                for (let x = bx; x < ex; x++) {
                    const o = (y * w + x) * 4;
                    d[o] = r / n;
                    d[o + 1] = g / n;
                    d[o + 2] = b / n;
                    d[o + 3] = a / n;
                }
            }
        }
    }
    return out;
};

const vignette = (img: ImageData, p: EffectParams) => {
    const { width: w, height: h } = img;
    const out = clone(img);
    const d = out.data;
    const cx = (w - 1) / 2;
    const cy = (h - 1) / 2;
    const maxR = Math.hypot(cx, cy) || 1;
    const inner = p.size / 100; // where darkening starts, fraction of the corner distance
    const strength = p.amount / 100;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const r = Math.hypot(x - cx, y - cy) / maxR;
            if (r <= inner) continue;
            const t = Math.min(1, (r - inner) / Math.max(1e-6, 1 - inner));
            const f = 1 - strength * t * t * (3 - 2 * t);
            const o = (y * w + x) * 4;
            d[o] *= f;
            d[o + 1] *= f;
            d[o + 2] *= f;
        }
    }
    return out;
};

const rgbShift = (img: ImageData, p: EffectParams) => {
    const { width: w, height: h } = img;
    const src = img.data;
    const out = clone(img);
    const d = out.data;
    const rx = Math.round(p.redX);
    const ry = Math.round(p.redY);
    const bx = Math.round(p.blueX);
    const by = Math.round(p.blueY);
    const cl = (v: number, m: number) => (v < 0 ? 0 : v >= m ? m - 1 : v);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const o = (y * w + x) * 4;
            d[o] = src[(cl(y - ry, h) * w + cl(x - rx, w)) * 4];
            d[o + 2] = src[(cl(y - by, h) * w + cl(x - bx, w)) * 4 + 2];
        }
    }
    return out;
};

const scanlines = (img: ImageData, p: EffectParams) => {
    const { width: w, height: h } = img;
    const out = clone(img);
    const d = out.data;
    const period = Math.max(2, Math.round(p.spacing));
    const thick = Math.max(1, Math.min(period - 1, Math.round(p.thickness)));
    const f = 1 - p.intensity / 100;
    const vertical = p.direction === 1;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const pos = vertical ? x : y;
            if (pos % period >= thick) continue;
            const o = (y * w + x) * 4;
            d[o] *= f;
            d[o + 1] *= f;
            d[o + 2] *= f;
        }
    }
    return out;
};

/**
 * Classic Asendorf pixel sort: along each row (or column), runs of pixels
 * whose brightness falls inside [low, high] are sorted by brightness.
 */
const pixelSort = (img: ImageData, p: EffectParams) => {
    const { width: w, height: h } = img;
    const out = clone(img);
    const d = out.data;
    const vertical = p.direction === 1;
    const reverse = p.order === 1;
    const lines = vertical ? w : h;
    const len = vertical ? h : w;
    const idx = new Int32Array(len);
    const key = new Float32Array(len);
    const buf = new Uint8ClampedArray(len * 4);

    for (let line = 0; line < lines; line++) {
        const at = (k: number) => (vertical ? k * w + line : line * w + k) * 4;
        let k = 0;
        while (k < len) {
            const o = at(k);
            const l = luma(d[o], d[o + 1], d[o + 2]);
            if (l < p.low || l > p.high) {
                k++;
                continue;
            }
            let end = k;
            while (end < len) {
                const e = at(end);
                const le = luma(d[e], d[e + 1], d[e + 2]);
                if (le < p.low || le > p.high) break;
                end++;
            }
            const n = end - k;
            if (n > 1) {
                for (let j = 0; j < n; j++) {
                    const e = at(k + j);
                    idx[j] = j;
                    key[j] = luma(d[e], d[e + 1], d[e + 2]);
                    buf.set(d.subarray(e, e + 4), j * 4);
                }
                const order = Array.from(idx.subarray(0, n)).sort((a, b) =>
                    reverse ? key[b] - key[a] : key[a] - key[b]
                );
                for (let j = 0; j < n; j++) {
                    const e = at(k + j);
                    const s = order[j] * 4;
                    d[e] = buf[s];
                    d[e + 1] = buf[s + 1];
                    d[e + 2] = buf[s + 2];
                    d[e + 3] = buf[s + 3];
                }
            }
            k = end;
        }
    }
    return out;
};

/** horizontal band displacement - torn-VHS / datamosh look */
const sliceShift = (img: ImageData, p: EffectParams) => {
    const { width: w, height: h } = img;
    const src = img.data;
    const out = clone(img);
    const d = out.data;
    const band = Math.max(1, Math.round(p.height));
    const maxOff = Math.round((p.amount / 100) * w);
    const chance = p.density / 100;
    for (let y0 = 0, b = 0; y0 < h; y0 += band, b++) {
        if (hash01(b, p.seed) >= chance) continue;
        const off = Math.round((hash01(b + 7919, p.seed) * 2 - 1) * maxOff);
        if (off === 0) continue;
        for (let y = y0; y < Math.min(h, y0 + band); y++) {
            const row = y * w;
            for (let x = 0; x < w; x++) {
                const sx = (((x - off) % w) + w) % w;
                const o = (row + x) * 4;
                const s = (row + sx) * 4;
                d[o] = src[s];
                d[o + 1] = src[s + 1];
                d[o + 2] = src[s + 2];
                d[o + 3] = src[s + 3];
            }
        }
    }
    return out;
};

// --- registry ---

const DIRECTION = ['Horizontal', 'Vertical'];

export const EFFECTS: EffectDef[] = [
    {
        type: 'brightnessContrast',
        label: 'Brightness / Contrast',
        group: 'adjust',
        params: [
            { key: 'brightness', label: 'Brightness', min: -150, max: 150, default: 0 },
            { key: 'contrast', label: 'Contrast', min: -100, max: 100, default: 0 },
        ],
        apply: brightnessContrast,
    },
    {
        type: 'hueSaturation',
        label: 'Hue / Saturation',
        group: 'adjust',
        params: [
            { key: 'hue', label: 'Hue', min: -180, max: 180, default: 0, unit: '°' },
            { key: 'saturation', label: 'Saturation', min: -100, max: 100, default: 0 },
            { key: 'lightness', label: 'Lightness', min: -100, max: 100, default: 0 },
        ],
        apply: hueSaturation,
    },
    {
        type: 'levels',
        label: 'Levels',
        group: 'adjust',
        params: [
            { key: 'inBlack', label: 'Input black', min: 0, max: 254, default: 0 },
            { key: 'gamma', label: 'Gamma', min: 0.1, max: 5, step: 0.01, default: 1 },
            { key: 'inWhite', label: 'Input white', min: 1, max: 255, default: 255 },
            { key: 'outBlack', label: 'Output black', min: 0, max: 255, default: 0 },
            { key: 'outWhite', label: 'Output white', min: 0, max: 255, default: 255 },
        ],
        apply: levels,
    },
    { type: 'invert', label: 'Invert', group: 'adjust', params: [], apply: invert },
    {
        type: 'posterize',
        label: 'Posterize',
        group: 'adjust',
        params: [{ key: 'levels', label: 'Levels', min: 2, max: 32, default: 4 }],
        apply: posterize,
    },
    {
        type: 'threshold',
        label: 'Threshold',
        group: 'adjust',
        params: [{ key: 'level', label: 'Level', min: 1, max: 255, default: 128 }],
        apply: threshold,
    },
    {
        type: 'blur',
        label: 'Gaussian Blur',
        group: 'filter',
        params: [{ key: 'radius', label: 'Radius', min: 0, max: 50, step: 0.5, default: 2, unit: 'px' }],
        apply: blur,
    },
    {
        type: 'sharpen',
        label: 'Unsharp Mask',
        group: 'filter',
        params: [
            { key: 'amount', label: 'Amount', min: 0, max: 500, default: 100, unit: '%' },
            { key: 'radius', label: 'Radius', min: 0.5, max: 20, step: 0.5, default: 1.5, unit: 'px' },
            { key: 'threshold', label: 'Threshold', min: 0, max: 255, default: 0 },
        ],
        apply: sharpen,
    },
    {
        type: 'noise',
        label: 'Add Noise',
        group: 'filter',
        params: [
            { key: 'amount', label: 'Amount', min: 0, max: 100, default: 12, unit: '%' },
            { key: 'mono', label: 'Type', min: 0, max: 1, default: 0, options: ['Color', 'Monochrome'] },
            { key: 'seed', label: 'Seed', min: 0, max: 999, default: 1 },
        ],
        apply: noise,
    },
    {
        type: 'pixelate',
        label: 'Mosaic',
        group: 'filter',
        params: [{ key: 'size', label: 'Cell size', min: 2, max: 128, default: 8, unit: 'px' }],
        apply: pixelate,
    },
    {
        type: 'vignette',
        label: 'Vignette',
        group: 'filter',
        params: [
            { key: 'amount', label: 'Amount', min: 0, max: 100, default: 50, unit: '%' },
            { key: 'size', label: 'Clear center', min: 0, max: 95, default: 40, unit: '%' },
        ],
        apply: vignette,
    },
    {
        type: 'rgbShift',
        label: 'RGB Split',
        group: 'glitch',
        params: [
            { key: 'redX', label: 'Red X', min: -100, max: 100, default: 6, unit: 'px' },
            { key: 'redY', label: 'Red Y', min: -100, max: 100, default: 0, unit: 'px' },
            { key: 'blueX', label: 'Blue X', min: -100, max: 100, default: -6, unit: 'px' },
            { key: 'blueY', label: 'Blue Y', min: -100, max: 100, default: 0, unit: 'px' },
        ],
        apply: rgbShift,
    },
    {
        type: 'scanlines',
        label: 'Scanlines',
        group: 'glitch',
        params: [
            { key: 'spacing', label: 'Spacing', min: 2, max: 32, default: 4, unit: 'px' },
            { key: 'thickness', label: 'Thickness', min: 1, max: 16, default: 1, unit: 'px' },
            { key: 'intensity', label: 'Intensity', min: 0, max: 100, default: 40, unit: '%' },
            { key: 'direction', label: 'Direction', min: 0, max: 1, default: 0, options: DIRECTION },
        ],
        apply: scanlines,
    },
    {
        type: 'pixelSort',
        label: 'Pixel Sort',
        group: 'glitch',
        params: [
            { key: 'low', label: 'Low', min: 0, max: 255, default: 60 },
            { key: 'high', label: 'High', min: 0, max: 255, default: 220 },
            { key: 'direction', label: 'Direction', min: 0, max: 1, default: 0, options: DIRECTION },
            { key: 'order', label: 'Order', min: 0, max: 1, default: 0, options: ['Dark → light', 'Light → dark'] },
        ],
        apply: pixelSort,
    },
    {
        type: 'sliceShift',
        label: 'Slice Shift',
        group: 'glitch',
        params: [
            { key: 'amount', label: 'Max offset', min: 0, max: 100, default: 10, unit: '%' },
            { key: 'height', label: 'Band height', min: 1, max: 200, default: 12, unit: 'px' },
            { key: 'density', label: 'Density', min: 0, max: 100, default: 30, unit: '%' },
            { key: 'seed', label: 'Seed', min: 0, max: 999, default: 1 },
        ],
        apply: sliceShift,
    },
];

export const EFFECT_DEFS: Record<EffectType, EffectDef> = Object.fromEntries(EFFECTS.map(e => [e.type, e])) as Record<
    EffectType,
    EffectDef
>;

let effectCounter = 0;

export const makeEffect = (type: EffectType, params: EffectParams = {}): Effect => ({
    id:
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `fx-${++effectCounter}-${Date.now()}`,
    type,
    enabled: true,
    params: { ...Object.fromEntries(EFFECT_DEFS[type].params.map(p => [p.key, p.default])), ...params },
});

/** runs the enabled effects top to bottom; returns the input untouched when none apply */
export const applyEffects = (img: ImageData, effects: readonly Effect[]): ImageData => {
    let out = img;
    for (const fx of effects) {
        if (!fx.enabled) continue;
        const def = EFFECT_DEFS[fx.type];
        if (!def) continue; // unknown type from a newer project file
        out = def.apply(out, fx.params);
    }
    return out;
};

/** stable identity of an effect stack's output, for render caching */
export const effectsKey = (effects: readonly Effect[]): string =>
    JSON.stringify(effects.filter(e => e.enabled).map(e => [e.type, e.params]));
