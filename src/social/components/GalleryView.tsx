// The gallery: a quiet masonry wall of work, with search, sort and a few
// filters on top - images first, chrome out of the way.

import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Plus, Search, X } from 'lucide-react';
import type { PostDto, Sort, TimeWindow } from '../../../shared/api';
import type { ApiError, FeedQuery } from '../api';
import { useSession } from '../session';
import { navigate, postPath } from '../router';
import { PostGrid } from './PostGrid';
import { PostView } from './PostView';
import { AccountMenu } from './AccountMenu';
import { Mark } from './ui';

const SORT_LABEL: Record<Exclude<Sort, 'old'>, string> = { trending: 'Trending', new: 'New', top: 'Top', discussed: 'Discussed' };

export const GalleryHeader: React.FC<{ children?: React.ReactNode; onShare?: () => void }> = ({ children, onShare }) => (
    <header className="sticky top-0 z-30 bg-cream/90 backdrop-blur border-b border-line">
        <div className="max-w-[1800px] mx-auto flex items-center gap-2 sm:gap-3 px-3 sm:px-5 h-12">
            <button onClick={() => navigate('/gallery')} className="flex items-center gap-2 flex-shrink-0" title="Gallery">
                <Mark />
                <span className="hidden sm:block text-[15px] font-black tracking-tight">GLIX Gallery</span>
            </button>
            <div className="flex-1 min-w-0 flex justify-center">{children}</div>
            <button
                onClick={() => navigate('/')}
                className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-md text-[12px] font-bold hover:bg-cream-3"
                title="Back to the editor - your work is still open"
            >
                <ArrowLeft className="w-3.5 h-3.5" /> Editor
            </button>
            {onShare && (
                <button onClick={onShare} className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-ink bg-glx-green text-[12px] font-bold hover:brightness-105">
                    <Plus className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Share</span>
                </button>
            )}
            <AccountMenu />
        </div>
    </header>
);

export const GalleryView: React.FC<{ postId: string | null; tag: string | null; onShare: () => void }> = ({ postId, tag, onShare }) => {
    const { settings, user, requireAuth } = useSession();
    const [sort, setSort] = useState<Sort>('trending');
    const [span, setSpan] = useState<TimeWindow>('week');
    const [search, setSearch] = useState('');
    const [q, setQ] = useState('');
    const [restricted, setRestricted] = useState<string | null>(null);
    const [reloadKey, setReloadKey] = useState(0);

    // search as you type, without a request per keystroke
    useEffect(() => {
        const t = setTimeout(() => setQ(search.trim()), 300);
        return () => clearTimeout(t);
    }, [search]);

    const query: FeedQuery = {
        sort,
        window: sort === 'new' ? undefined : span,
        tag: tag ?? undefined,
        q: q || undefined,
    };

    const onError = useCallback((e: ApiError) => {
        if (e.code === 'gallery_restricted') setRestricted(e.message);
    }, []);

    const open = (p: PostDto) => navigate(postPath(p.id) + location.search);
    const share = async () => {
        if (await requireAuth('login', 'Sign in to share your work')) onShare();
    };

    return (
        <div className="min-h-full bg-cream text-ink">
            <GalleryHeader onShare={share}>
                <label className="relative w-full max-w-md">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-2" />
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search work, tags, people"
                        className="w-full h-8 pl-8 pr-3 rounded-full border border-line bg-cream-2 text-[13px] focus:outline-none focus:border-ink placeholder:text-ink-2/70"
                    />
                </label>
            </GalleryHeader>

            <div className="max-w-[1800px] mx-auto px-3 sm:px-5">
                {settings?.announcement && (
                    <div className="mt-3 rounded-lg border border-ink bg-glx-orange/40 px-3 py-2 text-[13px]">{settings.announcement}</div>
                )}

                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                    <nav className="flex items-center gap-3">
                        {(Object.keys(SORT_LABEL) as (keyof typeof SORT_LABEL)[]).map(s => (
                            <button
                                key={s}
                                onClick={() => setSort(s)}
                                className={`text-[13px] font-bold transition-colors ${sort === s ? 'text-ink' : 'text-ink-2 hover:text-ink'}`}
                            >
                                {SORT_LABEL[s]}
                                {sort === s && <span className="block h-0.5 mt-0.5 rounded bg-glx-orange" />}
                            </button>
                        ))}
                    </nav>
                    {sort !== 'new' && (
                        <select
                            value={span}
                            onChange={e => setSpan(e.target.value as TimeWindow)}
                            className="bg-transparent text-[12px] font-bold text-ink-2 focus:outline-none cursor-pointer"
                        >
                            <option value="day">Today</option>
                            <option value="week">This week</option>
                            <option value="month">This month</option>
                            <option value="year">This year</option>
                            <option value="all">All time</option>
                        </select>
                    )}
                    <div className="flex flex-wrap items-center gap-1.5 sm:ml-auto">
                        {tag && (
                            <button
                                onClick={() => navigate('/gallery')}
                                className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-ink bg-glx-orange text-[12px] font-bold"
                            >
                                #{tag} <X className="w-3 h-3" />
                            </button>
                        )}
                    </div>
                </div>

                {restricted ? (
                    <div className="py-24 text-center space-y-3">
                        <p className="text-[14px]">{restricted}</p>
                        {!user && (
                            <button
                                onClick={async () => (await requireAuth('login')) && (setRestricted(null), setReloadKey(k => k + 1))}
                                className="px-3 py-1.5 rounded-md border border-ink bg-glx-green text-[12px] font-bold"
                            >
                                Sign in
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="pb-16">
                        <PostGrid
                            query={query}
                            reloadKey={reloadKey}
                            onOpen={open}
                            onError={onError}
                            empty={
                                <div className="py-24 text-center space-y-3">
                                    <p className="text-[14px] text-ink-2">{q || tag ? 'Nothing matches that.' : 'The gallery is empty - be the first to share something.'}</p>
                                    {!q && !tag && (
                                        <button onClick={share} className="px-3 py-1.5 rounded-md border border-ink bg-glx-green text-[12px] font-bold">
                                            Share your work
                                        </button>
                                    )}
                                </div>
                            }
                        />
                    </div>
                )}
            </div>

            {postId && <PostView postId={postId} onClose={() => navigate('/gallery' + location.search)} onDeleted={() => setReloadKey(k => k + 1)} />}
        </div>
    );
};
