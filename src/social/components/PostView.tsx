// One post, over the feed: the media large on a dark stage, and beside it the
// author, reactions, comments and what can be done with it (open in the
// editor, download, edit, moderate, report).

import React, { useCallback, useEffect, useState } from 'react';
import { Download, Layers, Link2, Pencil, Trash2, X } from 'lucide-react';
import { VISIBILITIES, type PostDetail, type Visibility } from '../../../shared/api';
import { useApp } from '../../core/AppContext';
import { openIncomingImage } from '../../core/incomingImage';
import { api } from '../api';
import { useSession } from '../session';
import { navigate, profilePath } from '../router';
import { formatBytes } from '../mediaPrep';
import { blobToImageData } from '../../core/imageio';
import { unpackProject } from '../projectBundle';
import { timeAgo } from '../format';
import { Avatar, Button, ErrorNote, RoleBadge, Spinner, inputClass } from './ui';
import { Reactions } from './Reactions';
import { Comments } from './Comments';
import { ReportButton } from './ReportButton';

const STATUS_NOTE: Record<string, string> = {
    pending: 'Waiting for a moderator - only you and staff can see it.',
    rejected: 'A moderator did not approve this post.',
    hidden: 'Hidden while a moderator reviews it.',
    removed: 'Removed by a moderator.',
};

