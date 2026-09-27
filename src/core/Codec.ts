// Faithful port of the original GLIC codec.pde: encode (which internally decodes to
// produce the glitched preview) and decode, sharing the byte-exact .glic container
// in GlicFormat.ts.

import { Planes, RefColor, type Segment } from './Planes';
import { makeSegmentation, readSegmentation } from './Segmentation';
import { predict, PredictScratch } from './Predictions';
import {
    WaveletTransform,
    CompressorMagnitude,
    WAVELET_NONE,
    WAVELET_RANDOM,
    TRANSTYPE_RANDOM,
    TRANSTYPENO,
    WAVELETNO,
    resolveWaveletId,
    resolveTransType,
    isValidWaveletId,
} from './Wavelets';
import { BitOutput, BitInput } from './BitIO';
import { GlicWriter, GlicReader } from './GlicFormat';

export class CodecConfig {
    colorspace: number = 9; // HWB
    color_outside: number = 0xff808080; // ARGB

    min_block_size: number[] = [2, 2, 2];
    max_block_size: number[] = [256, 256, 256];
    segmentation_precision: number[] = [15, 15, 15];

    encoding_method: number[] = [0, 0, 0];
    prediction_method: number[] = [9, 9, 9]; // PRED_PAETH
    quantization_value: number[] = [110, 110, 110];
    clamp_method: number[] = [0, 0, 0];

    transform_type: number[] = [0, 0, 0];
    transform_method: number[] = [-1, -1, -1]; // random wavelet
    transform_compress: number[] = [0, 0, 0];
    // effective scale (the original GUI stores 2^slider; slider default 20)
    transform_scale: number[] = [1 << 20, 1 << 20, 1 << 20];
}

