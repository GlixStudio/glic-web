// The gallery: posts and their files, reactions, comments, reports, profiles.

import { Hono } from 'hono';
import { z } from 'zod';
import {
    REPORT_REASONS,
    SORTS,
    VISIBILITIES,
    WINDOWS,
    type CommentDto,
    type Page,
    type PostDetail,
    type PostDto,
    type PostKind,
    type Profile,
} from '../shared/api';
import { EXTENSIONS, imageSize, isAnimated, sniffType, type SniffedType } from '../shared/media';
import { iso, isoOrNull, one, type Db, type Row, type Statement } from './db';
import { newId, sha256Hex } from './crypto';
import {
    type AppEnv,
    type Ctx,
    type SessionUser,
    HttpError,
    auditStatement,
    bad,
    canViewGallery,
    forbidden,
    hitLimit,
    initialStatus,
    isStaff,
    lockRow,
    jsonBody,
    notFound,
    parse,
    requireActive,
    requireGallery,
    settingsOf,
} from './core';
import { POST_COLUMNS, assetDto, coverAssets, postDto, reactionSummaries, userSummary } from './dto';

export const postRoutes = new Hono<AppEnv>();

const MB = 1024 * 1024;
const PREVIEW_MAX_BYTES = 3 * MB;
const METADATA_MAX_CHARS = 16_000;

const tagsSchema = z
    .array(z.string().trim().toLowerCase().regex(/^[\p{L}\p{N}_-]{1,32}$/u, 'Tags are single words (letters, digits, _ or -)'))
    .max(12)
    .transform(t => [...new Set(t)]);

const metadataSchema = z
    .record(z.string(), z.unknown())
    .refine(m => JSON.stringify(m).length <= METADATA_MAX_CHARS, 'metadata is too large');

const dims = z.number().int().min(1).max(30_000);
const assetMetaSchema = z
    .object({
        width: dims.optional(),
        height: dims.optional(),
        durationMs: z.number().int().min(0).max(3_600_000).optional(),
        metadata: metadataSchema.optional(),
    })
    .strict();

const createSchema = z
    .object({
        title: z.string().trim().max(120).default(''),
        body: z.string().trim().max(5000).default(''),
        tags: tagsSchema.default([]),
        visibility: z.enum(VISIBILITIES).default('public'),
        metadata: metadataSchema.default({}),
        assets: z
            .object({ primary: assetMetaSchema.optional(), preview: assetMetaSchema.optional(), project: assetMetaSchema.optional() })
            .strict()
            .default({}),
    })
    .strict();

// --- visibility ---

/** may this viewer open the post at all? */
const canSeePost = (p: Row, viewer: SessionUser | null, access: Parameters<typeof canViewGallery>[0]) => {
    if (isStaff(viewer)) return true;
    if (viewer && p.author_id === viewer.id) return true;
    return p.status === 'published' && p.visibility !== 'private' && p.a_status !== 'banned' && canViewGallery(access, viewer);
};

const loadPostRow = (db: Db, id: string) =>
    one(db, `SELECT ${POST_COLUMNS} FROM posts p JOIN users u ON u.id = p.author_id WHERE p.id = $1`, [id]);

const visiblePost = async (c: Ctx, id: string): Promise<Row> => {
    const row = await loadPostRow(c.get('deps').db, id);
    const settings = await settingsOf(c);
    if (!row || !canSeePost(row, c.get('user'), settings.galleryAccess)) throw notFound('Post not found');
    return row;
};

const postDetail = async (c: Ctx, row: Row): Promise<PostDetail> => {
    const { db } = c.get('deps');
    const viewer = c.get('user');
    const [assetRows, summary] = await Promise.all([
        db.query('SELECT * FROM assets WHERE post_id = $1 ORDER BY role, position', [row.id]),
        reactionSummaries(db, 'post', [String(row.id)], viewer?.id ?? null),
    ]);
    const assets = assetRows.map(assetDto);
    const own = !!viewer && viewer.id === row.author_id;
    return {
        ...postDto(row, assets, own || isStaff(viewer)),
        assets,
        ...summary.get(String(row.id))!,
    };
};

// --- feed ---

