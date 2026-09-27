import React from 'react';
import { useApp } from '../core/AppContext';
import { X, AlertCircle, CheckCircle2, Info } from 'lucide-react';

const ICONS = {
    error: <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />,
    success: <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />,
    info: <Info className="w-4 h-4 text-blue-400 flex-shrink-0" />,
};

export const Toasts: React.FC = () => {
    const { toasts, dismissToast } = useApp();
    if (toasts.length === 0) return null;

    return (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
            {toasts.map(t => (
                <div
                    key={t.id}
                    className="flex items-center gap-2 px-3 py-2.5 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl text-sm text-zinc-200"
                >
                    {ICONS[t.kind]}
                    <span className="flex-1">{t.text}</span>
                    <button onClick={() => dismissToast(t.id)} className="text-zinc-500 hover:text-zinc-300">
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            ))}
        </div>
    );
};
