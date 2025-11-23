import { Planes, type Segment } from './Planes';

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
        case PRED_CORNER: return "PRED_CORNER";
        case PRED_H: return "PRED_H";
        case PRED_V: return "PRED_V";
        case PRED_DC: return "PRED_DC";
        case PRED_DCMEDIAN: return "PRED_DCMEDIAN";
        case PRED_MEDIAN: return "PRED_MEDIAN";
        case PRED_AVG: return "PRED_AVG";
        case PRED_TRUEMOTION: return "PRED_TRUEMOTION";
        case PRED_PAETH: return "PRED_PAETH";
        case PRED_LDIAG: return "PRED_LDIAG";
        case PRED_HV: return "PRED_HV";
        case PRED_JPEGLS: return "PRED_JPEGLS";
        case PRED_DIFF: return "PRED_DIFF";
        case PRED_REF: return "PRED_REF";
        case PRED_ANGLE: return "PRED_ANGLE";
        case PRED_RANDOM: return "PRED_RANDOM";
        case PRED_SAD: return "PRED_SAD";
        case PRED_BSAD: return "PRED_BSAD";
        default: return "PRED_NONE";
    }
};

export const predict = (prediction: number, p: Planes, pno: number, s: Segment): number[][] => {
    switch (prediction) {
        case PRED_CORNER: return pred_gen(p, pno, s, 0);
        case PRED_H: return pred_gen(p, pno, s, 1);
        case PRED_V: return pred_gen(p, pno, s, 2);
        case PRED_DC: return pred_dc(p, pno, s);
        case PRED_DCMEDIAN: return pred_dcmedian(p, pno, s);
        case PRED_MEDIAN: return pred_median(p, pno, s);
        case PRED_AVG: return pred_avg(p, pno, s);
        case PRED_TRUEMOTION: return pred_truemotion(p, pno, s);
        case PRED_PAETH: return pred_paeth(p, pno, s);
        case PRED_LDIAG: return pred_ldiag(p, pno, s);
        case PRED_HV: return pred_hv(p, pno, s);
        case PRED_JPEGLS: return pred_jpegls(p, pno, s);
        case PRED_DIFF: return pred_diff(p, pno, s);
        case PRED_REF: return pred_ref(p, pno, s);
        case PRED_ANGLE: return pred_angle(p, pno, s);
        case PRED_RANDOM: return predict(Math.floor(Math.random() * MAX_PRED), p, pno, s);
        case PRED_SAD: return pred_sad(p, pno, s, true);
        case PRED_BSAD: return pred_sad(p, pno, s, false);
        default: return createEmptyBlock(s.size);
    }
};

const createEmptyBlock = (size: number): number[][] => {
    const res = new Array(size);
    for (let i = 0; i < size; i++) res[i] = new Int32Array(size).fill(0);
    return res as any as number[][]; // Using number[][] for compatibility but underlying is typed array for speed? No, let's stick to number[][] or Int32Array[]
};

// Helper to create 2D array
const newBlock = (size: number): number[][] => {
    const res = new Array(size);
    for (let i = 0; i < size; i++) res[i] = new Array(size).fill(0);
    return res;
};

const getSAD = (pred: number[][], p: Planes, pno: number, s: Segment): number => {
    let sum = 0;
    for (let x = 0; x < s.size; x++) {
        for (let y = 0; y < s.size; y++) {
            sum += Math.abs(p.get(pno, s.x + x, s.y + y) - pred[x][y]);
        }
    }
    return sum;
};

export const pred_sad_stats = new Int32Array(MAX_PRED);

const pred_sad = (p: Planes, pno: number, s: Segment, do_sad: boolean): number[][] => {
    let currres: number[][] | null = null;
    let currsad = do_sad ? Number.MAX_SAFE_INTEGER : Number.MIN_SAFE_INTEGER;
    let currtype = -1;

    for (let i = 0; i < MAX_PRED; i++) {
        const res = predict(i, p, pno, s);
        const sad = getSAD(res, p, pno, s);
        if ((do_sad && sad < currsad) || (!do_sad && sad > currsad)) {
            currsad = sad;
            currtype = s.pred_type;
            currres = res;
        }
    }

    if (currtype !== -1) {
        s.pred_type = currtype;
        pred_sad_stats[currtype]++;
    }
    return currres || createEmptyBlock(s.size);
};

