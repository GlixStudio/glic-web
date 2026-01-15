export const COLORSPACES = {
    OHTA: 0,
    RGB: 1,
    CMY: 2,
    HSB: 3,
    XYZ: 4,
    YXY: 5,
    HCL: 6,
    LUV: 7,
    LAB: 8,
    HWB: 9,
    RGGBG: 10,
    YPbPr: 11,
    YCbCr: 12,
    YDbDr: 13,
    GS: 14,
    YUV: 15,
} as const;

export type ColorSpace = typeof COLORSPACES[keyof typeof COLORSPACES];

export const getColorSpaceName = (cs: number): string => {
    switch (cs) {
        case COLORSPACES.OHTA: return "OHTA";
        case COLORSPACES.CMY: return "CMY";
        case COLORSPACES.XYZ: return "XYZ";
        case COLORSPACES.YXY: return "YXY";
        case COLORSPACES.HCL: return "HCL";
        case COLORSPACES.LUV: return "LUV";
        case COLORSPACES.LAB: return "LAB";
        case COLORSPACES.HWB: return "HWB";
        case COLORSPACES.HSB: return "HSB";
        case COLORSPACES.RGGBG: return "R-GGB-G";
        case COLORSPACES.YPbPr: return "YPbPr";
        case COLORSPACES.YCbCr: return "YCbCr";
        case COLORSPACES.YDbDr: return "YDbDr";
        case COLORSPACES.GS: return "Greyscale";
        case COLORSPACES.YUV: return "YUV";
        default: return "RGB";
    }
};

// Helper functions
const constrain = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);
const map = (value: number, start1: number, stop1: number, start2: number, stop2: number) => {
    return start2 + (stop2 - start2) * ((value - start1) / (stop1 - start1));
};

// Color extraction
export const getA = (c: number) => (c >>> 24) & 0xff;
export const getR = (c: number) => (c >>> 16) & 0xff;
export const getG = (c: number) => (c >>> 8) & 0xff;
export const getB = (c: number) => c & 0xff;

export const getLuma = (c: number) => {
    return constrain(Math.round(0.2126 * getR(c) + 0.7152 * getG(c) + 0.0722 * getB(c)), 0, 255);
};

// 1/n table for n=0..255
const r255 = new Float32Array(256);
for (let i = 1; i < 256; i++) r255[i] = i / 255.0;

export const getNR = (c: number) => r255[getR(c)];
export const getNG = (c: number) => r255[getG(c)];
export const getNB = (c: number) => r255[getB(c)];

export const blendRGB = (c: number, r: number, g: number, b: number) => {
    return (c & 0xff000000) | (constrain(Math.round(r), 0, 255) << 16) | (constrain(Math.round(g), 0, 255) << 8) | constrain(Math.round(b), 0, 255);
};

// --- Converters ---

// OHTA
const toOHTA = (c: number) => {
    const R = getR(c);
    const G = getG(c);
    const B = getB(c);
    const I1 = 0.33333 * R + 0.33334 * G + 0.33333 * B;
    const I2 = map(0.5 * (R - B), -127.5, 127.5, 0, 255);
    const I3 = map(-0.25000 * R + 0.50000 * G - 0.25000 * B, -127.5, 127.5, 0, 255);
    return blendRGB(c, I1, I2, I3);
};

const fromOHTA = (c: number) => {
    const I1 = getR(c);
    const I2 = map(getG(c), 0, 255, -127.5, 127.5);
    const I3 = map(getB(c), 0, 255, -127.5, 127.5);
    const R = I1 + 1.00000 * I2 - 0.66668 * I3;
    const G = I1 + 1.33333 * I3;
    const B = I1 - 1.00000 * I2 - 0.66668 * I3;
    return blendRGB(c, R, G, B);
};

// CMY
const toCMY = (c: number) => blendRGB(c, 255 - getR(c), 255 - getG(c), 255 - getB(c));
const fromCMY = (c: number) => toCMY(c);

// HSB
const toHSB = (c: number) => {
    const R = getR(c);
    const G = getG(c);
    const B = getB(c);
    const minVal = Math.min(R, G, B);
    const maxVal = Math.max(R, G, B);
    const delta = maxVal - minVal;
    const saturation = maxVal === 0 ? 0 : delta / maxVal;
    const brightness = r255[maxVal];

    if (delta === 0) return blendRGB(c, 0, saturation * 255, brightness * 255);

    let hue = 0;
    if (R === maxVal) hue = (G - B) / delta;
    else if (G === maxVal) hue = 2.0 + (B - R) / delta;
    else hue = 4.0 + (R - G) / delta;

    hue /= 6.0;
    if (hue < 0) hue += 1.0;

    return blendRGB(c, hue * 255, saturation * 255, brightness * 255);
};

