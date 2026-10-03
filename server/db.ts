// The database as the routes see it: parameterised queries and an atomic batch.
// Production talks to Neon over HTTP; tests and the local dev server use an
// in-process Postgres (PGlite) behind the same interface.

import { neon } from '@neondatabase/serverless';

export type Row = Record<string, unknown>;

export interface Statement {
    text: string;
    params?: unknown[];
}

export interface Db {
    query<T = Row>(text: string, params?: unknown[]): Promise<T[]>;
    /** runs the statements in one transaction; all land or none do */
    batch(statements: Statement[]): Promise<void>;
}

export const neonDb = (url: string): Db => {
    const sql = neon(url);
    return {
        query: async <T>(text: string, params: unknown[] = []) => (await sql.query(text, params)) as T[],
        batch: async statements => {
            await sql.transaction(statements.map(s => sql.query(s.text, s.params ?? [])));
        },
    };
};

/** first row or null */
export const one = async <T = Row>(db: Db, text: string, params?: unknown[]): Promise<T | null> =>
    (await db.query<T>(text, params))[0] ?? null;

/** timestamps come back as Date from some drivers and strings from others */
export const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString());
export const isoOrNull = (v: unknown): string | null => (v == null ? null : iso(v));
