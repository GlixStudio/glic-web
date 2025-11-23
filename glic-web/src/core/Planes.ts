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

    constructor(rOrColor?: number | { r: number, g: number, b: number }, g?: number, b?: number, cs?: number) {
        this.c = new Int32Array(4);
        if (typeof rOrColor === 'number' && g !== undefined && b !== undefined) {
            // r, g, b constructor
            const color = (255 << 24) | (rOrColor << 16) | (g << 8) | b;
            if (cs !== undefined) {
                this.initFromColor(color, cs);
            } else {
                this.initFromColor(color);
            }
        } else if (typeof rOrColor === 'number') {
            // color int constructor
            if (g !== undefined) { // g is cs here
                this.initFromColor(rOrColor, g);
            } else {
                this.initFromColor(rOrColor);
            }
        } else {
            // default
            this.c[0] = 128;
            this.c[1] = 128;
            this.c[2] = 128;
            this.c[3] = 255;
        }
    }

    private initFromColor(cc: number, cs?: number) {
        if (cs !== undefined) {
            cc = toColorspace(cc, cs);
        }
        this.c[2] = cc & 0xff;
        this.c[1] = (cc >>> 8) & 0xff;
        this.c[0] = (cc >>> 16) & 0xff;
        this.c[3] = (cc >>> 24) & 0xff;
    }
}

export interface Segment {
    x: number;
    y: number;
    size: number;
    pred_type: number;
    angle: number;
    refa: number;
    refx: number;
    refy: number;
}

export class Planes {
    ww: number;
    hh: number;
    w: number;
    h: number;
    cs: number;
    channels: Int32Array[]; // 3 channels, flattened 2D arrays
    ref: RefColor;
    originalAlpha: Uint8Array | null = null; // Store original alpha channel

    constructor(w: number, h: number, cs: number, ref?: RefColor, pxls?: Uint32Array) {
        this.w = w;
        this.h = h;
        this.cs = cs;
        this.ww = 1 << Math.ceil(Math.log2(w));
        this.hh = 1 << Math.ceil(Math.log2(h));

        this.ref = ref || new RefColor(128, 128, 128, cs);

        this.channels = [
            new Int32Array(w * h),
            new Int32Array(w * h),
            new Int32Array(w * h)
        ];

        // Initialize with ref color
        for (let i = 0; i < w * h; i++) {
            this.channels[0][i] = this.ref.c[0];
            this.channels[1][i] = this.ref.c[1];
            this.channels[2][i] = this.ref.c[2];
        }

        if (pxls) {
            this.extractPlanes(pxls);
        }
    }

    clone(): Planes {
        const p = new Planes(this.w, this.h, this.cs, this.ref);
        for (let i = 0; i < 3; i++) {
            p.channels[i].set(this.channels[i]);
        }
        if (this.originalAlpha) {
            p.originalAlpha = new Uint8Array(this.originalAlpha);
        }
        return p;
    }

    private extractPlanes(pxls: Uint32Array) {
        this.originalAlpha = new Uint8Array(this.w * this.h);
        for (let y = 0; y < this.h; y++) {
            for (let x = 0; x < this.w; x++) {
                const idx = y * this.w + x;
                const p = pxls[idx];
                this.originalAlpha[idx] = (p >>> 24) & 0xff;

                // Processing uses ARGB, but canvas ImageData is RGBA (usually). 
                // Assuming input pxls is ARGB int32 for consistency with Processing port logic
                // But wait, ImageData is Uint8ClampedArray [r,g,b,a, r,g,b,a...]
                // If we pass Uint32Array view of ImageData, it depends on endianness.
                // Let's assume we handle pixel conversion before passing here or pass standard ARGB ints.
                // For now, let's assume pxls is standard ARGB integer array.

                const c = toColorspace(p, this.cs);
                this.channels[2][idx] = c & 0xff;
                this.channels[1][idx] = (c >>> 8) & 0xff;
                this.channels[0][idx] = (c >>> 16) & 0xff;
            }
        }
    }

