import { Planes, type Segment } from './Planes';
import { BitOutput, BitInput } from './BitIO';

export const makeSegmentation = (
    segm_out: BitOutput,
    p: Planes,
    pno: number,
    min_size: number,
    max_size: number,
    thr: number
): Segment[] => {
    const s: Segment[] = [];
    segment(segm_out, s, p, pno, 0, 0, Math.max(p.ww, p.hh), Math.max(1, min_size), Math.min(512, max_size), thr);
    return s;
};

const segment = (
    segm_out: BitOutput,
    s: Segment[],
    p: Planes,
    pno: number,
    x: number,
    y: number,
    size: number,
    min_size: number,
    max_size: number,
    thr: number
) => {
    if (x >= p.w || y >= p.h) return;

    const currStdDev = calcStdDev(p, pno, x, y, size);

    if (size > max_size || (size > min_size && currStdDev > thr)) {
        segm_out.writeBoolean(true);
        const mid = Math.floor(size / 2);
        segment(segm_out, s, p, pno, x, y, mid, min_size, max_size, thr);
        segment(segm_out, s, p, pno, x + mid, y, mid, min_size, max_size, thr);
        segment(segm_out, s, p, pno, x, y + mid, mid, min_size, max_size, thr);
        segment(segm_out, s, p, pno, x + mid, y + mid, mid, min_size, max_size, thr);
    } else {
        segm_out.writeBoolean(false);
        s.push({
            x,
            y,
            size,
            pred_type: 0, // PRED_NONE
            angle: -1,
            refa: -1,
            refx: 32767, // Short.MAX_VALUE
            refy: 32767
        });
    }
};

export const readSegmentation = (segm_in: BitInput, p: Planes): Segment[] => {
    const s: Segment[] = [];
    readSegmentRecursive(segm_in, s, p, 0, 0, Math.max(p.ww, p.hh));
    return s;
};

const readSegmentRecursive = (
    segm_in: BitInput,
    s: Segment[],
    p: Planes,
    x: number,
    y: number,
    size: number
) => {
    if (x >= p.w || y >= p.h) return;

    let decision = false;
    try {
        decision = segm_in.readBoolean();
    } catch {
        decision = false;
    }

    if (decision && size > 2) {
        const mid = Math.floor(size / 2);
        readSegmentRecursive(segm_in, s, p, x, y, mid);
        readSegmentRecursive(segm_in, s, p, x + mid, y, mid);
        readSegmentRecursive(segm_in, s, p, x, y + mid, mid);
        readSegmentRecursive(segm_in, s, p, x + mid, y + mid, mid);
    } else {
        s.push({
            x,
            y,
            size,
            pred_type: 0,
            angle: -1,
            refa: -1,
            refx: 32767,
            refy: 32767
        });
    }
};

const calcStdDev = (planes: Planes, pno: number, x: number, y: number, size: number): number => {
    const limit = Math.floor(Math.max(0.1 * size * size, 4));

    let A = 0;
    let Q = 0;

    for (let k = 1; k <= limit; k++) {
        const posx = Math.floor(Math.random() * size);
        const posy = Math.floor(Math.random() * size);

        const xk = planes.get(pno, x + posx, y + posy);

        const oldA = A;
        A += (xk - A) / k;
        Q += (xk - oldA) * (xk - A);
    }

    return Math.sqrt(Q / (limit - 1));
};
