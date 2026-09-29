// The art-science wavelet family: every filter bank here is DERIVED from an idea -
// a physical constant, a biophysical measurement, a musical structure, a
// philosophical operation - so the derivation itself is the score and anyone can
// re-perform it. gen-artsci.ts turns these derivations into src/core/artsciWavelets.ts:
//
//   npx vite-node scripts/wavelab/gen-artsci.ts            (writes the module)
//   npx vite-node scripts/wavelab/gen-artsci.ts --check    (fails if the module drifted)
//
// Two kinds of bank:
//  - LAWFUL: orthogonal two-channel lattices (paraunitary, perfect reconstruction).
//    A lattice is a product of plane rotations; it is a true low-pass wavelet only
//    when its angles sum to 45°. Many banks below are built so that a real-world
//    structure *almost* closes that sum - the leftover angle is the artwork.
//    Lawful banks are invisible until detail is thrown away (transform_compress).
//  - BROKEN: analysis and synthesis disagree on purpose (non-PR). What the image
//    is measured with is not what it is rebuilt with; the error is visible at once.
//
// Ids are baked into .glic files: append only, never renumber or re-derive an
// existing id with different numbers.

import { makeScene } from './lib';

interface Bank {
    scalingDeCom: number[];
    waveletDeCom: number[];
    scalingReCon: number[];
    waveletReCon: number[];
}

interface Spec {
    id: number;
    name: string;
    domain: 'physics' | 'biology' | 'music' | 'philosophy' | 'generative';
    lawful: boolean;
    note: string;
    build: () => Bank;
}

const DEG = Math.PI / 180;
const PHI = (1 + Math.sqrt(5)) / 2;
const SQRT2 = Math.SQRT2;

// --- construction kit ---

/** orthogonal lattice low-pass from rotation angles (radians): E(z) = R(θK) Λ(z) … Λ(z) R(θ1) */
export const latticeLowpass = (angles: number[]): number[] => {
    // polyphase matrix entries as polynomials in z^-1
    let e = [
        [[Math.cos(angles[0])], [Math.sin(angles[0])]],
        [[-Math.sin(angles[0])], [Math.cos(angles[0])]],
    ];
    const add = (a: number[], b: number[]) => Array.from({ length: Math.max(a.length, b.length) }, (_, i) => (a[i] ?? 0) + (b[i] ?? 0));
    const scale = (a: number[], k: number) => a.map(v => v * k);
    for (const t of angles.slice(1)) {
        const c = Math.cos(t), s = Math.sin(t);
        const r1 = e[1].map(p => [0, ...p]); // Λ(z): delay the second row
        const r0 = e[0];
        e = [
            [add(scale(r0[0], c), scale(r1[0], s)), add(scale(r0[1], c), scale(r1[1], s))],
            [add(scale(r0[0], -s), scale(r1[0], c)), add(scale(r0[1], -s), scale(r1[1], c))],
        ];
    }
    const [e00, e01] = e[0];
    const n = Math.max(e00.length, e01.length);
    const h: number[] = [];
    for (let k = 0; k < n; k++) h.push(e00[k] ?? 0, e01[k] ?? 0);
    return h;
};

/** alternating flip: the high-pass partner of an orthogonal low-pass (this engine's convention) */
const flip = (lo: number[]): number[] => lo.map((_, n) => (n % 2 ? 1 : -1) * lo[lo.length - 1 - n]);

const orthogonal = (lo: number[]): Bank => {
    const hi = flip(lo);
    return { scalingDeCom: lo, waveletDeCom: hi, scalingReCon: lo, waveletReCon: hi };
};

const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
const energy = (a: number[]) => Math.sqrt(a.reduce((s, v) => s + v * v, 0));
/** scale so the taps sum to √2 (DC passes like Haar) */
const dc = (a: number[]) => { const s = sum(a); return a.map(v => (v * SQRT2) / s); };
/** zero mean, unit energy (a detail / mother-wavelet shape) */
const zeroMeanUnit = (a: number[]) => { const m = sum(a) / a.length; const z = a.map(v => v - m); const e = energy(z); return z.map(v => v / e); };
const shift = (a: number[], k: number) => [...new Array(k).fill(0), ...a.slice(0, a.length - k)];
const gaussian = (taps: number, sigma: number) => Array.from({ length: taps }, (_, i) => Math.exp(-(((i - (taps - 1) / 2) / sigma) ** 2) / 2));

