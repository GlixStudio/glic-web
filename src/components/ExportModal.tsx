import React, { useState } from 'react';
import JSZip from 'jszip';
import { useApp } from '../core/AppContext';
import { imageDataToCanvas, downloadBlob, timestampedFilename } from '../core/imageio';
import { maskToImageData } from '../core/selection';
import { resampleImage, type ResampleMethod } from '../core/resize';
import { setPngDpi, setJpegDpi, maskBounds, cropImage, applyMaskAlpha, printSize } from '../core/exportImage';
import { compositeLayers } from '../core/layers';
import { HELP } from '../core/help';
import { Modal, ModalButton, Segmented } from './controls/Modal';
import { Select } from './controls/Select';
import { Slider } from './controls/Slider';
import { Toggle } from './controls/Toggle';
import { MaybeTooltip } from './controls/Tooltip';

type Content = 'composite' | 'layer' | 'source' | 'mask' | 'layers-zip';
type Format = 'png' | 'jpeg' | 'webp';

const MIME: Record<Format, string> = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' };
const EXT: Record<Format, string> = { png: 'png', jpeg: 'jpg', webp: 'webp' };
// Chrome's canvas limit is ~16384 per side / 268M pixels
const MAX_SIDE = 16384;
const MAX_AREA = 268_000_000;

const toBytes = (canvas: HTMLCanvasElement, fmt: Format, quality: number): Promise<Uint8Array> =>
    new Promise((resolve, reject) =>
        canvas.toBlob(
            b => (b ? b.arrayBuffer().then(a => resolve(new Uint8Array(a)), reject) : reject(new Error('encoding failed'))),
            MIME[fmt],
            fmt === 'png' ? undefined : quality / 100
        )
    );