const listSchema = z.object({
    sort: z.enum(SORTS).default('new'),
    window: z.enum(WINDOWS).default('all'),
    tag: z.string().trim().toLowerCase().max(32).optional(),
    author: z.string().trim().max(30).optional(),
    q: z.string().trim().max(100).optional(),
    mine: z.enum(['1', 'true']).optional(),
    cursor: z.string().regex(/^\d{1,6}$/).optional(),
    limit: z.coerce.number().int().min(1).max(60).default(30),
});

const WINDOW_DAYS: Record<string, number> = { day: 1, week: 7, month: 30, year: 365 };

postRoutes.get('/posts', async c => {
    const { db } = c.get('deps');
    const viewer = c.get('user');
    const q = parse(listSchema, c.req.query());
    const mine = !!q.mine && !!viewer;
    if (!mine) await requireGallery(c);

    const where: string[] = [];
    const params: unknown[] = [];
    const p = (v: unknown) => {
        params.push(v);
        return `$${params.length}`;
    };
    if (mine) where.push(`p.author_id = ${p(viewer!.id)}`);
    else where.push(`p.status = 'published'`, `p.visibility = 'public'`, `u.status <> 'banned'`);
    if (q.tag) where.push(`${p(q.tag)} = ANY(p.tags)`);
    if (q.author) where.push(`lower(u.handle) = lower(${p(q.author)})`);
    if (q.q) {
        const like = p(`%${q.q.replace(/[\\%_]/g, m => '\\' + m)}%`);
        where.push(`(p.title ILIKE ${like} OR p.body ILIKE ${like} OR lower(${p(q.q)}) = ANY(p.tags) OR u.handle ILIKE ${like})`);
    }
    if (q.window !== 'all' && (q.sort === 'top' || q.sort === 'discussed' || q.sort === 'trending'))
        where.push(`p.published_at > now() - make_interval(days => ${p(WINDOW_DAYS[q.window])})`);

    const when = mine ? 'p.created_at' : 'p.published_at';
    const order = {
        new: `${when} DESC, p.id DESC`,
        old: `${when} ASC, p.id ASC`,
        top: `p.reaction_count DESC, ${when} DESC, p.id DESC`,
        discussed: `p.comment_count DESC, ${when} DESC, p.id DESC`,
        // hacker-news style gravity: engagement over age in hours
        trending: `(p.reaction_count + 2 * p.comment_count + 1) / power(extract(epoch FROM (now() - coalesce(p.published_at, p.created_at))) / 3600 + 2, 1.5) DESC, p.id DESC`,
    }[q.sort];

    const offset = Number(q.cursor ?? 0);
    const rows = await db.query(
        `SELECT ${POST_COLUMNS} FROM posts p JOIN users u ON u.id = p.author_id
         WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ${p(q.limit + 1)} OFFSET ${p(offset)}`,
        params
    );
    const more = rows.length > q.limit;
    const pageRows = rows.slice(0, q.limit);
    const assets = await coverAssets(db, pageRows.map(r => String(r.id)));
    const body: Page<PostDto> = {
        items: pageRows.map(r => postDto(r, assets.get(String(r.id)) ?? [], mine || isStaff(viewer))),
        nextCursor: more ? String(offset + q.limit) : null,
    };
    return c.json(body);
});

postRoutes.get('/posts/:id', async c => {
    const row = await visiblePost(c, c.req.param('id'));
    const viewer = c.get('user');
    if (!viewer || viewer.id !== row.author_id) {
        await c.get('deps').db.query('UPDATE posts SET view_count = view_count + 1 WHERE id = $1', [row.id]);
        row.view_count = Number(row.view_count) + 1;
    }
    return c.json(await postDetail(c, row));
});

// --- create ---

interface Upload {
    role: 'primary' | 'preview' | 'project';
    bytes: Uint8Array;
    type: SniffedType;
    name: string;
    width: number | null;
    height: number | null;
    durationMs: number | null;
    metadata: Record<string, unknown>;
}

const containsAscii = (bytes: Uint8Array, text: string) => {
    const needle = new TextEncoder().encode(text);
    outer: for (let i = 0; i <= bytes.length - needle.length; i++) {
        for (let j = 0; j < needle.length; j++) if (bytes[i + j] !== needle[j]) continue outer;
        return true;
    }
    return false;
};

