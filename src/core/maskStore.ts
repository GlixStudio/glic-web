// The mask library, persisted in its own IndexedDB database so masks outlive
// images and projects ("remember them"). Masks are stored as grayscale PNGs,
// which compress hard-edged masks to a tiny fraction of their raw size.

import type { Mask } from './selection';
import { maskToImageData } from './selection';
import { imageDataToPngBlob, blobToImageData } from './imageio';

export interface SavedMask {
    id: string;
    name: string;
    width: number;
    height: number;
    createdAt: number;
    mask: Mask;
    thumb: string;
}

interface StoredMask {
    id: string;
    name: string;
    width: number;
    height: number;
    createdAt: number;
    png: Blob;
    thumb: string;
}

const DB_NAME = 'glic-web-masks';
const STORE = 'masks';

const openDb = (): Promise<IDBDatabase> =>
    new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
            if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('IndexedDB unavailable'));
    });

const run = async <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const db = await openDb();
    try {
        return await new Promise<T>((resolve, reject) => {
            const req = fn(db.transaction(STORE, mode).objectStore(STORE));
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
        });
    } finally {
        db.close();
    }
};

export const putMask = async (m: SavedMask): Promise<void> => {
    const png = await imageDataToPngBlob(maskToImageData(m.mask, m.width, m.height));
    const rec: StoredMask = { id: m.id, name: m.name, width: m.width, height: m.height, createdAt: m.createdAt, png, thumb: m.thumb };
    await run('readwrite', s => s.put(rec));
};

export const removeMask = async (id: string): Promise<void> => {
    await run('readwrite', s => s.delete(id));
};

export const loadMasks = async (): Promise<SavedMask[]> => {
    const recs = await run('readonly', s => s.getAll() as IDBRequest<StoredMask[]>);
    const out = await Promise.all(
        recs.map(async r => {
            const img = await blobToImageData(r.png);
            const mask = new Uint8ClampedArray(r.width * r.height);
            for (let i = 0; i < mask.length; i++) mask[i] = img.data[i * 4];
            return { id: r.id, name: r.name, width: r.width, height: r.height, createdAt: r.createdAt, mask, thumb: r.thumb };
        })
    );
    return out.sort((a, b) => a.createdAt - b.createdAt);
};

/** Small grayscale preview of a mask (white = selected) on a checker-free dark ground. */
export const maskThumbnail = (mask: Mask, w: number, h: number, maxSize = 48): string => {
    const scale = maxSize / Math.max(w, h);
    const tw = Math.max(1, Math.round(w * scale));
    const th = Math.max(1, Math.round(h * scale));
    const src = document.createElement('canvas');
    src.width = w;
    src.height = h;
    src.getContext('2d')!.putImageData(maskToImageData(mask, w, h), 0, 0);
    const out = document.createElement('canvas');
    out.width = tw;
    out.height = th;
    const ctx = out.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, tw, th);
    return out.toDataURL();
};

export const newMaskId = () =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `m-${Date.now()}-${Math.random()}`;
