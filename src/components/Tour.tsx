import React, { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';

// First-run guided tour: spotlights the core workflow step by step.
// Steps target [data-tour] elements; steps whose target is not in the DOM are
// skipped, so the tour adapts to app state (selection tools and layers only
// appear once an image / a layer exists). Auto-runs once per browser
// (localStorage flag) and can be restarted from Help & About.

import { START_TOUR_EVENT } from '../core/tour';

const SEEN_KEY = 'glic_tour_seen_v1';

interface TourStep {
    target: string;
    title: string;
    body: string;
}

const STEPS: TourStep[] = [
    {
        target: 'dropzone',
        title: 'Start with an image',
        body: 'Drop any image here - or a .glic file made with this app or desktop GLIC. Everything stays in your browser at full resolution.',
    },
    {
        target: 'preset',
        title: 'Pick a preset',
        body: '144 complete looks from the GLIC community. Choose one, encode, then tweak. The fastest way to learn what the controls do is to start from a preset you like.',
    },
    {
        target: 'tab-channels',
        title: 'The codec lives here',
        body: 'Segmentation, prediction, wavelets, encoding - the machinery that damages the image. Hover any control for a plain-language explanation of what it does.',
    },
    {
        target: 'encode',
        title: 'Encode',
        body: 'Press ENCODE (or E) to run the codec. Every encode stacks a new layer above your image - Layer 1, Layer 2, … - so nothing is ever final.',
    },
    {
        target: 'selection-tools',
        title: 'Glitch only part of the image',
        body: 'Marquee, lasso, wand, or brush a selection first - the next encode only shows inside it. Feather the edges for prints.',
    },
    {
        target: 'layers',
        title: 'Layers',
        body: 'Your image is the Background; each encode is a layer with its own mask, opacity, blend mode and effects (fx) - all adjustable after the fact. Drag to reorder, add adjustment layers (◐) to post-process everything below.',
    },
    {
        target: 'viewer-tools',
        title: 'Inspect',
        body: 'Zoom and pan, hold C to compare with the source, or open the segmentation view to see how the codec tiled your image.',
    },
];

interface ActiveStep {
    step: TourStep;
    rect: DOMRect;
    index: number; // index into the resolved (available) steps
    total: number;
}

export const Tour: React.FC = () => {
    const [available, setAvailable] = useState<TourStep[] | null>(null);
    const [current, setCurrent] = useState<ActiveStep | null>(null);

    const open = useCallback(() => {
        const steps = STEPS.filter(s => document.querySelector(`[data-tour="${s.target}"]`));
        if (steps.length === 0) return;
        setAvailable(steps);
        const el = document.querySelector(`[data-tour="${steps[0].target}"]`)!;
        setCurrent({ step: steps[0], rect: el.getBoundingClientRect(), index: 0, total: steps.length });
    }, []);

    const close = useCallback(() => {
        try {
            localStorage.setItem(SEEN_KEY, '1');
        } catch {
            // storage unavailable - the tour will simply offer itself again
        }
        setAvailable(null);
        setCurrent(null);
    }, []);

    const goTo = useCallback(
        (index: number) => {
            if (!available) return;
            // walk in the requested direction, skipping targets that vanished mid-tour
            const dir = current && index < current.index ? -1 : 1;
            for (let i = index; i >= 0 && i < available.length; i += dir) {
                const el = document.querySelector(`[data-tour="${available[i].target}"]`);
                if (el) {
                    el.scrollIntoView({ block: 'nearest' });
                    setCurrent({ step: available[i], rect: el.getBoundingClientRect(), index: i, total: available.length });
                    return;
                }
            }
            close();
        },
        [available, current, close]
    );

    // manual start + first-run auto start
    useEffect(() => {
        window.addEventListener(START_TOUR_EVENT, open);
        let seen = true;
        try {
            seen = localStorage.getItem(SEEN_KEY) === '1';
        } catch {
            seen = true;
        }
        const t = seen ? null : window.setTimeout(open, 600);
        return () => {
            window.removeEventListener(START_TOUR_EVENT, open);
            if (t) window.clearTimeout(t);
        };
    }, [open]);

    if (!current) return null;

    const { rect, step, index, total } = current;
    const pad = 6;

    // popover below the target, flipped above when cramped, clamped horizontally
    const popW = 300;
    const below = rect.bottom + 160 < window.innerHeight;
    const popTop = below ? rect.bottom + pad + 10 : undefined;
    const popBottom = below ? undefined : window.innerHeight - rect.top + pad + 10;
    let popLeft = rect.left + rect.width / 2 - popW / 2;
    popLeft = Math.max(12, Math.min(popLeft, window.innerWidth - popW - 12));

    return (
        <div className="fixed inset-0 z-[90]" role="dialog" aria-label="Guided tour">
            {/* spotlight: the shadow dims everything except the target */}
            <div
                className="absolute rounded-xl border-2 border-glx-orange transition-all duration-200 pointer-events-none"
                style={{
                    left: rect.left - pad,
                    top: rect.top - pad,
                    width: rect.width + pad * 2,
                    height: rect.height + pad * 2,
                    boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.65)',
                }}
            />
            {/* click-away closes */}
            <div className="absolute inset-0" onClick={close} />

            <div
                className="absolute w-[300px] bg-cream-2 border border-ink rounded-xl shadow-2xl shadow-black/60 p-4"
                style={{ left: popLeft, top: popTop, bottom: popBottom }}
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                    <h3 className="text-sm font-bold text-ink">{step.title}</h3>
                    <button onClick={close} className="text-ink-2 hover:text-ink flex-shrink-0" title="Close tour">
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <p className="text-xs leading-relaxed text-ink-2 mb-3">{step.body}</p>
                <div className="flex items-center justify-between">
                    <span className="text-[10px] text-ink-2 font-mono">
                        {index + 1} / {total}
                    </span>
                    <div className="flex gap-1.5">
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
                            {index + 1 === total ? 'Done' : 'Next'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
