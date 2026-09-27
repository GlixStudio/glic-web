// Faithful port of the original GLIC predictions.pde.
// Prediction blocks are flat Int32Array laid out [x * size + y].
// Integer divisions use Math.trunc to match Java's toward-zero semantics
// (plane values can be far outside 0..255 after quantization).

import { Planes, type Segment, SHORT_MAX } from './Planes';

export const PRED_SAD = -1;
export const PRED_BSAD = -2;
export const PRED_RANDOM = -3;

export const PRED_NONE = 0;
export const PRED_CORNER = 1;
export const PRED_H = 2;
export const PRED_V = 3;
export const PRED_DC = 4;
export const PRED_DCMEDIAN = 5;
export const PRED_MEDIAN = 6;
export const PRED_AVG = 7;
export const PRED_TRUEMOTION = 8;
export const PRED_PAETH = 9;
export const PRED_LDIAG = 10;
export const PRED_HV = 11;
export const PRED_JPEGLS = 12;
export const PRED_DIFF = 13;
export const PRED_REF = 14;
export const PRED_ANGLE = 15;

export const MAX_PRED = 16;

const constrain = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

export const predict_name = (prediction: number): string => {
    switch (prediction) {
        case PRED_CORNER: return 'PRED_CORNER';
        case PRED_H: return 'PRED_H';
        case PRED_V: return 'PRED_V';
        case PRED_DC: return 'PRED_DC';
        case PRED_DCMEDIAN: return 'PRED_DCMEDIAN';
        case PRED_MEDIAN: return 'PRED_MEDIAN';
        case PRED_AVG: return 'PRED_AVG';
        case PRED_TRUEMOTION: return 'PRED_TRUEMOTION';
        case PRED_PAETH: return 'PRED_PAETH';
        case PRED_LDIAG: return 'PRED_LDIAG';
        case PRED_HV: return 'PRED_HV';
        case PRED_JPEGLS: return 'PRED_JPEGLS';
        case PRED_DIFF: return 'PRED_DIFF';
        case PRED_REF: return 'PRED_REF';
        case PRED_ANGLE: return 'PRED_ANGLE';
        case PRED_RANDOM: return 'PRED_RANDOM';
        case PRED_SAD: return 'PRED_SAD';
        case PRED_BSAD: return 'PRED_BSAD';
        default: return 'PRED_NONE';
    }
};

/**
 * Scratch buffers for prediction, reusable across segments of one channel.
 * Sized for the largest block (512x512 worst case is 1MB per buffer - allocated lazily).
 */
export class PredictScratch {
    out: Int32Array = new Int32Array(0);
    trial: Int32Array = new Int32Array(0);
    best: Int32Array = new Int32Array(0);

    ensure(size: number) {
        const n = size * size;
        if (this.out.length < n) {
            this.out = new Int32Array(n);
            this.trial = new Int32Array(n);
            this.best = new Int32Array(n);
        }
    }
}

/**
 * Computes the prediction for a segment into scratch.out (flat [x*size+y]) and
 * returns it. Sets s.pred_type (and refx/refy/angle/refa where applicable),
 * exactly like the original.
 */
export const predict = (
    prediction: number,
    p: Planes,
    pno: number,
    s: Segment,
    scratch: PredictScratch
): Int32Array => {
    scratch.ensure(s.size);
    predictInto(prediction, p, pno, s, scratch.out, scratch);
    return scratch.out;
};

const predictInto = (
    prediction: number,
    p: Planes,
    pno: number,
    s: Segment,
    out: Int32Array,
    scratch: PredictScratch
) => {
    switch (prediction) {
        case PRED_CORNER: pred_gen(p, pno, s, 0, out); break;
        case PRED_H: pred_gen(p, pno, s, 1, out); break;
        case PRED_V: pred_gen(p, pno, s, 2, out); break;
        case PRED_DC: pred_dc(p, pno, s, out); break;
        case PRED_DCMEDIAN: pred_dcmedian(p, pno, s, out); break;
        case PRED_MEDIAN: pred_median(p, pno, s, out); break;
        case PRED_AVG: pred_avg(p, pno, s, out); break;
        case PRED_TRUEMOTION: pred_truemotion(p, pno, s, out); break;
        case PRED_PAETH: pred_paeth(p, pno, s, out); break;
        case PRED_LDIAG: pred_ldiag(p, pno, s, out); break;
        case PRED_HV: pred_hv(p, pno, s, out); break;
        case PRED_JPEGLS: pred_jpegls(p, pno, s, out); break;
        case PRED_DIFF: pred_diff(p, pno, s, out); break;
        case PRED_REF: pred_ref(p, pno, s, out); break;
        case PRED_ANGLE: pred_angle(p, pno, s, out); break;
        case PRED_RANDOM: predictInto(Math.floor(Math.random() * MAX_PRED), p, pno, s, out, scratch); break;
        case PRED_SAD: pred_sad(p, pno, s, true, out, scratch); break;
        case PRED_BSAD: pred_sad(p, pno, s, false, out, scratch); break;
        default: out.fill(0, 0, s.size * s.size); break;
    }
};

