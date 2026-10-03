// The community API: /api/* (JSON) and /media/* (uploaded files). Runtime-
// agnostic - the Cloudflare Worker and the local dev server each hand it a
// database and a file store.

import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { type AppEnv, type Deps, HttpError, isStaff } from './core';
import { one } from './db';
import { SESSION_COOKIE, authRoutes, refreshCookie, resolveSession } from './auth';
import { postRoutes } from './posts';
import { adminRoutes } from './admin';

const MEDIA_KEY = /^posts\/([a-z0-9]{26})\/[a-z0-9]{26}\.(png|webp|zip)$/;

export const createApp = (resolveDeps: (env: unknown) => Deps) => {
    const app = new Hono<AppEnv>();

    app.onError((err, c) => {
        if (err instanceof HttpError) return c.json({ error: err.code, message: err.message }, err.status);
        // a unique index lost a race (two sign-ups for one handle at once)
        if ((err as { code?: string }).code === '23505') return c.json({ error: 'conflict', message: 'That is already taken - try again' }, 409);
        console.error(err);
        return c.json({ error: 'server_error', message: 'Something went wrong on our side' }, 500);
    });

    app.use('*', async (c, next) => {
        c.set('deps', resolveDeps(c.env));
        c.set('user', null);
        c.set('settings', undefined);
        await next();
    });

    // --- API ---

    const api = new Hono<AppEnv>();

    // cookies ride along on cross-site form posts; a state change has to come from this origin
    api.use('*', async (c, next) => {
        if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
            const origin = c.req.header('origin');
            const site = c.req.header('sec-fetch-site');
            if ((origin && origin !== new URL(c.req.url).origin) || (site && site !== 'same-origin' && site !== 'none'))
                throw new HttpError(403, 'bad_origin', 'Cross-site request refused');
        }
        await next();
    });

    api.use('*', async (c, next) => {
        const session = await resolveSession(c.get('deps').db, getCookie(c, SESSION_COOKIE));
        if (session) {
            c.set('user', session.user);
            if (session.refresh) refreshCookie(c);
        }
        await next();
        c.header('cache-control', 'no-store');
    });

    api.route('/', authRoutes);
    api.route('/', postRoutes);
    api.route('/admin', adminRoutes);
    api.all('*', c => c.json({ error: 'not_found', message: 'No such endpoint' }, 404));

    app.route('/api', api);

    // --- media ---

    app.get('/media/*', async c => {
        let key: string;
        try {
            key = decodeURIComponent(c.req.path.slice('/media/'.length));
        } catch {
            return c.text('Not found', 404);
        }
        const match = MEDIA_KEY.exec(key);
        if (!match) return c.text('Not found', 404);
        const { db, store } = c.get('deps');

        // a file follows its post: published (and not banned) is public; anything
        // else - in review, hidden, removed - only for its author and staff
        const post = await one<{ status: string; author_id: string; author_status: string }>(
            db,
            'SELECT p.status, p.author_id, u.status AS author_status FROM posts p JOIN users u ON u.id = p.author_id WHERE p.id = $1',
            [match[1]]
        );
        if (!post) return c.text('Not found', 404);
        const open = post.status === 'published' && post.author_status !== 'banned';
        if (!open) {
            const session = await resolveSession(db, getCookie(c, SESSION_COOKIE));
            const viewer = session?.user ?? null;
            if (!viewer || (viewer.id !== post.author_id && !(isStaff(viewer) && viewer.status === 'active'))) return c.text('Not found', 404);
        }

        const obj = await store.get(key, c.req.header('range'));
        if (!obj) return c.text('Not found', 404);
        const headers: Record<string, string> = {
            'content-type': obj.contentType,
            // short-lived: a post taken down stops being served within minutes,
            // even from the edge cache; restricted files are never cached
            'cache-control': open ? 'public, max-age=600' : 'private, no-store',
            'x-content-type-options': 'nosniff',
            'accept-ranges': 'bytes',
            'content-disposition': key.endsWith('.zip') ? 'attachment' : 'inline',
        };
        if (obj.size != null) headers['content-length'] = String(obj.size);
        if (obj.etag) headers.etag = obj.etag;
        if (obj.contentRange) headers['content-range'] = obj.contentRange;
        return c.body(obj.body as ReadableStream, obj.contentRange ? 206 : 200, headers);
    });

    return app;
};
