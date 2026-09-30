import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../core/AppContext';
import { INCOMING_IMAGE_EVENT, imageFileFrom, openIncomingImage, type IncomingImage } from '../core/incomingImage';
import { fileToImageData, imageDataToThumbnail } from '../core/imageio';
import { Modal, ModalButton } from './controls/Modal';
import { Layers, ImagePlus } from 'lucide-react';

const isEditable = (t: EventTarget | null) =>
    t instanceof HTMLElement && (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable);

/** Decides where an arriving image goes, and turns ⌘V into an arriving image. */
export const IncomingImageHost: React.FC = () => {
    const { originalImage, loadImage, placeImageAsLayer, toast } = useApp();
    const [req, setReq] = useState<IncomingImage | null>(null);

    useEffect(() => {
        const on = (e: Event) => {
            const r = (e as CustomEvent<IncomingImage>).detail;
            if (!originalImage) loadImage(r.image);
            else setReq(r);
        };
        window.addEventListener(INCOMING_IMAGE_EVENT, on);
        return () => window.removeEventListener(INCOMING_IMAGE_EVENT, on);
    }, [originalImage, loadImage]);

    // ⌘V / Ctrl+V anywhere outside a text field
    useEffect(() => {
        const onPaste = async (e: ClipboardEvent) => {
            if (isEditable(e.target)) return;
            const file = imageFileFrom(e.clipboardData?.items);
            if (!file) {
                if (e.clipboardData?.types.length) toast('info', 'The clipboard has no image to paste');
                return;
            }
            e.preventDefault();
            try {
                openIncomingImage({ image: await fileToImageData(file), name: 'Pasted', via: 'paste' });
            } catch {
                toast('error', 'Could not read the pasted image');
            }
        };
        window.addEventListener('paste', onPaste);
        return () => window.removeEventListener('paste', onPaste);
    }, [toast]);

    const close = useCallback(() => setReq(null), []);
    const thumb = useMemo(() => (req ? imageDataToThumbnail(req.image, null, 160) : null), [req]);
    if (!req || !originalImage) return null;

    const asLayer = () => {
        placeImageAsLayer(req.image, req.via === 'paste' ? 'Pasted' : req.name);
        close();
    };
    const asNew = () => {
        loadImage(req.image);
        close();
    };
    const bigger = req.image.width > originalImage.width || req.image.height > originalImage.height;

    return (
        <Modal
            title={req.via === 'paste' ? 'Paste image' : 'Add image'}
            onClose={close}
            footer={
                <>
                    <ModalButton onClick={close}>Cancel</ModalButton>
                    <ModalButton onClick={asNew}>
                        <span className="flex items-center gap-1.5">
                            <ImagePlus className="w-3.5 h-3.5" /> Open as new image
                        </span>
                    </ModalButton>
                    <ModalButton onClick={asLayer} primary>
                        <span className="flex items-center gap-1.5">
                            <Layers className="w-3.5 h-3.5" /> Place as layer
                        </span>
                    </ModalButton>
                </>
            }
        >
            <div className="flex gap-3 items-start">
                {thumb && <img src={thumb} alt="" className="w-24 h-24 object-contain rounded border border-ink bg-stage flex-shrink-0" />}
                <div className="text-[12px] text-ink-2 leading-relaxed space-y-1.5">
                    <p>
                        <b className="text-ink">{req.name}</b> · {req.image.width} × {req.image.height}
                    </p>
                    <p>
                        <b className="text-ink">Place as layer</b> puts it above the active layer on this {originalImage.width} ×{' '}
                        {originalImage.height} canvas, centred{bigger ? ' and shrunk to fit' : ' at its own size'} - move, scale
                        and rotate it with the Move tool (V).
                    </p>
                    <p>
                        <b className="text-ink">Open as new image</b> starts over with it (unsaved layers are lost).
                    </p>
                </div>
            </div>
        </Modal>
    );
};
