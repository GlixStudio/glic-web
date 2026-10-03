// End-to-end API tests: the real app on an in-process Postgres (PGlite) with
// the real migrations and an in-memory file store.

import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import type { CommentDto, Page, PostDetail, PostDto, SessionResponse } from '../../shared/api';
import { createApp } from '../app';
import { migrate, pgliteDb } from '../pglite';
import { memoryStore } from '../store';

// 2x1 RGBA PNG
const PNG = Uint8Array.from(
    atob('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR42mP4z8DwHwyBNAMAQXgH+fGxYEcAAAAASUVORK5CYII='),
    c => c.charCodeAt(0)
);
// enough of a ZIP to pass the sniffer: local header signature and the manifest's name
const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...new Array(26).fill(0), ...new TextEncoder().encode('project.json'), ...new Array(16).fill(0)]);

const pg = new PGlite();
const db = pgliteDb(pg);
const store = memoryStore();
const app = createApp(() => ({ db, store, secureCookies: false }));

/** a browser: keeps its session cookie between requests */
const client = () => {
    let cookie = '';
    const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
        const init: RequestInit = { method, headers: { ...headers, ...(cookie ? { cookie } : {}) } };
        if (body instanceof FormData) {
            // browsers send multipart with a length; the API requires one
            const encoded = new Response(body);
            const bytes = await encoded.arrayBuffer();
            init.body = bytes;
            Object.assign(init.headers as Record<string, string>, {
                'content-type': encoded.headers.get('content-type')!,
                'content-length': String(bytes.byteLength),
            });
        }
        else if (body !== undefined) {
            init.body = JSON.stringify(body);
            (init.headers as Record<string, string>)['content-type'] = 'application/json';
        }
        const res = await app.request(path, init);
        const set = res.headers.get('set-cookie');
        if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
        const text = await res.text();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tests poke at whatever came back
        let json: any = null;
        try {
            json = JSON.parse(text);
        } catch {
            json = text;
        }
        return { status: res.status, json, headers: res.headers };
    };
    return {
        get: (p: string) => call('GET', p),
        post: (p: string, b?: unknown, h?: Record<string, string>) => call('POST', p, b, h),
        patch: (p: string, b?: unknown) => call('PATCH', p, b),
        del: (p: string) => call('DELETE', p),
    };
};
type Client = ReturnType<typeof client>;

const signUp = async (handle: string, role?: string) => {
    // every test client shares one IP; the sign-up limit is not what these test
    await db.query('DELETE FROM rate_limits');
    const c = client();
    const r = await c.post('/api/auth/register', { email: `${handle}@example.com`, password: 'correct horse', handle });
    expect(r.status).toBe(201);
    if (role) await db.query('UPDATE users SET role = $2 WHERE handle = $1', [handle, role]);
    return c;
};

const upload = (c: Client, data: Record<string, unknown> = {}, files: Record<string, Uint8Array> = { primary: PNG, project: ZIP }) => {
    const form = new FormData();
    form.set('data', JSON.stringify({ title: 'glitch', ...data }));
    for (const [role, bytes] of Object.entries(files)) form.set(role, new File([bytes as Uint8Array<ArrayBuffer>], `${role}.bin`));
    return c.post('/api/posts', form);
};

const setSettings = (admin: Client, patch: Record<string, unknown>) => admin.patch('/api/admin/settings', patch);

/** an account old enough for its reports to count towards auto-hiding */
const veteran = async (handle: string) => {
    const c = await signUp(handle);
    await db.query(`UPDATE users SET created_at = now() - interval '30 days' WHERE handle = $1`, [handle]);
    return c;
};

const idOf = async (c: Client) => ((await c.get('/api/session')).json as SessionResponse).user!.id;

let admin: Client;

beforeAll(async () => {
    await migrate(pg);
    admin = await signUp('boss', 'admin');
});