/** mulberry32: small, seedable, bit-exact across JS engines */
const rng = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// --- derivations that need a little simulation ---

/** Hodgkin-Huxley squid axon (1952 parameters, 6.3 °C), forward Euler at 0.01 ms */
const actionPotential = (taps: number): number[] => {
    let V = -65, m = 0.0529, h = 0.5961, n = 0.3177;
    const dt = 0.01;
    const trace: number[] = [];
    for (let step = 0; step < 1200; step++) {
        const t = step * dt;
        const I = t >= 1 && t < 2 ? 20 : 0; // 1 ms stimulus, µA/cm²
        const am = (0.1 * (V + 40)) / (1 - Math.exp(-(V + 40) / 10));
        const bm = 4 * Math.exp(-(V + 65) / 18);
        const ah = 0.07 * Math.exp(-(V + 65) / 20);
        const bh = 1 / (1 + Math.exp(-(V + 35) / 10));
        const an = (0.01 * (V + 55)) / (1 - Math.exp(-(V + 55) / 10));
        const bn = 0.125 * Math.exp(-(V + 65) / 80);
        const INa = 120 * m ** 3 * h * (V - 50);
        const IK = 36 * n ** 4 * (V + 77);
        const IL = 0.3 * (V + 54.387);
        V += dt * (I - INa - IK - IL);
        m += dt * (am * (1 - m) - bm * m);
        h += dt * (ah * (1 - h) - bh * h);
        n += dt * (an * (1 - n) - bn * n);
        trace.push(V);
    }
    // sample the spike and its undershoot: 1.5 .. 9.5 ms
    return Array.from({ length: taps }, (_, i) => trace[Math.round((1.5 + (8 * i) / (taps - 1)) / dt)]);
};

/** EIIP (electron-ion interaction potential, Ry) - the Resonant Recognition Model's nucleotide values */
const EIIP: Record<string, number> = { A: 0.126, C: 0.134, G: 0.0806, T: 0.1335 };
const COMPLEMENT: Record<string, string> = { A: 'T', T: 'A', G: 'C', C: 'G' };
// first 16 nt of the human preproinsulin coding sequence (INS, NM_000207): M A L W M R …
const INSULIN = 'ATGGCCCTGTGGATGC';

/** Wolfram's Rule 30 from a single live cell: the centre column (his old pseudo-random source) */
const rule30Centre = (len: number): number[] => {
    const w = 2 * len + 3;
    let row = new Array(w).fill(0);
    row[len + 1] = 1;
    const out: number[] = [];
    for (let t = 0; t < len; t++) {
        out.push(row[len + 1]);
        row = row.map((_, i) => {
            const l = row[i - 1] ?? 0, c = row[i], r = row[i + 1] ?? 0;
            return (30 >> ((l << 2) | (c << 1) | r)) & 1;
        });
    }
    return out;
};

/** logistic map at the Feigenbaum point r∞ ≈ 3.5699456: the edge between order and chaos */
const feigenbaumEdge = (len: number): number[] => {
    let x = 0.5;
    for (let i = 0; i < 4096; i++) x = 3.5699456 * x * (1 - x);
    return Array.from({ length: len }, () => (x = 3.5699456 * x * (1 - x)));
};

/** Fibonacci word (1 → 10, 0 → 1): the 1D quasicrystal, ordered but never periodic */
const fibonacciWord = (len: number): number[] => {
    let w = '1';
    while (w.length < len) w = [...w].map(c => (c === '1' ? '10' : '1')).join('');
    return [...w.slice(0, len)].map(Number);
};

/**
 * (1+λ) evolution strategy over lattice angles with a 45° closure (so every genome is a
 * true wavelet). Fitness: how much of the test scene's row energy a single analysis level
 * keeps in the low band. sign = +1 breeds the fittest, -1 the least fit that still obeys the law.
 */
