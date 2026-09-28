import React, { useState } from 'react';
import { useApp } from '../core/AppContext';
import { MAX_DIMENSION, type Anchor, type ResampleMethod } from '../core/resize';
import { HELP } from '../core/help';
import { Modal, ModalButton, Segmented } from './controls/Modal';
import { MaybeTooltip } from './controls/Tooltip';
import { Link2, Link2Off } from 'lucide-react';

const NumField: React.FC<{ label: string; value: number; onChange: (v: number) => void; suffix?: string }> = ({
    label,
    value,
    onChange,
    suffix,
}) => (
    <label className="block text-[10px] text-ink-2 font-bold uppercase tracking-wider">
        {label}
        <div className="mt-1 flex items-center gap-1">
            <input
                type="number"
                min={1}
                value={Number.isFinite(value) ? value : ''}
                onChange={e => onChange(Number(e.target.value))}
                className="w-full bg-cream-2 border border-ink text-ink text-[13px] rounded px-2 py-1 font-mono focus:outline-none focus:border-glx-orange"
            />
            {suffix && <span className="text-ink-2 normal-case font-normal">{suffix}</span>}
        </div>
    </label>
);

const validSize = (w: number, h: number) =>
    Number.isInteger(w) && Number.isInteger(h) && w >= 1 && h >= 1 && w <= MAX_DIMENSION && h <= MAX_DIMENSION;

const SizeError: React.FC<{ w: number; h: number }> = ({ w, h }) =>
    validSize(w, h) ? null : (
        <p className="text-[11px] text-red-700">Use whole numbers from 1 to {MAX_DIMENSION} px.</p>
    );

const streamsNote = 'Layers keep their glitches; their .glic streams are dropped (re-encode to save .glic again). Undo restores the old size.';

export const ImageSizeModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const { originalImage, resizeImage } = useApp();
    const W = originalImage!.width;
    const H = originalImage!.height;
    const [w, setW] = useState(W);
    const [h, setH] = useState(H);
    const [lock, setLock] = useState(true);
    const [method, setMethod] = useState<ResampleMethod>('smooth');

    const setWidth = (v: number) => {
        setW(v);
        if (lock) setH(Math.max(1, Math.round((v * H) / W)));
    };
    const setHeight = (v: number) => {
        setH(v);
        if (lock) setW(Math.max(1, Math.round((v * W) / H)));
    };
    const pct = (p: number) => {
        setW(Math.max(1, Math.round((W * p) / 100)));
        setH(Math.max(1, Math.round((H * p) / 100)));
    };
    const ok = validSize(w, h) && (w !== W || h !== H);

    return (
        <Modal
            title="Image size"
            onClose={onClose}
            footer={
                <>
                    <ModalButton onClick={onClose}>Cancel</ModalButton>
                    <ModalButton
                        primary
                        disabled={!ok}
                        onClick={() => {
                            resizeImage(w, h, method);
                            onClose();
                        }}
                    >
                        Resize
                    </ModalButton>
                </>
            }
        >
            <div className="space-y-3 text-ink">
                <p className="text-[11px] text-ink-2">
                    Scales the image, every layer and every mask. Currently {W}×{H}.
                </p>
                <div className="flex items-end gap-2">
                    <NumField label="Width" value={w} onChange={setWidth} suffix="px" />
                    <button
                        onClick={() => setLock(l => !l)}
                        title={lock ? 'Proportions locked' : 'Proportions free'}
                        className={`mb-0.5 p-1.5 rounded-md border border-ink ${lock ? 'bg-glx-orange' : 'bg-cream-2'}`}
                    >
                        {lock ? <Link2 className="w-4 h-4" /> : <Link2Off className="w-4 h-4" />}
                    </button>
                    <NumField label="Height" value={h} onChange={setHeight} suffix="px" />
                </div>
                <div className="flex gap-1.5">
                    {[25, 50, 200, 400].map(p => (
                        <button key={p} onClick={() => pct(p)} className="flex-1 py-1 rounded border border-ink bg-cream-2 hover:bg-white text-[11px] font-bold">
                            {p}%
                        </button>
                    ))}
                </div>
                <MaybeTooltip help={HELP.resample}>
                    <div>
                        <div className="text-[10px] font-bold text-ink-2 uppercase tracking-wider mb-1">Resampling</div>
                        <Segmented<ResampleMethod>
                            value={method}
                            onChange={setMethod}
                            options={[
                                { value: 'smooth', label: 'Smooth', title: 'Averages when shrinking, blends when enlarging' },
                                { value: 'nearest', label: 'Crisp pixels', title: 'Keeps hard pixel edges' },
                            ]}
                        />
                    </div>
                </MaybeTooltip>
                <SizeError w={w} h={h} />
                <p className="text-[10px] text-ink-2">
                    At 300 DPI: {((w / 300) * 2.54).toFixed(1)} × {((h / 300) * 2.54).toFixed(1)} cm. {streamsNote}
                </p>
            </div>
        </Modal>
    );
};