describe('auth', () => {
    it('registers, keeps a session and signs out', async () => {
        const c = await signUp('alice');
        const s = (await c.get('/api/session')).json as SessionResponse;
        expect(s.user?.handle).toBe('alice');
        expect(s.user?.role).toBe('user');
        expect(s.settings.reactionEmojis.length).toBeGreaterThan(0);
        await c.post('/api/auth/logout');
        expect(((await c.get('/api/session')).json as SessionResponse).user).toBeNull();
    });

    it('refuses duplicate emails and handles, case-insensitively', async () => {
        await signUp('bob');
        const c = client();
        expect((await c.post('/api/auth/register', { email: 'BOB@example.com', password: 'xxxxxxxx', handle: 'bobby' })).status).toBe(409);
        expect((await c.post('/api/auth/register', { email: 'new@example.com', password: 'xxxxxxxx', handle: 'BOB' })).status).toBe(409);
        expect((await c.post('/api/auth/register', { email: 'x@example.com', password: 'short', handle: 'shorty' })).status).toBe(400);
        expect((await c.post('/api/auth/register', { email: 'y@example.com', password: 'xxxxxxxx', handle: 'admin' })).status).toBe(400);
    });

    it('logs in with the right password only', async () => {
        await signUp('carol');
        const c = client();
        expect((await c.post('/api/auth/login', { email: 'carol@example.com', password: 'wrong password' })).status).toBe(401);
        expect((await c.post('/api/auth/login', { email: 'nobody@example.com', password: 'whatever1' })).status).toBe(401);
        const ok = await c.post('/api/auth/login', { email: 'Carol@Example.com', password: 'correct horse' });
        expect(ok.status).toBe(200);
        expect(ok.json.user.handle).toBe('carol');
    });

    it('stores only a hash of the session token', async () => {
        const rows = await db.query<{ id: string }>('SELECT id FROM sessions LIMIT 1');
        expect(rows[0].id).toMatch(/^[0-9a-f]{64}$/);
    });

    it('refuses state changes from another origin', async () => {
        const c = await signUp('dave');
        const r = await c.post('/api/auth/logout', undefined, { origin: 'https://evil.example' });
        expect(r.status).toBe(403);
        expect(r.json.error).toBe('bad_origin');
    });

    it('stops password guessing on one account', async () => {
        await signUp('guessme');
        const c = client();
        let last = 0;
        for (let i = 0; i < 11; i++) last = (await c.post('/api/auth/login', { email: 'guessme@example.com', password: `wrong-${i}-pass` })).status;
        expect(last).toBe(429);
        // even the right password waits out the window
        expect((await c.post('/api/auth/login', { email: 'guessme@example.com', password: 'correct horse' })).status).toBe(429);
    });

    it('refuses cross-site requests flagged by fetch metadata', async () => {
        const c = await signUp('fetchmeta');
        expect((await c.post('/api/auth/logout', undefined, { 'sec-fetch-site': 'cross-site' })).status).toBe(403);
        expect((await c.post('/api/auth/logout', undefined, { 'sec-fetch-site': 'same-origin' })).status).toBe(200);
    });

    it('changes a password and signs other devices out', async () => {
        const a = await signUp('erin');
        const b = client();
        await b.post('/api/auth/login', { email: 'erin@example.com', password: 'correct horse' });
        expect((await a.post('/api/me/password', { currentPassword: 'nope', newPassword: 'battery staple' })).status).toBe(400);
        expect((await a.post('/api/me/password', { currentPassword: 'correct horse', newPassword: 'battery staple' })).status).toBe(200);
        expect(((await a.get('/api/session')).json as SessionResponse).user?.handle).toBe('erin');
        expect(((await b.get('/api/session')).json as SessionResponse).user).toBeNull();
    });

    it('updates the profile', async () => {
        const c = await signUp('frank');
        const r = await c.patch('/api/me', { displayName: 'Frank Glitch', bio: 'databender' });
        expect(r.json.user.displayName).toBe('Frank Glitch');
        expect((await c.patch('/api/me', { handle: 'alice' })).status).toBe(409);
    });
});

