import { useEffect, useRef } from 'react';

// Tour trigger shared between the Tour overlay and the Help modal.
export const START_TOUR_EVENT = 'glic:start-tour';
export const startTour = () => window.dispatchEvent(new CustomEvent(START_TOUR_EVENT));

// Before spotlighting a control that lives behind UI state (a sidebar tab, the
// Masks tab of a collapsed dock, the options of a selection tool), the tour asks
// the owning component to reveal it ('canvas': get the controls drawer out of the
// way on phones). Components opt in with useTourReveal.
export type TourReveal = 'canvas' | 'sidebar-global' | 'sidebar-channels' | 'dock-layers' | 'dock-masks' | 'selection-options';

const TOUR_REVEAL_EVENT = 'glic:tour-reveal';

export const revealForTour = (what: TourReveal) =>
    window.dispatchEvent(new CustomEvent<TourReveal>(TOUR_REVEAL_EVENT, { detail: what }));

export const useTourReveal = (handler: (what: TourReveal) => void) => {
    const ref = useRef(handler);
    useEffect(() => {
        ref.current = handler;
    });
    useEffect(() => {
        const on = (e: Event) => ref.current((e as CustomEvent<TourReveal>).detail);
        window.addEventListener(TOUR_REVEAL_EVENT, on);
        return () => window.removeEventListener(TOUR_REVEAL_EVENT, on);
    }, []);
};
