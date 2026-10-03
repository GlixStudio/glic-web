// File-type sniffing from magic bytes and image dimensions from headers.
// The server never trusts a client's Content-Type: what a file is, and how
// big it is, comes from its own bytes.

export type SniffedType =
    | 'image/png'
    | 'image/jpeg'
    | 'image/webp'
    | 'image/gif'
    | 'video/webm'
    | 'video/mp4'
    | 'application/zip';

const ascii = (b: Uint8Array, off: number, len: number) => String.fromCharCode(...b.subarray(off, off + len));

export const sniffType = (b: Uint8Array): SniffedType | null => {
    if (b.length < 12) return null;
    if (b[0] === 0x89 && ascii(b, 1, 3) === 'PNG') return 'image/png';
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
    if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return 'image/webp';
    if (ascii(b, 0, 6) === 'GIF87a' || ascii(b, 0, 6) === 'GIF89a') return 'image/gif';
    if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'video/webm';
    if (ascii(b, 4, 4) === 'ftyp') return 'video/mp4';
    if (b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) return 'application/zip';
    return null;
};

export const EXTENSIONS: Record<SniffedType, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'video/webm': 'webm',
    'video/mp4': 'mp4',
    'application/zip': 'zip',
};

export const isImageType = (t: string) => t.startsWith('image/');
export const isVideoType = (t: string) => t.startsWith('video/');

/** true for a GIF with more than one frame or a WebP with an ANIM chunk */
export const isAnimated = (b: Uint8Array, type: SniffedType): boolean => {
    if (type === 'image/webp') {
        // VP8X header flags: bit 1 = animation
        return ascii(b, 12, 4) === 'VP8X' && (b[20] & 0x02) !== 0;
    }
    if (type !== 'image/gif') return false;
    // count image descriptors, walking blocks so pixel data is never mistaken for one
    let off = 13;
    const flags = b[10];
    if (flags & 0x80) off += 3 * (1 << ((flags & 0x07) + 1));
    let frames = 0;
    while (off < b.length) {
        const block = b[off];
        if (block === 0x2c) {
            frames++;
            if (frames > 1) return true;
            const lf = b[off + 9];
            off += 10;
            if (lf & 0x80) off += 3 * (1 << ((lf & 0x07) + 1));
            off++; // LZW minimum code size
            off = skipSubBlocks(b, off);
        } else if (block === 0x21) {
            off = skipSubBlocks(b, off + 2);
        } else break;
    }
    return false;
};

const skipSubBlocks = (b: Uint8Array, off: number): number => {
    while (off < b.length) {
        const len = b[off];
        off += 1 + len;
        if (len === 0) break;
    }
    return off;
};

/** pixel size from the header, or null when the header does not say */
export const imageSize = (b: Uint8Array, type: SniffedType): { width: number; height: number } | null => {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    try {
        if (type === 'image/png') return { width: dv.getUint32(16), height: dv.getUint32(20) };
        if (type === 'image/gif') return { width: dv.getUint16(6, true), height: dv.getUint16(8, true) };
        if (type === 'image/webp') {
            const chunk = ascii(b, 12, 4);
            if (chunk === 'VP8X') return { width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
            if (chunk === 'VP8L') {
                const bits = dv.getUint32(21, true);
                return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
            }
            if (chunk === 'VP8 ') return { width: dv.getUint16(26, true) & 0x3fff, height: dv.getUint16(28, true) & 0x3fff };
            return null;
        }
        if (type === 'image/jpeg') {
            let off = 2;
            while (off + 9 < b.length) {
                if (b[off] !== 0xff) return null;
                const marker = b[off + 1];
                if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
                    off += 2;
                    continue;
                }
                const len = dv.getUint16(off + 2);
                // SOF0..SOF15 except DHT (C4), JPG (C8), DAC (CC)
                if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc)
                    return { width: dv.getUint16(off + 7), height: dv.getUint16(off + 5) };
                off += 2 + len;
            }
        }
    } catch {
        return null;
    }
    return null;
};
