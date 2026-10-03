import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useApp } from '../core/AppContext';
import { START_TOUR_EVENT, revealForTour, type TourReveal } from '../core/tour';
import { makeSampleImage } from '../core/sampleImage';
import { isPhoneWidth } from '../core/viewport';
import { storageKey } from '../core/storage';
import { useRoute } from '../social/router';

// Guided tour: a walk through the whole editor in chapters, spotlighting one
// [data-tour] element per step. Steps ask the owning component to reveal what
// they point at (a sidebar tab, the Masks tab, the selection options) and follow
// the target every frame, so tab switches, transitions and scrolling never leave
// the spotlight behind. A step whose target is not on screen yet (no image open,
// nothing encoded) still shows - centred - and offers to load a sample image or
// run the first encode, so the tour is never cut short by app state.
// Auto-runs once per browser (localStorage flag) and restarts from Help & About.

const SEEN_KEY = storageKey('tour_seen_v2');

interface TourStep {
    chapter: string;
    title: string;
    /** `backticks` render as keys */
    body: string;
    /** data-tour name(s), first one on screen wins; none = a centred card */
    target?: string | string[];
    reveal?: TourReveal;
    /** what the target waits for, used when it is not on screen */
    needs?: 'image' | 'encode';
    /** offered even when the target is visible */
    offer?: 'sample' | 'encode';
}