const pred_gen = (p: Planes, pno: number, s: Segment, type: number): number[][] => {
    const res = newBlock(s.size);
    for (let x = 0; x < s.size; x++) {
        for (let y = 0; y < s.size; y++) {
            switch (type) {
                case 0: res[x][y] = p.get(pno, s.x - 1, s.y - 1); break;
                case 1: res[x][y] = p.get(pno, s.x - 1, s.y + y); break;
                case 2: res[x][y] = p.get(pno, s.x + x, s.y - 1); break;
            }
        }
    }
    switch (type) {
        case 0: s.pred_type = PRED_CORNER; break;
        case 1: s.pred_type = PRED_H; break;
        case 2: s.pred_type = PRED_V; break;
    }
    return res;
};

const getDC = (p: Planes, pno: number, s: Segment): number => {
    let v = 0;
    for (let i = 0; i < s.size; i++) {
        v += p.get(pno, s.x - 1, s.y + i);
        v += p.get(pno, s.x + i, s.y - 1);
    }
    v += p.get(pno, s.x - 1, s.y - 1);
    v = Math.floor(v / (s.size + s.size + 1));
    return v;
};

const getMedian = (a: number, b: number, c: number): number => {
    return Math.max(Math.min(a, b), Math.min(Math.max(a, b), c));
};

const pred_dc = (p: Planes, pno: number, s: Segment): number[][] => {
    const res = newBlock(s.size);
    const c = getDC(p, pno, s);
    for (let x = 0; x < s.size; x++) {
        for (let y = 0; y < s.size; y++) {
            res[x][y] = c;
        }
    }
    s.pred_type = PRED_DC;
    return res;
};

const pred_dcmedian = (p: Planes, pno: number, s: Segment): number[][] => {
    const res = newBlock(s.size);
    const c = getDC(p, pno, s);
    for (let x = 0; x < s.size; x++) {
        const v1 = p.get(pno, s.x + x, s.y - 1);
        for (let y = 0; y < s.size; y++) {
            const v2 = p.get(pno, s.x - 1, s.y + y);
            res[x][y] = getMedian(c, v1, v2);
        }
    }
    s.pred_type = PRED_DCMEDIAN;
    return res;
};

const pred_median = (p: Planes, pno: number, s: Segment): number[][] => {
    const res = newBlock(s.size);
    const c = p.get(pno, s.x - 1, s.y - 1);
    for (let x = 0; x < s.size; x++) {
        const v1 = p.get(pno, s.x + x, s.y - 1);
        for (let y = 0; y < s.size; y++) {
            const v2 = p.get(pno, s.x - 1, s.y + y);
            res[x][y] = getMedian(c, v1, v2);
        }
    }
    s.pred_type = PRED_MEDIAN;
    return res;
};

const pred_truemotion = (p: Planes, pno: number, s: Segment): number[][] => {
    const res = newBlock(s.size);
    const c = p.get(pno, s.x - 1, s.y - 1);
    for (let x = 0; x < s.size; x++) {
        const v1 = p.get(pno, s.x + x, s.y - 1);
        for (let y = 0; y < s.size; y++) {
            const v2 = p.get(pno, s.x - 1, s.y + y);
            res[x][y] = constrain(v1 + v2 - c, 0, 255);
        }
    }
    s.pred_type = PRED_TRUEMOTION;
    return res;
};

