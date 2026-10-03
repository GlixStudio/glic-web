// Profile (handle, name, bio) and password.

import React, { useState } from 'react';
import { Modal } from '../../components/controls/Modal';
import { api } from '../api';
import { useSession } from '../session';
import { Button, ErrorNote, Field, inputClass } from './ui';

export const AccountSettingsModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const { user, setUser } = useSession();
    const [handle, setHandle] = useState(user?.handle ?? '');
    const [displayName, setDisplayName] = useState(user?.displayName ?? '');
    const [bio, setBio] = useState(user?.bio ?? '');
    const [current, setCurrent] = useState('');
    const [next, setNext] = useState('');
    const [busy, setBusy] = useState<'profile' | 'password' | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    if (!user) return null;

    const run = async (which: 'profile' | 'password', fn: () => Promise<void>) => {
        setBusy(which);
        setError(null);
        setNotice(null);
        try {
            await fn();
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(null);
        }
    };

    const saveProfile = (e: React.FormEvent) => {
        e.preventDefault();
        run('profile', async () => {
            const r = await api.updateMe({ handle, displayName, bio });
            setUser(r.user);
            setNotice('Profile saved');
        });
    };

    const savePassword = (e: React.FormEvent) => {
        e.preventDefault();
        run('password', async () => {
            await api.changePassword(current, next);
            setCurrent('');
            setNext('');
            setNotice('Password changed - other devices were signed out');
        });
    };

    return (
        <Modal title="Account" onClose={onClose}>
            <div className="space-y-5">
                <form onSubmit={saveProfile} className="space-y-3">
                    <Field label="Handle">
                        <input className={inputClass} value={handle} onChange={e => setHandle(e.target.value.replace(/\s/g, ''))} maxLength={30} />
                    </Field>
                    <Field label="Display name">
                        <input className={inputClass} value={displayName} onChange={e => setDisplayName(e.target.value)} maxLength={60} />
                    </Field>
                    <Field label="Bio">
                        <textarea className={`${inputClass} min-h-[70px]`} value={bio} onChange={e => setBio(e.target.value)} maxLength={500} />
                    </Field>
                    <Button type="submit" variant="primary" disabled={busy !== null}>
                        {busy === 'profile' ? 'Saving…' : 'Save profile'}
                    </Button>
                </form>
                <form onSubmit={savePassword} className="space-y-3 border-t border-line pt-4">
                    <Field label="Current password">
                        <input className={inputClass} type="password" autoComplete="current-password" value={current} onChange={e => setCurrent(e.target.value)} required />
                    </Field>
                    <Field label="New password">
                        <input className={inputClass} type="password" autoComplete="new-password" minLength={8} value={next} onChange={e => setNext(e.target.value)} required />
                    </Field>
                    <Button type="submit" disabled={busy !== null}>
                        {busy === 'password' ? 'Changing…' : 'Change password'}
                    </Button>
                </form>
                <ErrorNote error={error} />
                {notice && <div className="text-[12px] text-ink-2">{notice}</div>}
                <div className="text-[11px] text-ink-2 border-t border-line pt-3">
                    Signed in as {user.email} · role: <b>{user.role}</b>
                </div>
            </div>
        </Modal>
    );
};
