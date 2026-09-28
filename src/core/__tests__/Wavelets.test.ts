import { describe, it, expect } from 'vitest';
import {
    WaveletTransform,
    CompressorMagnitude,
    TRANSTYPE_FWT,
    TRANSTYPE_WPT,
    WAVELETNO,
    isValidWaveletId,
} from '../Wavelets';
import { WAVELET_FILTERS } from '../waveletCoefficients';

// Wavelets whose JWave filter banks are not perfect-reconstruction pairs
// (JWave builds them with the orthogonal-space construction even though they are
// biorthogonal/unnormalized). Their glitchy round-trip is intentional in GLIC.
const NON_PR_IDS = new Set([
    5, 6, 7, 8, // BiOrthogonal 2/2..2/8 - JWave's even-order bior banks don't reconstruct
    14, 15, 16, // BiOrthogonal 4/4, 5/5, 6/8 - same
    41, 42, 43, // Legendre 1-3
    63, // Battle 23
    64, 65, // CDF 5/3, 9/7
    66, // Discrete Mayer (truncated filter)
]);

const rng = (seed: number) => () => {
    // deterministic LCG for reproducible test data
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
};

const makeBlock = (size: number, seedVal = 42) => {
    const r = rng(seedVal);
    const d = new Float64Array(size * size);
    for (let i = 0; i < d.length; i++) d[i] = Math.floor(r() * 256) / 255;
    return d;
};

describe('wavelet filter bank', () => {
    it('contains all 67 wavelet ids', () => {
        for (let id = 1; id < WAVELETNO; id++) {
            expect(WAVELET_FILTERS[id], `id ${id}`).toBeDefined();
            expect(isValidWaveletId(id)).toBe(true);
        }
        expect(isValidWaveletId(0)).toBe(false);
        expect(isValidWaveletId(-1)).toBe(false);
        expect(isValidWaveletId(200)).toBe(false);
    });

    it('spot-checks exact JWave coefficient values', () => {
        // Haar orthogonal: the famous non-normalized [1, 1] with reverseScale 0.5
        expect(WAVELET_FILTERS[1].scalingDeCom).toEqual([1, 1]);
        expect(WAVELET_FILTERS[1].reverseScale).toBe(0.5);
        // Daubechies 2 leading coefficient (1+sqrt3)/(4*sqrt2)
        expect(WAVELET_FILTERS[44].scalingDeCom[0]).toBeCloseTo((1 + Math.sqrt(3)) / (4 * Math.sqrt(2)), 15);
        // Legendre 1: JWave's negated Haar
        expect(WAVELET_FILTERS[41].scalingDeCom[0]).toBeCloseTo(-Math.SQRT1_2, 15);
        // Battle 23 descends only to length 8
        expect(WAVELET_FILTERS[63].transformWavelength).toBe(8);
        // CDF 5/3 decomposition low-pass as shipped
        expect(WAVELET_FILTERS[64].scalingDeCom).toEqual([-0.125, 0.25, 0.75, 0.25, -0.125]);
    });
});

describe('round-trip reconstruction (orthogonal wavelets)', () => {
    for (let id = 1; id < WAVELETNO; id++) {
        if (NON_PR_IDS.has(id)) continue;
        for (const type of [TRANSTYPE_FWT, TRANSTYPE_WPT]) {
            it(`id ${id} (${WAVELET_FILTERS[id].name}) ${type === TRANSTYPE_FWT ? 'FWT' : 'WPT'} 16x16`, () => {
                const size = 16;
                const orig = makeBlock(size, id * 7 + type);
                const data = orig.slice();
                const t = new WaveletTransform(type, id);
                t.forward2D(data, size);
                t.reverse2D(data, size);
                // ~1e-8 reconstruction error is inherent to some JWave coefficient
                // tables (verified against the real jar in WaveletsReference.test.ts)
                for (let i = 0; i < data.length; i++) {
                    expect(Math.abs(data[i] - orig[i]), `idx ${i}`).toBeLessThan(1e-6);
                }
            });
        }
    }
});

describe('deterministic output for quirky wavelets', () => {
    // These don't reconstruct perfectly (JWave quirk = the glitch aesthetic),
    // but they must be deterministic and finite.
    for (const id of NON_PR_IDS) {
        it(`id ${id} (${WAVELET_FILTERS[id].name}) is deterministic and finite`, () => {
            const size = 8;
            const a = makeBlock(size, 1);
            const b = a.slice();
            const t1 = new WaveletTransform(TRANSTYPE_FWT, id);
            const t2 = new WaveletTransform(TRANSTYPE_FWT, id);
            t1.forward2D(a, size);
            t2.forward2D(b, size);
            expect(Array.from(a)).toEqual(Array.from(b));
            for (const v of a) expect(Number.isFinite(v)).toBe(true);
        });
    }
});

describe('small blocks', () => {
    it('handles 2x2 blocks with a 62-tap filter (Discrete Mayer) via circular wrap', () => {
        const size = 2;
        const data = new Float64Array([0.1, 0.5, 0.9, 0.3]);
        const t = new WaveletTransform(TRANSTYPE_FWT, 66);
        t.forward2D(data, size);
        for (const v of data) expect(Number.isFinite(v)).toBe(true);
    });
});

describe('CompressorMagnitude', () => {
    it('zeroes below mean(|v|) * threshold, keeps at-or-above (verified vs real jar)', () => {
        const data = new Float64Array([1, -2, 3, -4]); // mean |v| = 2.5
        const c = new CompressorMagnitude(1); // cut = 2.5
        c.compress(data, data.length);
        expect(Array.from(data)).toEqual([0, 0, 3, -4]);
    });

    it('matches the jar reference case: [[1,2],[3,4]] at threshold 0.5 keeps 2,3,4', () => {
        const data = new Float64Array([1, 2, 3, 4]); // mean = 2.5, cut = 1.25
        const c = new CompressorMagnitude(0.5);
        c.compress(data, data.length);
        expect(Array.from(data)).toEqual([0, 2, 3, 4]);
    });

    it('boundary: |v| exactly equal to cut is kept (JWave uses >=)', () => {
        const data = new Float64Array([2, 2, 2, 2]); // mean = 2 -> cut = 2 at threshold 1
        const c = new CompressorMagnitude(1);
        c.compress(data, data.length);
        expect(Array.from(data)).toEqual([2, 2, 2, 2]);
    });

    it('falls back to threshold 1.0 for non-positive thresholds (JWave behavior)', () => {
        const c = new CompressorMagnitude(0);
        expect(c.threshold).toBe(1.0);
    });
});
