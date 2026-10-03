// Emoji reactions: the ones in use with their counts, and a picker for the rest
// of the site's set. Toggles optimistically and settles on the server's count.

import React, { useEffect, useRef, useState } from 'react';
import { SmilePlus } from 'lucide-react';
import type { ReactionCount } from '../../../shared/api';
import { api } from '../api';
import { useSession } from '../session';

export const Reactions: React.FC<{
    targetType: 'post' | 'comment';
    targetId: string;
    reactions: ReactionCount[];
    mine: string[];
    disabled?: boolean;
    size?: 'sm' | 'md';
    onChange?: (reactions: ReactionCount[], mine: string[]) => void;
}> = ({ targetType, targetId, reactions: initial, mine: initialMine, disabled, size = 'md', onChange }) => {
    const { settings, requireAuth } = useSession();
    const [reactions, setReactions] = useState(initial);
    const [mine, setMine] = useState(initialMine);
    const [picker, setPicker] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!picker) return;
        const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setPicker(false);
        window.addEventListener('pointerdown', onDown);
        return () => window.removeEventListener('pointerdown', onDown);
    }, [picker]);

    const toggle = async (emoji: string) => {
        setPicker(false);
        if (!(await requireAuth('login', 'Sign in to react'))) return;
        const active = !mine.includes(emoji);
        const prev = { reactions, mine };
        const nextMine = active ? [...mine, emoji] : mine.filter(e => e !== emoji);
        const counts = new Map(reactions.map(r => [r.emoji, r.count]));
        counts.set(emoji, (counts.get(emoji) ?? 0) + (active ? 1 : -1));
        const nextReactions = [...counts].filter(([, c]) => c > 0).map(([e, c]) => ({ emoji: e, count: c }));
        setReactions(nextReactions);
        setMine(nextMine);
        setError(null);
        try {
            const r = await api.react(targetType, targetId, emoji, active);
            setReactions(r.reactions);
            setMine(r.viewerReactions);
            onChange?.(r.reactions, r.viewerReactions);
        } catch (e) {
            setReactions(prev.reactions);
            setMine(prev.mine);
            setError((e as Error).message);
        }
    };

    const emojis = settings?.reactionEmojis ?? [];
    const sm = size === 'sm';
    const pill = `inline-flex items-center gap-1 rounded-full border transition-colors ${sm ? 'px-1.5 h-6 text-[11px]' : 'px-2 h-7 text-[13px]'}`;

    return (
        <div ref={ref} className="relative flex flex-wrap items-center gap-1.5">
            {reactions.map(r => (
                <button
                    key={r.emoji}
                    disabled={disabled}
                    onClick={() => toggle(r.emoji)}
                    className={`${pill} ${mine.includes(r.emoji) ? 'border-ink bg-glx-orange/60' : 'border-line bg-cream-2 hover:border-ink'}`}
                    title={mine.includes(r.emoji) ? 'Remove your reaction' : 'React'}
                >
                    <span>{r.emoji}</span>
                    <span className="font-bold tabular-nums">{r.count}</span>
                </button>
            ))}
            {!disabled && emojis.length > 0 && (
                <button onClick={() => setPicker(p => !p)} className={`${pill} border-line bg-cream-2 hover:border-ink text-ink-2`} title="Add a reaction">
                    <SmilePlus className={sm ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
                </button>
            )}
            {picker && (
                <div className="absolute left-0 top-full mt-1 z-20 flex flex-wrap gap-0.5 p-1 rounded-lg border border-ink bg-cream-2 shadow-lg shadow-black/20 w-max max-w-[260px]">
                    {emojis.map(e => (
                        <button
                            key={e}
                            onClick={() => toggle(e)}
                            className={`w-8 h-8 rounded-md text-[18px] hover:bg-glx-orange/40 ${mine.includes(e) ? 'bg-glx-orange/40' : ''}`}
                        >
                            {e}
                        </button>
                    ))}
                </div>
            )}
            {error && <span className="text-[11px] text-red-700">{error}</span>}
        </div>
    );
};
