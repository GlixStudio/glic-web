// Database rows to API shapes.

import type { AssetDto, AssetRole, Me, PostDto, PostKind, PostStatus, ReactionCount, Role, UserSummary, Visibility } from '../shared/api';
import type { Db, Row } from './db';
import { iso, isoOrNull } from './db';
import type { SessionUser } from './core';

export const mediaUrl = (key: string) => `/media/${key}`;

const json = (v: unknown): Record<string, unknown> => {
    if (v == null) return {};
    if (typeof v === 'string') {
        try {
            return JSON.parse(v);
        } catch {
            return {};
        }
    }
    return v as Record<string, unknown>;
};

/** a user from columns named with a prefix, e.g. a_handle from a join */
export const userSummary = (r: Row, prefix = ''): UserSummary => ({
    id: String(r[`${prefix}id`]),
    handle: String(r[`${prefix}handle`]),
    displayName: String(r[`${prefix}display_name`] ?? ''),
    avatarUrl: (r[`${prefix}avatar_url`] as string | null) ?? null,
    role: r[`${prefix}role`] as Role,
});

export const meDto = (u: SessionUser): Me => ({
    id: u.id,
    handle: u.handle,
    displayName: u.display_name,
    avatarUrl: u.avatar_url,
    role: u.role,
    email: u.email,
    bio: u.bio,
    status: u.status,
    createdAt: iso(u.created_at),
});

export const assetDto = (r: Row): AssetDto => ({
    id: String(r.id),
    role: r.role as AssetRole,
    url: mediaUrl(String(r.storage_key)),
    mime: String(r.mime),
    bytes: Number(r.bytes),
    width: r.width == null ? null : Number(r.width),
    height: r.height == null ? null : Number(r.height),
    durationMs: r.duration_ms == null ? null : Number(r.duration_ms),
    metadata: json(r.metadata),
});

/** columns a post query selects for postDto */
export const POST_COLUMNS = `p.*, u.id AS a_id, u.handle AS a_handle, u.display_name AS a_display_name,
    u.avatar_url AS a_avatar_url, u.role AS a_role, u.status AS a_status,
    EXISTS (SELECT 1 FROM assets x WHERE x.post_id = p.id AND x.role = 'project') AS has_project`;

export const postDto = (r: Row, assets: AssetDto[], withModeration: boolean): PostDto => {
    const primary = assets.find(a => a.role === 'primary') ?? null;
    const preview = assets.find(a => a.role === 'preview') ?? null;
    return {
        id: String(r.id),
        kind: r.kind as PostKind,
        title: String(r.title),
        body: String(r.body),
        status: r.status as PostStatus,
        visibility: r.visibility as Visibility,
        tags: (r.tags as string[]) ?? [],
        metadata: json(r.metadata),
        author: userSummary(r, 'a_'),
        cover: preview ?? (primary && primary.mime.startsWith('image/') ? primary : null),
        primary,
        hasProject: !!r.has_project,
        reactionCount: Number(r.reaction_count),
        commentCount: Number(r.comment_count),
        viewCount: Number(r.view_count),
        createdAt: iso(r.created_at),
        publishedAt: isoOrNull(r.published_at),
        ...(withModeration ? { moderationNote: (r.moderation_note as string | null) ?? null } : {}),
    };
};

/** primary + preview assets for a page of posts, grouped by post */
export const coverAssets = async (db: Db, postIds: string[]): Promise<Map<string, AssetDto[]>> => {
    const out = new Map<string, AssetDto[]>();
    if (!postIds.length) return out;
    const rows = await db.query(
        `SELECT * FROM assets WHERE post_id = ANY($1::text[]) AND role IN ('primary', 'preview') ORDER BY position`,
        [postIds]
    );
    for (const r of rows) {
        const list = out.get(String(r.post_id)) ?? [];
        list.push(assetDto(r));
        out.set(String(r.post_id), list);
    }
    return out;
};

/** emoji counts and the viewer's own emoji, per target */
export const reactionSummaries = async (
    db: Db,
    targetType: 'post' | 'comment',
    ids: string[],
    viewerId: string | null
): Promise<Map<string, { reactions: ReactionCount[]; viewerReactions: string[] }>> => {
    const out = new Map<string, { reactions: ReactionCount[]; viewerReactions: string[] }>();
    for (const id of ids) out.set(id, { reactions: [], viewerReactions: [] });
    if (!ids.length) return out;
    const rows = await db.query<{ target_id: string; emoji: string; count: number; mine: boolean }>(
        `SELECT target_id, emoji, count(*)::int AS count, bool_or(user_id = $3) AS mine
         FROM reactions WHERE target_type = $1 AND target_id = ANY($2::text[])
         GROUP BY target_id, emoji ORDER BY count(*) DESC, min(created_at)`,
        [targetType, ids, viewerId ?? '']
    );
    for (const r of rows) {
        const s = out.get(r.target_id)!;
        s.reactions.push({ emoji: r.emoji, count: Number(r.count) });
        if (r.mine) s.viewerReactions.push(r.emoji);
    }
    return out;
};