const STEPS: TourStep[] = [
    // --- welcome ---
    {
        chapter: 'Welcome',
        title: 'Welcome to GLIX Encoder',
        body: 'GLIX Encoder compresses, encodes and manipulates images with a fork of GLIC, the glitch image codec - deliberately breakable math, where the breakage is the art. This tour walks through the whole editor, part by part: menus, the codec, encoding, canvas tools, layers and masks. Use `←` `→` to move, `Esc` to leave; restart it anytime from Help.',
        offer: 'sample',
    },

    // --- getting started ---
    {
        chapter: 'Getting started',
        target: ['dropzone', 'menu-file'],
        title: 'Open an image',
        body: 'Drop any image or a .glic file onto the canvas, click Select file, paste one with `⌘V`, or use File → Import image. Once an image is open, adding another asks whether to place it as a layer or open it as a new image. Nothing is uploaded - everything stays in your browser at full resolution.',
        offer: 'sample',
    },
    {
        chapter: 'Getting started',
        target: 'status',
        reveal: 'canvas',
        needs: 'image',
        title: 'Status line',
        body: 'Image size, what you are looking at (source, processed or segmentation), how much of the image is selected, and the active layer with the layer count.',
    },
    {
        chapter: 'Getting started',
        target: 'sidebar-toggle',
        title: 'Show / hide controls',
        body: 'Fold the controls away for a bigger canvas. On phones the controls become a drawer and a floating ENCODE button appears on the canvas.',
    },
    {
        chapter: 'Getting started',
        target: 'help',
        title: 'Help is always one hover away',
        body: 'Hover any control for a plain-language explanation of what it does to the image. Help & About lists every feature and keyboard shortcut, and restarts this tour.',
    },

    // --- menus ---
    {
        chapter: 'Menus',
        target: 'menu-file',
        title: 'File - projects and export',
        body: 'Save keeps the whole piece - source, every layer with its mask, effects and codec stream, and your settings - in this browser; Open brings it back. Import images or .glic files here. Export… makes print-ready files: composite, a single layer, the source, the selection mask or a ZIP of everything, as PNG, JPEG or WebP, upscaled 1-8× with DPI, cropped to the selection or with the selection as transparency.',
    },
    {
        chapter: 'Menus',
        target: 'menu-edit',
        title: 'Edit - copy and paste',
        body: 'Undo, copy and paste. `⌘C` copies what you see, adjustments included - or just the selection, cropped with transparency. `⌘V` pastes an image from the clipboard as a new layer or a new image.',
    },
    {
        chapter: 'Menus',
        target: 'menu-image',
        title: 'Image - size and orientation',
        body: 'Image size rescales everything (smooth, or crisp pixels for pixel art). Canvas size crops or extends around an anchor and can trim to tile multiples. Rotate 90°/180° and flip the canvas - layers and masks follow.',
    },
    {
        chapter: 'Menus',
        target: 'menu-layer',
        title: 'Layer - Photoshop’s layer commands',
        body: 'Duplicate (`⌘J`), delete, layer via copy / cut (`⌘J` / `⇧⌘J` with a selection), delete the selected area (`⌫`), flip or reset a layer’s transform, arrange (`⌘[` `⌘]`), merge down (`⌘E`), merge visible (`⇧⌘E`) and flatten.',
    },
    {
        chapter: 'Menus',
        target: 'menu-view',
        title: 'View',
        body: 'Zoom in and out, fit to window (`F`), actual size, the segmentation view, and showing or hiding the controls.',
    },

    // --- the codec ---
    {
        chapter: 'The codec',
        target: 'preset',
        reveal: 'sidebar-global',
        title: 'Presets - the fastest way in',
        body: '144 complete looks from the GLIC community, plus 36 ~b- presets built on GLIX Encoder’s own wavelets. 22 of those are art-science experiments that show their idea under the picker. The save icon stores your settings as a ★ custom preset; Export / Import move your presets between machines as JSON.',
    },
    {
        chapter: 'The codec',
        target: 'colorspace',
        reveal: 'sidebar-global',
        title: 'Color space and channels',
        body: 'Before glitching, the image is split into three channels in one of 16 color spaces, and each channel is damaged separately. YCbCr keeps brightness clean; HWB and HSB put hue in a channel, so damage turns into color shifts. Separate channels gives each channel its own settings in a side-by-side mixer.',
    },
    {
        chapter: 'The codec',
        target: 'tab-channels',
        reveal: 'sidebar-channels',
        title: 'The Channels tab',
        body: 'The machinery that damages the image, in the order the codec runs it: cut into tiles, predict, quantize, transform, pack. The next five stops go through it.',
    },
    {
        chapter: 'The codec',
        target: ['ch-segmentation', 'channel-editor'],
        reveal: 'sidebar-channels',
        title: '1 · Segmentation',
        body: 'A quad-tree cuts the image into square tiles between the min and max block size; the threshold decides how busy an area must be before it is split again. Big blocks give slabs of unified glitch, small ones a fine mosaic.',
    },
    {
        chapter: 'The codec',
        target: ['ch-prediction', 'channel-editor'],
        reveal: 'sidebar-channels',
        title: '2 · Prediction',
        body: 'Each tile is guessed from its neighbors and only the error is stored - wrong guesses become the glitch. 18 predictors: H and V smear sideways and down, PAETH is PNG’s clean one, SAD picks the best fit per tile, BSAD the worst, RANDOM rolls dice.',
    },
    {
        chapter: 'The codec',
        target: ['ch-quantization', 'channel-editor'],
        reveal: 'sidebar-channels',
        title: '3 · Quantization and clamping',
        body: 'Quantization crushes the prediction error, so the result bands and posterizes. Clamping decides what happens on overflow: None clips softly, Mod 256 wraps a too-bright pixel round to dark - hard, inverted, classic glitch edges.',
    },
    {
        chapter: 'The codec',
        target: ['ch-wavelet', 'channel-editor'],
        reveal: 'sidebar-channels',
        title: '4 · Wavelet transform',
        body: 'All 67 wavelets of desktop GLIC, bit-faithful - broken ones included - plus 38 ~b- wavelets made for GLIX Encoder. 23 of those are computed from ideas: the Pythagorean comma, a Hodgkin-Huxley spike, Berg’s tone row, Rule 30… with the idea shown under the picker. Compression deletes quiet detail; Scale is the main damage dial.',
    },
    {
        chapter: 'The codec',
        target: ['ch-encoding', 'channel-editor'],
        reveal: 'sidebar-channels',
        title: '5 · Final encoding',
        body: 'How the numbers are packed into the .glic file: RAW, PACKED or RLE. It shapes the file’s bytes for hex-editor databending more than the picture on screen.',
    },
    // --- encoding ---
    {
        chapter: 'Encoding',
        target: 'encode',
        title: 'ENCODE',
        body: 'Runs the codec into the active layer, replacing it - tweak and press `E` again until it is right. On a fresh image it creates Layer 1 above your picture. The current selection becomes the layer’s mask. Encoding runs on three worker threads with live progress and cancel.',
        offer: 'encode',
    },
    {
        chapter: 'Encoding',
        target: 'new-layer',
        title: 'NEW LAYER',
        body: 'Press `R` to encode the current composite into a fresh layer on top - damage stacked on damage, every pass still separately adjustable.',
    },
    {
        chapter: 'Encoding',
        target: 'layer-only',
        title: 'Layer only',
        body: 'With this on, ENCODE and Iterate → 1 layer glitch just the active layer’s own pixels - e.g. a pasted image - instead of everything beneath it. The layer keeps its mask, position, effects and blending; a selection limits the glitch to part of it.',
    },
    {
        chapter: 'Encoding',
        target: 'iterate',
        title: 'Iterate',
        body: 'Feed the encoder its own output 2-20 times. → 1 layer lands only the final pass in the active layer; → N layers keeps every pass as its own layer - frames of compound rot to hide, fade, blend or animate. Cancelling keeps the passes already finished.',
    },
    {
        chapter: 'Encoding',
        target: 'undo',
        title: 'Undo',
        body: 'Press `U` to step back through encodes, new layers, deletes, imports and flattens.',
    },
    {
        chapter: 'Encoding',
        target: 'files',
        title: 'PNG, .glic and Import',
        body: '`S` saves the composite as you see it at full resolution. `G` saves the active layer’s raw .glic stream - it opens in desktop GLIC, and it is the file to corrupt in a hex editor. `I` imports a .glic, broken ones included. Tick Override header to decode it with your current settings instead of the file’s - wrong settings, beautiful results.',
    },

    // --- canvas tools ---
    {
        chapter: 'Canvas tools',
        target: 'tool-move',
        reveal: 'canvas',
        needs: 'image',
        title: 'Move tool',
        body: 'Press `V`, then drag the active layer (Shift locks an axis), drag a corner to scale, the round knob to rotate (Shift snaps to 15°); arrows nudge 1 px, Shift+arrows 10 px. Nothing is resampled for good - exact numbers and reset live in the layer’s properties.',
    },
    {
        chapter: 'Canvas tools',
        target: 'tool-rect',
        reveal: 'canvas',
        needs: 'image',
        title: 'Marquee and lasso',
        body: '`M` drags a rectangle, `M` again an ellipse; `L` draws a freehand lasso. With a selection, the next encode only shows inside it - soft-masked at full resolution, so it is print-safe.',
    },
    {
        chapter: 'Canvas tools',
        target: 'tool-wand',
        reveal: 'canvas',
        needs: 'image',
        title: 'Magic wand - by color or by object',
        body: '`W` selects similar colors (tolerance, contiguous). Press `W` again for Object mode: click a face, a cup, a cat and an on-device model selects its outline; drag along thin objects to guide it. The model downloads once (~18 MB) and your image never leaves the browser.',
    },
    {
        chapter: 'Canvas tools',
        target: 'tool-brush',
        reveal: 'canvas',
        needs: 'image',
        title: 'Mask brush',
        body: '`B` paints the selection directly; hold Alt to erase, `[` and `]` resize the brush.',
    },
    {
        chapter: 'Canvas tools',
        target: ['tool-options', 'selection-tools'],
        reveal: 'selection-options',
        needs: 'image',
        title: 'Selection options',
        body: 'Combine new selections with the old one: replace, add (Shift), subtract (Alt) or intersect (Shift+Alt). Feather softens edges. All (`A`), Invert (`X`), Clear (`D` / `Esc`), Redo brings the last one back. Mask in turns any image into a selection - by brightness, transparency, a color or a channel, then sized, rotated or tiled; Mask out saves it.',
    },
    {
        chapter: 'Canvas tools',
        target: 'tool-hand',
        reveal: 'canvas',
        needs: 'image',
        title: 'Hand',
        body: '`H` pans; hold `Space` to pan with any other tool. On touch screens, pinch to zoom and drag with two fingers to pan, whatever tool is active.',
    },
    {
        chapter: 'Canvas tools',
        target: 'zoom',
        reveal: 'canvas',
        needs: 'image',
        title: 'Zoom',
        body: 'Zoom in and out, click the percentage (or press `F`) to toggle fit / 100%. The mouse wheel zooms over the image - never over the panels.',
    },
    {
        chapter: 'Canvas tools',
        target: 'compare',
        reveal: 'canvas',
        needs: 'encode',
        title: 'Compare',
        body: 'Hold this button, or hold `C`, to flash back to the untouched source.',
    },
    {
        chapter: 'Canvas tools',
        target: 'segmentation-view',
        reveal: 'canvas',
        needs: 'encode',
        title: 'Segmentation view',
        body: 'Shows how the last encode cut the image into tiles - the quickest way to understand what the Segmentation sliders do.',
    },

    // --- layers & masks ---
    {
        chapter: 'Layers & masks',
        target: 'dock',
        reveal: 'dock-layers',
        needs: 'image',
        title: 'The Layers & Masks dock',
        body: 'A Photoshop-style layer stack and a library of saved masks. Collapse it to a pill when you want the whole image.',
    },
    {
        chapter: 'Layers & masks',
        target: 'layer-list',
        reveal: 'dock-layers',
        needs: 'image',
        title: 'The stack',
        body: 'Background is your image, locked visible - unlock it and hide its eye to composite over transparency. Every encode is a layer above it. Click a layer to make it active, double-click to rename, drag to reorder, Alt-click an eye to show only that layer.',
    },
    {
        chapter: 'Layers & masks',
        target: 'layer-blend',
        reveal: 'dock-layers',
        needs: 'image',
        title: 'Blend mode and opacity',
        body: 'All 20 Photoshop blend modes - Screen, Overlay, Color Dodge, Difference, Hue, Luminosity… - and opacity, applied when the stack is composited. Retune a glitch long after encoding, without re-running the codec.',
    },
    {
        chapter: 'Layers & masks',
        target: 'layer-footer',
        reveal: 'dock-layers',
        needs: 'image',
        title: 'Effects and adjustment layers',
        body: 'fx adds an effect to the active layer: levels, hue/saturation, posterize, threshold, blur, unsharp mask, noise, mosaic, vignette, RGB split, scanlines, pixel sort, slice shift. ◐ adds an adjustment layer that processes everything below it. Then: mask from selection, merge down, duplicate, delete.',
    },
    {
        chapter: 'Layers & masks',
        target: 'layer-properties',
        reveal: 'dock-layers',
        needs: 'image',
        title: 'Layer properties',
        body: 'For the active layer: its mask (set from the selection, edit it as a selection, invert, remove), its transform (exact X, Y, scale, rotation, flips, reset) and its effect stack - toggle, reorder, retune or reroll any effect. All non-destructive.',
    },
    {
        chapter: 'Layers & masks',
        target: 'dock',
        reveal: 'dock-masks',
        needs: 'image',
        title: 'Masks library',
        body: 'Save a selection, or import any image as a mask. Masks stay in this browser across images and projects: click one to select it, add / subtract / intersect it with the selection, use it as the active layer’s mask, or place it again - sized, rotated, moved or repeated.',
    },

    // --- finishing touches ---
    {
        chapter: 'Finishing touches',
        target: 'adjustments',
        reveal: 'sidebar-global',
        needs: 'encode',
        title: 'Adjustments',
        body: 'Live hue, saturation, brightness and contrast over the whole result - baked into PNG saves and copies. For per-layer post-processing, use the layer effects and adjustment layers you just saw.',
    },
    {
        chapter: 'Finishing touches',
        target: 'tileset',
        reveal: 'sidebar-global',
        needs: 'encode',
        title: 'Tileset and animation',
        body: 'Slice the result into 8-256 px tiles (ZIP), build a spritesheet arranged by color, brightness, saturation, shape or similarity - with a JSON of each tile’s color and shape values for pattern generators - or render a GIF / WebM animation. Tip: Image → Canvas size → Trim to tiles first.',
    },

    // --- wrap-up ---
    {
        chapter: 'That’s it',
        title: 'Your first piece',
        body: 'A good loop: pick a preset → `E` → select an area → `R` → blend, mask and fx the layers → File → Save, then Export. Hover anything you are unsure about, and find this tour again under Help.',
    },
];

