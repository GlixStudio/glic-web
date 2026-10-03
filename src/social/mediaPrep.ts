// Getting the canvas ready for the gallery, in the browser, before upload.
//
// The pixels come straight from the editor. Under the target size they go up
// as a lossless PNG; over it they become WebP via webpShrink (lossless first,
// verified pixel for pixel), and the result says exactly what happened.

import type { WebpRequest } from '../workers/webp.worker';
import type { ShrinkResult } from './webpShrink';

export interface PreparedFile {
    blob: Blob;
    name: string;
    mime: string;
    width?: number;
    height?: number;
    metadata: Record<string, unknown>;
}

export interface PreparedMedia {
    primary: PreparedFile;
    preview: PreparedFile | null;
    /** one line for the share dialog, e.g. "PNG 23.1 MB → lossless WebP 7.4 MB (pixel-identical)" */
    summary: string;
    converted: boolean;
    /** set when the conversion visibly changed the image */
    warning: string | null;
}

export interface Limits {
    targetBytes: number;
    maxBytes: number;
}

/** below this PSNR, compression is something a viewer can see */
const VISIBLE_LOSS_DB = 32;

export const formatBytes = (n: number) =>
    n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`;

const LABEL: Record<string, string> = { 'image/png': 'PNG', 'image/webp': 'WebP' };

// --- the worker ---

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; progress?: (l: string) => void }>();

type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never;

const call = <T>(msg: WithoutId<WebpRequest>, progress?: (label: string) => void): Promise<T> => {
    if (!worker) {
        worker = new Worker(new URL('../workers/webp.worker.ts', import.meta.url), { type: 'module' });
        worker.onmessage = (e: MessageEvent<{ id: number; result?: unknown; error?: string; progress?: string }>) => {
            const p = pending.get(e.data.id);
            if (!p) return;
            if (e.data.progress) return p.progress?.(e.data.progress);
            pending.delete(e.data.id);
            if (e.data.error) p.reject(new Error(e.data.error));
            else p.resolve(e.data.result);
        };
        worker.onerror = e => {
            for (const p of pending.values()) p.reject(new Error(e.message || 'Image worker failed'));
            pending.clear();
            worker = null;
        };
    }
    const id = nextId++;
    return new Promise<T>((resolve, reject) => {
        pending.set(id, { resolve: resolve as (v: unknown) => void, reject, progress });
        // a copy goes to the worker: the caller's pixels stay intact
        worker!.postMessage({ ...msg, id });
    });
};

// --- renditions ---

const previewFrom = async (img: ImageData, sourceBytes: number, baseName: string): Promise<PreparedFile | null> => {
    const r = await call<{ bytes: Uint8Array; width: number; height: number } | null>({ op: 'preview', img, sourceBytes });
    if (!r) return null;
    return { blob: new Blob([r.bytes as Uint8Array<ArrayBuffer>], { type: 'image/webp' }), name: `${baseName}-preview.webp`, mime: 'image/webp', width: r.width, height: r.height, metadata: {} };
};

const baseNameOf = (name: string) => name.replace(/\.[^.]+$/, '').slice(0, 80) || 'glix';

/** pixels straight from the editor - no decode step, so nothing is lost before encoding */
export const prepareImageData = async (img: ImageData, name: string, limits: Limits, onStep?: (label: string) => void): Promise<PreparedMedia> => {
    onStep?.('Encoding PNG');
    const c = new OffscreenCanvas(img.width, img.height);
    c.getContext('2d')!.putImageData(img, 0, 0);
    const png = await c.convertToBlob({ type: 'image/png' });
    const base = baseNameOf(name);
    if (png.size <= limits.targetBytes) {
        return {
            primary: { blob: png, name: `${base}.png`, mime: 'image/png', width: img.width, height: img.height, metadata: { original: { bytes: png.size, mime: 'image/png' } } },
            preview: await previewFrom(img, png.size, base),
            summary: `PNG ${formatBytes(png.size)}, lossless`,
            converted: false,
            warning: null,
        };
    }
    return shrinkImage(img, { bytes: png.size, mime: 'image/png', name: base }, limits, onStep);
};

const shrinkImage = async (
    img: ImageData,
    original: { bytes: number; mime: string; name: string },
    limits: Limits,
    onStep?: (label: string) => void
): Promise<PreparedMedia> => {
    const r = await call<ShrinkResult>({ op: 'shrink', img, targetBytes: limits.targetBytes }, onStep);
    const quality =
        r.mode === 'lossless'
            ? 'lossless WebP'
            : `${r.mode === 'near-lossless' ? 'near-lossless WebP' : `WebP q${r.quality}`}${Number.isFinite(r.psnr) ? `, ${r.psnr.toFixed(1)} dB` : ''}`;
    const detail = r.mode === 'lossless' ? ' (pixel-identical)' : r.scale < 1 ? ` at ${r.width}×${r.height} (${Math.round(r.scale * 100)}% size)` : '';
    onStep?.('Making a preview');
    const blob = new Blob([r.bytes as Uint8Array<ArrayBuffer>], { type: 'image/webp' });
    return {
        primary: {
            blob,
            name: `${original.name}.webp`,
            mime: 'image/webp',
            width: r.width,
            height: r.height,
            metadata: {
                original: { bytes: original.bytes, mime: original.mime, width: img.width, height: img.height },
                transcode: { mode: r.mode, quality: r.quality, psnr: Number.isFinite(r.psnr) ? Math.round(r.psnr * 100) / 100 : null, scale: r.scale },
            },
        },
        preview: await previewFrom(img, blob.size, original.name),
        summary: `${LABEL[original.mime] ?? 'Image'} ${formatBytes(original.bytes)} → ${quality} ${formatBytes(blob.size)}${detail}`,
        converted: true,
        warning:
            r.scale < 1
                ? `To fit under ${formatBytes(limits.targetBytes)} the image was scaled down. Export a smaller crop or size for full resolution.`
                : r.psnr < VISIBLE_LOSS_DB
                  ? `This image is too detailed for ${formatBytes(limits.targetBytes)} without visible compression. Export a smaller size or crop to keep it crisp.`
                  : null,
    };
};
