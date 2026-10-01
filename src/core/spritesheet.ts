// Tiles -> spritesheet. Cuts the image into a grid, measures every tile
// (dominant color, brightness, saturation, edge complexity, edge direction),
// optionally drops flat or duplicate tiles, orders them, packs them into a sheet
// and describes the result in a TexturePacker-style JSON manifest (the "hash"
// format Phaser/Pixi read) with the measurements attached per frame, so a
// pattern generator can pick tiles by color or shape.

export interface TileFeatures {
    /** dominant color (most common 4-bit-per-channel bucket, averaged) */
    r: number;
    g: number;
    b: number;
    /** 0..360; -1 for near-grey tiles */
    hue: number;
    /** 0..1 */
    saturation: number;
    /** mean luma 0..255 */
    brightness: number;
    /** luma standard deviation 0..~128 */
    contrast: number;
    /** mean gradient magnitude 0..255: flat = 0, busy = high */
    complexity: number;
    /** -1 = all horizontal edges (vertical gradient) .. +1 = all vertical edges */
    direction: number;
    /** FNV-1a hash of the pixels, for duplicate detection */
    hash: number;
}

export interface Tile {
    index: number;
    col: number;
    row: number;
    x: number;
    y: number;
    features: TileFeatures;
}

export const measureTile = (img: ImageData, x0: number, y0: number, size: number): TileFeatures => {
    const w = img.width;
    const d = img.data;
    const bins = new Map<number, { n: number; r: number; g: number; b: number }>();
    let sum = 0;
    let sum2 = 0;
    let gx = 0;
    let gy = 0;
    let hash = 0x811c9dc5;
    const n = size * size;
    const lum = new Float32Array(n);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const o = ((y0 + y) * w + (x0 + x)) * 4;
            const r = d[o];
            const g = d[o + 1];
            const b = d[o + 2];
            const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            lum[y * size + x] = l;
            sum += l;
            sum2 += l * l;
            const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
            const bin = bins.get(key);
            if (bin) {
                bin.n++;
                bin.r += r;
                bin.g += g;
                bin.b += b;
            } else bins.set(key, { n: 1, r, g, b });
            for (let c = 0; c < 4; c++) hash = Math.imul(hash ^ d[o + c], 0x01000193);
        }
    }
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const i = y * size + x;
            if (x + 1 < size) gx += Math.abs(lum[i + 1] - lum[i]);
            if (y + 1 < size) gy += Math.abs(lum[i + size] - lum[i]);
        }
    }
    let best = { n: 0, r: 0, g: 0, b: 0 };
    for (const bin of bins.values()) if (bin.n > best.n) best = bin;
    const r = best.r / best.n;
    const g = best.g / best.n;
    const b = best.b / best.n;
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const saturation = mx === 0 ? 0 : (mx - mn) / mx;
    let hue = -1;
    if (mx - mn > 8 && saturation > 0.08) {
        const c = mx - mn;
        hue = mx === r ? ((g - b) / c) % 6 : mx === g ? (b - r) / c + 2 : (r - g) / c + 4;
        hue *= 60;
        if (hue < 0) hue += 360;
    }
    const mean = sum / n;
    const pairs = Math.max(1, size * (size - 1));
    const edge = gx + gy;
    return {
        r: Math.round(r),
        g: Math.round(g),
        b: Math.round(b),
        hue,
        saturation,
        brightness: mean,
        contrast: Math.sqrt(Math.max(0, sum2 / n - mean * mean)),
        complexity: edge / (2 * pairs),
        // gx measures change along x, i.e. vertical edges
        direction: edge === 0 ? 0 : (gx - gy) / edge,
        hash: hash >>> 0,
    };
};

/** Cuts full tiles only (a partial right/bottom strip is ignored). */
export const cutTiles = (img: ImageData, size: number): Tile[] => {
    const cols = Math.floor(img.width / size);
    const rows = Math.floor(img.height / size);
    const tiles: Tile[] = [];
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            tiles.push({
                index: tiles.length,
                col,
                row,
                x: col * size,
                y: row * size,
                features: measureTile(img, col * size, row * size, size),
            });
        }
    }
    return tiles;
};

export interface TileFilter {
    /** drop tiles whose contrast is below this (0 = keep all) */
    minContrast: number;
    /** drop pixel-identical repeats */
    dedupe: boolean;
}

export const filterTiles = (tiles: Tile[], f: TileFilter): Tile[] => {
    const seen = new Set<number>();
    return tiles.filter(t => {
        if (t.features.contrast < f.minContrast) return false;
        if (f.dedupe) {
            if (seen.has(t.features.hash)) return false;
            seen.add(t.features.hash);
        }
        return true;
    });
};

export type SpriteOrder = 'grid' | 'random' | 'hue' | 'brightness' | 'saturation' | 'complexity' | 'direction' | 'similar';

export const SPRITE_ORDERS: { value: SpriteOrder; label: string }[] = [
    { value: 'grid', label: 'As cut (grid order)' },
    { value: 'random', label: 'Random' },
    { value: 'hue', label: 'Dominant color (hue)' },
    { value: 'brightness', label: 'Brightness' },
    { value: 'saturation', label: 'Saturation' },
    { value: 'complexity', label: 'Shape: flat → busy' },
    { value: 'direction', label: 'Shape: horizontal → vertical' },
    { value: 'similar', label: 'Similar next to similar' },
];

/** mulberry32 */
export const seededRandom = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const featureVector = (f: TileFeatures): number[] => [f.r, f.g, f.b, f.complexity * 2];

const dist2 = (a: number[], b: number[]) => {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
    return s;
};

