import { describe, expect, it } from 'vitest';
import type { ProjectRecord } from '../../core/projects';
import { packProject, unpackProject } from '../projectBundle';

const bytes = (n: number, seed: number) => Uint8Array.from({ length: n }, (_, i) => (i * seed) & 255);

describe('project bundles', () => {
    it('round-trips every binary byte for byte, and the rest as JSON', async () => {
        const record = {
            id: 'p1',
            name: 'Project-0001',
            updatedAt: 1,
            width: 4,
            height: 2,
            thumb: 'data:image/png;base64,AAAA',
            source: new Blob([bytes(100, 7)], { type: 'image/png' }),
            layers: [
                {
                    kind: 'pixel',
                    name: 'Layer 1',
                    visible: true,
                    opacity: 0.5,
                    blendMode: 'screen',
                    mask: bytes(8, 3),
                    result: new Blob([bytes(64, 5)], { type: 'image/png' }),
                    effects: [{ id: 'e', type: 'noise', enabled: true, params: { amount: 3 } }],
                    file: bytes(1000, 11),
                    resolved: null,
                    thumb: null,
                },
                { kind: 'adjustment', name: 'Adj', visible: false, opacity: 1, blendMode: 'normal', mask: null, result: null, file: null, resolved: null, thumb: null },
            ],
            activeLayerIndex: 0,
            config: { colorspace: 9, transform_scale: [1, 2, 3] },
            separateChannels: false,
        } as unknown as ProjectRecord;

        const back = await unpackProject(await packProject(record));
        expect(new Uint8Array(await back.source.arrayBuffer())).toEqual(bytes(100, 7));
        expect(back.source.type).toBe('image/png');
        const l = back.layers[0];
        expect(l.mask).toEqual(bytes(8, 3));
        expect(l.file).toEqual(bytes(1000, 11));
        expect(new Uint8Array(await l.result!.arrayBuffer())).toEqual(bytes(64, 5));
        expect(l.effects).toEqual(record.layers[0].effects);
        expect(back.layers[1]).toMatchObject({ kind: 'adjustment', mask: null, result: null });
        expect(back.config).toEqual(record.config);
        expect(back.name).toBe('Project-0001');
    });

    it('refuses zips that are not projects', async () => {
        const JSZip = (await import('jszip')).default;
        const z = new JSZip();
        z.file('hello.txt', 'hi');
        await expect(unpackProject(new Blob([(await z.generateAsync({ type: 'uint8array' })) as Uint8Array<ArrayBuffer>]))).rejects.toThrow(/Not a GLIX project/);
    });
});
