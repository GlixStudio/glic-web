import React, { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { CodecConfig, cloneConfig } from './Codec';
import { glicEngine, type ChannelProgress } from './engine';
import type { Segment } from './Planes';
import { isEmptyMask, type Mask } from './selection';
import { compositeLayers, makeLayer, MAX_LAYERS, type GlitchLayer } from './layers';
import { imageDataToThumbnail } from './imageio';

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

    // --- glitch layer stack (bottom -> top) ---
    layers: GlitchLayer[];
    activeLayerId: string | null;
    setActiveLayerId: (id: string) => void;
    /** non-structural edits: visibility, opacity, blend, name, mask, thumb */
    updateLayer: (id: string, patch: Partial<GlitchLayer>) => void;
    moveLayer: (id: string, dir: 1 | -1) => void;
    duplicateLayer: (id: string) => void;
    deleteLayer: (id: string) => void;
    flatten: () => void;
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
    /** encode into the active layer (creates "Layer 1" on an empty stack) */
    encodeNow: () => Promise<void>;
    /** encode into a new layer pushed on top of the stack */
    newLayerEncode: () => Promise<void>;
    iterate: (times: number) => Promise<void>;
    undo: () => void;
    cancel: () => void;
    importGlic: (bytes: Uint8Array, overrideHeader: boolean) => Promise<void>;
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
    const [resolved, setResolved] = useState<CodecConfig | null>(null);
    const [lastSegments, setLastSegments] = useState<Segment[][] | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState<number | null>(null);
    const [channelProgress, setChannelProgress] = useState<ChannelProgress[] | null>(null);
    const [filters, setFilters] = useState<ImageFilters>(DEFAULT_FILTERS);
    const [history, setHistory] = useState<HistoryEntry[]>([]);
    const [toasts, setToasts] = useState<Toast[]>([]);
    const [selection, setSelectionState] = useState<Mask | null>(null);
    const [lastSelection, setLastSelection] = useState<Mask | null>(null);

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
    const toastId = useRef(0);

    const processed = useMemo(
        () => (originalImage && layers.length > 0 ? compositeLayers(originalImage, layers) : null),
        [originalImage, layers]
    );

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
        setLayers([]);
        setActiveLayerIdState(null);
        setResolved(null);
        setLastSegments(null);
        setHistory([]);
        setSelectionState(null);
        setLastSelection(null);
        onceHint('glic_hint_load_v1', 'Image loaded - press E to encode, or pick a preset first');
    }, [onceHint]);

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
            return h.slice(0, -1);
        });
    }, []);

    // --- layer operations ---

    const setActiveLayerId = useCallback((id: string) => {
        if (layersRef.current.some(l => l.id === id)) setActiveLayerIdState(id);
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
            if (ls.length >= MAX_LAYERS) {
                toast('info', `Layer limit reached (${MAX_LAYERS})`);
                return;
            }
            snapshot();
            const src = ls[i];
            const copy: GlitchLayer = {
                ...makeLayer(`${src.name} copy`, src.result, {
                    mask: src.mask,
                    file: src.file,
                    resolved: src.resolved,
                    thumb: src.thumb,
                }),
                visible: src.visible,
                opacity: src.opacity,
                blendMode: src.blendMode,
            };
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
                setActiveLayerIdState(next[Math.min(i, next.length - 1)]?.id ?? null);
            }
        },
        [snapshot]
    );

    const flatten = useCallback(() => {
        const source = originalRef.current;
        const ls = layersRef.current;
        if (!source || ls.length === 0) return;
        snapshot();
        setOriginalImage(compositeLayers(source, ls));
        setLayers([]);
        setActiveLayerIdState(null);
        toast('info', 'Flattened - the composite is the new baseline');
    }, [snapshot, toast]);

    const setLayerMaskFromSelection = useCallback(
        (id: string) => {
            const layer = layersRef.current.find(l => l.id === id);
            if (!layer) return;
            const mask = selectionRef.current ? selectionRef.current.slice() : null;
            updateLayer(id, { mask, thumb: imageDataToThumbnail(layer.result, mask) });
        },
        [updateLayer]
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
        const below = upTo < 0 ? [] : layersRef.current.slice(0, upTo);
        return below.length ? compositeLayers(source, below) : source;
    }, []);

    /** write an encode/decode result into the active layer, or create "Layer 1" */
    const commitToActiveLayer = useCallback(
        (result: ImageData, file: Uint8Array | null, resolvedCfg: CodecConfig | null) => {
            snapshot();
            const ls = layersRef.current;
            const idx = ls.findIndex(l => l.id === activeIdRef.current);
            const sel = selectionRef.current;
            if (idx >= 0) {
                const existing = ls[idx];
                const mask = sel ? sel.slice() : existing.mask;
                const next = [...ls];
                next[idx] = {
                    ...existing,
                    result,
                    file,
                    resolved: resolvedCfg,
                    mask,
                    thumb: imageDataToThumbnail(result, mask),
                };
                setLayers(next);
            } else {
                const mask = sel ? sel.slice() : null;
                const layer = makeLayer(nextLayerName(ls), result, {
                    mask,
                    file,
                    resolved: resolvedCfg,
                    thumb: imageDataToThumbnail(result, mask),
                });
                setLayers([...ls, layer]);
                setActiveLayerIdState(layer.id);
            }
            onceHint(
                'glic_hint_encode_v1',
                'Tip: draw a selection (M, W, or B) to glitch only part of the image - every encode lands on a layer you can re-tune'
            );
        },
        [snapshot, onceHint]
    );

    const encodeNow = useCallback(async () => {
        const source = originalRef.current;
        if (!source || glicEngine.isBusy) return;
        try {
            const idx = layersRef.current.findIndex(l => l.id === activeIdRef.current);
            const input = compositeBelow(source, idx);
            const res = await runEngineEncode(input);
            commitToActiveLayer(res.preview, res.file, res.resolvedConfig);
        } catch (e) {
            if ((e as Error).message !== 'cancelled') toast('error', `Encode failed: ${(e as Error).message}`);
        }
    }, [compositeBelow, runEngineEncode, commitToActiveLayer, toast]);

    const newLayerEncode = useCallback(async () => {
        const source = originalRef.current;
        if (!source || glicEngine.isBusy) return;
        const ls = layersRef.current;
        if (ls.length >= MAX_LAYERS) {
            toast('info', `Layer limit reached (${MAX_LAYERS}) - flatten or delete a layer first`);
            return;
        }
        try {
            const input = compositeBelow(source, ls.length);
            const res = await runEngineEncode(input);
            snapshot();
            const sel = selectionRef.current;
            const mask = sel ? sel.slice() : null;
            const layer = makeLayer(nextLayerName(layersRef.current), res.preview, {
                mask,
                file: res.file,
                resolved: res.resolvedConfig,
                thumb: imageDataToThumbnail(res.preview, mask),
            });
            setLayers([...layersRef.current, layer]);
            setActiveLayerIdState(layer.id);
        } catch (e) {
            if ((e as Error).message !== 'cancelled') toast('error', `Encode failed: ${(e as Error).message}`);
        }
    }, [compositeBelow, runEngineEncode, snapshot, toast]);

    const iterate = useCallback(
        async (times: number) => {
            const source = originalRef.current;
            if (!source || glicEngine.isBusy) return;
            setIsProcessing(true);
            setProgress(0);
            try {
                const idx = layersRef.current.findIndex(l => l.id === activeIdRef.current);
                let input = compositeBelow(source, idx);
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
                    commitToActiveLayer(last.preview, last.file, last.resolvedConfig);
                }
            } catch (e) {
                if ((e as Error).message !== 'cancelled') toast('error', `Iterate failed: ${(e as Error).message}`);
            } finally {
                setIsProcessing(false);
                setProgress(null);
            }
        },
        [compositeBelow, commitToActiveLayer, toast]
    );

    const cancel = useCallback(() => {
        glicEngine.cancel();
        setIsProcessing(false);
        setProgress(null);
        setChannelProgress(null);
        toast('info', 'Cancelled');
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
                    commitToActiveLayer(res.preview, bytes, null);
                }
                toast('success', `Decoded ${res.width}×${res.height} .glic file`);
            } catch (e) {
                if ((e as Error).message !== 'cancelled') toast('error', `Decode failed: ${(e as Error).message}`);
            } finally {
                setIsProcessing(false);
                setProgress(null);
            }
        },
        [separateChannels, snapshot, commitToActiveLayer, toast]
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
            setActiveLayerId,
            updateLayer,
            moveLayer,
            duplicateLayer,
            deleteLayer,
            flatten,
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
            encodeNow,
            newLayerEncode,
            iterate,
            undo,
            cancel,
            importGlic,
        }),
        [
            config,
            updateConfig,
            separateChannels,
            originalImage,
            processed,
            layers,
            activeLayerId,
            setActiveLayerId,
            updateLayer,
            moveLayer,
            duplicateLayer,
            deleteLayer,
            flatten,
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
            encodeNow,
            newLayerEncode,
            iterate,
            undo,
            cancel,
            importGlic,
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
