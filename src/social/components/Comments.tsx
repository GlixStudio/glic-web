// A post's comment thread: top-level comments with their replies one level
// in (deeper replies attach to the same thread), a composer, edit/delete for
// authors, removal for staff, reactions and reports.

import React, { useCallback, useEffect, useState } from 'react';
import type { CommentDto } from '../../../shared/api';
import { api } from '../api';
import { useSession } from '../session';
import { navigate, profilePath } from '../router';
import { timeAgo } from '../format';
import { Avatar, Button, RoleBadge, Spinner, inputClass } from './ui';
import { Reactions } from './Reactions';
import { ReportButton } from './ReportButton';

export const Comments: React.FC<{ postId: string; open: boolean; onCount?: (n: number) => void }> = ({ postId, open, onCount }) => {
    const { user, requireAuth, isStaff } = useSession();
    const [items, setItems] = useState<CommentDto[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    const reload = useCallback(() => {
        api.comments(postId)
            .then(r => {
                setItems(r.items);
                onCount?.(r.items.filter(c => c.status === 'published').length);
            })
            .catch(e => setError((e as Error).message));
    }, [postId, onCount]);

    useEffect(reload, [reload]);

    if (error) return <div className="text-[12px] text-ink-2">{error}</div>;
    if (!items)
        return (
            <div className="py-4 flex justify-center text-ink-2">
                <Spinner />
            </div>
        );

    const byId = new Map(items.map(c => [c.id, c]));
    const rootOf = (c: CommentDto): string => {
        let cur = c;
        for (let i = 0; i < 50 && cur.parentId && byId.has(cur.parentId); i++) cur = byId.get(cur.parentId)!;
        return cur.id;
    };
    const roots = items.filter(c => !c.parentId || !byId.has(c.parentId));
    const replies = new Map<string, CommentDto[]>();
    for (const c of items) {
        if (!c.parentId || !byId.has(c.parentId)) continue;
        const r = rootOf(c);
        replies.set(r, [...(replies.get(r) ?? []), c]);
    }
    // a removed comment with no replies has nothing left to show
    const visibleRoots = roots.filter(c => c.status !== 'removed' || (replies.get(c.id)?.length ?? 0) > 0);

    return (
        <div className="space-y-4">
            {open ? (
                user ? (
                    <Composer postId={postId} onPosted={reload} />
                ) : (
                    <button onClick={() => requireAuth('login', 'Sign in to comment')} className="w-full text-left rounded-md border border-line bg-cream-2 px-3 py-2 text-[12px] text-ink-2 hover:border-ink">
                        Sign in to comment…
                    </button>
                )
            ) : (
                <div className="text-[12px] text-ink-2">Comments open once the post is published.</div>
            )}
            {visibleRoots.length === 0 && open && <div className="text-[12px] text-ink-2">No comments yet.</div>}
            {visibleRoots.map(c => (
                <div key={c.id}>
                    <Comment comment={c} postId={postId} canReply={open} onChanged={reload} canModerate={isStaff} />
                    {(replies.get(c.id) ?? []).length > 0 && (
                        <div className="ml-7 mt-2 pl-3 border-l border-line space-y-3">
                            {replies.get(c.id)!.map(r => (
                                <Comment key={r.id} comment={r} postId={postId} canReply={open} onChanged={reload} canModerate={isStaff} replyTo={c.id} />
                            ))}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};

const Composer: React.FC<{ postId: string; parentId?: string; onPosted: () => void; onCancel?: () => void; autoFocus?: boolean }> = ({
    postId,
    parentId,
    onPosted,
    onCancel,
    autoFocus,
}) => {
    const [body, setBody] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!body.trim()) return;
        setBusy(true);
        setError(null);
        try {
            const c = await api.addComment(postId, body.trim(), parentId);
            setBody('');
            setNotice(c.status === 'pending' ? 'Sent - it shows up once a moderator approves it.' : null);
            onPosted();
            onCancel?.();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setBusy(false);
        }
    };
    return (
        <form onSubmit={submit} className="space-y-1.5">
            <textarea
                className={`${inputClass} min-h-[56px] resize-y`}
                placeholder={parentId ? 'Reply…' : 'Add a comment…'}
                value={body}
                maxLength={2000}
                autoFocus={autoFocus}
                onChange={e => setBody(e.target.value)}
                onKeyDown={e => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(e);
                }}
            />
            <div className="flex items-center gap-2">
                <Button type="submit" variant="primary" size="sm" disabled={busy || !body.trim()}>
                    {busy ? 'Posting…' : parentId ? 'Reply' : 'Comment'}
                </Button>
                {onCancel && (
                    <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
                        Cancel
                    </Button>
                )}
                {error && <span className="text-[11px] text-red-700">{error}</span>}
                {notice && <span className="text-[11px] text-ink-2">{notice}</span>}
            </div>
        </form>
    );
};

const Comment: React.FC<{
    comment: CommentDto;
    postId: string;
    canReply: boolean;
    canModerate: boolean;
    onChanged: () => void;
    replyTo?: string;
}> = ({ comment: c, postId, canReply, canModerate, onChanged, replyTo }) => {
    const { user, requireAuth } = useSession();
    const [replying, setReplying] = useState(false);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(c.body);
    const [error, setError] = useState<string | null>(null);
    const own = user?.id === c.author.id;

    if (c.status === 'removed') return <div className="text-[12px] italic text-ink-2">Comment removed</div>;

    const act = async (fn: () => Promise<unknown>) => {
        setError(null);
        try {
            await fn();
            onChanged();
        } catch (e) {
            setError((e as Error).message);
        }
    };

    return (
        <div className="flex gap-2">
            <button onClick={() => navigate(profilePath(c.author.handle))} className="flex-shrink-0 mt-0.5">
                <Avatar user={c.author} size={22} />
            </button>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-[11px]">
                    <button onClick={() => navigate(profilePath(c.author.handle))} className="font-bold hover:underline">
                        {c.author.displayName || c.author.handle}
                    </button>
                    <RoleBadge role={c.author.role} />
                    <span className="text-ink-2">
                        {timeAgo(c.createdAt)}
                        {c.editedAt && ' · edited'}
                    </span>
                    {c.status !== 'published' && <span className="px-1 rounded bg-ink text-cream text-[9px] font-bold uppercase">{c.status === 'pending' ? 'in review' : c.status}</span>}
                </div>
                {editing ? (
                    <div className="mt-1 space-y-1.5">
                        <textarea className={`${inputClass} min-h-[50px]`} value={draft} onChange={e => setDraft(e.target.value)} maxLength={2000} />
                        <div className="flex gap-1.5">
                            <Button size="sm" variant="primary" onClick={() => act(async () => (await api.editComment(c.id, draft), setEditing(false)))}>
                                Save
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                                Cancel
                            </Button>
                        </div>
                    </div>
                ) : (
                    <p className="text-[13px] leading-snug whitespace-pre-wrap break-words mt-0.5">{c.body}</p>
                )}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px] text-ink-2">
                    {c.status === 'published' && <Reactions targetType="comment" targetId={c.id} reactions={c.reactions} mine={c.viewerReactions} size="sm" />}
                    {canReply && c.status === 'published' && (
                        <button className="font-bold hover:text-ink" onClick={async () => (await requireAuth('login', 'Sign in to reply')) && setReplying(r => !r)}>
                            Reply
                        </button>
                    )}
                    {own && !editing && (
                        <button className="font-bold hover:text-ink" onClick={() => setEditing(true)}>
                            Edit
                        </button>
                    )}
                    {(own || canModerate) && (
                        <button className="font-bold hover:text-red-700" onClick={() => confirm('Delete this comment?') && act(() => api.deleteComment(c.id))}>
                            Delete
                        </button>
                    )}
                    {!own && user && <ReportButton targetType="comment" targetId={c.id} className="font-bold hover:text-ink" />}
                    {error && <span className="text-red-700">{error}</span>}
                </div>
                {replying && (
                    <div className="mt-2">
                        <Composer postId={postId} parentId={replyTo ?? c.id} onPosted={onChanged} onCancel={() => setReplying(false)} autoFocus />
                    </div>
                )}
            </div>
        </div>
    );
};
