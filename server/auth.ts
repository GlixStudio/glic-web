// Email + password accounts with cookie sessions.
//
// The session cookie holds a random token; the database keeps only its
// SHA-256, so a leaked sessions table signs nobody in. Sign-in methods live in
// `accounts`, so another identity provider can be added beside 'password'.

import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import type { SessionResponse } from '../shared/api';
import { iso, one } from './db';
import type { Db } from './db';
import { burnPasswordCheck, hashPassword, newId, randomToken, sha256Hex, verifyPassword } from './crypto';
import {
    type AppEnv,
    type Ctx,
    type SessionUser,
    HttpError,
    auditStatement,
    bad,
    checkLimit,
    clientIp,
    forbidden,
    hitLimit,
    jsonBody,
    requireActive,
    requireUser,
    settingsOf,
} from './core';
import { meDto } from './dto';

export const SESSION_COOKIE = 'glix_sid';
const SESSION_DAYS = 30;

const USER_COLUMNS = 'u.id, u.email, u.handle, u.display_name, u.bio, u.avatar_url, u.role, u.status, u.created_at';

const RESERVED_HANDLES = new Set([
    'admin', 'administrator', 'api', 'media', 'gallery', 'glix', 'glixstudio', 'moderator', 'mod', 'staff',
    'support', 'root', 'system', 'me', 'settings', 'login', 'logout', 'signup', 'register', 'u', 'p',
]);

export const handleSchema = z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9_](?:[a-zA-Z0-9_.-]{1,28}[a-zA-Z0-9_])$/, '3-30 letters, digits, _ . or -, not starting or ending with . or -')
    .refine(h => !RESERVED_HANDLES.has(h.toLowerCase()), 'That handle is reserved');
const emailSchema = z.string().trim().max(254).regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Enter a valid email address');
const passwordSchema = z.string().min(8, 'Use at least 8 characters').max(200);

// --- sessions ---

export const resolveSession = async (db: Db, token: string | undefined): Promise<{ user: SessionUser; refresh: boolean } | null> => {
    if (!token || token.length > 100) return null;
    const id = await sha256Hex(token);
    const row = await one<SessionUser & { expires_at: unknown; last_used_at: unknown }>(
        db,
        `SELECT ${USER_COLUMNS}, s.expires_at, s.last_used_at
         FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.id = $1 AND s.expires_at > now()`,
        [id]
    );
    if (!row || row.status === 'banned') return null;
    // slide the expiry at most once a day, not on every request
    const refresh = Date.now() - new Date(iso(row.last_used_at)).getTime() > 86_400_000;
    if (refresh) {
        await db.query(
            `UPDATE sessions SET last_used_at = now(), expires_at = now() + make_interval(days => $2) WHERE id = $1`,
            [id, SESSION_DAYS]
        );
        await db.query('UPDATE users SET last_seen_at = now() WHERE id = $1', [row.id]);
    }
    return { user: row, refresh };
};

const setSessionCookie = (c: Ctx, token: string) =>
    setCookie(c, SESSION_COOKIE, token, {
        httpOnly: true,
        secure: c.get('deps').secureCookies,
        sameSite: 'Lax',
        path: '/',
        maxAge: SESSION_DAYS * 86_400,
    });

const startSession = async (c: Ctx, userId: string) => {
    const token = randomToken();
    await c.get('deps').db.query(
        `INSERT INTO sessions (id, user_id, expires_at, ip, user_agent)
         VALUES ($1, $2, now() + make_interval(days => $3), $4, $5)`,
        [await sha256Hex(token), userId, SESSION_DAYS, clientIp(c), (c.req.header('user-agent') ?? '').slice(0, 300)]
    );
    setSessionCookie(c, token);
};

/** re-sends the cookie when the session's expiry slid forward */
export const refreshCookie = (c: Ctx) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (token) setSessionCookie(c, token);
};

const loadUser = (db: Db, id: string) => one<SessionUser>(db, `SELECT ${USER_COLUMNS} FROM users u WHERE u.id = $1`, [id]);

// --- routes ---

export const authRoutes = new Hono<AppEnv>();

authRoutes.get('/session', async c => {
    const user = c.get('user');
    const body: SessionResponse = { user: user ? meDto(user) : null, settings: await settingsOf(c) };
    return c.json(body);
});

