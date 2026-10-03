// The staff control room for the community gallery: overview, review queue,
// reports, users, and (admins only) site settings and the audit log.

import React, { useCallback, useEffect, useState } from 'react';
import {
    ArrowLeft,
    Check,
    ChevronDown,
    ChevronRight,
    ExternalLink,
    EyeOff,
    Flag,
    ImageOff,
    Inbox,
    LayoutDashboard,
    MessageSquare,
    Plus,
    RefreshCw,
    RotateCcw,
    Save,
    ScrollText,
    Search,
    Settings as SettingsIcon,
    ShieldAlert,
    Trash2,
    Users,
    X,
} from 'lucide-react';
import {
    ROLES,
    USER_STATUSES,
    type AdminStats,
    type AdminUser,
    type AuditEntry,
    type GalleryAccess,
    type ModerationMode,
    type Page,
    type PostDto,
    type ReportDto,
    type Role,
    type Settings,
    type UserStatus,
} from '../../../shared/api';
import { api, ApiError, type QueuedComment } from '../api';
import { navigate, postPath, profilePath } from '../router';
import { timeAgo } from '../format';
import { useSession } from '../session';
import { Avatar, Button, ErrorNote, Mark, RoleBadge, Spinner, inputClass } from './ui';

// --- helpers ---

const errMsg = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : 'Something went wrong');

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const fmtDateTime = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

const rank = (r: Role) => ROLES.indexOf(r);

/** a real link (middle-click works) that routes in-app on a plain click */
const Link: React.FC<{ to: string; className?: string; title?: string; children: React.ReactNode }> = ({ to, className = '', title, children }) => (
    <a
        href={to}
        title={title}
        className={className}
        onClick={e => {
            if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            e.preventDefault();
            navigate(to);
        }}
    >
        {children}
    </a>
);

const HandleLink: React.FC<{ user: { handle: string } | null }> = ({ user }) =>
    user ? (
        <Link to={profilePath(user.handle)} className="font-bold text-ink hover:underline">
            @{user.handle}
        </Link>
    ) : (
        <span className="italic">deleted user</span>
    );

const STATUS_TONE: Record<string, string> = {
    published: 'bg-glx-green',
    active: 'bg-glx-green',
    resolved: 'bg-glx-green',
    pending: 'bg-glx-orange',
    open: 'bg-glx-orange',
    hidden: 'bg-cream-3',
    dismissed: 'bg-cream-3',
    draft: 'bg-cream-3',
    suspended: 'bg-[#ffd27a]',
    rejected: 'bg-red-200',
    removed: 'bg-red-200',
    banned: 'bg-red-300',
};

const Badge: React.FC<{ children: React.ReactNode; tone?: string; title?: string }> = ({ children, tone, title }) => (
    <span
        title={title}
        className={`inline-flex items-center gap-1 px-1.5 rounded border border-ink text-[9px] font-black uppercase tracking-wider leading-[16px] whitespace-nowrap ${
            tone ?? 'bg-cream-2'
        }`}
    >
        {children}
    </span>
);

const StatusBadge: React.FC<{ status: string }> = ({ status }) => <Badge tone={STATUS_TONE[status]}>{status}</Badge>;

const SectionTitle: React.FC<{ children: React.ReactNode; right?: React.ReactNode }> = ({ children, right }) => (
    <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="text-[12px] font-black uppercase tracking-wider">{children}</h2>
        {right}
    </div>
);

const Loading: React.FC<{ label?: string }> = ({ label = 'Loading…' }) => (
    <div className="flex items-center justify-center gap-2 py-10 text-[12px] text-ink-2">
        <Spinner /> {label}
    </div>
);

const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="py-10 text-center text-[12px] text-ink-2 border border-dashed border-line rounded-lg">{children}</div>
);

/** segmented filter in the Glix style */
function Tabs<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
    return (
        <div className="inline-flex rounded-md border border-ink overflow-hidden">
            {options.map(o => (
                <button
                    key={o.value}
                    type="button"
                    onClick={() => onChange(o.value)}
                    className={`px-2.5 py-1 text-[11px] font-bold transition-colors border-r border-ink last:border-r-0 ${
                        value === o.value ? 'bg-glx-orange text-ink' : 'bg-cream-2 text-ink hover:bg-white'
                    }`}
                >
                    {o.label}
                </button>
            ))}
        </div>
    );
}

const smallSelect =
    'bg-cream-2 border border-ink text-ink text-[11px] font-bold rounded-md px-1.5 py-1 focus:outline-none focus:border-glx-orange focus:ring-1 focus:ring-glx-orange disabled:opacity-50 disabled:cursor-not-allowed';

// --- data hooks ---

/** loads one value; `key` re-fetches when it changes. Keeps the old value while refreshing. */
function useFetch<T>(load: () => Promise<T>, key?: unknown) {
    const [nonce, setNonce] = useState(0);
    const [state, setState] = useState<{ data: T | null; error: string | null }>({ data: null, error: null });
    useEffect(() => {
        let live = true;
        load().then(
            data => {
                if (live) setState({ data, error: null });
            },
            e => {
                if (live) setState(s => ({ data: s.data, error: errMsg(e) }));
            }
        );
        return () => {
            live = false;
        };
    }, [load, nonce, key]);
    const reload = useCallback(() => setNonce(n => n + 1), []);
    return { ...state, reload };
}

interface PagedState<T> {
    load: (cursor: string | null) => Promise<Page<T>>;
    items: T[] | null;
    nextCursor: string | null;
    error: string | null;
    more: boolean;
}

/** a cursor-paged list. A new `load` (memoized on its filters) starts over; reload() refreshes in place. */
function usePaged<T>(load: (cursor: string | null) => Promise<Page<T>>) {
    const [nonce, setNonce] = useState(0);
    const [state, setState] = useState<PagedState<T>>(() => ({ load, items: null, nextCursor: null, error: null, more: false }));
    let cur = state;
    if (state.load !== load) {
        // filters changed: start over (render-phase reset)
        cur = { load, items: null, nextCursor: null, error: null, more: false };
        setState(cur);
    }

    useEffect(() => {
        let live = true;
        load(null).then(
            p => {
                if (live) setState(s => (s.load === load ? { ...s, items: p.items, nextCursor: p.nextCursor, error: null } : s));
            },
            e => {
                if (live) setState(s => (s.load === load ? { ...s, error: errMsg(e) } : s));
            }
        );
        return () => {
            live = false;
        };
    }, [load, nonce]);

    const loadMore = async () => {
        if (!cur.nextCursor || cur.more) return;
        const cursor = cur.nextCursor;
        setState(s => ({ ...s, more: true }));
        try {
            const p = await load(cursor);
            setState(s => (s.load === load ? { ...s, items: [...(s.items ?? []), ...p.items], nextCursor: p.nextCursor, more: false } : s));
        } catch (e) {
            setState(s => (s.load === load ? { ...s, error: errMsg(e), more: false } : s));
        }
    };

    return {
        items: cur.items,
        nextCursor: cur.nextCursor,
        error: cur.error,
        more: cur.more,
        loadMore,
        update: (fn: (items: T[]) => T[]) => setState(s => (s.items ? { ...s, items: fn(s.items) } : s)),
        reload: () => {
            setState(s => ({ ...s, error: null }));
            setNonce(n => n + 1);
        },
    };
}

