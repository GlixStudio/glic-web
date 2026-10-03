// Cloudflare Worker entry: the community API and uploaded media, in front of
// the static editor build (dist/, served by the ASSETS binding).
//
// DATABASE_URL and R2_* arrive as Worker variables pushed by Infrapad from the
// environment's Neon database and R2 bucket - nothing environment-specific is
// pinned in wrangler.jsonc.

import { createApp } from '../server/app';
import { HttpError, type Deps } from '../server/core';
import { neonDb } from '../server/db';
import { r2Store } from '../server/store';

interface Env {
    ASSETS: Fetcher;
    DATABASE_URL?: string;
    R2_ENDPOINT?: string;
    R2_BUCKET?: string;
    R2_ACCESS_KEY_ID?: string;
    R2_SECRET_ACCESS_KEY?: string;
}

let deps: Deps | null = null;

const resolveDeps = (raw: unknown): Deps => {
    if (deps) return deps;
    const env = raw as Env;
    if (!env.DATABASE_URL || !env.R2_ENDPOINT || !env.R2_BUCKET || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY)
        throw new HttpError(503, 'not_configured', 'The community backend is not set up in this environment yet');
    deps = {
        db: neonDb(env.DATABASE_URL),
        store: r2Store({
            endpoint: env.R2_ENDPOINT,
            bucket: env.R2_BUCKET,
            accessKeyId: env.R2_ACCESS_KEY_ID,
            secretAccessKey: env.R2_SECRET_ACCESS_KEY,
        }),
        secureCookies: true,
    };
    return deps;
};

const app = createApp(resolveDeps);

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        if (url.pathname.startsWith('/api/')) return app.fetch(request, env, ctx);
        if (url.pathname.startsWith('/media/')) {
            // whole-file GETs of public media come from the edge cache (for minutes - see app.ts)
            const cacheable = request.method === 'GET' && !request.headers.has('range');
            const cache = caches.default;
            if (cacheable) {
                const hit = await cache.match(request);
                if (hit) return hit;
            }
            const res = await app.fetch(request, env, ctx);
            if (cacheable && res.status === 200 && res.headers.get('cache-control')?.startsWith('public'))
                ctx.waitUntil(cache.put(request, res.clone()));
            return res;
        }
        return env.ASSETS.fetch(request);
    },
} satisfies ExportedHandler<Env>;