const getSAD = (pred: Int32Array, p: Planes, pno: number, s: Segment): number => {
    let sum = 0;
    const size = s.size;
    for (let x = 0; x < size; x++) {
        for (let y = 0; y < size; y++) {
            sum += Math.abs(p.get(pno, s.x + x, s.y + y) - pred[x * size + y]);
        }
    }
    return sum;
};

export const pred_sad_stats = new Int32Array(MAX_PRED);

const pred_sad = (
    p: Planes,
    pno: number,
    s: Segment,
    do_sad: boolean,
    out: Int32Array,
    scratch: PredictScratch
) => {
    const n = s.size * s.size;
    let currsad = do_sad ? Number.MAX_SAFE_INTEGER : Number.MIN_SAFE_INTEGER;
    let currtype = -1;
    let haveBest = false;

    for (let i = 0; i < MAX_PRED; i++) {
        predictInto(i, p, pno, s, scratch.trial, scratch);
        const sad = getSAD(scratch.trial, p, pno, s);
        if ((do_sad && sad < currsad) || (!do_sad && sad > currsad)) {
            currsad = sad;
            currtype = s.pred_type; // type just set by predictInto(i)
            scratch.best.set(scratch.trial.subarray(0, n));
            haveBest = true;
        }
    }

    if (currtype !== -1) {
        s.pred_type = currtype;
        pred_sad_stats[currtype]++;
    }
    if (haveBest) out.set(scratch.best.subarray(0, n));
    else out.fill(0, 0, n);
};

const pred_gen = (p: Planes, pno: number, s: Segment, type: number, out: Int32Array) => {
    const size = s.size;
    for (let x = 0; x < size; x++) {
        for (let y = 0; y < size; y++) {
            let v = 0;
            switch (type) {
                case 0: v = p.get(pno, s.x - 1, s.y - 1); break;
                case 1: v = p.get(pno, s.x - 1, s.y + y); break;
                case 2: v = p.get(pno, s.x + x, s.y - 1); break;
            }
            out[x * size + y] = v;
        }
    }
    switch (type) {
        case 0: s.pred_type = PRED_CORNER; break;
        case 1: s.pred_type = PRED_H; break;
        case 2: s.pred_type = PRED_V; break;
    }
};

const getDC = (p: Planes, pno: number, s: Segment): number => {
    let v = 0;
    for (let i = 0; i < s.size; i++) {
        v += p.get(pno, s.x - 1, s.y + i);
        v += p.get(pno, s.x + i, s.y - 1);
    }
    v += p.get(pno, s.x - 1, s.y - 1);
    return Math.trunc(v / (s.size + s.size + 1)); // Java int division
};

const getMedian = (a: number, b: number, c: number): number =>
    Math.max(Math.min(a, b), Math.min(Math.max(a, b), c));

const pred_dc = (p: Planes, pno: number, s: Segment, out: Int32Array) => {
    const c = getDC(p, pno, s);
    out.fill(c, 0, s.size * s.size);
    s.pred_type = PRED_DC;
};

const pred_dcmedian = (p: Planes, pno: number, s: Segment, out: Int32Array) => {
    const size = s.size;
    const c = getDC(p, pno, s);
    for (let x = 0; x < size; x++) {
        const v1 = p.get(pno, s.x + x, s.y - 1);
        for (let y = 0; y < size; y++) {
            const v2 = p.get(pno, s.x - 1, s.y + y);
            out[x * size + y] = getMedian(c, v1, v2);
        }
    }
    s.pred_type = PRED_DCMEDIAN;
};

const pred_median = (p: Planes, pno: number, s: Segment, out: Int32Array) => {
    const size = s.size;
    const c = p.get(pno, s.x - 1, s.y - 1);
    for (let x = 0; x < size; x++) {
        const v1 = p.get(pno, s.x + x, s.y - 1);
        for (let y = 0; y < size; y++) {
            const v2 = p.get(pno, s.x - 1, s.y + y);
            out[x * size + y] = getMedian(c, v1, v2);
        }
    }
    s.pred_type = PRED_MEDIAN;
};

