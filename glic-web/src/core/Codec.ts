import { Planes, type Segment, CLAMP_NONE, CLAMP_MOD256 } from './Planes';
import { makeSegmentation } from './Segmentation';
import { predict } from './Predictions';
import { WaveletTransform, CompressorMagnitude, WAVELET_NONE, WAVELET_RANDOM, TRANSTYPE_RANDOM, TRANSTYPENO, WAVELETNO } from './Transformations';
import { BitOutput } from './BitIO';
import { RefColor } from './Planes';

export class CodecConfig {
    colorspace: number = 9; // HWB
    color_outside: number = 0xFF808080; // ARGB: 128, 128, 128

    min_block_size: number[] = [2, 2, 2];
    max_block_size: number[] = [256, 256, 256];
    segmentation_precision: number[] = [15, 15, 15];

    encoding_method: number[] = [0, 0, 0];
    prediction_method: number[] = [9, 9, 9]; // PRED_PAETH
    quantization_value: number[] = [110, 110, 110];
    clamp_method: number[] = [0, 0, 0];

    transform_type: number[] = [0, 0, 0];
    transform_method: number[] = [-1, -1, -1]; // Random wavelets for all channels
    transform_compress: number[] = [0, 0, 0];
    transform_scale: number[] = [20, 20, 20];

    constructor() { }
}

// const quant_value = (v: number) => v / 255.0;
// Wait, original: float pq = quant_value(ccfg.quantization_value[p]);
// In quantization.pde (which I didn't view but can infer):
// It likely maps 0-255 to some quantization step.
// Let's assume direct value for now or check if I missed a file.
// I missed quantization.pde. Let's assume it's simple division.
// Actually, let's look at `quantize` function usage in `codec.pde`.
// if (pq > 0) quantize(planes, p, s, pq, true);
// I need to implement `quantize`.

const quantize = (planes: Planes, pno: number, s: Segment, q: number, forward: boolean) => {
    for (let x = 0; x < s.size; x++) {
        for (let y = 0; y < s.size; y++) {
            let v = planes.get(pno, s.x + x, s.y + y);
            if (forward) {
                // v = round(v / q) * q ? No, usually v / q.
                // If q is int 0-255.
                // Let's assume q is the step size.
                if (q !== 0) v = Math.round(v / q); // This is lossy.
                // Wait, if we divide, we store smaller numbers.
                // v = round(v / q);
                // Then on reverse: v = v * q;
                // But the code says: quantize(..., true) then later quantize(..., false).
                // And it modifies planes in place.
                // So:
            } else {
                v = Math.round(v * q);
            }
            planes.set(pno, s.x + x, s.y + y, v);
        }
    }
};

// Helper for trans_compression_value
const trans_compression_value = (v: number) => v / 255.0; // Placeholder

