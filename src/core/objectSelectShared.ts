// Constants and pure helpers shared by the object-selection worker and main thread.

import type { Mask } from './selection';

/** must match the installed @mediapipe/tasks-vision version (checked by a test) */
export const MEDIAPIPE_VERSION = '1.0.1';

/**
 * MediaPipe "magic touch" interactive segmenter (6.2 MB). Chosen over the
 * SAM-style interactive_segmenter_v2 (30 MB): on CPU it answers a click in
 * ~0.1 s versus ~3 s, with comparable outlines (mean IoU 0.92 vs 0.93 on a
 * five-object test scene). Its GPU delegate is not used: v2's returned empty
 * masks in Chrome, and CPU is already fast enough here.
 */
export const MODEL_URL =
    'https://storage.googleapis.com/mediapipe-models/interactive_segmenter/magic_touch/float32/1/magic_touch.tflite';
export const MODEL_BYTES = 6_227_884;

/** Maps model confidence (0..1) to a mask with a short soft edge around 50%. */
export const confidenceToMask = (conf: ArrayLike<number>): Mask => {
    const out = new Uint8ClampedArray(conf.length);
    for (let i = 0; i < conf.length; i++) {
        // smoothstep over 0.35..0.65 keeps anti-aliased edges but drops haze
        const t = Math.min(1, Math.max(0, (conf[i] - 0.35) / 0.3));
        out[i] = t * t * (3 - 2 * t) * 255;
    }
    return out;
};

/** Thins a drawn path to at most `max` evenly spaced points (the model's scribble prompt). */
export const thinPath = <P>(points: P[], max = 48): P[] => {
    if (points.length <= max) return points;
    const out: P[] = [];
    for (let i = 0; i < max; i++) out.push(points[Math.round((i * (points.length - 1)) / (max - 1))]);
    return out;
};
