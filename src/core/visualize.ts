// Port of the original visualize_segmentation(): every segment block is flooded
// with its center value, per colorspace channel.

import { toColorspace, fromColorspace } from './ColorSpaces';
import type { Segment } from './Planes';

export const visualizeSegmentation = (img: ImageData, segments: Segment[][], cs: number): ImageData => {
    const w = img.width;
    const h = img.height;
    const n = w * h;
    const channels = [new Int32Array(n), new Int32Array(n), new Int32Array(n)];
    const src = img.data;

    for (let i = 0; i < n; i++) {
        const argb =
            (((src[i * 4 + 3] & 0xff) << 24) |
                ((src[i * 4] & 0xff) << 16) |
                ((src[i * 4 + 1] & 0xff) << 8) |
                (src[i * 4 + 2] & 0xff)) >>>
            0;
        const c = toColorspace(argb, cs);
        channels[0][i] = (c >>> 16) & 0xff;
        channels[1][i] = (c >>> 8) & 0xff;
        channels[2][i] = c & 0xff;
    }

    for (let p = 0; p < 3; p++) {
        const ch = channels[p];
        const out = new Int32Array(ch); // fill from the source values, like res = source.clone()
        for (const s of segments[p]) {
            const cx = Math.min(w - 1, s.x + (s.size >> 1));
            const cy = Math.min(h - 1, s.y + (s.size >> 1));
            if (s.x >= w || s.y >= h) continue;
            const v = ch[cy * w + cx];
            const xEnd = Math.min(w, s.x + s.size);
            const yEnd = Math.min(h, s.y + s.size);
            for (let y = s.y; y < yEnd; y++) {
                out.fill(v, y * w + s.x, y * w + xEnd);
            }
        }
        channels[p] = out;
    }

    const data = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < n; i++) {
        const packed =
            ((0xff << 24) | ((channels[0][i] & 0xff) << 16) | ((channels[1][i] & 0xff) << 8) | (channels[2][i] & 0xff)) >>> 0;
        const rgb = fromColorspace(packed, cs);
        data[i * 4] = (rgb >>> 16) & 0xff;
        data[i * 4 + 1] = (rgb >>> 8) & 0xff;
        data[i * 4 + 2] = rgb & 0xff;
        data[i * 4 + 3] = src[i * 4 + 3];
    }
    return new ImageData(data, w, h);
};
