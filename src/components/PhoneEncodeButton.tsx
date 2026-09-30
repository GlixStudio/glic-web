import React from 'react';
import { useApp } from '../core/AppContext';
import { Play } from 'lucide-react';

/** phones: the ENCODE button lives in the drawer, so a floating one stays on the canvas */
export const PhoneEncodeButton: React.FC = () => {
    const { originalImage, isProcessing, progress, encodeNow } = useApp();
    if (!originalImage) return null;
    return (
        <button
            onClick={() => void encodeNow()}
            disabled={isProcessing}
            className="md:hidden absolute bottom-14 right-4 z-20 flex items-center gap-2 px-4 py-3 rounded-full bg-glx-green border border-ink font-bold text-sm text-ink shadow-[2px_2px_0_0_rgba(22,21,15,0.9)] active:shadow-none disabled:opacity-60"
        >
            <Play className="w-4 h-4 fill-current" />
            {isProcessing ? `${Math.round((progress ?? 0) * 100)}%` : 'ENCODE'}
        </button>
    );
};
