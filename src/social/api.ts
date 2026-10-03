// Browser client for the community API (/api on the same origin).

import type {
    AdminStats,
    AdminUser,
    AuditEntry,
    CommentDto,
    Me,
    Page,
    PostDetail,
    PostDto,
    Profile,
    ReactionCount,
    ReportDto,
    Role,
    SessionResponse,
    Settings,
    Sort,
    TimeWindow,
    UserStatus,
    Visibility,
} from '../../shared/api';

export class ApiError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message: string) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

const request = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    let res: Response;
    try {
        res = await fetch(`/api${path}`, {
            method,
            credentials: 'same-origin',
            headers: body === undefined ? {} : { 'content-type': 'application/json' },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
    } catch {
        throw new ApiError(0, 'offline', 'Could not reach the server - check your connection');
    }
    const text = await res.text();
    let data: unknown = null;
    try {
        data = text ? JSON.parse(text) : null;
    } catch {
        // an HTML error page from a proxy or the static host
    }
    if (!res.ok) {
        const e = data as { error?: string; message?: string } | null;
        throw new ApiError(res.status, e?.error ?? 'http_error', e?.message ?? `Request failed (${res.status})`);
    }
    return data as T;
};

const qs = (params: Record<string, string | number | boolean | undefined | null>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '' && v !== false) u.set(k, String(v));
    const s = u.toString();
    return s ? `?${s}` : '';
};

export interface FeedQuery {
    sort?: Sort;
    window?: TimeWindow;
    tag?: string;
    author?: string;
    q?: string;
    mine?: boolean;
    cursor?: string | null;
    limit?: number;
}

export interface UploadFile {
    blob: Blob;
    name: string;
    width?: number;
    height?: number;
    durationMs?: number;
    metadata?: Record<string, unknown>;
}

export interface NewPost {
    title: string;
    body: string;
    tags: string[];
    visibility: Visibility;
    metadata: Record<string, unknown>;
    primary: UploadFile;
    preview?: UploadFile;
    project?: UploadFile;
}

/** multipart upload with progress (fetch cannot report upload progress) */
const uploadPost = (post: NewPost, onProgress?: (fraction: number) => void): Promise<PostDetail> =>
    new Promise((resolve, reject) => {
        const form = new FormData();
        const assets: Record<string, unknown> = {};
        for (const role of ['primary', 'preview', 'project'] as const) {
            const f = post[role];
            if (!f) continue;
            form.set(role, f.blob, f.name);
            assets[role] = { width: f.width, height: f.height, durationMs: f.durationMs, metadata: f.metadata };
        }
        form.set(
            'data',
            JSON.stringify({ title: post.title, body: post.body, tags: post.tags, visibility: post.visibility, metadata: post.metadata, assets })
        );
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/posts');
        xhr.withCredentials = true;
        xhr.upload.onprogress = e => e.lengthComputable && onProgress?.(e.loaded / e.total);
        xhr.onload = () => {
            let data: { error?: string; message?: string } | null = null;
            try {
                data = JSON.parse(xhr.responseText);
            } catch {
                // not JSON
            }
            if (xhr.status >= 200 && xhr.status < 300) resolve(data as unknown as PostDetail);
            else reject(new ApiError(xhr.status, data?.error ?? 'http_error', data?.message ?? `Upload failed (${xhr.status})`));
        };
        xhr.onerror = () => reject(new ApiError(0, 'offline', 'Upload failed - check your connection'));
        xhr.send(form);
    });