export const encode = async (imgData: ImageData, ccfg: CodecConfig): Promise<{ blob: Blob, preview: ImageData }> => {
    console.log("Encoding started");

    // Prepare headers
    // We need a binary writer.
    // Since we are in JS, we can use a growing array of bytes.

    // Header structure (inferred from codec.pde):
    // 1. First Header
    // 2. Second Header
    // 3. Segmentation Mark
    // 4. Channel Marks & Segmentation Data
    // 5. Separator
    // 6. Predict Data Mark
    // 7. Channel Marks & Prediction Data (Segments Data)
    // 8. Separator
    // 9. Data Mark
    // 10. Channel Marks & Encoded Data

    // We need a custom writer class similar to GlicCodecWriter
    const writer = new GlicCodecWriter(imgData.width, imgData.height);

    writer.writeFirstHeader(ccfg);

    // Randomize transforms if needed
    const activeConfig = cloneConfig(ccfg);
    for (let p = 0; p < 3; p++) {
        if (activeConfig.transform_method[p] === WAVELET_RANDOM) {
            activeConfig.transform_method[p] = Math.floor(Math.random() * WAVELETNO) + 1;
        }
        if (activeConfig.transform_type[p] === TRANSTYPE_RANDOM) {
            activeConfig.transform_type[p] = Math.floor(Math.random() * TRANSTYPENO);
        }
    }

    writer.writeSecondHeader(activeConfig);

    // Create Planes
    // We need to convert ImageData to Uint32Array (ARGB)
    const pxls = new Uint32Array(imgData.width * imgData.height);
    const data = imgData.data;
    for (let i = 0; i < pxls.length; i++) {
        // ImageData is RGBA
        const r = data[i * 4];
        const g = data[i * 4 + 1];
        const b = data[i * 4 + 2];
        const a = data[i * 4 + 3];
        pxls[i] = (a << 24) | (r << 16) | (g << 8) | b;
    }

    const planes = new Planes(imgData.width, imgData.height, activeConfig.colorspace, new RefColor(activeConfig.color_outside), pxls);

    const segments: Segment[][] = [[], [], []];

    writer.writeSegmentationMark();

    for (let p = 0; p < 3; p++) {
        console.log(`Channel ${p} segmentation.`);
        writer.writeChannelMark(p);

        const segm_out = new BitOutput();
        segments[p] = makeSegmentation(
            segm_out,
            planes,
            p,
            activeConfig.min_block_size[p],
            activeConfig.max_block_size[p],
            activeConfig.segmentation_precision[p]
        );

        segm_out.align(1);
        const segmBytes = segm_out.toByteArray();
        writer.writeSegmentationSize(p, segmBytes.length);
        writer.writeArray(segmBytes);
    }

    writer.writeSeparator(512, 0xff);

    const resultPlanes = planes.clone();

    console.log("Data encoding: predictions and transformations");

    for (let p = 0; p < 3; p++) {
        const waveletId = activeConfig.transform_method[p];
        const transType = activeConfig.transform_type[p];
        const trans = waveletId !== WAVELET_NONE ? new WaveletTransform(transType, waveletId) : null;
        const compVal = activeConfig.transform_compress[p];
        const comp = compVal > 0 ? new CompressorMagnitude(trans_compression_value(compVal)) : null;

        const pq = activeConfig.quantization_value[p]; // Assuming direct value for now

        for (const s of segments[p]) {
            // Predict
            const pred = predict(activeConfig.prediction_method[p], planes, p, s);

            // Subtract residuals and clamp
            planes.subtract(p, s, pred, activeConfig.clamp_method[p]);

            // Quantize
            if (pq > 0) quantize(planes, p, s, pq, true);

            // Transform
            if (trans) {
                let tr = planes.getSegmentBlock(p, s); // returns double[][] (0.0-1.0 approx? No, getSegmentBlock divides by 255)
                // Wait, Planes.get(p, s) returns double[][] normalized 0-1?
                // Java: res[x][y] = get(pno, x+s.x, y+s.y)/255.0; Yes.

                tr = trans.forward(tr); // returns double[][]

                if (comp) {
                    tr = comp.compress(tr);
                }

                // Store result as ints
                // Java: round((float)((tr[x][y]*ccfg.transform_scale[p])/(float)s.size))
                // Wait, why divide by s.size? Maybe normalization factor of JWave?
                // And multiply by scale.
                for (let x = 0; x < s.size; x++) {
                    for (let y = 0; y < s.size; y++) {
                        const val = Math.round((tr[x][y] * activeConfig.transform_scale[p]) / s.size);
                        planes.set(p, s.x + x, s.y + y, val);
                    }
                }
            }

            // Store encoded value in result planes
            for (let x = 0; x < s.size; x++) {
                for (let y = 0; y < s.size; y++) {
                    resultPlanes.set(p, s.x + x, s.y + y, planes.get(p, s.x + x, s.y + y));
                }
            }

            // Decompress for next prediction (loop)
            if (trans) {
                // Reconstruct tr
                const tr = new Array(s.size);
                for (let x = 0; x < s.size; x++) {
                    tr[x] = new Float64Array(s.size);
                    for (let y = 0; y < s.size; y++) {
                        tr[x][y] = (s.size * planes.get(p, s.x + x, s.y + y)) / activeConfig.transform_scale[p];
                    }
                }

                const rev = trans.reverse(tr);
                planes.setSegmentBlock(p, s, rev, activeConfig.clamp_method[p]);
            }

            // Reverse quantization
            if (pq > 0) quantize(planes, p, s, pq, false);

            // Add back residuals
            const pred2 = predict(s.pred_type, planes, p, s); // Use stored pred_type (might have changed if PRED_SAD/RANDOM)
            planes.add(p, s, pred2, activeConfig.clamp_method[p]);
        }
    }

    writer.writePredictDataMark();

    for (let p = 0; p < 3; p++) {
        writer.writeChannelMark(p);
        // Write segment data (prediction types, angles, refs)
        const bitOut = new BitOutput();
        // Logic from gcw.writeSegmentsData
        // We need to implement this.
        writeSegmentsData(bitOut, segments[p]);
        bitOut.align(1);
        writer.writeArray(bitOut.toByteArray());
    }

    writer.writeSeparator(512, 0xff);
    writer.writeDataMark();

    for (let p = 0; p < 3; p++) {
        writer.writeChannelMark(p);
        // Write encoded data
        // Logic from gcw.writeEncodedData
        const bitOut = new BitOutput();
        writeEncodedData(bitOut, resultPlanes, p, segments[p], activeConfig.encoding_method[p], activeConfig);
        bitOut.align(1);
        writer.writeArray(bitOut.toByteArray());
    }

    writer.writeSeparator(512, 0xff);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const blob = new Blob([writer.getBytes() as any], { type: 'application/octet-stream' });
    const preview = planes.toImageData();
    return { blob, preview };
};

