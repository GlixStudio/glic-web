import { describe, it, expect } from 'vitest';
import { cutTiles, filterTiles, orderTiles, layoutSheet, renderSheet, sheetManifest, measureTile } from '../spritesheet';

// 4x2 tiles of 2px: red, green, blue, grey-dark / red, flat-white, stripes-h, stripes-v
const build = () => {
    const w = 8;
    const h = 4;
    const d = new Uint8ClampedArray(w * h * 4);
    const set = (x: number, y: number, c: number[]) => d.set([...c, 255], (y * w + x) * 4);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const col = x >> 1;
            const row = y >> 1;
            const ly = y & 1;
            const lx = x & 1;
            let c: number[];
            if (row === 0) c = [[255, 0, 0], [0, 200, 0], [0, 0, 255], [40, 40, 40]][col];
            else c = [[255, 0, 0], [255, 255, 255], ly ? [0, 0, 0] : [255, 255, 255], lx ? [0, 0, 0] : [255, 255, 255]][col];
            set(x, y, c);
        }
    }
    return new ImageData(d, w, h);
};

describe('spritesheet', () => {
    const img = build();
    const tiles = cutTiles(img, 2);

    it('cuts full tiles and measures them', () => {
        expect(tiles.length).toBe(8);
        expect(tiles[5]).toMatchObject({ col: 1, row: 1, x: 2, y: 2 });
        expect(tiles[0].features).toMatchObject({ r: 255, g: 0, b: 0, hue: 0 });
        expect(tiles[1].features.hue).toBeCloseTo(120);
        expect(tiles[3].features.hue).toBe(-1);
        expect(tiles[5].features.complexity).toBe(0);
        expect(tiles[6].features.direction).toBe(-1); // horizontal stripes
        expect(tiles[7].features.direction).toBe(1); // vertical stripes
    });

    it('filters flat tiles and duplicates', () => {
        expect(filterTiles(tiles, { minContrast: 0, dedupe: true }).length).toBe(7); // second red dropped
        expect(filterTiles(tiles, { minContrast: 1, dedupe: false }).map(t => t.index)).toEqual([6, 7]);
    });

    it('orders by hue, brightness, complexity, and reproducible random', () => {
        expect(orderTiles(tiles, 'hue').slice(0, 4).map(t => t.index)).toEqual([0, 4, 1, 2]);
        const bright = orderTiles(tiles, 'brightness').map(t => t.index);
        expect(bright[bright.length - 1]).toBe(5);
        expect(orderTiles(tiles, 'complexity').slice(-2).map(t => t.index).sort()).toEqual([6, 7]);
        const a = orderTiles(tiles, 'random', { seed: 7 }).map(t => t.index);
        expect(orderTiles(tiles, 'random', { seed: 7 }).map(t => t.index)).toEqual(a);
        expect([...a].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
        expect(orderTiles(tiles, 'grid', { reverse: true })[0].index).toBe(7);
        const sim = orderTiles(tiles, 'similar').map(t => t.index);
        // the two identical reds end up next to each other
        expect(Math.abs(sim.indexOf(0) - sim.indexOf(4))).toBe(1);
    });

    it('lays out, renders and describes the sheet', () => {
        const order = orderTiles(tiles, 'grid');
        const layout = layoutSheet(order.length, 2, 3, 1);
        expect(layout).toMatchObject({ columns: 3, rows: 3, width: 10, height: 10 });
        expect(layout.positions[4]).toEqual({ x: 4, y: 4 });
        const sheet = renderSheet(img, order, layout, 2);
        expect(Array.from(sheet.data.subarray(0, 4))).toEqual([0, 0, 0, 0]); // padding transparent
        expect(Array.from(sheet.data.subarray((1 * 10 + 1) * 4, (1 * 10 + 1) * 4 + 4))).toEqual([255, 0, 0, 255]);
        const m = sheetManifest(order, layout, 2, { image: 's.png', order: 'grid', padding: 1, source: { width: 8, height: 4 } });
        expect(Object.keys(m.frames).length).toBe(8);
        expect(m.frames.tile_0001.frame).toEqual({ x: 4, y: 1, w: 2, h: 2 });
        expect(m.frames.tile_0000.dominant).toBe('#ff0000');
        expect(m.meta.size).toEqual({ w: 10, h: 10 });
    });

    it('auto columns make a near-square sheet', () => {
        expect(layoutSheet(10, 8, 0, 0).columns).toBe(4);
        expect(measureTile(img, 0, 0, 2).contrast).toBe(0);
    });
});
