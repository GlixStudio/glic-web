// Placing an outside image (paste, drop, upload) onto the open canvas as a layer,
// Photoshop-style: centred at its own pixel size, shrunk to fit only when it is
// larger than the canvas. Layers are canvas-sized, so the placed pixels go into a
// full frame whose mask is the image's footprint (and its own transparency) - the
// rest of the frame shows the layers below, and the Move tool's box hugs it.

import { resampleImage } from './resize';
import type { Mask } from './selection';

export interface Placement {
    /** canvas-sized pixels, opaque where the image lands */
    result: ImageData;
    /** the image's footprint and alpha */
    mask: Mask;
    /** true when the image had to be shrunk to fit */
    scaled: boolean;
}

export const placeOnCanvas = (img: ImageData, w: number, h: number): Placement => {
    const fit = Math.min(1, w / img.width, h / img.height);
    const scaled = fit < 1;
    const src = scaled
        ? resampleImage(img, Math.max(1, Math.round(img.width * fit)), Math.max(1, Math.round(img.height * fit)), 'smooth')
        : img;
    const ox = Math.floor((w - src.width) / 2);
    const oy = Math.floor((h - src.height) / 2);
    const result = new ImageData(w, h);
    const mask = new Uint8ClampedArray(w * h);
    const d = result.data;
    const s = src.data;
    for (let y = 0; y < src.height; y++) {
        for (let x = 0; x < src.width; x++) {
            const i = (y * src.width + x) * 4;
            const j = (oy + y) * w + (ox + x);
            d[j * 4] = s[i];
            d[j * 4 + 1] = s[i + 1];
            d[j * 4 + 2] = s[i + 2];
            d[j * 4 + 3] = 255;
            mask[j] = s[i + 3];
        }
    }
    return { result, mask, scaled };
};
