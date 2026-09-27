// Per-channel codec worker. The three color channels are fully independent after
// colorspace extraction, so the engine runs one of these workers per channel.

import { Planes, RefColor, type Segment, newSegment } from '../core/Planes';
import { makeSegmentation } from '../core/Segmentation';
import { BitOutput } from '../core/BitIO';
import {
    CodecConfig,
    cloneConfig,
    processChannelEncode,
    processChannelDecode,
} from '../core/Codec';
import { encodeChannelData, encodeSegmentsData } from '../core/GlicFormat';

interface EncodeChannelMsg {
    cmd: 'encode-channel';
    id: number;
    channel: number;
    width: number;
    height: number;
    rgba: ArrayBuffer;
    config: CodecConfig; // randoms already resolved by the engine
}

export interface ChannelDecodeHeader {
    transform_method: number[];
    transform_type: number[];
    transform_scale: number[];
    quant_value: number[];
    clamp_method: number[];
}

interface DecodeChannelMsg {
    cmd: 'decode-channel';
    id: number;
    channel: number;
    width: number;
    height: number;
    channelData: ArrayBuffer; // Int32Array contents of planes.channels[channel]
    refC: number[]; // RefColor.c
    header: ChannelDecodeHeader;
    segments: Segment[];
}

type Msg = EncodeChannelMsg | DecodeChannelMsg;

const rgbaToArgb = (rgba: Uint8ClampedArray): Uint32Array => {
    const n = rgba.length / 4;
    const pxls = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
        pxls[i] =
            (((rgba[i * 4 + 3] & 0xff) << 24) |
                ((rgba[i * 4] & 0xff) << 16) |
                ((rgba[i * 4 + 1] & 0xff) << 8) |
                (rgba[i * 4 + 2] & 0xff)) >>>
            0;
    }
    return pxls;
};

const handleEncode = (msg: EncodeChannelMsg) => {
    const { id, channel: p, width, height, config } = msg;
    const ccfg = Object.assign(new CodecConfig(), cloneConfig(config));

    const pxls = rgbaToArgb(new Uint8ClampedArray(msg.rgba));
    const planes = new Planes(width, height, ccfg.colorspace, new RefColor(ccfg.color_outside, ccfg.colorspace), pxls);

    const segm_out = new BitOutput();
    const segments = makeSegmentation(
        segm_out,
        planes,
        p,
        ccfg.min_block_size[p],
        ccfg.max_block_size[p],
        ccfg.segmentation_precision[p]
    );
    segm_out.align(1);
    const segmBytes = segm_out.toByteArray();

    const result = planes.clone();
    processChannelEncode(planes, result, p, segments, ccfg, (channel, done, total) => {
        self.postMessage({ id, type: 'progress', channel, done, total });
    });

    const segmDataBytes = encodeSegmentsData(segments, ccfg.prediction_method[p]);
    const dataBytes = encodeChannelData(ccfg.encoding_method[p], result, p, segments, ccfg);

    const reconChannel = planes.channels[p];
    self.postMessage(
        {
            id,
            type: 'encoded',
            channel: p,
            segmBytes,
            segmDataBytes,
            dataBytes,
            segments,
            reconChannel,
        },
        {
            transfer: [segmBytes.buffer, segmDataBytes.buffer, dataBytes.buffer, reconChannel.buffer],
        }
    );
};

const handleDecode = (msg: DecodeChannelMsg) => {
    const { id, channel: p, width, height, header } = msg;

    const ref = new RefColor();
    ref.c.set(msg.refC.slice(0, 4));
    const planes = new Planes(width, height, 0, ref);
    planes.channels[p] = new Int32Array(msg.channelData);

    // revive plain segment objects (structured clone keeps fields, not prototypes)
    const segments = msg.segments.map(s => Object.assign(newSegment(0, 0, 0), s));

    processChannelDecode(planes, p, segments, header, (channel, done, total) => {
        self.postMessage({ id, type: 'progress', channel, done, total });
    });

    const reconChannel = planes.channels[p];
    self.postMessage({ id, type: 'decoded', channel: p, reconChannel }, { transfer: [reconChannel.buffer] });
};

self.onmessage = (e: MessageEvent<Msg>) => {
    const msg = e.data;
    try {
        if (msg.cmd === 'encode-channel') handleEncode(msg);
        else if (msg.cmd === 'decode-channel') handleDecode(msg);
    } catch (error) {
        self.postMessage({
            id: msg.id,
            type: 'error',
            channel: msg.channel,
            error: error instanceof Error ? error.message : String(error),
        });
    }
};