/** loading / error / empty / list / load-more around a paged list */
function PagedList<T>({
    list,
    empty,
    children,
}: {
    list: ReturnType<typeof usePaged<T>>;
    empty: React.ReactNode;
    children: (items: T[]) => React.ReactNode;
}) {
    if (list.items === null) {
        return list.error ? (
            <div className="space-y-2">
                <ErrorNote error={list.error} />
                <Button size="sm" onClick={list.reload}>
                    <RefreshCw className="w-3 h-3" /> Try again
                </Button>
            </div>
        ) : (
            <Loading />
        );
    }
    return (
        <div className="space-y-3">
            {list.error && <ErrorNote error={list.error} />}
            {list.items.length === 0 ? <Empty>{empty}</Empty> : children(list.items)}
            {list.nextCursor && (
                <div className="flex justify-center pt-1">
                    <Button size="sm" onClick={list.loadMore} disabled={list.more}>
                        {list.more ? <Spinner className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />} Load more
                    </Button>
                </div>
            )}
        </div>
    );
}

const RefreshButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
    <Button size="sm" variant="ghost" onClick={onClick} title="Refresh">
        <RefreshCw className="w-3 h-3" /> <span className="hidden sm:inline">Refresh</span>
    </Button>
);

// --- copy for the switches ---

const MODERATION_COPY: Record<ModerationMode, { label: string; hint: (noun: string) => string }> = {
    open: { label: 'Open', hint: n => `Every ${n} publishes immediately.` },
    trusted: { label: 'Trusted', hint: n => `Trusted members publish immediately; other ${n}s wait for review.` },
    review: { label: 'Review', hint: n => `Every ${n} waits for review, except from staff.` },
    closed: { label: 'Closed', hint: n => `Only staff can ${n === 'post' ? 'post' : 'comment'}.` },
};

const ACCESS_COPY: Record<GalleryAccess, { label: string; hint: string }> = {
    public: { label: 'Public', hint: 'Everyone can browse the gallery, signed in or not.' },
    members: { label: 'Members', hint: 'Only signed-in members can see the gallery.' },
    staff: { label: 'Staff only', hint: 'Review mode: the gallery is closed to everyone but staff.' },
};

const REGISTRATION_COPY: Record<Settings['registration'], { label: string; hint: string }> = {
    open: { label: 'Open', hint: 'Anyone can create an account.' },
    closed: { label: 'Closed', hint: 'No new sign-ups; existing members can still sign in.' },
};

// --- shell ---

type TabId = 'overview' | 'review' | 'reports' | 'users' | 'settings' | 'audit';

const TABS: { id: TabId; label: string; icon: React.ElementType; adminOnly?: boolean }[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'review', label: 'Review', icon: Inbox },
    { id: 'reports', label: 'Reports', icon: Flag },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'settings', label: 'Settings', icon: SettingsIcon, adminOnly: true },
    { id: 'audit', label: 'Audit log', icon: ScrollText, adminOnly: true },
];

const Header: React.FC = () => {
    const { user } = useSession();
    return (
        <header className="sticky top-0 z-20 flex items-center justify-between gap-2 px-3 sm:px-5 h-11 border-b border-ink bg-cream">
            <div className="flex items-center gap-2 min-w-0">
                <Mark />
                <span className="hidden sm:block text-[15px] font-black tracking-tight whitespace-nowrap">GLIX</span>
                <div className="hidden sm:block w-px h-5 bg-line mx-1" />
                <h1 className="text-[13px] font-black uppercase tracking-wider">Admin</h1>
                {user && (
                    <span className="hidden md:flex items-center gap-1.5 ml-2 text-[11px] text-ink-2 min-w-0">
                        <span className="truncate">@{user.handle}</span> <RoleBadge role={user.role} />
                    </span>
                )}
            </div>
            <div className="flex items-center gap-1.5">
                <Link
                    to="/gallery"
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-ink bg-cream-2 hover:bg-white text-[11px] font-bold text-ink transition-colors"
                >
                    Gallery
                </Link>
                <Link
                    to="/"
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-ink bg-glx-green hover:brightness-105 text-[11px] font-bold text-ink transition-all"
                >
                    Editor
                </Link>
            </div>
        </header>
    );
};

export const AdminView: React.FC<{ tab: string | null }> = ({ tab }) => {
    const { user, isStaff, offline } = useSession();

    let body: React.ReactNode;
    if (user === undefined) body = <Loading label="Checking your account…" />;
    else if (!isStaff) {
        body = (
            <div className="max-w-md mx-auto mt-16 p-6 bg-cream-2 border border-ink rounded-lg text-center space-y-3">
                <ShieldAlert className="w-8 h-8 mx-auto text-ink-2" />
                <h2 className="text-[13px] font-black uppercase tracking-wider">Staff only</h2>
                <p className="text-[12px] text-ink-2">
                    {offline ? 'The community server is not reachable right now.' : 'You need a moderator or admin account to open this page.'}
                </p>
                <Button variant="primary" onClick={() => navigate('/gallery')}>
                    <ArrowLeft className="w-3.5 h-3.5" /> Back to the gallery
                </Button>
            </div>
        );
    } else body = <Console tab={tab} />;

    return (
        <div className="min-h-full bg-cream text-ink">
            <Header />
            {body}
        </div>
    );
};

