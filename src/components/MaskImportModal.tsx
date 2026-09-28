import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../core/AppContext';
import {
    extractMask,
    placeMask,
    DEFAULT_DEFINITION,
    DEFAULT_PLACEMENT,
    MASK_SOURCES,
    type MaskDefinition,
    type MaskPlacement,
    type MaskFit,
} from '../core/maskImport';
import { combine, feather, type CombineMode } from '../core/selection';
import { MASK_IMPORT_EVENT, type MaskImportRequest } from '../core/maskImportBus';
import { HELP } from '../core/help';
import { Modal, ModalButton, Segmented } from './controls/Modal';
import { Slider } from './controls/Slider';
import { Select } from './controls/Select';
import { Toggle } from './controls/Toggle';
import { MaybeTooltip } from './controls/Tooltip';
import { FlipHorizontal2, FlipVertical2, RotateCcw, RotateCw, Pipette, Undo2 } from 'lucide-react';

const PREVIEW_W = 540;
const PREVIEW_H = 400;
const SOURCE_PREVIEW_MAX = 512;

/** draws ImageData scaled into a new ImageData of the given size */
const scaleImage = (img: ImageData, w: number, h: number): ImageData => {
    if (img.width === w && img.height === h) return img;
    const src = document.createElement('canvas');
    src.width = img.width;
    src.height = img.height;
    src.getContext('2d')!.putImageData(img, 0, 0);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h);
};

