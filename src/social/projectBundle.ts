// A saved project as one portable file: a ZIP holding project.json plus every
// binary (source PNG, layer PNGs, masks, .glic streams) as its own entry.
//
// The walk is generic - any Blob or Uint8Array anywhere in the record becomes a
// file and comes back as the same type - so fields added to ProjectRecord
// later travel without touching this code. Nothing is re-encoded: PNGs are
// stored byte for byte, raw buffers are deflated losslessly.

import JSZip from 'jszip';
import type { ProjectRecord } from '../core/projects';

export const BUNDLE_FORMAT = 'glix-encoder-project';
export const BUNDLE_VERSION = 1;

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

export const packProject = async (record: ProjectRecord): Promise<Blob> => {
    const zip = new JSZip();
    let n = 0;
    const walk = async (v: unknown): Promise<Json> => {
        if (v instanceof Blob) {
            const path = `files/${n++}${v.type === 'image/png' ? '.png' : '.bin'}`;
            // PNG is already compressed: store it as is
            zip.file(path, await v.arrayBuffer(), { compression: v.type === 'image/png' ? 'STORE' : 'DEFLATE' });
            return { $blob: path, type: v.type };
        }
        if (v instanceof Uint8Array || v instanceof Uint8ClampedArray) {
            const path = `files/${n++}.bin`;
            zip.file(path, new Uint8Array(v.buffer, v.byteOffset, v.byteLength).slice());
            return { $bytes: path, clamped: v instanceof Uint8ClampedArray };
        }
        if (Array.isArray(v)) return Promise.all(v.map(walk));
        if (v && typeof v === 'object') {
            const out: Record<string, Json> = {};
            for (const [k, x] of Object.entries(v)) if (x !== undefined) out[k] = await walk(x);
            return out;
        }
        return v as Json;
    };
    const tree = await walk(record);
    zip.file('project.json', JSON.stringify({ format: BUNDLE_FORMAT, version: BUNDLE_VERSION, app: 'GLIX Encoder', record: tree }));
    const out = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    return new Blob([out as Uint8Array<ArrayBuffer>], { type: 'application/zip' });
};

export const unpackProject = async (blob: Blob): Promise<ProjectRecord> => {
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const manifest = zip.file('project.json');
    if (!manifest) throw new Error('Not a GLIX project (project.json missing)');
    const parsed = JSON.parse(await manifest.async('string'));
    if (parsed?.format !== BUNDLE_FORMAT) throw new Error('Not a GLIX project');
    if (parsed.version > BUNDLE_VERSION) throw new Error('This project was made by a newer GLIX Encoder - reload the page');
    const read = async (path: string) => {
        const f = zip.file(path);
        if (!f) throw new Error(`Project is incomplete (${path} missing)`);
        return f.async('uint8array');
    };
    const walk = async (v: Json): Promise<unknown> => {
        if (Array.isArray(v)) return Promise.all(v.map(walk));
        if (v && typeof v === 'object') {
            if (typeof v.$blob === 'string') return new Blob([(await read(v.$blob)) as Uint8Array<ArrayBuffer>], { type: String(v.type ?? '') });
            if (typeof v.$bytes === 'string') {
                const bytes = await read(v.$bytes);
                return v.clamped ? new Uint8ClampedArray(bytes.buffer, bytes.byteOffset, bytes.byteLength) : bytes;
            }
            const out: Record<string, unknown> = {};
            for (const [k, x] of Object.entries(v)) out[k] = await walk(x);
            return out;
        }
        return v;
    };
    const record = (await walk(parsed.record)) as ProjectRecord;
    if (!(record.source instanceof Blob) || !Array.isArray(record.layers) || !(record.width > 0) || !(record.height > 0))
        throw new Error('Project is damaged');
    return record;
};
