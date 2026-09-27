import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../core/AppContext';
import { filtersToCss } from '../core/filters';
import { visualizeSegmentation } from '../core/visualize';
import { fileToImageData } from '../core/imageio';
import { Upload, RefreshCw, Maximize, Grid3x3, Eye, ZoomIn, ZoomOut } from 'lucide-react';

const isEditableTarget = (e: KeyboardEvent) =>
    ['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName);

export const CanvasViewer: React.FC = () => {
    const { originalImage, processed, resolved, lastSegments, filters, loadImage, importGlic, toast } = useApp();

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const changeImageInputRef = useRef<HTMLInputElement>(null);

    const [isDragging, setIsDragging] = useState(false);
    const [comparing, setComparing] = useState(false);
    const [showSegmentation, setShowSegmentation] = useState(false);
    const [zoom, setZoom] = useState<number | null>(null); // null = fit
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [panning, setPanning] = useState(false);
    const dragState = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);

    const segmentationView = useMemo(() => {
        if (!showSegmentation || !processed || !lastSegments || !resolved) return null;
        try {
            return visualizeSegmentation(processed, lastSegments, resolved.colorspace);
        } catch {
            return null;
        }
    }, [showSegmentation, processed, lastSegments, resolved]);

    const displayed: ImageData | null = comparing
        ? originalImage
        : (showSegmentation ? segmentationView : null) ?? processed ?? originalImage;

    // draw the active ImageData
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !displayed) return;
        if (canvas.width !== displayed.width) canvas.width = displayed.width;
        if (canvas.height !== displayed.height) canvas.height = displayed.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.putImageData(displayed, 0, 0);
    }, [displayed]);

    // fit-to-container display size
    const hasImage = displayed !== null;
    const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const ro = new ResizeObserver(() => {
            setContainerSize({ w: container.clientWidth, h: container.clientHeight });
        });
        ro.observe(container);
        return () => ro.disconnect();
    }, [hasImage]); // re-observe when the container mounts

    const imgW = displayed?.width ?? 0;
    const imgH = displayed?.height ?? 0;
    const fitScale =
        imgW && containerSize.w && containerSize.h
            ? Math.min(containerSize.w / imgW, containerSize.h / imgH, 1)
            : 1;
    const scale = zoom ?? fitScale;

    const clampPan = useCallback(
        (p: { x: number; y: number }, s: number) => {
            const maxX = Math.max(0, (imgW * s - containerSize.w) / 2 + 32);
            const maxY = Math.max(0, (imgH * s - containerSize.h) / 2 + 32);
            return {
                x: Math.min(maxX, Math.max(-maxX, p.x)),
                y: Math.min(maxY, Math.max(-maxY, p.y)),
            };
        },
        [imgW, imgH, containerSize]
    );

    const setZoomClamped = useCallback(
        (z: number | null) => {
            setZoom(z === null ? null : Math.min(32, Math.max(0.05, z)));
            if (z === null) setPan({ x: 0, y: 0 });
        },
        []
    );

    const onWheel = useCallback(
        (e: React.WheelEvent) => {
            if (!displayed) return;
            e.preventDefault();
            const factor = e.deltaY < 0 ? 1.2 : 1 / 1.2;
            setZoomClamped((zoom ?? fitScale) * factor);
        },
        [displayed, zoom, fitScale, setZoomClamped]
    );

    const onPointerDown = (e: React.PointerEvent) => {
        if (!displayed) return;
        (e.target as Element).setPointerCapture(e.pointerId);
        dragState.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
        setPanning(true);
    };
    const onPointerMove = (e: React.PointerEvent) => {
        const d = dragState.current;
        if (!d) return;
        setPan(clampPan({ x: d.panX + e.clientX - d.startX, y: d.panY + e.clientY - d.startY }, scale));
    };
    const onPointerUp = () => {
        dragState.current = null;
        setPanning(false);
    };

    // keyboard: C hold-to-compare, F fit/100%
    useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (isEditableTarget(e) || e.metaKey || e.ctrlKey || e.altKey) return;
            if (e.key === 'c' || e.key === 'C') setComparing(true);
            if (e.key === 'f' || e.key === 'F') setZoomClamped(zoom === null ? 1 : null);
        };
        const up = (e: KeyboardEvent) => {
            if (e.key === 'c' || e.key === 'C') setComparing(false);
        };
        window.addEventListener('keydown', down);
        window.addEventListener('keyup', up);
        return () => {
            window.removeEventListener('keydown', down);
            window.removeEventListener('keyup', up);
        };
    }, [zoom, setZoomClamped]);

    const handleFile = useCallback(
        async (file: File) => {
            if (file.name.toLowerCase().endsWith('.glic')) {
                const buf = await file.arrayBuffer();
                await importGlic(new Uint8Array(buf), false);
                return;
            }
            if (!file.type.startsWith('image/')) {
                toast('error', 'Unsupported file type');
                return;
            }
            try {
                loadImage(await fileToImageData(file));
            } catch {
                toast('error', 'Could not load image');
            }
        },
        [importGlic, loadImage, toast]
    );

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    };

    const showFilters = !comparing && processed && !showSegmentation;

    return (
        <div
            className={`w-full h-full flex items-center justify-center relative bg-zinc-900/50 overflow-hidden ${
                isDragging ? 'bg-blue-500/10' : ''
            }`}
            onDragOver={e => {
                e.preventDefault();
                setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
        >
            {!displayed ? (
                <div
                    className={`text-center p-12 border-2 border-dashed rounded-2xl flex flex-col items-center gap-6 transition-all ${
                        isDragging
                            ? 'border-blue-500 bg-blue-500/5'
                            : 'border-zinc-700 hover:border-zinc-600 hover:bg-zinc-800/50'
                    }`}
                >
                    <div className="p-4 bg-zinc-800 rounded-full">
                        <Upload className={`w-8 h-8 ${isDragging ? 'text-blue-500' : 'text-zinc-400'}`} />
                    </div>
                    <div className="space-y-2">
                        <h3 className="text-lg font-bold text-zinc-200">Drop an image or a .glic file</h3>
                        <p className="text-zinc-500 text-sm">Drag & drop, or click to browse</p>
                    </div>
                    <input
                        type="file"
                        accept="image/*,.glic"
                        className="hidden"
                        id="file-upload"
                        onChange={e => {
                            const f = e.target.files?.[0];
                            if (f) handleFile(f);
                            e.target.value = '';
                        }}
                    />
                    <label
                        htmlFor="file-upload"
                        className="px-6 py-2.5 bg-zinc-100 text-zinc-900 font-bold rounded-lg hover:bg-white cursor-pointer transition-colors shadow-lg shadow-zinc-900/20"
                    >
                        Select file
                    </label>
                </div>
            ) : (
                <div
                    ref={containerRef}
                    className="relative w-full h-full flex items-center justify-center overflow-hidden touch-none"
                    onWheel={onWheel}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    style={{ cursor: panning ? 'grabbing' : scale > fitScale ? 'grab' : 'default' }}
                >
                    <canvas
                        ref={canvasRef}
                        style={{
                            imageRendering: 'pixelated',
                            width: `${imgW * scale}px`,
                            height: `${imgH * scale}px`,
                            transform: `translate(${pan.x}px, ${pan.y}px)`,
                            filter: showFilters ? filtersToCss(filters) : 'none',
                            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
                        }}
                    />

                    {/* toolbar */}
                    <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
                        <div className="flex items-center bg-zinc-900/90 border border-zinc-700 rounded-lg backdrop-blur-sm overflow-hidden">
                            <button
                                onClick={() => setZoomClamped((zoom ?? fitScale) / 1.2)}
                                className="p-2 text-zinc-300 hover:bg-zinc-800 transition-colors"
                                title="Zoom out"
                            >
                                <ZoomOut className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setZoomClamped(zoom === null ? 1 : null)}
                                className="px-2 py-2 text-xs font-mono text-zinc-300 hover:bg-zinc-800 transition-colors min-w-[3.5rem]"
                                title="Toggle fit / 100% (F)"
                            >
                                {Math.round(scale * 100)}%
                            </button>
                            <button
                                onClick={() => setZoomClamped((zoom ?? fitScale) * 1.2)}
                                className="p-2 text-zinc-300 hover:bg-zinc-800 transition-colors"
                                title="Zoom in"
                            >
                                <ZoomIn className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setZoomClamped(null)}
                                className="p-2 text-zinc-300 hover:bg-zinc-800 transition-colors border-l border-zinc-700"
                                title="Fit to window"
                            >
                                <Maximize className="w-4 h-4" />
                            </button>
                        </div>

                        {processed && originalImage && (
                            <button
                                onPointerDown={e => {
                                    e.stopPropagation();
                                    setComparing(true);
                                }}
                                onPointerUp={() => setComparing(false)}
                                onPointerLeave={() => setComparing(false)}
                                className={`p-2 rounded-lg border backdrop-blur-sm transition-colors ${
                                    comparing
                                        ? 'bg-blue-600 border-blue-500 text-white'
                                        : 'bg-zinc-900/90 border-zinc-700 text-zinc-300 hover:bg-zinc-800'
                                }`}
                                title="Hold to compare with source (C)"
                            >
                                <Eye className="w-4 h-4" />
                            </button>
                        )}

                        {processed && lastSegments && (
                            <button
                                onClick={() => setShowSegmentation(s => !s)}
                                className={`p-2 rounded-lg border backdrop-blur-sm transition-colors ${
                                    showSegmentation
                                        ? 'bg-blue-600 border-blue-500 text-white'
                                        : 'bg-zinc-900/90 border-zinc-700 text-zinc-300 hover:bg-zinc-800'
                                }`}
                                title="Segmentation view (blocks flooded with their center value)"
                            >
                                <Grid3x3 className="w-4 h-4" />
                            </button>
                        )}

                        <button
                            onClick={() => changeImageInputRef.current?.click()}
                            className="p-2 bg-zinc-900/90 hover:bg-zinc-800 text-zinc-300 rounded-lg border border-zinc-700 backdrop-blur-sm transition-colors"
                            title="Change image"
                        >
                            <RefreshCw className="w-4 h-4" />
                        </button>
                        <input
                            ref={changeImageInputRef}
                            type="file"
                            accept="image/*,.glic"
                            className="hidden"
                            onChange={e => {
                                const f = e.target.files?.[0];
                                if (f) handleFile(f);
                                e.target.value = '';
                            }}
                        />
                    </div>

                    {/* status line */}
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-zinc-900/80 border border-zinc-800 rounded-full text-[11px] text-zinc-400 backdrop-blur-sm pointer-events-none">
                        {comparing ? 'source' : showSegmentation ? 'segmentation' : processed ? 'processed' : 'source'} ·{' '}
                        {imgW}×{imgH}
                    </div>
                </div>
            )}
        </div>
    );
};