export const api = {
    session: () => request<SessionResponse>('GET', '/session'),
    register: (email: string, password: string, handle: string) => request<{ user: Me }>('POST', '/auth/register', { email, password, handle }),
    login: (email: string, password: string) => request<{ user: Me }>('POST', '/auth/login', { email, password }),
    logout: () => request<{ ok: true }>('POST', '/auth/logout'),
    updateMe: (patch: { handle?: string; displayName?: string; bio?: string }) => request<{ user: Me }>('PATCH', '/me', patch),
    changePassword: (currentPassword: string, newPassword: string) => request<{ ok: true }>('POST', '/me/password', { currentPassword, newPassword }),

    feed: (q: FeedQuery) => request<Page<PostDto>>('GET', `/posts${qs({ ...q })}`),
    post: (id: string) => request<PostDetail>('GET', `/posts/${encodeURIComponent(id)}`),
    createPost: uploadPost,
    updatePost: (id: string, patch: { title?: string; body?: string; tags?: string[]; visibility?: Visibility }) =>
        request<PostDetail>('PATCH', `/posts/${encodeURIComponent(id)}`, patch),
    deletePost: (id: string) => request<{ ok: true }>('DELETE', `/posts/${encodeURIComponent(id)}`),

    react: (targetType: 'post' | 'comment', targetId: string, emoji: string, active: boolean) =>
        request<{ reactions: ReactionCount[]; viewerReactions: string[]; reactionCount: number }>('POST', '/reactions', {
            targetType,
            targetId,
            emoji,
            active,
        }),

    comments: (postId: string) => request<{ items: CommentDto[] }>('GET', `/posts/${encodeURIComponent(postId)}/comments`),
    addComment: (postId: string, body: string, parentId?: string | null) =>
        request<CommentDto>('POST', `/posts/${encodeURIComponent(postId)}/comments`, { body, parentId }),
    editComment: (id: string, body: string) => request<CommentDto>('PATCH', `/comments/${encodeURIComponent(id)}`, { body }),
    deleteComment: (id: string) => request<{ ok: true }>('DELETE', `/comments/${encodeURIComponent(id)}`),

    report: (targetType: 'post' | 'comment' | 'user', targetId: string, reason: string, details: string) =>
        request<{ ok: true }>('POST', '/reports', { targetType, targetId, reason, details }),

    profile: (handle: string) => request<Profile>('GET', `/users/${encodeURIComponent(handle)}`),

    admin: {
        stats: () => request<AdminStats>('GET', '/admin/stats'),
        settings: () => request<{ settings: Settings; defaults: Settings }>('GET', '/admin/settings'),
        updateSettings: (patch: Partial<Settings>) => request<{ settings: Settings; defaults: Settings }>('PATCH', '/admin/settings', patch),
        postQueue: (status: 'pending' | 'hidden' | 'rejected' | 'removed', cursor?: string | null) =>
            request<Page<PostDto>>('GET', `/admin/queue/posts${qs({ status, cursor })}`),
        moderatePost: (id: string, action: 'approve' | 'restore' | 'reject' | 'hide' | 'remove', note = '') =>
            request<{ ok: true; status: string }>('POST', `/admin/posts/${encodeURIComponent(id)}/moderate`, { action, note }),
        commentQueue: (status: 'pending' | 'hidden', cursor?: string | null) =>
            request<Page<QueuedComment>>('GET', `/admin/queue/comments${qs({ status, cursor })}`),
        moderateComment: (id: string, action: 'approve' | 'restore' | 'hide' | 'remove') =>
            request<{ ok: true; status: string }>('POST', `/admin/comments/${encodeURIComponent(id)}/moderate`, { action }),
        reports: (status: 'open' | 'resolved' | 'dismissed', cursor?: string | null) =>
            request<Page<ReportDto>>('GET', `/admin/reports${qs({ status, cursor })}`),
        resolveReport: (id: string, status: 'resolved' | 'dismissed', resolution = '') =>
            request<{ ok: true }>('POST', `/admin/reports/${encodeURIComponent(id)}`, { status, resolution }),
        users: (q: { q?: string; role?: Role; status?: UserStatus; cursor?: string | null }) =>
            request<Page<AdminUser>>('GET', `/admin/users${qs(q)}`),
        updateUser: (id: string, patch: { role?: Role; status?: UserStatus }) => request<AdminUser>('PATCH', `/admin/users/${encodeURIComponent(id)}`, patch),
        audit: (cursor?: string | null) => request<Page<AuditEntry>>('GET', `/admin/audit${qs({ cursor })}`),
    },
};

export interface QueuedComment {
    id: string;
    postId: string;
    postTitle: string;
    body: string;
    status: string;
    author: PostDto['author'];
    createdAt: string;
}
