import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CodecConfig, cloneConfig } from './Codec';
import { glicEngine, type ChannelProgress } from './engine';
import type { Segment } from './Planes';
import { combine, isEmptyMask, type CombineMode, type Mask } from './selection';
import { putMask, removeMask, loadMasks, maskThumbnail, newMaskId, type SavedMask } from './maskStore';
import {
    resampleImage,
    resampleMask,
    resizeCanvas as resizeCanvasImage,
    resizeCanvasMask,
    type Anchor,
    type ResampleMethod,
} from './resize';
import { compositeLayers, makeLayer, makeAdjustmentLayer, cloneLayer, canAddLayer, type GlitchLayer } from './layers';
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
    setActiveLayerId: (id: string | null) => void;
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

    /** encodes what is visible up to the active layer into a NEW layer right above it */
    encodeNow: () => Promise<void>;
    /** re-runs the codec into the active glitch layer, replacing its pixels */
    reencodeLayer: () => Promise<void>;
    /** encode passes feeding on each other, one new layer per pass */
    iterate: (times: number) => Promise<void>;
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

    const processed = useMemo(
        () => (originalImage && layers.length > 0 ? compositeLayers(originalImage, layers) : null),
        [originalImage, layers]
    );

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
            updateLayer(id, { mask, thumb: layerThumbnail(layer, mask) });
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

    /**
     * inserts freshly encoded layers above the anchor (re-resolved now: the stack
     * may have changed while the codec ran) and makes the topmost one active
     */
    const insertLayers = useCallback(
        (anchorId: string | null, made: GlitchLayer[]) => {
            if (made.length === 0) return;
            snapshot();
            const next = [...layersRef.current];
            next.splice(insertionIndex(anchorId), 0, ...made);
            setLayers(next);
            setActiveLayerIdState(made[made.length - 1].id);
            onceHint(
                'glic_hint_encode_v1',
                'Tip: every encode stacks a new layer above the active one - draw a selection (M, W, or B) first to glitch only part of the image'
            );
        },
        [snapshot, insertionIndex, onceHint]
    );

    const encodeNow = useCallback(async () => {
        const source = originalRef.current;
        if (!source || glicEngine.isBusy || memoryFull()) return;
        const anchorId = activeIdRef.current;
        try {
            const input = compositeBelow(source, insertionIndex(anchorId));
            const res = await runEngineEncode(input);
            const layer = encodedLayer(nextLayerName(layersRef.current), res.preview, res.file, res.resolvedConfig);
            insertLayers(anchorId, [layer]);
        } catch (e) {
            if ((e as Error).message !== 'cancelled') toast('error', `Encode failed: ${(e as Error).message}`);
        }
    }, [compositeBelow, insertionIndex, memoryFull, runEngineEncode, encodedLayer, insertLayers, toast]);

    const reencodeLayer = useCallback(async () => {
        const source = originalRef.current;
        if (!source || glicEngine.isBusy) return;
        const target = layersRef.current.find(l => l.id === activeIdRef.current);
        if (!target || target.kind !== 'pixel') {
            // nothing to replace on the Background or an adjustment layer
            toast('info', 'Select a glitch layer to re-encode - ENCODE (E) adds a new one');
            return;
        }
        try {
            const res = await runEngineEncode(compositeBelow(source, layersRef.current.indexOf(target)));
            const ls = layersRef.current;
            const idx = ls.findIndex(l => l.id === target.id);
            if (idx < 0) return; // deleted while encoding
            snapshot();
            const fresh = encodedLayer(target.name, res.preview, res.file, res.resolvedConfig);
            const next = [...ls];
            // no selection = full frame; a stale mask must not survive a re-encode
            next[idx] = { ...ls[idx], result: fresh.result, file: fresh.file, resolved: fresh.resolved, mask: fresh.mask };
            next[idx].thumb = layerThumbnail(next[idx], next[idx].mask);
            setLayers(next);
        } catch (e) {
            if ((e as Error).message !== 'cancelled') toast('error', `Encode failed: ${(e as Error).message}`);
        }
    }, [compositeBelow, runEngineEncode, encodedLayer, snapshot, toast]);

    const iterate = useCallback(
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
                    const layer = encodedLayer(
                        nextLayerName([...layersRef.current, ...made]),
                        res.preview,
                        res.file,
                        res.resolvedConfig
                    );
                    made.push(layer);
                    // each pass feeds on what the stack now shows (mask included)
                    input = compositeLayers(input, [layer]);
                }
            } catch (e) {
                if ((e as Error).message !== 'cancelled') toast('error', `Iterate failed: ${(e as Error).message}`);
            } finally {
                // passes finished before a cancel or error are kept
                insertLayers(anchorId, made);
                setIsProcessing(false);
                setProgress(null);
            }
        },
        [compositeBelow, insertionIndex, memoryFull, encodedLayer, insertLayers, toast]
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
                };
                await saveProjectRecord(record);
                setProjectId(id);
                setProjectName(name);
                toast('success', `Saved “${name}”`);
            } catch (e) {
                toast('error', `Save failed: ${(e as Error).message}`);
            }
        },
        [separateChannels, toast]
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
                        return { ...base, visible: sl.visible, opacity: sl.opacity, blendMode: sl.blendMode };
                    })
                );
                setOriginalImage(source);
                setLayers(restored);
                setActiveLayerIdState(restored[rec.activeLayerIndex]?.id ?? restored[restored.length - 1]?.id ?? null);
                setConfig(Object.assign(new CodecConfig(), rec.config));
                setSeparateChannels(rec.separateChannels);
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
        setLayers([]);
        setActiveLayerIdState(null);
        setResolved(null);
        setLastSegments(null);
        setHistory([]);
        setSelectionState(null);
        setLastSelection(null);
        setProjectId(null);
        setProjectName('Untitled');
    }, []);

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
                    insertLayers(activeIdRef.current, [
                        encodedLayer(nextLayerName(layersRef.current), res.preview, bytes, null),
                    ]);
                }
                toast('success', `Decoded ${res.width}×${res.height} .glic file`);
            } catch (e) {
                if ((e as Error).message !== 'cancelled') toast('error', `Decode failed: ${(e as Error).message}`);
            } finally {
                setIsProcessing(false);
                setProgress(null);
            }
        },
        [separateChannels, snapshot, insertLayers, encodedLayer, toast]
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
            const mask = maskAtImageSize(id);
            const layer = layersRef.current.find(l => l.id === activeIdRef.current);
            if (!mask || !layer) return;
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
                    const result = l.result ? img(l.result) : null;
                    const m = l.mask ? mask(l.mask, source.width, source.height) : null;
                    // a .glic stream describes the old pixel grid; it can no longer be saved as-is
                    const next = { ...l, result, mask: m, file: null };
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
            projectName,
            projectId,
            saveProject,
            openProject,
            newProject,
            savePng,
            saveGlic,
            encodeNow,
            reencodeLayer,
            iterate,
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
            projectName,
            projectId,
            saveProject,
            openProject,
            newProject,
            savePng,
            saveGlic,
            encodeNow,
            reencodeLayer,
            iterate,
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
