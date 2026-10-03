// "Report" link with its small dialog.

import React, { useState } from 'react';
import { Modal } from '../../components/controls/Modal';
import { REPORT_REASONS } from '../../../shared/api';
import { api } from '../api';
import { useSession } from '../session';
import { Button, ErrorNote, Field, inputClass } from './ui';

const REASON_LABEL: Record<(typeof REPORT_REASONS)[number], string> = {
    spam: 'Spam',
    nsfw: 'Sexual or graphic content',
    harassment: 'Harassment or hate',
    copyright: 'Someone else’s work',
    other: 'Something else',
};

export const ReportButton: React.FC<{ targetType: 'post' | 'comment' | 'user'; targetId: string; className?: string; children?: React.ReactNode }> = ({
    targetType,
    targetId,
    className,
    children,
}) => {
    const { requireAuth } = useSession();
    const [open, setOpen] = useState(false);
    const [reason, setReason] = useState<(typeof REPORT_REASONS)[number]>('spam');
    const [details, setDetails] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sent, setSent] = useState(false);

    const submit = async () => {
        setBusy(true);
        setError(null);
        try {
            await api.report(targetType, targetId, reason, details);
            setSent(true);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            <button className={className} onClick={async () => (await requireAuth('login', 'Sign in to report')) && setOpen(true)}>
                {children ?? 'Report'}
            </button>
            {open && (
                <Modal
                    title={`Report ${targetType}`}
                    onClose={() => setOpen(false)}
                    width="max-w-sm"
                    footer={
                        sent ? (
                            <Button onClick={() => setOpen(false)}>Close</Button>
                        ) : (
                            <>
                                <Button onClick={() => setOpen(false)}>Cancel</Button>
                                <Button variant="danger" onClick={submit} disabled={busy}>
                                    {busy ? 'Sending…' : 'Report'}
                                </Button>
                            </>
                        )
                    }
                >
                    {sent ? (
                        <p className="text-[13px]">Thanks - a moderator will take a look.</p>
                    ) : (
                        <div className="space-y-3">
                            <div className="space-y-1">
                                {REPORT_REASONS.map(r => (
                                    <label key={r} className="flex items-center gap-2 text-[13px] cursor-pointer">
                                        <input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} className="accent-[var(--color-glx-orange)]" />
                                        {REASON_LABEL[r]}
                                    </label>
                                ))}
                            </div>
                            <Field label="Details (optional)">
                                <textarea className={`${inputClass} min-h-[60px]`} value={details} onChange={e => setDetails(e.target.value)} maxLength={1000} />
                            </Field>
                            <ErrorNote error={error} />
                        </div>
                    )}
                </Modal>
            )}
        </>
    );
};