describe('posts', () => {
    it('publishes an upload, sniffing type and size from the bytes', async () => {
        const c = await signUp('gina');
        const r = await upload(c, { tags: ['Wavelet', 'wavelet', 'hwb'], metadata: { preset: 'sinc' } }, { primary: PNG, project: ZIP });
        expect(r.status).toBe(201);
        const post = r.json as PostDetail;
        expect(post.status).toBe('published');
        expect(post.kind).toBe('image');
        expect(post.tags).toEqual(['wavelet', 'hwb']);
        expect(post.hasProject).toBe(true);
        expect(post.primary).toMatchObject({ mime: 'image/png', width: 2, height: 1 });
        expect(post.metadata.preset).toBe('sinc');
        const media = await app.request(post.primary!.url);
        expect(media.status).toBe(200);
        expect(media.headers.get('content-type')).toBe('image/png');
        expect(new Uint8Array(await media.arrayBuffer())).toEqual(PNG);
        const part = await app.request(post.primary!.url, { headers: { range: 'bytes=0-7' } });
        expect(part.status).toBe(206);
        expect((await part.arrayBuffer()).byteLength).toBe(8);
    });

    it('rejects files that are not media, whatever they claim', async () => {
        const c = await signUp('hank');
        expect((await upload(c, {}, { primary: new TextEncoder().encode('<script>alert(1)</script>'), project: ZIP })).status).toBe(415);
        // the gallery is for GLIX Encoder stills: no GIFs, JPEGs or video
        const gif = new TextEncoder().encode('GIF89a' + '\0'.repeat(40));
        expect((await upload(c, {}, { primary: gif, project: ZIP })).status).toBe(415);
        const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(40).fill(0)]);
        expect((await upload(c, {}, { primary: jpeg, project: ZIP })).status).toBe(415);
        // and every post opens in the editor, so it carries a project
        expect((await upload(c, {}, { primary: PNG })).status).toBe(400);
        expect((await upload(c, {}, { primary: PNG, project: PNG })).status).toBe(415);
        // any zip is not a project: the site is not a file host
        expect((await upload(c, {}, { primary: PNG, project: new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...new Array(60).fill(7)]) })).status).toBe(415);
        expect((await upload(c, {}, {})).status).toBe(400);
        expect((await upload(client(), {}, { primary: PNG })).status).toBe(401);
        // a streamed body of unknown size is refused before it is buffered
        const form = new FormData();
        form.set('primary', new File([PNG], 'a.png'));
        const login = await app.request('/api/auth/login', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ email: 'hank@example.com', password: 'correct horse' }),
        });
        const sid = login.headers.get('set-cookie')!.split(';')[0];
        const streamed = await app.request('/api/posts', { method: 'POST', body: form, headers: { cookie: sid } });
        expect(streamed.status).toBe(411);
    });

    it('enforces the media size limit', async () => {
        const c = await signUp('ivan');
        await setSettings(admin, { maxMediaMB: 1 });
        const big = new Uint8Array(1024 * 1024 + 10);
        big.set(PNG);
        expect((await upload(c, {}, { primary: big })).status).toBe(413);
        await setSettings(admin, { maxMediaMB: 10 });
    });

    it('lists, filters and sorts the feed', async () => {
        const c = await signUp('judy');
        const a = (await upload(c, { title: 'first light', tags: ['dawn'] })).json as PostDetail;
        const b = (await upload(c, { title: 'second', tags: ['dusk'] })).json as PostDetail;
        await (await signUp('kim')).post('/api/reactions', { targetType: 'post', targetId: a.id, emoji: '🔥', active: true });

        const newest = (await client().get('/api/posts?sort=new&author=judy')).json as Page<PostDto>;
        expect(newest.items.map(p => p.id)).toEqual([b.id, a.id]);
        const top = (await client().get('/api/posts?sort=top&author=judy')).json as Page<PostDto>;
        expect(top.items[0].id).toBe(a.id);
        const tagged = (await client().get('/api/posts?tag=dusk')).json as Page<PostDto>;
        expect(tagged.items.map(p => p.id)).toEqual([b.id]);
        const search = (await client().get('/api/posts?q=light')).json as Page<PostDto>;
        expect(search.items.map(p => p.id)).toContain(a.id);
        const paged = (await client().get('/api/posts?author=judy&limit=1')).json as Page<PostDto>;
        expect(paged.items).toHaveLength(1);
        expect(paged.nextCursor).toBe('1');
        for (const sort of ['trending', 'discussed', 'old']) expect((await client().get(`/api/posts?sort=${sort}&window=week`)).status).toBe(200);
    });

    it('keeps private posts to their author', async () => {
        const c = await signUp('kyle');
        const p = (await upload(c, { visibility: 'private' })).json as PostDetail;
        expect((await client().get(`/api/posts/${p.id}`)).status).toBe(404);
        expect((await c.get(`/api/posts/${p.id}`)).status).toBe(200);
        expect((await admin.get(`/api/posts/${p.id}`)).status).toBe(200);
        const mine = (await c.get('/api/posts?mine=1')).json as Page<PostDto>;
        expect(mine.items.map(x => x.id)).toContain(p.id);
    });

    it('lets authors edit and delete, removing the files', async () => {
        const c = await signUp('lena');
        const other = await signUp('mallory');
        const p = (await upload(c)).json as PostDetail;
        expect((await other.patch(`/api/posts/${p.id}`, { title: 'pwned' })).status).toBe(403);
        expect(((await c.patch(`/api/posts/${p.id}`, { title: 'renamed' })).json as PostDetail).title).toBe('renamed');
        const key = p.primary!.url.slice('/media/'.length);
        expect(store.objects.has(key)).toBe(true);
        expect((await other.del(`/api/posts/${p.id}`)).status).toBe(403);
        expect((await c.del(`/api/posts/${p.id}`)).status).toBe(200);
        expect(store.objects.has(key)).toBe(false);
        expect((await c.get(`/api/posts/${p.id}`)).status).toBe(404);
    });
});

