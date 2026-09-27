// Faithful port of the original GLIC planes.pde, on flat typed arrays.
// Block buffers are laid out [x * size + y] to match the original's [x][y] indexing.

import { toColorspace, fromColorspace } from './ColorSpaces';

export const CLAMP_NONE = 0;
export const CLAMP_MOD256 = 1;

export const clamp_in = (method: number, x: number) => {
    switch (method) {
        case CLAMP_MOD256:
            return x < 0 ? x + 256 : x > 255 ? x - 256 : x;
        default:
            return x;
    }
};

export const clamp_out = (method: number, x: number) => {
    switch (method) {
        case CLAMP_MOD256:
            return x < 0 ? x + 256 : x > 255 ? x - 256 : x;
        default:
            return Math.min(Math.max(x, 0), 255);
    }
};

export const clamp = (method: number, x: number) => {
    switch (method) {
        case CLAMP_MOD256:
            return Math.min(Math.max(x, 0), 255);
        default:
            return Math.min(Math.max(x, -255), 255);
    }
};

export class RefColor {
    c: Int32Array;

    /** From packed 0xAARRGGBB, optionally converted into colorspace `cs`. */
    constructor(argb: number = 0xff808080, cs?: number) {
        this.c = new Int32Array(4);
        if (cs !== undefined) argb = toColorspace(argb, cs);
        this.c[2] = argb & 0xff;
        this.c[1] = (argb >>> 8) & 0xff;
        this.c[0] = (argb >>> 16) & 0xff;
        this.c[3] = (argb >>> 24) & 0xff;
    }

    static fromRGB(r: number, g: number, b: number, cs?: number): RefColor {
        const argb = ((0xff << 24) | ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff)) >>> 0;
        return new RefColor(argb, cs);
    }
}

export interface Segment {
    x: number;
    y: number;
    size: number;
    pred_type: number;
    angle: number;
    refa: number;
    refx: number; // Short.MAX_VALUE when unset
    refy: number;
}

export const SHORT_MAX = 32767;

export const newSegment = (x: number, y: number, size: number): Segment => ({
    x,
    y,
    size,
    pred_type: 0, // PRED_NONE
    angle: -1,
    refa: -1,
    refx: SHORT_MAX,
    refy: SHORT_MAX,
});

export class Planes {
    ww: number;
    hh: number;
    w: number;
    h: number;
    cs: number;
    channels: [Int32Array, Int32Array, Int32Array];
    ref: RefColor;
    originalAlpha: Uint8Array | null = null;

    constructor(w: number, h: number, cs: number, ref?: RefColor, pxls?: Uint32Array) {
        this.w = w;
        this.h = h;
        this.cs = cs;
        this.ww = 1 << Math.ceil(Math.log2(Math.max(1, w)));
        this.hh = 1 << Math.ceil(Math.log2(Math.max(1, h)));
        this.ref = ref || new RefColor(0xff808080, cs);

        this.channels = [new Int32Array(w * h), new Int32Array(w * h), new Int32Array(w * h)];
        this.channels[0].fill(this.ref.c[0]);
        this.channels[1].fill(this.ref.c[1]);
        this.channels[2].fill(this.ref.c[2]);

        if (pxls) this.extractPlanes(pxls);
    }

    clone(): Planes {
        const p = new Planes(this.w, this.h, this.cs, this.ref);
        for (let i = 0; i < 3; i++) p.channels[i].set(this.channels[i]);
        if (this.originalAlpha) p.originalAlpha = new Uint8Array(this.originalAlpha);
        return p;
    }

    /** pxls: packed 0xAARRGGBB per pixel, row-major. */
    private extractPlanes(pxls: Uint32Array) {
        this.originalAlpha = new Uint8Array(this.w * this.h);
        const n = this.w * this.h;
        for (let i = 0; i < n; i++) {
            const p = pxls[i];
            this.originalAlpha[i] = (p >>> 24) & 0xff;
            const c = toColorspace(p, this.cs);
            this.channels[2][i] = c & 0xff;
            this.channels[1][i] = (c >>> 8) & 0xff;
            this.channels[0][i] = (c >>> 16) & 0xff;
        }
    }

    toPixels(): Uint32Array {
        const n = this.w * this.h;
        const pxls = new Uint32Array(n);
        for (let i = 0; i < n; i++) {
            const alpha = this.originalAlpha ? this.originalAlpha[i] : 255;
            const packed =
                ((0xff << 24) |
                    ((this.channels[0][i] & 0xff) << 16) |
                    ((this.channels[1][i] & 0xff) << 8) |
                    (this.channels[2][i] & 0xff)) >>>
                0;
            const rgb = fromColorspace(packed, this.cs);
            pxls[i] = (((alpha & 0xff) << 24) | (rgb & 0xffffff)) >>> 0;
        }
        return pxls;
    }

    toImageData(): ImageData {
        const pxls = this.toPixels();
        const data = new Uint8ClampedArray(this.w * this.h * 4);
        for (let i = 0; i < pxls.length; i++) {
            const p = pxls[i];
            const idx = i * 4;
            data[idx] = (p >>> 16) & 0xff;
            data[idx + 1] = (p >>> 8) & 0xff;
            data[idx + 2] = p & 0xff;
            data[idx + 3] = (p >>> 24) & 0xff;
        }
        return new ImageData(data, this.w, this.h);
    }

    get(pno: number, x: number, y: number): number {
        if (x < 0 || x >= this.w || y < 0 || y >= this.h) {
            return this.ref.c[pno];
        }
        return this.channels[pno][y * this.w + x];
    }

    set(pno: number, x: number, y: number, val: number) {
        if (x >= 0 && x < this.w && y >= 0 && y < this.h) {
            this.channels[pno][y * this.w + x] = val;
        }
    }

    /** Block values / 255.0 into out[x*size+y] (original Planes.get(pno, Segment)). */
    getSegmentBlock(pno: number, s: Segment, out: Float64Array) {
        const size = s.size;
        for (let x = 0; x < size; x++) {
            for (let y = 0; y < size; y++) {
                out[x * size + y] = this.get(pno, x + s.x, y + s.y) / 255.0;
            }
        }
    }

    /** round(v*255) with clamp back into the plane (original Planes.set(pno, Segment, ...)). */
    setSegmentBlock(pno: number, s: Segment, values: Float64Array, method: number) {
        const size = s.size;
        for (let x = 0; x < size; x++) {
            for (let y = 0; y < size; y++) {
                this.set(pno, x + s.x, y + s.y, clamp(method, Math.round(values[x * size + y] * 255.0)));
            }
        }
    }

    subtract(pno: number, s: Segment, values: Int32Array, clamp_method: number) {
        const size = s.size;
        for (let x = 0; x < size; x++) {
            for (let y = 0; y < size; y++) {
                const v = this.get(pno, s.x + x, s.y + y) - values[x * size + y];
                this.set(pno, s.x + x, s.y + y, clamp_in(clamp_method, v));
            }
        }
    }

    add(pno: number, s: Segment, values: Int32Array, clamp_method: number) {
        const size = s.size;
        for (let x = 0; x < size; x++) {
            for (let y = 0; y < size; y++) {
                const v = this.get(pno, s.x + x, s.y + y) + values[x * size + y];
                this.set(pno, s.x + x, s.y + y, clamp_out(clamp_method, v));
            }
        }
    }
}
