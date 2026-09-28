// Runs MediaPipe's interactive segmenter ("magic touch") off the main thread.
// The worker keeps the current image, so each click only sends a point.

import { FilesetResolver, InteractiveSegmenterLegacy } from '@mediapipe/tasks-vision';
import { MEDIAPIPE_VERSION, MODEL_URL, MODEL_BYTES, confidenceToMask } from '../core/objectSelectShared';

const WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const CACHE_NAME = 'glic-models-v1';

type In =
    | { type: 'load' }
    | { type: 'image'; id: number; width: number; height: number; data: ArrayBuffer }
    | { type: 'segment'; id: number; points: { x: number; y: number }[] };

const post = (msg: unknown, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(msg, transfer);

const fetchModel = async (): Promise<Uint8Array> => {
    let cache: Cache | null = null;
    try {
        cache = await caches.open(CACHE_NAME);
        const hit = await cache.match(MODEL_URL);
        if (hit) return new Uint8Array(await hit.arrayBuffer());
    } catch {
        cache = null; // no Cache Storage: plain fetch every session
    }
    const res = await fetch(MODEL_URL);
    if (!res.ok || !res.body) throw new Error(`model download failed (${res.status})`);
    const total = Number(res.headers.get('content-length')) || MODEL_BYTES;
    const reader = res.body.getReader();
    const parts: Uint8Array[] = [];
    let loaded = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value);
        loaded += value.length;
        post({ type: 'progress', fraction: Math.min(0.99, loaded / total) });
    }
    const buf = new Uint8Array(loaded);
    let o = 0;
    for (const p of parts) {
        buf.set(p, o);
        o += p.length;
    }
    try {
        await cache?.put(MODEL_URL, new Response(buf.slice(), { headers: { 'content-type': 'application/octet-stream' } }));
    } catch {
        /* over quota: it downloads again next session */
    }
    return buf;
};

let segmenter: Promise<InteractiveSegmenterLegacy> | null = null;
const getSegmenter = () => {
    if (!segmenter) {
        segmenter = (async () => {
            const [fileset, model] = await Promise.all([FilesetResolver.forVisionTasks(WASM_BASE, true), fetchModel()]);
            return InteractiveSegmenterLegacy.createFromOptions(fileset, {
                // tasks-vision 1.0.1's legacy tasks reject modelAssetBuffer ("ExternalFile must
                // specify...") but load the same bytes fine from a blob URL
                baseOptions: { modelAssetPath: URL.createObjectURL(new Blob([model.buffer as ArrayBuffer])), delegate: 'CPU' },
                canvas: new OffscreenCanvas(1, 1),
                outputConfidenceMasks: true,
                outputCategoryMask: false,
            });
        })().catch(e => {
            segmenter = null;
            throw e;
        });
    }
    return segmenter;
};

let image: ImageData | null = null;

self.onmessage = async (e: MessageEvent<In>) => {
    const msg = e.data;
    try {
        if (msg.type === 'load') {
            await getSegmenter();
            post({ type: 'ready' });
        } else if (msg.type === 'image') {
            image = new ImageData(new Uint8ClampedArray(msg.data), msg.width, msg.height);
            post({ type: 'ok', id: msg.id });
        } else if (msg.type === 'segment') {
            const seg = await getSegmenter();
            if (!image) throw new Error('no image');
            const roi = msg.points.length === 1 ? { keypoint: msg.points[0] } : { scribble: msg.points };
            let out: { data: Uint8ClampedArray; width: number; height: number } | null = null;
            seg.segment(image, roi, res => {
                const m = res.confidenceMasks?.[0];
                if (m) out = { data: confidenceToMask(m.getAsFloat32Array()), width: m.width, height: m.height };
            });
            if (!out) throw new Error('no mask returned');
            const { data, width, height } = out as { data: Uint8ClampedArray; width: number; height: number };
            post({ type: 'mask', id: msg.id, width, height, data: data.buffer }, [data.buffer]);
        }
    } catch (err) {
        post({ type: 'error', id: 'id' in msg ? msg.id : -1, error: err instanceof Error ? err.message : String(err) });
    }
};
