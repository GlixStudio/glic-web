import { it } from 'vitest';
import { encode } from '../Codec';
import { applyBuiltinPreset, BUILTIN_PRESET_NAMES } from '../presets';

// Diagnostic sweep (SWEEP=1): run every bundled preset over a small photo-like
// image and flag outputs that collapse to flat grey / near-constant frames.
it.runIf(process.env.SWEEP)('preset grey-screen sweep', () => {
    const w = 96;
    const h = 96;
    const data = new Uint8ClampedArray(w * h * 4);
    let s = 7;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
            const i = (y * w + x) * 4;
            // smooth gradients + noise, closer to a photo than pure noise
            data[i] = (x * 2 + ((s >>> 8) & 31)) & 255;
            data[i + 1] = (y * 2 + ((s >>> 16) & 31)) & 255;
            data[i + 2] = ((x + y) + ((s >>> 24) & 31)) & 255;
            data[i + 3] = 255;
        }
    }
    const img = new ImageData(data, w, h);

    const stats = (px: Uint8ClampedArray) => {
        let sum = 0;
        let sum2 = 0;
        const n = px.length / 4;
        for (let i = 0; i < n; i++) {
            const v = (px[i * 4] + px[i * 4 + 1] + px[i * 4 + 2]) / 3;
            sum += v;
            sum2 += v * v;
        }
        const mean = sum / n;
        return { mean, std: Math.sqrt(Math.max(0, sum2 / n - mean * mean)) };
    };

    const flat: string[] = [];
    const errors: string[] = [];
    for (const name of BUILTIN_PRESET_NAMES) {
        const app = applyBuiltinPreset(name);
        if (!app) continue;
        try {
            const res = encode(img, app.config);
            const { mean, std } = stats(res.preview.data);
            if (std < 6) flat.push(`${name} (mean=${mean.toFixed(0)}, std=${std.toFixed(1)})`);
        } catch (e) {
            errors.push(`${name}: ${(e as Error).message}`);
        }
    }
    console.log(`\nFLAT/GREY OUTPUT: ${flat.length} of ${BUILTIN_PRESET_NAMES.length}`);
    for (const f of flat) console.log('  ' + f);
    console.log(`ERRORS: ${errors.length}`);
    for (const e of errors) console.log('  ' + e);
}, 600000);
