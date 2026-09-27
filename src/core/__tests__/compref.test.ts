import { it, expect } from 'vitest';
import { WaveletTransform, CompressorMagnitude, TRANSTYPE_FWT } from '../Wavelets';
import { trans_compression_value } from '../Codec';

it('extreme compression matches the real jar (0 and 5 survivors)', () => {
    const size = 16;
    for (const [waveletId, comp, expectedNz] of [[65, 176, 0], [63, 79, 5]] as const) {
        let s = 42 >>> 0;
        const m = new Float64Array(size * size);
        for (let i = 0; i < m.length; i++) {
            s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
            m[i] = Math.floor((s / 0x100000000) * 256) / 255;
        }
        new WaveletTransform(TRANSTYPE_FWT, waveletId).forward2D(m, size);
        new CompressorMagnitude(trans_compression_value(comp)).compress(m, m.length);
        let nz = 0;
        for (const v of m) if (v !== 0) nz++;
        expect(nz, `wavelet ${waveletId} comp ${comp}`).toBe(expectedNz);
    }
});
