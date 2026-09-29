// Glitch layer stack: each layer holds a FULL-FRAME glitch render; its mask,
// opacity, and blend mode are applied at composite time. That makes every
// masking decision non-destructive - soften a mask, dial opacity, or switch
// blend modes after encoding without re-running the codec.

import type { Mask } from './selection';
import type { CodecConfig } from './Codec';
import { applyEffects, effectsKey, type Effect } from './effects';

export type BlendMode =
    | 'normal'
    | 'multiply'
    | 'screen'
    | 'overlay'
    | 'darken'
    | 'lighten'
    | 'colorDodge'
    | 'colorBurn'
    | 'hardLight'
    | 'softLight'
    | 'linearLight'
    | 'difference'
    | 'exclusion'
    | 'add'
    | 'subtract'
    | 'divide'
    | 'hue'
    | 'saturation'
    | 'color'
    | 'luminosity';

/** Photoshop's menu order; `group` starts a new separated section in the picker. */
export const BLEND_MODES: { label: string; value: BlendMode; group?: true }[] = [
    { label: 'Normal', value: 'normal' },
    { label: 'Darken', value: 'darken', group: true },
    { label: 'Multiply', value: 'multiply' },
    { label: 'Color Burn', value: 'colorBurn' },
    { label: 'Lighten', value: 'lighten', group: true },
    { label: 'Screen', value: 'screen' },
    { label: 'Color Dodge', value: 'colorDodge' },
    { label: 'Linear Dodge (Add)', value: 'add' },
    { label: 'Overlay', value: 'overlay', group: true },
    { label: 'Soft Light', value: 'softLight' },
    { label: 'Hard Light', value: 'hardLight' },
    { label: 'Linear Light', value: 'linearLight' },
    { label: 'Difference', value: 'difference', group: true },
    { label: 'Exclusion', value: 'exclusion' },
    { label: 'Subtract', value: 'subtract' },
    { label: 'Divide', value: 'divide' },
    { label: 'Hue', value: 'hue', group: true },
    { label: 'Saturation', value: 'saturation' },
    { label: 'Color', value: 'color' },
    { label: 'Luminosity', value: 'luminosity' },
];

/**
 * pixel: carries its own full-frame render (an encode, a decode, a merge).
 * adjustment: carries no pixels - its effects run on the composite beneath it,
 * like a Photoshop adjustment layer.
 */
export type LayerKind = 'pixel' | 'adjustment';

export interface GlitchLayer {
    id: string;
    kind: LayerKind;
    name: string;
    visible: boolean;
    opacity: number; // 0..100
    blendMode: BlendMode;
    /** applied at composite time; null = whole frame */
    mask: Mask | null;
    /** full-frame glitch render; null for adjustment layers */
    result: ImageData | null;
    /** non-destructive effect stack, applied before blending (top to bottom) */
    effects: Effect[];
    /** the .glic stream this layer's encode produced */
    file: Uint8Array | null;
    resolved: CodecConfig | null;
    /** small preview dataURL, maintained by the UI */
    thumb: string | null;
}

// Layers are limited by memory, not by count: each one carries a full-frame
// ImageData (plus mask and .glic stream), so small images can stack dozens of
// layers while print-size sources hit an honest RAM ceiling instead of a tab crash.
export const LAYER_MEMORY_BUDGET = 800 * 1024 * 1024; // bytes

export const layerUsageBytes = (layers: GlitchLayer[]): number =>
    layers.reduce(
        (sum, l) =>
            sum +
            (l.result ? l.result.data.byteLength : 0) +
            (l.mask ? l.mask.byteLength : 0) +
            (l.file ? l.file.byteLength : 0),
        0
    );

export interface LayerBudget {
    ok: boolean;
    usedMB: number;
    budgetMB: number;
}

/** Whether another full-frame layer of w x h fits within the memory budget. */
export const canAddLayer = (layers: GlitchLayer[], w: number, h: number): LayerBudget => {
    const used = layerUsageBytes(layers);
    const next = w * h * 4;
    return {
        ok: used + next <= LAYER_MEMORY_BUDGET,
        usedMB: Math.round(used / 1024 / 1024),
        budgetMB: Math.round(LAYER_MEMORY_BUDGET / 1024 / 1024),
    };
};

let layerCounter = 0;

const newLayerId = () =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `layer-${++layerCounter}-${Date.now()}`;

