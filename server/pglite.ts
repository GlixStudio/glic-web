// PGlite (Postgres compiled to WASM) behind the Db interface, for tests and the
// local dev server. Not bundled into the Worker.

import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Db } from './db';

export const pgliteDb = (pg: PGlite): Db => ({
    query: async <T>(text: string, params: unknown[] = []) => (await pg.query<T>(text, params)).rows,
    batch: async statements => {
        await pg.transaction(async tx => {
            for (const s of statements) await tx.query(s.text, s.params ?? []);
        });
    },
});

const MIGRATIONS = join(import.meta.dirname, '..', 'db', 'migrations');

/** applies every migration in db/migrations not yet recorded in schema_migrations */
export const migrate = async (pg: PGlite) => {
    const hasTable = await pg.query(`SELECT 1 FROM information_schema.tables WHERE table_name = 'schema_migrations'`);
    const done = new Set(
        hasTable.rows.length ? (await pg.query<{ version: string }>('SELECT version FROM schema_migrations')).rows.map(r => r.version) : []
    );
    for (const file of readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort()) {
        if (!done.has(file.replace(/\.sql$/, ''))) await pg.exec(readFileSync(join(MIGRATIONS, file), 'utf8'));
    }
};