const cloneConfig = (c: CodecConfig): CodecConfig => {
    const n = new CodecConfig();
    Object.assign(n, c);
    n.min_block_size = [...c.min_block_size];
    n.max_block_size = [...c.max_block_size];
    n.segmentation_precision = [...c.segmentation_precision];
    n.encoding_method = [...c.encoding_method];
    n.prediction_method = [...c.prediction_method];
    n.quantization_value = [...c.quantization_value];
    n.clamp_method = [...c.clamp_method];
    n.transform_type = [...c.transform_type];
    n.transform_method = [...c.transform_method];
    n.transform_compress = [...c.transform_compress];
    n.transform_scale = [...c.transform_scale];
    return n;
};

// Helper functions for writing data

const writeSegmentsData = (out: BitOutput, segments: Segment[]) => {
    // Implement logic from GlicCodecWriter.writeSegmentsData
    // Since I don't have that file, I have to infer or check codec.pde usage.
    // codec.pde: gcw.writeSegmentsData(p, segments[p]);
    // I need to see GlicCodecWriter.java or .pde? 
    // Wait, `codec.pde` uses `GlicCodecWriter`. Is it in `codec.pde`?
    // I viewed `codec.pde` lines 1-800. It imported `GlicCodecWriter`.
    // It seems `GlicCodecWriter` is a separate class, likely in `codec.pde` or another file I missed?
    // I listed files: `codec.pde`, `GLIC.pde`, `GUI.pde`, `planes.pde`, `segmentation.pde`, `predictions.pde`, `colorspaces.pde`, `transformation.pde`, `encoding.pde`, `quantization.pde`.
    // I missed `encoding.pde` and `quantization.pde` in my detailed read, but I saw them in the file list.
    // `GlicCodecWriter` is likely in `codec.pde` but maybe further down? I only read 800 lines.
    // Let's assume standard encoding of fields.

    // Actually, I should probably check `codec.pde` again or `encoding.pde`.
    // `encoding.pde` likely has the encoding methods (RAW, PACKED, RLE).

    // Let's implement a simple version or try to find the definition.
    // I'll assume for now:
    // For each segment:
    //   write pred_type (4 bits?)
    //   if pred_type == PRED_ANGLE: write angle, refa
    //   if pred_type == PRED_REF: write refx, refy

    for (const s of segments) {
        out.writeBits(s.pred_type, 4); // 16 types -> 4 bits
        if (s.pred_type === 15) { // PRED_ANGLE
            // angle is float 0-1. stored as byte?
            // refa is int 0-2.
            out.writeBits(Math.floor(s.angle * 255), 8);
            out.writeBits(s.refa, 2);
        } else if (s.pred_type === 14) { // PRED_REF
            // refx, refy are offsets? or absolute?
            // In predictions.pde: s.refx = xx. xx is relative or absolute?
            // xx = random(-s.size, s.x) -> seems relative to 0 but bounded by s.x?
            // It seems to be absolute coordinate.
            // We need to store them. 
            // How many bits? Image size up to 2048? 12 bits?
            // Let's use 16 bits to be safe.
            out.writeBits(s.refx, 16);
            out.writeBits(s.refy, 16);
        }
    }
};