export const makeLayer = (
    name: string,
    result: ImageData,
    init: Partial<Pick<GlitchLayer, 'mask' | 'file' | 'resolved' | 'thumb' | 'effects'>> = {}
): GlitchLayer => ({
    id: newLayerId(),
    kind: 'pixel',
    name,
    visible: true,
    opacity: 100,
    blendMode: 'normal',
    mask: init.mask ?? null,
    result,
    effects: init.effects ?? [],
    file: init.file ?? null,
    resolved: init.resolved ?? null,
    thumb: init.thumb ?? null,
});

export const makeAdjustmentLayer = (name: string, effects: Effect[], mask: Mask | null = null): GlitchLayer => ({
    id: newLayerId(),
    kind: 'adjustment',
    name,
    visible: true,
    opacity: 100,
    blendMode: 'normal',
    mask,
    result: null,
    effects,
    file: null,
    resolved: null,
    thumb: null,
});

/** a copy with a fresh id (shares the immutable pixel/mask/stream buffers) */
export const cloneLayer = (src: GlitchLayer, name: string): GlitchLayer => ({
    ...src,
    id: newLayerId(),
    name,
    effects: src.effects.map(e => ({ ...e, params: { ...e.params } })),
});

// A pixel layer's effected render only changes when its pixels or its effect
// settings do, so it is cached per render; opacity/blend/mask tweaks and edits
// to other layers recomposite without re-running blurs or pixel sorts.
const renderCache = new WeakMap<ImageData, { key: string; out: ImageData }>();

/** a pixel layer's result with its effect stack applied (cached) */
export const layerRender = (layer: GlitchLayer): ImageData | null => {
    if (!layer.result) return null;
    if (!layer.effects.some(e => e.enabled)) return layer.result;
    const key = effectsKey(layer.effects);
    const hit = renderCache.get(layer.result);
    if (hit && hit.key === key) return hit.out;
    const out = applyEffects(layer.result, layer.effects);
    renderCache.set(layer.result, { key, out });
    return out;
};

/** blend(s = layer value, b = base/under value), both 0..255 */
const blendChannel = (mode: BlendMode): ((s: number, b: number) => number) => {
    switch (mode) {
        case 'multiply':
            return (s, b) => (s * b) / 255;
        case 'screen':
            return (s, b) => 255 - ((255 - s) * (255 - b)) / 255;
        case 'overlay':
            return (s, b) => (b < 128 ? (2 * s * b) / 255 : 255 - (2 * (255 - s) * (255 - b)) / 255);
        case 'hardLight':
            return (s, b) => (s < 128 ? (2 * s * b) / 255 : 255 - (2 * (255 - s) * (255 - b)) / 255);
        case 'softLight':
            // W3C compositing spec formula (what browsers and Photoshop CC use)
            return (s, b) => {
                const cs = s / 255;
                const cb = b / 255;
                if (cs <= 0.5) return 255 * (cb - (1 - 2 * cs) * cb * (1 - cb));
                const d = cb <= 0.25 ? ((16 * cb - 12) * cb + 4) * cb : Math.sqrt(cb);
                return 255 * (cb + (2 * cs - 1) * (d - cb));
            };
        case 'linearLight':
            return (s, b) => b + 2 * s - 255;
        case 'colorDodge':
            return (s, b) => (b === 0 ? 0 : s === 255 ? 255 : Math.min(255, (b * 255) / (255 - s)));
        case 'colorBurn':
            return (s, b) => (b === 255 ? 255 : s === 0 ? 0 : 255 - Math.min(255, ((255 - b) * 255) / s));
        case 'darken':
            return (s, b) => Math.min(s, b);
        case 'lighten':
            return (s, b) => Math.max(s, b);
        case 'difference':
            return (s, b) => Math.abs(s - b);
        case 'exclusion':
            return (s, b) => s + b - (2 * s * b) / 255;
        case 'add':
            return (s, b) => Math.min(255, s + b);
        case 'subtract':
            return (s, b) => Math.max(0, b - s);
        case 'divide':
            return (s, b) => (s === 0 ? (b === 0 ? 0 : 255) : Math.min(255, (b * 255) / s));
        default:
            return s => s;
    }
};

// --- non-separable modes (W3C compositing spec: Lum / SetLum / Sat / SetSat) ---

const lum = (r: number, g: number, b: number) => 0.3 * r + 0.59 * g + 0.11 * b;

const clipColor = (c: [number, number, number]): [number, number, number] => {
    const l = lum(c[0], c[1], c[2]);
    const n = Math.min(c[0], c[1], c[2]);
    const x = Math.max(c[0], c[1], c[2]);
    if (n < 0) for (let i = 0; i < 3; i++) c[i] = l + ((c[i] - l) * l) / (l - n);
    if (x > 255) for (let i = 0; i < 3; i++) c[i] = l + ((c[i] - l) * (255 - l)) / (x - l);
    return c;
};

