import React from 'react';
import { Atom } from 'lucide-react';

/** the idea behind an art-science wavelet or preset */
export const ConceptNote: React.FC<{ title: string; note: string }> = ({ title, note }) => (
    <div className="rounded-md border border-line bg-cream-2/70 px-2.5 py-2 space-y-1">
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-2">
            <Atom className="w-3 h-3 text-glx-orange" /> {title}
        </div>
        <p className="text-[11px] leading-relaxed text-ink">{note}</p>
    </div>
);