export const ExportModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const { processed, originalImage, layers, activeLayerId, selection, filters, toast } = useApp();
    const hasLayers = layers.length > 0;
    const [content, setContent] = useState<Content>(hasLayers ? 'composite' : 'source');
    const [format, setFormat] = useState<Format>('png');
    const [quality, setQuality] = useState(92);
    const [scale, setScale] = useState(1);
    const [method, setMethod] = useState<ResampleMethod>('nearest');
    const [dpi, setDpi] = useState(300);
    const [adjust, setAdjust] = useState(true);
    const [crop, setCrop] = useState(false);
    const [alpha, setAlpha] = useState(false);
    const [name, setName] = useState('glic-export');
    const [busy, setBusy] = useState(false);

    const src = originalImage!;
    const bounds = selection ? maskBounds(selection, src.width, src.height) : null;
    const baseW = crop && bounds ? bounds.w : src.width;
    const baseH = crop && bounds ? bounds.h : src.height;
    const outW = baseW * scale;
    const outH = baseH * scale;
    const tooBig = outW > MAX_SIDE || outH > MAX_SIDE || outW * outH > MAX_AREA;
    const isZip = content === 'layers-zip';
    const size = printSize(outW, dpi);
    const sizeH = printSize(outH, dpi);

    /** content -> adjusted -> cropped -> alpha -> scaled ImageData */
    const render = (img: ImageData, isMask = false): ImageData => {
        let out = img;
        if (adjust && !isMask) {
            const c = imageDataToCanvas(out, filters);
            out = c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height);
        }
        let mask = alpha && selection && !isMask ? selection : null;
        if (crop && bounds) {
            out = cropImage(out, bounds.x, bounds.y, bounds.w, bounds.h);
            if (mask) {
                const m = new Uint8ClampedArray(bounds.w * bounds.h);
                for (let y = 0; y < bounds.h; y++) m.set(mask.subarray((bounds.y + y) * src.width + bounds.x, (bounds.y + y) * src.width + bounds.x + bounds.w), y * bounds.w);
                mask = m;
            }
        }
        if (mask) out = applyMaskAlpha(out, mask);
        return scale === 1 ? out : resampleImage(out, out.width * scale, out.height * scale, method);
    };

    const encode = async (img: ImageData): Promise<Uint8Array> => {
        const fmt: Format = isZip ? 'png' : format;
        let bytes = await toBytes(imageDataToCanvas(img), fmt, quality);
        if (fmt === 'png') bytes = setPngDpi(bytes, dpi);
        if (fmt === 'jpeg') bytes = setJpegDpi(bytes, dpi);
        return bytes;
    };

    const run = async () => {
        setBusy(true);
        // let the busy state paint before the heavy synchronous work
        await new Promise(r => setTimeout(r, 30));
        try {
            const base = name.trim() || 'glic-export';
            if (isZip) {
                const zip = new JSZip();
                zip.file('source.png', await encode(render(src)));
                if (processed) zip.file('composite.png', await encode(render(processed)));
                for (let i = 0; i < layers.length; i++) {
                    const l = layers[i];
                    const tag = `${String(i + 1).padStart(2, '0')}-${l.name.replace(/[^\w-]+/g, '_')}`;
                    // the layer on its own over the source, and its raw full-frame render
                    zip.file(`layers/${tag}.png`, await encode(render(compositeLayers(src, [{ ...l, visible: true }]))));
                    zip.file(`layers/${tag}-raw.png`, await encode(render(l.result)));
                    if (l.mask) zip.file(`layers/${tag}-mask.png`, await encode(render(maskToImageData(l.mask, src.width, src.height), true)));
                }
                downloadBlob(await zip.generateAsync({ type: 'blob' }), timestampedFilename(`${base}-layers`, 'zip'));
            } else {
                let img: ImageData;
                let isMask = false;
                if (content === 'composite') img = processed ?? src;
                else if (content === 'layer') img = layers.find(l => l.id === activeLayerId)?.result ?? src;
                else if (content === 'mask') {
                    img = maskToImageData(selection!, src.width, src.height);
                    isMask = true;
                } else img = src;
                const bytes = await encode(render(img, isMask));
                downloadBlob(new Blob([bytes.buffer as ArrayBuffer], { type: MIME[format] }), timestampedFilename(base, EXT[format]));
            }
            toast('success', `Exported ${outW}×${outH}${dpi ? ` at ${dpi} DPI` : ''}`);
            onClose();
        } catch (e) {
            toast('error', `Export failed: ${(e as Error).message}`);
        } finally {
            setBusy(false);
        }
    };

    const contentOptions: { label: string; value: Content }[] = [
        ...(hasLayers ? [{ label: 'Composite (what you see)', value: 'composite' as const }] : []),
        ...(hasLayers ? [{ label: 'Active layer, full frame', value: 'layer' as const }] : []),
        { label: 'Source image', value: 'source' },
        ...(selection ? [{ label: 'Selection mask (grayscale)', value: 'mask' as const }] : []),
        ...(hasLayers ? [{ label: 'Everything as ZIP (layers, masks, composite)', value: 'layers-zip' as const }] : []),
    ];

    return (
        <Modal
            title="Export"
            onClose={onClose}
            footer={
                <>
                    <ModalButton onClick={onClose}>Cancel</ModalButton>
                    <ModalButton primary disabled={busy || tooBig} onClick={run}>
                        {busy ? 'Exporting…' : 'Export'}
                    </ModalButton>
                </>
            }
        >
            <div className="space-y-3 text-ink">
                <Select label="What" value={content} options={contentOptions} onChange={setContent} />
                {!isZip && (
                    <div>
                        <div className="text-[10px] font-bold text-ink-2 uppercase tracking-wider mb-1">Format</div>
                        <Segmented<Format>
                            value={format}
                            onChange={setFormat}
                            options={[
                                { value: 'png', label: 'PNG', title: 'Lossless, supports transparency and DPI' },
                                { value: 'jpeg', label: 'JPEG', title: 'Small files, no transparency' },
                                { value: 'webp', label: 'WebP', title: 'Small files with transparency, no DPI' },
                            ]}
                        />
                    </div>
                )}
                {!isZip && format !== 'png' && <Slider label="Quality" value={quality} min={40} max={100} onChange={setQuality} format={v => `${v}%`} />}
                <div className="grid grid-cols-2 gap-3">
                    <MaybeTooltip help={HELP.exportScale}>
                        <div>
                            <Select
                                label="Scale"
                                value={scale}
                                options={[1, 2, 3, 4, 6, 8].map(v => ({ label: `${v}×`, value: v }))}
                                onChange={setScale}
                            />
                        </div>
                    </MaybeTooltip>
                    <MaybeTooltip help={HELP.exportDpi}>
                        <div>
                            <Select
                                label="DPI"
                                value={dpi}
                                options={[72, 150, 240, 300, 600, 1200].map(v => ({ label: `${v}`, value: v }))}
                                onChange={setDpi}
                            />
                        </div>
                    </MaybeTooltip>
                </div>
                {scale > 1 && (
                    <Segmented<ResampleMethod>
                        value={method}
                        onChange={setMethod}
                        options={[
                            { value: 'nearest', label: 'Crisp pixels' },
                            { value: 'smooth', label: 'Smooth' },
                        ]}
                    />
                )}
                {content !== 'mask' && content !== 'source' && <Toggle label="Apply adjustments" checked={adjust} onChange={setAdjust} />}
                {selection && bounds && content !== 'mask' && (
                    <>
                        <Toggle label="Crop to selection" help={HELP.exportCrop} checked={crop} onChange={setCrop} />
                        {(isZip || format !== 'jpeg') && (
                            <Toggle label="Selection as transparency" help={HELP.exportAlpha} checked={alpha} onChange={setAlpha} />
                        )}
                    </>
                )}
                <label className="block text-[10px] text-ink-2 font-bold uppercase tracking-wider">
                    File name
                    <input
                        value={name}
                        onChange={e => setName(e.target.value)}
                        className="mt-1 w-full bg-cream-2 border border-ink text-ink text-[12px] rounded px-2 py-1 focus:outline-none focus:border-glx-orange normal-case font-normal"
                    />
                </label>
                <div className="rounded-md border border-line bg-cream-2 px-3 py-2 text-[11px] font-mono">
                    {outW} × {outH} px · {size.cm.toFixed(1)} × {sizeH.cm.toFixed(1)} cm · {size.inches.toFixed(2)} × {sizeH.inches.toFixed(2)} in @ {dpi} DPI
                    {!isZip && format === 'webp' && <div className="text-ink-2">WebP files carry no DPI - set it in your print tool.</div>}
                    {tooBig && <div className="text-red-700">Too large for the browser to encode - lower the scale.</div>}
                </div>
            </div>
        </Modal>
    );
};

