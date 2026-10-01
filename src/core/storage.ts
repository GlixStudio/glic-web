// Browser storage names. The app used to be called GLIC Web and stored things
// under glic_ / glic-web names; whatever a browser still holds there is moved to
// the GLIX Encoder names once, so saved presets, projects and masks carry over.

const LEGACY_PREFIX = 'glic_';
const PREFIX = 'glix_encoder_';

/** localStorage key for this app */
export const storageKey = (name: string) => PREFIX + name;

const migrateLocalStorage = () => {
    try {
        const legacy: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k?.startsWith(LEGACY_PREFIX)) legacy.push(k);
        }
        for (const k of legacy) {
            const next = PREFIX + k.slice(LEGACY_PREFIX.length);
            const value = localStorage.getItem(k);
            if (value !== null && localStorage.getItem(next) === null) localStorage.setItem(next, value);
            localStorage.removeItem(k);
        }
    } catch {
        // storage unavailable (private mode, workers): nothing to move
    }
};

// at import, so it runs before any module reads a key through storageKey
migrateLocalStorage();

const done = <T>(req: IDBRequest<T>) =>
    new Promise<T>((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
    });

const openDb = (name: string, store: string): Promise<IDBDatabase> =>
    new Promise((resolve, reject) => {
        const req = indexedDB.open(name, 1);
        req.onupgradeneeded = () => {
            if (!req.result.objectStoreNames.contains(store)) req.result.createObjectStore(store, { keyPath: 'id' });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('IndexedDB unavailable'));
    });

/** an existing database, or null - aborting the upgrade keeps a missing one from being created */
const openIfExists = (name: string): Promise<IDBDatabase | null> =>
    new Promise(resolve => {
        const req = indexedDB.open(name);
        req.onupgradeneeded = () => req.transaction?.abort();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
    });

/** copy records the new database does not have yet, then drop the legacy one */
const migrateDb = async (db: IDBDatabase, store: string, legacyName: string) => {
    const legacy = await openIfExists(legacyName);
    if (!legacy) return;
    try {
        if (legacy.objectStoreNames.contains(store)) {
            const records = await done(legacy.transaction(store).objectStore(store).getAll());
            const have = new Set(await done(db.transaction(store).objectStore(store).getAllKeys()));
            const t = db.transaction(store, 'readwrite');
            const s = t.objectStore(store);
            for (const r of records as { id: IDBValidKey }[]) if (!have.has(r.id)) s.put(r);
            await new Promise<void>((resolve, reject) => {
                t.oncomplete = () => resolve();
                t.onerror = () => reject(t.error);
                t.onabort = () => reject(t.error);
            });
        }
    } finally {
        legacy.close();
    }
    indexedDB.deleteDatabase(legacyName);
};

/**
 * Opener for a one-store IndexedDB database (records keyed by `id`). The first
 * open of a session moves records over from `legacyName`; a failed move leaves
 * the legacy database in place to retry next time.
 */
export const indexedDbOpener = (name: string, store: string, legacyName: string) => {
    let migration: Promise<void> | null = null;
    return async (): Promise<IDBDatabase> => {
        migration ??= (async () => {
            const db = await openDb(name, store);
            try {
                await migrateDb(db, store, legacyName);
            } finally {
                db.close();
            }
        })().catch(() => {});
        await migration;
        return openDb(name, store);
    };
};
