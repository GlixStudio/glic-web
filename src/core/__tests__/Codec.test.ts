import { describe, it, expect } from 'vitest';
import { encode, decode, CodecConfig, quant_value, trans_compression_value } from '../Codec';
import { packedBitCount } from '../GlicFormat';
import { BitOutput, BitInput } from '../BitIO';

const makeImage = (w: number, h: number, seed = 7): ImageData => {
    let s = seed >>> 0;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        data[i * 4] = s & 0xff;
        data[i * 4 + 1] = (s >>> 8) & 0xff;
        data[i * 4 + 2] = (s >>> 16) & 0xff;
        data[i * 4 + 3] = 255;
    }
    return new ImageData(data, w, h);
};

/** Deterministic config: no random wavelets, no random predictions. */
const fixedConfig = (over: Partial<CodecConfig> = {}): CodecConfig => {
    const c = new CodecConfig();
    c.colorspace = 1; // RGB (identity)
    c.prediction_method = [9, 9, 9]; // PAETH
    c.transform_method = [67, 67, 67]; // plain haar
    c.transform_type = [0, 0, 0]; // FWT
    c.transform_scale = [1 << 20, 1 << 20, 1 << 20];
    c.quantization_value = [110, 110, 110];
    c.encoding_method = [1, 1, 1]; // PACKED
    Object.assign(c, over);
    return c;
};

describe('value mappings match the original', () => {
    it('quant_value = v / 2', () => {
        expect(quant_value(110)).toBe(55);
        expect(quant_value(0)).toBe(0);
        expect(quant_value(255)).toBe(127.5);
    });

    it('trans_compression_value = 50 * (v/255)^2', () => {
        expect(trans_compression_value(255)).toBeCloseTo(50, 12);
        expect(trans_compression_value(128)).toBeCloseTo(50 * (128 / 255) ** 2, 12);
        expect(trans_compression_value(0)).toBe(0);
    });

    it('packedBitCount = ceil(log2(scale)) with Java cast quirks', () => {
        expect(packedBitCount(1)).toBe(0);
        expect(packedBitCount(2)).toBe(1);
        expect(packedBitCount(3)).toBe(2);
        expect(packedBitCount(1 << 20)).toBe(20);
        expect(packedBitCount(1 << 24)).toBe(24);
        expect(packedBitCount(-5)).toBe(0); // Java (int) NaN
        expect(packedBitCount(0)).toBe(-0x80000000); // Java (int) -Infinity
    });
});

describe('BitIO round-trips', () => {
    it('signed/unsigned ints of various widths', () => {
        const out = new BitOutput();
        out.writeInt(false, 9, -200);
        out.writeInt(false, 9, 255);
        out.writeInt(true, 8, 200);
        out.writeInt(true, 7, 127);
        out.writeInt(false, 21, -1000000);
        out.writeInt(false, 32, -123456789);
        out.writeBoolean(true);
        out.align(1);
        const input = new BitInput(out.toByteArray());
        expect(input.readInt(false, 9)).toBe(-200);
        expect(input.readInt(false, 9)).toBe(255);
        expect(input.readInt(true, 8)).toBe(200);
        expect(input.readInt(true, 7)).toBe(127);
        expect(input.readInt(false, 21)).toBe(-1000000);
        expect(input.readInt(false, 32)).toBe(-123456789);
        expect(input.readBoolean()).toBe(true);
    });
});

describe('.glic container layout', () => {
    it('writes the original header structure', () => {
        const img = makeImage(64, 64);
        const { file } = encode(img, fixedConfig());
        const text = (off: number, len: number) => String.fromCharCode(...file.slice(off, off + len));
        const i32 = (off: number) =>
            ((file[off] << 24) | (file[off + 1] << 16) | (file[off + 2] << 8) | file[off + 3]) | 0;

        expect(text(0, 4)).toBe('GLIC');
        expect(i32(4)).toBe(64); // width
        expect(i32(8)).toBe(64); // height
        expect(file[12]).toBe(1); // colorspace RGB
        expect([file[13], file[14], file[15]]).toEqual([128, 128, 128]); // outside color

        // size table at offset 16 is backpatched and non-zero
        const segSizes = [i32(16), i32(20), i32(24), i32(28)];
        expect(segSizes[0]).toBeGreaterThan(0);
        expect(segSizes[3]).toBe(0); // 4th slot unused

        // second header channel chunks at 128, 160, 192
        for (let p = 0; p < 3; p++) {
            expect(text(128 + p * 32, 4)).toBe('CH0' + String.fromCharCode(0x31 + p));
        }
        // segmentation mark at 224
        expect(text(224, 13)).toBe('SEGMENTATION ');
        expect(text(237, 4)).toBe('CH01');
    });

    it('second header stores config values', () => {
        const cfg = fixedConfig();
        const { file } = encode(makeImage(64, 64), cfg);
        // channel 0 chunk starts at 128: mark(4) pred quant clamp wavelet type scale(4) encoding
        expect(file[132]).toBe(9); // PAETH
        expect(file[133]).toBe(110); // quant
        expect(file[134]).toBe(0); // clamp
        expect(file[135]).toBe(67); // haar
        expect(file[136]).toBe(0); // FWT
        const scale = ((file[137] << 24) | (file[138] << 16) | (file[139] << 8) | file[140]) | 0;
        expect(scale).toBe(1 << 20);
        expect(file[141]).toBe(1); // PACKED
    });
});

