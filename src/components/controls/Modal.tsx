import React, { useEffect } from 'react';
import { X } from 'lucide-react';

/** Cream dialog shell used by the menu and mask dialogs. Escape and backdrop close it. */
export const Modal: React.FC<{
    title: string;
    onClose: () => void;
    children: React.ReactNode;
    footer?: React.ReactNode;
    width?: string;
}> = ({ title, onClose, children, footer, width = 'max-w-md' }) => {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                onClose();
            }
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [onClose]);

    return (
        <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={onClose}
            onPointerDown={e => e.stopPropagation()}
        >
            <div
                role="dialog"
                aria-label={title}
                className={`bg-cream border border-ink rounded-xl shadow-2xl shadow-black/50 w-full ${width} max-h-[92vh] flex flex-col`}
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-line">
                    <h2 className="text-sm font-black uppercase tracking-wider">{title}</h2>
                    <button onClick={onClose} className="p-1 text-ink-2 hover:text-ink" title="Close">
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <div className="p-4 overflow-y-auto custom-scrollbar">{children}</div>
                {footer && <div className="flex gap-2 justify-end px-4 py-3 border-t border-line">{footer}</div>}
            </div>
        </div>
    );
};

export const ModalButton: React.FC<{
    onClick: () => void;
    primary?: boolean;
    disabled?: boolean;
    children: React.ReactNode;
}> = ({ onClick, primary, disabled, children }) => (
    <button
        onClick={onClick}
        disabled={disabled}
        className={`px-3 py-1.5 rounded-md border border-ink text-[12px] font-bold text-ink transition-all disabled:opacity-40 ${
            primary ? 'bg-glx-green hover:brightness-105' : 'bg-cream-2 hover:bg-white'
        }`}
    >
        {children}
    </button>
);

/** Small segmented control (fit modes, combine modes, anchors...). */
export function Segmented<T extends string>({
    value,
    options,
    onChange,
}: {
    value: T;
    options: { value: T; label: string; title?: string }[];
    onChange: (v: T) => void;
}) {
    return (
        <div className="flex rounded-md border border-ink overflow-hidden">
            {options.map(o => (
                <button
                    key={o.value}
                    type="button"
                    title={o.title}
                    onClick={() => onChange(o.value)}
                    className={`flex-1 px-1.5 py-1 text-[10px] font-bold transition-colors border-r border-ink last:border-r-0 ${
                        value === o.value ? 'bg-glx-orange text-ink' : 'bg-cream-2 text-ink hover:bg-white'
                    }`}
                >
                    {o.label}
                </button>
            ))}
        </div>
    );
}