export const cloneConfig = (c: CodecConfig): CodecConfig => {
    const n = new CodecConfig();
    n.colorspace = c.colorspace;
    n.color_outside = c.color_outside;
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

// Original quantization.pde / codec.pde value mappings
export const quant_value = (v: number) => v / 2.0;
export const trans_compression_value = (v: number) => 50 * (v / 255.0) * (v / 255.0);

const INT_MAX = 2147483647;
const INT_MIN = -2147483648;
/** Java Math.round(float)-style: round half up, saturating to int range. */
const roundInt = (v: number) => {
    if (Number.isNaN(v)) return 0;
    const r = Math.round(v);
    return r > INT_MAX ? INT_MAX : r < INT_MIN ? INT_MIN : r;
};

/** Original quantize(): divide/multiply, active only when the step is > 1. */
const quantize = (planes: Planes, pno: number, s: Segment, val: number, forward: boolean) => {
    if (val > 1) {
        for (let x = 0; x < s.size; x++) {
            for (let y = 0; y < s.size; y++) {
                let col = planes.get(pno, s.x + x, s.y + y);
                col = forward ? col / val : col * val;
                planes.set(pno, s.x + x, s.y + y, roundInt(col));
            }
        }
    }
};

export interface EncodeResult {
    file: Uint8Array;
    preview: ImageData;
    /** config with RANDOM wavelet/transform-type resolved to the actually used values */
    resolvedConfig: CodecConfig;
    segments: Segment[][];
}

export type ProgressFn = (channel: number, done: number, total: number) => void;

export const imageDataToPixels = (imgData: ImageData): Uint32Array => {
    const pxls = new Uint32Array(imgData.width * imgData.height);
    const data = imgData.data;
    for (let i = 0; i < pxls.length; i++) {
        pxls[i] =
            (((data[i * 4 + 3] & 0xff) << 24) |
                ((data[i * 4] & 0xff) << 16) |
                ((data[i * 4 + 1] & 0xff) << 8) |
                (data[i * 4 + 2] & 0xff)) >>>
            0;
    }
    return pxls;
};

/**
 * Runs prediction/quantization/transform/encode for one channel, in place.
 * Shared between encode (channel loop) and the parallel worker path.
 */
export const processChannelEncode = (
    planes: Planes,
    result: Planes,
    p: number,
    segments: Segment[],
    ccfg: CodecConfig,
    onProgress?: ProgressFn
) => {
    const waveletId = ccfg.transform_method[p];
    const trans =
        waveletId === WAVELET_NONE
            ? null
            : new WaveletTransform(resolveTransType(ccfg.transform_type[p]), resolveWaveletId(waveletId));
    const compVal = ccfg.transform_compress[p];
    const comp = compVal > 0 ? new CompressorMagnitude(trans_compression_value(compVal)) : null;
    const pq = quant_value(ccfg.quantization_value[p]);
    const clampMethod = ccfg.clamp_method[p];
    const scale = ccfg.transform_scale[p];

    const scratch = new PredictScratch();
    let block = new Float64Array(0);

    let done = 0;
    for (const s of segments) {
        const size = s.size;
        const n = size * size;
        if (block.length < n) block = new Float64Array(n);

        // predict and subtract residuals
        const pred = predict(ccfg.prediction_method[p], planes, p, s, scratch);
        planes.subtract(p, s, pred, clampMethod);

        // quantize
        if (pq > 0) quantize(planes, p, s, pq, true);

        // transform + compress
        if (trans) {
            planes.getSegmentBlock(p, s, block);
            trans.forward2D(block, size);
            if (comp) comp.compress(block, n);
            for (let x = 0; x < size; x++) {
                for (let y = 0; y < size; y++) {
                    planes.set(p, s.x + x, s.y + y, roundInt((block[x * size + y] * scale) / size));
                }
            }
        }

        // store the encoded values for serialization
        for (let x = 0; x < size; x++) {
            for (let y = 0; y < size; y++) {
                result.set(p, s.x + x, s.y + y, planes.get(p, s.x + x, s.y + y));
            }
        }

        // reconstruct (the encode loop decodes as it goes - later segments predict
        // from reconstructed data, and the preview is the reconstruction)
        if (trans) {
            for (let x = 0; x < size; x++) {
                for (let y = 0; y < size; y++) {
                    block[x * size + y] = (size * planes.get(p, s.x + x, s.y + y)) / scale;
                }
            }
            trans.reverse2D(block, size);
            planes.setSegmentBlock(p, s, block, clampMethod);
        }

        if (pq > 0) quantize(planes, p, s, pq, false);

        const pred2 = predict(s.pred_type, planes, p, s, scratch);
        planes.add(p, s, pred2, clampMethod);

        done++;
        if (onProgress && (done & 63) === 0) onProgress(p, done, segments.length);
    }
    if (onProgress) onProgress(p, segments.length, segments.length);
};

/** Resolves RANDOM wavelet/transform-type choices in place (done once, pre-header). */
export const resolveRandomTransforms = (ccfg: CodecConfig) => {
    for (let p = 0; p < 3; p++) {
        if (ccfg.transform_method[p] === WAVELET_RANDOM) {
            ccfg.transform_method[p] = 1 + Math.floor(Math.random() * (WAVELETNO - 1));
        }
        if (ccfg.transform_type[p] === TRANSTYPE_RANDOM) {
            ccfg.transform_type[p] = Math.floor(Math.random() * TRANSTYPENO);
        }
    }
};

export const encode = (imgData: ImageData, config: CodecConfig, onProgress?: ProgressFn): EncodeResult => {
    const ccfg = cloneConfig(config);
    resolveRandomTransforms(ccfg);

    const writer = new GlicWriter();
    const co = ccfg.color_outside;
    writer.writeFirstHeader(imgData.width, imgData.height, ccfg.colorspace, (co >>> 16) & 0xff, (co >>> 8) & 0xff, co & 0xff);
    writer.writeSecondHeader(ccfg);

    const planes = new Planes(
        imgData.width,
        imgData.height,
        ccfg.colorspace,
        new RefColor(ccfg.color_outside, ccfg.colorspace),
        imageDataToPixels(imgData)
    );

    const segments: Segment[][] = [[], [], []];

    writer.writeSegmentationMark();
    for (let p = 0; p < 3; p++) {
        writer.writeChannelMark(p);
        const segm_out = new BitOutput();
        segments[p] = makeSegmentation(
            segm_out,
            planes,
            p,
            ccfg.min_block_size[p],
            ccfg.max_block_size[p],
            ccfg.segmentation_precision[p]
        );
        segm_out.align(1);
        writer.writeSegmentation(p, segm_out.toByteArray());
    }

    writer.writeSeparator(512, 0xff);

    const result = planes.clone();

    for (let p = 0; p < 3; p++) {
        processChannelEncode(planes, result, p, segments[p], ccfg, onProgress);
    }

    writer.writePredictDataMark();
    for (let p = 0; p < 3; p++) {
        writer.writeChannelMark(p);
        writer.writeSegmentsData(p, segments[p], ccfg.prediction_method[p]);
    }

    writer.writeSeparator(512, 0xff);
    writer.writeDataMark();
    for (let p = 0; p < 3; p++) {
        writer.writeChannelMark(p);
        writer.writeData(ccfg.encoding_method[p], result, p, segments[p], ccfg);
    }

    return {
        file: writer.finish(),
        preview: planes.toImageData(),
        resolvedConfig: ccfg,
        segments,
    };
};

export interface DecodeOptions {
    /** Original GLIC's do_skip_header: ignore the file's settings, use these instead. */
    overrideConfig?: CodecConfig;
    /** With override: use per-channel settings (true) or channel 0 for all (false). */
    separateChannels?: boolean;
}

export interface DecodeResult {
    preview: ImageData;
    width: number;
    height: number;
    colorspace: number;
    segments: Segment[][];
}

/** Shared per-channel reconstruction, used by decode and the parallel worker path. */
export const processChannelDecode = (
    planes: Planes,
    p: number,
    segments: Segment[],
    reader: Pick<GlicReader, 'transform_method' | 'transform_type' | 'transform_scale' | 'quant_value' | 'clamp_method'>,
    onProgress?: ProgressFn
) => {
    const method = reader.transform_method[p];
    const trans =
        method === WAVELET_NONE
            ? null
            : new WaveletTransform(resolveTransType(reader.transform_type[p]), resolveWaveletId(method));
    const scale = reader.transform_scale[p];
    const pq = quant_value(reader.quant_value[p]);
    const clampMethod = reader.clamp_method[p];

    const scratch = new PredictScratch();
    let block = new Float64Array(0);

    let done = 0;
    for (const s of segments) {
        const size = s.size;
        const n = size * size;
        if (block.length < n) block = new Float64Array(n);

        if (trans) {
            for (let x = 0; x < size; x++) {
                for (let y = 0; y < size; y++) {
                    block[x * size + y] = (size * planes.get(p, s.x + x, s.y + y)) / scale;
                }
            }
            trans.reverse2D(block, size);
            planes.setSegmentBlock(p, s, block, clampMethod);
        }

        if (pq > 0) quantize(planes, p, s, pq, false);

        const pred = predict(s.pred_type, planes, p, s, scratch);
        planes.add(p, s, pred, clampMethod);

        done++;
        if (onProgress && (done & 63) === 0) onProgress(p, done, segments.length);
    }
    if (onProgress) onProgress(p, segments.length, segments.length);
};

export interface ParsedGlic {
    reader: GlicReader;
    planes: Planes;
    segments: Segment[][];
}

/** Header/segmentation/data parsing only - channel reconstruction happens separately. */
export const decodeParse = (file: Uint8Array, opts: DecodeOptions = {}): ParsedGlic => {
    const reader = new GlicReader(file);
    reader.readFirstHeader();
    reader.readSecondHeader();

    const ccfg = opts.overrideConfig;
    if (ccfg) {
        // do_skip_header behavior from the original decoder
        reader.colorspace = ccfg.colorspace;
        reader.color_outside = [
            (ccfg.color_outside >>> 16) & 0xff,
            (ccfg.color_outside >>> 8) & 0xff,
            ccfg.color_outside & 0xff,
        ];
        for (let p = 0; p < 3; p++) {
            const pp = opts.separateChannels ? p : 0;
            reader.prediction_method[p] = Math.max(0, ccfg.prediction_method[pp]);
            reader.quant_value[p] = ccfg.quantization_value[pp];
            reader.clamp_method[p] = ccfg.clamp_method[pp];
            reader.transform_method[p] = isValidWaveletId(ccfg.transform_method[pp])
                ? ccfg.transform_method[pp]
                : ccfg.transform_method[pp] === WAVELET_NONE
                  ? WAVELET_NONE
                  : resolveWaveletId(ccfg.transform_method[pp]);
            // original quirk: transform_type uses [p], not [pp]
            reader.transform_type[p] = ccfg.transform_type[p];
            reader.transform_scale[p] = ccfg.transform_scale[pp];
            reader.encoding_method[p] = ccfg.encoding_method[pp];
        }
    }

    const planes = new Planes(
        reader.w,
        reader.h,
        reader.colorspace,
        RefColor.fromRGB(reader.color_outside[0], reader.color_outside[1], reader.color_outside[2], reader.colorspace)
    );

    const segments: Segment[][] = [[], [], []];

    reader.skip(13); // segmentation mark
    for (let p = 0; p < 3; p++) {
        reader.skip(4); // channel mark
        const segmentationInfo = reader.readArray(reader.segmentation_sizes[p]);
        segments[p] = readSegmentation(new BitInput(segmentationInfo), planes);
    }

    reader.skip(512);
    reader.skip(12); // predict data mark
    for (let p = 0; p < 3; p++) {
        reader.skip(4);
        reader.readSegmentsData(p, segments[p]);
    }

    reader.skip(512);
    reader.skip(10); // image data mark
    for (let p = 0; p < 3; p++) {
        reader.skip(4);
        reader.readData(reader.encoding_method[p], planes, p, segments[p]);
    }

    return { reader, planes, segments };
};

export const decode = (file: Uint8Array, opts: DecodeOptions = {}, onProgress?: ProgressFn): DecodeResult => {
    const { reader, planes, segments } = decodeParse(file, opts);

    for (let p = 0; p < 3; p++) {
        processChannelDecode(planes, p, segments[p], reader, onProgress);
    }

    return {
        preview: planes.toImageData(),
        width: reader.w,
        height: reader.h,
        colorspace: reader.colorspace,
        segments,
    };
};