describe('encode -> decode round trip', () => {
    const cases: [string, Partial<CodecConfig>][] = [
        ['PACKED + haar FWT', {}],
        ['RAW + no wavelet', { transform_method: [0, 0, 0], encoding_method: [0, 0, 0] }],
        ['RLE + haar WPT', { transform_type: [1, 1, 1], encoding_method: [2, 2, 2] }],
        ['MOD256 clamp + PACKED', { clamp_method: [1, 1, 1] }],
        ['no quantization', { quantization_value: [0, 0, 0] }],
        ['with compression', { transform_compress: [128, 128, 128] }],
        ['CDF 9/7 (non-PR wavelet)', { transform_method: [65, 65, 65] }],
        ['HWB colorspace', { colorspace: 9 }],
        ['non-square 96x64', {}],
    ];

    for (const [name, over] of cases) {
        it(name, () => {
            const img = name.includes('96x64') ? makeImage(96, 64) : makeImage(64, 64);
            const cfg = fixedConfig(over);
            const enc = encode(img, cfg);
            const dec = decode(enc.file);

            expect(dec.width).toBe(img.width);
            expect(dec.height).toBe(img.height);
            expect(dec.colorspace).toBe(cfg.colorspace);

            // The decoder must reproduce the encoder's preview pixel-for-pixel:
            // encode reconstructs internally with the same steps the decoder runs.
            // (Alpha differs: files carry no alpha, decode emits opaque.)
            const a = enc.preview.data;
            const b = dec.preview.data;
            expect(b.length).toBe(a.length);
            let diff = 0;
            for (let i = 0; i < a.length; i += 4) {
                if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) diff++;
            }
            expect(diff, `${diff} differing pixels of ${a.length / 4}`).toBe(0);
        });
    }

    it('override header (do_skip_header) changes reconstruction settings', () => {
        const img = makeImage(64, 64);
        const enc = encode(img, fixedConfig());
        const override = fixedConfig({ colorspace: 2 /* CMY */ });
        const dec = decode(enc.file, { overrideConfig: override, separateChannels: true });
        expect(dec.colorspace).toBe(2);
        // still produces a full-size image
        expect(dec.width).toBe(64);
        expect(dec.preview.data.length).toBe(64 * 64 * 4);
    });

    it('survives truncated (databent) files', () => {
        const img = makeImage(64, 64);
        const enc = encode(img, fixedConfig());
        const cut = enc.file.slice(0, Math.floor(enc.file.length * 0.6));
        const dec = decode(cut);
        expect(dec.width).toBe(64);
        expect(dec.preview.data.length).toBe(64 * 64 * 4);
    });

    it('survives random garbage after magic', () => {
        const junk = new Uint8Array(4096);
        let s = 99;
        for (let i = 0; i < junk.length; i++) {
            s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
            junk[i] = s & 0xff;
        }
        junk[0] = 0x47; junk[1] = 0x4c; junk[2] = 0x49; junk[3] = 0x43;
        // keep decoded dimensions small so the test stays fast (a real 8192x8192
        // garbage decode works but takes a long time, as in the original)
        junk.set([0, 0, 0, 100], 4); // width
        junk.set([0, 0, 0, 80], 8); // height
        const dec = decode(junk);
        expect(dec.width).toBeGreaterThanOrEqual(64);
        expect(dec.preview.data.length).toBe(dec.width * dec.height * 4);
    });
});
