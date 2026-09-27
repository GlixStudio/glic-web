// JWave-faithful wavelet engine.
//
// Reimplements the exact algorithms of the JWave.jar bundled with the original GLIC
// (verified by decompiling that jar - see scripts/jwave-extract/README.md):
//   - Wavelet.forward/reverse: circular-convolution single level on a prefix of the array
//   - FastWaveletTransform: multi-level on the halving prefix
//   - WaveletPacketTransform: multi-level on every packet
//   - BasicTransform 2D: full 1D transform of all rows, then all columns
//     ("standard decomposition"); reverse runs columns first, then rows
//   - CompressorMagnitude 2D: magnitude is the SUM of |v| over the block (JWave quirk:
//     the 2D overload never divides by the element count), threshold factor applied on top
//
// Everything operates on flat Float64Array blocks, laid out as [x * size + y] to match
// the original's tr[x][y] indexing. All block sizes are powers of two.

import { WAVELET_FILTERS, type WaveletFilterBank } from './waveletCoefficients';

export const TRANSTYPE_RANDOM = -1;
export const TRANSTYPE_FWT = 0;
export const TRANSTYPE_WPT = 1;
export const TRANSTYPENO = 2;

export const WAVELET_RANDOM = -1;
export const WAVELET_NONE = 0;
export const WAVELETNO = 68; // valid wavelet ids are 1..67

export const isValidWaveletId = (id: number): boolean =>
    Number.isInteger(id) && id >= 1 && id < WAVELETNO;

/** Original createWavelet(): any unknown id resolves to a random valid wavelet. */
export const resolveWaveletId = (id: number, rng: () => number = Math.random): number =>
    isValidWaveletId(id) ? id : 1 + Math.floor(rng() * (WAVELETNO - 1));

/** Original createTransform(): any unknown type resolves to a random valid type. */
export const resolveTransType = (type: number, rng: () => number = Math.random): number =>
    type === TRANSTYPE_FWT || type === TRANSTYPE_WPT ? type : Math.floor(rng() * TRANSTYPENO);

export const getWaveletName = (id: number): string => {
    if (id === WAVELET_RANDOM) return 'Random';
    if (id === WAVELET_NONE) return 'None';
    const bank = WAVELET_FILTERS[id];
    return bank ? bank.name : `Unknown (${id})`;
};

/** UI label, e.g. "Daubechies 2 (44)". */
export const getWaveletDisplayName = (id: number): string =>
    id === WAVELET_RANDOM || id === WAVELET_NONE ? getWaveletName(id) : `${getWaveletName(id)} (${id})`;

// --- Single-level steps (Wavelet.forward / Wavelet.reverse) ---

const stepForward = (bank: WaveletFilterBank, arr: Float64Array, n: number, out: Float64Array) => {
    const h = n >> 1;
    const lo = bank.scalingDeCom;
    const hi = bank.waveletDeCom;
    const m = lo.length;
    for (let i = 0; i < h; i++) {
        let a = 0.0;
        let d = 0.0;
        for (let j = 0; j < m; j++) {
            let k = (i << 1) + j;
            while (k >= n) k -= n;
            const v = arr[k];
            a += v * lo[j];
            d += v * hi[j];
        }
        out[i] = a;
        out[i + h] = d;
    }
};

const stepReverse = (bank: WaveletFilterBank, arr: Float64Array, n: number, out: Float64Array) => {
    const h = n >> 1;
    const lo = bank.scalingReCon;
    const hi = bank.waveletReCon;
    const m = lo.length;
    const rs = bank.reverseScale;
    out.fill(0, 0, n);
    for (let i = 0; i < h; i++) {
        const a = arr[i];
        const d = arr[i + h];
        for (let j = 0; j < m; j++) {
            let k = (i << 1) + j;
            while (k >= n) k -= n;
            out[k] += rs * (a * lo[j] + d * hi[j]);
        }
    }
};

// --- Full 1D transforms, in place on arr[0..n) ---

const fwtForward = (bank: WaveletFilterBank, arr: Float64Array, n: number, tmp: Float64Array) => {
    const tw = bank.transformWavelength;
    for (let h = n; h >= tw; h >>= 1) {
        stepForward(bank, arr, h, tmp);
        arr.set(tmp.subarray(0, h));
    }
};

const fwtReverse = (bank: WaveletFilterBank, arr: Float64Array, n: number, tmp: Float64Array) => {
    const tw = bank.transformWavelength;
    for (let h = tw; h <= n; h <<= 1) {
        stepReverse(bank, arr, h, tmp);
        arr.set(tmp.subarray(0, h));
    }
};

