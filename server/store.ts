// Where uploaded files live. Production uses the R2 bucket Infrapad provisions,
// reached over its S3 API with the scoped token Infrapad issues (so no bucket
// name is pinned in wrangler config); the dev server keeps files in memory or
// on disk.

import { AwsClient } from 'aws4fetch';

export interface StoredObject {
    body: ReadableStream | Uint8Array;
    contentType: string;
    /** bytes in this response (the slice, for a range) */
    size: number | null;
    etag: string | null;
    /** 'bytes a-b/total' when a range was served */
    contentRange: string | null;
}

export interface BlobStore {
    put(key: string, body: Uint8Array, contentType: string): Promise<void>;
    /** range is an HTTP Range header value; video players (Safari) need it */
    get(key: string, range?: string | null): Promise<StoredObject | null>;
    delete(keys: string[]): Promise<void>;
}

export interface R2Config {
    endpoint: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
}

export const r2Store = (cfg: R2Config): BlobStore => {
    const aws = new AwsClient({
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
        service: 's3',
        region: 'auto',
    });
    const base = `${cfg.endpoint.replace(/\/+$/, '')}/${cfg.bucket}`;
    const url = (key: string) => `${base}/${key.split('/').map(encodeURIComponent).join('/')}`;
    return {
        async put(key, body, contentType) {
            const res = await aws.fetch(url(key), {
                method: 'PUT',
                body,
                headers: { 'content-type': contentType, 'content-length': String(body.byteLength) },
            });
            if (!res.ok) throw new Error(`storage put failed: ${res.status} ${await res.text()}`);
        },
        async get(key, range) {
            const res = await aws.fetch(url(key), range ? { headers: { range } } : undefined);
            if (res.status === 404) return null;
            if (!res.ok || !res.body) throw new Error(`storage get failed: ${res.status}`);
            const size = res.headers.get('content-length');
            return {
                body: res.body,
                contentType: res.headers.get('content-type') ?? 'application/octet-stream',
                size: size ? Number(size) : null,
                etag: res.headers.get('etag'),
                contentRange: res.status === 206 ? res.headers.get('content-range') : null,
            };
        },
        async delete(keys) {
            await Promise.all(
                keys.map(async k => {
                    const res = await aws.fetch(url(k), { method: 'DELETE' });
                    if (!res.ok && res.status !== 404) throw new Error(`storage delete failed: ${res.status}`);
                })
            );
        },
    };
};

export const memoryStore = (): BlobStore & { objects: Map<string, { body: Uint8Array; contentType: string }> } => {
    const objects = new Map<string, { body: Uint8Array; contentType: string }>();
    return {
        objects,
        async put(key, body, contentType) {
            objects.set(key, { body: body.slice(), contentType });
        },
        async get(key, range) {
            const o = objects.get(key);
            if (!o) return null;
            const total = o.body.byteLength;
            const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;
            if (m && (m[1] || m[2])) {
                const start = m[1] ? Number(m[1]) : Math.max(0, total - Number(m[2]));
                const end = m[1] && m[2] ? Math.min(total - 1, Number(m[2])) : total - 1;
                const body = o.body.subarray(start, end + 1);
                return { body, contentType: o.contentType, size: body.byteLength, etag: null, contentRange: `bytes ${start}-${end}/${total}` };
            }
            return { body: o.body, contentType: o.contentType, size: total, etag: null, contentRange: null };
        },
        async delete(keys) {
            for (const k of keys) objects.delete(k);
        },
    };
};
