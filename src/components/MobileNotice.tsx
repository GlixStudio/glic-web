import React, { useState } from 'react';
import { Monitor, Tablet } from 'lucide-react';
import { isPhoneWidth } from '../core/viewport';

const SEEN_KEY = 'glic_mobile_notice_v1';

const alreadySeen = () => {
    try {
        return localStorage.getItem(SEEN_KEY) === '1';
    } catch {
        return false;
    }
};

/** once per browser on phone-sized screens: the app is built for desktop and tablet */
export const MobileNotice: React.FC = () => {
    const [open, setOpen] = useState(() => isPhoneWidth() && !alreadySeen());
    if (!open) return null;

    const dismiss = () => {
        try {
            localStorage.setItem(SEEN_KEY, '1');
        } catch {
            /* private mode: it just shows again next time */
        }
        setOpen(false);
    };

    return (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-3">
            <div role="dialog" aria-label="Best on a bigger screen" className="w-full max-w-sm bg-cream border border-ink rounded-xl shadow-2xl p-5 space-y-3">
                <div className="flex items-center gap-2 text-ink">
                    <Monitor className="w-5 h-5" />
                    <Tablet className="w-4 h-4" />
                    <h2 className="text-sm font-black uppercase tracking-wider">Best on a bigger screen</h2>
                </div>
                <p className="text-[13px] leading-relaxed text-ink">
                    GLIC Web is a full glitch editor - per-channel codec settings, layers, masks and selection tools - and it is
                    made for a <b>desktop</b> or a <b>tablet</b>.
                </p>
                <p className="text-[12px] leading-relaxed text-ink-2">
                    On a phone it works for quick experiments: load an image, open the controls with the panel button (top left), pick a preset and tap
                    ENCODE. Pinch to zoom, two fingers to pan. Everything stays on your device.
                </p>
                <button
                    onClick={dismiss}
                    className="w-full py-2.5 rounded-lg font-bold text-sm bg-glx-green border border-ink text-ink shadow-[2px_2px_0_0_rgba(22,21,15,0.9)] active:shadow-none"
                >
                    Continue on this phone
                </button>
            </div>
        </div>
    );
};