const readUpload = async (form: FormData, role: Upload['role']): Promise<{ bytes: Uint8Array; name: string } | null> => {
    const f = form.get(role);
    if (f == null) return null;
    if (typeof f === 'string') throw bad(`${role} must be a file`);
    return { bytes: new Uint8Array(await f.arrayBuffer()), name: f.name.slice(0, 200) };
};

postRoutes.post('/posts', async c => {
    const user = requireActive(c);
    const settings = await settingsOf(c);
    const { db, store } = c.get('deps');

    const status = initialStatus(settings.postModeration, user.role);
    if (!status) throw forbidden('Posting is closed right now', 'posting_closed');
    if (!isStaff(user) && settings.postsPerDay > 0) {
        const recent = await one<{ n: number }>(
            db,
            `SELECT count(*)::int AS n FROM posts WHERE author_id = $1 AND created_at > now() - interval '1 day'`,
            [user.id]
        );
        if (Number(recent?.n) >= settings.postsPerDay) throw new HttpError(429, 'rate_limited', `You can post ${settings.postsPerDay} times a day`);
    }

    // the Worker has already buffered the body; refuse oversized ones before parsing
    const lengthHeader = c.req.header('content-length');
    if (!lengthHeader) throw new HttpError(411, 'length_required', 'Upload size unknown');
    const length = Number(lengthHeader);
    const maxBody = (settings.maxMediaMB + settings.maxProjectMB) * MB + PREVIEW_MAX_BYTES + 64 * 1024;
    if (length > maxBody) throw new HttpError(413, 'too_large', 'Upload is too large');

    let form: FormData;
    try {
        form = await c.req.formData();
    } catch {
        throw bad('Expected multipart form data');
    }
    const dataField = form.get('data');
    let data: unknown;
    try {
        data = JSON.parse(typeof dataField === 'string' ? dataField : '{}');
    } catch {
        throw bad('data must be JSON');
    }
    const input = parse(createSchema, data);

    const uploads: Upload[] = [];
    for (const role of ['primary', 'preview', 'project'] as const) {
        const file = await readUpload(form, role);
        if (!file) continue;
        const type = sniffType(file.bytes);
        const meta = input.assets[role] ?? {};
        if (role === 'primary') {
            // the gallery shows GLIX Encoder stills: PNG, or the WebP the browser converts big ones to
            if ((type !== 'image/png' && type !== 'image/webp') || isAnimated(file.bytes, type))
                throw new HttpError(415, 'unsupported_type', 'Share a still PNG or WebP from the GLIX Encoder');
            if (file.bytes.length > settings.maxMediaMB * MB)
                throw new HttpError(413, 'too_large', `Media files can be up to ${settings.maxMediaMB} MB`);
        } else if (role === 'preview') {
            if (type !== 'image/webp' && type !== 'image/jpeg' && type !== 'image/png') throw new HttpError(415, 'unsupported_type', 'Preview must be an image');
            if (file.bytes.length > PREVIEW_MAX_BYTES) throw new HttpError(413, 'too_large', 'Preview is too large');
        } else {
            // a bundle names project.json in its directory; anything else is not ours to host
            if (type !== 'application/zip' || !containsAscii(file.bytes, 'project.json'))
                throw new HttpError(415, 'unsupported_type', 'Project must be a GLIX project bundle');
            if (file.bytes.length > settings.maxProjectMB * MB)
                throw new HttpError(413, 'too_large', `Projects can be up to ${settings.maxProjectMB} MB`);
        }
        const header = type && type !== 'application/zip' ? imageSize(file.bytes, type) : null;
        if (header && (header.width < 1 || header.height < 1 || header.width > 30_000 || header.height > 30_000))
            throw new HttpError(415, 'unsupported_type', 'Images can be up to 30000 px on a side');
        uploads.push({
            role,
            bytes: file.bytes,
            type: type!,
            name: file.name,
            // sizes come from the file's own header, never the client
            width: header?.width ?? null,
            height: header?.height ?? null,
            durationMs: null,
            metadata: meta.metadata ?? {},
        });
    }
    const primary = uploads.find(u => u.role === 'primary');
    if (!primary) throw bad('A post needs an image');
    // every post can be opened in the editor: the full project, or the image as one
    if (!uploads.some(u => u.role === 'project')) throw bad('A post needs its GLIX project');
    const kind: PostKind = 'image';
    const preview = uploads.find(u => u.role === 'preview');
    const coverW = primary.width ?? preview?.width ?? null;
    const coverH = primary.height ?? preview?.height ?? null;

    const postId = newId();
    const stored: string[] = [];
    const statements: Statement[] = [
        {
            text: `INSERT INTO posts (id, author_id, kind, title, body, status, visibility, tags, metadata, cover_width, cover_height, published_at)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8::text[], $9::jsonb, $10, $11, CASE WHEN $6 = 'published' THEN now() END)`,
            params: [postId, user.id, kind, input.title, input.body, status, input.visibility, input.tags, JSON.stringify(input.metadata), coverW, coverH],
        },
    ];
    try {
        for (const u of uploads) {
            const assetId = newId();
            const key = `posts/${postId}/${assetId}.${EXTENSIONS[u.type]}`;
            await store.put(key, u.bytes, u.type);
            stored.push(key);
            statements.push({
                text: `INSERT INTO assets (id, owner_id, post_id, role, storage_key, mime, bytes, width, height, duration_ms, sha256, metadata)
                       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)`,
                params: [
                    assetId, user.id, postId, u.role, key, u.type, u.bytes.length, u.width, u.height, u.durationMs,
                    await sha256Hex(u.bytes), JSON.stringify({ ...u.metadata, fileName: u.name }),
                ],
            });
        }
        await db.batch(statements);
    } catch (e) {
        await store.delete(stored).catch(() => {});
        throw e;
    }
    const row = await loadPostRow(db, postId);
    return c.json(await postDetail(c, row!), 201);
});

