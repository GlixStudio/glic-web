// Main-thread orchestrator: runs the three color channels in parallel on a pool of
// persistent workers, assembles the .glic file / preview, and reports progress.

import { CodecConfig, cloneConfig, resolveRandomTransforms, decodeParse, type DecodeOptions } from './Codec';
import { GlicWriter } from './GlicFormat';
import { fromColorspace } from './ColorSpaces';
import type { Segment } from './Planes';

export interface ChannelProgress {
    done: number;
    total: number;
}

export type EngineProgressFn = (perChannel: ChannelProgress[], overall: number) => void;

export interface EngineEncodeResult {
    file: Uint8Array;
    preview: ImageData;
    resolvedConfig: CodecConfig;
    segments: Segment[][];
}

export interface EngineDecodeResult {
    preview: ImageData;
    width: number;
    height: number;
    colorspace: number;
    segments: Segment[][];
}

interface ChannelEncodeOut {
    segmBytes: Uint8Array;
    segmDataBytes: Uint8Array;
    dataBytes: Uint8Array;
    segments: Segment[];
    reconChannel: Int32Array;
}

const channelsToImageData = (
    channels: Int32Array[],
    w: number,
    h: number,
    cs: number,
    alphaSrc: Uint8ClampedArray | null
): ImageData => {
    const data = new Uint8ClampedArray(w * h * 4);
    const n = w * h;
    for (let i = 0; i < n; i++) {
        const packed =
            ((0xff << 24) | ((channels[0][i] & 0xff) << 16) | ((channels[1][i] & 0xff) << 8) | (channels[2][i] & 0xff)) >>> 0;
        const rgb = fromColorspace(packed, cs);
        const idx = i * 4;
        data[idx] = (rgb >>> 16) & 0xff;
        data[idx + 1] = (rgb >>> 8) & 0xff;
        data[idx + 2] = rgb & 0xff;
        data[idx + 3] = alphaSrc ? alphaSrc[idx + 3] : 255;
    }
    return new ImageData(data, w, h);
};

export class GlicEngine {
    private workers: Worker[] = [];
    private busy = false;
    private activeRejects: ((e: Error) => void)[] = [];

    private ensureWorkers() {
        while (this.workers.length < 3) {
            this.workers.push(new Worker(new URL('../workers/channel.worker.ts', import.meta.url), { type: 'module' }));
        }
    }

    get isBusy() {
        return this.busy;
    }

    /** Terminates in-flight work; the pool is respawned on next use. */
    cancel() {
        for (const w of this.workers) w.terminate();
        this.workers = [];
        this.busy = false;
        const rejects = this.activeRejects;
        this.activeRejects = [];
        for (const reject of rejects) reject(new Error('cancelled'));
    }

    private async runChannels<T>(
        makeMessage: (p: number) => { msg: Record<string, unknown>; transfer?: Transferable[] },
        doneType: string,
        onProgress?: EngineProgressFn
    ): Promise<T[]> {
        this.ensureWorkers();
        this.busy = true;
        const id = Date.now() + Math.random();

        const progress: ChannelProgress[] = [
            { done: 0, total: 1 },
            { done: 0, total: 1 },
            { done: 0, total: 1 },
        ];
        const reportProgress = () => {
            if (!onProgress) return;
            const overall =
                progress.reduce((acc, c) => acc + (c.total ? c.done / c.total : 0), 0) / 3;
            onProgress(progress, overall);
        };

        const promises = [0, 1, 2].map(
            p =>
                new Promise<T>((resolve, reject) => {
                    this.activeRejects.push(reject);
                    const worker = this.workers[p];
                    worker.onmessage = (e: MessageEvent) => {
                        const d = e.data;
                        if (d.id !== id) return;
                        if (d.type === 'progress') {
                            progress[d.channel] = { done: d.done, total: d.total };
                            reportProgress();
                        } else if (d.type === doneType) {
                            resolve(d as T);
                        } else if (d.type === 'error') {
                            reject(new Error(`channel ${d.channel}: ${d.error}`));
                        }
                    };
                    worker.onerror = err => reject(new Error(err.message || 'worker error'));
                    const { msg, transfer } = makeMessage(p);
                    worker.postMessage({ ...msg, id }, { transfer: transfer ?? [] });
                })
        );

        try {
            return await Promise.all(promises);
        } finally {
            this.busy = false;
            this.activeRejects = [];
        }
    }

