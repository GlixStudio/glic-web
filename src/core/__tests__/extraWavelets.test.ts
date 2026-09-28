import { describe, it, expect } from 'vitest';
import { WaveletTransform, TRANSTYPE_FWT, TRANSTYPE_WPT, WAVELET_IDS, WAVELETNO, isValidWaveletId, resolveWaveletId, getWaveletName } from '../Wavelets';
import { EXTRA_WAVELET_FILTERS, EXTRA_WAVELET_FIRST_ID } from '../extraWavelets';
import { CodecConfig, encode, decodeParse } from '../Codec';

const extraIds = Object.keys(EXTRA_WAVELET_FILTERS).map(Number);

// the orthogonal constructions (lattice / rotor) reconstruct perfectly by design
const PR_NAMES = ['~b- Lattice 20°', '~b- Lattice 120°', '~b- Bleach', '~b- Fade', '~b- Rotor 15°', '~b- Rotor 80°'];

const makeBlock = (size: number, seed: number) => {
    let s = seed >>> 0;
    const d = new Float64Array(size * size);
    for (let i = 0; i < d.length; i++) {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        d[i] = Math.floor((s / 0x100000000) * 256) / 255;
    }
    return d;
};

describe('~b- wavelets', () => {
    it('are numbered contiguously from 68 and named with the ~b- prefix', () => {
        extraIds.forEach((id, i) => {
            expect(id).toBe(EXTRA_WAVELET_FIRST_ID + i);
            expect(EXTRA_WAVELET_FILTERS[id].name.startsWith('~b- ')).toBe(true);
            expect(isValidWaveletId(id)).toBe(true);
            expect(getWaveletName(id)).toBe(EXTRA_WAVELET_FILTERS[id].name);
        });
        expect(WAVELET_IDS.slice(-extraIds.length)).toEqual(extraIds);
    });

    it('leaves RANDOM inside the original 1..67 range (desktop GLIC behaviour)', () => {
        for (let i = 0; i < 200; i++) {
            const id = resolveWaveletId(-1, () => i / 200);
            expect(id).toBeGreaterThanOrEqual(1);
            expect(id).toBeLessThan(WAVELETNO);
        }
    });

    for (const id of extraIds) {
        it(`id ${id} (${getWaveletName(id)}) is deterministic and finite for FWT and WPT`, () => {
            for (const type of [TRANSTYPE_FWT, TRANSTYPE_WPT]) {
                const a = makeBlock(8, id);
                const b = a.slice();
                new WaveletTransform(type, id).forward2D(a, 8);
                new WaveletTransform(type, id).forward2D(b, 8);
                expect(Array.from(a)).toEqual(Array.from(b));
                for (const v of a) expect(Number.isFinite(v)).toBe(true);
                new WaveletTransform(type, id).reverse2D(a, 8);
                for (const v of a) expect(Number.isFinite(v)).toBe(true);
            }
        });
    }

    for (const name of PR_NAMES) {
        it(`${name} reconstructs perfectly`, () => {
            const id = extraIds.find(i => EXTRA_WAVELET_FILTERS[i].name === name)!;
            for (const type of [TRANSTYPE_FWT, TRANSTYPE_WPT]) {
                const orig = makeBlock(16, id * 3 + type);
                const data = orig.slice();
                const t = new WaveletTransform(type, id);
                t.forward2D(data, 16);
                t.reverse2D(data, 16);
                for (let i = 0; i < data.length; i++) expect(Math.abs(data[i] - orig[i])).toBeLessThan(1e-9);
            }
        });
    }

    it('survives the .glic header round trip', () => {
        const w = 16;
        const h = 16;
        const px = new Uint8ClampedArray(w * h * 4);
        for (let i = 0; i < px.length; i++) px[i] = (i * 37) & 255;
        const cfg = new CodecConfig();
        cfg.transform_method = [68, 75, 82];
        const res = encode(new ImageData(px, w, h), cfg);
        const { reader } = decodeParse(res.file);
        expect(reader.transform_method).toEqual([68, 75, 82]);
    });
});
