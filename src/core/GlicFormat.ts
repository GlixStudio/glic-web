// Byte-exact implementation of the original GLIC .glic container
// (GlicCodecWriter / GlicCodecReader in codec.pde):
//
//   [0..16)    "GLIC", int32 width, int32 height, uint8 colorspace, uint8 r,g,b (outside color)
//   [16..64)   size table, backpatched on close: 4x segmentation, 4x segment-data, 4x data sizes
//   [64..128)  zero padding (first header is aligned to 128 bytes)
//   3x 32-byte channel chunks: "CH01"+p, pred, quant, clamp, wavelet, transtype,
//              int32 scale, encoding, zero padding
//   "SEGMENTATION " + per channel: "CH0x" + quad-tree bitstream (byte aligned)
//   512 x 0xff separator
//   "PREDICTDATA " + per channel: "CH0x" + 8-byte records (pred_type u8, refx i16,
//              refy i16, refa u8, angle i16 = trunc(0x7000*angle))
//   512 x 0xff separator
//   "IMAGEDATA " + per channel: "CH0x" + RAW int32s | PACKED/RLE bitstream (byte aligned)
//   512 x 0xff separator (writer only)
//
// The reader reproduces the original's deliberate robustness quirks (masked sizes,
// EOF-tolerant reads, width/height sanitization) - they are what make databent
// files decodable.

import { BitOutput, BitInput } from './BitIO';
import { Planes, type Segment, CLAMP_NONE, CLAMP_MOD256 } from './Planes';
import { PRED_NONE } from './Predictions';
import { WAVELET_NONE } from './Wavelets';

export interface ChannelHeaderConfig {
    prediction_method: number[];
    quantization_value: number[];
    clamp_method: number[];
    transform_method: number[];
    transform_type: number[];
    transform_scale: number[];
    encoding_method: number[];
}

export const ENCODING_RAW = 0;
export const ENCODING_PACKED = 1;
export const ENCODING_RLE = 2;

/**
 * Number of bits used by PACKED/RLE for wavelet-transformed values:
 * Java's (int) ceil(log(scale) / log(2)), including its NaN/-Infinity cast quirks.
 */
export const packedBitCount = (scale: number): number => {
    if (scale > 0) return 32 - Math.clz32(scale - 1); // exact ceil(log2(scale))
    if (scale < 0) return 0; // Java: (int) NaN == 0
    return -0x80000000; // Java: (int) -Infinity == Integer.MIN_VALUE -> read/write throws
};

class ByteWriter {
    private buf = new Uint8Array(1 << 16);
    private len_ = 0;
    private chunkStart = 0;

    get length() {
        return this.len_;
    }

    private ensure(extra: number) {
        if (this.len_ + extra <= this.buf.length) return;
        let cap = this.buf.length * 2;
        while (cap < this.len_ + extra) cap *= 2;
        const next = new Uint8Array(cap);
        next.set(this.buf.subarray(0, this.len_));
        this.buf = next;
    }

    u8(v: number) {
        this.ensure(1);
        this.buf[this.len_++] = v & 0xff;
    }

    i32(v: number) {
        this.ensure(4);
        this.buf[this.len_++] = (v >>> 24) & 0xff;
        this.buf[this.len_++] = (v >>> 16) & 0xff;
        this.buf[this.len_++] = (v >>> 8) & 0xff;
        this.buf[this.len_++] = v & 0xff;
    }

    i16(v: number) {
        this.ensure(2);
        this.buf[this.len_++] = (v >>> 8) & 0xff;
        this.buf[this.len_++] = v & 0xff;
    }

    str(s: string) {
        this.ensure(s.length);
        for (let i = 0; i < s.length; i++) this.buf[this.len_++] = s.charCodeAt(i) & 0xff;
    }

    bytes(a: Uint8Array) {
        this.ensure(a.length);
        this.buf.set(a, this.len_);
        this.len_ += a.length;
    }

    fill(count: number, val: number) {
        if (count <= 0) return;
        this.ensure(count);
        this.buf.fill(val & 0xff, this.len_, this.len_ + count);
        this.len_ += count;
    }

    /** Original GlicCodecWriter.align: pad the current chunk (since last align) to `bytes`. */
    align(bytes: number) {
        this.fill(bytes - (this.len_ - this.chunkStart), 0);
        this.chunkStart = this.len_;
    }