const evolve = (sign: 1 | -1, seed: number): number[] => {
    const scene = makeScene(128, 128);
    const rows: number[][] = [];
    for (let y = 0; y < 128; y += 4) {
        const r: number[] = [];
        for (let x = 0; x < 128; x++) {
            const i = (y * 128 + x) * 4;
            r.push((scene.data[i] + scene.data[i + 1] + scene.data[i + 2]) / 765);
        }
        rows.push(r);
    }
    const anglesOf = (g: number[]) => [...g, 45 * DEG - sum(g)];
    const fitness = (g: number[]) => {
        const lo = latticeLowpass(anglesOf(g));
        let keep = 0, all = 0;
        for (const r of rows) {
            const n = r.length;
            for (let i = 0; i < n / 2; i++) {
                let a = 0;
                for (let j = 0; j < lo.length; j++) a += r[(2 * i + j) % n] * lo[j];
                keep += a * a;
            }
            for (const v of r) all += v * v;
        }
        return (sign * keep) / all;
    };
    const rand = rng(seed);
    const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
    let parent = [rand(), rand()].map(v => (v - 0.5) * Math.PI);
    let best = fitness(parent);
    let sigma = 0.6;
    for (let gen = 0; gen < 400; gen++) {
        let improved = 0;
        for (let k = 0; k < 8; k++) {
            const child = parent.map(v => v + sigma * gauss());
            const f = fitness(child);
            if (f > best) { best = f; parent = child; improved++; }
        }
        sigma *= improved / 8 > 0.2 ? 1.22 : 0.82; // Rechenberg's 1/5 success rule
        sigma = Math.max(sigma, 1e-3);
    }
    return anglesOf(parent);
};

// --- the family ---

const TET = 12;
const FIFTH = Math.log2(3 / 2) * 360; // a pure fifth as an angle on the octave circle (210.587°)
const BERG = [7, 10, 2, 6, 9, 0, 4, 8, 11, 1, 3, 5]; // Violin Concerto row: G B♭ D F♯ A C E G♯ B C♯ E♭ F
const ROYAL = [0, 3, 7, 8, -1, 7, 6, 5, 4, 3, 2, 1, 0]; // Thema Regium, BWV 1079: C E♭ G A♭ B · G F♯ F E E♭ D D♭ C
const OCTATONIC = [1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0]; // Messiaen mode 2 over the 12 semitones
const DB2 = [60 * DEG, -15 * DEG]; // the lattice angles of Daubechies-2

