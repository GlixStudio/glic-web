// Staff tools: settings (admins), the review queue, reports, users and the
// audit log. Every moderation action writes an audit entry in the same
// transaction as the change.

import { Hono } from 'hono';
import { z } from 'zod';
import { ROLES, USER_STATUSES, type AdminStats, type AdminUser, type AuditEntry, type Page, type ReportDto, type Role } from '../shared/api';
import { iso, isoOrNull, one, type Row, type Statement } from './db';
import {
    type AppEnv,
    auditStatement,
    bad,
    forbidden,
    isAdmin,
    jsonBody,
    notFound,
    parse,
    rank,
    requireAdmin,
    requireStaff,
    settingsOf,
} from './core';
import { POST_COLUMNS, coverAssets, postDto, userSummary } from './dto';
import { DEFAULT_SETTINGS, settingsPatchSchema } from './settings';

export const adminRoutes = new Hono<AppEnv>();

const cursorSchema = z.string().regex(/^\d{1,6}$/).optional();

adminRoutes.get('/stats', async c => {
    requireStaff(c);
    const { db } = c.get('deps');
    const [users, posts, comments, reports] = await Promise.all([
        one<{ n: number }>(db, 'SELECT count(*)::int AS n FROM users'),
        db.query<{ status: string; n: number }>('SELECT status, count(*)::int AS n FROM posts GROUP BY status'),
        one<{ n: number }>(db, `SELECT count(*)::int AS n FROM comments WHERE status = 'pending'`),
        one<{ n: number }>(db, `SELECT count(*)::int AS n FROM reports WHERE status = 'open'`),
    ]);
    const body: AdminStats = {
        users: Number(users?.n ?? 0),
        posts: Object.fromEntries(posts.map(p => [p.status, Number(p.n)])),
        pendingComments: Number(comments?.n ?? 0),
        openReports: Number(reports?.n ?? 0),
    };
    return c.json(body);
});

// --- settings ---

adminRoutes.get('/settings', async c => {
    requireAdmin(c);
    return c.json({ settings: await settingsOf(c), defaults: DEFAULT_SETTINGS });
});

adminRoutes.patch('/settings', async c => {
    const admin = requireAdmin(c);
    const { db } = c.get('deps');
    const patch = await jsonBody(c, settingsPatchSchema);
    const before = await settingsOf(c);
    const changed = Object.entries(patch).filter(([k, v]) => JSON.stringify(before[k as keyof typeof before]) !== JSON.stringify(v));
    if (changed.length) {
        await db.batch([
            ...changed.map(([key, value]) => ({
                text: `INSERT INTO settings (key, value, updated_by) VALUES ($1, $2::jsonb, $3)
                       ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = now()`,
                params: [key, JSON.stringify(value), admin.id],
            })),
            auditStatement(
                admin.id,
                'settings.update',
                'settings',
                null,
                Object.fromEntries(changed.map(([k, v]) => [k, { from: before[k as keyof typeof before], to: v }]))
            ),
        ]);
    }
    c.set('settings', undefined);
    return c.json({ settings: await settingsOf(c), defaults: DEFAULT_SETTINGS });
});

// --- review queue ---

adminRoutes.get('/queue/posts', async c => {
    const staff = requireStaff(c);
    const { db } = c.get('deps');
    const q = parse(z.object({ status: z.enum(['pending', 'hidden', 'rejected', 'removed']).default('pending'), cursor: cursorSchema }), c.req.query());
    const offset = Number(q.cursor ?? 0);
    const rows = await db.query(
        `SELECT ${POST_COLUMNS} FROM posts p JOIN users u ON u.id = p.author_id WHERE p.status = $1
         ORDER BY p.created_at ${q.status === 'pending' ? 'ASC' : 'DESC'}, p.id LIMIT 31 OFFSET $2`,
        [q.status, offset]
    );
    const assets = await coverAssets(db, rows.slice(0, 30).map(r => String(r.id)));
    return c.json({
        items: rows.slice(0, 30).map(r => postDto(r, assets.get(String(r.id)) ?? [], !!staff)),
        nextCursor: rows.length > 30 ? String(offset + 30) : null,
    });
});

