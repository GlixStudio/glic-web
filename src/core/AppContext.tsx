import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CodecConfig, cloneConfig } from './Codec';
import { glicEngine, type ChannelProgress } from './engine';
import type { Segment } from './Planes';
import { combine, compositeWithMask, invertMask, isEmptyMask, type CombineMode, type Mask } from './selection';
import { putMask, removeMask, loadMasks, maskThumbnail, newMaskId, type SavedMask } from './maskStore';
import {
    resampleImage,
    resampleMask,
    resizeCanvas as resizeCanvasImage,
    resizeCanvasMask,
    orientImage,
    orientMask,
    type Orient,
    type Anchor,
    type ResampleMethod,
} from './resize';
import {
    compositeLayers,
    makeLayer,
    makeAdjustmentLayer,
    cloneLayer,
    canAddLayer,
    transparentLike,
    type GlitchLayer,
} from './layers';
import { EFFECT_DEFS, makeEffect, type Effect, type EffectType } from './effects';
import { placeOnCanvas } from './place';
import { maskBounds, applyMaskAlpha, cropImage } from './exportImage';
import { IDENTITY_TRANSFORM, isIdentity, transformImage, transformMask, untransformMask, type LayerTransform } from './transform';
import {
    imageDataToThumbnail,
    layerThumbnail,
    imageDataToPngBlob,
    blobToImageData,
    imageDataToCanvas,
    canvasToPngBlob,
    downloadBlob,
    timestampedFilename,
} from './imageio';
import {
    saveProjectRecord,
    getProject,
    nextProjectName,
    type ProjectRecord,
    type StoredLayer,
} from './projects';

import { DEFAULT_FILTERS, type ImageFilters } from './filters';

export interface Toast {
    id: number;
    kind: 'info' | 'error' | 'success';
    text: string;
}

interface HistoryEntry {
    layers: GlitchLayer[];
    activeLayerId: string | null;
    originalImage: ImageData | null;
}

const MAX_HISTORY = 10;

interface AppState {
    config: CodecConfig;
    setConfig: (c: CodecConfig) => void;
    updateConfig: (fn: (c: CodecConfig) => void) => void;
    /** false: edits apply to all three channels (original "separate channels" off) */
    separateChannels: boolean;
    setSeparateChannels: (b: boolean) => void;

    originalImage: ImageData | null;
    /** composite of the layer stack over the source; null while the stack is empty */
    processed: ImageData | null;

    // --- glitch layer stack (bottom -> top), over the source as a locked Background ---
    layers: GlitchLayer[];
    /** null = the Background (the imported source image) is active */
    activeLayerId: string | null;
    /** false: the Background is hidden and the stack composites over transparency */
    backgroundVisible: boolean;
    /** locked (the default) pins the Background visible; unlock it to hide it */
    backgroundLocked: boolean;
    setBackgroundVisible: (v: boolean) => void;
    setBackgroundLocked: (v: boolean) => void;
    setActiveLayerId: (id: string | null) => void;
    /** non-structural edits: visibility, opacity, blend, name, mask, thumb */
    updateLayer: (id: string, patch: Partial<GlitchLayer>) => void;
    moveLayer: (id: string, dir: 1 | -1) => void;
    /** drag-and-drop reorder: moves the layer to stack index `to` (0 = just above the Background) */
    reorderLayer: (id: string, to: number) => void;
    duplicateLayer: (id: string) => void;
    deleteLayer: (id: string) => void;
    flatten: () => void;
    /** merges a layer into the one beneath it (the bottom layer merges into the Background) */
    mergeDown: (id: string) => void;
    /** replaces every visible layer with one layer of what you see */
    mergeVisible: () => void;
    invertLayerMask: (id: string) => void;
    /** move / scale / rotate / flip a layer non-destructively; pushUndo at the start of a gesture */
    setLayerTransform: (id: string, t: LayerTransform, pushUndo?: boolean) => void;
    /** Delete: removes the selected area from the active layer (through its mask) */
    clearSelectedPixels: () => void;
    /** ⌘J / ⇧⌘J with a selection: the selected part of the active layer (or Background) as a new layer */
    layerViaCopy: (cut: boolean) => void;
    /** paste / drop / upload onto the open canvas: the image as a new layer above the active one */
    placeImageAsLayer: (img: ImageData, name?: string) => void;
    /** adds an adjustment layer above the active one (the selection becomes its mask) */
    addAdjustmentLayer: (type: EffectType) => void;

    // --- per-layer effect stacks ---
    addEffect: (layerId: string, type: EffectType) => void;
    updateEffect: (layerId: string, effectId: string, patch: Partial<Pick<Effect, 'enabled' | 'params'>>) => void;
    removeEffect: (layerId: string, effectId: string) => void;
    moveEffect: (layerId: string, effectId: string, dir: 1 | -1) => void;
    /** replaces the active layer's mask from the working selection (regenerates thumb) */
    setLayerMaskFromSelection: (id: string) => void;

    /** the active layer's .glic stream (what Save .glic writes) */
    encodedFile: Uint8Array | null;
    /** resolved config of the most recent encode (for random-choice display) */
    resolved: CodecConfig | null;
    lastSegments: Segment[][] | null;

    isProcessing: boolean;
    progress: number | null;
    channelProgress: ChannelProgress[] | null;

    filters: ImageFilters;
    setFilters: (f: ImageFilters) => void;

    canUndo: boolean;

    /** working selection mask (image resolution) or null */
    selection: Mask | null;
    setSelection: (mask: Mask | null) => void;
    reselect: () => void;
    hasLastSelection: boolean;

    toasts: Toast[];
    toast: (kind: Toast['kind'], text: string) => void;
    dismissToast: (id: number) => void;

    loadImage: (img: ImageData) => void;

    // --- projects (persisted in the browser via IndexedDB) ---
    projectName: string;
    projectId: string | null;
    saveProject: (opts?: { name?: string; asNew?: boolean }) => Promise<void>;
    openProject: (id: string) => Promise<void>;
    newProject: () => void;

    /** downloads the composite as PNG with adjustments baked in */
    savePng: () => Promise<void>;
    /** downloads the active layer's .glic stream */
    saveGlic: () => void;
    /** ⌘C: what you see (adjustments baked in) to the clipboard as PNG - only the selection, if there is one */
    copyImage: () => Promise<void>;

    /** ENCODE / Iterate → 1 layer feed the codec the active layer's own pixels, not the composite beneath it */
    encodeLayerOnly: boolean;
    setEncodeLayerOnly: (b: boolean) => void;
    /** encodes into the active glitch layer, replacing it (on the Background / an adjustment layer: a new layer just above) */
    encodeNow: () => Promise<void>;
    /** encodes the whole composite into a new layer on top of the stack */
    newLayerEncode: () => Promise<void>;
    /** encode passes feeding on each other; the final pass lands like ENCODE (one layer) */
    iterate: (times: number) => Promise<void>;
    /** encode passes feeding on each other, every pass kept as its own new layer above the active one */
    iterateLayers: (times: number) => Promise<void>;
    undo: () => void;
    cancel: () => void;
    importGlic: (bytes: Uint8Array, overrideHeader: boolean) => Promise<void>;