export const SPECS: Spec[] = [
    // ── physics ──────────────────────────────────────────────────────────
    {
        id: 83, name: '~b- Pauli 137', domain: 'physics', lawful: true,
        note: 'Two rotations: the golden angle 137.508° (phyllotaxis, sunflower seeds) and the angle that WOULD close the lattice if 1/α were exactly 137.036. Pauli and Jung chased the fine-structure number for decades; the 0.47° gap between the two "137"s is left in the filter as a slow DC leak. Lawful (PR), almost a wavelet.',
        build: () => orthogonal(latticeLowpass([(360 / PHI ** 2) * DEG, (45 - 137.035999) * DEG])),
    },
    {
        id: 84, name: '~b- T·T = S', domain: 'physics', lawful: true,
        note: 'Haar is one 45° rotation - the Hadamard gate of wavelets. Split it into two π/8 steps, the way two T gates compose into an S gate, and it becomes a longer, smoother true wavelet. Same destination, different path: the path is the texture.',
        build: () => orthogonal(latticeLowpass([22.5 * DEG, 22.5 * DEG])),
    },
    {
        id: 85, name: '~b- Bell 22.5°', domain: 'physics', lawful: false,
        note: 'Prepared in one basis, measured in another. The image is analysed with Haar and rebuilt with a basis turned by 22.5° - the angle between detector settings that maximally violates the CHSH inequality. Correlations survive, locality does not.',
        build: () => {
            const a = latticeLowpass([45 * DEG]);
            const b = latticeLowpass([67.5 * DEG]);
            return { scalingDeCom: a, waveletDeCom: flip(a), scalingReCon: b, waveletReCon: flip(b) };
        },
    },
    {
        id: 86, name: '~b- Uncertainty', domain: 'physics', lawful: false,
        note: 'The Gaussian is the minimum-uncertainty wave packet: squeeze it in space and it spreads in frequency. Here the image is measured with a wide Gaussian (σ = 2, sharp in frequency) and rebuilt with a narrow one (σ = ½, sharp in position). σ·σ′ = 1: the product is conserved, the picture is not.',
        build: () => {
            const a = dc(gaussian(8, 2));
            const b = dc(gaussian(8, 0.5));
            return { scalingDeCom: a, waveletDeCom: flip(a), scalingReCon: b, waveletReCon: flip(b) };
        },
    },
    {
        id: 87, name: '~b- Quasicrystal', domain: 'physics', lawful: true,
        note: 'Shechtman\'s "forbidden" fivefold crystal (1982, ridiculed, Nobel 2011): order without repetition. Thirteen lattice rotations follow the Fibonacci word - long steps of 36° (π/5, the pentagon) and short steps of 36°/φ - then one closing rotation makes it a true wavelet. Aperiodic order, perfectly reversible.',
        build: () => {
            const steps = fibonacciWord(13).map(b => (b ? 36 : 36 / PHI) * DEG);
            return orthogonal(latticeLowpass([...steps, 45 * DEG - sum(steps)]));
        },
    },

    // ── biology / biochemistry ───────────────────────────────────────────
    {
        id: 88, name: '~b- Insulin EIIP', domain: 'biology', lawful: false,
        note: 'The first 16 nucleotides of human insulin (ATGGCCCTGTGGATGC), each as its electron-ion interaction potential (Cosic\'s Resonant Recognition Model). Low band: the coding strand. High band: its Watson-Crick reverse complement, centred - the partner strand as the mirror filter, the way a QMF pair mirrors its low-pass.',
        build: () => {
            const lo = dc([...INSULIN].map(b => EIIP[b]));
            const rc = [...INSULIN].reverse().map(b => EIIP[COMPLEMENT[b]]);
            const hi = zeroMeanUnit(rc);
            return { scalingDeCom: lo, waveletDeCom: hi, scalingReCon: lo, waveletReCon: hi };
        },
    },
    {
        id: 89, name: '~b- Action Potential', domain: 'biology', lawful: false,
        note: 'A Hodgkin-Huxley squid-axon spike (1952 equations, integrated here) sampled into 12 taps: depolarisation, peak, hyperpolarised undershoot. The spike is the detail filter - every edge in the image fires like a neuron - and its time-mirrored partner is the smoothing one.',
        build: () => {
            const hi = zeroMeanUnit(actionPotential(12));
            const lo = dc(hi.map((_, n) => (n % 2 ? -1 : 1) * hi[hi.length - 1 - n]).map(v => v + 0.5));
            return { scalingDeCom: lo, waveletDeCom: hi, scalingReCon: lo, waveletReCon: hi };
        },
    },
    {
        id: 90, name: '~b- α-Helix 3.6', domain: 'biology', lawful: true,
        note: 'Pauling\'s α-helix turns 100° per amino acid - 3.6 residues per turn, a non-integer, so the helix never lands on the same phase until 18 residues later. Four 100° rotations sum to 400°, 5° short of closing: a true orthogonal lattice with a biological twist left in it.',
        build: () => orthogonal(latticeLowpass([100, 100, 100, 100].map(d => d * DEG))),
    },
    {
        id: 91, name: '~b- Evolved: Survivor', domain: 'biology', lawful: true,
        note: 'Bred, not designed: a (1+8) evolution strategy (seed 1859, the Origin of Species) mutates lattice angles for 400 generations, keeping whatever packs the most of a test landscape into the low band. Every genome obeys the 45° law, so every creature is a true wavelet; this is the fittest one.',
        build: () => orthogonal(latticeLowpass(evolve(1, 1859))),
    },
    {
        id: 92, name: '~b- Evolved: Mutant', domain: 'biology', lawful: true,
        note: 'The same evolution, same seed, same law - with fitness inverted. It breeds the wavelet that obeys every rule yet keeps the least of the landscape: a creature perfectly legal and perfectly unfit. What survives when selection runs backwards?',
        build: () => orthogonal(latticeLowpass(evolve(-1, 1859))),
    },

    // ── music ────────────────────────────────────────────────────────────
    {
        id: 93, name: '~b- 12-TET Circle', domain: 'music', lawful: true,
        note: 'The circle of fifths in equal temperament: twelve rotations of exactly 210° (a tempered fifth on the octave circle) come home after seven octaves; one 45° tuning-peg rotation makes it a true wavelet. The compromise that lets every key be played.',
        build: () => orthogonal(latticeLowpass([...new Array(TET).fill(210 * DEG), 45 * DEG])),
    },
    {
        id: 94, name: '~b- Pythagorean Comma', domain: 'music', lawful: true,
        note: 'The same circle with PURE 3:2 fifths (210.587° each). Twelve of them overshoot seven octaves by the Pythagorean comma, 23.46 cents - here 7.04° that the tuning peg cannot absorb. The circle does not close; the leak is the wolf fifth, rendered as image.',
        build: () => orthogonal(latticeLowpass([...new Array(TET).fill(FIFTH * DEG), 45 * DEG])),
    },
    {
        id: 95, name: '~b- Giant Steps', domain: 'music', lawful: true,
        note: 'Coltrane changes: key centres a major third apart (B - G - E♭) split the octave into three equal parts. Three 120° rotations return to the start; a 45° peg makes it a true wavelet with a three-fold, cycling character.',
        build: () => orthogonal(latticeLowpass([120, 120, 120, 45].map(d => d * DEG))),
    },
    {
        id: 96, name: '~b- Berg Row', domain: 'music', lawful: true,
        note: 'The tone row of Berg\'s Violin Concerto (G B♭ D F♯ A C E G♯ B C♯ E♭ F), each pitch class a rotation of 30°. Every twelve-tone row uses each pitch once, so every row sums to the same angle (1980°): aggregate completion IS the closure law. One peg makes any row a true wavelet; the ORDER alone is the sound.',
        build: () => orthogonal(latticeLowpass([...BERG.map(pc => pc * 30 * DEG), (45 - 1980) * DEG])),
    },
    {
        id: 97, name: '~b- Tritone Sub', domain: 'music', lawful: false,
        note: 'Tritone substitution: replace a dominant with the one a tritone away - half the octave - keeping the two guide tones. Modulating a filter by (−1)ⁿ is the half-way turn of the frequency circle, so this bank rebuilds every band with its opposite (Daubechies-2 analysed, lows and highs swapped on synthesis). Same tension, different root.',
        build: () => {
            const lo = latticeLowpass(DB2);
            const hi = flip(lo);
            return { scalingDeCom: lo, waveletDeCom: hi, scalingReCon: hi, waveletReCon: lo };
        },
    },
    {
        id: 98, name: '~b- Messiaen Mode 2', domain: 'music', lawful: false,
        note: 'The octatonic scale (half-whole) as twelve taps over the chromatic circle: scale tones +1, the others −½. Messiaen called it a mode of limited transposition: shift it by three semitones and it maps onto itself. A filter with that symmetry has spectral lines at a third of the band - a built-in three-fold shimmer.',
        build: () => {
            const lo = dc(OCTATONIC.map(b => (b ? 1 : -0.5)));
            return orthogonalish(lo);
        },
    },
    {
        id: 99, name: '~b- Crab Canon', domain: 'music', lawful: false,
        note: 'The Royal Theme of Bach\'s Musical Offering (C E♭ G A♭ B, then the chromatic descent) played forward and against its own retrograde - the crab canon - as one palindromic filter. A palindrome is linear phase: the theme meets its reflection without any time distortion.',
        build: () => {
            const theme = ROYAL.map(p => p + 13);
            return orthogonalish(dc([...theme, ...theme.slice(0, -1).reverse()]));
        },
    },

    // ── philosophy / topology ────────────────────────────────────────────
    {
        id: 100, name: '~b- Möbius', domain: 'philosophy', lawful: false,
        note: 'A Möbius band has one side: walk once around and you return mirrored. Analysed with Daubechies-2, rebuilt with every detail coefficient\'s orientation reversed - the image as seen from its other side, where every edge is inverted and relief becomes intaglio.',
        build: () => {
            const lo = latticeLowpass(DB2);
            const hi = flip(lo);
            return { scalingDeCom: lo, waveletDeCom: hi, scalingReCon: lo, waveletReCon: hi.map(v => -v) };
        },
    },
    {
        id: 101, name: '~b- Difference Only', domain: 'philosophy', lawful: false,
        note: 'Haar is literally difference and repetition: a sum and a difference. Deleuze asked for difference in itself, not as a gap between identical things. Keep only the difference, drop the repetition (the low band is zero): identity dissolves, only relations remain. The counterpart of ~b- Ghost.',
        build: () => ({ scalingDeCom: [0, 0], waveletDeCom: [Math.SQRT1_2, -Math.SQRT1_2], scalingReCon: [0, 0], waveletReCon: [Math.SQRT1_2, -Math.SQRT1_2] }),
    },
    {
        id: 102, name: '~b- Différance', domain: 'philosophy', lawful: false,
        note: 'Derrida\'s différance: meaning both differs and is deferred. Daubechies-2 where the details (the differences) return two samples late while the averages arrive on time - every edge drifts behind the form it belongs to.',
        build: () => {
            const lo = latticeLowpass(DB2);
            const hi = flip(lo);
            // (the engine takes the synthesis length from the low band, so pad both to 6)
            return { scalingDeCom: lo, waveletDeCom: hi, scalingReCon: [...lo, 0, 0], waveletReCon: shift([...hi, 0, 0], 2) };
        },
    },
    {
        id: 103, name: '~b- Call & Response', domain: 'philosophy', lawful: false,
        note: 'Improvisers trade phrases: a call, then an answer a beat late. The mirror image of Différance - here the body (the averages) answers one sample late while the details stay on the beat, so every form is shadowed by its own echo.',
        build: () => {
            const lo = latticeLowpass(DB2);
            const hi = flip(lo);
            return { scalingDeCom: lo, waveletDeCom: hi, scalingReCon: shift([...lo, 0], 1), waveletReCon: [...hi, 0] };
        },
    },

    // ── generative / complexity ──────────────────────────────────────────
    {
        id: 104, name: '~b- Rule 30', domain: 'generative', lawful: false,
        note: 'Wolfram\'s Rule 30 grown from one black cell: its centre column is so disordered it served as Mathematica\'s random-number source. Sixteen of those bits become the taps - randomness that is fully determined, chance you can re-perform exactly (Cage with a rulebook).',
        build: () => orthogonalish(dc(rule30Centre(16).map(b => (b ? 1 : 0.25)))),
    },
    {
        id: 105, name: '~b- Feigenbaum Edge', domain: 'generative', lawful: false,
        note: 'The logistic map x → r·x(1−x) at r∞ = 3.5699456, the Feigenbaum point where period-doubling ends and chaos begins - the "edge of chaos" where Langton located life. Twelve iterates, after the transient dies, become the filter.',
        build: () => orthogonalish(dc(feigenbaumEdge(12))),
    },
];