describe('reactions and comments', () => {
    it('toggles reactions and keeps counts exact', async () => {
        const author = await signUp('nina');
        const fan = await signUp('oscar');
        const p = (await upload(author)).json as PostDetail;
        const react = (emoji: string, active: boolean, who = fan) => who.post('/api/reactions', { targetType: 'post', targetId: p.id, emoji, active });
        await react('🔥', true);
        await react('🔥', true); // twice is still once
        await react('👾', true);
        const r = await react('🔥', true, author);
        expect(r.json.reactionCount).toBe(3);
        expect((await react('🍕', true)).status).toBe(400);
        await react('🔥', false);
        const detail = (await fan.get(`/api/posts/${p.id}`)).json as PostDetail;
        expect(detail.reactionCount).toBe(2);
        expect(detail.reactions).toEqual(expect.arrayContaining([{ emoji: '🔥', count: 1 }, { emoji: '👾', count: 1 }]));
        expect(detail.viewerReactions).toEqual(['👾']);
    });

    it('threads comments and soft-deletes them', async () => {
        const author = await signUp('pat');
        const fan = await signUp('quinn');
        const p = (await upload(author)).json as PostDetail;
        const top = (await fan.post(`/api/posts/${p.id}/comments`, { body: 'how did you get those bands?' })).json as CommentDto;
        const reply = await author.post(`/api/posts/${p.id}/comments`, { body: 'wavelet 92 + compression', parentId: top.id });
        expect(reply.status).toBe(201);
        expect((await fan.post(`/api/posts/${p.id}/comments`, { body: '   ' })).status).toBe(400);
        expect(((await client().get(`/api/posts/${p.id}`)).json as PostDetail).commentCount).toBe(2);
        expect((await author.patch(`/api/comments/${top.id}`, { body: 'edited' })).status).toBe(403);
        expect(((await fan.patch(`/api/comments/${top.id}`, { body: 'edited' })).json as CommentDto).editedAt).not.toBeNull();
        await fan.del(`/api/comments/${top.id}`);
        const list = (await client().get(`/api/posts/${p.id}/comments`)).json as { items: CommentDto[] };
        expect(list.items).toHaveLength(2);
        expect(list.items[0]).toMatchObject({ status: 'removed', body: '' });
        expect(((await client().get(`/api/posts/${p.id}`)).json as PostDetail).commentCount).toBe(1);
    });
});