const postActions = { approve: 'published', restore: 'published', reject: 'rejected', hide: 'hidden', remove: 'removed' } as const;

adminRoutes.post('/posts/:id/moderate', async c => {
    const staff = requireStaff(c);
    const { db } = c.get('deps');
    const input = await jsonBody(c, z.object({ action: z.enum(['approve', 'restore', 'reject', 'hide', 'remove']), note: z.string().trim().max(500).default('') }));
    const post = await one(db, 'SELECT id, status, title FROM posts WHERE id = $1', [c.req.param('id')]);
    if (!post) throw notFound('Post not found');
    const next = postActions[input.action];
    const publishing = next === 'published';
    await db.batch([
        {
            text: `UPDATE posts SET status = $2, moderation_note = nullif($3, ''), moderated_by = $4, moderated_at = now(),
                   published_at = CASE WHEN $2 = 'published' THEN coalesce(published_at, now()) ELSE published_at END
                   WHERE id = $1`,
            params: [post.id, next, input.note, staff.id],
        },
        // the decision answers any open reports about it
        {
            text: `UPDATE reports SET status = $3, resolution = $4, resolved_by = $2, resolved_at = now()
                   WHERE target_type = 'post' AND target_id = $1 AND status = 'open'`,
            params: [post.id, staff.id, publishing ? 'dismissed' : 'resolved', `post ${input.action}`],
        },
        auditStatement(staff.id, `post.${input.action}`, 'post', String(post.id), { from: post.status, to: next, note: input.note, title: post.title }),
    ]);
    return c.json({ ok: true, status: next });
});

adminRoutes.get('/queue/comments', async c => {
    requireStaff(c);
    const { db } = c.get('deps');
    const q = parse(z.object({ status: z.enum(['pending', 'hidden']).default('pending'), cursor: cursorSchema }), c.req.query());
    const offset = Number(q.cursor ?? 0);
    const rows = await db.query(
        `SELECT c.id, c.post_id, c.body, c.status, c.created_at, p.title AS post_title,
                u.id AS a_id, u.handle AS a_handle, u.display_name AS a_display_name, u.avatar_url AS a_avatar_url, u.role AS a_role
         FROM comments c JOIN users u ON u.id = c.author_id JOIN posts p ON p.id = c.post_id
         WHERE c.status = $1 ORDER BY c.created_at ASC, c.id LIMIT 51 OFFSET $2`,
        [q.status, offset]
    );
    return c.json({
        items: rows.slice(0, 50).map(r => ({
            id: String(r.id),
            postId: String(r.post_id),
            postTitle: String(r.post_title),
            body: String(r.body),
            status: String(r.status),
            author: userSummary(r, 'a_'),
            createdAt: iso(r.created_at),
        })),
        nextCursor: rows.length > 50 ? String(offset + 50) : null,
    });
});

adminRoutes.post('/comments/:id/moderate', async c => {
    const staff = requireStaff(c);
    const { db } = c.get('deps');
    const input = await jsonBody(c, z.object({ action: z.enum(['approve', 'restore', 'hide', 'remove']) }));
    const cm = await one(db, 'SELECT id, post_id, status, body FROM comments WHERE id = $1', [c.req.param('id')]);
    if (!cm) throw notFound('Comment not found');
    const next = { approve: 'published', restore: 'published', hide: 'hidden', remove: 'removed' }[input.action];
    await db.batch([
        {
            text: `UPDATE comments SET status = $2, body = CASE WHEN $2 = 'removed' THEN '' ELSE body END, updated_at = now() WHERE id = $1`,
            params: [cm.id, next],
        },
        {
            text: `UPDATE posts SET comment_count = (SELECT count(*) FROM comments WHERE post_id = $1 AND status = 'published') WHERE id = $1`,
            params: [cm.post_id],
        },
        {
            text: `UPDATE reports SET status = $3, resolution = $4, resolved_by = $2, resolved_at = now()
                   WHERE target_type = 'comment' AND target_id = $1 AND status = 'open'`,
            params: [cm.id, staff.id, next === 'published' ? 'dismissed' : 'resolved', `comment ${input.action}`],
        },
        auditStatement(staff.id, `comment.${input.action}`, 'comment', String(cm.id), { from: cm.status, to: next, body: cm.body }),
    ]);
    return c.json({ ok: true, status: next });
});

