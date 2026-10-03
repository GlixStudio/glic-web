// Request-scoped plumbing shared by every route: dependencies, the signed-in
// user, settings, permissions, errors and rate limits.

import type { Context } from 'hono';
import { z } from 'zod';
import type { GalleryAccess, ModerationMode, Role, Settings, UserStatus } from '../shared/api';
import type { Db } from './db';
import { one } from './db';
import type { BlobStore } from './store';
import { loadSettings } from './settings';
import { newId } from './crypto';

export interface Deps {
    db: Db;
    store: BlobStore;
    /** Secure cookies everywhere but plain-http localhost */
    secureCookies: boolean;
    /** local development only: runs after an account is created */
    onRegistered?: (userId: string) => Promise<void>;
}

export interface SessionUser {
    id: string;
    email: string;
    handle: string;
    display_name: string;
    bio: string;
    avatar_url: string | null;
    role: Role;
    status: UserStatus;
    created_at: unknown;
}

export type AppEnv = {
    Variables: {
        deps: Deps;
        user: SessionUser | null;
        settings: Settings | undefined;
    };
};
export type Ctx = Context<AppEnv>;

export class HttpError extends Error {
    status: 400 | 401 | 403 | 404 | 409 | 411 | 413 | 415 | 429 | 500 | 503;
    code: string;
    constructor(status: HttpError['status'], code: string, message: string) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

export const bad = (message: string, code = 'bad_request') => new HttpError(400, code, message);
export const notFound = (what = 'Not found') => new HttpError(404, 'not_found', what);
export const forbidden = (message = 'You are not allowed to do that', code = 'forbidden') => new HttpError(403, code, message);

export const settingsOf = async (c: Ctx): Promise<Settings> => {
    let s = c.get('settings');
    if (!s) {
        s = await loadSettings(c.get('deps').db);
        c.set('settings', s);
    }
    return s;
};

// --- roles ---

const RANK: Record<Role, number> = { user: 0, trusted: 1, moderator: 2, admin: 3 };
export const rank = (role: Role) => RANK[role];
export const isStaff = (u: SessionUser | null): boolean => !!u && rank(u.role) >= RANK.moderator;
export const isAdmin = (u: SessionUser | null): boolean => !!u && u.role === 'admin';

export const requireUser = (c: Ctx): SessionUser => {
    const u = c.get('user');
    if (!u) throw new HttpError(401, 'unauthenticated', 'Sign in first');
    return u;
};

/** signed in and allowed to create things (not suspended) */
export const requireActive = (c: Ctx): SessionUser => {
    const u = requireUser(c);
    if (u.status !== 'active') throw forbidden('Your account is suspended', 'suspended');
    return u;
};

// a suspended moderator or admin keeps the role but loses its powers
export const requireStaff = (c: Ctx): SessionUser => {
    const u = requireActive(c);
    if (!isStaff(u)) throw forbidden();
    return u;
};

export const requireAdmin = (c: Ctx): SessionUser => {
    const u = requireActive(c);
    if (!isAdmin(u)) throw forbidden();
    return u;
};

export const canViewGallery = (access: GalleryAccess, u: SessionUser | null) =>
    access === 'public' || (access === 'members' && !!u) || isStaff(u);

export const requireGallery = async (c: Ctx) => {
    const s = await settingsOf(c);
    if (!canViewGallery(s.galleryAccess, c.get('user')))
        throw forbidden(
            s.galleryAccess === 'members' ? 'Sign in to see the gallery' : 'The gallery is closed for review right now',
            'gallery_restricted'
        );
};

/**
 * What a new post or comment starts as under a moderation mode, or null when
 * the author may not post at all ('closed' is staff-only).
 */
export const initialStatus = (mode: ModerationMode, role: Role): 'published' | 'pending' | null => {
    const staff = rank(role) >= RANK.moderator;
    if (mode === 'closed') return staff ? 'published' : null;
    if (mode === 'open') return 'published';
    if (mode === 'trusted') return rank(role) >= RANK.trusted ? 'published' : 'pending';
    return staff ? 'published' : 'pending';
};

// --- validation ---

export const parse = <T extends z.ZodType>(schema: T, value: unknown): z.infer<T> => {
    const r = schema.safeParse(value);
    if (!r.success) {
        const issue = r.error.issues[0];
        const where = issue.path.length ? `${issue.path.join('.')}: ` : '';
        throw bad(`${where}${issue.message}`, 'invalid');
    }
    return r.data;
};

export const jsonBody = async <T extends z.ZodType>(c: Ctx, schema: T): Promise<z.infer<T>> => {
    let body: unknown;
    try {
        body = await c.req.json();
    } catch {
        throw bad('Expected a JSON body');
    }
    return parse(schema, body);
};

export const clientIp = (c: Ctx) => c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';

// --- rate limits (fixed windows in Postgres) ---

export const hitLimit = async (db: Db, key: string, limit: number, windowSeconds: number) => {
    const row = await one<{ count: number }>(
        db,
        `INSERT INTO rate_limits (key, window_start, count) VALUES ($1, now(), 1)
         ON CONFLICT (key) DO UPDATE SET
           count = CASE WHEN rate_limits.window_start < now() - make_interval(secs => $2) THEN 1 ELSE rate_limits.count + 1 END,
           window_start = CASE WHEN rate_limits.window_start < now() - make_interval(secs => $2) THEN now() ELSE rate_limits.window_start END
         RETURNING count`,
        [key, windowSeconds]
    );
    if (row && Number(row.count) > limit) throw new HttpError(429, 'rate_limited', 'Too many attempts - try again in a little while');
};

/**
 * Takes the row lock on a post or comment as the first statement of a batch, so
 * concurrent batches that recount its reactions or comments run one after the
 * other and each recount sees the other's row.
 */
export const lockRow = (table: 'posts' | 'comments', id: string) => ({ text: `SELECT 1 FROM ${table} WHERE id = $1 FOR UPDATE`, params: [id] });

/** throws when a counter is already over its limit, without counting this request */
export const checkLimit = async (db: Db, key: string, limit: number, windowSeconds: number) => {
    const row = await one<{ count: number }>(
        db,
        `SELECT count FROM rate_limits WHERE key = $1 AND window_start >= now() - make_interval(secs => $2)`,
        [key, windowSeconds]
    );
    if (row && Number(row.count) >= limit) throw new HttpError(429, 'rate_limited', 'Too many attempts - try again in a little while');
};

// --- audit ---

export const auditStatement = (
    actorId: string | null,
    action: string,
    targetType: string | null,
    targetId: string | null,
    data: Record<string, unknown> = {}
) => ({
    text: 'INSERT INTO audit_log (id, actor_id, action, target_type, target_id, data) VALUES ($1, $2, $3, $4, $5, $6)',
    params: [newId(), actorId, action, targetType, targetId, JSON.stringify(data)],
});