authRoutes.post('/auth/register', async c => {
    const settings = await settingsOf(c);
    const { db } = c.get('deps');
    const input = await jsonBody(c, z.object({ email: emailSchema, password: passwordSchema, handle: handleSchema }));
    await hitLimit(db, `register:${clientIp(c)}`, 10, 3600);
    if (settings.registration === 'closed') throw forbidden('Sign-ups are closed right now', 'registration_closed');

    const email = input.email.toLowerCase();
    const taken = await one<{ email: string; handle: string }>(
        db,
        'SELECT email, handle FROM users WHERE lower(email) = $1 OR lower(handle) = lower($2) LIMIT 1',
        [email, input.handle]
    );
    if (taken) {
        throw taken.email.toLowerCase() === email
            ? new HttpError(409, 'email_taken', 'An account with that email already exists')
            : new HttpError(409, 'handle_taken', 'That handle is taken');
    }
    const userId = newId();
    await db.batch([
        {
            text: 'INSERT INTO users (id, email, handle, display_name) VALUES ($1, $2, $3, $4)',
            params: [userId, email, input.handle, input.handle],
        },
        {
            text: `INSERT INTO accounts (id, user_id, provider, provider_account_id, password_hash) VALUES ($1, $2, 'password', $3, $4)`,
            params: [newId(), userId, email, await hashPassword(input.password)],
        },
    ]);
    await c.get('deps').onRegistered?.(userId);
    await startSession(c, userId);
    return c.json({ user: meDto((await loadUser(db, userId))!) }, 201);
});

authRoutes.post('/auth/login', async c => {
    const { db } = c.get('deps');
    const input = await jsonBody(c, z.object({ email: z.string().trim().max(254), password: z.string().max(200) }));
    const email = input.email.toLowerCase();
    // guesses from one place at one account are cut off quickly; failures from
    // everywhere only lock an account at a rate no real owner reaches, so a
    // stranger cannot keep someone out by mistyping their password on purpose
    await hitLimit(db, `login-ip:${clientIp(c)}`, 30, 600);
    await hitLimit(db, `login-pair:${clientIp(c)}:${email}`, 10, 600);
    await checkLimit(db, `login-fail:${email}`, 100, 3600);
    const fail = async () => {
        await hitLimit(db, `login-fail:${email}`, Infinity, 3600);
        return new HttpError(401, 'invalid_credentials', 'Wrong email or password');
    };

    const row = await one<{ user_id: string; password_hash: string; status: string }>(
        db,
        `SELECT a.user_id, a.password_hash, u.status FROM accounts a JOIN users u ON u.id = a.user_id
         WHERE a.provider = 'password' AND a.provider_account_id = $1`,
        [email]
    );
    if (!row) {
        await burnPasswordCheck(input.password);
        throw await fail();
    }
    if (!(await verifyPassword(input.password, row.password_hash))) throw await fail();
    if (row.status === 'banned') throw forbidden('This account has been banned', 'banned');
    await startSession(c, row.user_id);
    await db.query('UPDATE users SET last_seen_at = now() WHERE id = $1', [row.user_id]);
    return c.json({ user: meDto((await loadUser(db, row.user_id))!) });
});

authRoutes.post('/auth/logout', async c => {
    const token = getCookie(c, SESSION_COOKIE);
    if (token) await c.get('deps').db.query('DELETE FROM sessions WHERE id = $1', [await sha256Hex(token)]);
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return c.json({ ok: true });
});

authRoutes.patch('/me', async c => {
    // a suspended account cannot keep posting through its profile
    const user = requireActive(c);
    const { db } = c.get('deps');
    const input = await jsonBody(
        c,
        z
            .object({
                handle: handleSchema,
                displayName: z.string().trim().max(60),
                bio: z.string().trim().max(500),
            })
            .partial()
            .strict()
    );
    if (input.handle && input.handle.toLowerCase() !== user.handle.toLowerCase()) {
        const taken = await one(db, 'SELECT 1 FROM users WHERE lower(handle) = lower($1) AND id <> $2', [input.handle, user.id]);
        if (taken) throw new HttpError(409, 'handle_taken', 'That handle is taken');
    }
    await db.query(
        `UPDATE users SET handle = coalesce($2, handle), display_name = coalesce($3, display_name),
         bio = coalesce($4, bio), updated_at = now() WHERE id = $1`,
        [user.id, input.handle ?? null, input.displayName ?? null, input.bio ?? null]
    );
    return c.json({ user: meDto((await loadUser(db, user.id))!) });
});

authRoutes.post('/me/password', async c => {
    const user = requireUser(c);
    const { db } = c.get('deps');
    const input = await jsonBody(c, z.object({ currentPassword: z.string().max(200), newPassword: passwordSchema }));
    await hitLimit(db, `password:${user.id}`, 10, 600);
    const acct = await one<{ id: string; password_hash: string }>(
        db,
        `SELECT id, password_hash FROM accounts WHERE user_id = $1 AND provider = 'password'`,
        [user.id]
    );
    if (!acct || !(await verifyPassword(input.currentPassword, acct.password_hash)))
        throw bad('Your current password is wrong', 'invalid_credentials');
    const current = await sha256Hex(getCookie(c, SESSION_COOKIE) ?? '');
    await db.batch([
        { text: 'UPDATE accounts SET password_hash = $2, updated_at = now() WHERE id = $1', params: [acct.id, await hashPassword(input.newPassword)] },
        // every other device signs in again
        { text: 'DELETE FROM sessions WHERE user_id = $1 AND id <> $2', params: [user.id, current] },
        auditStatement(user.id, 'user.password_changed', 'user', user.id),
    ]);
    return c.json({ ok: true });
});
