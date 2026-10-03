// Masonry feed: images at their own aspect ratio in balanced columns, more
// loading as you scroll. Posts are placed in order into the shortest column,
// so appending a page never reshuffles what is already on screen.

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Layers } from 'lucide-react';
import type { PostDto } from '../../../shared/api';
import { api, ApiError, type FeedQuery } from '../api';
import { Avatar, Spinner } from './ui';

const STATUS_LABEL: Record<string, string> = {
    pending: 'In review',
    rejected: 'Rejected',
    hidden: 'Hidden',
    removed: 'Removed',
};

export const PostCard: React.FC<{ post: PostDto; onOpen: (p: PostDto) => void }> = ({ post, onOpen }) => {
    const w = post.cover?.width ?? post.primary?.width ?? 4;
    const h = post.cover?.height ?? post.primary?.height ?? 3;
    const layers = Number(post.metadata.layers ?? 0);
    return (
        <button
            onClick={() => onOpen(post)}
            className="group relative block w-full overflow-hidden rounded-lg bg-cream-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-glx-orange"
            style={{ aspectRatio: `${w} / ${h}` }}
        >
            {post.cover && <img src={post.cover.url} alt={post.title} loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover" style={{ imageRendering: w < 400 ? 'pixelated' : undefined }} />}
            <div className="absolute top-2 left-2 flex gap-1">
                {layers > 0 && <Badge icon={<Layers className="w-3 h-3" />} title={`Full project: ${layers} ${layers === 1 ? 'layer' : 'layers'} to remix`} />}
                {post.status !== 'published' && (
                    <span className="px-1.5 py-0.5 rounded bg-ink text-cream text-[10px] font-bold uppercase tracking-wider">{STATUS_LABEL[post.status] ?? post.status}</span>
                )}
            </div>
            <div className="absolute inset-x-0 bottom-0 p-2.5 pt-8 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
                {post.title && <div className="text-[12px] font-bold text-white truncate">{post.title}</div>}
                <div className="flex items-center justify-between gap-2 mt-0.5">
                    <span className="flex items-center gap-1.5 min-w-0 text-[11px] text-white/85">
                        <Avatar user={post.author} size={16} />
                        <span className="truncate">{post.author.handle}</span>
                    </span>
                    {(post.reactionCount > 0 || post.commentCount > 0) && (
                        <span className="text-[11px] text-white/85 flex-shrink-0">
                            {post.reactionCount > 0 && `♥ ${post.reactionCount}`}
                            {post.reactionCount > 0 && post.commentCount > 0 && ' · '}
                            {post.commentCount > 0 && `💬 ${post.commentCount}`}
                        </span>
                    )}
                </div>
            </div>
        </button>
    );
};

const Badge: React.FC<{ icon: React.ReactNode; title?: string }> = ({ icon, title }) => (
    <span title={title} className="flex items-center justify-center w-5 h-5 rounded bg-black/55 text-white">
        {icon}
    </span>
);

const columnsFor = (width: number) => (width < 520 ? 2 : width < 860 ? 3 : width < 1200 ? 4 : width < 1600 ? 5 : 6);

export const PostGrid: React.FC<{
    query: FeedQuery;
    onOpen: (p: PostDto) => void;
    empty?: React.ReactNode;
    onError?: (e: ApiError) => void;
    /** bump to reload from the top (after a delete, a sign-in...) */
    reloadKey?: number;
}> = ({ query, onOpen, empty, onError, reloadKey = 0 }) => {
    const [items, setItems] = useState<PostDto[]>([]);
    const [cursor, setCursor] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [done, setDone] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [cols, setCols] = useState(4);
    const rootRef = useRef<HTMLDivElement>(null);
    const sentinel = useRef<HTMLDivElement>(null);
    const key = JSON.stringify(query);
    const loadKey = `${key}#${reloadKey}`;
    const loadingRef = useRef(false);

    useLayoutEffect(() => {
        const el = rootRef.current;
        if (!el) return;
        const ro = new ResizeObserver(() => setCols(columnsFor(el.clientWidth)));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // a newer query wins: answers to an older one are dropped
    const seq = useRef(0);
    const onErrorRef = useRef(onError);
    useEffect(() => {
        onErrorRef.current = onError;
    });

    const load = useCallback(
        async (from: string | null, replace: boolean) => {
            if (!replace && loadingRef.current) return;
            const mine = replace ? ++seq.current : seq.current;
            loadingRef.current = true;
            setLoading(true);
            try {
                const page = await api.feed({ ...JSON.parse(key), cursor: from, limit: 30 });
                if (mine !== seq.current) return;
                setItems(prev => (replace ? page.items : [...prev, ...page.items.filter(p => !prev.some(x => x.id === p.id))]));
                setCursor(page.nextCursor);
                setDone(!page.nextCursor);
                setError(null);
            } catch (e) {
                if (mine !== seq.current) return;
                setError((e as Error).message);
                setDone(true);
                if (e instanceof ApiError) onErrorRef.current?.(e);
            } finally {
                if (mine === seq.current) {
                    loadingRef.current = false;
                    setLoading(false);
                }
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps -- loadKey bumps a reload
        [key, loadKey]
    );

    useEffect(() => {
        void load(null, true);
    }, [load]);

    useEffect(() => {
        const el = sentinel.current;
        if (!el || done) return;
        const io = new IntersectionObserver(entries => entries[0].isIntersecting && cursor && void load(cursor, false), { rootMargin: '800px' });
        io.observe(el);
        return () => io.disconnect();
    }, [cursor, done, load]);

    // shortest-column placement by aspect ratio
    const columns: PostDto[][] = Array.from({ length: cols }, () => []);
    const heights = new Array(cols).fill(0);
    for (const p of items) {
        const w = p.cover?.width ?? p.primary?.width ?? 4;
        const h = p.cover?.height ?? p.primary?.height ?? 3;
        const i = heights.indexOf(Math.min(...heights));
        columns[i].push(p);
        heights[i] += h / w + 0.08;
    }

    return (
        <div ref={rootRef}>
            {items.length > 0 && (
                <div className="flex gap-2.5 sm:gap-3 items-start">
                    {columns.map((col, i) => (
                        <div key={i} className="flex-1 min-w-0 flex flex-col gap-2.5 sm:gap-3">
                            {col.map(p => (
                                <PostCard key={p.id} post={p} onOpen={onOpen} />
                            ))}
                        </div>
                    ))}
                </div>
            )}
            {!loading && !error && items.length === 0 && (empty ?? <div className="py-24 text-center text-[13px] text-ink-2">Nothing here yet.</div>)}
            {error && <div className="py-16 text-center text-[13px] text-ink-2">{error}</div>}
            <div ref={sentinel} className="h-px" />
            {loading && (
                <div className="py-10 flex justify-center text-ink-2">
                    <Spinner className="w-5 h-5" />
                </div>
            )}
        </div>
    );
};
