import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MEDIAPIPE_VERSION, confidenceToMask, thinPath } from '../objectSelectShared';

describe('object selection helpers', () => {
    it('pins the wasm runtime to the installed tasks-vision version', () => {
        const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../../node_modules/@mediapipe/tasks-vision/package.json'), 'utf8'));
        expect(MEDIAPIPE_VERSION).toBe(pkg.version);
    });

    it('maps confidence to a mask with a soft band around 50%', () => {
        const m = confidenceToMask([0, 0.3, 0.5, 0.7, 1]);
        expect(m[0]).toBe(0);
        expect(m[1]).toBe(0);
        expect(m[2]).toBe(128);
        expect(m[3]).toBe(255);
        expect(m[4]).toBe(255);
    });

    it('thins long scribbles evenly and keeps the ends', () => {
        const pts = Array.from({ length: 200 }, (_, i) => i);
        const t = thinPath(pts, 10);
        expect(t.length).toBe(10);
        expect(t[0]).toBe(0);
        expect(t[9]).toBe(199);
        expect(thinPath([1, 2, 3], 10)).toEqual([1, 2, 3]);
    });
});