// --- reports ---

adminRoutes.get('/reports', async c => {
    requireStaff(c);
    const { db } = c.get('deps');
    const q = parse(z.object({ status: z.enum(['open', 'resolved', 'dismissed']).default('open'), cursor: cursorSchema }), c.req.query());
    const offset = Number(q.cursor ?? 0);
    const rows = await db.query(
        `SELECT r.*, u.id AS a_id, u.handle AS a_handle, u.display_name AS a_display_name, u.avatar_url AS a_avatar_url, u.role AS a_role,
                coalesce(p.title, left(cm.body, 120), tu.handle) AS target_title,
                coalesce(p.status, cm.status, tu.status) AS target_status,
                coalesce(p.id, cm.post_id) AS target_post_id, tu.handle AS target_handle
         FROM reports r
         LEFT JOIN users u ON u.id = r.reporter_id
         LEFT JOIN posts p ON r.target_type = 'post' AND p.id = r.target_id
         LEFT JOIN comments cm ON r.target_type = 'comment' AND cm.id = r.target_id
         LEFT JOIN users tu ON r.target_type = 'user' AND tu.id = r.target_id
         WHERE r.status = $1 ORDER BY r.created_at DESC, r.id LIMIT 51 OFFSET $2`,
        [q.status, offset]
    );
    const items: ReportDto[] = rows.slice(0, 50).map(r => ({
        id: String(r.id),
        targetType: r.target_type as ReportDto['targetType'],
        targetId: String(r.target_id),
        reason: String(r.reason),
        details: String(r.details),
        status: r.status as ReportDto['status'],
        resolution: (r.resolution as string | null) ?? null,
        reporter: r.a_id ? userSummary(r, 'a_') : null,
        createdAt: iso(r.created_at),
        target:
            r.target_title == null
                ? null
                : {
                      title: String(r.target_title),
                      status: (r.target_status as string | null) ?? null,
                      url: r.target_post_id ? `/gallery/${r.target_post_id}` : r.target_handle ? `/u/${r.target_handle}` : null,
                  },
    }));
    const body: Page<ReportDto> = { items, nextCursor: rows.length > 50 ? String(offset + 50) : null };
    return c.json(body);
});

adminRoutes.post('/reports/:id', async c => {
    const staff = requireStaff(c);
    const { db } = c.get('deps');
    const input = await jsonBody(c, z.object({ status: z.enum(['resolved', 'dismissed']), resolution: z.string().trim().max(500).default('') }));
    const r = await one(db, 'SELECT id, target_type, target_id FROM reports WHERE id = $1', [c.req.param('id')]);
    if (!r) throw notFound('Report not found');
    await db.batch([
        {
            text: 'UPDATE reports SET status = $2, resolution = nullif($3, \'\'), resolved_by = $4, resolved_at = now() WHERE id = $1',
            params: [r.id, input.status, input.resolution, staff.id],
        },
        auditStatement(staff.id, `report.${input.status}`, String(r.target_type), String(r.target_id), { report: r.id, resolution: input.resolution }),
    ]);
    return c.json({ ok: true });
});

// --- users ---

/** emails are for admins; moderators see accounts without them */
const adminUser = (r: Row, showEmail: boolean): AdminUser => ({
    ...userSummary(r),
    email: showEmail ? String(r.email) : '',
    bio: String(r.bio),
    status: r.status as AdminUser['status'],
    createdAt: iso(r.created_at),
    lastSeenAt: isoOrNull(r.last_seen_at),
    postCount: Number(r.post_count),
});

