import { describe, it, expect } from 'vitest';
import { WaveletTransform, WAVELETNO } from '../Wavelets';
import { WAVELET_FILTERS } from '../waveletCoefficients';
import reference from './fixtures/jwave-reference.json';

// Cross-validation against the REAL JWave.jar bundled with the original GLIC.
// scripts/jwave-extract/Reference.java ran an 8x8 block (deterministic LCG input)
// through BasicTransform.forward/reverse for every wavelet id and both transform
// types - exactly the code path GLIC uses. Our engine must reproduce those numbers.

const SIZE = 8;

const makeBlock = (seed: number) => {
    let s = seed >>> 0;
    const d = new Float64Array(SIZE * SIZE);
    for (let i = 0; i < d.length; i++) {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        d[i] = Math.floor((s / 0x100000000) * 256) / 255;
    }
    return d;
};

const parseVals = (a: (number | string)[]): number[] =>
    a.map(v => (typeof v === 'string' ? Number(v) : v));

// Relative-ish tolerance: JWave computes in the same double precision, but
// summation order inside our flat loops is identical, so results should agree
// to the last few ulps. Use a tight absolute epsilon relative to magnitude.
const expectClose = (actual: Float64Array, expected: number[], label: string) => {
    for (let i = 0; i < expected.length; i++) {
        const e = expected[i];
        const a = actual[i];
        if (Number.isNaN(e)) {
            expect(Number.isNaN(a), `${label}[${i}] NaN`).toBe(true);
            continue;
        }
        const tol = Math.max(1e-9, Math.abs(e) * 1e-9);
        expect(Math.abs(a - e), `${label}[${i}]: got ${a}, want ${e}`).toBeLessThanOrEqual(tol);
    }
};

describe('engine output matches original JWave.jar exactly', () => {
    for (let id = 1; id < WAVELETNO; id++) {
        for (const type of [0, 1]) {
            const key = `${id}_${type}` as keyof typeof reference;
            it(`id ${id} (${WAVELET_FILTERS[id].name}) ${type === 0 ? 'FWT' : 'WPT'}`, () => {
                const ref = reference[key] as { fwd: (number | string)[]; rev: (number | string)[] };
                expect(ref).toBeDefined();

                const input = makeBlock(id * 7 + type);
                const t = new WaveletTransform(type, id);

                const fwd = input.slice();
                t.forward2D(fwd, SIZE);
                expectClose(fwd, parseVals(ref.fwd), 'fwd');

                const rev = fwd.slice();
                t.reverse2D(rev, SIZE);
                expectClose(rev, parseVals(ref.rev), 'rev');
            });
        }
    }
});
