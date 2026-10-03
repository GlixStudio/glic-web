// A tiny history router. The editor lives at / and stays mounted underneath
// every other route, so opening the gallery never loses work in progress.
//
//   /                  editor
//   /gallery[?tag=x]   gallery feed
//   /gallery/<postId>  a post, over the feed
//   /u/<handle>        a profile
//   /admin[/<tab>]     moderation and settings

import { useSyncExternalStore } from 'react';

export type Route =
    | { name: 'editor' }
    | { name: 'gallery'; postId: string | null; tag: string | null }
    | { name: 'profile'; handle: string; postId: string | null }
    | { name: 'admin'; tab: string | null };

export const parseRoute = (path: string, search = ''): Route => {
    const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
    if (parts[0] === 'gallery') return { name: 'gallery', postId: parts[1] ?? null, tag: new URLSearchParams(search).get('tag') };
    if (parts[0] === 'u' && parts[1]) return { name: 'profile', handle: parts[1], postId: parts[2] ?? null };
    if (parts[0] === 'admin') return { name: 'admin', tab: parts[1] ?? null };
    return { name: 'editor' };
};

const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());
window.addEventListener('popstate', emit);

export const navigate = (path: string, opts: { replace?: boolean } = {}) => {
    if (path === location.pathname + location.search) return;
    if (opts.replace) history.replaceState(null, '', path);
    else history.pushState(null, '', path);
    emit();
};

let cachedPath = '';
let cachedRoute: Route = { name: 'editor' };
const snapshot = () => {
    const path = location.pathname + location.search;
    if (path !== cachedPath) {
        cachedPath = path;
        cachedRoute = parseRoute(location.pathname, location.search);
    }
    return cachedRoute;
};

export const useRoute = (): Route =>
    useSyncExternalStore(
        l => {
            listeners.add(l);
            return () => listeners.delete(l);
        },
        snapshot
    );

export const postPath = (id: string) => `/gallery/${encodeURIComponent(id)}`;
export const profilePath = (handle: string) => `/u/${encodeURIComponent(handle)}`;