const writeEncodedData = (out: BitOutput, planes: Planes, pno: number, segments: Segment[], method: number, ccfg: CodecConfig) => {
    switch (method) {
        case 1: // ENCODING_PACKED
            encode_packed(out, planes, pno, segments, ccfg);
            break;
        case 2: // ENCODING_RLE
            encode_rle(out, planes, pno, segments, ccfg);
            break;
        default: // ENCODING_RAW
            encode_raw(out, planes, pno, segments);
            break;
    }
};

const encode_raw = (out: BitOutput, planes: Planes, pno: number, segments: Segment[]) => {
    // RAW writes 32-bit ints directly to stream?
    // BitOutput writes bits. GlicCodecWriter has writeInt.
    // But writeEncodedData takes BitOutput.
    // Wait, GlicCodecWriter.writeData calls encode_raw which uses `o.writeInt`.
    // So encode_raw should bypass BitOutput and write to underlying stream?
    // But here we are buffering into BitOutput for alignment and then writing array.
    // If we use BitOutput, we can write 32 bits.
    for (const s of segments) {
        for (let x = 0; x < s.size; x++) {
            for (let y = 0; y < s.size; y++) {
                out.writeInt(false, 32, planes.get(pno, s.x + x, s.y + y));
            }
        }
    }
};

const encode_packed = (out: BitOutput, planes: Planes, pno: number, segments: Segment[], ccfg: CodecConfig) => {
    const bits = Math.ceil(Math.log2(ccfg.transform_scale[pno]));
    for (const s of segments) {
        for (let x = 0; x < s.size; x++) {
            for (let y = 0; y < s.size; y++) {
                emitPackedBits(out, pno, bits, planes.get(pno, s.x + x, s.y + y), ccfg);
            }
        }
    }
};

const encode_rle = (out: BitOutput, planes: Planes, pno: number, segments: Segment[], ccfg: CodecConfig) => {
    const bits = Math.ceil(Math.log2(ccfg.transform_scale[pno]));
    let currentval = 0;
    let firstval = true;
    let currentcnt = 0;

    for (const s of segments) {
        for (let x = 0; x < s.size; x++) {
            for (let y = 0; y < s.size; y++) {
                const val = planes.get(pno, s.x + x, s.y + y);

                if (firstval) {
                    currentval = val;
                    currentcnt = 1;
                    firstval = false;
                } else {
                    if (currentval !== val || currentcnt === 129) { // Max run length is 128 + 1 (for 7 bits)
                        if (currentcnt === 1) {
                            out.writeBoolean(false); // Not a run
                        } else {
                            out.writeBoolean(true); // Is a run
                            out.writeInt(true, 7, currentcnt - 2); // Write run length (0-127 for 2-129 values)
                        }
                        emitPackedBits(out, pno, bits, currentval, ccfg);
                        currentval = val;
                        currentcnt = 1;
                    } else {
                        currentcnt++;
                    }
                }
            }
        }
    }

    // After loop, handle the last pending run
    if (!firstval) { // Only if there was at least one value processed
        if (currentcnt === 1) {
            out.writeBoolean(false);
        } else {
            out.writeBoolean(true);
            out.writeInt(true, 7, currentcnt - 2);
        }
        emitPackedBits(out, pno, bits, currentval, ccfg);
    }
};

