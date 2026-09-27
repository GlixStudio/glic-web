// Glitch layer stack: each layer holds a FULL-FRAME glitch render; its mask,
// opacity, and blend mode are applied at composite time. That makes every
// masking decision non-destructive - soften a mask, dial opacity, or switch
// blend modes after encoding without re-running the codec.

import type { Mask } from './selection';
import type { CodecConfig } from './Codec';

export type BlendMode =
    | 'normal'
    | 'multiply'
    | 'screen'
    | 'overlay'
    | 'darken'
    | 'lighten'
    | 'difference'
    | 'add';

export const BLEND_MODES: { label: string; value: BlendMode }[] = [
    { label: 'Normal', value: 'normal' },
    { label: 'Multiply', value: 'multiply' },
    { label: 'Screen', value: 'screen' },
    { label: 'Overlay', value: 'overlay' },
    { label: 'Darken', value: 'darken' },
    { label: 'Lighten', value: 'lighten' },
    { label: 'Difference', value: 'difference' },
    { label: 'Add', value: 'add' },
];

export interface GlitchLayer {
    id: string;
    name: string;
    visible: boolean;
    opacity: number; // 0..100
    blendMode: BlendMode;
    /** applied at composite time; null = whole frame */
    mask: Mask | null;
    /** full-frame glitch render */
    result: ImageData;
    /** the .glic stream this layer's encode produced */
    file: Uint8Array | null;
    resolved: CodecConfig | null;
    /** small preview dataURL, maintained by the UI */
    thumb: string | null;
}

export const MAX_LAYERS = 10;

let layerCounter = 0;

export const makeLayer = (
    name: string,
    result: ImageData,
    init: Partial<Pick<GlitchLayer, 'mask' | 'file' | 'resolved' | 'thumb'>> = {}
): GlitchLayer => ({
    id:
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `layer-${++layerCounter}-${Date.now()}`,
    name,
    visible: true,
    opacity: 100,
    blendMode: 'normal',
    mask: init.mask ?? null,
    result,
    file: init.file ?? null,
    resolved: init.resolved ?? null,
    thumb: init.thumb ?? null,
});

/** blend(s = layer value, b = base/under value), both 0..255 */
const blendChannel = (mode: BlendMode): ((s: number, b: number) => number) => {
    switch (mode) {
        case 'multiply':
            return (s, b) => (s * b) / 255;
        case 'screen':
            return (s, b) => 255 - ((255 - s) * (255 - b)) / 255;
        case 'overlay':
            return (s, b) => (b < 128 ? (2 * s * b) / 255 : 255 - (2 * (255 - s) * (255 - b)) / 255);
        case 'darken':
            return (s, b) => Math.min(s, b);
        case 'lighten':
            return (s, b) => Math.max(s, b);
        case 'difference':
            return (s, b) => Math.abs(s - b);
        case 'add':
            return (s, b) => Math.min(255, s + b);
        default:
            return s => s;
    }
};

/**
 * Composites the layer stack (bottom -> top) over the source image.
 * Per pixel: out = lerp(under, blend(mode, layer, under), mask/255 * opacity/100).
 * Layers that are hidden, fully transparent, or of mismatched dimensions are skipped.
 */
export const compositeLayers = (source: ImageData, layers: GlitchLayer[]): ImageData => {
    const w = source.width;
    const h = source.height;
    const n = w * h;
    const out = new Uint8ClampedArray(source.data);

    for (const layer of layers) {
        if (!layer.visible || layer.opacity <= 0) continue;
        if (layer.result.width !== w || layer.result.height !== h) continue;
        const mask = layer.mask && layer.mask.length === n ? layer.mask : null;
        const g = layer.result.data;
        const m0 = layer.opacity / 100;

        // fast path: full-frame normal at 100%
        if (!mask && m0 === 1 && layer.blendMode === 'normal') {
            out.set(g);
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