const CHAPTER_STARTS = STEPS.map((s, i) => (i === 0 || STEPS[i - 1].chapter !== s.chapter ? i : -1)).filter(i => i >= 0);

interface Box {
    left: number;
    top: number;
    width: number;
    height: number;
}

const sameBox = (a: Box | null, b: Box | null) =>
    a === b ||
    (!!a &&
        !!b &&
        Math.abs(a.left - b.left) < 0.5 &&
        Math.abs(a.top - b.top) < 0.5 &&
        Math.abs(a.width - b.width) < 0.5 &&
        Math.abs(a.height - b.height) < 0.5);

/** the first named target that is rendered - it may still need scrolling into view */
const findTarget = (step: TourStep): HTMLElement | null => {
    const names = step.target === undefined ? [] : Array.isArray(step.target) ? step.target : [step.target];
    for (const name of names) {
        const el = document.querySelector<HTMLElement>(`[data-tour="${name}"]`);
        const r = el?.getBoundingClientRect();
        if (el && r && r.width > 0 && r.height > 0) return el;
    }
    return null;
};

/** the part of the element actually on screen: clipped by scrolling ancestors and the viewport */
const visibleBox = (el: HTMLElement): Box | null => {
    const r = el.getBoundingClientRect();
    let left = Math.max(r.left, 0);
    let top = Math.max(r.top, 0);
    let right = Math.min(r.right, window.innerWidth);
    let bottom = Math.min(r.bottom, window.innerHeight);
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const { overflowX, overflowY } = getComputedStyle(p);
        if (overflowX === 'visible' && overflowY === 'visible') continue;
        const c = p.getBoundingClientRect();
        left = Math.max(left, c.left);
        top = Math.max(top, c.top);
        right = Math.min(right, c.right);
        bottom = Math.min(bottom, c.bottom);
    }
    if (right - left < 4 || bottom - top < 4) return null;
    return { left, top, width: right - left, height: bottom - top };
};

