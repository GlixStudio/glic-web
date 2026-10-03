// What the editor has made, as the gallery sees it: whether there is an
// encode to share, tags describing how it was made, and the image-only project
// a post carries when its maker keeps the layers to themselves.

import type { CodecConfig } from '../core/Codec';
import { getColorSpaceName } from '../core/ColorSpaces';
import { EFFECT_DEFS, type Effect } from '../core/effects';
import { BLEND_MODES, type BlendMode, type LayerKind } from '../core/layers';
import type { ProjectRecord } from '../core/projects';
import { getWaveletName, WAVELET_NONE, WAVELET_RANDOM } from '../core/Wavelets';
import { imageDataToPngBlob, imageDataToThumbnail } from '../core/imageio';

interface LayerLike {
    kind: LayerKind;
    blendMode: BlendMode;
    effects: Effect[];
    file: Uint8Array | null;
    resolved: CodecConfig | null;
}

/** a layer the codec produced (an encode or a decoded .glic), not a pasted picture */
const isEncoded = (l: LayerLike) => l.kind !== 'adjustment' && (!!l.file || !!l.resolved);

/** sharing opens once the canvas holds at least one encode */
export const hasEncode = (layers: LayerLike[]) => layers.some(isEncoded);

export const MAX_TAGS = 12;

/** a tag the API accepts: lowercase letters, digits, _ and -, up to 32 */
export const toTag = (s: string) =>
    s
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^\p{L}\p{N}_]+/gu, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 32)
        .replace(/-+$/, '');

/**
 * Tags from how the piece was made, most telling first: the preset, then each
 * encoded layer's colour space and wavelets (as resolved, so "random" becomes
 * what the codec actually picked), then effects and blend modes in use.
 */
export const autoTags = (layers: LayerLike[], presetName: string | null): string[] => {
    const tags: string[] = [];
    const add = (raw: string) => {
        // '~b-' marks GLIX's own presets and wavelets in the pickers; the name is the tag
        const t = toTag(raw.replace(/^~b-\s*/, ''));
        if (t && !tags.includes(t)) tags.push(t);
    };
    if (presetName) add(presetName);
    const encoded = layers.filter(isEncoded);
    for (const l of encoded) if (l.resolved) add(getColorSpaceName(l.resolved.colorspace));
    for (const l of encoded) {
        if (!l.resolved) continue;
        for (let ch = 0; ch < 3; ch++) {
            const id = l.resolved.transform_method[ch];
            if (id !== WAVELET_NONE && id !== WAVELET_RANDOM) add(getWaveletName(id));
        }
    }
    for (const l of layers) for (const e of l.effects) if (e.enabled) add(EFFECT_DEFS[e.type]?.label ?? e.type);
    for (const l of layers) {
        if (l.blendMode === 'normal') continue;
        add(BLEND_MODES.find(b => b.value === l.blendMode)?.label ?? l.blendMode);
    }
    return tags.slice(0, MAX_TAGS);
};

/** the shared picture as a project of its own: open it and encode on top */
export const imageOnlyProject = async (
    view: ImageData,
    name: string,
    config: CodecConfig,
    separateChannels: boolean
): Promise<ProjectRecord> => ({
    id: crypto.randomUUID(),
    name,
    updatedAt: Date.now(),
    width: view.width,
    height: view.height,
    thumb: imageDataToThumbnail(view, null, 96),
    source: await imageDataToPngBlob(view),
    layers: [],
    activeLayerIndex: -1,
    config,
    separateChannels,
    backgroundVisible: true,
    backgroundLocked: true,
});
