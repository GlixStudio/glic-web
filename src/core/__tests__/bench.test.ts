import { it } from 'vitest';
import { encode, CodecConfig } from '../Codec';

// Opt-in benchmark: BENCH=1 npx vitest run src/core/__tests__/bench.test.ts
it.runIf(process.env.BENCH)('encode 1024x1024 noise benchmark', () => {
    const w = 1024;
    const h = 1024;
    const data = new Uint8ClampedArray(w * h * 4);
    let s = 7;
    for (let i = 0; i < w * h; i++) {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        data[i * 4] = s & 0xff;
        data[i * 4 + 1] = (s >>> 8) & 0xff;
        data[i * 4 + 2] = (s >>> 16) & 0xff;
        data[i * 4 + 3] = 255;
    }
    const img = new ImageData(data, w, h);
    const cfg = new CodecConfig();
    cfg.transform_method = [67, 67, 67];
    cfg.transform_type = [0, 0, 0];
    cfg.encoding_method = [1, 1, 1];
    const t0 = performance.now();
    const res = encode(img, cfg);
    console.log(
        `encode ${w}x${h}: ${(performance.now() - t0).toFixed(0)}ms, ` +
            `file ${(res.file.length / 1024).toFixed(0)}KB, ` +
            `segments ${res.segments.map(x => x.length).join('/')}`
    );
}, 120000);
