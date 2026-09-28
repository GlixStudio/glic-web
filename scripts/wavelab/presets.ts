// Renders every ~b- preset into a contact sheet. Usage: npx vite-node scripts/wavelab/presets.ts [outDir]
import { makeScene, makePhoto, writePng, contactSheet, stats } from './lib';
import { encode, decode } from '../../src/core/Codec';
import { applyBuiltinPreset } from '../../src/core/presets';
import { EXTRA_PRESETS } from '../../src/core/extraPresets';

const outDir = process.argv[2] ?? '.';
for (const [label, scene] of [['scene', makeScene(192, 192)], ['photo', makePhoto(192, 192)]] as const) {
const tiles: ImageData[] = [scene];
for (const p of EXTRA_PRESETS) {
    const app = applyBuiltinPreset(p.name)!;
    const t0 = Date.now();
    const res = encode(scene, app.config);
    const dec = decode(res.file, { separateChannels: app.separateChannels });
    const st = stats(dec.preview);
    console.log(`${p.name.padEnd(20)} mean=${st.mean} std=${st.std} ${Date.now() - t0}ms`);
    tiles.push(dec.preview);
}
writePng(`${outDir}/presets-${label}.png`, contactSheet(tiles, 5));
}
