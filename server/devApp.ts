// The community API for local development: the same app as the Worker, on an
// in-process Postgres (PGlite) and the local disk, both under .data/. Vite
// mounts it on /api and /media (server/vitePlugin.ts), so `npm run dev` is the
// whole stack in one process. Delete .data/ to start over.

import { PGlite } from '@electric-sql/pglite';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createApp } from './app';
import { migrate, pgliteDb } from './pglite';
import type { BlobStore } from './store';

const DATA = join(import.meta.dirname, '..', '.data');
const MEDIA = join(DATA, 'media');

const fsStore: BlobStore = {
    async put(key, body, contentType) {
        const path = join(MEDIA, key);
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, body);
        writeFileSync(`${path}.type`, contentType);
    },
    async get(key, range) {
        const path = join(MEDIA, key);
        if (!existsSync(path)) return null;
        const all = new Uint8Array(readFileSync(path));
        const contentType = readFileSync(`${path}.type`, 'utf8');
        const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;
        if (m && (m[1] || m[2])) {
            const total = statSync(path).size;
            const start = m[1] ? Number(m[1]) : Math.max(0, total - Number(m[2]));
            const end = m[1] && m[2] ? Math.min(total - 1, Number(m[2])) : total - 1;
            const body = all.subarray(start, end + 1);
            return { body, contentType, size: body.byteLength, etag: null, contentRange: `bytes ${start}-${end}/${total}` };
        }
        return { body: all, contentType, size: all.byteLength, etag: null, contentRange: null };
    },
    async delete(keys) {
        for (const k of keys) {
            rmSync(join(MEDIA, k), { force: true });
            rmSync(join(MEDIA, `${k}.type`), { force: true });
        }
    },
};

export const createDevApp = async () => {
    mkdirSync(MEDIA, { recursive: true });
    const pg = new PGlite(join(DATA, 'pglite'));
    await migrate(pg);
    const db = pgliteDb(pg);
    return createApp(() => ({
        db,
        store: fsStore,
        secureCookies: false,
        // locally, the first account made is the admin - no setup step
        onRegistered: async userId => {
            const promoted = await db.query(
                `UPDATE users SET role = 'admin' WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM users WHERE role = 'admin') RETURNING email`,
                [userId]
            );
            if (promoted.length) console.log(`[community] ${(promoted[0] as { email: string }).email} is the local admin`);
        },
    }));
};