const ANCHORS: Anchor[] = [0, 0.5, 1].flatMap(y => [0, 0.5, 1].map(x => ({ x, y }) as Anchor));

type FillKind = 'transparent' | 'white' | 'black' | 'custom';

export const CanvasSizeModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const { originalImage, resizeCanvas } = useApp();
    const W = originalImage!.width;
    const H = originalImage!.height;
    const [w, setW] = useState(W);
    const [h, setH] = useState(H);
    const [anchor, setAnchor] = useState<Anchor>({ x: 0.5, y: 0.5 });
    const [fill, setFill] = useState<FillKind>('transparent');
    const [custom, setCustom] = useState('#808080');

    const fillRgba = (): [number, number, number, number] => {
        if (fill === 'white') return [255, 255, 255, 255];
        if (fill === 'black') return [0, 0, 0, 255];
        if (fill === 'custom') return [1, 3, 5].map(i => parseInt(custom.slice(i, i + 2), 16)).concat(255) as [number, number, number, number];
        return [0, 0, 0, 0];
    };
    const snap = (m: number) => {
        setW(Math.max(m, Math.floor(W / m) * m));
        setH(Math.max(m, Math.floor(H / m) * m));
    };
    const ok = validSize(w, h) && (w !== W || h !== H);

    return (
        <Modal
            title="Canvas size"
            onClose={onClose}
            footer={
                <>
                    <ModalButton onClick={onClose}>Cancel</ModalButton>
                    <ModalButton
                        primary
                        disabled={!ok}
                        onClick={() => {
                            resizeCanvas(w, h, anchor, fillRgba());
                            onClose();
                        }}
                    >
                        Apply
                    </ModalButton>
                </>
            }
        >
            <div className="space-y-3 text-ink">
                <p className="text-[11px] text-ink-2">
                    Crops or extends the canvas without scaling. Currently {W}×{H}.
                </p>
                <div className="flex gap-2">
                    <NumField label="Width" value={w} onChange={setW} suffix="px" />
                    <NumField label="Height" value={h} onChange={setH} suffix="px" />
                </div>
                <MaybeTooltip help={HELP.snapTiles}>
                    <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-ink-2 font-bold uppercase tracking-wider mr-1">Trim to tiles</span>
                        {[8, 16, 32, 64].map(m => (
                            <button key={m} onClick={() => snap(m)} className="flex-1 py-1 rounded border border-ink bg-cream-2 hover:bg-white text-[11px] font-bold">
                                ×{m}
                            </button>
                        ))}
                    </div>
                </MaybeTooltip>
                <div className="flex gap-4 items-start">
                    <MaybeTooltip help={HELP.canvasAnchor}>
                        <div>
                            <div className="text-[10px] font-bold text-ink-2 uppercase tracking-wider mb-1">Anchor</div>
                            <div className="grid grid-cols-3 gap-1 w-24">
                                {ANCHORS.map(a => {
                                    const on = a.x === anchor.x && a.y === anchor.y;
                                    return (
                                        <button
                                            key={`${a.x}-${a.y}`}
                                            onClick={() => setAnchor(a)}
                                            className={`h-7 rounded border border-ink ${on ? 'bg-glx-orange' : 'bg-cream-2 hover:bg-white'}`}
                                            title={`anchor ${a.x * 100}% / ${a.y * 100}%`}
                                        >
                                            {on && <span className="block w-2 h-2 mx-auto rounded-full bg-ink" />}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </MaybeTooltip>
                    <div className="flex-1">
                        <div className="text-[10px] font-bold text-ink-2 uppercase tracking-wider mb-1">New area</div>
                        <Segmented<FillKind>
                            value={fill}
                            onChange={setFill}
                            options={[
                                { value: 'transparent', label: 'Clear' },
                                { value: 'white', label: 'White' },
                                { value: 'black', label: 'Black' },
                                { value: 'custom', label: 'Color' },
                            ]}
                        />
                        {fill === 'custom' && (
                            <input type="color" value={custom} onChange={e => setCustom(e.target.value)} className="mt-2 w-10 h-7 rounded border border-ink" />
                        )}
                    </div>
                </div>
                <SizeError w={w} h={h} />
                <p className="text-[10px] text-ink-2">{streamsNote}</p>
            </div>
        </Modal>
    );
};
