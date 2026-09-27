import { describe, it, expect } from 'vitest';
import { COLORSPACES, getChannelNames, getColorSpaceName, toColorspace, fromColorspace } from '../ColorSpaces';

describe('getChannelNames', () => {
    it('returns three labels for every colorspace', () => {
        for (const cs of Object.values(COLORSPACES)) {
            const names = getChannelNames(cs);
            expect(names, getColorSpaceName(cs)).toHaveLength(3);
            for (const n of names) expect(n.length).toBeGreaterThan(0);
        }
    });

    it('maps well-known spaces correctly', () => {
        expect(getChannelNames(COLORSPACES.RGB)).toEqual(['R', 'G', 'B']);
        expect(getChannelNames(COLORSPACES.HWB)).toEqual(['H', 'W', 'B']);
        expect(getChannelNames(COLORSPACES.YCbCr)).toEqual(['Y', 'Cb', 'Cr']);
    });
});

describe('colorspace round trips', () => {
    // sanity net for the spaces artists use most - exact for involutive spaces,
    // small tolerance for float-mapped ones
    const samples = [0xff000000, 0xffffffff, 0xff808080, 0xffd94f27, 0xff2766d9, 0xff27d94f];
    const closeSpaces = [COLORSPACES.RGB, COLORSPACES.CMY, COLORSPACES.OHTA, COLORSPACES.YCbCr, COLORSPACES.RGGBG];

    for (const cs of closeSpaces) {
        it(`${getColorSpaceName(cs)} to/from is near-identity`, () => {
            for (const c of samples) {
                const back = fromColorspace(toColorspace(c, cs), cs);
                for (const shift of [0, 8, 16]) {
                    const a = (c >>> shift) & 0xff;
                    const b = (back >>> shift) & 0xff;
                    expect(Math.abs(a - b), `cs ${cs} color ${c.toString(16)}`).toBeLessThanOrEqual(2);
                }
            }
        });
    }
});
