// The editor's call to share: in the header, lit once there is an encode.

import React from 'react';
import { Send } from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { useSession } from '../session';
import { openShare } from '../shareBus';
import { hasEncode } from '../editorOutput';

export const ShareButton: React.FC = () => {
    const { layers } = useApp();
    const { offline } = useSession();
    if (offline) return null;
    const ready = hasEncode(layers);
    return (
        <button
            onClick={openShare}
            disabled={!ready}
            className="flex-shrink-0 flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-md border border-ink bg-glx-green text-[11px] font-black uppercase tracking-wider text-ink transition-all hover:brightness-105 disabled:bg-cream-2 disabled:text-ink-2 disabled:border-line disabled:cursor-not-allowed"
            title={ready ? 'Share what’s on the canvas to the GLIX Gallery' : 'Encode at least once (E) to share'}
        >
            <Send className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Share to Gallery</span>
        </button>
    );
};