/** popover position: below, above, right or left of the target, else pinned to the bottom */
const placePopover = (box: Box | null, w: number, h: number) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const m = 12;
    const gap = 14;
    const clampX = (x: number) => Math.max(m, Math.min(x, vw - w - m));
    const clampY = (y: number) => Math.max(m, Math.min(y, vh - h - m));
    if (!box) return { left: clampX((vw - w) / 2), top: clampY((vh - h) / 2) };
    const right = box.left + box.width;
    const bottom = box.top + box.height;
    const cx = clampX(box.left + box.width / 2 - w / 2);
    const cy = clampY(box.top + box.height / 2 - h / 2);
    if (bottom + gap + h <= vh - m) return { left: cx, top: bottom + gap };
    if (box.top - gap - h >= m) return { left: cx, top: box.top - gap - h };
    if (right + gap + w <= vw - m) return { left: right + gap, top: cy };
    if (box.left - gap - w >= m) return { left: box.left - gap - w, top: cy };
    return { left: cx, top: vh - h - m };
};

/** body text with `backticks` rendered as keys */
const Body: React.FC<{ text: string }> = ({ text }) => (
    <>
        {text.split(/`([^`]+)`/).map((part, i) =>
            i % 2 ? (
                <kbd key={i} className="px-1 py-px bg-cream-3 border border-ink/50 rounded text-[10px] font-mono text-ink whitespace-nowrap">
                    {part}
                </kbd>
            ) : (
                <React.Fragment key={i}>{part}</React.Fragment>
            )
        )}
    </>
);

export const Tour: React.FC = () => {
    const { originalImage, processed, isProcessing, loadImage, encodeNow } = useApp();
    const [index, setIndex] = useState<number | null>(null);
    const [box, setBox] = useState<Box | null>(null);
    const [popH, setPopH] = useState(220);
    const popRef = useRef<HTMLDivElement>(null);

    const open = useCallback(() => setIndex(0), []);

    const close = useCallback(() => {
        try {
            localStorage.setItem(SEEN_KEY, '1');
        } catch {
            // storage unavailable - the tour will simply offer itself again
        }
        setIndex(null);
        setBox(null);
    }, []);

    const goTo = useCallback(
        (i: number) => {
            if (i >= STEPS.length) close();
            else setIndex(Math.max(0, i));
        },
        [close]
    );

    // the tour is for the editor: a first visit that lands on the gallery waits until the editor shows
    const onEditor = useRoute().name === 'editor';

    // manual start + first-run auto start
    useEffect(() => {
        window.addEventListener(START_TOUR_EVENT, open);
        let seen = true;
        try {
            seen = localStorage.getItem(SEEN_KEY) === '1';
        } catch {
            seen = true;
        }
        // phones get the use-a-bigger-screen notice instead; the tour stays one tap away in Help
        const t = seen || !onEditor || isPhoneWidth() ? null : window.setTimeout(open, 600);
        return () => {
            window.removeEventListener(START_TOUR_EVENT, open);
            if (t) window.clearTimeout(t);
        };
    }, [open, onEditor]);

    // reveal the step's target, scroll it into view once, then follow it every frame
    useEffect(() => {
        if (index === null) return;
        const step = STEPS[index];
        if (step.reveal) revealForTour(step.reveal);
        let scrolledTo: HTMLElement | null = null;
        let raf = 0;
        const tick = () => {
            const el = findTarget(step);
            if (el && el !== scrolledTo) {
                el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
                scrolledTo = el;
            }
            const next = el && visibleBox(el);
            setBox(prev => (sameBox(prev, next) ? prev : next));
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [index]);

    // the popover's height decides where it fits
    useEffect(() => {
        const el = popRef.current;
        if (!el) return;
        const ro = new ResizeObserver(() => setPopH(el.offsetHeight));
        ro.observe(el);
        return () => ro.disconnect();
    }, [index]);

    // the tour is modal: arrows / Enter / Esc drive it, and no key reaches the app behind it
    useEffect(() => {
        if (index === null) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Tab') return;
            e.stopImmediatePropagation();
            if (e.key === 'Escape') close();
            else if (e.key === 'ArrowRight' || e.key === 'Enter') goTo(index + 1);
            else if (e.key === 'ArrowLeft') goTo(index - 1);
            else return;
            e.preventDefault();
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [index, goTo, close]);

    if (index === null) return null;

    const step = STEPS[index];
    const total = STEPS.length;
    const hasTarget = step.target !== undefined;
    const missing = hasTarget && !box;
    const chapterNo = CHAPTER_STARTS.filter(s => s <= index).length;
    const nextChapter = CHAPTER_STARTS.find(s => s > index);

    // what the step can do for the user: open something to look at, or run the first encode
    const wants = step.offer ?? (missing ? step.needs : undefined);
    const offer =
        wants === 'sample' || (wants && !originalImage)
            ? !originalImage && { label: 'Load a sample image', run: () => loadImage(makeSampleImage()) }
            : wants === 'encode' && !processed
              ? { label: isProcessing ? 'Encoding…' : 'Encode it for me', run: () => void encodeNow() }
              : null;
    const waitingFor =
        missing && step.needs === 'encode' && originalImage
            ? 'This appears after the first encode.'
            : missing && step.needs
              ? 'This appears once an image is open.'
              : null;

    const popW = Math.min(320, window.innerWidth - 24);
    const pos = placePopover(box, popW, popH);
    const pad = 6;

    return (
        <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true" aria-label="Guided tour">
            {box ? (
                // spotlight: the shadow dims everything except the target
                <div
                    className="absolute rounded-xl border-2 border-glx-orange transition-all duration-200 pointer-events-none"
                    style={{
                        left: box.left - pad,
                        top: box.top - pad,
                        width: box.width + pad * 2,
                        height: box.height + pad * 2,
                        boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.65)',
                    }}
                />
            ) : (
                <div className="absolute inset-0 bg-black/65 pointer-events-none" />
            )}

            <div
                ref={popRef}
                className="absolute bg-cream-2 border border-ink rounded-xl shadow-2xl shadow-black/60 p-4 transition-[left,top] duration-200"
                style={{ left: pos.left, top: pos.top, width: popW }}
            >
                <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-ink-2">
                        {chapterNo}. {step.chapter}
                    </span>
                    <button onClick={close} className="text-ink-2 hover:text-ink flex-shrink-0" title="Close tour (Esc)">
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <h3 className="text-sm font-bold text-ink mb-1.5">{step.title}</h3>
                <p className="text-xs leading-relaxed text-ink-2">
                    <Body text={step.body} />
                </p>
                {waitingFor && <p className="mt-2 text-[11px] italic text-ink-2">{waitingFor}</p>}
                {offer && (
                    <button
                        onClick={offer.run}
                        disabled={isProcessing}
                        className="mt-3 w-full py-1.5 text-[11px] font-bold rounded-md bg-glx-orange hover:brightness-105 disabled:opacity-60 text-ink border border-ink transition-all"
                    >
                        {offer.label}
                    </button>
                )}

                <div className="mt-3 h-1 rounded-full bg-cream-3 overflow-hidden">
                    <div className="h-full bg-glx-green transition-all duration-200" style={{ width: `${((index + 1) / total) * 100}%` }} />
                </div>

                <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-[10px] text-ink-2 font-mono">
                        {index + 1} / {total}
                    </span>
                    <div className="flex items-center gap-1.5">
                        {nextChapter !== undefined && index > 0 && (
                            <button
                                onClick={() => goTo(nextChapter)}
                                className="px-1.5 py-1 text-[11px] text-ink-2 hover:text-ink transition-colors"
                                title="Skip to the next part"
                            >
                                Skip part
                            </button>
                        )}
                        {index > 0 && (
                            <button
                                onClick={() => goTo(index - 1)}
                                className="px-2.5 py-1 text-[11px] rounded-md bg-cream-3 hover:bg-white text-ink border border-ink/40 transition-colors"
                            >
                                Back
                            </button>
                        )}
                        <button
                            onClick={() => goTo(index + 1)}
                            className="px-2.5 py-1 text-[11px] font-bold rounded-md bg-glx-green hover:brightness-105 text-ink border border-ink transition-colors"
                        >
                            {index === 0 ? 'Start' : index + 1 === total ? 'Done' : 'Next'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