const Console: React.FC<{ tab: string | null }> = ({ tab }) => {
    const { isAdmin } = useSession();
    const tabs = TABS.filter(t => !t.adminOnly || isAdmin);
    const known = TABS.find(t => t.id === tab);
    const active: TabId = known ? known.id : 'overview';
    // counts for the rail badges, refreshed on every tab switch
    const stats = useFetch(api.admin.stats, active);

    const badge = (id: TabId) => {
        const s = stats.data;
        if (!s) return 0;
        if (id === 'review') return (s.posts.pending ?? 0) + s.pendingComments;
        if (id === 'reports') return s.openReports;
        return 0;
    };

    let content: React.ReactNode;
    if (known?.adminOnly && !isAdmin) {
        content = (
            <Empty>
                <ShieldAlert className="w-5 h-5 mx-auto mb-2" />
                Only admins can open {known.label.toLowerCase()}.
            </Empty>
        );
    } else if (active === 'overview') content = <OverviewTab stats={stats.data} error={stats.error} onRetry={stats.reload} />;
    else if (active === 'review') content = <ReviewTab onChanged={stats.reload} />;
    else if (active === 'reports') content = <ReportsTab onChanged={stats.reload} />;
    else if (active === 'users') content = <UsersTab />;
    else if (active === 'settings') content = <SettingsTab />;
    else content = <AuditTab />;

    return (
        <div className="max-w-[1100px] mx-auto px-3 sm:px-5 py-4 sm:py-6 flex flex-col md:flex-row gap-4 md:gap-6">
            <nav className="md:w-44 flex-shrink-0 md:self-start md:sticky md:top-[60px]">
                <div className="flex md:flex-col gap-1 overflow-x-auto pb-1 md:pb-0">
                    {tabs.map(t => {
                        const Icon = t.icon;
                        const n = badge(t.id);
                        const on = t.id === active;
                        return (
                            <button
                                key={t.id}
                                onClick={() => navigate(`/admin/${t.id}`)}
                                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md border text-[12px] font-bold whitespace-nowrap transition-colors ${
                                    on ? 'border-ink bg-glx-orange text-ink' : 'border-transparent text-ink hover:bg-cream-3'
                                }`}
                            >
                                <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                                <span className="flex-1 text-left">{t.label}</span>
                                {n > 0 && (
                                    <span className="min-w-[18px] px-1 rounded-full border border-ink bg-cream-2 text-[10px] font-black leading-[16px] text-center">
                                        {n > 99 ? '99+' : n}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </nav>
            <main className="flex-1 min-w-0">{content}</main>
        </div>
    );
};

// --- overview ---

const StatTile: React.FC<{ label: string; value: number | undefined; to?: string; alert?: boolean }> = ({ label, value, to, alert }) => {
    const inner = (
        <>
            <div className="text-[10px] font-bold uppercase tracking-wider text-ink-2 flex items-center justify-between gap-1">
                {label}
                {to && <ChevronRight className="w-3 h-3" />}
            </div>
            <div className="mt-1 text-[26px] font-black leading-none tabular-nums">{value ?? '—'}</div>
        </>
    );
    const cls = `block p-3 rounded-lg border border-ink transition-colors ${alert && value ? 'bg-glx-orange' : 'bg-cream-2'}`;
    return to ? (
        <Link to={to} className={`${cls} hover:brightness-105 hover:bg-white`}>
            {inner}
        </Link>
    ) : (
        <div className={cls}>{inner}</div>
    );
};

const OverviewTab: React.FC<{ stats: AdminStats | null; error: string | null; onRetry: () => void }> = ({ stats, error, onRetry }) => {
    const { settings, isAdmin } = useSession();
    const p = stats?.posts ?? {};
    const rows: { label: string; value: string; hint: string }[] = settings
        ? [
              { label: 'Posts', value: MODERATION_COPY[settings.postModeration].label, hint: MODERATION_COPY[settings.postModeration].hint('post') },
              {
                  label: 'Comments',
                  value: MODERATION_COPY[settings.commentModeration].label,
                  hint: MODERATION_COPY[settings.commentModeration].hint('comment'),
              },
              { label: 'Gallery', value: ACCESS_COPY[settings.galleryAccess].label, hint: ACCESS_COPY[settings.galleryAccess].hint },
              { label: 'Sign-ups', value: REGISTRATION_COPY[settings.registration].label, hint: REGISTRATION_COPY[settings.registration].hint },
          ]
        : [];

    return (
        <div className="space-y-6">
            <section>
                <SectionTitle right={<RefreshButton onClick={onRetry} />}>Needs attention</SectionTitle>
                {error && !stats && <ErrorNote error={error} />}
                {!stats && !error ? (
                    <Loading />
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <StatTile label="Pending posts" value={stats ? (p.pending ?? 0) : undefined} to="/admin/review" alert />
                        <StatTile label="Open reports" value={stats?.openReports} to="/admin/reports" alert />
                        <StatTile label="Pending comments" value={stats?.pendingComments} to="/admin/review?kind=comments" alert />
                    </div>
                )}
            </section>

            {stats && (
                <section>
                    <SectionTitle>Community</SectionTitle>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                        <StatTile label="Members" value={stats.users} to="/admin/users" />
                        <StatTile label="Published" value={p.published ?? 0} />
                        <StatTile label="Pending" value={p.pending ?? 0} />
                        <StatTile label="Hidden" value={p.hidden ?? 0} />
                        <StatTile label="Rejected" value={p.rejected ?? 0} />
                        <StatTile label="Removed" value={p.removed ?? 0} />
                    </div>
                </section>
            )}

            <section>
                <SectionTitle
                    right={
                        isAdmin && (
                            <Button size="sm" onClick={() => navigate('/admin/settings')}>
                                <SettingsIcon className="w-3 h-3" /> Settings
                            </Button>
                        )
                    }
                >
                    Moderation state
                </SectionTitle>
                {!settings ? (
                    <Empty>Settings unavailable.</Empty>
                ) : (
                    <div className="bg-cream-2 border border-ink rounded-lg divide-y divide-line">
                        {rows.map(r => (
                            <div key={r.label} className="flex items-baseline gap-3 px-3 py-2">
                                <span className="w-20 flex-shrink-0 text-[10px] font-bold uppercase tracking-wider text-ink-2">{r.label}</span>
                                <span className="w-20 flex-shrink-0 text-[12px] font-black">{r.value}</span>
                                <span className="text-[11px] text-ink-2 min-w-0">{r.hint}</span>
                            </div>
                        ))}
                        {settings.announcement && (
                            <div className="flex items-baseline gap-3 px-3 py-2">
                                <span className="w-20 flex-shrink-0 text-[10px] font-bold uppercase tracking-wider text-ink-2">Banner</span>
                                <span className="text-[11px] min-w-0 whitespace-pre-wrap">{settings.announcement}</span>
                            </div>
                        )}
                    </div>
                )}
            </section>
        </div>
    );
};

// --- review ---

type PostQueueStatus = 'pending' | 'hidden' | 'rejected' | 'removed';
type PostAction = 'approve' | 'restore' | 'reject' | 'hide' | 'remove';
type CommentQueueStatus = 'pending' | 'hidden';
type CommentAction = 'approve' | 'restore' | 'hide' | 'remove';

const POST_ACTIONS: Record<PostQueueStatus, PostAction[]> = {
    pending: ['approve', 'reject', 'remove'],
    hidden: ['restore', 'remove'],
    rejected: ['approve', 'remove'],
    removed: ['restore'],
};

const COMMENT_ACTIONS: Record<CommentQueueStatus, CommentAction[]> = {
    pending: ['approve', 'hide', 'remove'],
    hidden: ['restore', 'remove'],
};

const ACTION_UI: Record<PostAction, { label: string; icon: React.ElementType; variant: 'primary' | 'plain' | 'danger' }> = {
    approve: { label: 'Approve', icon: Check, variant: 'primary' },
    restore: { label: 'Restore', icon: RotateCcw, variant: 'primary' },
    reject: { label: 'Reject', icon: X, variant: 'plain' },
    hide: { label: 'Hide', icon: EyeOff, variant: 'plain' },
    remove: { label: 'Remove', icon: Trash2, variant: 'danger' },
};

const ActionButtons = <A extends PostAction>({ actions, busy, onAct }: { actions: A[]; busy: A | null; onAct: (a: A) => void }) => (
    <div className="flex flex-wrap gap-1.5">
        {actions.map(a => {
            const ui = ACTION_UI[a];
            const Icon = ui.icon;
            return (
                <Button key={a} size="sm" variant={ui.variant} disabled={busy !== null} onClick={() => onAct(a)}>
                    {busy === a ? <Spinner className="w-3 h-3" /> : <Icon className="w-3 h-3" />} {ui.label}
                </Button>
            );
        })}
    </div>
);

const ReviewTab: React.FC<{ onChanged: () => void }> = ({ onChanged }) => {
    const [kind, setKind] = useState<'posts' | 'comments'>(() =>
        new URLSearchParams(location.search).get('kind') === 'comments' ? 'comments' : 'posts'
    );
    const switchKind = (k: 'posts' | 'comments') => {
        setKind(k);
        navigate(k === 'comments' ? '/admin/review?kind=comments' : '/admin/review', { replace: true });
    };
    return (
        <div>
            <div className="flex items-center gap-3 mb-4">
                <h2 className="text-[12px] font-black uppercase tracking-wider">Review</h2>
                <Tabs
                    value={kind}
                    onChange={switchKind}
                    options={[
                        { value: 'posts', label: 'Posts' },
                        { value: 'comments', label: 'Comments' },
                    ]}
                />
            </div>
            {kind === 'posts' ? <PostQueue onChanged={onChanged} /> : <CommentQueue onChanged={onChanged} />}
        </div>
    );
};

const PostQueue: React.FC<{ onChanged: () => void }> = ({ onChanged }) => {
    const [status, setStatus] = useState<PostQueueStatus>('pending');
    const load = useCallback((cursor: string | null) => api.admin.postQueue(status, cursor), [status]);
    const list = usePaged<PostDto>(load);
    return (
        <div>
            <div className="flex items-center justify-between gap-2 mb-3">
                <Tabs
                    value={status}
                    onChange={setStatus}
                    options={[
                        { value: 'pending', label: 'Pending' },
                        { value: 'hidden', label: 'Hidden' },
                        { value: 'rejected', label: 'Rejected' },
                        { value: 'removed', label: 'Removed' },
                    ]}
                />
                <RefreshButton onClick={list.reload} />
            </div>
            <PagedList list={list} empty={status === 'pending' ? 'Nothing waiting for review.' : `No ${status} posts.`}>
                {items =>
                    items.map(p => (
                        <PostQueueItem
                            key={p.id}
                            post={p}
                            status={status}
                            onDone={() => {
                                list.update(xs => xs.filter(x => x.id !== p.id));
                                onChanged();
                            }}
                        />
                    ))
                }
            </PagedList>
        </div>
    );
};

const Thumb: React.FC<{ post: PostDto; size?: string }> = ({ post, size = 'w-24 h-24' }) => (
    <Link to={postPath(post.id)} className={`${size} relative flex-shrink-0 rounded-md border border-ink overflow-hidden bg-stage block`}>
        {post.cover ? (
            <img src={post.cover.url} alt="" loading="lazy" className="w-full h-full object-cover" />
        ) : (
            <div className="w-full h-full flex items-center justify-center text-cream-3">
                <ImageOff className="w-5 h-5" />
            </div>
        )}
    </Link>
);

const PostQueueItem: React.FC<{ post: PostDto; status: PostQueueStatus; onDone: () => void }> = ({ post, status, onDone }) => {
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState<PostAction | null>(null);
    const [error, setError] = useState<string | null>(null);

    const act = async (action: PostAction) => {
        setBusy(action);
        setError(null);
        try {
            await api.admin.moderatePost(post.id, action, note.trim());
            onDone();
        } catch (e) {
            setError(errMsg(e));
            setBusy(null);
        }
    };

    return (
        <article className="flex gap-3 p-3 bg-cream-2 border border-ink rounded-lg">
            <Thumb post={post} />
            <div className="flex-1 min-w-0 space-y-2">
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                        <Link to={postPath(post.id)} className="block text-[13px] font-black truncate hover:underline">
                            {post.title || 'Untitled'}
                        </Link>
                        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-ink-2">
                            <span>by</span> <HandleLink user={post.author} /> <RoleBadge role={post.author.role} />
                            <span>·</span>
                            <span title={fmtDateTime(post.createdAt)}>{fmtDate(post.createdAt)}</span>
                            <span>·</span>
                            <span>{post.kind}</span>
                            {post.visibility !== 'public' && (
                                <>
                                    <span>·</span>
                                    <span>{post.visibility}</span>
                                </>
                            )}
                        </div>
                    </div>
                    <Button size="sm" onClick={() => navigate(postPath(post.id))} className="flex-shrink-0">
                        <ExternalLink className="w-3 h-3" /> Open
                    </Button>
                </div>
                {post.body && <p className="text-[12px] text-ink line-clamp-2 whitespace-pre-wrap">{post.body}</p>}
                {post.moderationNote && (
                    <div className="text-[11px] px-2 py-1 rounded-md border border-line bg-cream">
                        <span className="font-bold text-ink-2 uppercase tracking-wider text-[9px] mr-1.5">Note</span>
                        {post.moderationNote}
                    </div>
                )}
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <input
                        value={note}
                        onChange={e => setNote(e.target.value)}
                        maxLength={500}
                        placeholder="Note to the author (optional)"
                        className={`${inputClass} sm:flex-1 !text-[12px] !py-1`}
                    />
                    <ActionButtons actions={POST_ACTIONS[status]} busy={busy} onAct={act} />
                </div>
                <ErrorNote error={error} />
            </div>
        </article>
    );
};

const CommentQueue: React.FC<{ onChanged: () => void }> = ({ onChanged }) => {
    const [status, setStatus] = useState<CommentQueueStatus>('pending');
    const load = useCallback((cursor: string | null) => api.admin.commentQueue(status, cursor), [status]);
    const list = usePaged<QueuedComment>(load);
    return (
        <div>
            <div className="flex items-center justify-between gap-2 mb-3">
                <Tabs
                    value={status}
                    onChange={setStatus}
                    options={[
                        { value: 'pending', label: 'Pending' },
                        { value: 'hidden', label: 'Hidden' },
                    ]}
                />
                <RefreshButton onClick={list.reload} />
            </div>
            <PagedList list={list} empty={status === 'pending' ? 'No comments waiting for review.' : 'No hidden comments.'}>
                {items =>
                    items.map(c => (
                        <CommentQueueItem
                            key={c.id}
                            comment={c}
                            status={status}
                            onDone={() => {
                                list.update(xs => xs.filter(x => x.id !== c.id));
                                onChanged();
                            }}
                        />
                    ))
                }
            </PagedList>
        </div>
    );
};

const CommentQueueItem: React.FC<{ comment: QueuedComment; status: CommentQueueStatus; onDone: () => void }> = ({ comment, status, onDone }) => {
    const [busy, setBusy] = useState<CommentAction | null>(null);
    const [error, setError] = useState<string | null>(null);

    const act = async (action: CommentAction) => {
        setBusy(action);
        setError(null);
        try {
            await api.admin.moderateComment(comment.id, action);
            onDone();
        } catch (e) {
            setError(errMsg(e));
            setBusy(null);
        }
    };

    return (
        <article className="p-3 bg-cream-2 border border-ink rounded-lg space-y-2">
            <div className="flex items-center gap-2 text-[11px] text-ink-2 flex-wrap">
                <Avatar user={comment.author} size={20} />
                <HandleLink user={comment.author} />
                <RoleBadge role={comment.author.role} />
                <span>on</span>
                <Link to={postPath(comment.postId)} className="font-bold text-ink hover:underline truncate max-w-[50ch]">
                    {comment.postTitle || 'Untitled'}
                </Link>
                <span>·</span>
                <span title={fmtDateTime(comment.createdAt)}>{timeAgo(comment.createdAt)}</span>
            </div>
            <p className="text-[12px] whitespace-pre-wrap break-words line-clamp-6 pl-3 border-l-2 border-line">{comment.body}</p>
            <div className="flex justify-end">
                <ActionButtons actions={COMMENT_ACTIONS[status]} busy={busy} onAct={act} />
            </div>
            <ErrorNote error={error} />
        </article>
    );
};

// --- reports ---

type ReportStatus = ReportDto['status'];

const REASON_TONE: Record<string, string> = {
    spam: 'bg-cream-3',
    nsfw: 'bg-[#ff8fb1]',
    harassment: 'bg-red-200',
    copyright: 'bg-[#8fb8ff]',
    other: 'bg-cream-2',
};

const ReportsTab: React.FC<{ onChanged: () => void }> = ({ onChanged }) => {
    const [status, setStatus] = useState<ReportStatus>('open');
    const load = useCallback((cursor: string | null) => api.admin.reports(status, cursor), [status]);
    const list = usePaged<ReportDto>(load);
    return (
        <div>
            <div className="flex items-center justify-between gap-2 mb-4">
                <div className="flex items-center gap-3">
                    <h2 className="text-[12px] font-black uppercase tracking-wider">Reports</h2>
                    <Tabs
                        value={status}
                        onChange={setStatus}
                        options={[
                            { value: 'open', label: 'Open' },
                            { value: 'resolved', label: 'Resolved' },
                            { value: 'dismissed', label: 'Dismissed' },
                        ]}
                    />
                </div>
                <RefreshButton onClick={list.reload} />
            </div>
            <PagedList list={list} empty={status === 'open' ? 'No open reports. All clear.' : `No ${status} reports.`}>
                {items =>
                    items.map(r => (
                        <ReportItem
                            key={r.id}
                            report={r}
                            onDone={postAction => {
                                // moderating a post answers every open report about it
                                list.update(xs =>
                                    xs.filter(x => x.id !== r.id && !(postAction && x.targetType === 'post' && x.targetId === r.targetId))
                                );
                                list.reload();
                                onChanged();
                            }}
                        />
                    ))
                }
            </PagedList>
        </div>
    );
};

const ReportItem: React.FC<{ report: ReportDto; onDone: (postAction: boolean) => void }> = ({ report: r, onDone }) => {
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const run = async (key: string, fn: () => Promise<unknown>, postAction: boolean) => {
        setBusy(key);
        setError(null);
        try {
            await fn();
            onDone(postAction);
        } catch (e) {
            setError(errMsg(e));
            setBusy(null);
        }
    };

    const open = r.status === 'open';
    const t = r.target;
    const canModeratePost = open && r.targetType === 'post' && t && t.status !== 'hidden' && t.status !== 'removed';
    const TargetIcon = r.targetType === 'post' ? Inbox : r.targetType === 'comment' ? MessageSquare : Users;

    return (
        <article className="p-3 bg-cream-2 border border-ink rounded-lg space-y-2">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-ink-2">
                <Badge tone={REASON_TONE[r.reason]}>{r.reason}</Badge>
                {!open && <StatusBadge status={r.status} />}
                <span>
                    reported by <HandleLink user={r.reporter} />
                </span>
                <span>·</span>
                <span title={fmtDateTime(r.createdAt)}>{timeAgo(r.createdAt)}</span>
            </div>

            <div className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-line bg-cream min-w-0">
                <TargetIcon className="w-3.5 h-3.5 flex-shrink-0 text-ink-2" />
                <span className="text-[9px] font-black uppercase tracking-wider text-ink-2">{r.targetType}</span>
                {t ? (
                    <>
                        {t.url ? (
                            <Link to={t.url} className="text-[12px] font-bold truncate hover:underline min-w-0">
                                {t.title || 'Untitled'}
                            </Link>
                        ) : (
                            <span className="text-[12px] font-bold truncate min-w-0">{t.title || 'Untitled'}</span>
                        )}
                        {t.status && <StatusBadge status={t.status} />}
                    </>
                ) : (
                    <span className="text-[12px] italic text-ink-2">no longer exists</span>
                )}
            </div>

            {r.details && <p className="text-[12px] whitespace-pre-wrap break-words pl-3 border-l-2 border-line">{r.details}</p>}
            {!open && r.resolution && (
                <p className="text-[11px] text-ink-2">
                    <span className="font-bold uppercase tracking-wider text-[9px] mr-1.5">Resolution</span>
                    {r.resolution}
                </p>
            )}

            {open && (
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
                    <input
                        value={note}
                        onChange={e => setNote(e.target.value)}
                        maxLength={500}
                        placeholder="Note (optional)"
                        className={`${inputClass} sm:flex-1 !text-[12px] !py-1`}
                    />
                    <div className="flex flex-wrap gap-1.5">
                        <Button
                            size="sm"
                            variant="primary"
                            disabled={busy !== null}
                            onClick={() => run('resolve', () => api.admin.resolveReport(r.id, 'resolved', note.trim()), false)}
                        >
                            {busy === 'resolve' ? <Spinner className="w-3 h-3" /> : <Check className="w-3 h-3" />} Resolve
                        </Button>
                        <Button
                            size="sm"
                            disabled={busy !== null}
                            onClick={() => run('dismiss', () => api.admin.resolveReport(r.id, 'dismissed', note.trim()), false)}
                        >
                            {busy === 'dismiss' ? <Spinner className="w-3 h-3" /> : <X className="w-3 h-3" />} Dismiss
                        </Button>
                        {canModeratePost && (
                            <>
                                <Button
                                    size="sm"
                                    disabled={busy !== null}
                                    onClick={() => run('hide', () => api.admin.moderatePost(r.targetId, 'hide', note.trim()), true)}
                                >
                                    {busy === 'hide' ? <Spinner className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />} Hide post
                                </Button>
                                <Button
                                    size="sm"
                                    variant="danger"
                                    disabled={busy !== null}
                                    onClick={() => run('remove', () => api.admin.moderatePost(r.targetId, 'remove', note.trim()), true)}
                                >
                                    {busy === 'remove' ? <Spinner className="w-3 h-3" /> : <Trash2 className="w-3 h-3" />} Remove post
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            )}
            <ErrorNote error={error} />
        </article>
    );
};

// --- users ---

const UsersTab: React.FC = () => {
    const [q, setQ] = useState('');
    const [dq, setDq] = useState('');
    const [role, setRole] = useState<Role | ''>('');
    const [status, setStatus] = useState<UserStatus | ''>('');

    useEffect(() => {
        const t = setTimeout(() => setDq(q.trim()), 300);
        return () => clearTimeout(t);
    }, [q]);

    const load = useCallback(
        (cursor: string | null) => api.admin.users({ q: dq || undefined, role: role || undefined, status: status || undefined, cursor }),
        [dq, role, status]
    );
    const list = usePaged<AdminUser>(load);

    return (
        <div>
            <SectionTitle right={<RefreshButton onClick={list.reload} />}>Users</SectionTitle>
            <div className="flex flex-col sm:flex-row gap-2 mb-3">
                <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-2 pointer-events-none" />
                    <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search handle, name or email" className={`${inputClass} !pl-8`} />
                </div>
                <select value={role} onChange={e => setRole(e.target.value as Role | '')} className={`${smallSelect} !text-[12px] !py-1.5`}>
                    <option value="">All roles</option>
                    {ROLES.map(r => (
                        <option key={r} value={r}>
                            {r}
                        </option>
                    ))}
                </select>
                <select value={status} onChange={e => setStatus(e.target.value as UserStatus | '')} className={`${smallSelect} !text-[12px] !py-1.5`}>
                    <option value="">All statuses</option>
                    {USER_STATUSES.map(s => (
                        <option key={s} value={s}>
                            {s}
                        </option>
                    ))}
                </select>
            </div>
            <PagedList list={list} empty="No users match.">
                {items => (
                    <div className="bg-cream-2 border border-ink rounded-lg overflow-x-auto custom-scrollbar">
                        <table className="w-full text-[12px] min-w-[820px]">
                            <thead>
                                <tr className="border-b border-ink text-left text-[10px] font-bold uppercase tracking-wider text-ink-2">
                                    <th className="px-3 py-2">User</th>
                                    <th className="px-3 py-2">Email</th>
                                    <th className="px-3 py-2">Role</th>
                                    <th className="px-3 py-2">Status</th>
                                    <th className="px-3 py-2 text-right">Posts</th>
                                    <th className="px-3 py-2">Joined</th>
                                    <th className="px-3 py-2">Last seen</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-line">
                                {items.map(u => (
                                    <UserRow key={u.id} user={u} onUpdated={nu => list.update(xs => xs.map(x => (x.id === nu.id ? nu : x)))} />
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </PagedList>
        </div>
    );
};

const UserRow: React.FC<{ user: AdminUser; onUpdated: (u: AdminUser) => void }> = ({ user: u, onUpdated }) => {
    const { user: me, isAdmin } = useSession();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const self = me?.id === u.id;
    const staffRow = rank(u.role) >= rank('moderator');
    const editable = !self && (isAdmin || !staffRow);
    const why = self ? 'You cannot change your own account' : !editable ? 'Only an admin can change staff accounts' : undefined;
    const roleOptions: readonly Role[] = isAdmin ? ROLES : ['user', 'trusted'];
    const statusOptions: readonly UserStatus[] = isAdmin ? USER_STATUSES : ['active', 'suspended'];

    const patch = async (p: { role?: Role; status?: UserStatus }) => {
        setBusy(true);
        setError(null);
        try {
            onUpdated(await api.admin.updateUser(u.id, p));
        } catch (e) {
            setError(errMsg(e));
        }
        setBusy(false);
    };

    return (
        <tr className={`align-top ${self ? 'bg-cream' : ''}`}>
            <td className="px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                    <Avatar user={u} size={24} />
                    <div className="min-w-0">
                        <div className="flex items-center gap-1">
                            <HandleLink user={u} />
                            {self && <span className="text-[10px] text-ink-2">(you)</span>}
                        </div>
                        {u.displayName && u.displayName !== u.handle && <div className="text-[11px] text-ink-2 truncate max-w-[180px]">{u.displayName}</div>}
                    </div>
                </div>
                {error && <div className="mt-1 text-[11px] text-red-800 max-w-[260px]">{error}</div>}
            </td>
            <td className="px-3 py-2 text-ink-2 truncate max-w-[200px]" title={u.email}>
                {u.email}
            </td>
            <td className="px-3 py-2">
                <select
                    value={u.role}
                    disabled={!editable || busy}
                    title={why}
                    onChange={e => patch({ role: e.target.value as Role })}
                    className={smallSelect}
                >
                    {ROLES.map(r => (
                        <option key={r} value={r} disabled={!roleOptions.includes(r)}>
                            {r}
                        </option>
                    ))}
                </select>
            </td>
            <td className="px-3 py-2">
                <div className="flex items-center gap-1.5">
                    <select
                        value={u.status}
                        disabled={!editable || busy}
                        title={why}
                        onChange={e => patch({ status: e.target.value as UserStatus })}
                        className={`${smallSelect} ${STATUS_TONE[u.status] ?? ''}`}
                    >
                        {USER_STATUSES.map(s => (
                            <option key={s} value={s} disabled={!statusOptions.includes(s)}>
                                {s}
                            </option>
                        ))}
                    </select>
                    {busy && <Spinner className="w-3 h-3" />}
                </div>
            </td>
            <td className="px-3 py-2 text-right tabular-nums">{u.postCount}</td>
            <td className="px-3 py-2 text-ink-2 whitespace-nowrap" title={fmtDateTime(u.createdAt)}>
                {fmtDate(u.createdAt)}
            </td>
            <td className="px-3 py-2 text-ink-2 whitespace-nowrap" title={u.lastSeenAt ? fmtDateTime(u.lastSeenAt) : undefined}>
                {u.lastSeenAt ? timeAgo(u.lastSeenAt) : 'never'}
            </td>
        </tr>
    );
};

// --- settings ---

type NumKey = 'autoHideReports' | 'maxMediaMB' | 'targetMediaMB' | 'maxProjectMB' | 'postsPerDay' | 'commentsPerHour';
/** numbers are edited as text so a half-typed value does not snap */
type Draft = Omit<Settings, NumKey> & Record<NumKey, string>;

const NUMS: Record<NumKey, { label: string; hint: string; min: number; max: number; int?: boolean; unit?: string }> = {
    autoHideReports: {
        label: 'Auto-hide after reports',
        hint: 'Open reports that hide a published post or comment until a moderator looks. 0 = never.',
        min: 0,
        max: 100,
        int: true,
    },
    maxMediaMB: { label: 'Max media size', hint: 'Largest image or video accepted, after browser-side conversion.', min: 1, max: 90, unit: 'MB' },
    targetMediaMB: {
        label: 'Convert images above',
        hint: 'Still images larger than this are converted to WebP in the browser before upload.',
        min: 0.5,
        max: 90,
        unit: 'MB',
    },
    maxProjectMB: { label: 'Max project size', hint: 'Largest attached project file (used for remixing).', min: 1, max: 90, unit: 'MB' },
    postsPerDay: { label: 'Posts per day', hint: 'Per member; staff are exempt. 0 = unlimited.', min: 0, max: 10000, int: true },
    commentsPerHour: { label: 'Comments per hour', hint: 'Per member; staff are exempt. 0 = unlimited.', min: 0, max: 10000, int: true },
};
const NUM_KEYS = Object.keys(NUMS) as NumKey[];

const toDraft = (s: Settings): Draft => ({
    ...s,
    autoHideReports: String(s.autoHideReports),
    maxMediaMB: String(s.maxMediaMB),
    targetMediaMB: String(s.targetMediaMB),
    maxProjectMB: String(s.maxProjectMB),
    postsPerDay: String(s.postsPerDay),
    commentsPerHour: String(s.commentsPerHour),
});

const fromDraft = (d: Draft): { settings: Settings } | { error: string } => {
    const nums = {} as Record<NumKey, number>;
    for (const k of NUM_KEYS) {
        const spec = NUMS[k];
        const n = Number(d[k].trim());
        if (d[k].trim() === '' || !Number.isFinite(n)) return { error: `${spec.label}: enter a number` };
        if (spec.int && !Number.isInteger(n)) return { error: `${spec.label}: use a whole number` };
        if (n < spec.min || n > spec.max) return { error: `${spec.label}: must be between ${spec.min} and ${spec.max}` };
        nums[k] = n;
    }
    if (nums.targetMediaMB > nums.maxMediaMB) return { error: 'Convert images above: cannot exceed the max media size' };
    if (d.reactionEmojis.length === 0) return { error: 'Keep at least one reaction emoji' };
    return { settings: { ...d, ...nums } };
};

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const SettingsTab: React.FC = () => {
    const res = useFetch(api.admin.settings);
    if (!res.data) {
        return res.error ? (
            <div className="space-y-2">
                <ErrorNote error={res.error} />
                <Button size="sm" onClick={res.reload}>
                    <RefreshCw className="w-3 h-3" /> Try again
                </Button>
            </div>
        ) : (
            <Loading />
        );
    }
    return <SettingsForm initial={res.data.settings} defaults={res.data.defaults} />;
};

/** one setting with its label, hint and a reset-to-default link */
const Row: React.FC<{ label: string; hint?: React.ReactNode; onReset?: () => void; children: React.ReactNode }> = ({ label, hint, onReset, children }) => (
    <div className="py-3 first:pt-0 last:pb-0">
        <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-[10px] font-bold text-ink-2 uppercase tracking-wider">{label}</span>
            {onReset && (
                <button type="button" onClick={onReset} className="flex items-center gap-1 text-[10px] font-bold text-ink-2 hover:text-ink">
                    <RotateCcw className="w-2.5 h-2.5" /> Default
                </button>
            )}
        </div>
        {children}
        {hint && <p className="mt-1 text-[11px] text-ink-2">{hint}</p>}
    </div>
);

const Card: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <section>
        <h3 className="text-[11px] font-black uppercase tracking-wider mb-2">{title}</h3>
        <div className="bg-cream-2 border border-ink rounded-lg p-4 divide-y divide-line">{children}</div>
    </section>
);

const GRID_COLS: Record<number, string> = { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4' };

/** radio cards: each choice with a one-line explanation */
function Choice<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string; hint: string }[]; onChange: (v: T) => void }) {
    return (
        <div role="radiogroup" className={`grid grid-cols-1 gap-2 ${GRID_COLS[options.length] ?? 'sm:grid-cols-2'}`}>
            {options.map(o => {
                const on = o.value === value;
                return (
                    <button
                        key={o.value}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => onChange(o.value)}
                        className={`text-left p-2.5 rounded-md border transition-colors ${
                            on ? 'border-ink bg-glx-orange/25 ring-1 ring-ink' : 'border-line bg-cream hover:bg-white hover:border-ink'
                        }`}
                    >
                        <span className="flex items-center gap-1.5 text-[12px] font-black">
                            <span className={`w-3 h-3 rounded-full border border-ink flex-shrink-0 ${on ? 'bg-glx-orange' : 'bg-cream-2'}`} />
                            {o.label}
                        </span>
                        <span className="block mt-1 text-[11px] text-ink-2 leading-snug">{o.hint}</span>
                    </button>
                );
            })}
        </div>
    );
}

const moderationOptions = (noun: string) =>
    (Object.keys(MODERATION_COPY) as ModerationMode[]).map(m => ({ value: m, label: MODERATION_COPY[m].label, hint: MODERATION_COPY[m].hint(noun) }));

const SettingsForm: React.FC<{ initial: Settings; defaults: Settings }> = ({ initial, defaults }) => {
    const { refresh } = useSession();
    const [saved, setSaved] = useState(initial);
    const [draft, setDraft] = useState<Draft>(() => toDraft(initial));
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
    const [emoji, setEmoji] = useState('');

    const savedDraft = toDraft(saved);
    const defaultDraft = toDraft(defaults);
    const changed = (Object.keys(draft) as (keyof Draft)[]).filter(k => !same(draft[k], savedDraft[k]));

    const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
        setDraft(d => ({ ...d, [k]: v }));
        setStatus(null);
    };
    const reset = <K extends keyof Draft>(k: K) => (same(draft[k], defaultDraft[k]) ? undefined : () => set(k, defaultDraft[k]));

    const save = async () => {
        const parsed = fromDraft(draft);
        if ('error' in parsed) {
            setStatus({ ok: false, text: parsed.error });
            return;
        }
        const patch: Partial<Settings> = {};
        for (const k of Object.keys(parsed.settings) as (keyof Settings)[]) {
            if (!same(parsed.settings[k], saved[k])) (patch as Record<string, unknown>)[k] = parsed.settings[k];
        }
        if (Object.keys(patch).length === 0) {
            setDraft(toDraft(saved));
            return;
        }
        setSaving(true);
        setStatus(null);
        try {
            const r = await api.admin.updateSettings(patch);
            setSaved(r.settings);
            setDraft(toDraft(r.settings));
            setStatus({ ok: true, text: `Saved ${Object.keys(patch).length} change${Object.keys(patch).length === 1 ? '' : 's'}` });
            await refresh();
        } catch (e) {
            setStatus({ ok: false, text: errMsg(e) });
        }
        setSaving(false);
    };

    const addEmoji = () => {
        const v = emoji.trim();
        if (!v) return;
        if (v.length > 16) return setStatus({ ok: false, text: 'That reaction is too long' });
        if (draft.reactionEmojis.includes(v)) return setStatus({ ok: false, text: 'That reaction is already in the list' });
        if (draft.reactionEmojis.length >= 24) return setStatus({ ok: false, text: 'Up to 24 reactions' });
        set('reactionEmojis', [...draft.reactionEmojis, v]);
        setEmoji('');
    };

    const numField = (k: NumKey) => {
        const spec = NUMS[k];
        return (
            <Row key={k} label={spec.label} hint={spec.hint} onReset={reset(k)}>
                <div className="flex items-center gap-2">
                    <input
                        type="number"
                        inputMode="decimal"
                        min={spec.min}
                        max={spec.max}
                        step={spec.int ? 1 : 0.5}
                        value={draft[k]}
                        onChange={e => set(k, e.target.value)}
                        className={`${inputClass} !w-28 tabular-nums`}
                    />
                    {spec.unit && <span className="text-[11px] font-bold text-ink-2">{spec.unit}</span>}
                </div>
            </Row>
        );
    };

    return (
        <div className="space-y-6">
            <SectionTitle>Settings</SectionTitle>

            <Card title="Access">
                <Row label="Sign-ups" onReset={reset('registration')}>
                    <Choice
                        value={draft.registration}
                        onChange={v => set('registration', v)}
                        options={(['open', 'closed'] as const).map(v => ({ value: v, ...REGISTRATION_COPY[v] }))}
                    />
                </Row>
                <Row label="Who can see the gallery" onReset={reset('galleryAccess')}>
                    <Choice
                        value={draft.galleryAccess}
                        onChange={v => set('galleryAccess', v)}
                        options={(Object.keys(ACCESS_COPY) as GalleryAccess[]).map(v => ({ value: v, ...ACCESS_COPY[v] }))}
                    />
                </Row>
            </Card>

            <Card title="Moderation">
                <Row label="New posts" onReset={reset('postModeration')}>
                    <Choice value={draft.postModeration} onChange={v => set('postModeration', v)} options={moderationOptions('post')} />
                </Row>
                <Row label="New comments" onReset={reset('commentModeration')}>
                    <Choice value={draft.commentModeration} onChange={v => set('commentModeration', v)} options={moderationOptions('comment')} />
                </Row>
                {numField('autoHideReports')}
            </Card>

            <Card title="Limits">
                <div className="grid sm:grid-cols-2 gap-x-6 divide-y divide-line sm:divide-y-0">
                    {(['maxMediaMB', 'targetMediaMB', 'maxProjectMB', 'postsPerDay', 'commentsPerHour'] as const).map(numField)}
                </div>
            </Card>

            <Card title="Reactions">
                <Row label="Reaction emojis" hint="Shown under every post and comment, in this order." onReset={reset('reactionEmojis')}>
                    <div className="flex flex-wrap items-center gap-1.5">
                        {draft.reactionEmojis.map(e => (
                            <span key={e} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full border border-ink bg-cream text-[15px]">
                                {e}
                                <button
                                    type="button"
                                    disabled={draft.reactionEmojis.length <= 1}
                                    onClick={() => set('reactionEmojis', draft.reactionEmojis.filter(x => x !== e))}
                                    className="p-0.5 rounded-full text-ink-2 hover:text-ink hover:bg-cream-3 disabled:opacity-30"
                                    title="Remove"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </span>
                        ))}
                        <span className="inline-flex items-center gap-1">
                            <input
                                value={emoji}
                                onChange={e => setEmoji(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        addEmoji();
                                    }
                                }}
                                placeholder="Add…"
                                className={`${inputClass} !w-20 !py-1 !text-[13px]`}
                            />
                            <Button size="sm" onClick={addEmoji} disabled={!emoji.trim()} title="Add reaction">
                                <Plus className="w-3 h-3" />
                            </Button>
                        </span>
                    </div>
                </Row>
            </Card>

            <Card title="Announcement">
                <Row
                    label="Gallery banner"
                    hint={`Shown on top of the gallery when set. ${draft.announcement.length}/500`}
                    onReset={reset('announcement')}
                >
                    <textarea
                        value={draft.announcement}
                        onChange={e => set('announcement', e.target.value)}
                        maxLength={500}
                        rows={3}
                        placeholder="e.g. The gallery is in review mode while we clean up — back soon."
                        className={`${inputClass} resize-y`}
                    />
                </Row>
            </Card>

            <div className="sticky bottom-0 -mx-1 px-1 py-3 bg-cream border-t border-line flex flex-wrap items-center justify-end gap-2">
                {status ? (
                    <span className={`mr-auto text-[12px] font-bold ${status.ok ? 'text-green-800' : 'text-red-800'}`}>{status.text}</span>
                ) : (
                    <span className="mr-auto text-[12px] text-ink-2">
                        {changed.length ? `${changed.length} unsaved change${changed.length === 1 ? '' : 's'}` : 'All changes saved'}
                    </span>
                )}
                <Button
                    disabled={!changed.length || saving}
                    onClick={() => {
                        setDraft(toDraft(saved));
                        setStatus(null);
                    }}
                >
                    Discard
                </Button>
                <Button variant="primary" disabled={!changed.length || saving} onClick={save}>
                    {saving ? <Spinner className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />} Save
                </Button>
            </div>
        </div>
    );
};

// --- audit log ---

const AuditTab: React.FC = () => {
    const list = usePaged<AuditEntry>(api.admin.audit);
    return (
        <div>
            <SectionTitle right={<RefreshButton onClick={list.reload} />}>Audit log</SectionTitle>
            <PagedList list={list} empty="Nothing logged yet.">
                {items => (
                    <div className="bg-cream-2 border border-ink rounded-lg divide-y divide-line">
                        {items.map(e => (
                            <AuditRow key={e.id} entry={e} />
                        ))}
                    </div>
                )}
            </PagedList>
        </div>
    );
};

const AuditRow: React.FC<{ entry: AuditEntry }> = ({ entry: e }) => {
    const [open, setOpen] = useState(false);
    const hasData = Object.keys(e.data ?? {}).length > 0;
    const verb = e.action.split('.').pop() ?? '';
    const tone = /remove|ban|reject|hide/.test(verb) ? 'bg-red-200' : /approve|restore|resolved/.test(verb) ? 'bg-glx-green' : 'bg-cream';
    return (
        <div className="px-3 py-2 text-[12px]">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="w-36 flex-shrink-0 text-[11px] text-ink-2 tabular-nums" title={e.createdAt}>
                    {fmtDateTime(e.createdAt)}
                </span>
                <span className="w-28 flex-shrink-0 truncate">{e.actor ? <HandleLink user={e.actor} /> : <span className="italic text-ink-2">system</span>}</span>
                <Badge tone={tone}>{e.action}</Badge>
                {e.targetType && (
                    <span className="text-[11px] text-ink-2 min-w-0 truncate">
                        {e.targetType}
                        {e.targetId &&
                            (e.targetType === 'post' ? (
                                <Link to={postPath(e.targetId)} className="ml-1 font-mono text-ink hover:underline" title={e.targetId}>
                                    {e.targetId.slice(0, 10)}
                                </Link>
                            ) : (
                                <span className="ml-1 font-mono" title={e.targetId}>
                                    {e.targetId.slice(0, 10)}
                                </span>
                            ))}
                    </span>
                )}
            </div>
            {hasData && (
                <button
                    type="button"
                    onClick={() => setOpen(o => !o)}
                    className="mt-1 w-full flex items-start gap-1 text-left text-ink-2 hover:text-ink"
                    title={open ? 'Collapse' : 'Expand'}
                >
                    {open ? <ChevronDown className="w-3 h-3 mt-0.5 flex-shrink-0" /> : <ChevronRight className="w-3 h-3 mt-0.5 flex-shrink-0" />}
                    {open ? (
                        <pre className="flex-1 min-w-0 font-mono text-[11px] whitespace-pre-wrap break-all bg-cream border border-line rounded-md p-2 text-ink">
                            {JSON.stringify(e.data, null, 2)}
                        </pre>
                    ) : (
                        <code className="flex-1 min-w-0 font-mono text-[11px] truncate">{JSON.stringify(e.data)}</code>
                    )}
                </button>
            )}
        </div>
    );
};