const pred_paeth = (p: Planes, pno: number, s: Segment): number[][] => {
    const res = newBlock(s.size);
    const c = p.get(pno, s.x - 1, s.y - 1);
    for (let x = 0; x < s.size; x++) {
        const v1 = p.get(pno, s.x + x, s.y - 1);
        for (let y = 0; y < s.size; y++) {
            const v2 = p.get(pno, s.x - 1, s.y + y);
            const pp = v1 + v2 - c;
            const pa = Math.abs(pp - v2);
            const pb = Math.abs(pp - v1);
            const pc = Math.abs(pp - c);
            const v = ((pa <= pb) && (pa <= pc)) ? v2 : (pb <= pc ? v1 : c);
            res[x][y] = constrain(v, 0, 255);
        }
    }
    s.pred_type = PRED_PAETH;
    return res;
};

const pred_avg = (p: Planes, pno: number, s: Segment): number[][] => {
    const res = newBlock(s.size);
    for (let x = 0; x < s.size; x++) {
        const v1 = p.get(pno, s.x + x, s.y - 1);
        for (let y = 0; y < s.size; y++) {
            const v2 = p.get(pno, s.x - 1, s.y + y);
            res[x][y] = (v1 + v2) >> 1;
        }
    }
    s.pred_type = PRED_AVG;
    return res;
};

const pred_ldiag = (p: Planes, pno: number, s: Segment): number[][] => {
    const res = newBlock(s.size);
    for (let x = 0; x < s.size; x++) {
        for (let y = 0; y < s.size; y++) {
            const ss = x + y;
            const xx = p.get(pno, s.x + (ss + 1 < s.size ? ss + 1 : s.size - 1), s.y - 1);
            const yy = p.get(pno, s.x - 1, s.y + (ss < s.size ? ss : s.size - 1));
            const c = Math.floor(((x + 1) * xx + (y + 1) * yy) / (x + y + 2));
            res[x][y] = c;
        }
    }
    s.pred_type = PRED_LDIAG;
    return res;
};

const pred_hv = (p: Planes, pno: number, s: Segment): number[][] => {
    const res = newBlock(s.size);
    for (let x = 0; x < s.size; x++) {
        for (let y = 0; y < s.size; y++) {
            let c;
            if (x > y) c = p.get(pno, s.x + x, s.y - 1);
            else if (y > x) c = p.get(pno, s.x - 1, s.y + y);
            else c = (p.get(pno, s.x + x, s.y - 1) + p.get(pno, s.x - 1, s.y + y)) >> 1;
            res[x][y] = c;
        }
    }
    s.pred_type = PRED_HV;
    return res;
};

const pred_jpegls = (p: Planes, pno: number, s: Segment): number[][] => {
    const res = newBlock(s.size);
    for (let x = 0; x < s.size; x++) {
        const c = p.get(pno, s.x + x - 1, s.y - 1);
        const a = p.get(pno, s.x + x, s.y - 1);
        for (let y = 0; y < s.size; y++) {
            const b = p.get(pno, s.x - 1, s.y + y);
            let v;
            if (c >= Math.max(a, b)) v = Math.min(a, b);
            else if (c <= Math.min(a, b)) v = Math.max(a, b);
            else v = a + b - c;
            res[x][y] = v;
        }
    }
    s.pred_type = PRED_JPEGLS;
    return res;
};

const pred_diff = (p: Planes, pno: number, s: Segment): number[][] => {
    const res = newBlock(s.size);
    for (let x = 0; x < s.size; x++) {
        const x1 = p.get(pno, s.x + x, s.y - 1);
        const x2 = p.get(pno, s.x + x, s.y - 2);
        for (let y = 0; y < s.size; y++) {
            const y1 = p.get(pno, s.x - 1, s.y + y);
            const y2 = p.get(pno, s.x - 2, s.y + y);
            const v = constrain((y2 + y2 - y1 + x2 + x2 - x1) >> 1, 0, 255);
            res[x][y] = v;
        }
    }
    s.pred_type = PRED_DIFF;
    return res;
};

