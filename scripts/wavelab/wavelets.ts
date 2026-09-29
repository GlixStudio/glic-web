// Renders every ~b- wavelet (or a given id list) through a few standard configs
// into contact sheets, to judge them by eye. Usage: npx vite-node scripts/wavelab/wavelets.ts [outDir] [ids...]
import { makeScene, writePng, contactSheet, stats } from './lib';
import { encode, decode, CodecConfig } from '../../src/core/Codec';
import { EXTRA_WAVELET_FILTERS } from '../../src/core/extraWavelets';
import { getWaveletName } from '../../src/core/Wavelets';

const outDir = process.argv[2] ?? '.';
const ids = process.argv.slice(3).map(Number).filter(n => n > 0);
const all = ids.length ? ids : Object.keys(EXTRA_WAVELET_FILTERS).map(Number);
const scene = makeScene(192, 192);

// three looks: gentle (default quant), harsh (heavy quant + compress), WPT harsh
const looks: { label: string; tweak: (c: CodecConfig) => void }[] = [
    { label: 'q110 fwt', tweak: () => {} },
    { label: 'q40 c60 fwt', tweak: c => { c.quantization_value = [40, 40, 40]; c.transform_compress = [60, 60, 60]; } },
    { label: 'q40 wpt', tweak: c => { c.quantization_value = [40, 40, 40]; c.transform_type = [1, 1, 1]; } },
    // where orthogonal (lawful) banks show their shape: heavy thresholding, coarse coefficients
    { label: 'q12 c200 fwt', tweak: c => { c.quantization_value = [12, 12, 12]; c.transform_compress = [200, 200, 200]; } },
];
for (const look of looks) {
    const tiles: ImageData[] = [scene];
    for (const id of all) {
        const cfg = new CodecConfig();
        cfg.transform_method = [id, id, id];
        cfg.prediction_method = [9, 9, 9];
        if (process.env.CS) cfg.colorspace = Number(process.env.CS);
        look.tweak(cfg);
        const t0 = Date.now();
        const res = encode(scene, cfg);
        const dec = decode(res.file);
        const st = stats(dec.preview);
        console.log(`${look.label.padEnd(12)} ${String(id).padStart(3)} ${getWaveletName(id).padEnd(22)} mean=${st.mean} std=${st.std} ${Date.now() - t0}ms`);
        tiles.push(dec.preview);
    }
    writePng(`${outDir}/wavelets-${look.label.replace(/\s+/g, '_')}.png`, contactSheet(tiles, 6));
}