const pred_truemotion = (p: Planes, pno: number, s: Segment, out: Int32Array) => {
    const size = s.size;
    const c = p.get(pno, s.x - 1, s.y - 1);
    for (let x = 0; x < size; x++) {
        const v1 = p.get(pno, s.x + x, s.y - 1);
        for (let y = 0; y < size; y++) {
            const v2 = p.get(pno, s.x - 1, s.y + y);
            out[x * size + y] = constrain(v1 + v2 - c, 0, 255);
        }
    }
    s.pred_type = PRED_TRUEMOTION;
};

const pred_paeth = (p: Planes, pno: number, s: Segment, out: Int32Array) => {
    const size = s.size;
    const c = p.get(pno, s.x - 1, s.y - 1);
    for (let x = 0; x < size; x++) {
        const v1 = p.get(pno, s.x + x, s.y - 1);
        for (let y = 0; y < size; y++) {
            const v2 = p.get(pno, s.x - 1, s.y + y);
            const pp = v1 + v2 - c;
            const pa = Math.abs(pp - v2);
            const pb = Math.abs(pp - v1);
            const pc = Math.abs(pp - c);
            const v = pa <= pb && pa <= pc ? v2 : pb <= pc ? v1 : c;
            out[x * size + y] = constrain(v, 0, 255);
        }
    }
    s.pred_type = PRED_PAETH;
};

const pred_avg = (p: Planes, pno: number, s: Segment, out: Int32Array) => {
    const size = s.size;
    for (let x = 0; x < size; x++) {
        const v1 = p.get(pno, s.x + x, s.y - 1);
        for (let y = 0; y < size; y++) {
            const v2 = p.get(pno, s.x - 1, s.y + y);
            out[x * size + y] = (v1 + v2) >> 1;
        }
    }
    s.pred_type = PRED_AVG;
};

const pred_ldiag = (p: Planes, pno: number, s: Segment, out: Int32Array) => {
    const size = s.size;
    for (let x = 0; x < size; x++) {
        for (let y = 0; y < size; y++) {
            const ss = x + y;
            const xx = p.get(pno, s.x + (ss + 1 < size ? ss + 1 : size - 1), s.y - 1);
            const yy = p.get(pno, s.x - 1, s.y + (ss < size ? ss : size - 1));
            out[x * size + y] = Math.trunc(((x + 1) * xx + (y + 1) * yy) / (x + y + 2)); // Java int division
        }
    }
    s.pred_type = PRED_LDIAG;
};

const pred_hv = (p: Planes, pno: number, s: Segment, out: Int32Array) => {
    const size = s.size;
    for (let x = 0; x < size; x++) {
        for (let y = 0; y < size; y++) {
            let c;
            if (x > y) c = p.get(pno, s.x + x, s.y - 1);
            else if (y > x) c = p.get(pno, s.x - 1, s.y + y);
            else c = (p.get(pno, s.x + x, s.y - 1) + p.get(pno, s.x - 1, s.y + y)) >> 1;
            out[x * size + y] = c;
        }
    }
    s.pred_type = PRED_HV;
};

const pred_jpegls = (p: Planes, pno: number, s: Segment, out: Int32Array) => {
    const size = s.size;
    for (let x = 0; x < size; x++) {
        const c = p.get(pno, s.x + x - 1, s.y - 1);
        const a = p.get(pno, s.x + x, s.y - 1);
        for (let y = 0; y < size; y++) {
            const b = p.get(pno, s.x - 1, s.y + y);
            let v;
            if (c >= Math.max(a, b)) v = Math.min(a, b);
            else if (c <= Math.min(a, b)) v = Math.max(a, b);
            else v = a + b - c;
            out[x * size + y] = v;
        }
    }
    s.pred_type = PRED_JPEGLS;
};

const pred_diff = (p: Planes, pno: number, s: Segment, out: Int32Array) => {
    const size = s.size;
    for (let x = 0; x < size; x++) {
        const x1 = p.get(pno, s.x + x, s.y - 1);
        const x2 = p.get(pno, s.x + x, s.y - 2);
        for (let y = 0; y < size; y++) {
            const y1 = p.get(pno, s.x - 1, s.y + y);
            const y2 = p.get(pno, s.x - 2, s.y + y);
            out[x * size + y] = constrain((y2 + y2 - y1 + x2 + x2 - x1) >> 1, 0, 255);
        }
    }
    s.pred_type = PRED_DIFF;
};

