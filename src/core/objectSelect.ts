// Object-aware selection (magic wand "Object" mode) with MediaPipe's
// interactive segmenter: click an object (or scribble along it) and get its
// outline. It runs locally in a worker - images never leave the browser. Only
// the runtime (~12 MB, from jsDelivr) and the model (6 MB, from Google) are
// downloaded, on first use; the model is kept in Cache Storage.

import type { Mask } from './selection';
import { resampleMask } from './resize';
import { thinPath } from './objectSelectShared';

/** longest side fed to the encoder (it works at a fixed internal size anyway) */
const MAX_INPUT = 1024;

export interface ObjectPoint {
    /** image pixel coordinates */
    x: number;
    y: number;
}

type Out =
    | { type: 'progress'; fraction: number }
    | { type: 'ready' }
    | { type: 'ok'; id: number }
    | { type: 'mask'; id: number; width: number; height: number; data: ArrayBuffer }
    | { type: 'error'; id: number; error: string };

const downscale = (img: ImageData): ImageData => {
    const k = Math.min(1, MAX_INPUT / Math.max(img.width, img.height));
    if (k === 1) return new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);
    const w = Math.max(1, Math.round(img.width * k));
    const h = Math.max(1, Math.round(img.height * k));
    const src = document.createElement('canvas');
    src.width = img.width;
    src.height = img.height;
    src.getContext('2d')!.putImageData(img, 0, 0);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h);
};

class ObjectSelector {
    private worker: Worker | null = null;
    private ready: Promise<void> | null = null;
    private nextId = 1;
    private pending = new Map<number, { resolve: (v: Out) => void; reject: (e: Error) => void }>();
    private progressFn: ((f: number) => void) | null = null;
    private readyWaiter: { resolve: () => void; reject: (e: Error) => void } | null = null;
    private encoded: ImageData | null = null;
    private encoding: Promise<void> | null = null;

    get loaded() {
        return this.ready !== null;
    }

    private ensureWorker(): Worker {
        if (this.worker) return this.worker;
        const w = new Worker(new URL('../workers/object.worker.ts', import.meta.url), { type: 'module' });
        w.onmessage = (e: MessageEvent<Out>) => {
            const m = e.data;
            if (m.type === 'progress') this.progressFn?.(m.fraction);
            else if (m.type === 'ready') this.readyWaiter?.resolve();
            else if (m.type === 'error' && m.id === -1) this.readyWaiter?.reject(new Error(m.error));
            else if ('id' in m) {
                const p = this.pending.get(m.id);
                if (!p) return;
                this.pending.delete(m.id);
                if (m.type === 'error') p.reject(new Error(m.error));
                else p.resolve(m);
            }
        };
        this.worker = w;
        return w;
    }

    private call(msg: Record<string, unknown>, transfer: Transferable[] = []): Promise<Out> {
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.ensureWorker().postMessage({ ...msg, id }, transfer);
        });
    }

    /** Downloads/initialises the model once; progress 0..1 while downloading. */
    load(onProgress?: (f: number) => void): Promise<void> {
        if (onProgress) this.progressFn = onProgress;
        if (!this.ready) {
            this.ready = new Promise<void>((resolve, reject) => {
                this.readyWaiter = { resolve, reject };
                this.ensureWorker().postMessage({ type: 'load' });
            }).catch(e => {
                this.ready = null;
                this.worker?.terminate();
                this.worker = null;
                throw e;
            });
        }
        return this.ready;
    }

    /** Hands the image to the worker unless it already has this exact one. */
    async prepare(img: ImageData): Promise<void> {
        await this.load();
        if (this.encoded === img) return this.encoding ?? undefined;
        this.encoded = img;
        const small = downscale(img);
        this.encoding = this.call({ type: 'image', width: small.width, height: small.height, data: small.data.buffer }, [small.data.buffer]).then(
            () => undefined,
            e => {
                this.encoded = null;
                throw e;
            }
        );
        return this.encoding;
    }

    isPrepared(img: ImageData) {
        return this.encoded === img;
    }

    /** Mask of the object under a click (one point) or along a scribble, at full image size. */
    async segment(img: ImageData, points: ObjectPoint[]): Promise<Mask> {
        await this.prepare(img);
        const res = await this.call({
            type: 'segment',
            points: thinPath(points).map(p => ({
                x: Math.min(1, Math.max(0, (p.x + 0.5) / img.width)),
                y: Math.min(1, Math.max(0, (p.y + 0.5) / img.height)),
            })),
        });
        if (res.type !== 'mask') throw new Error('unexpected reply');
        return resampleMask(new Uint8ClampedArray(res.data), res.width, res.height, img.width, img.height, 'smooth');
    }
}

export const objectSelector = new ObjectSelector();