// --- edit / delete ---

const ownOrStaff = (c: Ctx, row: Row) => {
    const user = requireActive(c);
    if (row.author_id !== user.id && !isStaff(user)) throw forbidden();
    return user;
};

postRoutes.patch('/posts/:id', async c => {
    const { db } = c.get('deps');
    const row = await loadPostRow(db, c.req.param('id'));
    if (!row) throw notFound('Post not found');
    const user = ownOrStaff(c, row);
    const input = await jsonBody(
        c,
        z
            .object({
                title: z.string().trim().max(120),
                body: z.string().trim().max(5000),
                tags: tagsSchema,
                visibility: z.enum(VISIBILITIES),
            })
            .partial()
            .strict()
    );
    // under review modes, an author's rewrite of a published post is reviewed again
    const settings = await settingsOf(c);
    const contentChanged =
        (input.title !== undefined && input.title !== row.title) ||
        (input.body !== undefined && input.body !== row.body) ||
        (input.tags !== undefined && JSON.stringify(input.tags) !== JSON.stringify(row.tags));
    const backToReview = user.id === row.author_id && row.status === 'published' && contentChanged && initialStatus(settings.postModeration, user.role) !== 'published';
    const statements: Statement[] = [
        {
            text: `UPDATE posts SET title = coalesce($2, title), body = coalesce($3, body), tags = coalesce($4::text[], tags),
                   visibility = coalesce($5, visibility), status = CASE WHEN $6 THEN 'pending' ELSE status END, updated_at = now() WHERE id = $1`,
            params: [row.id, input.title ?? null, input.body ?? null, input.tags ?? null, input.visibility ?? null, backToReview],
        },
    ];
    if (user.id !== row.author_id) statements.push(auditStatement(user.id, 'post.edit', 'post', String(row.id), input));
    await db.batch(statements);
    return c.json(await postDetail(c, (await loadPostRow(db, String(row.id)))!));
});

/** deletes a post, its rows and its files */
export const deletePost = async (db: Db, store: Ctx['var']['deps']['store'], postId: string, extra: Statement[] = []) => {
    const keys = await db.query<{ storage_key: string }>('SELECT storage_key FROM assets WHERE post_id = $1', [postId]);
    await db.batch([
        {
            text: `DELETE FROM reactions WHERE (target_type = 'post' AND target_id = $1)
                   OR (target_type = 'comment' AND target_id IN (SELECT id FROM comments WHERE post_id = $1))`,
            params: [postId],
        },
        { text: 'DELETE FROM posts WHERE id = $1', params: [postId] },
        ...extra,
    ]);
    // rows first: a file left behind is waste, a row pointing at no file is a broken post
    await store.delete(keys.map(k => k.storage_key)).catch(() => {});
};

