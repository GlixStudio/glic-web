// Sign in / create account. Opened through useSession().requireAuth().

import React, { useState } from 'react';
import { Modal } from '../../components/controls/Modal';
import { api } from '../api';
import { useSession, type AuthMode } from '../session';
import { Button, ErrorNote, Field, inputClass } from './ui';

export const AuthModal: React.FC = () => {
    const { authPrompt, closeAuth, setUser, settings } = useSession();
    if (!authPrompt) return null;
    return <AuthForm key={authPrompt.mode} initialMode={authPrompt.mode} reason={authPrompt.reason} onDone={closeAuth} setUser={setUser} closed={settings?.registration === 'closed'} />;
};

const AuthForm: React.FC<{
    initialMode: AuthMode;
    reason: string | null;
    onDone: (ok: boolean) => void;
    setUser: ReturnType<typeof useSession>['setUser'];
    closed: boolean;
}> = ({ initialMode, reason, onDone, setUser, closed }) => {
    const [mode, setMode] = useState<AuthMode>(initialMode);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [handle, setHandle] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const register = mode === 'register';

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const r = register ? await api.register(email, password, handle) : await api.login(email, password);
            setUser(r.user);
            onDone(true);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal title={register ? 'Create account' : 'Sign in'} onClose={() => onDone(false)} width="max-w-sm">
            <form onSubmit={submit} className="space-y-3">
                {reason && <p className="text-[12px] text-ink-2">{reason}</p>}
                {register && closed && <ErrorNote error="Sign-ups are closed right now." />}
                <Field label="Email">
                    <input className={inputClass} type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} autoFocus />
                </Field>
                {register && (
                    <Field label="Handle" hint="Your public name in the gallery: letters, digits, _ . -">
                        <input
                            className={inputClass}
                            autoComplete="username"
                            required
                            minLength={3}
                            maxLength={30}
                            value={handle}
                            onChange={e => setHandle(e.target.value.replace(/\s/g, ''))}
                        />
                    </Field>
                )}
                <Field label="Password" hint={register ? 'At least 8 characters' : undefined}>
                    <input
                        className={inputClass}
                        type="password"
                        autoComplete={register ? 'new-password' : 'current-password'}
                        required
                        minLength={register ? 8 : undefined}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                    />
                </Field>
                <ErrorNote error={error} />
                <Button type="submit" variant="primary" className="w-full" disabled={busy || (register && closed)}>
                    {busy ? 'One moment…' : register ? 'Create account' : 'Sign in'}
                </Button>
                <p className="text-center text-[12px] text-ink-2">
                    {register ? 'Have an account? ' : 'New here? '}
                    <button
                        type="button"
                        className="font-bold text-ink underline decoration-glx-orange decoration-2"
                        onClick={() => {
                            setMode(register ? 'login' : 'register');
                            setError(null);
                        }}
                    >
                        {register ? 'Sign in' : 'Create an account'}
                    </button>
                </p>
            </form>
        </Modal>
    );
};