const findBestRef = (p: Planes, pno: number, s: Segment, out: Int32Array, scratch: PredictScratch) => {
    const size = s.size;
    const n = size * size;
    let currsad = Number.MAX_SAFE_INTEGER;
    let haveBest = false;

    for (let i = 0; i < 45; i++) {
        // (int)random(-s.size, s.x) etc., as in the original
        const xx = Math.floor(Math.random() * (s.x + size)) - size;
        let yy;
        if (xx < s.x - size) {
            yy = Math.floor(Math.random() * (s.y + size)) - size;
        } else {
            yy = Math.floor(Math.random() * s.y) - size; // random(-size, s.y - size)
        }
        for (let x = 0; x < size; x++) {
            for (let y = 0; y < size; y++) {
                scratch.trial[x * size + y] = p.get(pno, xx + x, yy + y);
            }
        }
        const sad = getSAD(scratch.trial, p, pno, s);
        if (sad < currsad) {
            scratch.best.set(scratch.trial.subarray(0, n));
            haveBest = true;
            currsad = sad;
            s.refx = xx;
            s.refy = yy;
        }
    }
    if (haveBest) out.set(scratch.best.subarray(0, n));
    else out.fill(0, 0, n);
};

const pred_ref = (p: Planes, pno: number, s: Segment, out: Int32Array) => {
    s.pred_type = PRED_REF;
    const size = s.size;
    if (s.refx === SHORT_MAX || s.refy === SHORT_MAX) {
        // needs scratch; called through predictInto which owns one
        findBestRef(p, pno, s, out, refScratch(size));
    } else {
        for (let x = 0; x < size; x++) {
            for (let y = 0; y < size; y++) {
                out[x * size + y] = p.get(pno, s.refx + x, s.refy + y);
            }
        }
    }
};

// pred_ref needs its own trial/best buffers independent of the caller's scratch
// (out may alias scratch.out/trial during PRED_SAD sweeps)
const _refScratch = new PredictScratch();
const refScratch = (size: number) => {
    _refScratch.ensure(size);
    return _refScratch;
};

const getAngleRef = (i: number, x: number, y: number, a: number, w: number) => {
    let xx = -1;
    let yy = -1;
    switch (i % 3) {
        case 0: {
            const v = (w - y - 1) + x * a;
            xx = (v - w) / a;
            yy = w - 1 - a - v;
            break;
        }
        case 1: {
            const v = (w - x - 1) + y * a;
            yy = (v - w) / a;
            xx = w - 1 - a - v;
            break;
        }
        case 2: {
            const v = x + y * a;
            yy = -1.0;
            xx = v + a;
            break;
        }
    }

    if (xx > yy) return { x: Math.round(xx), y: -1 };
    return { x: -1, y: Math.round(yy) };
};

const findBestAngle = (p: Planes, pno: number, s: Segment, out: Int32Array, scratch: PredictScratch) => {
    const size = s.size;
    const n = size * size;
    const stepa = 1.0 / Math.min(16, size);
    let currsad = Number.MAX_SAFE_INTEGER;
    let haveBest = false;

    for (let i = 0; i < 3; i++) {
        for (let a = 0; a < 1.0; a += stepa) {
            const aa = Math.floor(a * 0x8000) / 0x8000;
            for (let x = 0; x < size; x++) {
                for (let y = 0; y < size; y++) {
                    const angref = getAngleRef(i, x, y, aa, size);
                    const xx = angref.x >= size ? size - 1 : angref.x;
                    scratch.trial[x * size + y] = p.get(pno, xx + s.x, angref.y + s.y);
                }
            }
            const sad = getSAD(scratch.trial, p, pno, s);
            if (sad < currsad) {
                scratch.best.set(scratch.trial.subarray(0, n));
                haveBest = true;
                currsad = sad;
                s.angle = a;
                s.refa = i;
            }
        }
    }
    if (haveBest) out.set(scratch.best.subarray(0, n));
    else out.fill(0, 0, n);
};

const pred_angle = (p: Planes, pno: number, s: Segment, out: Int32Array) => {
    s.pred_type = PRED_ANGLE;
    const size = s.size;
    if (s.angle < 0 || s.refa < 0) {
        findBestAngle(p, pno, s, out, refScratch(size));
    } else {
        for (let x = 0; x < size; x++) {
            for (let y = 0; y < size; y++) {
                const angref = getAngleRef(s.refa, x, y, s.angle, size);
                const xx = angref.x >= size ? size - 1 : angref.x;
                out[x * size + y] = p.get(pno, xx + s.x, angref.y + s.y);
            }
        }
    }
};