const fromHSB = (c: number) => {
    const S = getNG(c);
    const B = getNB(c);
    if (S === 0) return blendRGB(c, B * 255, B * 255, B * 255);

    const h = 6.0 * getNR(c);
    const f = h - Math.floor(h);
    const p = B * (1.0 - S);
    const q = B * (1.0 - S * f);
    const t = B * (1.0 - (S * (1.0 - f)));

    let r = 0, g = 0, b = 0;
    switch (Math.floor(h)) {
        case 0: r = B; g = t; b = p; break;
        case 1: r = q; g = B; b = p; break;
        case 2: r = p; g = B; b = t; break;
        case 3: r = p; g = q; b = B; break;
        case 4: r = t; g = p; b = B; break;
        case 5: r = B; g = p; b = q; break;
        default: r = B; g = t; b = p; break;
    }
    return blendRGB(c, r * 255, g * 255, b * 255);
};

// HWB
const toHWB = (c: number) => {
    const R = getR(c);
    const G = getG(c);
    const B = getB(c);
    const w = Math.min(R, G, B);
    const v = Math.max(R, G, B);
    let hue = 0;
    if (v === w) hue = 255;
    else {
        const f = (R === w) ? G - B : ((G === w) ? B - R : R - G);
        const p = (R === w) ? 3.0 : ((G === w) ? 5.0 : 1.0);
        hue = map((p - f / (v - w)) / 6.0, 0, 1, 0, 254);
    }
    return blendRGB(c, hue, w, 255 - v);
};

const fromHWB = (c: number) => {
    const H = getR(c);
    const B = 255 - getB(c);
    if (H === 255) return blendRGB(c, B, B, B);

    const hue = map(H, 0, 254, 0, 6);
    const v = r255[B];
    const whiteness = getNG(c);
    const i = Math.floor(hue);
    let f = hue - i;
    if ((i & 1) !== 0) f = 1.0 - f;
    const n = whiteness + f * (v - whiteness);

    let r = 0, g = 0, b = 0;
    switch (i) {
        case 1: r = n; g = v; b = whiteness; break;
        case 2: r = whiteness; g = v; b = n; break;
        case 3: r = whiteness; g = n; b = v; break;
        case 4: r = n; g = whiteness; b = v; break;
        case 5: r = v; g = whiteness; b = n; break;
        default: r = v; g = n; b = whiteness; break;
    }
    return blendRGB(c, r * 255, g * 255, b * 255);
};

// YUV
const Umax = 0.436 * 255.0;
const Vmax = 0.615 * 255.0;

const toYUV = (c: number) => {
    const R = getR(c);
    const G = getG(c);
    const B = getB(c);
    const Y = 0.299 * R + 0.587 * G + 0.114 * B;
    const U = map(-0.14713 * R - 0.28886 * G + 0.436 * B, -Umax, Umax, 0, 255);
    const V = map(0.615 * R - 0.51499 * G - 0.10001 * B, -Vmax, Vmax, 0, 255);
    return blendRGB(c, Y, U, V);
};

const fromYUV = (c: number) => {
    const Y = getR(c);
    const U = map(getG(c), 0, 255, -Umax, Umax);
    const V = map(getB(c), 0, 255, -Vmax, Vmax);
    const R = Y + 1.13983 * V;
    const G = Y - 0.39465 * U - 0.58060 * V;
    const B = Y + 2.03211 * U;
    return blendRGB(c, R, G, B);
};

// YCbCr
const toYCbCr = (c: number) => {
    const R = getR(c);
    const G = getG(c);
    const B = getB(c);
    const Y = 0.2988390 * R + 0.5868110 * G + 0.1143500 * B;
    const Cb = -0.168736 * R - 0.3312640 * G + 0.5000000 * B + 127.5;
    const Cr = 0.5000000 * R - 0.4186880 * G - 0.0813120 * B + 127.5;
    return blendRGB(c, Y, Cb, Cr);
};

const fromYCbCr = (c: number) => {
    const Y = getR(c);
    const Cb = getG(c) - 127.5;
    const Cr = getB(c) - 127.5;
    const R = Y + 1.402 * Cr + 1;
    const G = Y - 0.344136 * Cb - 0.714136 * Cr;
    const B = Y + 1.772000 * Cb + 1;
    return blendRGB(c, R, G, B);
};

