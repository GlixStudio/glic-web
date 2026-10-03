// Fitting a still image under an upload size as WebP without wrecking it.
//
// Glitch art is exactly the content lossy codecs smear (hard edges, chroma
// noise, single-pixel detail), so the order is:
//   1. lossless WebP, decoded again and compared pixel for pixel - if it fits,
//      the upload is bit-identical to what the editor made;
//   2. near-lossless WebP: still the lossless codec at full colour resolution,
//      only the lowest bits of busy pixels nudged (~40-50 dB);
//   3. lossy WebP from high quality down - it halves colour resolution (4:2:0),
//      which is why it comes last - with sharp RGB->YUV;
//   4. only then fewer pixels (area-averaged), and lossy again.
// The first candidate that fits wins; its PSNR against the source is recorded.
// Every result is decoded once more before it is accepted, so a file the
// encoder mangled never reaches the server.

import { resampleImage } from '../core/resize';

export interface WebpCodec {
    encode(img: ImageData, opts: Record<string, number>): Promise<ArrayBuffer>;
    decode(bytes: ArrayBuffer): Promise<ImageData>;
}

export interface ShrinkResult {
    bytes: Uint8Array;
    width: number;
    height: number;
    mode: 'lossless' | 'near-lossless' | 'lossy';
    quality: number | null;
    /** dB against the source at the output size; Infinity when identical */
    psnr: number;
    /** output width / source width */
    scale: number;
}

/** WebP's hard limit per side */
export const WEBP_MAX_SIDE = 16383;
const LOSSY_QUALITIES = [95, 92, 88, 84, 80, 75];
/** libwebp near_lossless levels, gentlest first (100 would be lossless) */
const NEAR_LOSSLESS_LEVELS = [80, 60, 40, 20];
/** near-lossless rarely saves more than this much, so further off it is not worth the encodes */
const NEAR_LOSSLESS_REACH = 3;

const LOSSLESS = { lossless: 1, exact: 1, quality: 75, method: 4 };
// libwebp skips near-lossless preprocessing when `exact` is set; exact only
// keeps the colour under fully transparent pixels, which nobody can see
const nearLossless = (level: number) => ({ lossless: 1, quality: 75, method: 4, near_lossless: level });
const lossy = (quality: number) => ({ quality, method: 4, use_sharp_yuv: 1, exact: 1, alpha_quality: 100 });

/** peak signal-to-noise ratio over RGBA; Infinity when the images are identical */
export const psnr = (a: ImageData, b: ImageData): number => {
    if (a.width !== b.width || a.height !== b.height) return 0;
    let se = 0;
    const da = a.data;
    const db = b.data;
    for (let i = 0; i < da.length; i++) {
        const d = da[i] - db[i];
        se += d * d;
    }
    if (se === 0) return Infinity;
    return 10 * Math.log10((255 * 255) / (se / da.length));
};

export const identical = (a: ImageData, b: ImageData) => {
    if (a.width !== b.width || a.height !== b.height) return false;
    const da = a.data;
    const db = b.data;
    for (let i = 0; i < da.length; i++) if (da[i] !== db[i]) return false;
    return true;
};

const scaled = (img: ImageData, factor: number): ImageData => {
    const w = Math.max(1, Math.round(img.width * factor));
    const h = Math.max(1, Math.round(img.height * factor));
    return resampleImage(img, w, h, 'smooth');
};

export const shrinkToWebp = async (
    source: ImageData,
    targetBytes: number,
    codec: WebpCodec,
    onStep: (label: string) => void = () => {}
): Promise<ShrinkResult> => {
    let img = source;
    const longSide = Math.max(img.width, img.height);
    if (longSide > WEBP_MAX_SIDE) img = scaled(img, WEBP_MAX_SIDE / longSide);
    const scale = () => img.width / source.width;

    if (img === source) {
        onStep('Trying lossless WebP');
        const buf = await codec.encode(img, LOSSLESS);
        if (buf.byteLength <= targetBytes) {
            const back = await codec.decode(buf);
            if (identical(back, img)) return { bytes: new Uint8Array(buf), width: img.width, height: img.height, mode: 'lossless', quality: null, psnr: Infinity, scale: 1 };
            // a lossless file that does not round-trip is an encoder fault: never ship it
            onStep('Lossless round-trip mismatch, falling back');
        }
        if (buf.byteLength <= targetBytes * NEAR_LOSSLESS_REACH) {
            for (const level of NEAR_LOSSLESS_LEVELS) {
                onStep(`Trying near-lossless WebP (${level})`);
                const nl = await codec.encode(img, nearLossless(level));
                if (nl.byteLength > targetBytes) continue;
                const back = await codec.decode(nl);
                if (back.width !== img.width || back.height !== img.height) break;
                return { bytes: new Uint8Array(nl), width: img.width, height: img.height, mode: 'near-lossless', quality: level, psnr: psnr(back, img), scale: 1 };
            }
        }
    }

    for (let round = 0; round < 4; round++) {
        let lastSize = Infinity;
        for (const q of LOSSY_QUALITIES) {
            onStep(`Trying WebP quality ${q}${scale() < 1 ? ` at ${img.width}×${img.height}` : ''}`);
            const buf = await codec.encode(img, lossy(q));
            lastSize = buf.byteLength;
            if (buf.byteLength > targetBytes) continue;
            const back = await codec.decode(buf);
            if (back.width !== img.width || back.height !== img.height) throw new Error('WebP decode returned the wrong size');
            return { bytes: new Uint8Array(buf), width: img.width, height: img.height, mode: 'lossy', quality: q, psnr: psnr(back, img), scale: scale() };
        }
        // still too big at the lowest quality we accept: fewer pixels, sized from how far off we are
        const factor = Math.min(0.9, Math.max(0.25, Math.sqrt(targetBytes / lastSize) * 0.95));
        img = scaled(img, factor);
    }
    throw new Error('Could not fit this image under the upload limit');
};

/** grid rendition: long side at most `side`, lossy; null when the source is already small enough to show as is */
export const makePreview = async (source: ImageData, sourceBytes: number, codec: WebpCodec, side = 960): Promise<{ bytes: Uint8Array; width: number; height: number } | null> => {
    const longSide = Math.max(source.width, source.height);
    if (longSide <= side * 1.34 && sourceBytes <= 600 * 1024) return null;
    const img = longSide > side ? scaled(source, side / longSide) : source;
    const buf = await codec.encode(img, { quality: 82, method: 4, use_sharp_yuv: 1 });
    return { bytes: new Uint8Array(buf), width: img.width, height: img.height };
};
