import React, { useState } from 'react';
import { useApp } from '../core/AppContext';
import { Slider } from './controls/Slider';
import { Select } from './controls/Select';
import { Layers, ChevronDown, ChevronUp, Download, Play } from 'lucide-react';
import JSZip from 'jszip';
import GIF from 'gif.js';
// bundle the gif.js worker so GIF export works in production builds
import gifWorkerUrl from 'gif.js/dist/gif.worker.js?url';
import { imageDataToCanvas, canvasToPngBlob, downloadBlob, timestampedFilename } from '../core/imageio';

export const TilesetPanel: React.FC = () => {
    const { processed, filters, toast } = useApp();
    const [expanded, setExpanded] = useState(false);
    const [tileSize, setTileSize] = useState(16);
    const [format, setFormat] = useState<'gif' | 'webm'>('gif');
    const [fps, setFps] = useState(10);
    const [quality, setQuality] = useState(80);
    const [busy, setBusy] = useState(false);
    const [progress, setProgress] = useState(0);

    if (!processed) return null;

    const sourceTiles = (): HTMLCanvasElement[] | null => {
        const source = imageDataToCanvas(processed, filters);
        const tilesX = Math.floor(source.width / tileSize);
        const tilesY = Math.floor(source.height / tileSize);
        if (tilesX * tilesY === 0) {
            toast('error', `Image is too small for ${tileSize}×${tileSize} tiles`);
            return null;
        }
        const ctx = source.getContext('2d', { willReadFrequently: true })!;
        const tiles: HTMLCanvasElement[] = [];
        for (let y = 0; y < tilesY; y++) {
            for (let x = 0; x < tilesX; x++) {
                const tile = document.createElement('canvas');
                tile.width = tileSize;
                tile.height = tileSize;
                tile.getContext('2d')!.putImageData(ctx.getImageData(x * tileSize, y * tileSize, tileSize, tileSize), 0, 0);
                tiles.push(tile);
            }
        }
        return tiles;
    };

    const generateZip = async () => {
        const tiles = sourceTiles();
        if (!tiles) return;
        setBusy(true);
        try {
            const zip = new JSZip();
            const tilesX = Math.floor(processed.width / tileSize);
            for (let i = 0; i < tiles.length; i++) {
                zip.file(`tile_${i % tilesX}_${Math.floor(i / tilesX)}.png`, await canvasToPngBlob(tiles[i]));
                setProgress(Math.round(((i + 1) / tiles.length) * 100));
            }
            downloadBlob(await zip.generateAsync({ type: 'blob' }), timestampedFilename(`tileset-${tileSize}x${tileSize}`, 'zip'));
        } catch (e) {
            toast('error', `Tileset failed: ${(e as Error).message}`);
        } finally {
            setBusy(false);
            setProgress(0);
        }
    };

    const generateGif = (tiles: HTMLCanvasElement[]) => {
        const gifQuality = Math.max(1, Math.min(30, Math.round((30 * (100 - quality)) / 100)));
        const gif = new GIF({
            workers: 4,
            quality: gifQuality,
            width: tileSize,
            height: tileSize,
            repeat: 0,
            workerScript: gifWorkerUrl,
        });
        for (const t of tiles) gif.addFrame(t, { delay: 1000 / fps });
        gif.on('progress', (p: number) => setProgress(Math.round(p * 100)));
        gif.on('finished', (blob: Blob) => {
            downloadBlob(blob, timestampedFilename(`tileset-anim-${tileSize}x${tileSize}`, 'gif'));
            setBusy(false);
            setProgress(0);
        });
        gif.render();
    };

    const generateWebm = (tiles: HTMLCanvasElement[]) => {
        const canvas = document.createElement('canvas');
        canvas.width = tileSize;
        canvas.height = tileSize;
        const ctx = canvas.getContext('2d')!;
        ctx.imageSmoothingEnabled = false;

        const stream = canvas.captureStream(Math.max(fps, 30));
        const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
            ? 'video/webm;codecs=vp9'
            : 'video/webm';
        const recorder = new MediaRecorder(stream, {
            mimeType,
            videoBitsPerSecond: Math.round(1_000_000 + (quality / 100) * 4_000_000),
        });
        const chunks: Blob[] = [];
        recorder.ondataavailable = e => e.data.size > 0 && chunks.push(e.data);
        recorder.onerror = () => {
            toast('error', 'Recording failed - your browser may not support WebM capture');
            setBusy(false);
            setProgress(0);
            stream.getTracks().forEach(t => t.stop());
        };
        recorder.onstop = () => {
            downloadBlob(new Blob(chunks, { type: mimeType }), timestampedFilename(`tileset-anim-${tileSize}x${tileSize}`, 'webm'));
            setBusy(false);
            setProgress(0);
        };
        recorder.start();

        const frameDelay = 1000 / fps;
        const startTime = performance.now();
        let frame = 0;
        const draw = () => {
            if (frame < tiles.length) {
                ctx.clearRect(0, 0, tileSize, tileSize);
                ctx.drawImage(tiles[frame], 0, 0);
                frame++;
                setProgress(Math.round((frame / tiles.length) * 100));
                const delay = Math.max(0, frame * frameDelay - (performance.now() - startTime));
                setTimeout(draw, delay);
            } else {
                setTimeout(() => {
                    recorder.stop();
                    stream.getTracks().forEach(t => t.stop());
                }, frameDelay);
            }
        };
        draw();
    };

    const generateAnimation = () => {
        const tiles = sourceTiles();
        if (!tiles) return;
        setBusy(true);
        setProgress(0);
        try {
            if (format === 'gif') generateGif(tiles);
            else generateWebm(tiles);
        } catch (e) {
            toast('error', `Animation failed: ${(e as Error).message}`);
            setBusy(false);
        }
    };

    return (
        <div className="border-t border-line pt-4">
            <button
                onClick={() => setExpanded(e => !e)}
                className="w-full flex items-center justify-between mb-3 group"
            >
                <div className="flex items-center gap-2 text-ink-2 uppercase text-[10px] font-bold tracking-wider group-hover:text-ink transition-colors">
                    <Layers className="w-3 h-3" /> Tileset & animation
                </div>
                {expanded ? <ChevronUp className="w-4 h-4 text-ink-2" /> : <ChevronDown className="w-4 h-4 text-ink-2" />}
            </button>
            {expanded && (
                <div className="space-y-3">
                    <Select
                        label="Tile size"
                        value={tileSize}
                        options={[16, 32, 64].map(v => ({ label: `${v}×${v}`, value: v }))}
                        onChange={setTileSize}
                    />
                    <button
                        onClick={generateZip}
                        disabled={busy}
                        className="w-full py-2 rounded-lg font-bold text-sm bg-cream-2 hover:bg-white disabled:bg-cream-3 disabled:text-ink/30 text-ink border border-ink transition-all flex items-center justify-center gap-2"
                    >
                        <Download className="w-4 h-4" /> Tileset ZIP
                    </button>

                    <Select
                        label="Animation format"
                        value={format}
                        options={[
                            { label: 'GIF', value: 'gif' as const },
                            { label: 'WebM', value: 'webm' as const },
                        ]}
                        onChange={setFormat}
                    />
                    <Slider label="FPS" value={fps} min={1} max={60} onChange={setFps} />
                    <Slider label="Quality" value={quality} min={10} max={100} step={5} onChange={setQuality} />
                    {busy && progress > 0 && (
                        <div className="w-full bg-cream-2 rounded-full h-2 overflow-hidden">
                            <div className="bg-glx-orange h-full transition-all duration-300" style={{ width: `${progress}%` }} />
                        </div>
                    )}
                    <button
                        onClick={generateAnimation}
                        disabled={busy}
                        className="w-full py-2 rounded-lg font-bold text-sm bg-cream-2 hover:bg-white disabled:bg-cream-3 disabled:text-ink/30 text-ink border border-ink transition-all flex items-center justify-center gap-2"
                    >
                        {busy ? (
                            <>
                                <div className="w-4 h-4 border-2 border-ink/30 border-t-ink rounded-full animate-spin" />
                                {progress > 0 ? `${progress}%` : 'Working…'}
                            </>
                        ) : (
                            <>
                                <Play className="w-4 h-4 fill-current" /> Animation
                            </>
                        )}
                    </button>
                </div>
            )}
        </div>
    );
};