    patchI32(offset: number, v: number) {
        this.buf[offset] = (v >>> 24) & 0xff;
        this.buf[offset + 1] = (v >>> 16) & 0xff;
        this.buf[offset + 2] = (v >>> 8) & 0xff;
        this.buf[offset + 3] = v & 0xff;
    }

    toUint8Array(): Uint8Array {
        return this.buf.slice(0, this.len_);
    }
}

export class GlicWriter {
    private o = new ByteWriter();
    segmentation_sizes = [0, 0, 0, 0];
    segmdata_sizes = [0, 0, 0, 0];
    data_sizes = [0, 0, 0, 0];

    writeFirstHeader(w: number, h: number, colorspace: number, outsideR: number, outsideG: number, outsideB: number) {
        this.o.str('GLIC');
        this.o.i32(w);
        this.o.i32(h);
        this.o.u8(colorspace);
        this.o.u8(outsideR);
        this.o.u8(outsideG);
        this.o.u8(outsideB);
        this.o.align(128);
    }

    writeSecondHeader(ccfg: ChannelHeaderConfig) {
        for (let p = 0; p < 3; p++) {
            this.writeChannelMark(p);
            let pred = ccfg.prediction_method[p];
            if (pred < 0) pred = PRED_NONE; // random/SAD choices are stored per segment
            this.o.u8(pred);
            this.o.u8(ccfg.quantization_value[p]);
            this.o.u8(ccfg.clamp_method[p]);
            this.o.u8(ccfg.transform_method[p]);
            this.o.u8(ccfg.transform_type[p]);
            this.o.i32(ccfg.transform_scale[p]);
            this.o.u8(ccfg.encoding_method[p]);
            this.o.align(32);
        }
    }

    writeChannelMark(p: number) {
        this.o.u8(0x43); // C
        this.o.u8(0x48); // H
        this.o.u8(0x30); // 0
        this.o.u8(0x31 + p);
    }

    writeSegmentationMark() {
        this.o.str('SEGMENTATION ');
    }

    writeSegmentation(p: number, bits: Uint8Array) {
        this.segmentation_sizes[p] = bits.length;
        this.o.bytes(bits);
    }

    writePredictDataMark() {
        this.o.str('PREDICTDATA ');
    }

    writeSegmentsData(pno: number, segments: Segment[], predictionMethod: number) {
        const start = this.o.length;
        for (const s of segments) {
            // store the concrete per-segment type only when the global method is
            // random/SAD/BSAD; otherwise PRED_NONE (decoder substitutes the header method)
            const pred_type = predictionMethod < 0 ? s.pred_type : PRED_NONE;
            this.o.u8(pred_type);
            this.o.i16(s.refx);
            this.o.i16(s.refy);
            this.o.u8(s.refa);
            this.o.i16(Math.trunc(0x7000 * s.angle));
        }
        this.segmdata_sizes[pno] = this.o.length - start;
    }

    writeDataMark() {
        this.o.str('IMAGEDATA ');
    }

    writeData(method: number, planes: Planes, pno: number, segments: Segment[], ccfg: ChannelHeaderConfig) {
        const start = this.o.length;
        switch (method) {
            case ENCODING_PACKED:
                this.encodePacked(planes, pno, segments, ccfg);
                break;
            case ENCODING_RLE:
                this.encodeRLE(planes, pno, segments, ccfg);
                break;
            default:
                this.encodeRaw(planes, pno, segments);
        }
        this.data_sizes[pno] = this.o.length - start;
    }

    private encodeRaw(planes: Planes, pno: number, segments: Segment[]) {
        for (const s of segments) {
            for (let x = 0; x < s.size; x++) {
                for (let y = 0; y < s.size; y++) {
                    this.o.i32(planes.get(pno, s.x + x, s.y + y));
                }
            }
        }
    }

    private emitPackedBits(out: BitOutput, pno: number, bits: number, val: number, ccfg: ChannelHeaderConfig) {
        if (ccfg.transform_method[pno] === WAVELET_NONE) {
            if (ccfg.clamp_method[pno] === CLAMP_NONE) {
                out.writeInt(false, 9, val);
            } else if (ccfg.clamp_method[pno] === CLAMP_MOD256) {
                out.writeInt(true, 8, val);
            }
        } else {
            out.writeInt(false, bits + 1, val);
        }
    }