    toPixels(): Uint32Array {
        const pxls = new Uint32Array(this.w * this.h);
        for (let i = 0; i < this.w * this.h; i++) {
            const c0 = this.channels[0][i];
            const c1 = this.channels[1][i];
            const c2 = this.channels[2][i];

            // Reconstruct color
            // Note: fromColorspace returns an integer with ARGB format (alpha might be lost/overwritten depending on impl)
            // We need to restore alpha
            const alpha = this.originalAlpha ? this.originalAlpha[i] : 255;

            // Construct a temp color int for conversion (assuming opaque for conversion logic)
            // The fromColorspace logic expects packed int.
            // We pack it as 0xAARRGGBB where AA is ignored or handled by converter
            // Actually fromColorspace returns a packed int.

            // We need to pass the channels back in the order they were extracted.
            // In extractPlanes: 0->16, 1->8, 2->0.
            // So we reconstruct a packed integer:
            const packed = (255 << 24) | ((c0 & 0xff) << 16) | ((c1 & 0xff) << 8) | (c2 & 0xff);

            const rgb = fromColorspace(packed, this.cs);

            // Now combine with original alpha
            pxls[i] = ((alpha << 24) | (rgb & 0xffffff)) >>> 0;
        }
        return pxls;
    }

    toImageData(): ImageData {
        const pxls = this.toPixels();
        const data = new Uint8ClampedArray(this.w * this.h * 4);
        // Convert ARGB int32 to RGBA bytes
        // On Little Endian, Uint32Array[0] = 0xAABBGGRR
        // But we constructed it as 0xAARRGGBB (Big Endian style logic in JS bitwise ops)
        // JS bitwise operators work on 32-bit signed integers in Big Endian conceptual order? No.
        // Actually: (255 << 24) puts 255 in the most significant byte.
        // If we write that to a buffer...

        // Let's just write bytes manually to be safe and endian-independent.
        for (let i = 0; i < this.w * this.h; i++) {
            const p = pxls[i];
            const a = (p >>> 24) & 0xff;
            const r = (p >>> 16) & 0xff;
            const g = (p >>> 8) & 0xff;
            const b = p & 0xff;

            const idx = i * 4;
            data[idx] = r;
            data[idx + 1] = g;
            data[idx + 2] = b;
            data[idx + 3] = a;
        }
        return new ImageData(data, this.w, this.h);
    }

    get(pno: number, x: number, y: number): number {
        if (x < 0 || x >= this.w || y < 0 || y >= this.h) {
            return this.ref.c[pno];
        } else {
            return this.channels[pno][y * this.w + x];
        }
    }

    set(pno: number, x: number, y: number, val: number) {
        if (x >= 0 && x < this.w && y >= 0 && y < this.h) {
            this.channels[pno][y * this.w + x] = val;
        }
    }

    getSegmentBlock(pno: number, s: Segment): number[][] {
        const res = new Array(s.size);
        for (let x = 0; x < s.size; x++) {
            res[x] = new Array(s.size);
            for (let y = 0; y < s.size; y++) {
                res[x][y] = this.get(pno, x + s.x, y + s.y) / 255.0;
            }
        }
        return res;
    }

    setSegmentBlock(pno: number, s: Segment, values: number[][], method: number) {
        for (let x = 0; x < s.size; x++) {
            for (let y = 0; y < s.size; y++) {
                this.set(pno, x + s.x, y + s.y, clamp(method, Math.round(values[x][y] * 255.0)));
            }
        }
    }

    subtract(pno: number, s: Segment, values: number[][], clamp_method: number) {
        for (let x = 0; x < s.size; x++) {
            for (let y = 0; y < s.size; y++) {
                const v = this.get(pno, x + s.x, y + s.y) - values[x][y];
                this.set(pno, x + s.x, y + s.y, clamp_in(clamp_method, v));
            }
        }
    }

    add(pno: number, s: Segment, values: number[][], clamp_method: number) {
        for (let x = 0; x < s.size; x++) {
            for (let y = 0; y < s.size; y++) {
                const v = this.get(pno, x + s.x, y + s.y) + values[x][y];
                this.set(pno, x + s.x, y + s.y, clamp_out(clamp_method, v));
            }
        }
    }
}