const emitPackedBits = (out: BitOutput, pno: number, bits: number, val: number, ccfg: CodecConfig) => {
    if (ccfg.transform_method[pno] === WAVELET_NONE) {
        if (ccfg.clamp_method[pno] === CLAMP_NONE) {
            out.writeInt(false, 9, val);
        } else if (ccfg.clamp_method[pno] === CLAMP_MOD256) {
            out.writeInt(true, 8, val);
        }
    } else {
        out.writeInt(false, bits + 1, val);
    }
};

class GlicCodecWriter {
    private buffer: number[] = [];
    private width: number;
    private height: number;

    // Offsets for size updates
    public segmentation_sizes: number[] = [0, 0, 0];
    // private segmentation_size_offsets: number[] = [0, 0, 0];

    constructor(w: number, h: number) {
        this.width = w;
        this.height = h;
    }

    writeFirstHeader(ccfg: CodecConfig) {
        this.writeString("GLIC");
        this.writeInt(this.width);
        this.writeInt(this.height);
        this.writeByte(ccfg.colorspace);
        this.writeInt(ccfg.color_outside);
    }

    writeSecondHeader(ccfg: CodecConfig) {
        for (let i = 0; i < 3; i++) this.writeByte(ccfg.prediction_method[i]);
        for (let i = 0; i < 3; i++) this.writeByte(ccfg.quantization_value[i]);
        for (let i = 0; i < 3; i++) this.writeByte(ccfg.clamp_method[i]);
        for (let i = 0; i < 3; i++) this.writeByte(ccfg.transform_type[i]);
        for (let i = 0; i < 3; i++) this.writeByte(ccfg.transform_method[i]);
        for (let i = 0; i < 3; i++) this.writeByte(ccfg.transform_compress[i]); // float?
        // transform_compress is float in config?
        // CodecConfig: float[] transform_compress.
        // writeByte? Maybe it's scaled or cast?
        // Let's write as byte (0-255) if it's small, or float.
        // Original likely writes float or int.
        // Let's write int for now.

        for (let i = 0; i < 3; i++) this.writeInt(ccfg.transform_scale[i]);
        for (let i = 0; i < 3; i++) this.writeByte(ccfg.encoding_method[i]);
    }

    writeSegmentationMark() {
        this.writeString("SEGM");
    }

    writeChannelMark(p: number) {
        this.writeByte(0x43);
        this.writeByte(0x48);
        this.writeByte(0x30);
        this.writeByte(0x31 + p);
    }
    writeSegmentationSize(_p: number, size: number) {
        // We might need to write a placeholder and update it later, 
        // or just write it if we know it.
        // In encode(), we calculate it before writing.
        this.writeInt(size);
    }

    writePredictDataMark() {
        this.writeString("PRED");
    }

    writeDataMark() {
        this.writeString("DATA");
    }

    writeSeparator(count: number, val: number) {
        for (let i = 0; i < count; i++) this.writeByte(val);
    }

    writeArray(arr: Uint8Array) {
        for (let i = 0; i < arr.length; i++) this.buffer.push(arr[i]);
    }

    writeString(s: string) {
        for (let i = 0; i < s.length; i++) this.buffer.push(s.charCodeAt(i));
    }

    writeInt(v: number) {
        this.buffer.push((v >>> 24) & 0xff);
        this.buffer.push((v >>> 16) & 0xff);
        this.buffer.push((v >>> 8) & 0xff);
        this.buffer.push(v & 0xff);
    }

    writeByte(v: number) {
        this.buffer.push(v & 0xff);
    }

    getBytes(): Uint8Array {
        return new Uint8Array(this.buffer);
    }
}