    // --- mask library (persisted in the browser, independent of images/projects) ---
    masks: SavedMask[];
    /** stores a mask (image-sized) in the library; returns its id */
    saveMask: (mask: Mask, width: number, height: number, name?: string) => string;
    renameMask: (id: string, name: string) => void;
    deleteMask: (id: string) => void;
    /** a library mask at the current image size (stretched when sizes differ) */
    maskAtImageSize: (id: string) => Mask | null;
    /** combines a library mask into the working selection */
    selectFromMask: (id: string, mode: CombineMode) => void;
    /** sets a library mask as the active layer's mask */
    applyMaskToLayer: (id: string) => void;

    // --- image / canvas size ---
    resizeImage: (width: number, height: number, method: ResampleMethod) => void;
    resizeCanvas: (width: number, height: number, anchor: Anchor, fill: [number, number, number, number]) => void;
    /** Image > Image Rotation: quarter turns and flips of the whole document */
    orientCanvas: (o: Orient, label: string) => void;
}

const AppContext = createContext<AppState | undefined>(undefined);

const nextLayerName = (layers: GlitchLayer[]): string => {
    let n = 0;
    for (const l of layers) {
        const m = /^Layer (\d+)$/.exec(l.name);
        if (m) n = Math.max(n, parseInt(m[1]));
    }
    return `Layer ${n + 1}`;
};

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [config, setConfig] = useState<CodecConfig>(() => new CodecConfig());
    const [separateChannels, setSeparateChannels] = useState(false);
    const [originalImage, setOriginalImage] = useState<ImageData | null>(null);
    const [layers, setLayers] = useState<GlitchLayer[]>([]);
    const [activeLayerId, setActiveLayerIdState] = useState<string | null>(null);
    const [backgroundVisible, setBackgroundVisibleState] = useState(true);
    const [backgroundLocked, setBackgroundLockedState] = useState(true);
    const [resolved, setResolved] = useState<CodecConfig | null>(null);
    const [lastSegments, setLastSegments] = useState<Segment[][] | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [encodeLayerOnly, setEncodeLayerOnly] = useState(false);
    const [progress, setProgress] = useState<number | null>(null);
    const [channelProgress, setChannelProgress] = useState<ChannelProgress[] | null>(null);
    const [filters, setFilters] = useState<ImageFilters>(DEFAULT_FILTERS);
    const [history, setHistory] = useState<HistoryEntry[]>([]);
    const [toasts, setToasts] = useState<Toast[]>([]);
    const [selection, setSelectionState] = useState<Mask | null>(null);
    const [lastSelection, setLastSelection] = useState<Mask | null>(null);
    const [projectId, setProjectId] = useState<string | null>(null);
    const [projectName, setProjectName] = useState('Untitled');
    const [masks, setMasks] = useState<SavedMask[]>([]);

    const configRef = useRef(config);
    configRef.current = config;
    const selectionRef = useRef(selection);
    selectionRef.current = selection;
    const layersRef = useRef(layers);
    layersRef.current = layers;
    const activeIdRef = useRef(activeLayerId);
    activeIdRef.current = activeLayerId;
    const originalRef = useRef(originalImage);
    originalRef.current = originalImage;
    const projectIdRef = useRef(projectId);
    projectIdRef.current = projectId;
    const projectNameRef = useRef(projectName);
    projectNameRef.current = projectName;
    const filtersRef = useRef(filters);
    filtersRef.current = filters;
    const toastId = useRef(0);
    const masksRef = useRef(masks);
    masksRef.current = masks;

    const bgVisibleRef = useRef(backgroundVisible);
    bgVisibleRef.current = backgroundVisible;
    /** what the stack composites over: the source, or transparency while the Background is hidden */
    const baseOf = useCallback((source: ImageData) => (bgVisibleRef.current ? source : transparentLike(source)), []);

    const processed = useMemo(
        () =>
            originalImage && (layers.length > 0 || !backgroundVisible)
                ? compositeLayers(backgroundVisible ? originalImage : transparentLike(originalImage), layers)
                : null,
        [originalImage, layers, backgroundVisible]
    );

    const setBackgroundLocked = useCallback((locked: boolean) => {
        setBackgroundLockedState(locked);
        if (locked) setBackgroundVisibleState(true); // the lock pins it visible
    }, []);

    const setBackgroundVisible = useCallback((v: boolean) => {
        setBackgroundVisibleState(v);
        if (!v) setBackgroundLockedState(false);
    }, []);

    const resetBackground = useCallback(() => {
        setBackgroundVisibleState(true);
        setBackgroundLockedState(true);
    }, []);

    const processedRef = useRef(processed);
    processedRef.current = processed;

    const activeLayer = layers.find(l => l.id === activeLayerId) ?? null;

    const toast = useCallback((kind: Toast['kind'], text: string) => {
        const id = ++toastId.current;
        setToasts(t => [...t, { id, kind, text }]);
        window.setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), kind === 'error' ? 6000 : 3500);
    }, []);

    const dismissToast = useCallback((id: number) => {
        setToasts(t => t.filter(x => x.id !== id));
    }, []);

    /** one-time beginner hints, remembered per browser */
    const onceHint = useCallback(
        (key: string, text: string) => {
            try {
                if (localStorage.getItem(key)) return;
                localStorage.setItem(key, '1');
            } catch {
                return;
            }
            toast('info', text);
        },
        [toast]
    );

    const updateConfig = useCallback((fn: (c: CodecConfig) => void) => {
        const next = cloneConfig(configRef.current);
        fn(next);
        setConfig(next);
    }, []);

    const loadImage = useCallback((img: ImageData) => {
        setOriginalImage(img);
        resetBackground();
        setLayers([]);
        setActiveLayerIdState(null);
        setResolved(null);
        setLastSegments(null);
        setHistory([]);
        setSelectionState(null);
        setLastSelection(null);
        setProjectId(null);
        setProjectName('Untitled');
        onceHint('glic_hint_load_v1', 'Image loaded - press E to encode, or pick a preset first');
    }, [onceHint, resetBackground]);

    const setSelection = useCallback((mask: Mask | null) => {
        setSelectionState(prev => {
            if (mask === null && prev) setLastSelection(prev);
            return mask && isEmptyMask(mask) ? null : mask;
        });
    }, []);

    const reselect = useCallback(() => {
        setLastSelection(last => {
            if (last) setSelectionState(last);
            return last;
        });
    }, []);

    /** structural-op snapshot (layer refs are shared; results are replaced wholesale) */
    const snapshot = useCallback(() => {
        const entry: HistoryEntry = {
            layers: layersRef.current,
            activeLayerId: activeIdRef.current,
            originalImage: originalRef.current,
        };
        setHistory(h => [...h, entry].slice(-MAX_HISTORY));
    }, []);

    const undo = useCallback(() => {
        setHistory(h => {
            if (h.length === 0) return h;
            const last = h[h.length - 1];
            setLayers(last.layers);
            setActiveLayerIdState(last.activeLayerId);
            setOriginalImage(last.originalImage);
            const img = last.originalImage;
            const sel = selectionRef.current;
            if (sel && (!img || sel.length !== img.width * img.height)) {
                // undoing a resize: the working selection belongs to the other size
                setSelectionState(null);
                setLastSelection(null);
            }
            return h.slice(0, -1);
        });
    }, []);

    // --- layer operations ---

    const setActiveLayerId = useCallback((id: string | null) => {
        if (id === null || layersRef.current.some(l => l.id === id)) setActiveLayerIdState(id);
    }, []);

    const updateLayer = useCallback((id: string, patch: Partial<GlitchLayer>) => {
        setLayers(ls => ls.map(l => (l.id === id ? { ...l, ...patch } : l)));
    }, []);

    const moveLayer = useCallback(
        (id: string, dir: 1 | -1) => {
            const ls = layersRef.current;
            const i = ls.findIndex(l => l.id === id);
            const j = i + dir;
            if (i < 0 || j < 0 || j >= ls.length) return;
            snapshot();
            const next = [...ls];
            [next[i], next[j]] = [next[j], next[i]];
            setLayers(next);
        },
        [snapshot]
    );

    const duplicateLayer = useCallback(
        (id: string) => {
            const ls = layersRef.current;
            const i = ls.findIndex(l => l.id === id);
            if (i < 0) return;
            const src = ls[i];
            const img = originalRef.current;
            const budget = src.result && img ? canAddLayer(ls, img.width, img.height) : { ok: true, usedMB: 0, budgetMB: 0 };
            if (!budget.ok) {
                toast('error', `Layer memory is full (${budget.usedMB} of ${budget.budgetMB} MB) - flatten or delete layers to continue`);
                return;
            }
            snapshot();
            const copy = cloneLayer(src, `${src.name} copy`);
            const next = [...ls];
            next.splice(i + 1, 0, copy);
            setLayers(next);
            setActiveLayerIdState(copy.id);
        },
        [snapshot, toast]
    );

    const deleteLayer = useCallback(
        (id: string) => {
            const ls = layersRef.current;
            const i = ls.findIndex(l => l.id === id);
            if (i < 0) return;
            snapshot();
            const next = ls.filter(l => l.id !== id);
            setLayers(next);
            if (activeIdRef.current === id) {
                // like Photoshop: the layer beneath takes over, down to the Background
                setActiveLayerIdState(next[i - 1]?.id ?? null);
            }
        },
        [snapshot]
    );

    const flatten = useCallback(() => {
        const source = originalRef.current;
        const ls = layersRef.current;
        if (!source || ls.length === 0) return;
        snapshot();
        // like Photoshop, a hidden Background is discarded: the flattened image keeps the transparency
        setOriginalImage(compositeLayers(baseOf(source), ls));
        setLayers([]);
        setActiveLayerIdState(null);
        setBackgroundVisibleState(true);
        toast('info', 'Flattened - the composite is the new baseline');
    }, [snapshot, baseOf, toast]);

    const reorderLayer = useCallback(
        (id: string, to: number) => {
            const ls = layersRef.current;
            const i = ls.findIndex(l => l.id === id);
            const j = Math.max(0, Math.min(ls.length - 1, to));
            if (i < 0 || i === j) return;
            snapshot();
            const next = [...ls];
            const [moved] = next.splice(i, 1);
            next.splice(j, 0, moved);
            setLayers(next);
        },
        [snapshot]
    );

    const mergeDown = useCallback(
        (id: string) => {
            const source = originalRef.current;
            const ls = layersRef.current;
            const i = ls.findIndex(l => l.id === id);
            if (!source || i < 0) return;
            if (i === 0 && !bgVisibleRef.current) {
                toast('info', 'Show the Background to merge into it');
                return;
            }
            snapshot();
            if (i === 0) {
                // onto the Background: bake this one layer into the source
                setOriginalImage(compositeLayers(source, [ls[0]]));
                setLayers(ls.slice(1));
                setActiveLayerIdState(null);
                return;
            }
            const lower = ls[i - 1];
            const upper = ls[i];
            // The merged pixels are what the stack shows through `upper`; limiting them
            // to the union of both masks leaves untouched areas showing the layers below.
            let mask: Mask | null = null;
            if (lower.mask && upper.mask) {
                mask = new Uint8ClampedArray(lower.mask.length);
                for (let k = 0; k < mask.length; k++) mask[k] = Math.max(lower.mask[k], upper.mask[k]);
            }
            const result = compositeLayers(baseOf(source), ls.slice(0, i + 1));
            // (no .glic stream: the merged pixels are no single encode's output)
            const merged = makeLayer(lower.name, result, { mask, thumb: imageDataToThumbnail(result, mask) });
            const next = [...ls];
            next.splice(i - 1, 2, merged);
            setLayers(next);
            setActiveLayerIdState(merged.id);
        },
        [snapshot, baseOf, toast]
    );

    const mergeVisible = useCallback(() => {
        const source = originalRef.current;
        const ls = layersRef.current;
        if (!source || !ls.some(l => l.visible)) return;
        snapshot();
        const result = compositeLayers(baseOf(source), ls);
        const merged = makeLayer('Merged', result, { thumb: imageDataToThumbnail(result, null) });
        // hidden layers stay (beneath the full-frame merge, so nothing visible changes)
        setLayers([...ls.filter(l => !l.visible), merged]);
        setActiveLayerIdState(merged.id);
        toast('info', 'Merged visible layers into one');
    }, [snapshot, baseOf, toast]);

    const invertLayerMask = useCallback(
        (id: string) => {
            const layer = layersRef.current.find(l => l.id === id);
            if (!layer?.mask) return;
            snapshot();
            const mask = invertMask(layer.mask);
            updateLayer(id, { mask, thumb: layerThumbnail(layer, mask) });
        },
        [snapshot, updateLayer]
    );

    const placeImageAsLayer = useCallback(
        (img: ImageData, name?: string) => {
            const source = originalRef.current;
            if (!source) return;
            if (!canAddLayer(layersRef.current, source.width, source.height).ok) {
                toast('error', 'Layer memory is full - flatten or delete layers to continue');
                return;
            }
            const { result, mask, scaled } = placeOnCanvas(img, source.width, source.height);
            const anchorId = activeIdRef.current;
            const ls = layersRef.current;
            const layer = makeLayer(name?.trim() || nextLayerName(ls), result, { mask, thumb: imageDataToThumbnail(result, mask) });
            snapshot();
            const next = [...ls];
            const anchor = next.findIndex(l => l.id === anchorId);
            next.splice(anchorId === null ? 0 : anchor < 0 ? next.length : anchor + 1, 0, layer);
            setLayers(next);
            setActiveLayerIdState(layer.id);
            toast(
                'success',
                `Placed as ${layer.name}${scaled ? ' (shrunk to fit the canvas)' : ''} - press V to move, scale or rotate it`
            );
        },
        [snapshot, toast]
    );

    const addAdjustmentLayer = useCallback(
        (type: EffectType) => {
            if (!originalRef.current) return;
            const anchorId = activeIdRef.current;
            const sel = selectionRef.current;
            const layer = makeAdjustmentLayer(EFFECT_DEFS[type].label, [makeEffect(type)], sel ? sel.slice() : null);
            snapshot();
            const next = [...layersRef.current];
            const anchor = next.findIndex(l => l.id === anchorId);
            next.splice(anchorId === null ? 0 : anchor < 0 ? next.length : anchor + 1, 0, layer);
            setLayers(next);
            setActiveLayerIdState(layer.id);
        },
        [snapshot]
    );

    // --- effect stacks ---

    /** replaces a layer's effect list and refreshes its thumbnail (which renders the effects) */
    const setEffects = useCallback((layerId: string, fn: (fx: Effect[]) => Effect[]) => {
        setLayers(ls =>
            ls.map(l => {
                if (l.id !== layerId) return l;
                const next = { ...l, effects: fn(l.effects) };
                return next.kind === 'pixel' ? { ...next, thumb: layerThumbnail(next, next.mask) } : next;
            })
        );
    }, []);

    const addEffect = useCallback(
        (layerId: string, type: EffectType) => {
            snapshot();
            setEffects(layerId, fx => [...fx, makeEffect(type)]);
        },
        [snapshot, setEffects]
    );

    const updateEffect = useCallback(
        (layerId: string, effectId: string, patch: Partial<Pick<Effect, 'enabled' | 'params'>>) => {
            setEffects(layerId, fx =>
                fx.map(e =>
                    e.id === effectId
                        ? { ...e, ...patch, params: patch.params ? { ...e.params, ...patch.params } : e.params }
                        : e
                )
            );
        },
        [setEffects]
    );

    const removeEffect = useCallback(
        (layerId: string, effectId: string) => {
            snapshot();
            setEffects(layerId, fx => fx.filter(e => e.id !== effectId));
        },
        [snapshot, setEffects]
    );

    const moveEffect = useCallback(
        (layerId: string, effectId: string, dir: 1 | -1) => {
            const layer = layersRef.current.find(l => l.id === layerId);
            const i = layer ? layer.effects.findIndex(e => e.id === effectId) : -1;
            const j = i + dir;
            if (!layer || i < 0 || j < 0 || j >= layer.effects.length) return;
            snapshot();
            setEffects(layerId, fx => {
                const next = [...fx];
                [next[i], next[j]] = [next[j], next[i]];
                return next;
            });
        },
        [snapshot, setEffects]
    );

    const setLayerMaskFromSelection = useCallback(
        (id: string) => {
            const layer = layersRef.current.find(l => l.id === id);
            if (!layer) return;
            const sel = selectionRef.current;
            const img = originalRef.current;
            // the selection is drawn in canvas space; a moved layer's mask lives in layer space
            const mask = sel && img ? untransformMask(sel, img.width, img.height, layer.transform) : null;
            updateLayer(id, { mask, thumb: layerThumbnail(layer, mask) });
        },
        [updateLayer]
    );

    const setLayerTransform = useCallback(
        (id: string, t: LayerTransform, pushUndo = false) => {
            if (pushUndo) snapshot();
            setLayers(ls =>
                ls.map(l => {
                    if (l.id !== id) return l;
                    const next = { ...l, transform: t };
                    return { ...next, thumb: next.kind === 'pixel' ? layerThumbnail(next, next.mask) : next.thumb };
                })
            );
        },
        [snapshot]
    );

    const clearSelectedPixels = useCallback(() => {
        const sel = selectionRef.current;
        const img = originalRef.current;
        if (!sel || !img) return;
        const layer = layersRef.current.find(l => l.id === activeIdRef.current);
        if (!layer) {
            toast('info', 'The Background is locked - select a layer to delete from, or ⌘J to lift the selection onto one');
            return;
        }
        snapshot();
        const cut = untransformMask(sel, img.width, img.height, layer.transform);
        const mask = new Uint8ClampedArray(cut.length);
        for (let i = 0; i < mask.length; i++) mask[i] = ((layer.mask ? layer.mask[i] : 255) * (255 - cut[i])) / 255;
        updateLayer(layer.id, { mask, thumb: layerThumbnail(layer, mask) });
    }, [snapshot, updateLayer, toast]);

    const layerViaCopy = useCallback(
        (cut: boolean) => {
            const sel = selectionRef.current;
            const img = originalRef.current;
            if (!sel || !img) return;
            const ls = layersRef.current;
            const src = ls.find(l => l.id === activeIdRef.current) ?? null;
            if (src && !canAddLayer(ls, img.width, img.height).ok) {
                toast('error', 'Layer memory is full - flatten or delete layers to continue');
                return;
            }
            snapshot();
            let copy: GlitchLayer;
            if (!src) {
                // from the Background: its pixels, limited to the selection
                const mask = sel.slice();
                copy = makeLayer(nextLayerName(ls), img, { mask, thumb: imageDataToThumbnail(img, mask) });
                if (cut) toast('info', 'The Background is locked - copied the selection instead of cutting it');
            } else {
                const selL = untransformMask(sel, img.width, img.height, src.transform);
                const mask = new Uint8ClampedArray(selL.length);
                for (let i = 0; i < mask.length; i++) mask[i] = ((src.mask ? src.mask[i] : 255) * selL[i]) / 255;
                copy = { ...cloneLayer(src, nextLayerName(ls)), mask, file: null };
                copy.thumb = copy.kind === 'pixel' ? layerThumbnail(copy, mask) : null;
            }
            const next = [...ls];
            const at = src ? ls.indexOf(src) : -1;
            if (cut && src) {
                const selL = untransformMask(sel, img.width, img.height, src.transform);
                const rest = new Uint8ClampedArray(selL.length);
                for (let i = 0; i < rest.length; i++) rest[i] = ((src.mask ? src.mask[i] : 255) * (255 - selL[i])) / 255;
                next[at] = { ...src, mask: rest, thumb: src.kind === 'pixel' ? layerThumbnail(src, rest) : src.thumb };
            }
            next.splice(at + 1, 0, copy);
            setLayers(next);
            setActiveLayerIdState(copy.id);
            setSelectionState(null);
            toast('success', `${cut && src ? 'Cut' : 'Copied'} the selection to ${copy.name} - press V to move it`);
        },
        [snapshot, toast]
    );

    // --- encoding into layers ---

    const runEngineEncode = useCallback(async (input: ImageData) => {
        setIsProcessing(true);
        setProgress(0);
        setChannelProgress(null);
        try {
            const res = await glicEngine.encode(input, configRef.current, (perChannel, overall) => {
                setProgress(overall);
                setChannelProgress([...perChannel]);
            });
            setResolved(res.resolvedConfig);
            setLastSegments(res.segments);
            return res;
        } finally {
            setIsProcessing(false);
            setProgress(null);
            setChannelProgress(null);
        }
    }, []);

    /** composite of visible layers strictly below the given index (or the whole stack) */
    const compositeBelow = useCallback((source: ImageData, upTo: number) => {
        // always over the real source, even while the Background is hidden: this is
        // the codec's input, and glitching transparency would only yield an empty layer
        const below = upTo < 0 ? [] : layersRef.current.slice(0, upTo);
        return below.length ? compositeLayers(source, below) : source;
    }, []);

    /** where a new layer goes: right above the active one (index 0 = just above the Background) */
    const insertionIndex = useCallback((anchorId: string | null) => {
        if (anchorId === null) return 0;
        const i = layersRef.current.findIndex(l => l.id === anchorId);
        return i < 0 ? layersRef.current.length : i + 1;
    }, []);

    const memoryFull = useCallback(
        (extra: GlitchLayer[] = []) => {
            const source = originalRef.current;
            if (!source) return true;
            const budget = canAddLayer([...layersRef.current, ...extra], source.width, source.height);
            if (budget.ok) return false;
            toast('error', `Layer memory is full (${budget.usedMB} of ${budget.budgetMB} MB) - flatten or delete layers to continue`);
            return true;
        },
        [toast]
    );

    const encodedLayer = useCallback(
        (name: string, result: ImageData, file: Uint8Array | null, resolvedCfg: CodecConfig | null) => {
            const sel = selectionRef.current;
            const mask = sel ? sel.slice() : null;
            return makeLayer(name, result, { mask, file, resolved: resolvedCfg, thumb: imageDataToThumbnail(result, mask) });
        },
        []
    );

    /** the pixel layer an encode would replace, or null (Background / adjustment layer active) */
    const replaceTarget = useCallback((id: string | null) => {
        const l = layersRef.current.find(x => x.id === id);
        return l && l.kind === 'pixel' ? l : null;
    }, []);

    /** codec input for an encode aimed at `anchorId`: what is visible beneath where its result lands */
    const inputFor = useCallback(
        (source: ImageData, anchorId: string | null) => {
            const target = replaceTarget(anchorId);
            return compositeBelow(source, target ? layersRef.current.indexOf(target) : insertionIndex(anchorId));
        },
        [replaceTarget, compositeBelow, insertionIndex]
    );

    /**
     * lands an encode result: replaces the anchor if it is a glitch layer, otherwise creates
     * a layer just above it (the Background: "Layer 1"). The stack is re-resolved now - it may
     * have changed while the codec ran.
     */
    const commitEncode = useCallback(
        (anchorId: string | null, result: ImageData, file: Uint8Array | null, resolvedCfg: CodecConfig | null) => {
            const ls = layersRef.current;
            const target = replaceTarget(anchorId);
            snapshot();
            if (target) {
                const idx = ls.indexOf(target);
                const fresh = encodedLayer(target.name, result, file, resolvedCfg);
                const next = [...ls];
                // no selection = full frame; a stale mask must not survive a re-encode
                // the fresh pixels already sit where the layer is seen: the move is baked in
                next[idx] = {
                    ...target,
                    result: fresh.result,
                    file: fresh.file,
                    resolved: fresh.resolved,
                    mask: fresh.mask,
                    transform: { ...IDENTITY_TRANSFORM },
                };
                next[idx].thumb = layerThumbnail(next[idx], next[idx].mask);
                setLayers(next);
            } else {
                const layer = encodedLayer(nextLayerName(ls), result, file, resolvedCfg);
                const next = [...ls];
                next.splice(insertionIndex(anchorId), 0, layer);
                setLayers(next);
                setActiveLayerIdState(layer.id);
            }
            onceHint(
                'glic_hint_encode_v1',
                'Tip: ENCODE (E) re-runs the active layer, NEW LAYER (R) stacks a fresh one on top - draw a selection (M, W, or B) first to glitch only part of the image'
            );
        },
        [replaceTarget, snapshot, encodedLayer, insertionIndex, onceHint]
    );

    /**
     * Layer only: the active layer's own pixels as codec input, or null to encode what is
     * visible beneath it (mode off, or the Background - its own pixels already are the source).
     * False when the active layer has no pixels of its own (an adjustment layer).
     */
    const ownPixels = useCallback(
        (anchorId: string | null): { id: string; pixels: ImageData } | null | false => {
            if (!encodeLayerOnly) return null;
            const l = layersRef.current.find(x => x.id === anchorId);
            if (!l) return null;
            if (!l.result) {
                toast('info', 'An adjustment layer has no pixels to encode - pick a pixel layer, or turn off Layer only');
                return false;
            }
            return { id: l.id, pixels: l.result };
        },
        [encodeLayerOnly, toast]
    );

    /**
     * lands a layer-only encode: swaps the layer's pixels and keeps everything else (mask,
     * transform, effects, blending). A selection limits the glitch to its part of the layer.
     */
    const commitOwnEncode = useCallback(
        (id: string, result: ImageData, file: Uint8Array | null, resolvedCfg: CodecConfig | null) => {
            const ls = layersRef.current;
            const idx = ls.findIndex(l => l.id === id);
            const target = ls[idx];
            const img = originalRef.current;
            if (!target?.result || !img) return; // deleted while the codec ran
            const sel = selectionRef.current;
            // the selection is drawn in canvas space; the layer's pixels live in layer space
            const pixels = sel ? compositeWithMask(target.result, result, untransformMask(sel, img.width, img.height, target.transform)) : result;
            snapshot();
            const next = [...ls];
            next[idx] = { ...target, result: pixels, file, resolved: resolvedCfg };
            next[idx].thumb = layerThumbnail(next[idx], next[idx].mask);
            setLayers(next);
        },
        [snapshot]
    );

    const encodeNow = useCallback(async () => {
        const source = originalRef.current;
        if (!source || glicEngine.isBusy) return;
        const anchorId = activeIdRef.current;
        const own = ownPixels(anchorId);
        if (own === false || (!own && !replaceTarget(anchorId) && memoryFull())) return;
        try {
            const res = await runEngineEncode(own ? own.pixels : inputFor(source, anchorId));
            if (own) commitOwnEncode(own.id, res.preview, res.file, res.resolvedConfig);
            else commitEncode(anchorId, res.preview, res.file, res.resolvedConfig);
        } catch (e) {
            if ((e as Error).message !== 'cancelled') toast('error', `Encode failed: ${(e as Error).message}`);
        }
    }, [ownPixels, replaceTarget, memoryFull, runEngineEncode, inputFor, commitEncode, commitOwnEncode, toast]);

    const newLayerEncode = useCallback(async () => {
        const source = originalRef.current;
        if (!source || glicEngine.isBusy || memoryFull()) return;
        try {
            const res = await runEngineEncode(compositeBelow(source, layersRef.current.length));
            snapshot();
            const layer = encodedLayer(nextLayerName(layersRef.current), res.preview, res.file, res.resolvedConfig);
            setLayers([...layersRef.current, layer]);
            setActiveLayerIdState(layer.id);
        } catch (e) {
            if ((e as Error).message !== 'cancelled') toast('error', `Encode failed: ${(e as Error).message}`);
        }
    }, [memoryFull, runEngineEncode, compositeBelow, snapshot, encodedLayer, toast]);

    const iterate = useCallback(
        async (times: number) => {
            const source = originalRef.current;
            if (!source || glicEngine.isBusy) return;
            const anchorId = activeIdRef.current;
            const own = ownPixels(anchorId);
            if (own === false || (!own && !replaceTarget(anchorId) && memoryFull())) return;
            setIsProcessing(true);
            setProgress(0);
            try {
                let input = own ? own.pixels : inputFor(source, anchorId);
                let last: Awaited<ReturnType<typeof glicEngine.encode>> | null = null;
                for (let i = 0; i < times; i++) {
                    last = await glicEngine.encode(input, configRef.current, (_pc, overall) => {
                        setProgress((i + overall) / times);
                    });
                    input = last.preview;
                }
                if (last) {
                    setResolved(last.resolvedConfig);
                    setLastSegments(last.segments);
                    if (own) commitOwnEncode(own.id, last.preview, last.file, last.resolvedConfig);
                    else commitEncode(anchorId, last.preview, last.file, last.resolvedConfig);
                }
            } catch (e) {
                if ((e as Error).message !== 'cancelled') toast('error', `Iterate failed: ${(e as Error).message}`);
            } finally {
                setIsProcessing(false);
                setProgress(null);
            }
        },
        [ownPixels, replaceTarget, memoryFull, inputFor, commitEncode, commitOwnEncode, toast]
    );

    const iterateLayers = useCallback(
        async (times: number) => {
            const source = originalRef.current;
            if (!source || glicEngine.isBusy) return;
            const anchorId = activeIdRef.current;
            const made: GlitchLayer[] = [];
            setIsProcessing(true);
            setProgress(0);
            try {
                let input = compositeBelow(source, insertionIndex(anchorId));
                for (let i = 0; i < times; i++) {
                    if (memoryFull(made)) break;
                    const res = await glicEngine.encode(input, configRef.current, (_pc, overall) => {
                        setProgress((i + overall) / times);
                    });
                    setResolved(res.resolvedConfig);
                    setLastSegments(res.segments);
                    const layer = encodedLayer(nextLayerName([...layersRef.current, ...made]), res.preview, res.file, res.resolvedConfig);
                    made.push(layer);
                    // each pass feeds on what the stack now shows (its mask included)
                    input = compositeLayers(input, [layer]);
                }
            } catch (e) {
                if ((e as Error).message !== 'cancelled') toast('error', `Iterate failed: ${(e as Error).message}`);
            } finally {
                // passes finished before a cancel or error are kept, in order, above the anchor
                if (made.length) {
                    snapshot();
                    const next = [...layersRef.current];
                    next.splice(insertionIndex(anchorId), 0, ...made);
                    setLayers(next);
                    setActiveLayerIdState(made[made.length - 1].id);
                }
                setIsProcessing(false);
                setProgress(null);
            }
        },
        [compositeBelow, insertionIndex, memoryFull, encodedLayer, snapshot, toast]
    );

    const cancel = useCallback(() => {
        glicEngine.cancel();
        setIsProcessing(false);
        setProgress(null);
        setChannelProgress(null);
        toast('info', 'Cancelled');
    }, [toast]);


    // --- projects ---

    const saveProject = useCallback(
        async (opts: { name?: string; asNew?: boolean } = {}) => {
            const source = originalRef.current;
            if (!source) {
                toast('info', 'Nothing to save yet - load an image first');
                return;
            }
            try {
                const ls = layersRef.current;
                const keepId = !opts.asNew && projectIdRef.current;
                const name =
                    opts.name?.trim() ||
                    (keepId && projectNameRef.current !== 'Untitled' ? projectNameRef.current : await nextProjectName());
                const id = keepId
                    ? projectIdRef.current!
                    : typeof crypto !== 'undefined' && 'randomUUID' in crypto
                      ? crypto.randomUUID()
                      : `p-${Date.now()}`;

                const storedLayers: StoredLayer[] = await Promise.all(
                    ls.map(async l => ({
                        kind: l.kind,
                        name: l.name,
                        visible: l.visible,
                        opacity: l.opacity,
                        blendMode: l.blendMode,
                        mask: l.mask ? new Uint8Array(l.mask) : null,
                        result: l.result ? await imageDataToPngBlob(l.result) : null,
                        effects: l.effects,
                        transform: l.transform,
                        file: l.file,
                        resolved: l.resolved,
                        thumb: l.thumb,
                    }))
                );
                const record: ProjectRecord = {
                    id,
                    name,
                    updatedAt: Date.now(),
                    width: source.width,
                    height: source.height,
                    thumb: imageDataToThumbnail(processedRef.current ?? source, null, 96),
                    source: await imageDataToPngBlob(source),
                    layers: storedLayers,
                    activeLayerIndex: ls.findIndex(l => l.id === activeIdRef.current),
                    config: cloneConfig(configRef.current),
                    separateChannels,
                    backgroundVisible: bgVisibleRef.current,
                    backgroundLocked,
                };
                await saveProjectRecord(record);
                setProjectId(id);
                setProjectName(name);
                toast('success', `Saved “${name}”`);
            } catch (e) {
                toast('error', `Save failed: ${(e as Error).message}`);
            }
        },
        [separateChannels, backgroundLocked, toast]
    );

    const openProject = useCallback(
        async (id: string) => {
            if (glicEngine.isBusy) return;
            try {
                const rec = await getProject(id);
                if (!rec) throw new Error('project not found');
                const source = await blobToImageData(rec.source);
                const restored: GlitchLayer[] = await Promise.all(
                    rec.layers.map(async sl => {
                        const mask = sl.mask ? new Uint8ClampedArray(sl.mask) : null;
                        // projects saved before effects/adjustment layers existed lack these fields
                        const effects = sl.effects ?? [];
                        const base =
                            sl.kind === 'adjustment' || !sl.result
                                ? makeAdjustmentLayer(sl.name, effects, mask)
                                : makeLayer(sl.name, await blobToImageData(sl.result), {
                                      mask,
                                      effects,
                                      file: sl.file,
                                      resolved: sl.resolved ? Object.assign(new CodecConfig(), sl.resolved) : null,
                                      thumb: sl.thumb,
                                  });
                        return {
                            ...base,
                            visible: sl.visible,
                            opacity: sl.opacity,
                            blendMode: sl.blendMode,
                            transform: sl.transform ?? { ...IDENTITY_TRANSFORM },
                        };
                    })
                );
                setOriginalImage(source);
                setLayers(restored);
                setActiveLayerIdState(restored[rec.activeLayerIndex]?.id ?? restored[restored.length - 1]?.id ?? null);
                setConfig(Object.assign(new CodecConfig(), rec.config));
                setSeparateChannels(rec.separateChannels);
                setBackgroundVisibleState(rec.backgroundVisible ?? true);
                setBackgroundLockedState(rec.backgroundLocked ?? true);
                setHistory([]);
                setSelectionState(null);
                setLastSelection(null);
                setResolved(null);
                setLastSegments(null);
                setProjectId(rec.id);
                setProjectName(rec.name);
                toast('success', `Opened “${rec.name}”`);
            } catch (e) {
                toast('error', `Could not open project: ${(e as Error).message}`);
            }
        },
        [toast]
    );

    const newProject = useCallback(() => {
        setOriginalImage(null);
        resetBackground();
        setLayers([]);
        setActiveLayerIdState(null);
        setResolved(null);
        setLastSegments(null);
        setHistory([]);
        setSelectionState(null);
        setLastSelection(null);
        setProjectId(null);
        setProjectName('Untitled');
    }, [resetBackground]);

    // --- exports ---

    const savePng = useCallback(async () => {
        const img = processedRef.current;
        if (!img) return;
        try {
            const canvas = imageDataToCanvas(img, filtersRef.current);
            downloadBlob(await canvasToPngBlob(canvas), timestampedFilename('glic-image', 'png'));
        } catch (e) {
            toast('error', `Save failed: ${(e as Error).message}`);
        }
    }, [toast]);

    const copyImage = useCallback(async () => {
        const img = processedRef.current ?? originalRef.current;
        if (!img) return;
        if (!('clipboard' in navigator) || typeof ClipboardItem === 'undefined') {
            toast('error', 'This browser cannot copy images - use Export instead');
            return;
        }
        try {
            const c = imageDataToCanvas(img, filtersRef.current);
            let out = c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height);
            const sel = selectionRef.current;
            const b = sel ? maskBounds(sel, img.width, img.height) : null;
            if (sel && b) {
                out = applyMaskAlpha(out, sel);
                out = cropImage(out, b.x, b.y, b.w, b.h);
            }
            // pass a promise: Safari needs the ClipboardItem created inside the user gesture
            const blob = canvasToPngBlob(imageDataToCanvas(out));
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
            toast('success', b ? `Copied the selection (${b.w} × ${b.h})` : `Copied the image (${img.width} × ${img.height})`);
        } catch (e) {
            toast('error', `Copy failed: ${(e as Error).message}`);
        }
    }, [toast]);

    const saveGlic = useCallback(() => {
        const file = layersRef.current.find(l => l.id === activeIdRef.current)?.file ?? null;
        if (!file) return;
        toast('info', "Saved the active layer's full-frame stream (masks and blending live in the image, not the file)");
        downloadBlob(
            new Blob([file.buffer as ArrayBuffer], { type: 'application/octet-stream' }),
            timestampedFilename('glic-output', 'glic')
        );
    }, [toast]);

    const importGlic = useCallback(
        async (bytes: Uint8Array, overrideHeader: boolean) => {
            if (glicEngine.isBusy) return;
            setIsProcessing(true);
            setProgress(0);
            try {
                const res = await glicEngine.decode(
                    bytes,
                    overrideHeader ? { overrideConfig: configRef.current, separateChannels } : {},
                    (_pc, overall) => setProgress(overall)
                );
                setLastSegments(res.segments);
                const source = originalRef.current;
                if (!source || source.width !== res.width || source.height !== res.height) {
                    // no image loaded (or size mismatch): the decode becomes a fresh
                    // baseline with a single full-frame layer carrying its stream
                    snapshot();
                    setOriginalImage(res.preview);
                    const layer = makeLayer('Layer 1', res.preview, {
                        file: bytes,
                        thumb: imageDataToThumbnail(res.preview, null),
                    });
                    setLayers([layer]);
                    setActiveLayerIdState(layer.id);
                    setSelectionState(null);
                    setLastSelection(null);
                } else {
                    commitEncode(activeIdRef.current, res.preview, bytes, null);
                }
                toast('success', `Decoded ${res.width}×${res.height} .glic file`);
            } catch (e) {
                if ((e as Error).message !== 'cancelled') toast('error', `Decode failed: ${(e as Error).message}`);
            } finally {
                setIsProcessing(false);
                setProgress(null);
            }
        },
        [separateChannels, snapshot, commitEncode, toast]
    );

    // --- mask library ---

    useEffect(() => {
        let alive = true;
        loadMasks()
            .then(ms => {
                if (alive) setMasks(ms);
            })
            .catch(() => {
                /* private mode / no IndexedDB: the library just starts empty */
            });
        return () => {
            alive = false;
        };
    }, []);

    const persistMask = useCallback(
        (m: SavedMask) => {
            putMask(m).catch(e => toast('error', `Could not store mask: ${(e as Error).message}`));
        },
        [toast]
    );

    const saveMask = useCallback(
        (mask: Mask, width: number, height: number, name?: string) => {
            const ms = masksRef.current;
            let n = ms.length + 1;
            while (ms.some(m => m.name === `Mask ${n}`)) n++;
            const m: SavedMask = {
                id: newMaskId(),
                name: name?.trim() || `Mask ${n}`,
                width,
                height,
                createdAt: Date.now(),
                mask: mask.slice(),
                thumb: maskThumbnail(mask, width, height),
            };
            setMasks([...ms, m]);
            persistMask(m);
            return m.id;
        },
        [persistMask]
    );

    const renameMask = useCallback(
        (id: string, name: string) => {
            const m = masksRef.current.find(x => x.id === id);
            if (!m || !name.trim()) return;
            const next = { ...m, name: name.trim() };
            setMasks(masksRef.current.map(x => (x.id === id ? next : x)));
            persistMask(next);
        },
        [persistMask]
    );

    const deleteMask = useCallback(
        (id: string) => {
            setMasks(masksRef.current.filter(x => x.id !== id));
            removeMask(id).catch(() => {});
        },
        []
    );

    const maskAtImageSize = useCallback((id: string): Mask | null => {
        const m = masksRef.current.find(x => x.id === id);
        const img = originalRef.current;
        if (!m || !img) return null;
        return resampleMask(m.mask, m.width, m.height, img.width, img.height, 'smooth');
    }, []);

    const selectFromMask = useCallback(
        (id: string, mode: CombineMode) => {
            const mask = maskAtImageSize(id);
            if (!mask) return;
            setSelection(combine(selectionRef.current, mask, mode));
        },
        [maskAtImageSize, setSelection]
    );

    const applyMaskToLayer = useCallback(
        (id: string) => {
            const canvasMask = maskAtImageSize(id);
            const layer = layersRef.current.find(l => l.id === activeIdRef.current);
            const img = originalRef.current;
            if (!canvasMask || !layer || !img) return;
            const mask = untransformMask(canvasMask, img.width, img.height, layer.transform);
            updateLayer(layer.id, { mask, thumb: layerThumbnail(layer, mask) });
        },
        [maskAtImageSize, updateLayer]
    );

    // --- image / canvas size ---

    /** applies the same geometric change to the source, every layer and the selection */
    const transformDocument = useCallback(
        (img: (i: ImageData) => ImageData, mask: (m: Mask, w: number, h: number) => Mask, summary: string) => {
            const source = originalRef.current;
            if (!source || glicEngine.isBusy) return;
            snapshot();
            const next = img(source);
            const ls = layersRef.current;
            const hadStreams = ls.some(l => l.file);
            setLayers(
                ls.map(l => {
                    // bake any move / rotation first, so it resamples together with the document
                    const moved = !isIdentity(l.transform);
                    const baked = moved && l.result ? transformImage(l.result, l.transform) : l.result;
                    const bakedMask = moved && l.mask ? transformMask(l.mask, source.width, source.height, l.transform) : l.mask;
                    const result = baked ? img(baked) : null;
                    const m = bakedMask ? mask(bakedMask, source.width, source.height) : null;
                    // a .glic stream describes the old pixel grid; it can no longer be saved as-is
                    const next = { ...l, result, mask: m, file: null, transform: { ...IDENTITY_TRANSFORM } };
                    return { ...next, thumb: layerThumbnail(next, m) };
                })
            );
            setOriginalImage(next);
            const sel = selectionRef.current;
            setSelectionState(sel ? mask(sel, source.width, source.height) : null);
            setLastSelection(null);
            setLastSegments(null);
            toast(
                'success',
                `${summary}: ${next.width}×${next.height}${hadStreams ? ' - re-encode to save .glic again' : ''}`
            );
        },
        [snapshot, toast]
    );

    const resizeImage = useCallback(
        (width: number, height: number, method: ResampleMethod) =>
            transformDocument(
                i => resampleImage(i, width, height, method),
                (m, w, h) => resampleMask(m, w, h, width, height, method),
                'Image resized'
            ),
        [transformDocument]
    );

    const resizeCanvas = useCallback(
        (width: number, height: number, anchor: Anchor, fill: [number, number, number, number]) =>
            transformDocument(
                i => resizeCanvasImage(i, width, height, anchor, fill),
                (m, w, h) => resizeCanvasMask(m, w, h, width, height, anchor),
                'Canvas resized'
            ),
        [transformDocument]
    );

    const orientCanvas = useCallback(
        (o: Orient, label: string) =>
            transformDocument(
                i => orientImage(i, o),
                (m, w, h) => orientMask(m, w, h, o),
                label
            ),
        [transformDocument]
    );

    const value = useMemo<AppState>(
        () => ({
            config,
            setConfig,
            updateConfig,
            separateChannels,
            setSeparateChannels,
            originalImage,
            processed,
            layers,
            activeLayerId,
            backgroundVisible,
            backgroundLocked,
            setBackgroundVisible,
            setBackgroundLocked,
            setActiveLayerId,
            updateLayer,
            moveLayer,
            reorderLayer,
            duplicateLayer,
            deleteLayer,
            flatten,
            mergeDown,
            mergeVisible,
            invertLayerMask,
            setLayerTransform,
            clearSelectedPixels,
            layerViaCopy,
            placeImageAsLayer,
            addAdjustmentLayer,
            addEffect,
            updateEffect,
            removeEffect,
            moveEffect,
            setLayerMaskFromSelection,
            encodedFile: activeLayer?.file ?? null,
            resolved,
            lastSegments,
            isProcessing,
            progress,
            channelProgress,
            filters,
            setFilters,
            canUndo: history.length > 0,
            selection,
            setSelection,
            reselect,
            hasLastSelection: lastSelection !== null,
            toasts,
            toast,
            dismissToast,
            loadImage,
            projectName,
            projectId,
            saveProject,
            openProject,
            newProject,
            savePng,
            saveGlic,
            copyImage,
            encodeLayerOnly,
            setEncodeLayerOnly,
            encodeNow,
            newLayerEncode,
            iterate,
            iterateLayers,
            undo,
            cancel,
            importGlic,
            masks,
            saveMask,
            renameMask,
            deleteMask,
            maskAtImageSize,
            selectFromMask,
            applyMaskToLayer,
            resizeImage,
            resizeCanvas,
            orientCanvas,
        }),
        [
            config,
            updateConfig,
            separateChannels,
            originalImage,
            processed,
            layers,
            activeLayerId,
            backgroundVisible,
            backgroundLocked,
            setBackgroundVisible,
            setBackgroundLocked,
            setActiveLayerId,
            updateLayer,
            moveLayer,
            reorderLayer,
            duplicateLayer,
            deleteLayer,
            flatten,
            mergeDown,
            mergeVisible,
            invertLayerMask,
            setLayerTransform,
            clearSelectedPixels,
            layerViaCopy,
            placeImageAsLayer,
            addAdjustmentLayer,
            addEffect,
            updateEffect,
            removeEffect,
            moveEffect,
            setLayerMaskFromSelection,
            activeLayer,
            resolved,
            lastSegments,
            isProcessing,
            progress,
            channelProgress,
            filters,
            history.length,
            selection,
            setSelection,
            reselect,
            lastSelection,
            toasts,
            toast,
            dismissToast,
            loadImage,
            projectName,
            projectId,
            saveProject,
            openProject,
            newProject,
            savePng,
            saveGlic,
            copyImage,
            encodeLayerOnly,
            setEncodeLayerOnly,
            encodeNow,
            newLayerEncode,
            iterate,
            iterateLayers,
            undo,
            cancel,
            importGlic,
            masks,
            saveMask,
            renameMask,
            deleteMask,
            maskAtImageSize,
            selectFromMask,
            applyMaskToLayer,
            resizeImage,
            resizeCanvas,
            orientCanvas,
        ]
    );

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useApp = () => {
    const context = useContext(AppContext);
    if (!context) throw new Error('useApp must be used within AppProvider');
    return context;
};
