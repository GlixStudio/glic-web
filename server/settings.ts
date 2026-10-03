// Admin switches with their defaults. Only keys an admin changed are stored;
// everything else reads from DEFAULTS, so new switches need no migration.

import { GALLERY_ACCESS, MODERATION_MODES, type Settings } from '../shared/api';
import type { Db } from './db';
import { z } from 'zod';

export const DEFAULT_SETTINGS: Settings = {
    registration: 'open',
    galleryAccess: 'public',
    postModeration: 'open',
    commentModeration: 'open',
    autoHideReports: 3,
    maxMediaMB: 10,
    targetMediaMB: 8,
    maxProjectMB: 25,
    postsPerDay: 30,
    commentsPerHour: 60,
    reactionEmojis: ['🔥', '❤️', '🤯', '👾', '✨', '🌀', '👀', '😂'],
    announcement: '',
};

export const settingsPatchSchema = z
    .object({
        registration: z.enum(['open', 'closed']),
        galleryAccess: z.enum(GALLERY_ACCESS),
        postModeration: z.enum(MODERATION_MODES),
        commentModeration: z.enum(MODERATION_MODES),
        autoHideReports: z.number().int().min(0).max(100),
        // a Worker accepts request bodies up to 100 MB
        maxMediaMB: z.number().min(1).max(90),
        targetMediaMB: z.number().min(0.5).max(90),
        maxProjectMB: z.number().min(1).max(90),
        postsPerDay: z.number().int().min(0).max(10_000),
        commentsPerHour: z.number().int().min(0).max(10_000),
        reactionEmojis: z.array(z.string().min(1).max(16)).min(1).max(24),
        announcement: z.string().max(500),
    })
    .partial()
    .strict();

export const loadSettings = async (db: Db): Promise<Settings> => {
    const rows = await db.query<{ key: string; value: unknown }>('SELECT key, value FROM settings');
    const out: Settings = { ...DEFAULT_SETTINGS };
    const parsed = settingsPatchSchema.safeParse(Object.fromEntries(rows.map(r => [r.key, r.value])));
    if (parsed.success) Object.assign(out, parsed.data);
    else for (const r of rows) {
        // keep every stored key that is still valid on its own
        const one = settingsPatchSchema.safeParse({ [r.key]: r.value });
        if (one.success) Object.assign(out, one.data);
    }
    if (out.targetMediaMB > out.maxMediaMB) out.targetMediaMB = out.maxMediaMB;
    return out;
};
