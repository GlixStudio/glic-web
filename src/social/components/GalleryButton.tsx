// Header link to the gallery - hidden where the community backend is not set up.

import React from 'react';
import { Images } from 'lucide-react';
import { useSession } from '../session';
import { navigate } from '../router';

export const GalleryButton: React.FC = () => {
    const { offline } = useSession();
    if (offline) return null;
    return (
        <button
            onClick={() => navigate('/gallery')}
            className="flex-shrink-0 flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-md border border-ink bg-cream-2 hover:bg-white text-[11px] font-bold text-ink transition-colors"
            title="Community gallery - your work stays open here"
        >
            <Images className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Gallery</span>
        </button>
    );
};