    private encodePacked(planes: Planes, pno: number, segments: Segment[], ccfg: ChannelHeaderConfig) {
        const out = new BitOutput();
        const bits = packedBitCount(ccfg.transform_scale[pno]);
        for (const s of segments) {
            for (let x = 0; x < s.size; x++) {
                for (let y = 0; y < s.size; y++) {
                    this.emitPackedBits(out, pno, bits, planes.get(pno, s.x + x, s.y + y), ccfg);
                }
            }
        }
        out.align(1);
        this.o.bytes(out.toByteArray());
    }

    private encodeRLE(planes: Planes, pno: number, segments: Segment[], ccfg: ChannelHeaderConfig) {
        const out = new BitOutput();
        const bits = packedBitCount(ccfg.transform_scale[pno]);
        let currentval = 0;
        let firstval = true;
        let currentcnt = 0;

        const flush = () => {
            if (currentcnt === 1) {
                out.writeBoolean(false);
            } else {
                out.writeBoolean(true);
                out.writeInt(true, 7, currentcnt - 2);
            }
            this.emitPackedBits(out, pno, bits, currentval, ccfg);
        };

        for (const s of segments) {
            for (let x = 0; x < s.size; x++) {
                for (let y = 0; y < s.size; y++) {
                    const val = planes.get(pno, s.x + x, s.y + y);
                    if (firstval) {
                        currentval = val;
                        currentcnt = 1;
                        firstval = false;
                    } else if (currentval !== val || currentcnt === 129) {
                        flush();
                        currentval = val;
                        currentcnt = 1;
                    } else {
                        currentcnt++;
                    }
                }
            }
        }
        // final run: the original has a typo here (`if (currentval == 1)`), we flush
        // correctly - both stream variants are read fine by either decoder
        if (!firstval) flush();

        out.align(1);
        this.o.bytes(out.toByteArray());
    }

    writeSeparator(count: number, val: number) {
        this.o.fill(count, val);
    }

    /** Backpatch the size table at offset 16, like the original's RandomAccessFile close(). */
    finish(): Uint8Array {
        let off = 16;
        for (const v of this.segmentation_sizes) {
            this.o.patchI32(off, v);
            off += 4;
        }
        for (const v of this.segmdata_sizes) {
            this.o.patchI32(off, v);
            off += 4;
        }
        for (const v of this.data_sizes) {
            this.o.patchI32(off, v);
            off += 4;
        }
        return this.o.toUint8Array();
    }
}

export class GlicReader {
    private data: Uint8Array;
    private pos = 0;

    w = 0;
    h = 0;
    colorspace = 0;
    color_outside: [number, number, number] = [0, 0, 0];
    segmentation_sizes = [0, 0, 0, 0];
    segmdata_sizes = [0, 0, 0, 0];
    data_sizes = [0, 0, 0, 0];
    encoding_method = [0, 0, 0];
    prediction_method = [0, 0, 0];
    clamp_method = [0, 0, 0];
    quant_value = [0, 0, 0];
    transform_method = [0, 0, 0];
    transform_type = [0, 0, 0];
    transform_scale = [0, 0, 0];

    constructor(data: Uint8Array) {
        this.data = data;
    }

    // --- EOF-tolerant primitives, mirroring DataInputStream + "ignore EOF" behavior ---

    skip(bytes: number) {
        this.pos += bytes;
    }

    private u8(): number {
        if (this.pos >= this.data.length) throw new Error('EOF');
        return this.data[this.pos++];
    }

    private i32(): number {
        const a = this.u8();
        const b = this.u8();
        const c = this.u8();
        const d = this.u8();
        return ((a << 24) | (b << 16) | (c << 8) | d) | 0;
    }

    /** readFully that zero-fills on EOF, like the original readArray. */
    readArray(size: number): Uint8Array {
        const res = new Uint8Array(Math.max(0, size));
        const avail = Math.max(0, Math.min(size, this.data.length - this.pos));
        if (avail > 0) res.set(this.data.subarray(this.pos, this.pos + avail));
        this.pos += Math.max(0, size);
        return res;
    }

    readFirstHeader() {
        this.skip(4); // GLIC
        this.w = Math.max(64, Math.abs(this.i32()) % 8192);
        this.h = Math.max(64, Math.abs(this.i32()) % 8192);
        this.colorspace = this.u8();
        this.color_outside = [this.u8(), this.u8(), this.u8()];
        for (let i = 0; i < 4; i++) this.segmentation_sizes[i] = this.i32() & 0x7ffff;
        for (let i = 0; i < 4; i++) this.segmdata_sizes[i] = this.i32() & 0xffffff;
        for (let i = 0; i < 4; i++) this.data_sizes[i] = this.i32() & 0x3ffffff;
        this.skip(128 - 16 - 16 - 16 - 16);
    }

