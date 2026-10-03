// Who is signed in, the site settings, and the sign-in dialog, for the whole app.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Me, Settings } from '../../shared/api';
import { api, ApiError } from './api';

export type AuthMode = 'login' | 'register';

interface SessionState {
    /** undefined while loading */
    user: Me | null | undefined;
    settings: Settings | null;
    /** the backend is not reachable or not set up in this environment */
    offline: boolean;
    refresh: () => Promise<void>;
    setUser: (u: Me | null) => void;
    logout: () => Promise<void>;
    /** opens the sign-in dialog; resolves true once signed in */
    requireAuth: (mode?: AuthMode, reason?: string) => Promise<boolean>;
    authPrompt: { mode: AuthMode; reason: string | null } | null;
    closeAuth: (signedIn: boolean) => void;
    isStaff: boolean;
    isAdmin: boolean;
}

const SessionContext = createContext<SessionState | undefined>(undefined);

export const SessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<Me | null | undefined>(undefined);
    const [settings, setSettings] = useState<Settings | null>(null);
    const [offline, setOffline] = useState(false);
    const [authPrompt, setAuthPrompt] = useState<SessionState['authPrompt']>(null);
    const [resolver, setResolver] = useState<((ok: boolean) => void) | null>(null);

    const refresh = useCallback(async () => {
        try {
            const s = await api.session();
            setUser(s.user);
            setSettings(s.settings);
            setOffline(false);
        } catch (e) {
            setUser(null);
            setOffline(!(e instanceof ApiError) || e.status === 0 || e.status >= 500 || e.status === 404);
        }
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
        refresh();
    }, [refresh]);

    const logout = useCallback(async () => {
        await api.logout().catch(() => {});
        setUser(null);
    }, []);

    const requireAuth = useCallback(
        (mode: AuthMode = 'login', reason?: string) => {
            if (user) return Promise.resolve(true);
            return new Promise<boolean>(resolve => {
                setAuthPrompt({ mode, reason: reason ?? null });
                setResolver(() => resolve);
            });
        },
        [user]
    );

    const closeAuth = useCallback(
        (signedIn: boolean) => {
            setAuthPrompt(null);
            resolver?.(signedIn);
            setResolver(null);
        },
        [resolver]
    );

    const value = useMemo<SessionState>(
        () => ({
            user,
            settings,
            offline,
            refresh,
            setUser,
            logout,
            requireAuth,
            authPrompt,
            closeAuth,
            isStaff: user?.role === 'moderator' || user?.role === 'admin',
            isAdmin: user?.role === 'admin',
        }),
        [user, settings, offline, refresh, logout, requireAuth, authPrompt, closeAuth]
    );

    return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useSession = () => {
    const ctx = useContext(SessionContext);
    if (!ctx) throw new Error('useSession outside SessionProvider');
    return ctx;
};
