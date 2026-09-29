// Local project persistence on IndexedDB (not localStorage: a single
// print-resolution source image exceeds localStorage's ~5MB string budget,
// while IndexedDB stores the PNG blobs natively with no practical limit).
// Everything stays in the browser.

import type { CodecConfig } from './Codec';
import type { BlendMode, LayerKind } from './layers';
import type { Effect } from './effects';
import type { LayerTransform } from './transform';

export interface StoredLayer {
    /** absent in projects saved before adjustment layers (= 'pixel') */
    kind?: LayerKind;
    name: string;
    visible: boolean;
    opacity: number;
    blendMode: BlendMode;
    mask: Uint8Array | null;
    /** PNG-compressed full-frame result; null for adjustment layers */
    result: Blob | null;
    /** absent in projects saved before layer effects */
    effects?: Effect[];
    /** absent in projects saved before layer transforms */
    transform?: LayerTransform;
    file: Uint8Array | null;
    resolved: CodecConfig | null;
    thumb: string | null;
}

export interface ProjectRecord {
    id: string;
    name: string;
    updatedAt: number;
    width: number;
    height: number;
    /** composite preview for the Open dialog */
    thumb: string;
    /** PNG-compressed source image */
    source: Blob;
    layers: StoredLayer[];
    activeLayerIndex: number;
    config: CodecConfig;
    separateChannels: boolean;
    /** absent in projects saved before the Background could be hidden (= true) */
    backgroundVisible?: boolean;
    backgroundLocked?: boolean;
}

export interface ProjectMeta {
    id: string;
    name: string;
    updatedAt: number;
    width: number;
    height: number;
    thumb: string;
    layerCount: number;
}

const DB_NAME = 'glic-web';
const STORE = 'projects';

const openDb = (): Promise<IDBDatabase> =>
    new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
            if (!req.result.objectStoreNames.contains(STORE)) {
                req.result.createObjectStore(STORE, { keyPath: 'id' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('IndexedDB unavailable'));
    });

const tx = async <T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const db = await openDb();
    try {
        return await new Promise<T>((resolve, reject) => {
            const t = db.transaction(STORE, mode);
            const req = run(t.objectStore(STORE));
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
        });
    } finally {
        db.close();
    }
};

export const saveProjectRecord = (record: ProjectRecord): Promise<IDBValidKey> =>
    tx('readwrite', store => store.put(record));

export const getProject = (id: string): Promise<ProjectRecord | undefined> =>
    tx('readonly', store => store.get(id) as IDBRequest<ProjectRecord | undefined>);

export const deleteProject = (id: string): Promise<undefined> =>
    tx('readwrite', store => store.delete(id) as IDBRequest<undefined>);

export const listProjects = async (): Promise<ProjectMeta[]> => {
    const all = await tx('readonly', store => store.getAll() as IDBRequest<ProjectRecord[]>);
    return all
        .map(r => ({
            id: r.id,
            name: r.name,
            updatedAt: r.updatedAt,
            width: r.width,
            height: r.height,
            thumb: r.thumb,
            layerCount: r.layers.length,
        }))
        .sort((a, b) => b.updatedAt - a.updatedAt);
};

/** Pattrn-style default name: Project-0001, -0002, ... */
export const nextProjectName = async (): Promise<string> => {
    const metas = await listProjects().catch(() => [] as ProjectMeta[]);
    let n = 0;
    for (const m of metas) {
        const match = /^Project-(\d+)$/.exec(m.name);
        if (match) n = Math.max(n, parseInt(match[1]));
    }
    return `Project-${String(n + 1).padStart(4, '0')}`;
};
