// Writes (or with --check, verifies) src/core/artsciWavelets.ts from scripts/wavelab/artsci.ts.
// Usage: npx vite-node scripts/wavelab/gen-artsci.ts [--check]
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SPECS, render } from './artsci';

const target = fileURLToPath(new URL('../../src/core/artsciWavelets.ts', import.meta.url));
const out = render();
if (process.argv.includes('--check')) {
    if (readFileSync(target, 'utf8') !== out) {
        console.error('artsciWavelets.ts is out of date - re-run scripts/wavelab/gen-artsci.ts');
        process.exit(1);
    }
    console.log('artsciWavelets.ts matches its derivation');
} else {
    writeFileSync(target, out);
    for (const s of SPECS) {
        const b = s.build();
        const dc = b.scalingDeCom.reduce((a, v) => a + v, 0);
        console.log(`${s.id} ${s.name.padEnd(24)} taps=${String(b.scalingDeCom.length).padStart(2)} dc=${dc.toFixed(4)} ${s.lawful ? 'lawful' : 'broken'}`);
    }
}
