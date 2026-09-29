// Beginner help content, shown in hover tooltips and the guided tour.
// One source of truth so the linked editor, the channel mixer, and the
// toolbars all explain a control the same way. Written for artists:
// what a control is, and what happens to the image when you move it.

export interface HelpEntry {
    title: string;
    body: string;
    shortcut?: string;
}

export const HELP = {
    // --- global ---
    preset: {
        title: 'Presets',
        body: '144 complete looks from the GLIC community. Pick one, hit ENCODE, then tweak from there. The save icon stores your current settings as a custom preset; Export/Import move your presets between machines as JSON.',
    },
    colorspace: {
        title: 'Color space',
        body: 'The image is split into three channels in this space before glitching, and each channel is destroyed separately. YCbCr keeps brightness in one clean channel; HWB and HSB put hue in a channel, so damage becomes psychedelic color shifts. Changing this changes everything.',
    },
    separateChannels: {
        title: 'Separate channels',
        body: 'Off: one set of controls drives all three channels. On: a side-by-side mixer where each channel gets its own settings - e.g. keep brightness intact but wreck the color channels.',
    },

    // --- segmentation ---
    minBlock: {
        title: 'Min block size',
        body: 'The smallest tile the image may be cut into. Small tiles follow detail closely; raising this forces chunkier minimum shapes.',
    },
    maxBlock: {
        title: 'Max block size',
        body: 'The largest tile allowed. Big blocks produce big slabs of unified glitch; small maximums make everything mosaic-fine.',
    },
    threshold: {
        title: 'Split threshold',
        body: 'How busy an area must be before it gets cut into smaller tiles. Low values split eagerly (fine mosaic everywhere); high values keep large lazy slabs even over detail.',
    },

    // --- prediction ---
    prediction: {
        title: 'Prediction',
        body: 'Each tile is first guessed from its neighbors; only the error is encoded, and wrong guesses become the glitch. Different predictors streak differently: H/V smear sideways/down, PAETH is PNG’s clean one, SAD picks the best fit per tile, BSAD the worst, RANDOM rolls dice per tile.',
    },

    // --- quantization ---
    quantization: {
        title: 'Quantization',
        body: 'Crushes the prediction error before storing it (divides by value÷2). Higher values band and posterize the reconstruction. 0-2 is off.',
    },
    clamping: {
        title: 'Clamping',
        body: 'What happens when pixel math overflows. None clips at the limits (softer). Mod 256 wraps around, so a too-bright pixel snaps to dark - hard, inverted, classic glitch edges.',
    },

    // --- wavelet ---
    wavelet: {
        title: 'Wavelet',
        body: 'The transform that smears each tile into frequency ripples before storage. All 67 originals from desktop GLIC are here, including the mathematically broken ones that define its look - try CDF 9/7, the even BiOrthogonals, or Battle 23. The ~b- entries at the end are glic-web additions (desktop GLIC cannot decode those). Random picks a fresh original per encode.',
    },
    transformType: {
        title: 'Transform type',
        body: 'FWT concentrates the tile’s energy into a corner (soft, smeary damage). WPT keeps re-transforming everything (busier, more crystalline). Random rolls per encode.',
    },
    compression: {
        title: 'Compression',
        body: 'After the transform, ripples quieter than this threshold are deleted. Higher values hollow tiles out - washed, simplified, sometimes empty.',
    },
    scale: {
        title: 'Scale',
        body: 'Storage precision for the ripples, as 2^x. This is a main damage dial: lower it and the wavelet coefficients get rounded harder and harder until tiles collapse.',
    },

    // --- encoding ---
    encodingMethod: {
        title: 'Final encoding',
        body: 'How numbers are packed into the .glic file: RAW (roomy 32-bit), PACKED (tight bitstream), RLE (run-length). It shapes the file’s texture for hex-editor databending more than the on-screen image.',
    },

    // --- actions ---
    encode: {
        title: 'Encode',
        body: 'Runs the codec into the active layer, replacing it - tweak settings and press E again until it is right. With the Background selected (e.g. a fresh image) it creates Layer 1 just above it. The current selection becomes that layer’s mask; with no selection the layer covers the full frame, replacing any earlier mask.',
        shortcut: 'E',
    },
    newLayer: {
        title: 'New layer',
        body: 'Encodes the current composite into a fresh layer on top of the stack - stacking damage on damage, while every pass stays separately adjustable.',
        shortcut: 'R',
    },
    iterate: {
        title: 'Iterate → 1 layer',
        body: 'Feeds the encoder its own output this many times in a row and lands only the final result, like ENCODE - in the active layer. Compound rot in one click, one layer.',
    },
    iterateLayers: {
        title: 'Iterate → every pass',
        body: 'The same repeated encoding, but every pass is kept as its own new layer above the active one - frames of compound rot you can hide, fade, blend or delete. Cancelling keeps the passes already finished.',
    },
    undo: {
        title: 'Undo',
        body: 'Steps back through structural changes: encodes, new layers, deletes, imports, flatten.',
        shortcut: 'U',
    },
    savePng: {
        title: 'Save PNG',
        body: 'Downloads the composite exactly as you see it (layers, masks, and adjustments baked in) at full resolution - print-ready.',
        shortcut: 'S',
    },
    saveGlic: {
        title: 'Save .glic',
        body: 'Downloads the active layer’s raw codec stream. It opens in desktop GLIC, and it’s the file to open in a hex editor for databending.',
        shortcut: 'G',
    },
    importGlic: {
        title: 'Import .glic',
        body: 'Decodes a .glic file - from this app, desktop GLIC, or one you corrupted by hand - into the active layer (or a new one above the Background).',
        shortcut: 'I',
    },
    overrideHeader: {
        title: 'Override header',
        body: 'Decode an imported .glic with your CURRENT settings instead of the ones stored in the file - the original GLIC’s misdecoding trick. Wrong settings, beautiful results.',
    },

    // --- selection tools ---
    toolMove: { title: 'Move', body: 'Moves and transforms the active layer, like Photoshop: drag anywhere to move (Shift locks an axis), drag a corner to scale, drag the round knob to rotate (Shift snaps to 15°). Arrow keys nudge 1 px, Shift+arrow 10 px. Nothing is resampled for good - reset it anytime in the layer’s properties.', shortcut: 'V' },
    toolHand: { title: 'Hand', body: 'Drag to pan when zoomed in. Hold Space for a temporary pan while any other tool is active.', shortcut: 'H' },
    toolRect: { title: 'Rectangular marquee', body: 'Drag a rectangle to select. Only the selection gets glitched on the next encode. Plain click deselects; Shift adds, Alt subtracts.', shortcut: 'M' },
    toolEllipse: { title: 'Elliptical marquee', body: 'Drag an ellipse to select. Press M again to switch back to the rectangle.', shortcut: 'M M' },
    toolLasso: { title: 'Lasso', body: 'Draw a freehand outline; it closes into a selection when you release.', shortcut: 'L' },
    toolWand: { title: 'Magic wand', body: 'Color mode: click a color to select everything similar to it. Object mode: click a thing (a face, a cup, a cat) and it selects that object’s outline. Press W again to switch modes.', shortcut: 'W' },
    wandMode: {
        title: 'Color or Object',
        body: 'Color floods pixels that look alike. Object uses a small on-device AI model to find the whole object under your click, even when it has many colors. Drag along thin or awkward objects to guide it. Your image never leaves the browser; the model downloads once (~18 MB) and is cached.',
        shortcut: 'W W',
    },
    objectSource: { title: 'Detect on', body: 'Original finds objects in the untouched source image - usually most accurate. Visible looks at the glitched composite you see, for selecting shapes the glitch created.' },
    toolBrush: { title: 'Mask brush', body: 'Paint the selection directly. Hold Alt to erase, [ and ] to resize the brush.', shortcut: 'B' },
    combineMode: {
        title: 'Combine mode',
        body: 'How a new selection meets the existing one: replace it, add to it (or hold Shift), subtract from it (or hold Alt), or keep only the overlap (Intersect, or hold Shift+Alt).',
    },
    tolerance: { title: 'Tolerance', body: 'How different a color may be and still be picked up by the wand. Low = strict, high = grabs half the image.' },
    contiguous: { title: 'Contiguous', body: 'On: the wand only spreads through connected pixels. Off: it selects that color everywhere in the image.' },
    brushSize: { title: 'Brush size', body: 'Diameter of the mask brush in image pixels. [ and ] resize it from the keyboard.' },
    feather: {
        title: 'Feather',
        body: 'Softens selection edges by this many pixels so the glitch fades into the untouched image instead of ending in a hard seam - important for prints. Applies to new selections; use "Feather selection" for the current one.',
    },
    selectAll: { title: 'Select all', body: 'Selects the whole image.', shortcut: 'A' },
    invertSelection: { title: 'Invert', body: 'Swaps selected and unselected - glitch everything EXCEPT the area you outlined.', shortcut: 'X' },
    clearSelection: { title: 'Clear', body: 'Deselects. The mask is remembered - Redo brings it back.', shortcut: 'Esc / D' },
    reselect: { title: 'Reselect', body: 'Restores the last cleared selection.' },
    featherApply: { title: 'Feather selection', body: 'Blurs the current selection’s edges by the feather amount, once.' },
    maskIn: {
        title: 'Import mask',
        body: 'Load any image as a selection. A dialog lets you choose what counts as selected (brightness, transparency, a picked color, one channel), then size, rotate, flip, move or repeat it over the canvas. Imported masks are kept in the Masks library.',
    },
    maskSource: {
        title: 'Mask from',
        body: 'Which property of the imported image becomes the selection. Brightness: white selected, black not. Transparency: opaque pixels selected (great for PNG cut-outs). Pick a color: everything close to one color, like a green screen. A single channel or saturation pulls hidden structure out of photos.',
    },
    maskSourceImage: { title: 'Mask image', body: 'The image you imported. With “Pick a color” active, click here to choose the color that should be selected.' },
    maskTolerance: { title: 'Tolerance', body: 'How far a color may drift from the picked one and still count as a full match. Softness then fades the match out gradually instead of cutting it hard.' },
    maskLevels: { title: 'Black / white point', body: 'Levels for the mask: everything darker than the black point becomes unselected, everything brighter than the white point fully selected. Pull them together to boost a faint mask.' },
    maskThreshold: { title: 'Hard edge', body: 'Snaps every gray to fully selected or not at the threshold. Use it for crisp masks for laser engraving or screen printing.' },
    maskFit: { title: 'Fit', body: 'How the mask image is sized to the canvas before your own scale: stretch to fill, fit inside with proportions, fill and crop, or keep its original pixel size.' },
    maskTile: { title: 'Repeat as pattern', body: 'Tiles the mask across the whole canvas, anchored at the center. Combine with Scale and 1:1 for repeating motifs and fabric repeats.' },
    saveSelectionMask: { title: 'Save selection', body: 'Stores the current selection in the Masks library so you can bring it back later, on this or any other image.' },
    masksPanel: {
        title: 'Masks library',
        body: 'Saved masks, remembered in this browser across images and projects. Click one to select it, use the buttons to add, subtract or intersect it with the current selection, put it on the active layer, or place it again with new size and rotation.',
    },
    maskOut: { title: 'Export mask', body: 'Save the current selection as a grayscale PNG to reuse later or refine elsewhere.' },

    // --- layers ---
    layersPanel: {
        title: 'Layers',
        body: 'Your imported image is the locked Background. ENCODE (E) replaces the active layer, NEW LAYER (R) stacks a fresh one on top. Each layer keeps its full glitch plus its own mask, opacity, blend mode and effects - all adjustable after the fact without re-encoding. Drag rows to reorder, Alt-click an eye to show only that layer.',
    },
    layerVisibility: { title: 'Visibility', body: 'Hide a layer to see the image without its glitch. Nothing is lost - toggle it back anytime.' },
    blendMode: {
        title: 'Blend mode',
        body: 'How this layer’s glitch mixes with what is underneath - the full Photoshop set. Darken/Multiply/Burn darken; Lighten/Screen/Dodge/Add brighten; Overlay and the Lights add contrast; Difference and Exclusion invert where they disagree (glitch-art favorites); Hue/Saturation/Color/Luminosity borrow just one quality of the glitch - try Color to recolor without breaking the detail.',
    },
    layerOpacity: { title: 'Opacity', body: 'Fades the layer’s glitch into the image below. 100% = full effect, 0% = invisible.' },
    setMask: { title: 'Set mask', body: 'Replaces this layer’s mask with the current working selection.' },
    editMask: { title: 'Edit mask', body: 'Loads this layer’s mask into the selection tools so you can brush, feather, or invert it - then Set mask to apply.' },
    removeMask: { title: 'Remove mask', body: 'Drops the mask so the layer’s glitch covers the whole frame.' },
    layerTransform: { title: 'Transform', body: 'Where the layer sits: offset, scale and rotation around the canvas centre, plus flips. Non-destructive - the original pixels are kept, so Reset always brings them back. The Move tool (V) edits the same values on the canvas.' },
    invertMask: { title: 'Invert mask', body: 'Swaps what the mask shows and hides - glitch the background instead of the subject.' },
    layerEffects: {
        title: 'Layer effects',
        body: 'Non-destructive post-processing on this layer only, applied top to bottom before it blends: adjustments (levels, hue/saturation, posterize…), filters (blur, sharpen, noise, mosaic, vignette) and glitch effects (RGB split, scanlines, pixel sort, slice shift). Toggle, reorder or tweak them anytime.',
    },
    adjustmentLayer: {
        title: 'Adjustment layer',
        body: 'A layer with no pixels of its own: its effects process everything beneath it, like a Photoshop adjustment layer. Mask it to post-process only part of the image; fade it with opacity; move it up or down to change what it affects.',
    },
    mergeDown: {
        title: 'Merge down',
        body: 'Combines the active layer with the one beneath it into a single layer of what you see (the bottom layer merges into the Background). Undoable.',
        shortcut: '⌘E',
    },
    flatten: {
        title: 'Flatten',
        body: 'Bakes the whole stack into a new baseline image and clears the layers - like flattening in Photoshop. Undoable. Do it when a stage is "done" and you want to build on top.',
    },

    // --- image / export ---
    resample: { title: 'Resampling', body: 'Smooth averages pixels when shrinking and blends them when enlarging - best for photos. Crisp pixels copies the nearest pixel, keeping glitch blocks razor sharp - best for pixel art, tiles and laser engraving.' },
    snapTiles: { title: 'Trim to tiles', body: 'Crops the canvas down to the nearest multiple of the tile size, so tilesets and spritesheets use every pixel with no leftover strip.' },
    canvasAnchor: { title: 'Anchor', body: 'Where the existing image sits on the new canvas. The center keeps it centered; a corner grows or crops away from that corner.' },
    exportDpi: { title: 'DPI', body: 'Print resolution written into the file. It does not change pixels - it tells print shops and laser software how large to print. 300 is standard for paper and fabric.' },
    exportScale: { title: 'Scale', body: 'Enlarges the export by a whole factor. With crisp pixels the glitch blocks stay hard-edged at print size instead of going blurry.' },
    exportCrop: { title: 'Crop to selection', body: 'Exports only the bounding box of the current selection.' },
    exportAlpha: { title: 'Selection as transparency', body: 'Makes everything outside the selection transparent - for stickers, cut files and overlays. PNG and WebP only.' },

    spriteOrder: {
        title: 'Arrange tiles by',
        body: 'How the cut tiles are laid out on the sheet: as cut, shuffled (reshuffle for a new seed), by dominant color around the hue wheel, brightness, saturation, by shape (flat to busy, or horizontal to vertical structure), or chained so each tile sits next to its most similar one. The JSON lists every tile’s color and shape values for pattern generators.',
    },
    spriteSkipFlat: { title: 'Skip flat tiles', body: 'Leaves out tiles with almost no variation (solid color), which usually make dull pattern pieces.' },
    tileSize: { title: 'Tile size', body: 'Size of each square tile cut from the image. Only whole tiles are used - trim the canvas to a multiple (Image > Canvas size) to use every pixel.' },

    // --- viewer ---
    zoomControls: { title: 'Zoom', body: 'Mouse wheel zooms too. F toggles between fit and 100%; drag to pan while zoomed.', shortcut: 'F' },
    compare: { title: 'Compare', body: 'Hold to peek at the untouched source image.', shortcut: 'C (hold)' },
    segmentationView: {
        title: 'Segmentation view',
        body: 'Shows how the last encode tiled the image - every block flooded with its center value. Useful for understanding what the split threshold is doing.',
    },
    changeImage: { title: 'Change image', body: 'Load a different image or .glic file. The layer stack starts fresh.' },
} as const satisfies Record<string, HelpEntry>;
