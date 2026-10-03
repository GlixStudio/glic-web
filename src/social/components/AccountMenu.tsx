// Header control: "Sign in", or the signed-in user's menu.

import React, { useEffect, useRef, useState } from 'react';
import { Images, LogOut, Settings2, Shield, User } from 'lucide-react';
import { useSession } from '../session';
import { navigate, profilePath } from '../router';
import { Avatar } from './ui';
import { AccountSettingsModal } from './AccountSettingsModal';

export const AccountMenu: React.FC<{ compact?: boolean }> = ({ compact }) => {
    const { user, offline, requireAuth, logout, isStaff } = useSession();
    const [open, setOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
        window.addEventListener('pointerdown', onDown);
        return () => window.removeEventListener('pointerdown', onDown);
    }, [open]);

    if (offline || user === undefined) return null;
    if (!user)
        return (
            <button
                onClick={() => requireAuth('login')}
                className="flex-shrink-0 px-2 sm:px-2.5 py-1 rounded-md border border-ink bg-cream-2 hover:bg-white text-[11px] font-bold text-ink transition-colors"
            >
                Sign in
            </button>
        );

    const item = (icon: React.ReactNode, label: string, onClick: () => void) => (
        <button
            onClick={() => {
                setOpen(false);
                onClick();
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-[12px] text-ink hover:bg-glx-orange/30"
        >
            {icon}
            {label}
        </button>
    );

    return (
        <div ref={ref} className="relative flex-shrink-0">
            <button
                onClick={() => setOpen(o => !o)}
                className="flex items-center gap-1.5 pl-0.5 pr-2 py-0.5 rounded-full border border-ink bg-cream-2 hover:bg-white text-[11px] font-bold"
                title={`Signed in as @${user.handle}`}
            >
                <Avatar user={user} size={20} />
                {!compact && <span className="hidden sm:inline max-w-[100px] truncate">{user.handle}</span>}
            </button>
            {open && (
                <div className="absolute right-0 top-full mt-1 w-52 bg-cream-2 border border-ink rounded-lg shadow-xl shadow-black/25 py-1 z-50">
                    <div className="px-3 py-1.5 border-b border-line mb-1">
                        <div className="text-[12px] font-bold truncate">{user.displayName || user.handle}</div>
                        <div className="text-[11px] text-ink-2 truncate">{user.email}</div>
                    </div>
                    {item(<User className="w-3.5 h-3.5" />, 'Your profile', () => navigate(profilePath(user.handle)))}
                    {item(<Images className="w-3.5 h-3.5" />, 'Gallery', () => navigate('/gallery'))}
                    {item(<Settings2 className="w-3.5 h-3.5" />, 'Account settings', () => setSettingsOpen(true))}
                    {isStaff && item(<Shield className="w-3.5 h-3.5" />, 'Admin', () => navigate('/admin'))}
                    <div className="my-1 border-t border-line" />
                    {item(<LogOut className="w-3.5 h-3.5" />, 'Sign out', () => void logout())}
                </div>
            )}
            {settingsOpen && <AccountSettingsModal onClose={() => setSettingsOpen(false)} />}
        </div>
    );
};