const wptForward = (bank: WaveletFilterBank, arr: Float64Array, n: number, tmp: Float64Array, pkt: Float64Array) => {
    const tw = bank.transformWavelength;
    for (let h = n; h >= tw; h >>= 1) {
        const packets = n / h;
        for (let p = 0; p < packets; p++) {
            const off = p * h;
            pkt.set(arr.subarray(off, off + h));
            stepForward(bank, pkt, h, tmp);
            arr.set(tmp.subarray(0, h), off);
        }
    }
};

const wptReverse = (bank: WaveletFilterBank, arr: Float64Array, n: number, tmp: Float64Array, pkt: Float64Array) => {
    const tw = bank.transformWavelength;
    for (let h = tw; h <= n; h <<= 1) {
        const packets = n / h;
        for (let p = 0; p < packets; p++) {
            const off = p * h;
            pkt.set(arr.subarray(off, off + h));
            stepReverse(bank, pkt, h, tmp);
            arr.set(tmp.subarray(0, h), off);
        }
    }
};

/**
 * 2D wavelet transform over a square, power-of-two-sized block.
 * `type` must already be resolved (FWT or WPT), `waveletId` must be a valid id (1..67).
 */
export class WaveletTransform {
    readonly type: number;
    readonly waveletId: number;
    private bank: WaveletFilterBank;
    // scratch buffers, grown on demand
    private line: Float64Array = new Float64Array(0);
    private tmp: Float64Array = new Float64Array(0);
    private pkt: Float64Array = new Float64Array(0);

    constructor(type: number, waveletId: number) {
        if (!isValidWaveletId(waveletId)) {
            throw new Error(`WaveletTransform: invalid wavelet id ${waveletId}`);
        }
        this.type = type === TRANSTYPE_WPT ? TRANSTYPE_WPT : TRANSTYPE_FWT;
        this.waveletId = waveletId;
        this.bank = WAVELET_FILTERS[waveletId];
    }

    getName(): string {
        return `${this.bank.name} (${this.type === TRANSTYPE_FWT ? 'FWT' : 'WPT'})`;
    }

    private ensureScratch(size: number) {
        if (this.line.length < size) {
            this.line = new Float64Array(size);
            this.tmp = new Float64Array(size);
            this.pkt = new Float64Array(size);
        }
    }

    private transform1D(arr: Float64Array, n: number, forward: boolean) {
        if (this.type === TRANSTYPE_FWT) {
            if (forward) fwtForward(this.bank, arr, n, this.tmp);
            else fwtReverse(this.bank, arr, n, this.tmp);
        } else {
            if (forward) wptForward(this.bank, arr, n, this.tmp, this.pkt);
            else wptReverse(this.bank, arr, n, this.tmp, this.pkt);
        }
    }

    private rows(data: Float64Array, size: number, forward: boolean) {
        for (let x = 0; x < size; x++) {
            const off = x * size;
            this.line.set(data.subarray(off, off + size));
            this.transform1D(this.line, size, forward);
            data.set(this.line.subarray(0, size), off);
        }
    }

    private cols(data: Float64Array, size: number, forward: boolean) {
        const line = this.line;
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) line[x] = data[x * size + y];
            this.transform1D(line, size, forward);
            for (let x = 0; x < size; x++) data[x * size + y] = line[x];
        }
    }

    /** In-place 2D forward: all rows fully, then all columns (JWave BasicTransform order). */
    forward2D(data: Float64Array, size: number) {
        this.ensureScratch(size);
        this.rows(data, size, true);
        this.cols(data, size, true);
    }

    /** In-place 2D reverse: all columns fully, then all rows (mirror of forward). */
    reverse2D(data: Float64Array, size: number) {
        this.ensureScratch(size);
        this.cols(data, size, false);
        this.rows(data, size, false);
    }
}

/**
 * JWave CompressorMagnitude applied to a 2D block: zeroes every coefficient whose
 * magnitude is below (MEAN of |coefficients|) * threshold. Verified against the
 * actual jar (CompTest: [[1,2],[3,4]] reports magnitude 2.5) - the decompiler had
 * dropped the division, and sum-semantics wiped whole blocks flat for any
 * compression setting above ~20.
 */
export class CompressorMagnitude {
    threshold: number;

    constructor(threshold: number) {
        // JWave rejects thresholds <= 0 and falls back to 1.0
        this.threshold = threshold > 0 ? threshold : 1.0;
    }

    /** In-place over data[0..len). */
    compress(data: Float64Array, len: number) {
        if (len === 0) return;
        let magnitude = 0.0;
        for (let i = 0; i < len; i++) magnitude += Math.abs(data[i]);
        magnitude /= len;
        const cut = magnitude * this.threshold;
        for (let i = 0; i < len; i++) {
            if (Math.abs(data[i]) < cut) data[i] = 0.0;
        }
    }
}