const toHex = ([r, g, b]: [number, number, number]) => `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
const fromHex = (h: string): [number, number, number] => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="text-[10px] font-bold text-ink-2 uppercase tracking-wider mb-1">{children}</div>
);

const IconBtn: React.FC<{ title: string; active?: boolean; onClick: () => void; children: React.ReactNode }> = ({
    title,
    active,
    onClick,
    children,
}) => (
    <button
        type="button"
        title={title}
        onClick={onClick}
        className={`p-1.5 rounded-md border border-ink transition-colors ${active ? 'bg-glx-orange' : 'bg-cream-2 hover:bg-white'}`}
    >
        {children}
    </button>
);

const MaskImportDialog: React.FC<{ req: MaskImportRequest; onClose: () => void }> = ({ req, onClose }) => {
    const { originalImage, processed, selection, setSelection, saveMask, toast } = useApp();
    const base = (processed ?? originalImage)!;
    const W = base.width;
    const H = base.height;

    const [def, setDef] = useState<MaskDefinition>(DEFAULT_DEFINITION);
    const [place, setPlace] = useState<MaskPlacement>(DEFAULT_PLACEMENT);
    const [mode, setMode] = useState<CombineMode>('replace');
    const [featherPx, setFeatherPx] = useState(0);
    const [keep, setKeep] = useState(true);
    const [name, setName] = useState(req.name);
    const [maskOnly, setMaskOnly] = useState(false);
    const [picking, setPicking] = useState(false);

    const unit = Math.min(PREVIEW_W / W, PREVIEW_H / H, 1);
    const pw = Math.max(1, Math.round(W * unit));
    const ph = Math.max(1, Math.round(H * unit));

    const bg = useMemo(() => scaleImage(base, pw, ph), [base, pw, ph]);
    const src = req.image;
    const r = Math.min(1, SOURCE_PREVIEW_MAX / Math.max(src.width, src.height));
    const srcSmall = useMemo(
        () => scaleImage(src, Math.max(1, Math.round(src.width * r)), Math.max(1, Math.round(src.height * r))),
        [src, r]
    );
    const maskSmall = useMemo(() => extractMask(srcSmall, def), [srcSmall, def]);
    const preview = useMemo(() => {
        // 'none' fit is in source pixels, so compensate for the downscaled preview source
        const p = place.fit === 'none' ? { ...place, scale: (place.scale * src.width) / srcSmall.width } : place;
        const placed = placeMask(maskSmall, srcSmall.width, srcSmall.height, pw, ph, p, unit);
        return featherPx > 0 ? feather(placed, pw, ph, featherPx * unit) : placed;
    }, [maskSmall, srcSmall, src.width, place, pw, ph, unit, featherPx]);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        const c = canvasRef.current;
        if (!c) return;
        const out = new ImageData(pw, ph);
        const b = bg.data;
        const o = out.data;
        for (let i = 0; i < preview.length; i++) {
            const m = preview[i] / 255;
            const k = i * 4;
            if (maskOnly) {
                o[k] = o[k + 1] = o[k + 2] = preview[i];
            } else {
                // quick-mask style: unselected areas get a red wash
                const t = (1 - m) * 0.6;
                o[k] = b[k] + (255 - b[k]) * t;
                o[k + 1] = b[k + 1] * (1 - t) + 40 * t;
                o[k + 2] = b[k + 2] * (1 - t) + 40 * t;
            }
            o[k + 3] = 255;
        }
        c.getContext('2d')!.putImageData(out, 0, 0);
    }, [bg, preview, pw, ph, maskOnly]);

    const srcCanvasRef = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        srcCanvasRef.current?.getContext('2d')!.putImageData(srcSmall, 0, 0);
    }, [srcSmall]);

    // drag to move, wheel to scale
    const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
    const onPointerDown = (e: React.PointerEvent) => {
        (e.target as Element).setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, y: e.clientY, ox: place.offsetX, oy: place.offsetY };
    };
    const onPointerMove = (e: React.PointerEvent) => {
        const d = drag.current;
        if (!d) return;
        setPlace(p => ({ ...p, offsetX: Math.round(d.ox + (e.clientX - d.x) / unit), offsetY: Math.round(d.oy + (e.clientY - d.y) / unit) }));
    };
    const onWheel = (e: React.WheelEvent) => {
        const f = Math.pow(1.1, -e.deltaY / 100);
        setPlace(p => ({ ...p, scale: Math.min(8, Math.max(0.05, p.scale * f)) }));
    };

    const pickColor = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = Math.floor(((e.clientX - rect.left) / rect.width) * srcSmall.width);
        const y = Math.floor(((e.clientY - rect.top) / rect.height) * srcSmall.height);
        const k = (y * srcSmall.width + x) * 4;
        setDef(d => ({ ...d, source: 'color', color: [srcSmall.data[k], srcSmall.data[k + 1], srcSmall.data[k + 2]] }));
        setPicking(false);
    };

    const apply = () => {
        let mask = placeMask(extractMask(src, def), src.width, src.height, W, H, place);
        if (featherPx > 0) mask = feather(mask, W, H, featherPx);
        setSelection(combine(selection, mask, mode));
        if (keep) saveMask(mask, W, H, name);
        toast('success', keep ? `Mask applied and saved to the library as “${name.trim() || 'Mask'}”` : 'Mask applied to the selection');
        onClose();
    };

    const upd = <K extends keyof MaskDefinition>(k: K, v: MaskDefinition[K]) => setDef(d => ({ ...d, [k]: v }));
    const updP = <K extends keyof MaskPlacement>(k: K, v: MaskPlacement[K]) => setPlace(p => ({ ...p, [k]: v }));

    return (
        <Modal
            title={req.fromLibrary ? `Place mask “${req.name}”` : 'Import mask'}
            onClose={onClose}
            width="max-w-5xl"
            footer={
                <>
                    <span className="mr-auto self-center text-[10px] text-ink-2">
                        Drag the preview to move, scroll to scale. Red = not selected.
                    </span>
                    <ModalButton onClick={onClose}>Cancel</ModalButton>
                    <ModalButton primary onClick={apply}>
                        Apply mask
                    </ModalButton>
                </>
            }
        >
            <div className="flex flex-col lg:flex-row gap-4">
                <div className="flex-shrink-0 space-y-2">
                    <div className="bg-stage rounded-lg p-2 flex items-center justify-center" style={{ minWidth: pw + 16 }}>
                        <canvas
                            ref={canvasRef}
                            width={pw}
                            height={ph}
                            className="cursor-move touch-none"
                            onPointerDown={onPointerDown}
                            onPointerMove={onPointerMove}
                            onPointerUp={() => (drag.current = null)}
                            onWheel={onWheel}
                        />
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-ink-2">
                        <span>
                            canvas {W}×{H} · mask image {src.width}×{src.height}
                        </span>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                            <input type="checkbox" checked={maskOnly} onChange={e => setMaskOnly(e.target.checked)} className="accent-glx-orange" />
                            show mask only
                        </label>
                    </div>
                </div>

                <div className="flex-1 min-w-0 grid sm:grid-cols-2 gap-4 text-ink">
                    {/* definition */}
                    <div className="space-y-2.5">
                        <Label>What counts as selected</Label>
                        <Select label="Mask from" help={HELP.maskSource} value={def.source} options={MASK_SOURCES} onChange={v => upd('source', v)} />
                        {def.source === 'color' && (
                            <div className="space-y-2 rounded-md border border-line p-2">
                                <div className="flex items-center gap-2">
                                    <input
                                        type="color"
                                        value={toHex(def.color)}
                                        onChange={e => upd('color', fromHex(e.target.value))}
                                        className="w-8 h-7 rounded border border-ink bg-cream-2 cursor-pointer"
                                        title="Color to select"
                                    />
                                    <IconBtn title="Pick the color from the mask image" active={picking} onClick={() => setPicking(p => !p)}>
                                        <Pipette className="w-3.5 h-3.5" />
                                    </IconBtn>
                                    <span className="text-[10px] font-mono text-ink-2">{toHex(def.color)}</span>
                                </div>
                                <Slider label="Tolerance" help={HELP.maskTolerance} value={def.tolerance} min={0} max={255} onChange={v => upd('tolerance', v)} />
                                <Slider label="Softness" value={def.softness} min={0} max={128} onChange={v => upd('softness', v)} />
                            </div>
                        )}
                        <MaybeTooltip help={HELP.maskSourceImage}>
                            <div>
                                <div className="text-[10px] text-ink-2 mb-1">{picking ? 'Click a color below' : 'Mask image'}</div>
                                <canvas
                                    ref={srcCanvasRef}
                                    width={srcSmall.width}
                                    height={srcSmall.height}
                                    onClick={picking ? pickColor : undefined}
                                    className={`max-w-full max-h-28 rounded border border-ink bg-[repeating-conic-gradient(#ddd_0%_25%,#fff_0%_50%)] bg-[length:12px_12px] ${
                                        picking ? 'cursor-crosshair ring-2 ring-glx-orange' : ''
                                    }`}
                                />
                            </div>
                        </MaybeTooltip>
                        <Slider label="Black point" help={HELP.maskLevels} value={def.black} min={0} max={254} onChange={v => upd('black', Math.min(v, def.white - 1))} />
                        <Slider label="White point" value={def.white} min={1} max={255} onChange={v => upd('white', Math.max(v, def.black + 1))} />
                        <Toggle label="Hard edge" help={HELP.maskThreshold} checked={def.threshold !== null} onChange={on => upd('threshold', on ? 128 : null)} />
                        {def.threshold !== null && (
                            <Slider label="Threshold" value={def.threshold} min={1} max={255} onChange={v => upd('threshold', v)} />
                        )}
                        <Toggle label="Invert" checked={def.invert} onChange={v => upd('invert', v)} />
                        {def.source !== 'alpha' && (
                            <Toggle label="Transparent = unselected" checked={def.useAlpha} onChange={v => upd('useAlpha', v)} />
                        )}
                    </div>

                    {/* placement + result */}
                    <div className="space-y-2.5">
                        <Label>Size &amp; position</Label>
                        <MaybeTooltip help={HELP.maskFit}>
                            <div>
                                <Segmented<MaskFit>
                                    value={place.fit}
                                    onChange={v => updP('fit', v)}
                                    options={[
                                        { value: 'stretch', label: 'Stretch', title: 'Fill the canvas, ignoring proportions' },
                                        { value: 'contain', label: 'Fit', title: 'Whole mask visible, proportions kept' },
                                        { value: 'cover', label: 'Fill', title: 'Cover the canvas, proportions kept' },
                                        { value: 'none', label: '1:1', title: 'Original pixel size' },
                                    ]}
                                />
                            </div>
                        </MaybeTooltip>
                        <Slider
                            label="Scale"
                            value={Math.round(place.scale * 100)}
                            min={5}
                            max={800}
                            onChange={v => updP('scale', v / 100)}
                            format={v => `${v}%`}
                        />
                        <Slider label="Rotate" value={place.rotation} min={-180} max={180} onChange={v => updP('rotation', v)} format={v => `${v}°`} />
                        <div className="flex items-center gap-1.5">
                            <IconBtn title="Rotate 90° left" onClick={() => updP('rotation', ((place.rotation - 90 + 540) % 360) - 180)}>
                                <RotateCcw className="w-3.5 h-3.5" />
                            </IconBtn>
                            <IconBtn title="Rotate 90° right" onClick={() => updP('rotation', ((place.rotation + 90 + 540) % 360) - 180)}>
                                <RotateCw className="w-3.5 h-3.5" />
                            </IconBtn>
                            <IconBtn title="Flip horizontally" active={place.flipX} onClick={() => updP('flipX', !place.flipX)}>
                                <FlipHorizontal2 className="w-3.5 h-3.5" />
                            </IconBtn>
                            <IconBtn title="Flip vertically" active={place.flipY} onClick={() => updP('flipY', !place.flipY)}>
                                <FlipVertical2 className="w-3.5 h-3.5" />
                            </IconBtn>
                            <IconBtn title="Reset size & position" onClick={() => setPlace(DEFAULT_PLACEMENT)}>
                                <Undo2 className="w-3.5 h-3.5" />
                            </IconBtn>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            {(['offsetX', 'offsetY'] as const).map(k => (
                                <label key={k} className="text-[10px] text-ink-2 font-bold uppercase tracking-wider">
                                    {k === 'offsetX' ? 'Move X' : 'Move Y'} (px)
                                    <input
                                        type="number"
                                        value={place[k]}
                                        onChange={e => updP(k, Math.round(Number(e.target.value) || 0))}
                                        className="mt-1 w-full bg-cream-2 border border-ink text-ink text-[12px] rounded px-2 py-1 font-mono focus:outline-none focus:border-glx-orange"
                                    />
                                </label>
                            ))}
                        </div>
                        <Toggle label="Repeat as pattern" help={HELP.maskTile} checked={place.tile} onChange={v => updP('tile', v)} />

                        <div className="pt-2 border-t border-line space-y-2.5">
                            <Label>Result</Label>
                            <MaybeTooltip help={HELP.combineMode}>
                                <div>
                                    <Segmented<CombineMode>
                                        value={mode}
                                        onChange={setMode}
                                        options={[
                                            { value: 'replace', label: 'Replace' },
                                            { value: 'add', label: 'Add' },
                                            { value: 'subtract', label: 'Subtract' },
                                            { value: 'intersect', label: 'Intersect' },
                                        ]}
                                    />
                                </div>
                            </MaybeTooltip>
                            <Slider label="Feather" value={featherPx} min={0} max={100} onChange={setFeatherPx} format={v => `${v}px`} />
                            <Toggle label="Keep in Masks library" help={HELP.masksPanel} checked={keep} onChange={setKeep} />
                            {keep && (
                                <input
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    placeholder="Mask name"
                                    className="w-full bg-cream-2 border border-ink text-ink text-[12px] rounded px-2 py-1 focus:outline-none focus:border-glx-orange"
                                />
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </Modal>
    );
};

/** Mounted once; opens the dialog when anything calls openMaskImport(). */
export const MaskImportHost: React.FC = () => {
    const { originalImage } = useApp();
    const [req, setReq] = useState<MaskImportRequest | null>(null);
    useEffect(() => {
        const on = (e: Event) => setReq((e as CustomEvent<MaskImportRequest>).detail);
        window.addEventListener(MASK_IMPORT_EVENT, on);
        return () => window.removeEventListener(MASK_IMPORT_EVENT, on);
    }, []);
    const close = useCallback(() => setReq(null), []);
    if (!req || !originalImage) return null;
    return <MaskImportDialog key={req.name + req.image.width} req={req} onClose={close} />;
};
