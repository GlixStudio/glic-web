import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { HelpEntry } from '../../core/help';

// Styled hover/focus tooltip for beginner help. The trigger is a display:contents
// wrapper (layout-transparent; events bubble through it), and the tooltip body is
// rendered through a portal with fixed positioning so scroll containers never
// clip it - flipped and clamped to stay on screen.

const SHOW_DELAY = 350;

interface Props {
    help: HelpEntry;
    children: React.ReactNode;
}

export const Tooltip: React.FC<Props> = ({ help, children }) => {
    const [anchor, setAnchor] = useState<DOMRect | null>(null);
    const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
    const timer = useRef<number | null>(null);
    const bodyRef = useRef<HTMLDivElement>(null);

    const show = useCallback((e: React.SyntheticEvent) => {
        // the wrapper has display:contents (no box), so measure its child
        const target = (e.currentTarget as HTMLElement).firstElementChild;
        if (!target) return;
        const rect = target.getBoundingClientRect();
        if (timer.current) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setAnchor(rect), SHOW_DELAY);
    }, []);

    const hide = useCallback(() => {
        if (timer.current) window.clearTimeout(timer.current);
        timer.current = null;
        setAnchor(null);
        setPos(null);
    }, []);

    useEffect(() => () => hide(), [hide]);

    // measure the tooltip after render, then place it (below the anchor, flipped
    // above when there is no room, clamped horizontally)
    useEffect(() => {
        if (!anchor || !bodyRef.current) return;
        const tip = bodyRef.current.getBoundingClientRect();
        const margin = 8;
        const below = anchor.bottom + margin + tip.height <= window.innerHeight - 4;
        const y = below ? anchor.bottom + margin : Math.max(4, anchor.top - margin - tip.height);
        let x = anchor.left + anchor.width / 2 - tip.width / 2;
        x = Math.max(8, Math.min(x, window.innerWidth - tip.width - 8));
        setPos({ x, y });
    }, [anchor]);

    return (
        <>
            <span
                style={{ display: 'contents' }}
                onMouseEnter={show}
                onMouseLeave={hide}
                onFocus={show}
                onBlur={hide}
                onPointerDown={hide}
            >
                {children}
            </span>
            {anchor &&
                createPortal(
                    <div
                        ref={bodyRef}
                        role="tooltip"
                        className="fixed z-[100] w-60 pointer-events-none rounded-lg border border-zinc-700 bg-zinc-900/98 shadow-xl shadow-black/50 backdrop-blur-sm p-2.5"
                        style={{
                            left: pos?.x ?? -9999,
                            top: pos?.y ?? -9999,
                            opacity: pos ? 1 : 0,
                        }}
                    >
                        <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="text-[11px] font-bold text-zinc-100">{help.title}</span>
                            {help.shortcut && (
                                <kbd className="px-1 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-[9px] font-mono text-zinc-300 flex-shrink-0">
                                    {help.shortcut}
                                </kbd>
                            )}
                        </div>
                        <p className="text-[11px] leading-snug text-zinc-400">{help.body}</p>
                    </div>,
                    document.body
                )}
        </>
    );
};

/** Convenience: wraps children with a tooltip only when help is provided. */
export const MaybeTooltip: React.FC<{ help?: HelpEntry; children: React.ReactNode }> = ({ help, children }) =>
    help ? <Tooltip help={help}>{children}</Tooltip> : <>{children}</>;
