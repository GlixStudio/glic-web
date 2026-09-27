# GLIC Web

GLIC Web is a web-based vibe coded port of the **GLIC** (GLitch Image Codec) image compression and transformation tool. GLIC has been a huge inspiration for GLIX's aesthetics and design approach. Thus we wanted to port it to web (originally it is a Processing program), and share it with the world.

## Features

- All 67 original JWave wavelets, bit-faithful to desktop GLIC (coefficients extracted from the exact JWave.jar the original ships with)
- `.glic` files byte-compatible with desktop GLIC — encode here, decode there, databend in a hex editor, and re-import glitched files
- Full decoder, including GLIC's "override header" glitch-decode trick
- 16 color spaces, 18 block predictors, quad-tree segmentation, RAW/PACKED/RLE encodings
- 144 bundled community presets + custom presets with JSON export/import
- Parallel encoding across three worker threads with live progress and cancel
- Glitch layer stack: each encode lands on a layer with its own mask, opacity, and blend mode (Normal/Multiply/Screen/Overlay/Darken/Lighten/Difference/Add), all applied non-destructively at composite time — retune a glitch after encoding without re-running the codec
- Photoshop-style selection tools — rect/ellipse marquee, lasso, magic wand, mask brush, with add/subtract modes, feather, invert, and grayscale mask import/export — so encoding glitches only the selected region (soft-mask composited at full resolution, print-safe)
- Channel mixer: in separate-channels mode all three channels sit side by side on one page, labeled by the active colorspace (H·W·B, Y·Cb·Cr, …)
- Viewer with zoom/pan, hold-to-compare, and segmentation visualization
- Re-encode iteration, multi-level undo, real-time adjustments (hue/saturation/brightness/contrast)
- Tileset generation with GIF/WebM animation export
- Projects: File → Save keeps the whole piece (source, layer stack with masks and streams, codec settings) in your browser via IndexedDB — reopen anytime from File → Open; layers are bounded by a memory budget, not a fixed count
- Built-in help: hover any control for a plain-language explanation, plus a first-run guided tour (restartable from Help & About)

## Links

- **GLIC Source code:** [https://github.com/GlitchCodec/GLIC](https://github.com/GlitchCodec/GLIC)
- **GLIC-web Source code:** [https://github.com/GlixStudio/glic-web](https://github.com/GlixStudio/glic-web)
- **Vibe coded by** [Glix Studio](https://home.glix.studio)
- [Glix Shop](https://glix.shop)

## License

**Copyleft Glix Studio** – This software is free and open source. Use, modify, and distribute freely.
