// Small pieces shared by the community views, in the Glix design language.

import React from 'react';
import { Loader2 } from 'lucide-react';
import type { UserSummary } from '../../../shared/api';

export const Mark: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
    <div className={`${className} flex-shrink-0 rounded-[5px] border border-ink grid grid-cols-2 overflow-hidden`}>
        <div className="bg-glx-orange" />
        <div className="bg-ink" />
        <div className="bg-glx-green" />
        <div className="bg-cream-2" />
    </div>
);

const AVATAR_COLORS = ['bg-glx-orange', 'bg-glx-green', 'bg-[#8fb8ff]', 'bg-[#ff8fb1]', 'bg-[#c9a7ff]', 'bg-cream-3'];

export const Avatar: React.FC<{ user: Pick<UserSummary, 'handle' | 'displayName' | 'avatarUrl'>; size?: number }> = ({ user, size = 24 }) => {
    const name = user.displayName || user.handle;
    let h = 0;
    for (const ch of user.handle) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return user.avatarUrl ? (
        <img src={user.avatarUrl} alt="" className="rounded-full border border-ink object-cover flex-shrink-0" style={{ width: size, height: size }} />
    ) : (
        <span
            className={`inline-flex items-center justify-center rounded-full border border-ink font-black text-ink flex-shrink-0 ${AVATAR_COLORS[h % AVATAR_COLORS.length]}`}
            style={{ width: size, height: size, fontSize: Math.max(9, size * 0.42) }}
            aria-hidden
        >
            {name.slice(0, 1).toUpperCase()}
        </span>
    );
};

export const RoleBadge: React.FC<{ role: UserSummary['role'] }> = ({ role }) =>
    role === 'admin' || role === 'moderator' ? (
        <span className="px-1 rounded border border-ink bg-glx-orange text-[9px] font-black uppercase tracking-wider leading-[14px]">
            {role === 'admin' ? 'admin' : 'mod'}
        </span>
    ) : null;

export const Spinner: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => <Loader2 className={`${className} animate-spin`} />;

export const Button: React.FC<
    React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'plain' | 'ghost' | 'danger'; size?: 'sm' | 'md' }
> = ({ variant = 'plain', size = 'md', className = '', ...rest }) => (
    <button
        {...rest}
        className={`inline-flex items-center justify-center gap-1.5 rounded-md font-bold text-ink transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
            size === 'sm' ? 'px-2 py-1 text-[11px]' : 'px-3 py-1.5 text-[12px]'
        } ${
            variant === 'primary'
                ? 'border border-ink bg-glx-green hover:brightness-105'
                : variant === 'danger'
                  ? 'border border-ink bg-cream-2 text-red-700 hover:bg-red-50'
                  : variant === 'ghost'
                    ? 'hover:bg-cream-3'
                    : 'border border-ink bg-cream-2 hover:bg-white'
        } ${className}`}
    />
);

export const Field: React.FC<{ label: string; hint?: React.ReactNode; children: React.ReactNode }> = ({ label, hint, children }) => (
    <label className="block">
        <span className="block text-[10px] font-bold text-ink-2 uppercase tracking-wider mb-1">{label}</span>
        {children}
        {hint && <span className="block mt-1 text-[11px] text-ink-2">{hint}</span>}
    </label>
);

export const inputClass =
    'w-full bg-cream-2 border border-ink text-ink text-[13px] rounded-md px-2.5 py-1.5 focus:outline-none focus:border-glx-orange focus:ring-1 focus:ring-glx-orange placeholder:text-ink-2/60';

export const ErrorNote: React.FC<{ error: string | null }> = ({ error }) =>
    error ? <div className="rounded-md border border-red-700/40 bg-red-50 px-2.5 py-1.5 text-[12px] text-red-800">{error}</div> : null;