// YPbPr
const toYPbPr = (c: number) => {
    const R = getR(c);
    const B = getB(c);
    const Y = getLuma(c);
    let Pb = B - Y;
    let Pr = R - Y;
    if (Pb < 0) Pb += 256;
    if (Pr < 0) Pr += 256;
    return blendRGB(c, Y, Pb, Pr);
};

const fromYPbPr = (c: number) => {
    const Y = getR(c);
    let B = getG(c) + Y;
    let R = getB(c) + Y;
    if (R > 255) R -= 256;
    if (B > 255) B -= 256;
    const G = (Y - 0.2126 * R - 0.0722 * B) / 0.7152;
    return blendRGB(c, R, G, B);
};

// YDbDr
const toYDbDr = (c: number) => {
    const R = getR(c);
    const G = getG(c);
    const B = getB(c);
    const Y = 0.299 * R + 0.587 * G + 0.114 * B;
    const Db = 127.5 + (-0.450 * R - 0.883 * G + 1.333 * B) / 2.666;
    const Dr = 127.5 + (-1.333 * R + 1.116 * G + 0.217 * B) / 2.666;
    return blendRGB(c, Y, Db, Dr);
};

const fromYDbDr = (c: number) => {
    const Y = getR(c);
    const Db = (getG(c) - 127.5) * 2.666;
    const Dr = (getB(c) - 127.5) * 2.666;
    const R = Y + 9.2303716147657e-05 * Db - 0.52591263066186533 * Dr;
    const G = Y - 0.12913289889050927 * Db + 0.26789932820759876 * Dr;
    const B = Y + 0.66467905997895482 * Db - 7.9202543533108e-05 * Dr;
    return blendRGB(c, R, G, B);
};

// RGGBG
const toRGGBG = (c: number) => {
    const G = getG(c);
    let R = getR(c) - G;
    let B = getB(c) - G;
    if (R < 0) R += 256;
    if (B < 0) B += 256;
    return blendRGB(c, R, G, B);
};

const fromRGGBG = (c: number) => {
    const G = getG(c);
    let R = getR(c) + G;
    let B = getB(c) + G;
    if (R > 255) R -= 256;
    if (B > 255) B -= 256;
    return blendRGB(c, R, G, B);
};

// GS
const tofromGS = (c: number) => {
    const l = getLuma(c);
    return blendRGB(c, l, l, l);
};

// XYZ
const correctionxyz = (n: number) => (n > 0.04045 ? Math.pow((n + 0.055) / 1.055, 2.4) : n / 12.92) * 100.0;
const recorrectionxyz = (n: number) => (n > 0.0031308 ? 1.055 * Math.pow(n, 1.0 / 2.4) - 0.055 : 12.92 * n);

const RANGE_X = 100.0 * (0.4124 + 0.3576 + 0.1805);
const RANGE_Y = 100.0;
const RANGE_Z = 100.0 * (0.0193 + 0.1192 + 0.9505);

const _toXYZ = (rr: number, gg: number, bb: number) => {
    const r = correctionxyz(rr);
    const g = correctionxyz(gg);
    const b = correctionxyz(bb);
    return {
        x: r * 0.4124 + g * 0.3576 + b * 0.1805,
        y: r * 0.2126 + g * 0.7152 + b * 0.0722,
        z: r * 0.0193 + g * 0.1192 + b * 0.9505
    };
};

const _fromXYZ = (c: number, xx: number, yy: number, zz: number) => {
    const x = xx / 100.0;
    const y = yy / 100.0;
    const z = zz / 100.0;
    const r = 255.0 * recorrectionxyz(x * 3.2406 + y * -1.5372 + z * -0.4986);
    const g = 255.0 * recorrectionxyz(x * -0.9689 + y * 1.8758 + z * 0.0415);
    const b = 255.0 * recorrectionxyz(x * 0.0557 + y * -0.2040 + z * 1.0570);
    return blendRGB(c, r, g, b);
};

const toXYZ = (c: number) => {
    const xyz = _toXYZ(getNR(c), getNG(c), getNB(c));
    return blendRGB(c,
        map(xyz.x, 0, RANGE_X, 0, 255),
        map(xyz.y, 0, RANGE_Y, 0, 255),
        map(xyz.z, 0, RANGE_Z, 0, 255)
    );
};

const fromXYZ = (c: number) => {
    const x = map(getR(c), 0, 255, 0, RANGE_X);
    const y = map(getG(c), 0, 255, 0, RANGE_Y);
    const z = map(getB(c), 0, 255, 0, RANGE_Z);
    return _fromXYZ(c, x, y, z);
};