const findBestRef = (p: Planes, pno: number, s: Segment): number[][] => {
    let currsad = Number.MAX_SAFE_INTEGER;
    let currres: number[][] | null = null;

    for (let i = 0; i < 45; i++) {
        const res = newBlock(s.size);


        // Original logic:
        // int xx = (int)random(-s.size, s.x);
        // if (xx<s.x-s.size) yy = (int)random(-s.size, s.y);
        // else yy = (int)random(-s.size, s.y-s.size);

        // JS implementation of that logic:
        const randX = Math.floor(Math.random() * (s.x + s.size)) - s.size;
        let randY;
        if (randX < s.x - s.size) {
            randY = Math.floor(Math.random() * (s.y + s.size)) - s.size;
        } else {
            randY = Math.floor(Math.random() * (s.y - s.size + s.size)) - s.size; // wait, s.y - s.size - (-s.size) = s.y
            // random(-s.size, s.y - s.size) -> range is s.y - s.size + s.size = s.y
        }

        for (let x = 0; x < s.size; x++) {
            for (let y = 0; y < s.size; y++) {
                res[x][y] = p.get(pno, randX + x, randY + y);
            }
        }
        const sad = getSAD(res, p, pno, s);
        if (sad < currsad) {
            currres = res;
            currsad = sad;
            s.refx = randX;
            s.refy = randY;
        }
    }
    return currres || newBlock(s.size);
};

const pred_ref = (p: Planes, pno: number, s: Segment): number[][] => {
    s.pred_type = PRED_REF;
    if (s.refx === 32767 || s.refy === 32767) { // Short.MAX_VALUE
        return findBestRef(p, pno, s);
    } else {
        const res = newBlock(s.size);
        for (let x = 0; x < s.size; x++) {
            for (let y = 0; y < s.size; y++) {
                res[x][y] = p.get(pno, s.refx + x, s.refy + y);
            }
        }
        return res;
    }
};

const getAngleRef = (i: number, x: number, y: number, a: number, w: number) => {
    let xx = -1;
    let yy = -1;
    switch (i % 3) {
        case 0: {
            const v = (w - y - 1) + x * a;
            xx = (v - w) / a;
            yy = (w - 1 - a - v);
            break;
        }
        case 1: {
            const v = (w - x - 1) + y * a;
            yy = (v - w) / a;
            xx = (w - 1 - a - v);
            break;
        }
        case 2: {
            const v = x + y * a;
            yy = -1.0;
            xx = v + a;
            break;
        }
    }

    if (xx > yy)
        return { x: Math.round(xx), y: -1 };
    else
        return { x: -1, y: Math.round(yy) };
};

const findBestAngle = (p: Planes, pno: number, s: Segment): number[][] => {
    const stepa = 1.0 / Math.min(16, s.size);
    let currres: number[][] | null = null;
    let currsad = Number.MAX_SAFE_INTEGER;

    for (let i = 0; i < 3; i++) {
        for (let a = 0; a < 1.0; a += stepa) {
            const aa = Math.floor(a * 0x8000) / 0x8000;
            const res = newBlock(s.size);

            for (let x = 0; x < s.size; x++) {
                for (let y = 0; y < s.size; y++) {
                    const angref = getAngleRef(i, x, y, aa, s.size);
                    const xx = angref.x >= s.size ? s.size - 1 : angref.x;
                    res[x][y] = p.get(pno, xx + s.x, angref.y + s.y);
                }
            }

            const sad = getSAD(res, p, pno, s);
            if (sad < currsad) {
                currres = res;
                currsad = sad;
                s.angle = a;
                s.refa = i;
            }
        }
    }
    return currres || newBlock(s.size);
};

const pred_angle = (p: Planes, pno: number, s: Segment): number[][] => {
    s.pred_type = PRED_ANGLE;
    if (s.angle < 0 || s.refa < 0) {
        return findBestAngle(p, pno, s);
    } else {
        const res = newBlock(s.size);
        for (let x = 0; x < s.size; x++) {
            for (let y = 0; y < s.size; y++) {
                const angref = getAngleRef(s.refa, x, y, s.angle, s.size);
                const xx = angref.x >= s.size ? s.size - 1 : angref.x;
                res[x][y] = p.get(pno, xx + s.x, angref.y + s.y);
            }
        }
        return res;
    }
};
