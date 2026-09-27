import { MaybeTooltip } from './Tooltip';
import type { HelpEntry } from '../../core/help';

interface SelectProps<T extends string | number> {
    label: string;
    value: T;
    options: { label: string; value: T }[];
    onChange: (val: T) => void;
    title?: string;
    help?: HelpEntry;
}

export function Select<T extends string | number>({ label, value, options, onChange, title, help }: SelectProps<T>) {
    return (
        <MaybeTooltip help={help}>
        <div className="flex flex-col gap-1.5" title={help ? undefined : title}>
            <span className="text-[10px] font-bold text-ink-2 uppercase tracking-wider">{label}</span>
            <div className="relative">
                <select
                    value={String(value)}
                    onChange={e => {
                        const raw = e.target.value;
                        const match = options.find(o => String(o.value) === raw);
                        if (match) onChange(match.value);
                    }}
                    className="w-full bg-cream-2 border border-ink text-ink text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-glx-orange focus:ring-1 focus:ring-glx-orange appearance-none transition-all hover:bg-white"
                >
                    {options.map(opt => (
                        <option key={String(opt.value)} value={String(opt.value)}>
                            {opt.label}
                        </option>
                    ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-ink">
                    <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                        <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                    </svg>
                </div>
            </div>
        </div>
        </MaybeTooltip>
    );
}