// YXY
const toYXY = (c: number) => {
    const xyz = _toXYZ(getNR(c), getNG(c), getNB(c));
    const sum = xyz.x + xyz.y + xyz.z;
    const x = sum > 0 ? xyz.x / sum : 0.0;
    const y = sum > 0 ? xyz.y / sum : 0.0;
    return blendRGB(c,
        map(xyz.y, 0, RANGE_Y, 0, 255),
        map(x, 0.0, 1.0, 0, 255),
        map(y, 0.0, 1.0, 0, 255)
    );
};

const fromYXY = (c: number) => {
    const Y = map(getR(c), 0, 255, 0, RANGE_Y);
    const x = map(getG(c), 0, 255, 0, 1.0);
    const y = map(getB(c), 0, 255, 0, 1.0);
    const divy = Y / (y > 0 ? y : 1.0e-6);
    return _fromXYZ(c, x * divy, Y, (1 - x - y) * divy);
};

// LAB & LUV constants
const D65X = 0.950456;
const D65Y = 1.0;
const D65Z = 1.088754;
const CIEEpsilon = 216.0 / 24389.0;
const CIEK = 24389.0 / 27.0;
const CIEK2epsilon = CIEK * CIEEpsilon;
// const D65FX_4 = 4.0 * D65X / (D65X + 15.0 * D65Y + 3.0 * D65Z);
// const D65FY_9 = 9.0 * D65Y / (D65X + 15.0 * D65Y + 3.0 * D65Z);
const One_Third = 1.0 / 3.0;
const one_hsixteen = 1.0 / 116.0;

// LAB
const toLAB = (c: number) => {
    const xyz = _toXYZ(getNR(c), getNG(c), getNB(c));
    xyz.x /= (100.0 * D65X);
    xyz.y /= (100.0 * D65Y);
    xyz.z /= (100.0 * D65Z);

    const f = (t: number) => t > CIEEpsilon ? Math.pow(t, One_Third) : (CIEK * t + 16.0) * one_hsixteen;

    const fx = f(xyz.x);
    const fy = f(xyz.y);
    const fz = f(xyz.z);

    const L = 116.0 * fy - 16.0;
    const a = 500.0 * (fx - fy);
    const b = 200.0 * (fy - fz);

    return blendRGB(c, L * 2.55, (a + 128), (b + 128)); // Adjusted mapping for 0-255 range
};

const fromLAB = (c: number) => {
    const L = getNR(c) * 100.0;
    const a = getNG(c) * 255.0 - 128.0;
    const b = getNB(c) * 255.0 - 128.0;

    const fy = (L + 16.0) * one_hsixteen;
    const fx = a / 500.0 + fy;
    const fz = fy - b / 200.0;

    const finv = (t: number) => {
        const t3 = t * t * t;
        return t3 > CIEEpsilon ? t3 : (116.0 * t - 16.0) / CIEK;
    };

    const x = finv(fx) * D65X * 100.0;
    const y = L > CIEK2epsilon ? Math.pow((L + 16.0) * one_hsixteen, 3.0) * 100.0 : L / CIEK * 100.0;
    const z = finv(fz) * D65Z * 100.0;

    return _fromXYZ(c, x, y, z);
};

// LUV
const toLUV = (c: number) => {
    const xyz = _toXYZ(getNR(c), getNG(c), getNB(c));
    xyz.x /= 100.0; xyz.y /= 100.0; xyz.z /= 100.0;

    const L = xyz.y > CIEEpsilon ? 116.0 * Math.pow(xyz.y, One_Third) - 16.0 : CIEK * xyz.y;
    const div = xyz.x + 15.0 * xyz.y + 3.0 * xyz.z;
    const u_prime = div === 0 ? 0 : (4.0 * xyz.x) / div;
    const v_prime = div === 0 ? 0 : (9.0 * xyz.y) / div;

    const un = (4.0 * D65X) / (D65X + 15.0 * D65Y + 3.0 * D65Z);
    const vn = (9.0 * D65Y) / (D65X + 15.0 * D65Y + 3.0 * D65Z);

    const u = 13.0 * L * (u_prime - un);
    const v = 13.0 * L * (v_prime - vn);

    return blendRGB(c, L * 2.55, (u + 134) / 354 * 255, (v + 140) / 262 * 255);
};

