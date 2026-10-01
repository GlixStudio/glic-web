# GLIX Encoder

GLIX Encoder is image manipulation software for compressing, encoding, decoding and glitching images, with layers, masks, selections and effects to shape the result. Its engine is a web-based, vibe coded fork and port of the **GLIC** (GLitch Image Codec) image compression and transformation tool. GLIC has been a huge inspiration for GLIX's aesthetics and design approach. Thus we wanted to port it to web (originally it is a Processing program), and share it with the world.

## Features

- All 67 original JWave wavelets, bit-faithful to desktop GLIC (coefficients extracted from the exact JWave.jar the original ships with)
- 38 extra `~b-` wavelets of our own, ids 68+, not decodable by desktop GLIC: 15 hand-made (reverse biorthogonals, the 4-tap orthogonal lattice family, rotors, splines, sinc, Morlet, noise, slant) and 23 in the [art-science family](#art-science-wavelets-and-presets), each derived from an idea
- `.glic` files byte-compatible with desktop GLIC — encode here, decode there, databend in a hex editor, and re-import glitched files
- Full decoder, including GLIC's "override header" glitch-decode trick
- 16 color spaces, 18 block predictors, quad-tree segmentation, RAW/PACKED/RLE encodings
- 144 bundled community presets, 36 `~b-` presets built on the new wavelets (22 of them art-science experiments with their idea shown in the app), and custom presets with JSON export/import
- Parallel encoding across three worker threads with live progress and cancel
- Photoshop-style layer stack: the imported image is a locked Background; ENCODE (E) runs the codec into the active layer (creating Layer 1 on a fresh image), NEW LAYER (R) encodes the composite into a fresh layer on top, and Iterate feeds the encoder its own output N times - either landing only the final pass in one layer, or keeping every pass as its own layer. With **Layer only** on, ENCODE and Iterate → 1 layer glitch just the active layer's own pixels (e.g. a pasted image) instead of everything beneath it. Each layer has its own mask, opacity, and blend mode (all 20 Photoshop modes, including Color Dodge/Burn, Soft/Hard/Linear Light, Exclusion, Subtract, Divide, Hue, Saturation, Color, Luminosity), applied non-destructively at composite time — retune a glitch after encoding without re-running the codec
- Layer tools: drag to reorder, Alt-click an eye to solo, merge down (⌘E), merge visible (⇧⌘E), duplicate (⌘J), arrange (⌘[ / ⌘]), invert mask, and a Layer menu
- Move tool (V), Photoshop-style and non-destructive: drag the active layer (Shift locks an axis), drag a corner of its box to scale, drag the knob to rotate (Shift snaps to 15°), arrows nudge; exact X/Y/scale/rotation fields, flips and reset in the layer's properties. With a selection, Delete removes that part of the active layer, ⌘J lifts it onto a new layer (⇧⌘J cuts it) - select, ⌘J, V to move a piece. Image → rotate 90°/180° or flip the whole canvas. The mouse wheel zooms only over the image, never over the layer and mask panels
- Post-processing: non-destructive per-layer effects (fx) and adjustment layers that process everything below them — brightness/contrast, hue/saturation, levels, invert, posterize, threshold, gaussian blur, unsharp mask, noise, mosaic, vignette, RGB split, scanlines, pixel sort, slice shift; toggle, reorder, and retune anytime
- Photoshop-style selection tools — rect/ellipse marquee, lasso, magic wand, mask brush, with add/subtract/intersect modes, feather, invert, and mask export — so encoding glitches only the selected region (soft-mask composited at full resolution, print-safe)
- Object-aware magic wand: click an object (or drag along it) and an on-device MediaPipe model selects its outline; Shift/Alt add or subtract objects. The 6 MB model and 12 MB runtime download once on first use and run in a worker - images never leave the browser
- Mask import dialog: choose what counts as selected (brightness, transparency, a picked color with tolerance, a single channel, saturation, with levels and hard edge), then fit, scale, rotate, flip, move or repeat the mask over the canvas
- Masks library in the right-hand dock: saved and imported masks persist in the browser across images and projects; select, add, subtract, intersect, apply to a layer, or re-place them
- Channel mixer: in separate-channels mode all three channels sit side by side on one page, labeled by the active colorspace (H·W·B, Y·Cb·Cr, …)
- Viewer with zoom/pan, hold-to-compare, and segmentation visualization
- Re-encode iteration, multi-level undo, real-time adjustments (hue/saturation/brightness/contrast)
- Image menu: image size (smooth or crisp-pixel resampling) and canvas size (anchor, fill, trim to tile multiples); layers and masks follow
- Export dialog: composite, active layer, source, selection mask or a ZIP of everything; PNG/JPEG/WebP, 1–8× upscaling, DPI written into PNG and JPEG, crop to selection, selection as transparency
- Tilesets (8–256 px), spritesheets arranged by dominant color, brightness, saturation, shape or similarity with a TexturePacker-style JSON manifest of per-tile color and shape values (for pattrn.glix.studio), and GIF/WebM animation export
- Projects: File → Save keeps the whole piece (source, layer stack with masks, effects and streams, codec settings) in your browser via IndexedDB — reopen anytime from File → Open; layers are bounded by a memory budget, not a fixed count
- Copy & paste: ⌘V pastes an image from the clipboard; ⌘C copies what you see (adjustments included) or just the selection, cropped with transparency. With an image open, pasting, dropping or uploading another asks whether to place it as a layer (centred, shrunk only to fit, ready for the Move tool) or open it as a new image. All of it is also in the Edit and File menus
- Works on tablets (touch: pinch to zoom, two fingers to pan, with any tool) and adapts down to phones - there the controls become a drawer with a floating ENCODE button, and a one-time notice recommends a desktop or tablet for the full editor
- Built-in help: hover any control for a plain-language explanation, plus a guided tour of the whole editor - menus, every codec stage, encoding, selection tools, layers, masks and output, in skippable parts. It opens its own tabs and panels as it goes, offers a sample image and a first encode so every stop has something to show, and restarts from Help & About

## Art-science wavelets and presets

Wavelets 83–105 are not tuned by eye: each is **computed from a structure in the world** by [`scripts/wavelab/artsci.ts`](scripts/wavelab/artsci.ts), which is the score, so anyone can re-perform it. The app shows each one's idea under the wavelet and preset pickers.

- **Physics:** the golden angle vs 1/α (Pauli's 137), two T gates making an S, a basis turned by the CHSH angle, conjugate Gaussians (uncertainty), a Fibonacci quasicrystal
- **Biology:** the first 16 nt of human insulin as electron-ion interaction potentials against their reverse complement, a Hodgkin-Huxley spike, the α-helix's 3.6 residues per turn, and two lattices bred by a seeded evolution strategy (the fittest and, with fitness inverted, the least fit)
- **Music:** the circle of fifths in 12-TET vs pure 3:2 fifths (the Pythagorean comma), Coltrane's major-third cycle, the row of Berg's Violin Concerto, tritone substitution, Messiaen's mode 2, the crab canon of Bach's Royal Theme
- **Philosophy / topology:** Möbius (details rebuilt with their orientation reversed), difference without repetition, Derrida's différance, call and response
- **Generative systems:** Rule 30's centre column, the logistic map at the Feigenbaum point

There are two kinds of bank. **Lawful** ones are orthogonal lattices (perfect reconstruction). They only show their character once detail is thrown away (the Compression slider), and several are built so that a real structure *almost* closes the lattice's 45° law. The leftover angle is the artwork: the Pythagorean comma floods an image that 12-TET leaves calm. **Broken** ones make analysis and synthesis disagree on purpose, so they glitch at any setting.

The 22 art-science presets are experiments. None use RANDOM, so results re-perform exactly, and A/B pairs isolate one variable: `~b- well tempered` / `~b- wolf fifth`, `~b- selection pressure` / `~b- maladaptation`.

Regenerate or verify the family (the test suite also fails if the generated module drifts from its derivation):

```sh
npx vite-node scripts/wavelab/gen-artsci.ts           # rewrite src/core/artsciWavelets.ts
npx vite-node scripts/wavelab/gen-artsci.ts --check   # verify it matches
npx vite-node scripts/wavelab/wavelets.ts out 83 94   # contact sheets of chosen ids
```

Wavelet ids are part of the `.glic` format: new ideas are appended, existing ones are never re-derived.

## Links

- **GLIC Source code:** [https://github.com/GlitchCodec/GLIC](https://github.com/GlitchCodec/GLIC)
- **GLIX Encoder source code:** [https://github.com/GlixStudio/glic-web](https://github.com/GlixStudio/glic-web)
- **Vibe coded by** [Glix Studio](https://home.glix.studio)
- [Glix Shop](https://glix.shop)

## License

**Copyleft Glix Studio** – This software is free and open source. Use, modify, and distribute freely.
