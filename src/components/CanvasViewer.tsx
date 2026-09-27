import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../core/AppContext';
import { filtersToCss } from '../core/filters';
import { visualizeSegmentation } from '../core/visualize';
import { fileToImageData } from '../core/imageio';
import {
    rectMask,
    ellipseMask,
    lassoMask,
    magicWand,
    brushStamp,
    newMask,
    combine,
    invertMask,
    feather,
    coverage,
    maskOverlay,
    DEFAULT_TOOL_OPTIONS,
    type CombineMode,
    type Mask,
    type SelectionTool,
    type ToolOptions,
} from '../core/selection';
import { SelectionToolbar } from './SelectionToolbar';
import { Upload, RefreshCw, Maximize, Grid3x3, Eye, ZoomIn, ZoomOut } from 'lucide-react';

const isEditableTarget = (e: KeyboardEvent) =>
    ['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName);

interface Gesture {
    kind: 'rect' | 'ellipse' | 'lasso' | 'wand' | 'brush';
    mode: CombineMode;
    startImg: { x: number; y: number };
    lastImg: { x: number; y: number };
    startScreen: { x: number; y: number };
    lastScreen: { x: number; y: number };
    pointsImg: { x: number; y: number }[];
    pointsScreen: { x: number; y: number }[];
    /** brush only */
    working?: Mask;
    erase?: boolean;
}

export const CanvasViewer: React.FC = () => {
    const {
        originalImage,
        processed,
        resolved,
        lastSegments,
        filters,
        loadImage,
        importGlic,
        toast,
        selection,
        setSelection,
        reselect,
        hasLastSelection,
    } = useApp();

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const overlayRef = useRef<HTMLCanvasElement>(null);
    const draftRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const changeImageInputRef = useRef<HTMLInputElement>(null);

    const [isDragging, setIsDragging] = useState(false);
    const [comparing, setComparing] = useState(false);
    const [showSegmentation, setShowSegmentation] = useState(false);
    const [zoom, setZoom] = useState<number | null>(null); // null = fit
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [panning, setPanning] = useState(false);
    const [spaceHeld, setSpaceHeld] = useState(false);
    const [tool, setTool] = useState<SelectionTool>('move');
    const [toolOptions, setToolOptions] = useState<ToolOptions>(DEFAULT_TOOL_OPTIONS);
    const panState = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);
    const gesture = useRef<Gesture | null>(null);
    const hoverScreen = useRef<{ x: number; y: number } | null>(null);
    const [draftTick, setDraftTick] = useState(0); // triggers draft canvas redraws

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

    const imgW = displayed?.width ?? 0;
    const imgH = displayed?.height ?? 0;

    // draw the active ImageData
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !displayed) return;
        if (canvas.width !== displayed.width) canvas.width = displayed.width;
        if (canvas.height !== displayed.height) canvas.height = displayed.height;
        canvas.getContext('2d')?.putImageData(displayed, 0, 0);
    }, [displayed]);

    // draw the selection overlay (image space)
    useEffect(() => {
        const overlay = overlayRef.current;
        if (!overlay || !imgW) return;
        if (overlay.width !== imgW) overlay.width = imgW;
        if (overlay.height !== imgH) overlay.height = imgH;
        const ctx = overlay.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, imgW, imgH);
        if (selection && selection.length === imgW * imgH) {
            ctx.putImageData(maskOverlay(selection, imgW, imgH), 0, 0);
        }
    }, [selection, imgW, imgH]);

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
    }, [hasImage]);

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

    const setZoomClamped = useCallback((z: number | null) => {
        setZoom(z === null ? null : Math.min(32, Math.max(0.05, z)));
        if (z === null) setPan({ x: 0, y: 0 });
    }, []);

    const onWheel = useCallback(
        (e: React.WheelEvent) => {
            if (!displayed) return;
            e.preventDefault();
            const factor = e.deltaY < 0 ? 1.2 : 1 / 1.2;
            setZoomClamped((zoom ?? fitScale) * factor);
        },
        [displayed, zoom, fitScale, setZoomClamped]
    );

    /** screen (client) -> image pixel coordinates, via the canvas' laid-out rect */
    const screenToImage = useCallback(
        (clientX: number, clientY: number) => {
            const rect = canvasRef.current?.getBoundingClientRect();
            if (!rect || !imgW) return { x: 0, y: 0 };
            return {
                x: ((clientX - rect.left) / rect.width) * imgW,
                y: ((clientY - rect.top) / rect.height) * imgH,
            };
        },
        [imgW, imgH]
    );

    // --- selection commands ---

    const applyCommit = useCallback(
        (mask: Mask, mode: CombineMode) => {
            const feathered = toolOptions.feather > 0 ? feather(mask, imgW, imgH, toolOptions.feather) : mask;
            setSelection(combine(selection, feathered, mode));
        },
        [toolOptions.feather, imgW, imgH, selection, setSelection]
    );

    const selectAll = useCallback(() => {
        if (imgW) setSelection(rectMask(imgW, imgH, 0, 0, imgW, imgH));
    }, [imgW, imgH, setSelection]);

    const clearSelection = useCallback(() => setSelection(null), [setSelection]);

    const invertSelection = useCallback(() => {
        if (selection) setSelection(invertMask(selection));
    }, [selection, setSelection]);

    const applyFeatherNow = useCallback(() => {
        if (selection && toolOptions.feather > 0) {
            setSelection(feather(selection, imgW, imgH, toolOptions.feather));
        }
    }, [selection, toolOptions.feather, imgW, imgH, setSelection]);

    const coveragePct = useMemo(
        () => (selection ? Math.round(coverage(selection) * 100) : null),
        [selection]
    );

    /** stamps the brush along a stroke segment and live-patches the overlay */
    const paintBrush = (g: Gesture, from: { x: number; y: number }, to: { x: number; y: number }) => {
        if (!g.working) return;
        const radius = toolOptions.brushSize / 2;
        const dist = Math.hypot(to.x - from.x, to.y - from.y);
        const steps = Math.max(1, Math.ceil(dist / Math.max(1, radius / 2)));
        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            brushStamp(g.working, imgW, imgH, from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, radius, !!g.erase);
        }
        const ctx = overlayRef.current?.getContext('2d');
        if (!ctx) return;
        const x0 = Math.max(0, Math.floor(Math.min(from.x, to.x) - radius - 2));
        const y0 = Math.max(0, Math.floor(Math.min(from.y, to.y) - radius - 2));
        const x1 = Math.min(imgW, Math.ceil(Math.max(from.x, to.x) + radius + 2));
        const y1 = Math.min(imgH, Math.ceil(Math.max(from.y, to.y) + radius + 2));
        if (x1 > x0 && y1 > y0) {
            ctx.clearRect(x0, y0, x1 - x0, y1 - y0);
            ctx.putImageData(maskOverlay(g.working, imgW, imgH, x0, y0, x1, y1), x0, y0);
        }
    };

    // --- pointer routing ---

    const gestureMode = (e: React.PointerEvent): CombineMode =>
        e.shiftKey ? 'add' : e.altKey ? 'subtract' : toolOptions.mode;

    const usingPan = (e: React.PointerEvent) => tool === 'move' || spaceHeld || e.button === 1;

    const onPointerDown = (e: React.PointerEvent) => {
        if (!displayed) return;
        (e.target as Element).setPointerCapture(e.pointerId);
        if (usingPan(e)) {
            panState.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
            setPanning(true);
            return;
        }
        const img = screenToImage(e.clientX, e.clientY);
        const screen = { x: e.clientX, y: e.clientY };
        if (tool === 'rect' || tool === 'ellipse' || tool === 'lasso' || tool === 'wand' || tool === 'brush') {
            gesture.current = {
                kind: tool,
                mode: gestureMode(e),
                startImg: img,
                lastImg: img,
                startScreen: screen,
                lastScreen: screen,
                pointsImg: [img],
                pointsScreen: [screen],
            };
            if (tool === 'brush') {
                const g = gesture.current;
                g.working = selection && selection.length === imgW * imgH ? selection.slice() : newMask(imgW, imgH);
                g.erase = e.altKey;
                paintBrush(g, img, img);
            }
        }
        setDraftTick(t => t + 1);
    };

    const onPointerMove = (e: React.PointerEvent) => {
        if (tool === 'brush') {
            hoverScreen.current = { x: e.clientX, y: e.clientY };
            if (!gesture.current) setDraftTick(t => t + 1);
        }
        const p = panState.current;
        if (p) {
            setPan(clampPan({ x: p.panX + e.clientX - p.startX, y: p.panY + e.clientY - p.startY }, scale));
            return;
        }
        const g = gesture.current;
        if (!g) return;
        const prevImg = g.lastImg;
        g.lastImg = screenToImage(e.clientX, e.clientY);
        g.lastScreen = { x: e.clientX, y: e.clientY };
        if (g.kind === 'brush') {
            paintBrush(g, prevImg, g.lastImg);
        }
        if (g.kind === 'lasso') {
            const prev = g.pointsScreen[g.pointsScreen.length - 1];
            if (Math.abs(g.lastScreen.x - prev.x) + Math.abs(g.lastScreen.y - prev.y) > 2) {
                g.pointsImg.push(g.lastImg);
                g.pointsScreen.push(g.lastScreen);
            }
        }
        setDraftTick(t => t + 1);
    };

    const onPointerUp = () => {
        if (panState.current) {
            panState.current = null;
            setPanning(false);
            return;
        }
        const g = gesture.current;
        gesture.current = null;
        setDraftTick(t => t + 1);
        if (!g || !imgW) return;
        const moved = Math.abs(g.lastImg.x - g.startImg.x) > 1 && Math.abs(g.lastImg.y - g.startImg.y) > 1;
        if (g.kind === 'rect') {
            if (moved) applyCommit(rectMask(imgW, imgH, g.startImg.x, g.startImg.y, g.lastImg.x, g.lastImg.y), g.mode);
        } else if (g.kind === 'ellipse') {
            if (moved) applyCommit(ellipseMask(imgW, imgH, g.startImg.x, g.startImg.y, g.lastImg.x, g.lastImg.y), g.mode);
        } else if (g.kind === 'lasso') {
            if (g.pointsImg.length >= 3) applyCommit(lassoMask(imgW, imgH, g.pointsImg), g.mode);
        } else if (g.kind === 'wand') {
            const sample = processed ?? originalImage;
            const clicked =
                Math.abs(g.lastScreen.x - g.startScreen.x) < 4 && Math.abs(g.lastScreen.y - g.startScreen.y) < 4;
            if (sample && clicked) {
                applyCommit(
                    magicWand(sample, g.startImg.x, g.startImg.y, toolOptions.tolerance, toolOptions.contiguous),
                    g.mode
                );
            }
        } else if (g.kind === 'brush' && g.working) {
            setSelection(g.working);
        }
    };

    // live gesture preview on the screen-space draft canvas
    useEffect(() => {
        const draft = draftRef.current;
        const container = containerRef.current;
        if (!draft || !container) return;
        if (draft.width !== container.clientWidth) draft.width = container.clientWidth;
        if (draft.height !== container.clientHeight) draft.height = container.clientHeight;
        const ctx = draft.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, draft.width, draft.height);
        const cRect = container.getBoundingClientRect();
        const g = gesture.current;
        if (!g) {
            // brush hover cursor
            const hov = hoverScreen.current;
            if (tool === 'brush' && hov) {
                ctx.setLineDash([]);
                ctx.lineWidth = 1;
                ctx.strokeStyle = 'rgba(255,255,255,0.9)';
                ctx.beginPath();
                ctx.arc(hov.x - cRect.left, hov.y - cRect.top, (toolOptions.brushSize / 2) * scale, 0, Math.PI * 2);
                ctx.stroke();
            }
            return;
        }
        const sx = g.startScreen.x - cRect.left;
        const sy = g.startScreen.y - cRect.top;
        const lx = g.lastScreen.x - cRect.left;
        const ly = g.lastScreen.y - cRect.top;
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#fff';
        if (g.kind === 'brush') {
            ctx.setLineDash([]);
            ctx.strokeStyle = g.erase ? 'rgba(248,113,113,0.9)' : 'rgba(255,255,255,0.9)';
            const lx0 = g.lastScreen.x - cRect.left;
            const ly0 = g.lastScreen.y - cRect.top;
            ctx.beginPath();
            ctx.arc(lx0, ly0, (toolOptions.brushSize / 2) * scale, 0, Math.PI * 2);
            ctx.stroke();
            return;
        }
        if (g.kind === 'rect') {
            ctx.strokeRect(Math.min(sx, lx), Math.min(sy, ly), Math.abs(lx - sx), Math.abs(ly - sy));
        } else if (g.kind === 'ellipse') {
            ctx.beginPath();
            ctx.ellipse((sx + lx) / 2, (sy + ly) / 2, Math.abs(lx - sx) / 2, Math.abs(ly - sy) / 2, 0, 0, Math.PI * 2);
            ctx.stroke();
        } else if (g.kind === 'lasso') {
            ctx.beginPath();
            g.pointsScreen.forEach((p, i) => {
                const px = p.x - cRect.left;
                const py = p.y - cRect.top;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            });
            ctx.stroke();
        }
    }, [draftTick, tool, toolOptions.brushSize, scale]);

    // keyboard: tools + selection commands + compare/fit + space-pan
    useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (isEditableTarget(e) || e.metaKey || e.ctrlKey) return;
            if (e.code === 'Space') {
                setSpaceHeld(true);
                if (displayed) e.preventDefault();
                return;
            }
            if (e.altKey) return;
            switch (e.key.toLowerCase()) {
                case 'c': setComparing(true); break;
                case 'f': setZoomClamped(zoom === null ? 1 : null); break;
                case 'v': setTool('move'); break;
                case 'm': setTool(t => (t === 'rect' ? 'ellipse' : 'rect')); break;
                case 'l': setTool('lasso'); break;
                case 'w': setTool('wand'); break;
                case 'b': setTool('brush'); break;
                case '[': setToolOptions(o => ({ ...o, brushSize: Math.max(2, Math.round(o.brushSize / 1.25)) })); break;
                case ']': setToolOptions(o => ({ ...o, brushSize: Math.min(512, Math.round(o.brushSize * 1.25)) })); break;
                case 'a': selectAll(); break;
                case 'x': invertSelection(); break;
                case 'd': clearSelection(); break;
                case 'escape': clearSelection(); break;
            }
        };
        const up = (e: KeyboardEvent) => {
            if (e.key === 'c' || e.key === 'C') setComparing(false);
            if (e.code === 'Space') setSpaceHeld(false);
        };
        window.addEventListener('keydown', down);
        window.addEventListener('keyup', up);
        return () => {
            window.removeEventListener('keydown', down);
            window.removeEventListener('keyup', up);
        };
    }, [zoom, setZoomClamped, displayed, selectAll, invertSelection, clearSelection]);

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
    const toolActive = tool !== 'move' && !spaceHeld;
    const cursor = panning ? 'grabbing' : toolActive ? 'crosshair' : scale > fitScale ? 'grab' : 'default';

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
                    style={{ cursor }}
                >
                    {/* image + selection overlay share one transformed wrapper */}
                    <div
                        className="relative flex-shrink-0"
                        style={{
                            width: `${imgW * scale}px`,
                            height: `${imgH * scale}px`,
                            transform: `translate(${pan.x}px, ${pan.y}px)`,
                            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
                        }}
                    >
                        <canvas
                            ref={canvasRef}
                            className="absolute inset-0 w-full h-full"
                            style={{
                                imageRendering: 'pixelated',
                                filter: showFilters ? filtersToCss(filters) : 'none',
                            }}
                        />
                        <canvas
                            ref={overlayRef}
                            className="absolute inset-0 w-full h-full pointer-events-none"
                            style={{ imageRendering: 'pixelated' }}
                        />
                    </div>

                    {/* screen-space live gesture preview */}
                    <canvas ref={draftRef} className="absolute inset-0 pointer-events-none" />

                    <SelectionToolbar
                        tool={tool}
                        setTool={setTool}
                        options={toolOptions}
                        setOptions={setToolOptions}
                        hasSelection={!!selection}
                        hasLastSelection={hasLastSelection}
                        coveragePct={coveragePct}
                        onSelectAll={selectAll}
                        onClear={clearSelection}
                        onInvert={invertSelection}
                        onReselect={reselect}
                        onApplyFeather={applyFeatherNow}
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
                        {coveragePct !== null && ` · selection ${coveragePct}%`}
                    </div>
                </div>
            )}
        </div>
    );
};
