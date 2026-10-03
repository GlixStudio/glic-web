// `npm run dev` serves the community API from inside Vite: /api and /media go to
// the same Hono app the Worker runs (server/devApp.ts), same origin, no second
// process. Changes under server/ need a dev server restart.

import type { Plugin } from 'vite';
import { getRequestListener } from '@hono/node-server';

export const communityDevApi = (): Plugin => ({
    name: 'glix-community-dev-api',
    apply: 'serve',
    configureServer(server) {
        let listener: Promise<ReturnType<typeof getRequestListener>> | null = null;
        const load = () =>
            (listener ??= server
                .ssrLoadModule('/server/devApp.ts')
                .then(m => m.createDevApp())
                .then(app => getRequestListener(app.fetch)));
        server.middlewares.use((req, res, next) => {
            if (!req.url?.startsWith('/api/') && !req.url?.startsWith('/media/')) return next();
            load().then(
                handle => handle(req, res),
                err => {
                    listener = null;
                    next(err);
                }
            );
        });
    },
});