export const PostView: React.FC<{ postId: string; onClose: () => void; onDeleted?: () => void }> = ({ postId, onClose, onDeleted }) => {
    const { user, isStaff } = useSession();
    const { openProjectRecord, toast } = useApp();
    const [post, setPost] = useState<PostDetail | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [editing, setEditing] = useState(false);

    useEffect(() => {
        let live = true;
        api.post(postId)
            .then(p => live && setPost(p))
            .catch(e => live && setError((e as Error).message));
        return () => {
            live = false;
        };
    }, [postId]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !document.querySelector('[role="dialog"]')) onClose();
        };
        // capture: the community layer keeps bubbling keys away from the editor underneath
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [onClose]);

    const setCommentCount = useCallback((n: number) => setPost(p => (p && p.commentCount !== n ? { ...p, commentCount: n } : p)), []);

    const own = !!post && user?.id === post.author.id;
    const project = post?.assets.find(a => a.role === 'project');
    const layerCount = Number(post?.metadata.layers ?? 0);
    const primary = post?.primary;

    const openInEditor = async () => {
        if (!post || !primary) return;
        setBusy('open');
        try {
            if (project) {
                const rec = await unpackProject(await (await fetch(project.url)).blob());
                rec.name = post.title || rec.name;
                if (await openProjectRecord(rec)) navigate('/');
            } else {
                const img = await blobToImageData(await (await fetch(primary.url)).blob());
                navigate('/');
                openIncomingImage({ image: img, name: post.title || 'Gallery image', via: 'upload' });
            }
        } catch (e) {
            toast('error', `Could not open it: ${(e as Error).message}`);
        } finally {
            setBusy(null);
        }
    };

    const remove = async () => {
        if (!post || !confirm('Delete this post for good? Its files, reactions and comments go with it.')) return;
        setBusy('delete');
        try {
            await api.deletePost(post.id);
            toast('success', 'Post deleted');
            onDeleted?.();
            onClose();
        } catch (e) {
            toast('error', (e as Error).message);
            setBusy(null);
        }
    };

    const moderate = async (action: 'approve' | 'restore' | 'reject' | 'hide' | 'remove') => {
        if (!post) return;
        const note = action === 'approve' || action === 'restore' ? '' : (prompt(`Note for ${action} (optional, the author sees it)`) ?? null);
        if (note === null) return;
        setBusy(action);
        try {
            const r = await api.admin.moderatePost(post.id, action, note);
            setPost({ ...post, status: r.status as PostDetail['status'], moderationNote: note || null });
            toast('success', `Post ${r.status}`);
        } catch (e) {
            toast('error', (e as Error).message);
        } finally {
            setBusy(null);
        }
    };

    const transcode = primary?.metadata.transcode as { mode?: string; quality?: number; psnr?: number | null; scale?: number } | undefined;
    const original = primary?.metadata.original as { bytes?: number; mime?: string } | undefined;

    return (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-stretch justify-center md:p-4" onClick={onClose}>
            <div
                className="relative w-full max-w-[1400px] flex flex-col md:flex-row bg-stage-2 md:rounded-xl overflow-hidden md:border md:border-ink shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                <button onClick={onClose} className="absolute top-2 right-2 z-10 p-1.5 rounded-full bg-black/50 text-white hover:bg-black/70" title="Close (Esc)">
                    <X className="w-4 h-4" />
                </button>

                {/* stage */}
                <div className="flex-1 min-h-[45vh] md:min-h-0 flex items-center justify-center bg-stage-2 p-3 md:p-6">
                    {!post && !error && <Spinner className="w-6 h-6 text-cream" />}
                    {error && <div className="text-cream text-[13px]">{error}</div>}
                    {post && primary && (
                        <img
                            src={primary.url}
                            alt={post.title}
                            className="max-w-full max-h-[80vh] md:max-h-[calc(100vh-5rem)] object-contain"
                            style={{ imageRendering: (primary.width ?? 9999) < 600 ? 'pixelated' : undefined }}
                        />
                    )}
                </div>

                {/* side panel */}
                {post && (
                    <aside className="w-full md:w-[380px] flex-shrink-0 bg-cream text-ink overflow-y-auto custom-scrollbar">
                        <div className="p-4 space-y-4">
                            <div className="flex items-center gap-2">
                                <button onClick={() => navigate(profilePath(post.author.handle))} className="flex items-center gap-2 min-w-0">
                                    <Avatar user={post.author} size={32} />
                                    <span className="min-w-0 text-left">
                                        <span className="flex items-center gap-1.5 text-[13px] font-bold truncate">
                                            {post.author.displayName || post.author.handle} <RoleBadge role={post.author.role} />
                                        </span>
                                        <span className="block text-[11px] text-ink-2">
                                            @{post.author.handle} · {timeAgo(post.publishedAt ?? post.createdAt)}
                                        </span>
                                    </span>
                                </button>
                            </div>

                            {post.status !== 'published' && (
                                <div className="rounded-md border border-ink bg-glx-orange/30 px-3 py-2 text-[12px]">
                                    <b className="uppercase tracking-wider text-[10px]">{post.status}</b> - {STATUS_NOTE[post.status]}
                                    {post.moderationNote && <div className="mt-1 text-ink-2">“{post.moderationNote}”</div>}
                                </div>
                            )}

                            {editing ? (
                                <EditPost post={post} onDone={p => (p && setPost({ ...post, ...p }), setEditing(false))} />
                            ) : (
                                <div>
                                    {post.title && <h2 className="text-[18px] font-black leading-tight">{post.title}</h2>}
                                    {post.body && <p className="mt-1.5 text-[13px] leading-relaxed whitespace-pre-wrap break-words">{post.body}</p>}
                                    {post.tags.length > 0 && (
                                        <div className="mt-2 flex flex-wrap gap-1">
                                            {post.tags.map(t => (
                                                <button
                                                    key={t}
                                                    onClick={() => navigate(`/gallery?tag=${encodeURIComponent(t)}`)}
                                                    className="px-1.5 py-0.5 rounded border border-line text-[11px] text-ink-2 hover:border-ink hover:text-ink"
                                                >
                                                    #{t}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            <Reactions
                                key={post.id}
                                targetType="post"
                                targetId={post.id}
                                reactions={post.reactions}
                                mine={post.viewerReactions}
                                disabled={post.status !== 'published'}
                            />

                            <div className="flex flex-wrap gap-1.5">
                                <Button
                                    variant="primary"
                                    size="sm"
                                    onClick={openInEditor}
                                    disabled={busy === 'open' || !primary}
                                    title={layerCount > 0 ? 'Opens the whole project: layers, masks, effects and codec settings' : 'Opens the image with its codec settings, ready to encode'}
                                >
                                    <Layers className="w-3.5 h-3.5" />
                                    {busy === 'open' ? 'Opening…' : 'Remix in editor'}
                                </Button>
                                {primary && (
                                    <a href={primary.url} download={String(primary.metadata.fileName ?? `glix-${post.id}`)}>
                                        <Button size="sm" tabIndex={-1}>
                                            <Download className="w-3.5 h-3.5" /> Download
                                        </Button>
                                    </a>
                                )}
                                <Button
                                    size="sm"
                                    onClick={() =>
                                        navigator.clipboard.writeText(`${location.origin}/gallery/${post.id}`).then(
                                            () => toast('success', 'Link copied'),
                                            () => toast('error', 'Could not copy the link')
                                        )
                                    }
                                >
                                    <Link2 className="w-3.5 h-3.5" /> Link
                                </Button>
                                {own && !editing && (
                                    <Button size="sm" onClick={() => setEditing(true)}>
                                        <Pencil className="w-3.5 h-3.5" /> Edit
                                    </Button>
                                )}
                                {(own || isStaff) && (
                                    <Button size="sm" variant="danger" onClick={remove} disabled={busy === 'delete'}>
                                        <Trash2 className="w-3.5 h-3.5" /> Delete
                                    </Button>
                                )}
                            </div>

                            {isStaff && (
                                <div className="rounded-md border border-line p-2 space-y-1.5">
                                    <div className="text-[10px] font-bold text-ink-2 uppercase tracking-wider">Moderation</div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {(post.status === 'published'
                                            ? (['hide', 'remove'] as const)
                                            : post.status === 'pending'
                                              ? (['approve', 'reject', 'remove'] as const)
                                              : post.status === 'rejected'
                                                ? (['approve', 'remove'] as const)
                                                : (['restore', 'remove'] as const)
                                        ).map(a => (
                                            <Button key={a} size="sm" variant={a === 'remove' ? 'danger' : a === 'approve' || a === 'restore' ? 'primary' : 'plain'} disabled={!!busy} onClick={() => moderate(a)}>
                                                {a[0].toUpperCase() + a.slice(1)}
                                            </Button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px] text-ink-2">
                                {primary?.width && (
                                    <>
                                        <dt>Size</dt>
                                        <dd className="font-mono">
                                            {primary.width}×{primary.height} · {formatBytes(primary.bytes)} · {primary.mime.split('/')[1].toUpperCase()}
                                        </dd>
                                    </>
                                )}
                                {transcode && (
                                    <>
                                        <dt>Converted</dt>
                                        <dd>
                                            {transcode.mode === 'lossless'
                                                ? 'lossless WebP, pixel-identical'
                                                : `${transcode.mode === 'near-lossless' ? 'near-lossless WebP' : `WebP q${transcode.quality}`}${transcode.psnr ? ` · ${transcode.psnr} dB` : ''}`}
                                            {transcode.scale && transcode.scale < 1 ? ` · ${Math.round(transcode.scale * 100)}% size` : ''}
                                            {original?.bytes ? ` (from ${formatBytes(original.bytes)})` : ''}
                                        </dd>
                                    </>
                                )}
                                {project && (
                                    <>
                                        <dt>Project</dt>
                                        <dd>
                                            {layerCount > 0 ? `full, ${layerCount} ${layerCount === 1 ? 'layer' : 'layers'}` : 'image + codec settings'}, {formatBytes(project.bytes)}{' '}
                                            <a href={project.url} download className="underline">
                                                download
                                            </a>
                                        </dd>
                                    </>
                                )}
                                <dt>Views</dt>
                                <dd>{post.viewCount}</dd>
                            </dl>

                            {!own && user && (
                                <ReportButton targetType="post" targetId={post.id} className="text-[11px] text-ink-2 hover:text-ink underline">
                                    Report this post
                                </ReportButton>
                            )}

                            <div className="border-t border-line pt-3">
                                <div className="text-[10px] font-bold text-ink-2 uppercase tracking-wider mb-2">Comments {post.commentCount > 0 && `· ${post.commentCount}`}</div>
                                <Comments postId={post.id} open={post.status === 'published'} onCount={setCommentCount} />
                            </div>
                        </div>
                    </aside>
                )}
            </div>
        </div>
    );
};

const EditPost: React.FC<{ post: PostDetail; onDone: (p: Partial<PostDetail> | null) => void }> = ({ post, onDone }) => {
    const [title, setTitle] = useState(post.title);
    const [body, setBody] = useState(post.body);
    const [tags, setTags] = useState(post.tags.join(' '));
    const [visibility, setVisibility] = useState<Visibility>(post.visibility);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const save = async () => {
        setBusy(true);
        setError(null);
        try {
            const p = await api.updatePost(post.id, {
                title,
                body,
                tags: tags.split(/[\s,#]+/).map(t => t.trim().toLowerCase()).filter(Boolean),
                visibility,
            });
            onDone(p);
        } catch (e) {
            setError((e as Error).message);
            setBusy(false);
        }
    };
    return (
        <div className="space-y-2">
            <input className={inputClass} value={title} onChange={e => setTitle(e.target.value)} placeholder="Title" maxLength={120} />
            <textarea className={`${inputClass} min-h-[70px]`} value={body} onChange={e => setBody(e.target.value)} placeholder="Description" maxLength={5000} />
            <input className={inputClass} value={tags} onChange={e => setTags(e.target.value)} placeholder="tags" />
            <select className={inputClass} value={visibility} onChange={e => setVisibility(e.target.value as Visibility)}>
                {VISIBILITIES.map(v => (
                    <option key={v} value={v}>
                        {v}
                    </option>
                ))}
            </select>
            <ErrorNote error={error} />
            <div className="flex gap-1.5">
                <Button size="sm" variant="primary" onClick={save} disabled={busy}>
                    Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onDone(null)}>
                    Cancel
                </Button>
            </div>
        </div>
    );
};
