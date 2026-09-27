#!/usr/bin/env python3
"""Convert jwave-coefficients.json (dumped from GLIC's bundled JWave.jar) into src/core/waveletCoefficients.ts."""
import json, sys

src = sys.argv[1]
dst = sys.argv[2]
d = json.load(open(src))

def fmt_arr(a):
    return '[' + ', '.join(repr(float(x)) for x in a) + ']'

lines = []
lines.append('// GENERATED FILE - do not edit by hand.')
lines.append('// Exact wavelet filter banks extracted at runtime from the JWave.jar bundled with the')
lines.append('// original GLIC (github.com/GlitchCodec/GLIC, code/JWave.jar), via scripts/jwave-extract/.')
lines.append('// These include JWave\'s idiosyncratic (sometimes non-normalized) filters that define')
lines.append('// GLIC\'s visual character - do not "fix" the math here.')
lines.append('')
lines.append('export interface WaveletFilterBank {')
lines.append('  name: string;')
lines.append('  /** decomposition low-pass */ scalingDeCom: number[];')
lines.append('  /** decomposition high-pass */ waveletDeCom: number[];')
lines.append('  /** reconstruction low-pass */ scalingReCon: number[];')
lines.append('  /** reconstruction high-pass */ waveletReCon: number[];')
lines.append('  /** multiplier applied in reverse step (Haar orthogonal uses 0.5) */ reverseScale: number;')
lines.append('  /** minimum sub-length the multi-level transform descends to (JWave transformWavelength) */ transformWavelength: number;')
lines.append('}')
lines.append('')
lines.append('export const WAVELET_FILTERS: Record<number, WaveletFilterBank> = {')
for id_ in sorted(d.keys(), key=int):
    w = d[id_]
    rev = 0.5 if w['name'] == 'Haar orthogonal' else 1
    lines.append(f'  {id_}: {{')
    lines.append(f'    name: {json.dumps(w["name"])},')
    lines.append(f'    scalingDeCom: {fmt_arr(w["scalingDeCom"])},')
    lines.append(f'    waveletDeCom: {fmt_arr(w["waveletDeCom"])},')
    lines.append(f'    scalingReCon: {fmt_arr(w["scalingReCon"])},')
    lines.append(f'    waveletReCon: {fmt_arr(w["waveletReCon"])},')
    lines.append(f'    reverseScale: {rev},')
    lines.append(f'    transformWavelength: {w["transformWavelength"]},')
    lines.append('  },')
lines.append('};')
lines.append('')

open(dst, 'w').write('\n'.join(lines))
print(f'wrote {dst}: {len(d)} wavelets')