    async encode(imageData: ImageData, config: CodecConfig, onProgress?: EngineProgressFn): Promise<EngineEncodeResult> {
        const ccfg = cloneConfig(config);
        resolveRandomTransforms(ccfg);

        const outs = await this.runChannels<ChannelEncodeOut>(
            p => ({
                msg: {
                    cmd: 'encode-channel',
                    channel: p,
                    width: imageData.width,
                    height: imageData.height,
                    // structured-clone copies the pixels; each worker needs its own view
                    rgba: imageData.data.buffer,
                    config: ccfg,
                },
            }),
            'encoded',
            onProgress
        );

        const writer = new GlicWriter();
        const co = ccfg.color_outside;
        writer.writeFirstHeader(
            imageData.width,
            imageData.height,
            ccfg.colorspace,
            (co >>> 16) & 0xff,
            (co >>> 8) & 0xff,
            co & 0xff
        );
        writer.writeSecondHeader(ccfg);

        writer.writeSegmentationMark();
        for (let p = 0; p < 3; p++) {
            writer.writeChannelMark(p);
            writer.segmentation_sizes[p] = outs[p].segmBytes.length;
            writer.writeSegmentation(p, outs[p].segmBytes);
        }
        writer.writeSeparator(512, 0xff);

        writer.writePredictDataMark();
        for (let p = 0; p < 3; p++) {
            writer.writeChannelMark(p);
            writer.writeSegmentsDataBytes(p, outs[p].segmDataBytes);
        }
        writer.writeSeparator(512, 0xff);

        writer.writeDataMark();
        for (let p = 0; p < 3; p++) {
            writer.writeChannelMark(p);
            writer.writeDataBytes(p, outs[p].dataBytes);
        }

        const preview = channelsToImageData(
            [outs[0].reconChannel, outs[1].reconChannel, outs[2].reconChannel],
            imageData.width,
            imageData.height,
            ccfg.colorspace,
            imageData.data
        );

        return {
            file: writer.finish(),
            preview,
            resolvedConfig: ccfg,
            segments: outs.map(o => o.segments),
        };
    }

    async decode(file: Uint8Array, opts: DecodeOptions = {}, onProgress?: EngineProgressFn): Promise<EngineDecodeResult> {
        // header + entropy parsing is cheap; do it on the main thread
        const { reader, planes, segments } = decodeParse(file, opts);

        const header = {
            transform_method: [...reader.transform_method],
            transform_type: [...reader.transform_type],
            transform_scale: [...reader.transform_scale],
            quant_value: [...reader.quant_value],
            clamp_method: [...reader.clamp_method],
        };

        const outs = await this.runChannels<{ reconChannel: Int32Array }>(
            p => ({
                msg: {
                    cmd: 'decode-channel',
                    channel: p,
                    width: reader.w,
                    height: reader.h,
                    channelData: planes.channels[p].buffer,
                    refC: Array.from(planes.ref.c),
                    header,
                    segments: segments[p],
                },
                transfer: [planes.channels[p].buffer],
            }),
            'decoded',
            onProgress
        );

        const preview = channelsToImageData(
            [outs[0].reconChannel, outs[1].reconChannel, outs[2].reconChannel],
            reader.w,
            reader.h,
            reader.colorspace,
            null
        );

        return {
            preview,
            width: reader.w,
            height: reader.h,
            colorspace: reader.colorspace,
            segments,
        };
    }
}

export const glicEngine = new GlicEngine();
