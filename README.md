# GLIC Web

GLIC Web is a web-based vibe coded port of the **GLIC** (GLitch Image Codec) image compression and transformation tool. GLIC has been a huge inspiration for GLIX's aesthetics and design approach. Thus we wanted to port it to web (originally it is a Processing program), and share it with the world.

## Features

- All 67 original JWave wavelets, bit-faithful to desktop GLIC (coefficients extracted from the exact JWave.jar the original ships with)
- 15 extra `~b-` wavelets of our own (reverse biorthogonals, the 4-tap orthogonal lattice family, rotors, splines, sinc, Morlet, noise, slant) - ids 68+, not decodable by desktop GLIC
- `.glic` files byte-compatible with desktop GLIC — encode here, decode there, databend in a hex editor, and re-import glitched files
- Full decoder, including GLIC's "override header" glitch-decode trick
- 16 color spaces, 18 block predictors, quad-tree segmentation, RAW/PACKED/RLE encodings
- 144 bundled community presets, 14 `~b-` presets built on the new wavelets, and custom presets with JSON export/import
- Parallel encoding across three worker threads with live progress and cancel
- Photoshop-style layer stack: the imported image is a locked Background and every encode (E) stacks a new layer above the active one — Layer 1, Layer 2, … — each glitching what is beneath it; R re-encodes the active layer in place, and Iterate lands every pass on its own layer. Each layer has its own mask, opacity, and blend mode (all 20 Photoshop modes, including Color Dodge/Burn, Soft/Hard/Linear Light, Exclusion, Subtract, Divide, Hue, Saturation, Color, Luminosity), applied non-destructively at composite time — retune a glitch after encoding without re-running the codec
- Layer tools: drag to reorder, Alt-click an eye to solo, merge down (⌘E), merge visible (⇧⌘E), duplicate (⌘J), arrange (⌘[ / ⌘]), invert mask, and a Layer menu
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
- Built-in help: hover any control for a plain-language explanation, plus a first-run guided tour (restartable from Help & About)

## Links

- **GLIC Source code:** [https://github.com/GlitchCodec/GLIC](https://github.com/GlitchCodec/GLIC)
- **GLIC-web Source code:** [https://github.com/GlixStudio/glic-web](https://github.com/GlixStudio/glic-web)
- **Vibe coded by** [Glix Studio](https://home.glix.studio)
- [Glix Shop](https://glix.shop)

## License

**Copyleft Glix Studio** – This software is free and open source. Use, modify, and distribute freely.