/** interleaves the bits of three 8-bit values (Z-order curve through RGB) */
const morton3 = (r: number, g: number, b: number) => {
    let m = 0;
    for (let i = 7; i >= 0; i--) m = m * 8 + (((r >> i) & 1) << 2) + (((g >> i) & 1) << 1) + ((b >> i) & 1);
    return m;
};

/** Greedy nearest-neighbour chain; falls back to a Z-order curve for large sets. */
const similarChain = (tiles: Tile[]): Tile[] => {
    if (tiles.length > 2500) {
        return [...tiles].sort((a, b) => morton3(a.features.r, a.features.g, a.features.b) - morton3(b.features.r, b.features.g, b.features.b));
    }
    const left = [...tiles];
    const vecs = new Map(left.map(t => [t, featureVector(t.features)]));
    let cur = left.reduce((a, b) => (b.features.brightness < a.features.brightness ? b : a));
    const out: Tile[] = [];
    while (left.length) {
        const i = left.indexOf(cur);
        left.splice(i, 1);
        out.push(cur);
        if (!left.length) break;
        const v = vecs.get(cur)!;
        let best = left[0];
        let bd = Infinity;
        for (const t of left) {
            const dd = dist2(v, vecs.get(t)!);
            if (dd < bd) {
                bd = dd;
                best = t;
            }
        }
        cur = best;
    }
    return out;
};

export const orderTiles = (tiles: Tile[], order: SpriteOrder, opts: { seed?: number; reverse?: boolean } = {}): Tile[] => {
    let out: Tile[];
    const by = (key: (t: Tile) => number) => [...tiles].sort((a, b) => key(a) - key(b) || a.index - b.index);
    switch (order) {
        case 'random': {
            const rnd = seededRandom(opts.seed ?? 1);
            out = [...tiles];
            for (let i = out.length - 1; i > 0; i--) {
                const j = Math.floor(rnd() * (i + 1));
                [out[i], out[j]] = [out[j], out[i]];
            }
            break;
        }
        case 'hue':
            // colored tiles around the wheel, then greys dark -> light
            out = by(t => (t.features.hue < 0 ? 1000 + t.features.brightness / 255 : t.features.hue));
            break;
        case 'brightness':
            out = by(t => t.features.brightness);
            break;
        case 'saturation':
            out = by(t => t.features.saturation);
            break;
        case 'complexity':
            out = by(t => t.features.complexity);
            break;
        case 'direction':
            out = by(t => t.features.direction);
            break;
        case 'similar':
            out = similarChain(tiles);
            break;
        default:
            out = [...tiles];
    }
    return opts.reverse ? out.reverse() : out;
};

export interface SheetLayout {
    columns: number;
    rows: number;
    width: number;
    height: number;
    /** top-left of each placed tile, in placement order */
    positions: { x: number; y: number }[];
}

/** columns = 0 picks a near-square sheet */
export const layoutSheet = (count: number, size: number, columns: number, padding: number): SheetLayout => {
    const cols = Math.max(1, columns > 0 ? Math.min(columns, count || 1) : Math.ceil(Math.sqrt(count || 1)));
    const rows = Math.max(1, Math.ceil(count / cols));
    const step = size + padding;
    const positions = Array.from({ length: count }, (_, i) => ({
        x: padding + (i % cols) * step,
        y: padding + Math.floor(i / cols) * step,
    }));
    return { columns: cols, rows, width: padding + cols * step, height: padding + rows * step, positions };
};

/** Copies the ordered tiles into a transparent sheet. */
export const renderSheet = (img: ImageData, tiles: Tile[], layout: SheetLayout, size: number): ImageData => {
    const out = new Uint8ClampedArray(layout.width * layout.height * 4);
    tiles.forEach((t, i) => {
        const p = layout.positions[i];
        for (let y = 0; y < size; y++) {
            const s = ((t.y + y) * img.width + t.x) * 4;
            out.set(img.data.subarray(s, s + size * 4), ((p.y + y) * layout.width + p.x) * 4);
        }
    });
    return new ImageData(out, layout.width, layout.height);
};

const hex = (f: TileFeatures) => `#${[f.r, f.g, f.b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
const round = (v: number, k = 3) => Math.round(v * 10 ** k) / 10 ** k;

export const sheetManifest = (
    tiles: Tile[],
    layout: SheetLayout,
    size: number,
    meta: { image: string; order: SpriteOrder; padding: number; source: { width: number; height: number } }
) => ({
    frames: Object.fromEntries(
        tiles.map((t, i) => {
            const p = layout.positions[i];
            return [
                `tile_${String(i).padStart(4, '0')}`,
                {
                    frame: { x: p.x, y: p.y, w: size, h: size },
                    rotated: false,
                    trimmed: false,
                    spriteSourceSize: { x: 0, y: 0, w: size, h: size },
                    sourceSize: { w: size, h: size },
                    source: { col: t.col, row: t.row, x: t.x, y: t.y },
                    dominant: hex(t.features),
                    hue: round(t.features.hue, 1),
                    saturation: round(t.features.saturation),
                    brightness: round(t.features.brightness / 255),
                    complexity: round(t.features.complexity / 255),
                    direction: round(t.features.direction),
                },
            ];
        })
    ),
    meta: {
        app: 'GLIX Encoder (encoder.glix.studio)',
        version: '1',
        image: meta.image,
        format: 'RGBA8888',
        size: { w: layout.width, h: layout.height },
        scale: '1',
        tileSize: size,
        columns: layout.columns,
        rows: layout.rows,
        padding: meta.padding,
        count: tiles.length,
        order: meta.order,
        sourceImage: meta.source,
    },
});