    readSecondHeader() {
        for (let p = 0; p < 3; p++) {
            this.skip(4); // channel mark
            this.prediction_method[p] = this.u8();
            this.quant_value[p] = this.u8();
            this.clamp_method[p] = this.u8();
            this.transform_method[p] = this.u8();
            this.transform_type[p] = this.u8();
            this.transform_scale[p] = this.i32();
            this.encoding_method[p] = this.u8();
            this.skip(32 - 4 - 6 - 4);
        }
    }

    readSegmentsData(p: number, segments: Segment[]) {
        const bytes = this.readArray(this.segmdata_sizes[p]);
        let off = 0;
        for (const s of segments) {
            if (off + 8 > bytes.length) break; // EOF-tolerant
            let pred_type = bytes[off];
            pred_type = pred_type === PRED_NONE ? this.prediction_method[p] : pred_type;
            s.pred_type = pred_type;
            const rx = (bytes[off + 1] << 8) | bytes[off + 2];
            const ry = (bytes[off + 3] << 8) | bytes[off + 4];
            s.refx = rx & 0x8000 ? rx - 0x10000 : rx;
            s.refy = ry & 0x8000 ? ry - 0x10000 : ry;
            s.refa = bytes[off + 5] % 3;
            const ang = (bytes[off + 6] << 8) | bytes[off + 7];
            s.angle = (ang & 0x8000 ? ang - 0x10000 : ang) / 0x7000;
            off += 8;
        }
    }

    readData(method: number, planes: Planes, pno: number, segments: Segment[]) {
        switch (method) {
            case ENCODING_PACKED:
                this.decodePacked(planes, pno, segments);
                break;
            case ENCODING_RLE:
                this.decodeRLE(planes, pno, segments);
                break;
            default:
                this.decodeRaw(planes, pno, segments);
        }
    }

    private decodeRaw(planes: Planes, pno: number, segments: Segment[]) {
        try {
            let idx = 0;
            for (const s of segments) {
                for (let x = 0; x < s.size; x++) {
                    for (let y = 0; y < s.size; y++) {
                        if (idx < this.data_sizes[pno]) {
                            planes.set(pno, s.x + x, s.y + y, this.i32());
                            idx += 4;
                        }
                    }
                }
            }
        } catch {
            // EOF - keep whatever was decoded (original behavior)
        }
    }

    private decodePackedBits(input: BitInput, pno: number, bits: number): number {
        if (this.transform_method[pno] === WAVELET_NONE) {
            if (this.clamp_method[pno] === CLAMP_NONE) {
                return input.readInt(false, 9);
            } else if (this.clamp_method[pno] === CLAMP_MOD256) {
                return input.readInt(true, 8);
            }
            return 0;
        }
        return input.readInt(false, bits + 1);
    }

    private decodePacked(planes: Planes, pno: number, segments: Segment[]) {
        const d = this.readArray(this.data_sizes[pno]);
        const input = new BitInput(d);
        const bits = packedBitCount(this.transform_scale[pno]);
        try {
            for (const s of segments) {
                for (let x = 0; x < s.size; x++) {
                    for (let y = 0; y < s.size; y++) {
                        planes.set(pno, s.x + x, s.y + y, this.decodePackedBits(input, pno, bits));
                    }
                }
            }
        } catch {
            // EOF / invalid bit count - keep partial data (original behavior)
        }
    }

    private decodeRLE(planes: Planes, pno: number, segments: Segment[]) {
        const d = this.readArray(this.data_sizes[pno]);
        const input = new BitInput(d);
        const bits = packedBitCount(this.transform_scale[pno]);
        let currentval = 0;
        let do_read_type = true;
        let currentcnt = 0;
        try {
            for (const s of segments) {
                for (let x = 0; x < s.size; x++) {
                    for (let y = 0; y < s.size; y++) {
                        if (do_read_type) {
                            if (input.readBoolean()) {
                                currentcnt = input.readInt(true, 7) + 2;
                                do_read_type = false;
                            }
                            currentval = this.decodePackedBits(input, pno, bits);
                        }
                        planes.set(pno, s.x + x, s.y + y, currentval);
                        currentcnt--;
                        if (currentcnt <= 0) do_read_type = true;
                    }
                }
            }
        } catch {
            // EOF - keep partial data (original behavior)
        }
    }
}