const setLum = (r: number, g: number, b: number, l: number) => {
    const d = l - lum(r, g, b);
    return clipColor([r + d, g + d, b + d]);
};

const sat = (r: number, g: number, b: number) => Math.max(r, g, b) - Math.min(r, g, b);

const setSat = (r: number, g: number, b: number, s: number): [number, number, number] => {
    const c: [number, number, number] = [r, g, b];
    const idx = [0, 1, 2].sort((i, j) => c[i] - c[j]);
    const [lo, mid, hi] = idx;
    const out: [number, number, number] = [0, 0, 0];
    if (c[hi] > c[lo]) {
        out[mid] = ((c[mid] - c[lo]) * s) / (c[hi] - c[lo]);
        out[hi] = s;
    }
    return out;
};

type RGBBlend = (sr: number, sg: number, sb: number, br: number, bg: number, bb: number) => [number, number, number];

const blendPixel = (mode: BlendMode): RGBBlend | null => {
    switch (mode) {
        case 'hue':
            return (sr, sg, sb, br, bg, bb) => {
                const c = setSat(sr, sg, sb, sat(br, bg, bb));
                return setLum(c[0], c[1], c[2], lum(br, bg, bb));
            };
        case 'saturation':
            return (sr, sg, sb, br, bg, bb) => {
                const c = setSat(br, bg, bb, sat(sr, sg, sb));
                return setLum(c[0], c[1], c[2], lum(br, bg, bb));
            };
        case 'color':
            return (sr, sg, sb, br, bg, bb) => setLum(sr, sg, sb, lum(br, bg, bb));
        case 'luminosity':
            return (sr, sg, sb, br, bg, bb) => setLum(br, bg, bb, lum(sr, sg, sb));
        default:
            return null;
    }
};

/**
 * Composites the layer stack (bottom -> top) over the source image.
 * Per pixel: out = lerp(under, blend(mode, layer, under), mask/255 * opacity/100),
 * where `layer` is a pixel layer's effected render, or for an adjustment layer
 * its effects applied to everything composited so far.
 * Layers that are hidden, fully transparent, or of mismatched dimensions are skipped.
 */
export const compositeLayers = (source: ImageData, layers: GlitchLayer[]): ImageData => {
    const w = source.width;
    const h = source.height;
    const n = w * h;
    const out = new Uint8ClampedArray(source.data);

    for (const layer of layers) {
        if (!layer.visible || layer.opacity <= 0) continue;
        let render: ImageData | null;
        if (layer.kind === 'adjustment') {
            if (!layer.effects.some(e => e.enabled)) continue;
            render = applyEffects(new ImageData(out, w, h), layer.effects);
        } else {
            render = layerRender(layer);
        }
        if (!render || render.width !== w || render.height !== h) continue;
        const mask = layer.mask && layer.mask.length === n ? layer.mask : null;
        const g = render.data;
        const m0 = layer.opacity / 100;

        // fast path: full-frame normal at 100%
        if (!mask && m0 === 1 && layer.blendMode === 'normal') {
            out.set(g);
            continue;
        }

        const px = blendPixel(layer.blendMode);
        if (px) {
            for (let i = 0; i < n; i++) {
                const m = mask ? (mask[i] / 255) * m0 : m0;
                if (m === 0) continue;
                const o = i * 4;
                const c = px(g[o], g[o + 1], g[o + 2], out[o], out[o + 1], out[o + 2]);
                out[o] = out[o] + (c[0] - out[o]) * m;
                out[o + 1] = out[o + 1] + (c[1] - out[o + 1]) * m;
                out[o + 2] = out[o + 2] + (c[2] - out[o + 2]) * m;
                out[o + 3] = out[o + 3] + (g[o + 3] - out[o + 3]) * m;
            }
            continue;
        }

        const blend = blendChannel(layer.blendMode);
        for (let i = 0; i < n; i++) {
            const m = mask ? (mask[i] / 255) * m0 : m0;
            if (m === 0) continue;
            const o = i * 4;
            out[o] = out[o] + (blend(g[o], out[o]) - out[o]) * m;
            out[o + 1] = out[o + 1] + (blend(g[o + 1], out[o + 1]) - out[o + 1]) * m;
            out[o + 2] = out[o + 2] + (blend(g[o + 2], out[o + 2]) - out[o + 2]) * m;
            out[o + 3] = out[o + 3] + (g[o + 3] - out[o + 3]) * m;
        }
    }

    return new ImageData(out, w, h);
};