adminRoutes.get('/users', async c => {
    const staff = requireStaff(c);
    const showEmail = isAdmin(staff);
    const { db } = c.get('deps');
    const q = parse(
        z.object({ q: z.string().trim().max(100).optional(), role: z.enum(ROLES).optional(), status: z.enum(USER_STATUSES).optional(), cursor: cursorSchema }),
        c.req.query()
    );
    const where = ['true'];
    const params: unknown[] = [];
    if (q.q) {
        params.push(`%${q.q.replace(/[\\%_]/g, m => '\\' + m)}%`);
        where.push(`(${showEmail ? `u.email ILIKE $${params.length} OR ` : ''}u.handle ILIKE $${params.length} OR u.display_name ILIKE $${params.length})`);
    }
    if (q.role) {
        params.push(q.role);
        where.push(`u.role = $${params.length}`);
    }
    if (q.status) {
        params.push(q.status);
        where.push(`u.status = $${params.length}`);
    }
    const offset = Number(q.cursor ?? 0);
    params.push(offset);
    const rows = await db.query(
        `SELECT u.*, (SELECT count(*)::int FROM posts p WHERE p.author_id = u.id) AS post_count
         FROM users u WHERE ${where.join(' AND ')} ORDER BY u.created_at DESC, u.id LIMIT 51 OFFSET $${params.length}`,
        params
    );
    const body: Page<AdminUser> = { items: rows.slice(0, 50).map(r => adminUser(r, showEmail)), nextCursor: rows.length > 50 ? String(offset + 50) : null };
    return c.json(body);
});

adminRoutes.patch('/users/:id', async c => {
    const staff = requireStaff(c);
    const { db } = c.get('deps');
    const input = await jsonBody(c, z.object({ role: z.enum(ROLES).optional(), status: z.enum(USER_STATUSES).optional() }).strict());
    const target = await one<{ id: string; role: Role; status: string; handle: string }>(db, 'SELECT id, role, status, handle FROM users WHERE id = $1', [
        c.req.param('id'),
    ]);
    if (!target) throw notFound('User not found');
    if (target.id === staff.id) throw bad('You cannot change your own role or status');
    // moderators handle members: trust, suspend, reinstate. Admins do the rest.
    if (!isAdmin(staff)) {
        if (rank(target.role) >= rank('moderator')) throw forbidden('Only an admin can change staff accounts');
        if (input.role && rank(input.role) >= rank('moderator')) throw forbidden('Only an admin can make staff');
        if (input.status === 'banned' || (input.status && target.status === 'banned')) throw forbidden('Only an admin can ban or lift a ban');
    }
    const statements: Statement[] = [
        {
            text: 'UPDATE users SET role = coalesce($2, role), status = coalesce($3, status), updated_at = now() WHERE id = $1',
            params: [target.id, input.role ?? null, input.status ?? null],
        },
        auditStatement(staff.id, 'user.update', 'user', target.id, {
            handle: target.handle,
            ...(input.role ? { role: { from: target.role, to: input.role } } : {}),
            ...(input.status ? { status: { from: target.status, to: input.status } } : {}),
        }),
    ];
    if (input.status === 'banned') statements.push({ text: 'DELETE FROM sessions WHERE user_id = $1', params: [target.id] });
    await db.batch(statements);
    const row = await one(db, `SELECT u.*, (SELECT count(*)::int FROM posts p WHERE p.author_id = u.id) AS post_count FROM users u WHERE u.id = $1`, [
        target.id,
    ]);
    return c.json(adminUser(row!, isAdmin(staff)));
});

// --- audit ---

adminRoutes.get('/audit', async c => {
    requireAdmin(c);
    const { db } = c.get('deps');
    const q = parse(z.object({ cursor: cursorSchema }), c.req.query());
    const offset = Number(q.cursor ?? 0);
    const rows = await db.query(
        `SELECT l.*, u.id AS a_id, u.handle AS a_handle, u.display_name AS a_display_name, u.avatar_url AS a_avatar_url, u.role AS a_role
         FROM audit_log l LEFT JOIN users u ON u.id = l.actor_id ORDER BY l.created_at DESC, l.id DESC LIMIT 101 OFFSET $1`,
        [offset]
    );
    const items: AuditEntry[] = rows.slice(0, 100).map(r => ({
        id: String(r.id),
        actor: r.a_id ? userSummary(r, 'a_') : null,
        action: String(r.action),
        targetType: (r.target_type as string | null) ?? null,
        targetId: (r.target_id as string | null) ?? null,
        data: (typeof r.data === 'string' ? JSON.parse(r.data) : r.data) as Record<string, unknown>,
        createdAt: iso(r.created_at),
    }));
    const body: Page<AuditEntry> = { items, nextCursor: rows.length > 100 ? String(offset + 100) : null };
    return c.json(body);
});
