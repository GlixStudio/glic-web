import React, { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { CodecConfig, cloneConfig } from './Codec';
import { glicEngine, type ChannelProgress } from './engine';
import type { Segment } from './Planes';

import { DEFAULT_FILTERS, type ImageFilters } from './filters';

export interface Toast {
    id: number;
    kind: 'info' | 'error' | 'success';
    text: string;
}

interface HistoryEntry {
    processed: ImageData;
    encodedFile: Uint8Array | null;
    resolved: CodecConfig | null;
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
    processed: ImageData | null;
    encodedFile: Uint8Array | null;
    /** config with RANDOM choices resolved, from the last encode */
    resolved: CodecConfig | null;
    lastSegments: Segment[][] | null;

    isProcessing: boolean;
    progress: number | null;
    channelProgress: ChannelProgress[] | null;

    filters: ImageFilters;
    setFilters: (f: ImageFilters) => void;

    canUndo: boolean;

    toasts: Toast[];
    toast: (kind: Toast['kind'], text: string) => void;
    dismissToast: (id: number) => void;

    loadImage: (img: ImageData) => void;
    encodeNow: () => Promise<void>;
    reEncode: () => Promise<void>;
    iterate: (times: number) => Promise<void>;
    undo: () => void;
    cancel: () => void;
    importGlic: (bytes: Uint8Array, overrideHeader: boolean) => Promise<void>;
}

const AppContext = createContext<AppState | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [config, setConfig] = useState<CodecConfig>(() => new CodecConfig());
    const [separateChannels, setSeparateChannels] = useState(false);
    const [originalImage, setOriginalImage] = useState<ImageData | null>(null);
    const [processed, setProcessed] = useState<ImageData | null>(null);
    const [encodedFile, setEncodedFile] = useState<Uint8Array | null>(null);
    const [resolved, setResolved] = useState<CodecConfig | null>(null);
    const [lastSegments, setLastSegments] = useState<Segment[][] | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState<number | null>(null);
    const [channelProgress, setChannelProgress] = useState<ChannelProgress[] | null>(null);
    const [filters, setFilters] = useState<ImageFilters>(DEFAULT_FILTERS);
    const [history, setHistory] = useState<HistoryEntry[]>([]);
    const [toasts, setToasts] = useState<Toast[]>([]);

    const configRef = useRef(config);
    configRef.current = config;
    const processedRef = useRef(processed);
    processedRef.current = processed;
    const encodedFileRef = useRef(encodedFile);
    encodedFileRef.current = encodedFile;
    const resolvedRef = useRef(resolved);
    resolvedRef.current = resolved;
    const toastId = useRef(0);

    const toast = useCallback((kind: Toast['kind'], text: string) => {
        const id = ++toastId.current;
        setToasts(t => [...t, { id, kind, text }]);
        window.setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), kind === 'error' ? 6000 : 3500);
    }, []);

    const dismissToast = useCallback((id: number) => {
        setToasts(t => t.filter(x => x.id !== id));
    }, []);

    const updateConfig = useCallback((fn: (c: CodecConfig) => void) => {
        const next = cloneConfig(configRef.current);
        fn(next);
        setConfig(next);
    }, []);

    const loadImage = useCallback((img: ImageData) => {
        setOriginalImage(img);
        setProcessed(null);
        setEncodedFile(null);
        setResolved(null);
        setLastSegments(null);
        setHistory([]);
    }, []);

    const pushHistory = useCallback(() => {
        const prev = processedRef.current;
        if (!prev) return;
        const entry: HistoryEntry = {
            processed: prev,
            encodedFile: encodedFileRef.current,
            resolved: resolvedRef.current,
        };
        setHistory(h => [...h, entry].slice(-MAX_HISTORY));
    }, []);

    const runEncode = useCallback(
        async (source: ImageData, remember: boolean) => {
            setIsProcessing(true);
            setProgress(0);
            setChannelProgress(null);
            try {
                const res = await glicEngine.encode(source, configRef.current, (perChannel, overall) => {
                    setProgress(overall);
                    setChannelProgress([...perChannel]);
                });
                if (remember) pushHistory();
                setProcessed(res.preview);
                setEncodedFile(res.file);
                setResolved(res.resolvedConfig);
                setLastSegments(res.segments);
            } finally {
                setIsProcessing(false);
                setProgress(null);
                setChannelProgress(null);
            }
        },
        [pushHistory]
    );

    const encodeNow = useCallback(async () => {
        if (!originalImage || glicEngine.isBusy) return;
        try {
            await runEncode(originalImage, true);
        } catch (e) {
            if ((e as Error).message !== 'cancelled') toast('error', `Encode failed: ${(e as Error).message}`);
        }
    }, [originalImage, runEncode, toast]);

    const reEncode = useCallback(async () => {
        if (glicEngine.isBusy) return;
        const source = processed ?? originalImage;
        if (!source) return;
        try {
            await runEncode(source, true);
        } catch (e) {
            if ((e as Error).message !== 'cancelled') toast('error', `Encode failed: ${(e as Error).message}`);
        }
    }, [processed, originalImage, runEncode, toast]);

    const iterate = useCallback(
        async (times: number) => {
            if (glicEngine.isBusy) return;
            let source = processed ?? originalImage;
            if (!source) return;
            setIsProcessing(true);
            setProgress(0);
            try {
                pushHistory();
                for (let i = 0; i < times; i++) {
                    const res = await glicEngine.encode(source, configRef.current, (_pc, overall) => {
                        setProgress((i + overall) / times);
                    });
                    source = res.preview;
                    setProcessed(res.preview);
                    setEncodedFile(res.file);
                    setResolved(res.resolvedConfig);
                    setLastSegments(res.segments);
                }
            } catch (e) {
                if ((e as Error).message !== 'cancelled') toast('error', `Iterate failed: ${(e as Error).message}`);
            } finally {
                setIsProcessing(false);
                setProgress(null);
            }
        },
        [processed, originalImage, pushHistory, toast]
    );

    const undo = useCallback(() => {
        setHistory(h => {
            if (h.length === 0) return h;
            const last = h[h.length - 1];
            setProcessed(last.processed);
            setEncodedFile(last.encodedFile);
            setResolved(last.resolved);
            return h.slice(0, -1);
        });
    }, []);

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
                pushHistory();
                setProcessed(res.preview);
                setEncodedFile(bytes);
                setLastSegments(res.segments);
                if (!originalImage) setOriginalImage(res.preview);
                toast('success', `Decoded ${res.width}×${res.height} .glic file`);
            } catch (e) {
                if ((e as Error).message !== 'cancelled') toast('error', `Decode failed: ${(e as Error).message}`);
            } finally {
                setIsProcessing(false);
                setProgress(null);
            }
        },
        [originalImage, separateChannels, pushHistory, toast]
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
            encodedFile,
            resolved,
            lastSegments,
            isProcessing,
            progress,
            channelProgress,
            filters,
            setFilters,
            canUndo: history.length > 0,
            toasts,
            toast,
            dismissToast,
            loadImage,
            encodeNow,
            reEncode,
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
            encodedFile,
            resolved,
            lastSegments,
            isProcessing,
            progress,
            channelProgress,
            filters,
            history.length,
            toasts,
            toast,
            dismissToast,
            loadImage,
            encodeNow,
            reEncode,
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
