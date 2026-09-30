import React from 'react';
import { useApp } from '../core/AppContext';
import { X, AlertCircle, CheckCircle2, Info } from 'lucide-react';

const ICONS = {
    error: <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />,
    success: <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />,
    info: <Info className="w-4 h-4 text-sky-600 flex-shrink-0" />,
};

export const Toasts: React.FC = () => {
    const { toasts, dismissToast } = useApp();
    if (toasts.length === 0) return null;

    return (
        <div className="fixed top-14 left-2 right-2 md:top-auto md:left-auto md:bottom-4 md:right-4 z-50 flex flex-col gap-2 md:max-w-sm pointer-events-none [&>*]:pointer-events-auto">
            {toasts.map(t => (
                <div
                    key={t.id}
                    className="flex items-center gap-2 px-3 py-2.5 bg-cream-2 border border-ink rounded-lg shadow-xl text-sm text-ink"
                >
                    {ICONS[t.kind]}
                    <span className="flex-1">{t.text}</span>
                    <button onClick={() => dismissToast(t.id)} className="text-ink-2 hover:text-ink">
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            ))}
        </div>
    );
};
