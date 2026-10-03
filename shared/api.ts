// Shapes the community API sends and accepts, shared by the Worker (server/)
// and the browser client (src/social/).

export const ROLES = ['user', 'trusted', 'moderator', 'admin'] as const;
export type Role = (typeof ROLES)[number];
export const USER_STATUSES = ['active', 'suspended', 'banned'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

// GLIX Encoder stills for now; other GLIX apps' kinds join here later
export const POST_KINDS = ['image'] as const;
export type PostKind = (typeof POST_KINDS)[number];
export const POST_STATUSES = ['draft', 'pending', 'published', 'rejected', 'hidden', 'removed'] as const;
export type PostStatus = (typeof POST_STATUSES)[number];
export const VISIBILITIES = ['public', 'unlisted', 'private'] as const;
export type Visibility = (typeof VISIBILITIES)[number];
export type CommentStatus = 'pending' | 'published' | 'hidden' | 'removed';

export const ASSET_ROLES = ['primary', 'preview', 'project'] as const;
export type AssetRole = (typeof ASSET_ROLES)[number];

export const SORTS = ['new', 'trending', 'top', 'discussed', 'old'] as const;
export type Sort = (typeof SORTS)[number];
export const WINDOWS = ['day', 'week', 'month', 'year', 'all'] as const;
export type TimeWindow = (typeof WINDOWS)[number];

/** who may publish/comment without review */
export const MODERATION_MODES = ['open', 'trusted', 'review', 'closed'] as const;
export type ModerationMode = (typeof MODERATION_MODES)[number];
/** who may see the gallery at all */
export const GALLERY_ACCESS = ['public', 'members', 'staff'] as const;
export type GalleryAccess = (typeof GALLERY_ACCESS)[number];

export interface Settings {
    registration: 'open' | 'closed';
    galleryAccess: GalleryAccess;
    postModeration: ModerationMode;
    commentModeration: ModerationMode;
    /** open reports that hide a published post until a moderator looks; 0 = never */
    autoHideReports: number;
    /** largest media file accepted, after client-side conversion */
    maxMediaMB: number;
    /** still images above this are converted to WebP before upload */
    targetMediaMB: number;
    maxProjectMB: number;
    postsPerDay: number;
    commentsPerHour: number;
    reactionEmojis: string[];
    /** shown on top of the gallery when set */
    announcement: string;
}

export interface UserSummary {
    id: string;
    handle: string;
    displayName: string;
    avatarUrl: string | null;
    role: Role;
}

export interface Me extends UserSummary {
    email: string;
    bio: string;
    status: UserStatus;
    createdAt: string;
}

export interface Profile extends UserSummary {
    bio: string;
    createdAt: string;
    postCount: number;
}

export interface AssetDto {
    id: string;
    role: AssetRole;
    url: string;
    mime: string;
    bytes: number;
    width: number | null;
    height: number | null;
    durationMs: number | null;
    metadata: Record<string, unknown>;
}

export interface ReactionCount {
    emoji: string;
    count: number;
}

export interface PostDto {
    id: string;
    kind: PostKind;
    title: string;
    body: string;
    status: PostStatus;
    visibility: Visibility;
    tags: string[];
    metadata: Record<string, unknown>;
    author: UserSummary;
    /** what grids show: the preview rendition, else the primary file */
    cover: AssetDto | null;
    primary: AssetDto | null;
    hasProject: boolean;
    reactionCount: number;
    commentCount: number;
    viewCount: number;
    createdAt: string;
    publishedAt: string | null;
    /** author and staff only */
    moderationNote?: string | null;
}

export interface PostDetail extends PostDto {
    assets: AssetDto[];
    reactions: ReactionCount[];
    viewerReactions: string[];
}

export interface CommentDto {
    id: string;
    postId: string;
    parentId: string | null;
    body: string;
    status: CommentStatus;
    author: UserSummary;
    reactions: ReactionCount[];
    viewerReactions: string[];
    createdAt: string;
    editedAt: string | null;
}

export interface Page<T> {
    items: T[];
    nextCursor: string | null;
}

export interface SessionResponse {
    user: Me | null;
    settings: Settings;
}

export interface ReportDto {
    id: string;
    targetType: 'post' | 'comment' | 'user';
    targetId: string;
    reason: string;
    details: string;
    status: 'open' | 'resolved' | 'dismissed';
    resolution: string | null;
    reporter: UserSummary | null;
    createdAt: string;
    /** what the report points at, if it still exists */
    target: { title: string; url: string | null; status: string | null } | null;
}

export interface AdminUser extends Me {
    lastSeenAt: string | null;
    postCount: number;
}

export interface AuditEntry {
    id: string;
    actor: UserSummary | null;
    action: string;
    targetType: string | null;
    targetId: string | null;
    data: Record<string, unknown>;
    createdAt: string;
}

export interface AdminStats {
    users: number;
    posts: Record<string, number>;
    pendingComments: number;
    openReports: number;
}

export const REPORT_REASONS = ['spam', 'nsfw', 'harassment', 'copyright', 'other'] as const;

export interface ApiError {
    error: string;
    message: string;
}
