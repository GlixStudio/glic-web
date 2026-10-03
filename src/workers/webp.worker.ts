// libwebp (WASM) off the main thread: fitting uploads under the size limit and
// making grid previews. Browsers' canvas.toBlob cannot write lossless WebP and
// Safari cannot write WebP at all, so the codec ships with the app.

import encode from '@jsquash/webp/encode';
import decode from '@jsquash/webp/decode';
import { makePreview, shrinkToWebp, type WebpCodec } from '../social/webpShrink';

const codec: WebpCodec = { encode: (img, opts) => encode(img, opts), decode: buf => decode(buf) };

export type WebpRequest =
    | { id: number; op: 'shrink'; img: ImageData; targetBytes: number }
    | { id: number; op: 'preview'; img: ImageData; sourceBytes: number; side?: number };

self.onmessage = async (e: MessageEvent<WebpRequest>) => {
    const msg = e.data;
    try {
        if (msg.op === 'shrink') {
            const r = await shrinkToWebp(msg.img, msg.targetBytes, codec, label => self.postMessage({ id: msg.id, progress: label }));
            self.postMessage({ id: msg.id, result: r }, { transfer: [r.bytes.buffer] });
        } else {
            const r = await makePreview(msg.img, msg.sourceBytes, codec, msg.side);
            self.postMessage({ id: msg.id, result: r }, r ? { transfer: [r.bytes.buffer] } : {});
        }
    } catch (err) {
        self.postMessage({ id: msg.id, error: (err as Error).message });
    }
};