/** a low-pass shape used with its alternating-flip partner - PR only if the shape happens to be orthogonal */
function orthogonalish(lo: number[]): Bank {
    const hi = flip(lo);
    return { scalingDeCom: lo, waveletDeCom: hi, scalingReCon: lo, waveletReCon: hi };
}

// --- emit ---

const fmt = (a: number[]) => `[${a.map(v => (Object.is(v, -0) ? 0 : v)).join(', ')}]`;

export const render = (): string => {
    const lines: string[] = [
        '// GENERATED by scripts/wavelab/gen-artsci.ts from the derivations in scripts/wavelab/artsci.ts -',
        '// do not edit by hand; change the derivation there and re-run it.',
        '// Each bank is derived from an idea (see its note and the script).',
        '',
        "import type { WaveletFilterBank } from './waveletCoefficients';",
        '',
        'export interface ArtsciWavelet {',
        '    bank: WaveletFilterBank;',
        "    domain: 'physics' | 'biology' | 'music' | 'philosophy' | 'generative';",
        '    /** true: orthogonal lattice, perfect reconstruction (visible only once detail is discarded) */',
        '    lawful: boolean;',
        '    note: string;',
        '}',
        '',
        'export const ARTSCI_WAVELETS: Record<number, ArtsciWavelet> = {',
    ];
    for (const s of SPECS) {
        const b = s.build();
        lines.push(
            `    ${s.id}: {`,
            `        domain: '${s.domain}',`,
            `        lawful: ${s.lawful},`,
            `        note: ${JSON.stringify(s.note)},`,
            '        bank: {',
            `            name: ${JSON.stringify(s.name)},`,
            `            scalingDeCom: ${fmt(b.scalingDeCom)},`,
            `            waveletDeCom: ${fmt(b.waveletDeCom)},`,
            `            scalingReCon: ${fmt(b.scalingReCon)},`,
            `            waveletReCon: ${fmt(b.waveletReCon)},`,
            '            reverseScale: 1,',
            '            transformWavelength: 2,',
            '        },',
            '    },'
        );
    }
    lines.push('};', '');
    return lines.join('\n');
};
