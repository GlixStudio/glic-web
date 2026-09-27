// Small canvas/file helpers shared by the UI.

import { filtersToCss, type ImageFilters } from './filters';

export const fileToImageData = (file: File): Promise<ImageData> =>
    new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) return reject(new Error('no 2d context'));
            ctx.drawImage(img, 0, 0);
            resolve(ctx.getImageData(0, 0, canvas.width, canvas.height));
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('failed to load image'));
        };
        img.src = url;
    });

/** Lossless PNG blob from ImageData (for project storage). */
export const imageDataToPngBlob = (img: ImageData): Promise<Blob> =>
    new Promise((resolve, reject) => {
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        c.getContext('2d')!.putImageData(img, 0, 0);
        c.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png');
    });

/** ImageData from a stored image blob. */
export const blobToImageData = async (blob: Blob): Promise<ImageData> => {
    const bmp = await createImageBitmap(blob);
    const c = document.createElement('canvas');
    c.width = bmp.width;
    c.height = bmp.height;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(bmp, 0, 0);
    bmp.close();
    return ctx.getImageData(0, 0, c.width, c.height);
};

/** Draws ImageData to a fresh canvas, optionally baking in the CSS filters. */
export const imageDataToCanvas = (img: ImageData, filters?: ImageFilters): HTMLCanvasElement => {
    const src = document.createElement('canvas');
    src.width = img.width;
    src.height = img.height;
    src.getContext('2d')!.putImageData(img, 0, 0);
    if (!filters) return src;

    const out = document.createElement('canvas');
    out.width = img.width;
    out.height = img.height;
    const ctx = out.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.filter = filtersToCss(filters);
    ctx.drawImage(src, 0, 0);
    return out;
};

/**
 * Small preview dataURL of an image, optionally shown through a mask
 * (unmasked areas become transparent over a dark ground).
 */
export const imageDataToThumbnail = (
    img: ImageData,
    mask: Uint8ClampedArray | null,
    maxSize = 48
): string => {
    let shown = img;
    if (mask && mask.length === img.width * img.height) {
        const d = new Uint8ClampedArray(img.data);
        for (let i = 0; i < mask.length; i++) {
            d[i * 4 + 3] = Math.min(d[i * 4 + 3], mask[i]);
        }
        shown = new ImageData(d, img.width, img.height);
    }
    const scale = maxSize / Math.max(img.width, img.height);
    const tw = Math.max(1, Math.round(img.width * scale));
    const th = Math.max(1, Math.round(img.height * scale));
    const out = document.createElement('canvas');
    out.width = tw;
    out.height = th;
    const ctx = out.getContext('2d')!;
    ctx.fillStyle = '#18181b';
    ctx.fillRect(0, 0, tw, th);
    ctx.drawImage(imageDataToCanvas(shown), 0, 0, tw, th);
    return out.toDataURL();
};

export const timestampedFilename = (prefix: string, extension: string) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    return `${prefix}_${timestamp}.${extension}`;
};

export const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 100);
};

export const canvasToPngBlob = (canvas: HTMLCanvasElement): Promise<Blob> =>
    new Promise((resolve, reject) => {
        canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png');
    });
