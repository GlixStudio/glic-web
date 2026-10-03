// Everything community on top of the editor: the gallery, profiles and admin
// as full-screen pages over it (the editor stays mounted underneath, so work
// in progress survives a trip to the gallery), plus the sign-in and share
// dialogs.

import React, { lazy, Suspense, useEffect, useState } from 'react';
import { useRoute } from './router';
import { useSession } from './session';
import { SHARE_EVENT } from './shareBus';
import { AuthModal } from './components/AuthModal';
import { ShareModal } from './components/ShareModal';
import { GalleryView } from './components/GalleryView';
import { ProfileView } from './components/ProfileView';
import { Spinner } from './components/ui';

const AdminView = lazy(() => import('./components/AdminView').then(m => ({ default: m.AdminView })));

export const SocialLayer: React.FC = () => {
    const route = useRoute();
    const { requireAuth } = useSession();
    const [share, setShare] = useState(false);
    const overlay = route.name !== 'editor';

    useEffect(() => {
        const onShare = async () => {
            if (await requireAuth('login', 'Sign in to share your work in the gallery')) setShare(true);
        };
        window.addEventListener(SHARE_EVENT, onShare);
        return () => window.removeEventListener(SHARE_EVENT, onShare);
    }, [requireAuth]);

    // the editor's shortcuts and paste handling listen on window; while a page
    // covers it, keys and pastes stop at the document so E doesn't encode and
    // a pasted image doesn't land on the hidden canvas
    useEffect(() => {
        if (!overlay) return;
        const stop = (e: Event) => e.stopPropagation();
        document.addEventListener('keydown', stop);
        document.addEventListener('paste', stop);
        return () => {
            document.removeEventListener('keydown', stop);
            document.removeEventListener('paste', stop);
        };
    }, [overlay]);

    useEffect(() => {
        const base = 'GLIX Encoder';
        document.title =
            route.name === 'gallery' ? `Gallery · ${base}` : route.name === 'profile' ? `@${route.handle} · ${base}` : route.name === 'admin' ? `Admin · ${base}` : base;
    }, [route]);

    const openShare = () => setShare(true);

    return (
        <>
            {overlay && (
                <div className="fixed inset-0 z-40 overflow-y-auto custom-scrollbar bg-cream">
                    {route.name === 'gallery' && <GalleryView postId={route.postId} tag={route.tag} onShare={openShare} />}
                    {route.name === 'profile' && <ProfileView handle={route.handle} postId={route.postId} onShare={openShare} />}
                    {route.name === 'admin' && (
                        <Suspense
                            fallback={
                                <div className="py-24 flex justify-center text-ink-2">
                                    <Spinner className="w-5 h-5" />
                                </div>
                            }
                        >
                            <AdminView tab={route.tab} />
                        </Suspense>
                    )}
                </div>
            )}
            {share && <ShareModal onClose={() => setShare(false)} />}
            <AuthModal />
        </>
    );
};