postRoutes.delete('/posts/:id', async c => {
    const { db, store } = c.get('deps');
    const row = await loadPostRow(db, c.req.param('id'));
    if (!row) throw notFound('Post not found');
    const user = ownOrStaff(c, row);
    const extra = user.id !== row.author_id ? [auditStatement(user.id, 'post.delete', 'post', String(row.id), { title: row.title, author: row.a_handle })] : [];
    await deletePost(db, store, String(row.id), extra);
    return c.json({ ok: true });
});

// --- reactions ---

postRoutes.post('/reactions', async c => {
    const user = requireActive(c);
    const settings = await settingsOf(c);
    const { db } = c.get('deps');
    const input = await jsonBody(
        c,
        z.object({ targetType: z.enum(['post', 'comment']), targetId: z.string().max(40), emoji: z.string().min(1).max(16), active: z.boolean() })
    );
    if (input.active && !settings.reactionEmojis.includes(input.emoji)) throw bad('That reaction is not available');
    await hitLimit(db, `react:${user.id}`, 300, 3600);

    if (input.targetType === 'post') {
        const row = await visiblePost(c, input.targetId);
        if (row.status !== 'published') throw bad('This post cannot take reactions yet');
    } else {
        const cm = await one<{ post_id: string; status: string }>(db, 'SELECT post_id, status FROM comments WHERE id = $1', [input.targetId]);
        if (!cm || cm.status !== 'published') throw notFound('Comment not found');
        await visiblePost(c, cm.post_id);
    }
    const table = input.targetType === 'post' ? 'posts' : 'comments';
    await db.batch([
        lockRow(table, input.targetId),
        input.active
            ? {
                  text: `INSERT INTO reactions (target_type, target_id, user_id, emoji) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
                  params: [input.targetType, input.targetId, user.id, input.emoji],
              }
            : {
                  text: 'DELETE FROM reactions WHERE target_type = $1 AND target_id = $2 AND user_id = $3 AND emoji = $4',
                  params: [input.targetType, input.targetId, user.id, input.emoji],
              },
        {
            text: `UPDATE ${table} SET reaction_count = (SELECT count(*) FROM reactions WHERE target_type = $1 AND target_id = $2) WHERE id = $2`,
            params: [input.targetType, input.targetId],
        },
    ]);
    const summary = await reactionSummaries(db, input.targetType, [input.targetId], user.id);
    const s = summary.get(input.targetId)!;
    return c.json({ ...s, reactionCount: s.reactions.reduce((a, r) => a + r.count, 0) });
});

// --- comments ---

const COMMENT_COLUMNS = `c.*, u.id AS a_id, u.handle AS a_handle, u.display_name AS a_display_name, u.avatar_url AS a_avatar_url, u.role AS a_role`;

const commentDto = (r: Row, s: { reactions: CommentDto['reactions']; viewerReactions: string[] }): CommentDto => ({
    id: String(r.id),
    postId: String(r.post_id),
    parentId: (r.parent_id as string | null) ?? null,
    body: r.status === 'removed' ? '' : String(r.body),
    status: r.status as CommentDto['status'],
    author: userSummary(r, 'a_'),
    reactions: s.reactions,
    viewerReactions: s.viewerReactions,
    createdAt: iso(r.created_at),
    editedAt: isoOrNull(r.edited_at),
});

const recountComments = (postId: string): Statement => ({
    text: `UPDATE posts SET comment_count = (SELECT count(*) FROM comments WHERE post_id = $1 AND status = 'published') WHERE id = $1`,
    params: [postId],
});

postRoutes.get('/posts/:id/comments', async c => {
    const post = await visiblePost(c, c.req.param('id'));
    const { db } = c.get('deps');
    const viewer = c.get('user');
    const rows = await db.query(
        `SELECT ${COMMENT_COLUMNS} FROM comments c JOIN users u ON u.id = c.author_id
         WHERE c.post_id = $1 AND (c.status IN ('published', 'removed') OR c.author_id = $2 OR $3)
         ORDER BY c.created_at, c.id LIMIT 1000`,
        [post.id, viewer?.id ?? '', isStaff(viewer)]
    );
    const summaries = await reactionSummaries(db, 'comment', rows.map(r => String(r.id)), viewer?.id ?? null);
    return c.json({ items: rows.map(r => commentDto(r, summaries.get(String(r.id))!)) });
});

postRoutes.post('/posts/:id/comments', async c => {
    const user = requireActive(c);
    const settings = await settingsOf(c);
    const { db } = c.get('deps');
    const post = await visiblePost(c, c.req.param('id'));
    if (post.status !== 'published') throw bad('Comments open once the post is published');
    const input = await jsonBody(c, z.object({ body: z.string().trim().min(1, 'Write something first').max(2000), parentId: z.string().max(40).nullish() }));
    const status = initialStatus(settings.commentModeration, user.role);
    if (!status) throw forbidden('Comments are closed right now', 'comments_closed');
    if (!isStaff(user) && settings.commentsPerHour > 0) await hitLimit(db, `comment:${user.id}`, settings.commentsPerHour, 3600);
    if (input.parentId) {
        const parent = await one(db, 'SELECT 1 FROM comments WHERE id = $1 AND post_id = $2', [input.parentId, post.id]);
        if (!parent) throw bad('The comment you replied to is gone');
    }
    const id = newId();
    await db.batch([
        lockRow('posts', String(post.id)),
        {
            text: 'INSERT INTO comments (id, post_id, author_id, parent_id, body, status) VALUES ($1, $2, $3, $4, $5, $6)',
            params: [id, post.id, user.id, input.parentId ?? null, input.body, status],
        },
        recountComments(String(post.id)),
    ]);
    const row = await one(db, `SELECT ${COMMENT_COLUMNS} FROM comments c JOIN users u ON u.id = c.author_id WHERE c.id = $1`, [id]);
    return c.json(commentDto(row!, { reactions: [], viewerReactions: [] }), 201);
});

postRoutes.patch('/comments/:id', async c => {
    const user = requireActive(c);
    const { db } = c.get('deps');
    const input = await jsonBody(c, z.object({ body: z.string().trim().min(1).max(2000) }));
    const row = await one(db, 'SELECT * FROM comments WHERE id = $1', [c.req.param('id')]);
    if (!row || row.status === 'removed') throw notFound('Comment not found');
    if (row.author_id !== user.id) throw forbidden();
    const settings = await settingsOf(c);
    const backToReview = row.status === 'published' && input.body !== row.body && initialStatus(settings.commentModeration, user.role) !== 'published';
    await db.batch([
        lockRow('posts', String(row.post_id)),
        {
            text: `UPDATE comments SET body = $2, edited_at = now(), updated_at = now(), status = CASE WHEN $3 THEN 'pending' ELSE status END WHERE id = $1`,
            params: [row.id, input.body, backToReview],
        },
        recountComments(String(row.post_id)),
    ]);
    const updated = await one(db, `SELECT ${COMMENT_COLUMNS} FROM comments c JOIN users u ON u.id = c.author_id WHERE c.id = $1`, [row.id]);
    const s = await reactionSummaries(db, 'comment', [String(row.id)], user.id);
    return c.json(commentDto(updated!, s.get(String(row.id))!));
});

postRoutes.delete('/comments/:id', async c => {
    const user = requireActive(c);
    const { db } = c.get('deps');
    const row = await one(db, 'SELECT * FROM comments WHERE id = $1', [c.req.param('id')]);
    if (!row) throw notFound('Comment not found');
    if (row.author_id !== user.id && !isStaff(user)) throw forbidden();
    // soft: replies keep their place in the thread
    const statements: Statement[] = [
        lockRow('posts', String(row.post_id)),
        { text: `UPDATE comments SET status = 'removed', body = '', updated_at = now() WHERE id = $1`, params: [row.id] },
        { text: `DELETE FROM reactions WHERE target_type = 'comment' AND target_id = $1`, params: [row.id] },
        recountComments(String(row.post_id)),
    ];
    if (row.author_id !== user.id) statements.push(auditStatement(user.id, 'comment.delete', 'comment', String(row.id), { body: row.body }));
    await db.batch(statements);
    return c.json({ ok: true });
});

// --- reports ---

postRoutes.post('/reports', async c => {
    const user = requireActive(c);
    const settings = await settingsOf(c);
    const { db } = c.get('deps');
    const input = await jsonBody(
        c,
        z.object({
            targetType: z.enum(['post', 'comment', 'user']),
            targetId: z.string().max(40),
            reason: z.enum(REPORT_REASONS),
            details: z.string().trim().max(1000).default(''),
        })
    );
    await hitLimit(db, `report:${user.id}`, 20, 3600);
    const table = { post: 'posts', comment: 'comments', user: 'users' }[input.targetType];
    if (!(await one(db, `SELECT 1 FROM ${table} WHERE id = $1`, [input.targetId]))) throw notFound();
    await db.query(
        `INSERT INTO reports (id, target_type, target_id, reporter_id, reason, details) VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (target_type, target_id, reporter_id) WHERE status = 'open' DO NOTHING`,
        [newId(), input.targetType, input.targetId, user.id, input.reason, input.details]
    );

    // enough open reports hide a post or comment until a moderator looks
    if (settings.autoHideReports > 0 && input.targetType !== 'user') {
        // only reporters a sock-puppet farm can't mint in a minute count: trusted
        // members or accounts a day old, who have not had a report on this
        // dismissed before; staff content is never hidden automatically
        const open = await one<{ n: number; staff_author: boolean }>(
            db,
            `SELECT count(*)::int AS n,
                    EXISTS (
                        SELECT 1 FROM users a WHERE a.role IN ('moderator', 'admin') AND a.id = (
                            CASE WHEN $1 = 'post' THEN (SELECT author_id FROM posts WHERE id = $2)
                                 ELSE (SELECT author_id FROM comments WHERE id = $2) END)
                    ) AS staff_author
             FROM reports r JOIN users u ON u.id = r.reporter_id
             WHERE r.target_type = $1 AND r.target_id = $2 AND r.status = 'open'
               AND (u.role <> 'user' OR u.created_at < now() - interval '1 day')
               AND NOT EXISTS (SELECT 1 FROM reports d WHERE d.target_type = r.target_type AND d.target_id = r.target_id
                               AND d.reporter_id = r.reporter_id AND d.status = 'dismissed')`,
            [input.targetType, input.targetId]
        );
        if (!open?.staff_author && Number(open?.n) >= settings.autoHideReports) {
            const note = `Hidden automatically after ${open!.n} reports`;
            const statements: Statement[] =
                input.targetType === 'post'
                    ? [
                          {
                              text: `UPDATE posts SET status = 'hidden', moderation_note = $2, moderated_at = now() WHERE id = $1 AND status = 'published'`,
                              params: [input.targetId, note],
                          },
                      ]
                    : [
                          { text: `UPDATE comments SET status = 'hidden' WHERE id = $1 AND status = 'published'`, params: [input.targetId] },
                          {
                              text: `UPDATE posts SET comment_count = (SELECT count(*) FROM comments WHERE post_id = posts.id AND status = 'published')
                                     WHERE id = (SELECT post_id FROM comments WHERE id = $1)`,
                              params: [input.targetId],
                          },
                      ];
            statements.push(auditStatement(null, `${input.targetType}.auto_hide`, input.targetType, input.targetId, { reports: open!.n }));
            await db.batch(statements);
        }
    }
    return c.json({ ok: true }, 201);
});

// --- profiles ---

postRoutes.get('/users/:handle', async c => {
    await requireGallery(c);
    const { db } = c.get('deps');
    const row = await one(
        db,
        `SELECT u.*, (SELECT count(*)::int FROM posts p WHERE p.author_id = u.id AND p.status = 'published' AND p.visibility = 'public') AS post_count
         FROM users u WHERE lower(u.handle) = lower($1) AND u.status <> 'banned'`,
        [c.req.param('handle')]
    );
    if (!row) throw notFound('User not found');
    const body: Profile = { ...userSummary(row), bio: String(row.bio), createdAt: iso(row.created_at), postCount: Number(row.post_count) };
    return c.json(body);
});