const fromLUV = (c: number) => {
    const L = getNR(c) * 100.0;
    const u = getNG(c) * 354.0 - 134.0;
    const v = getNB(c) * 262.0 - 140.0;

    const Y = L > CIEK2epsilon ? Math.pow((L + 16.0) * one_hsixteen, 3.0) : L / CIEK;

    const un = (4.0 * D65X) / (D65X + 15.0 * D65Y + 3.0 * D65Z);
    const vn = (9.0 * D65Y) / (D65X + 15.0 * D65Y + 3.0 * D65Z);

    const u_prime = u / (13.0 * L) + un;
    const v_prime = v / (13.0 * L) + vn;

    const X = Y * (9.0 * u_prime) / (4.0 * v_prime);
    const Z = Y * (12.0 - 3.0 * u_prime - 20.0 * v_prime) / (4.0 * v_prime);

    return _fromXYZ(c, X * 100.0, Y * 100.0, Z * 100.0);
};

// HCL
const toHCL = (c: number) => {
    const r = getNR(c);
    const g = getNG(c);
    const b = getNB(c);
    const maxVal = Math.max(r, Math.max(g, b));
    const minVal = Math.min(r, Math.min(g, b));
    const chr = maxVal - minVal;
    let h = 0;
    if (chr !== 0) {
        if (r === maxVal) h = ((g - b) / chr + 6.0) % 6.0;
        else if (g === maxVal) h = (b - r) / chr + 2.0;
        else h = (r - g) / chr + 4.0;
    }
    return blendRGB(c, (h / 6.0) * 255, chr * 255, 255 * (0.298839 * r + 0.586811 * g + 0.114350 * b));
};

const fromHCL = (c: number) => {
    const h = 6.0 * getNR(c);
    const chr = getNG(c);
    const l = getNB(c);
    const x = chr * (1.0 - Math.abs((h % 2.0) - 1.0));
    let r = 0, g = 0, b = 0;
    if (0 <= h && h < 1) { r = chr; g = x; }
    else if (1 <= h && h < 2) { r = x; g = chr; }
    else if (2 <= h && h < 3) { g = chr; b = x; }
    else if (3 <= h && h < 4) { g = x; b = chr; }
    else if (4 <= h && h < 5) { r = x; b = chr; }
    else { r = chr; b = x; }

    const m = l - (0.298839 * r + 0.586811 * g + 0.114350 * b);
    return blendRGB(c, (r + m) * 255, (g + m) * 255, (b + m) * 255);
};

// Main conversion functions
export const toColorspace = (c: number, cs: number): number => {
    switch (cs) {
        case COLORSPACES.OHTA: return toOHTA(c);
        case COLORSPACES.CMY: return toCMY(c);
        case COLORSPACES.XYZ: return toXYZ(c);
        case COLORSPACES.YXY: return toYXY(c);
        case COLORSPACES.HCL: return toHCL(c);
        case COLORSPACES.LUV: return toLUV(c);
        case COLORSPACES.LAB: return toLAB(c);
        case COLORSPACES.HWB: return toHWB(c);
        case COLORSPACES.HSB: return toHSB(c);
        case COLORSPACES.RGGBG: return toRGGBG(c);
        case COLORSPACES.YPbPr: return toYPbPr(c);
        case COLORSPACES.YCbCr: return toYCbCr(c);
        case COLORSPACES.YDbDr: return toYDbDr(c);
        case COLORSPACES.GS: return tofromGS(c);
        case COLORSPACES.YUV: return toYUV(c);
        default: return c;
    }
};

export const fromColorspace = (c: number, cs: number): number => {
    switch (cs) {
        case COLORSPACES.OHTA: return fromOHTA(c);
        case COLORSPACES.CMY: return fromCMY(c);
        case COLORSPACES.XYZ: return fromXYZ(c);
        case COLORSPACES.YXY: return fromYXY(c);
        case COLORSPACES.HCL: return fromHCL(c);
        case COLORSPACES.LUV: return fromLUV(c);
        case COLORSPACES.LAB: return fromLAB(c);
        case COLORSPACES.HWB: return fromHWB(c);
        case COLORSPACES.HSB: return fromHSB(c);
        case COLORSPACES.RGGBG: return fromRGGBG(c);
        case COLORSPACES.YPbPr: return fromYPbPr(c);
        case COLORSPACES.YCbCr: return fromYCbCr(c);
        case COLORSPACES.YDbDr: return fromYDbDr(c);
        case COLORSPACES.GS: return tofromGS(c);
        case COLORSPACES.YUV: return fromYUV(c);
        default: return c;
    }
};
