// glic-web's own presets, built around the ~b- wavelets (see extraWavelets.ts).
// Names start with "~b-" so they sort after the original GLIC presets. Values are
// CodecConfig fields directly (not the ControlP5 slider indices of presets.json).

import { CodecConfig } from './Codec';

export interface ExtraPreset {
    name: string;
    separateChannels: boolean;
    config: Partial<CodecConfig>;
    /** the idea / hypothesis behind it (art-science presets) */
    note?: string;
}

const tri = (v: number) => [v, v, v];

export const EXTRA_PRESETS: ExtraPreset[] = [
    {
        name: '~b- bleach bath',
        separateChannels: false,
        config: { colorspace: 9, transform_method: tri(72), quantization_value: tri(60), transform_compress: tri(30), prediction_method: tri(9), min_block_size: tri(2), max_block_size: tri(256) },
    },
    {
        name: '~b- rotor grid',
        separateChannels: false,
        config: { colorspace: 9, transform_method: tri(74), transform_type: tri(1), quantization_value: tri(25), prediction_method: tri(9), min_block_size: tri(2), max_block_size: tri(256) },
    },
    {
        name: '~b- static tv',
        separateChannels: false,
        config: { colorspace: 1, transform_method: tri(81), quantization_value: tri(60), prediction_method: tri(9), min_block_size: tri(8), max_block_size: tri(64), encoding_method: tri(2) },
    },
    {
        name: '~b- paik blocks',
        separateChannels: true,
        config: { colorspace: 0, transform_method: tri(76), quantization_value: tri(110), prediction_method: [9, 3, 15], min_block_size: tri(16), max_block_size: tri(128) },
    },
    {
        name: '~b- ghost blur',
        separateChannels: false,
        config: { colorspace: 8, transform_method: tri(77), quantization_value: tri(60), prediction_method: tri(9), min_block_size: tri(4), max_block_size: tri(256) },
    },
    {
        name: '~b- morlet moire',
        separateChannels: false,
        config: { colorspace: 3, transform_method: tri(80), transform_type: tri(1), quantization_value: tri(50), prediction_method: tri(9) },
    },
    {
        name: '~b- bior storm',
        separateChannels: false,
        config: { colorspace: 15, transform_method: tri(68), quantization_value: tri(110), transform_compress: tri(30), prediction_method: tri(9), min_block_size: tri(4), max_block_size: tri(64) },
    },
    {
        name: '~b- slant wreck',
        separateChannels: false,
        config: { colorspace: 1, transform_method: tri(82), quantization_value: tri(60), prediction_method: tri(9), min_block_size: tri(2), max_block_size: tri(32) },
    },
    {
        name: '~b- fade out',
        separateChannels: false,
        config: { colorspace: 11, transform_method: tri(73), quantization_value: tri(40), transform_compress: tri(60), clamp_method: tri(1), prediction_method: tri(9), min_block_size: tri(2), max_block_size: tri(256) },
    },
    {
        name: '~b- sinc smear',
        separateChannels: false,
        config: { colorspace: 4, transform_method: tri(79), quantization_value: tri(20), transform_compress: tri(100), prediction_method: tri(9), min_block_size: tri(8), max_block_size: tri(256) },
    },
    {
        name: '~b- spline soft',
        separateChannels: false,
        config: { colorspace: 7, transform_method: tri(78), transform_type: tri(1), quantization_value: tri(30), prediction_method: tri(9), min_block_size: tri(4), max_block_size: tri(128) },
    },
    {
        name: '~b- tri-channel',
        separateChannels: true,
        config: { colorspace: 1, transform_method: [72, 75, 69], quantization_value: [40, 40, 110], transform_compress: [60, 60, 30], prediction_method: [9, 9, 9], min_block_size: tri(2), max_block_size: tri(256) },
    },
    {
        name: '~b- lattice noir',
        separateChannels: false,
        config: { colorspace: 14, transform_method: tri(71), quantization_value: tri(12), transform_compress: tri(200), prediction_method: tri(9), min_block_size: tri(2), max_block_size: tri(256) },
    },
    {
        name: '~b- rotor wash',
        separateChannels: false,
        config: { colorspace: 6, transform_method: tri(75), quantization_value: tri(40), transform_compress: tri(60), prediction_method: tri(9), min_block_size: tri(4), max_block_size: tri(128), transform_scale: tri(1 << 8) },
    },

    // ── art-science experiments (built on the derived wavelets 83+, see artsciWavelets.ts) ──
    // None of these use RANDOM, so every result can be re-performed exactly.
    // Colorspaces: 0 OHTA 1 RGB 3 HSB 8 LAB 9 HWB 12 YCbCr 14 greyscale. Wavelet 0 = none.
    {
        name: '~b- well tempered',
        separateChannels: false,
        note: 'A/B experiment, part A. The circle of fifths in equal temperament closes, so this lattice is a true wavelet: heavy thresholding only simplifies the image. Encode this, then ~b- wolf fifth on the same image - the only difference between the two is 23.46 cents.',
        config: { colorspace: 12, transform_method: tri(93), quantization_value: tri(12), transform_compress: tri(200), prediction_method: tri(9) },
    },
    {
        name: '~b- wolf fifth',
        separateChannels: false,
        note: 'A/B experiment, part B. Identical to ~b- well tempered except the fifths are pure 3:2. Twelve of them miss seven octaves by the Pythagorean comma; the circle does not close and the leak floods the image. Tuning theory, audible as colour.',
        config: { colorspace: 12, transform_method: tri(94), quantization_value: tri(12), transform_compress: tri(200), prediction_method: tri(9) },
    },
    {
        name: '~b- selection pressure',
        separateChannels: false,
        note: 'A/B experiment, part A: the fittest wavelet bred by a seeded evolution strategy (seed 1859), in greyscale under heavy compression - close to the environment it was selected for. Contours survive. Compare with ~b- maladaptation.',
        config: { colorspace: 14, transform_method: tri(91), quantization_value: tri(0), transform_compress: tri(200), prediction_method: tri(9) },
    },
    {
        name: '~b- maladaptation',
        separateChannels: false,
        note: 'A/B experiment, part B: the same law, the same seed, fitness inverted - the least fit wavelet that is still a true wavelet, in the same environment. Its taps split in two like a comb: contours dissolve into a grid. What does "obeys every rule but does not fit" look like?',
        config: { colorspace: 14, transform_method: tri(92), quantization_value: tri(0), transform_compress: tri(200), prediction_method: tri(9) },
    },
    {
        name: '~b- tritone substitution',
        separateChannels: true,
        note: 'Keep the guide tones, change the root. Luminance (the form) passes untouched; the two colour channels are rebuilt with their bands swapped. Same tension, substituted harmony.',
        config: { colorspace: 12, transform_method: [0, 97, 97], quantization_value: [0, 40, 40], prediction_method: tri(9), min_block_size: tri(4), max_block_size: tri(64) },
    },
    {
        name: '~b- trading fours',
        separateChannels: true,
        note: 'Three improvisers trade phrases, one per channel: red answers late (Call & Response), green defers its details (Différance), blue keeps time with a lawful wavelet (T·T = S). The image is the conversation.',
        config: { colorspace: 1, transform_method: [103, 102, 84], quantization_value: [60, 60, 30], transform_compress: [0, 0, 60], prediction_method: tri(9), min_block_size: tri(4), max_block_size: tri(128) },
    },
    {
        name: '~b- giant steps',
        separateChannels: true,
        note: 'Coltrane\'s major-third cycle on the colour wheel: in HSB the hue channel IS a circle, so the three-fold lattice acts on hue under heavy compression while saturation and brightness stay lawful and light.',
        config: { colorspace: 3, transform_method: [95, 84, 84], transform_type: [1, 0, 0], quantization_value: [8, 30, 30], transform_compress: [230, 40, 40], prediction_method: tri(9) },
    },
    {
        name: '~b- tone row',
        separateChannels: false,
        note: 'Berg\'s Violin Concerto row as a wavelet packet basis. Every twelve-tone row closes the same way, so the damage you see comes from the ORDER of the pitches alone.',
        config: { colorspace: 9, transform_method: tri(96), transform_type: tri(1), quantization_value: tri(10), transform_compress: tri(240), prediction_method: tri(12), min_block_size: tri(4), max_block_size: tri(256) },
    },
    {
        name: '~b- limited transposition',
        separateChannels: false,
        note: 'Messiaen\'s octatonic mode maps onto itself every three semitones; the filter inherits that symmetry, so the image picks up a three-fold shimmer. Small blocks make the shimmer dense.',
        config: { colorspace: 0, transform_method: tri(98), quantization_value: tri(50), prediction_method: tri(9), min_block_size: tri(4), max_block_size: tri(32) },
    },
    {
        name: '~b- crab canon',
        separateChannels: false,
        note: 'Bach\'s Royal Theme against its own retrograde - a palindromic, linear-phase filter - in wavelet packets. The image is met by its reflection; nothing is displaced, everything is doubled.',
        config: { colorspace: 8, transform_method: tri(99), transform_type: tri(1), quantization_value: tri(40), prediction_method: tri(9), min_block_size: tri(8), max_block_size: tri(128) },
    },
    {
        name: '~b- 4′33″',
        separateChannels: false,
        note: 'Cage: the performer plays nothing, so the room becomes the piece. No prediction, total thresholding, no detail band - the image is silenced and what remains is its ambient residue: block averages, quantisation hum.',
        config: { colorspace: 12, transform_method: tri(77), quantization_value: tri(0), transform_compress: tri(255), prediction_method: tri(0), min_block_size: tri(8), max_block_size: tri(256) },
    },
    {
        name: '~b- bell test',
        separateChannels: true,
        note: 'Two entangled channels measured in a turned basis: the chroma channels share the CHSH-angle bank, so their errors are correlated, while luminance is measured lawfully. Spooky action at a distance, per pixel.',
        config: { colorspace: 12, transform_method: [84, 85, 85], quantization_value: [30, 60, 60], transform_compress: [60, 0, 0], prediction_method: tri(9), min_block_size: tri(4), max_block_size: tri(64) },
    },
    {
        name: '~b- uncertainty principle',
        separateChannels: false,
        note: 'Measured wide, rebuilt narrow: conjugate Gaussians for analysis and synthesis. Where the image was sharp it smears, where it was smooth it grains - you cannot have both at once.',
        config: { colorspace: 8, transform_method: tri(86), quantization_value: tri(70), prediction_method: tri(9), min_block_size: tri(4), max_block_size: tri(128) },
    },
    {
        name: '~b- fine structure',
        separateChannels: false,
        note: 'The golden angle and 1/α almost agree; the 0.47° disagreement is the only thing that breaks. Maximal thresholding in wavelet packets so the tiny numerological leak has room to show.',
        config: { colorspace: 13, transform_method: tri(83), transform_type: tri(1), quantization_value: tri(6), transform_compress: tri(255), prediction_method: tri(9) },
    },
    {
        name: '~b- quasicrystal',
        separateChannels: false,
        note: 'Fivefold, aperiodic, perfectly reversible: Fibonacci-ordered rotations under heavy packet thresholding. Order that never repeats.',
        config: { colorspace: 0, transform_method: tri(87), transform_type: tri(1), quantization_value: tri(10), transform_compress: tri(230), prediction_method: tri(12) },
    },
    {
        name: '~b- central dogma',
        separateChannels: true,
        note: 'DNA → RNA → protein, one stage per channel: the insulin gene read with its complementary strand, transcribed again with a coarser copy, then folded by the α-helix. Information flows one way; every copy adds its error.',
        config: { colorspace: 0, transform_method: [88, 88, 90], quantization_value: [30, 70, 12], transform_compress: [0, 0, 200], prediction_method: tri(9), min_block_size: tri(4), max_block_size: tri(64) },
    },
    {
        name: '~b- neural field',
        separateChannels: false,
        note: 'Every edge fires. The Hodgkin-Huxley spike is the detail filter; fine adaptive segmentation plays the role of a sheet of neurons, each block choosing its own predictor by search (SAD).',
        config: { colorspace: 9, transform_method: tri(89), quantization_value: tri(50), prediction_method: tri(-1), min_block_size: tri(2), max_block_size: tri(64), segmentation_precision: tri(8) },
    },
    {
        name: '~b- protein fold',
        separateChannels: false,
        note: 'The α-helix does not close after one turn (3.6 residues). Under total thresholding that 5° misfit cross-hatches the image like a folded chain.',
        config: { colorspace: 8, transform_method: tri(90), quantization_value: tri(10), transform_compress: tri(210), prediction_method: tri(9) },
    },
    {
        name: '~b- möbius strip',
        separateChannels: false,
        note: 'The image seen from its other side: every detail coefficient returns with reversed orientation. Edges invert, relief becomes intaglio, colours cross to their far side.',
        config: { colorspace: 8, transform_method: tri(100), quantization_value: tri(40), prediction_method: tri(9), min_block_size: tri(4), max_block_size: tri(128) },
    },
    {
        name: '~b- difference & repetition',
        separateChannels: true,
        note: 'Deleuze in three channels: one keeps only difference (no low band), one only repetition (no detail band, ~b- Ghost), one both lawfully. What is a thing once difference and repetition are pulled apart?',
        config: { colorspace: 12, transform_method: [84, 101, 77], quantization_value: [20, 40, 40], prediction_method: tri(9), min_block_size: tri(4), max_block_size: tri(128) },
    },
    {
        name: '~b- rule 30 garden',
        separateChannels: false,
        note: 'Determined chance: Rule 30\'s centre column as the filter, modular clamping so overflow wraps around like a cellular automaton\'s boundary. Chance you can re-perform exactly.',
        config: { colorspace: 1, transform_method: tri(104), transform_type: tri(1), quantization_value: tri(40), clamp_method: tri(1), prediction_method: tri(9), min_block_size: tri(4), max_block_size: tri(64) },
    },
    {
        name: '~b- edge of chaos',
        separateChannels: false,
        note: 'The logistic map at the Feigenbaum point, where period-doubling tips into chaos. Order and disorder share each block; Langton placed life exactly here.',
        config: { colorspace: 9, transform_method: tri(105), quantization_value: tri(60), prediction_method: tri(9), min_block_size: tri(4), max_block_size: tri(128) },
    },
];

/** the idea behind a ~b- preset, if it has one */
export const getPresetNote = (name: string): string | null => EXTRA_PRESETS.find(e => e.name === name)?.note ?? null;

export const applyExtraPreset = (name: string): { config: CodecConfig; separateChannels: boolean } | null => {
    const p = EXTRA_PRESETS.find(e => e.name === name);
    if (!p) return null;
    const config = new CodecConfig();
    Object.assign(config, p.config);
    return { config, separateChannels: p.separateChannels };
};