describe('moderation', () => {
    it('holds posts for review and publishes them on approval', async () => {
        await setSettings(admin, { postModeration: 'review' });
        const c = await signUp('rita');
        const p = (await upload(c)).json as PostDetail;
        expect(p.status).toBe('pending');
        expect((await client().get(`/api/posts/${p.id}`)).status).toBe(404);
        expect((await c.get(`/api/posts/${p.id}`)).status).toBe(200);
        const queue = (await admin.get('/api/admin/queue/posts')).json as Page<PostDto>;
        expect(queue.items.map(x => x.id)).toContain(p.id);
        expect((await c.post(`/api/admin/posts/${p.id}/moderate`, { action: 'approve' })).status).toBe(403);
        await admin.post(`/api/admin/posts/${p.id}/moderate`, { action: 'approve', note: 'lovely' });
        const live = (await client().get(`/api/posts/${p.id}`)).json as PostDetail;
        expect(live.status).toBe('published');
        expect(live.publishedAt).not.toBeNull();
        await setSettings(admin, { postModeration: 'open' });
    });

    it('lets trusted members skip review in trusted mode', async () => {
        await setSettings(admin, { postModeration: 'trusted' });
        const member = await signUp('sam');
        const trusted = await signUp('tess', 'trusted');
        expect(((await upload(member)).json as PostDetail).status).toBe('pending');
        expect(((await upload(trusted)).json as PostDetail).status).toBe('published');
        await setSettings(admin, { postModeration: 'closed' });
        expect((await upload(trusted)).status).toBe(403);
        await setSettings(admin, { postModeration: 'open' });
    });

    it('hides a post once enough people report it', async () => {
        await setSettings(admin, { autoHideReports: 2 });
        const c = await signUp('uma');
        const p = (await upload(c)).json as PostDetail;
        await (await veteran('vic')).post('/api/reports', { targetType: 'post', targetId: p.id, reason: 'spam' });
        expect(((await client().get(`/api/posts/${p.id}`)).json as PostDetail).status).toBe('published');
        await (await veteran('walt')).post('/api/reports', { targetType: 'post', targetId: p.id, reason: 'spam' });
        expect((await client().get(`/api/posts/${p.id}`)).status).toBe(404);
        // its files go dark with it, except for the author
        const key = p.primary!.url;
        expect((await app.request(key)).status).toBe(404);
        expect((await c.get(key)).status).toBe(200);
        const reports = (await admin.get('/api/admin/reports')).json;
        expect(reports.items.filter((r: { targetId: string }) => r.targetId === p.id)).toHaveLength(2);
        await admin.post(`/api/admin/posts/${p.id}/moderate`, { action: 'restore' });
        expect((await client().get(`/api/posts/${p.id}`)).status).toBe(200);
        const open = (await admin.get('/api/admin/reports')).json;
        expect(open.items.filter((r: { targetId: string }) => r.targetId === p.id)).toHaveLength(0);
    });

    it('does not let fresh sock puppets hide work', async () => {
        await setSettings(admin, { autoHideReports: 2 });
        const p = (await upload(await signUp('wren'))).json as PostDetail;
        for (const h of ['sock1', 'sock2', 'sock3']) await (await signUp(h)).post('/api/reports', { targetType: 'post', targetId: p.id, reason: 'spam' });
        expect(((await client().get(`/api/posts/${p.id}`)).json as PostDetail).status).toBe('published');
        // nor can anyone hide staff work by reporting it
        const staffPost = (await upload(admin)).json as PostDetail;
        for (const h of ['old1', 'old2']) await (await veteran(h)).post('/api/reports', { targetType: 'post', targetId: staffPost.id, reason: 'spam' });
        expect(((await client().get(`/api/posts/${staffPost.id}`)).json as PostDetail).status).toBe('published');
    });

    it('sends edits of approved posts and comments back to review', async () => {
        await setSettings(admin, { postModeration: 'review', commentModeration: 'review' });
        const c = await signUp('yara');
        const p = (await upload(c)).json as PostDetail;
        await admin.post(`/api/admin/posts/${p.id}/moderate`, { action: 'approve' });
        expect(((await c.patch(`/api/posts/${p.id}`, { visibility: 'unlisted' })).json as PostDetail).status).toBe('published');
        expect(((await c.patch(`/api/posts/${p.id}`, { title: 'now with spam' })).json as PostDetail).status).toBe('pending');
        await admin.post(`/api/admin/posts/${p.id}/moderate`, { action: 'approve' });
        const cm = (await c.post(`/api/posts/${p.id}/comments`, { body: 'hello' })).json as CommentDto;
        await admin.post(`/api/admin/comments/${cm.id}/moderate`, { action: 'approve' });
        expect(((await c.patch(`/api/comments/${cm.id}`, { body: 'buy pills' })).json as CommentDto).status).toBe('pending');
        await setSettings(admin, { postModeration: 'open', commentModeration: 'open' });
    });

    it('closes the gallery to visitors', async () => {
        await setSettings(admin, { galleryAccess: 'members' });
        expect((await client().get('/api/posts')).status).toBe(403);
        expect((await (await signUp('xena')).get('/api/posts')).status).toBe(200);
        await setSettings(admin, { galleryAccess: 'staff' });
        expect((await (await signUp('yuri')).get('/api/posts')).status).toBe(403);
        expect((await admin.get('/api/posts')).status).toBe(200);
        await setSettings(admin, { galleryAccess: 'public' });
    });

    it('closes registration', async () => {
        await setSettings(admin, { registration: 'closed' });
        const r = await client().post('/api/auth/register', { email: 'late@example.com', password: 'xxxxxxxx', handle: 'late' });
        expect(r.status).toBe(403);
        await setSettings(admin, { registration: 'open' });
    });

    it('validates settings and keeps them admin-only', async () => {
        expect((await setSettings(admin, { postModeration: 'anarchy' })).status).toBe(400);
        expect((await setSettings(admin, { unknownKey: 1 })).status).toBe(400);
        const mod = await signUp('zed', 'moderator');
        expect((await mod.patch('/api/admin/settings', { registration: 'closed' })).status).toBe(403);
        expect((await mod.get('/api/admin/stats')).status).toBe(200);
    });

    it('scopes what moderators can do to users', async () => {
        const mod = await signUp('mona', 'moderator');
        const member = await signUp('ned');
        const nedId = ((await member.get('/api/session')).json as SessionResponse).user!.id;
        const modId = ((await mod.get('/api/session')).json as SessionResponse).user!.id;
        expect((await mod.patch(`/api/admin/users/${nedId}`, { role: 'trusted' })).status).toBe(200);
        expect((await mod.patch(`/api/admin/users/${nedId}`, { role: 'admin' })).status).toBe(403);
        expect((await mod.patch(`/api/admin/users/${nedId}`, { status: 'banned' })).status).toBe(403);
        expect((await mod.patch(`/api/admin/users/${modId}`, { status: 'active' })).status).toBe(400);
        expect((await mod.patch(`/api/admin/users/${nedId}`, { status: 'suspended' })).status).toBe(200);
        expect((await upload(member)).status).toBe(403);
        expect((await admin.patch(`/api/admin/users/${nedId}`, { status: 'banned' })).status).toBe(200);
        expect(((await member.get('/api/session')).json as SessionResponse).user).toBeNull();
        expect((await member.post('/api/auth/login', { email: 'ned@example.com', password: 'correct horse' })).status).toBe(403);
    });

    it('takes powers away from suspended staff and keeps bans with admins', async () => {
        const mod = await signUp('otto', 'moderator');
        const member = await signUp('pia');
        const piaId = await idOf(member);
        await admin.patch(`/api/admin/users/${piaId}`, { status: 'banned' });
        expect((await mod.patch(`/api/admin/users/${piaId}`, { status: 'active' })).status).toBe(403);
        await admin.patch(`/api/admin/users/${await idOf(mod)}`, { status: 'suspended' });
        expect((await mod.get('/api/admin/stats')).status).toBe(403);
        expect((await mod.patch('/api/me', { bio: 'still here' })).status).toBe(403);
    });

    it('shows member emails to admins only', async () => {
        const mod = await signUp('quill', 'moderator');
        const asMod = (await mod.get('/api/admin/users?q=quill')).json;
        expect(asMod.items[0].email).toBe('');
        expect((await mod.get('/api/admin/users?q=example.com')).json.items).toHaveLength(0);
        const asAdmin = (await admin.get('/api/admin/users?q=quill')).json;
        expect(asAdmin.items[0].email).toBe('quill@example.com');
    });

    it('hides banned members’ work and 404s malformed media paths', async () => {
        const c = await signUp('rex');
        const p = (await upload(c)).json as PostDetail;
        await admin.patch(`/api/admin/users/${await idOf(c)}`, { status: 'banned' });
        expect((await client().get(`/api/posts/${p.id}`)).status).toBe(404);
        expect(((await client().get('/api/posts?author=rex')).json as Page<PostDto>).items).toHaveLength(0);
        expect((await app.request(p.primary!.url)).status).toBe(404);
        expect((await app.request('/media/posts/%E0')).status).toBe(404);
    });

    it('records staff actions in the audit log', async () => {
        const log = (await admin.get('/api/admin/audit')).json;
        const actions = log.items.map((e: { action: string }) => e.action);
        expect(actions).toEqual(expect.arrayContaining(['settings.update', 'post.approve', 'post.auto_hide', 'user.update']));
    });
});
