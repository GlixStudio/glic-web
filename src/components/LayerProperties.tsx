import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../core/AppContext';
import { EFFECT_DEFS, type Effect, type EffectParamDef, type EffectParams } from '../core/effects';
import { layerThumbnail } from '../core/imageio';
import { HELP } from '../core/help';
import { Tooltip } from './controls/Tooltip';
import { ChevronDown, ChevronRight, ArrowUp, ArrowDown, Trash2, RotateCcw, Dices, FlipHorizontal2, FlipVertical2 } from 'lucide-react';
import { IDENTITY_TRANSFORM, isIdentity, type LayerTransform } from '../core/transform';
import { layerMask } from '../core/layers';

const fmt = (def: EffectParamDef, v: number) => {
    if (def.options) return def.options[Math.round(v)] ?? String(v);
    const digits = (def.step ?? 1) < 1 ? ((def.step ?? 1) < 0.1 ? 2 : 1) : 0;
    return `${v.toFixed(digits)}${def.unit ?? ''}`;
};

const ParamControl: React.FC<{ def: EffectParamDef; value: number; onChange: (v: number, final: boolean) => void }> = ({
    def,
    value,
    onChange,
}) => {
    if (def.options) {
        return (
            <label className="flex items-center justify-between gap-2 text-[10px] text-ink-2">
                <span className="uppercase font-bold tracking-wider">{def.label}</span>
                <select
                    value={Math.round(value)}
                    onChange={e => onChange(parseInt(e.target.value), true)}
                    className="bg-cream-2 border border-ink text-ink text-[10px] rounded px-1 py-0.5 focus:outline-none focus:border-glx-orange"
                >
                    {def.options.map((o, i) => (
                        <option key={o} value={i}>
                            {o}
                        </option>
                    ))}
                </select>
            </label>
        );
    }
    const isSeed = def.key === 'seed';
    return (
        <div className="space-y-0.5">
            <div className="flex items-center justify-between text-[10px] text-ink-2">
                <span className="uppercase font-bold tracking-wider">{def.label}</span>
                <span className="flex items-center gap-1">
                    {isSeed && (
                        <button
                            onClick={() => onChange(Math.floor(Math.random() * (def.max + 1)), true)}
                            className="text-ink-2 hover:text-ink"
                            title="New random seed"
                        >
                            <Dices className="w-3 h-3" />
                        </button>
                    )}
                    <span className="font-mono text-ink">{fmt(def, value)}</span>
                </span>
            </div>
            <input
                type="range"
                min={def.min}
                max={def.max}
                step={def.step ?? 1}
                value={value}
                onChange={e => onChange(parseFloat(e.target.value), false)}
                onPointerUp={e => onChange(parseFloat((e.target as HTMLInputElement).value), true)}
                onKeyUp={e => onChange(parseFloat((e.target as HTMLInputElement).value), true)}
                className="w-full h-1 cursor-pointer"
            />
        </div>
    );
};

// `effect` is a plain object of numbers - safe to pass as a prop (no typed arrays)
const EffectCard: React.FC<{ layerId: string; effect: Effect; isFirst: boolean; isLast: boolean }> = ({
    layerId,
    effect,
    isFirst,
    isLast,
}) => {
    const { updateEffect, removeEffect, moveEffect } = useApp();
    const def = EFFECT_DEFS[effect.type];
    const [open, setOpen] = useState(true);

    // slider drags update a local draft instantly and commit debounced: each commit
    // re-runs the effect over the full-resolution layer
    const [draft, setDraft] = useState<EffectParams | null>(null);
    const timer = useRef<number | null>(null);
    useEffect(() => () => {
        if (timer.current) window.clearTimeout(timer.current);
    }, []);
    const params = draft ?? effect.params;
    const change = (key: string, v: number, final: boolean) => {
        const next = { ...params, [key]: v };
        if (timer.current) window.clearTimeout(timer.current);
        if (final) {
            setDraft(null);
            updateEffect(layerId, effect.id, { params: next });
        } else {
            setDraft(next);
            timer.current = window.setTimeout(() => updateEffect(layerId, effect.id, { params: next }), 110);
        }
    };

    if (!def) return null;
    const defaults = Object.fromEntries(def.params.map(p => [p.key, p.default]));

    return (
        <div className={`border border-line rounded-md bg-cream-2/60 ${effect.enabled ? '' : 'opacity-60'}`}>
            <div className="flex items-center gap-1 px-1.5 py-1">
                <button
                    onClick={() => setOpen(o => !o)}
                    disabled={def.params.length === 0}
                    className="text-ink-2 hover:text-ink disabled:opacity-0"
                >
                    {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                </button>
                <input
                    type="checkbox"
                    checked={effect.enabled}
                    onChange={e => updateEffect(layerId, effect.id, { enabled: e.target.checked })}
                    className="accent-glx-green"
                    title={effect.enabled ? 'Disable effect' : 'Enable effect'}
                />
                <span className="flex-1 min-w-0 truncate text-[11px] font-bold text-ink">{def.label}</span>
                {def.params.length > 0 && (
                    <button
                        onClick={() => updateEffect(layerId, effect.id, { params: defaults })}
                        className="p-0.5 text-ink-2 hover:text-ink"
                        title="Reset to defaults"
                    >
                        <RotateCcw className="w-3 h-3" />
                    </button>
                )}
                <button
                    onClick={() => moveEffect(layerId, effect.id, -1)}
                    disabled={isFirst}
                    className="p-0.5 text-ink-2 hover:text-ink disabled:opacity-30"
                    title="Apply earlier"
                >
                    <ArrowUp className="w-3 h-3" />
                </button>
                <button
                    onClick={() => moveEffect(layerId, effect.id, 1)}
                    disabled={isLast}
                    className="p-0.5 text-ink-2 hover:text-ink disabled:opacity-30"
                    title="Apply later"
                >
                    <ArrowDown className="w-3 h-3" />
                </button>
                <button
                    onClick={() => removeEffect(layerId, effect.id)}
                    className="p-0.5 text-ink-2 hover:text-red-600"
                    title="Remove effect"
                >
                    <Trash2 className="w-3 h-3" />
                </button>
            </div>
            {open && def.params.length > 0 && (
                <div className="px-2 pb-2 space-y-1.5">
                    {def.params.map(p => (
                        <ParamControl
                            key={p.key}
                            def={p}
                            value={params[p.key] ?? p.default}
                            onChange={(v, final) => change(p.key, v, final)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

/** a compact number field that commits on Enter / blur (one undo step per commit) */
const NumField: React.FC<{ label: string; value: number; unit: string; onCommit: (v: number) => void }> = ({
    label,
    value,
    unit,
    onCommit,
}) => {
    const [draft, setDraft] = useState<string | null>(null);
    const commit = () => {
        if (draft === null) return;
        const v = parseFloat(draft);
        if (Number.isFinite(v)) onCommit(v);
        setDraft(null);
    };
    return (
        <label className="flex items-center gap-1 text-[10px] text-ink-2 min-w-0">
            <span className="font-bold w-3 flex-shrink-0">{label}</span>
            <input
                value={draft ?? String(Math.round(value * 10) / 10)}
                onChange={e => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={e => {
                    if (e.key === 'Enter') commit();
                    if (e.key === 'Escape') setDraft(null);
                }}
                inputMode="decimal"
                className="w-full min-w-0 bg-cream-2 border border-ink text-ink text-[10px] font-mono rounded px-1 py-0.5 focus:outline-none focus:border-glx-orange"
            />
            <span className="flex-shrink-0">{unit}</span>
        </label>
    );
};

const smallBtn =
    'py-1 rounded bg-cream-3 hover:bg-white text-ink text-[10px] disabled:opacity-40 disabled:hover:bg-cream-3 transition-colors';

/** Properties of the active layer: its mask and its effect stack. */
export const LayerProperties: React.FC = () => {
    const {
        layers,
        activeLayerId,
        backgroundVisible,
        selection,
        setSelection,
        setLayerMaskFromSelection,
        invertLayerMask,
        updateLayer,
        setLayerTransform,
        originalImage,
        toast,
    } = useApp();
    const active = layers.find(l => l.id === activeLayerId) ?? null;

    if (!active) {
        return (
            <div data-tour="layer-properties" className="border-t border-line p-2.5 text-[11px] text-ink-2 leading-relaxed">
                <b className="text-ink">Background</b> is your imported image. ENCODE creates Layer 1 above it, NEW LAYER stacks more; add an
                adjustment layer (<span className="font-mono">◐</span> below the list) to post-process everything at once.
                Click its lock to unlock it, then its eye to hide it
                {backgroundVisible ? '' : ' - hidden now: layers composite over transparency, and PNG export keeps it'}.
            </div>
        );
    }

    return (
        <div data-tour="layer-properties" className="border-t border-line p-2 space-y-2 overflow-y-auto custom-scrollbar min-h-0 flex-1">
            <div className="space-y-1">
                <div className="text-[10px] font-bold uppercase tracking-wider text-ink-2">
                    Mask {active.mask ? '' : <span className="normal-case font-normal">- none, full frame</span>}
                </div>
                <div className="grid grid-cols-4 gap-1">
                    <Tooltip help={HELP.setMask}>
                        <button
                            onClick={() => {
                                setLayerMaskFromSelection(active.id);
                                toast('success', `Mask set on ${active.name}`);
                            }}
                            disabled={!selection}
                            className={smallBtn}
                        >
                            Set
                        </button>
                    </Tooltip>
                    <Tooltip help={HELP.editMask}>
                        <button
                            onClick={() => {
                                // the selection is canvas space: load the mask where the layer actually is
                                const m = originalImage && layerMask(active, originalImage.width, originalImage.height);
                                if (m) setSelection(m.slice());
                            }}
                            disabled={!active.mask}
                            className={smallBtn}
                        >
                            Edit
                        </button>
                    </Tooltip>
                    <Tooltip help={HELP.invertMask}>
                        <button onClick={() => invertLayerMask(active.id)} disabled={!active.mask} className={smallBtn}>
                            Invert
                        </button>
                    </Tooltip>
                    <Tooltip help={HELP.removeMask}>
                        <button
                            onClick={() => updateLayer(active.id, { mask: null, thumb: layerThumbnail(active, null) })}
                            disabled={!active.mask}
                            className={smallBtn}
                        >
                            Remove
                        </button>
                    </Tooltip>
                </div>
            </div>

            <TransformSection
                transform={active.transform}
                onChange={t => setLayerTransform(active.id, t, true)}
            />

            <div className="space-y-1">
                <Tooltip help={active.kind === 'adjustment' ? HELP.adjustmentLayer : HELP.layerEffects}>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-ink-2">
                        {active.kind === 'adjustment' ? 'Adjustment - applies to layers below' : 'Effects'}
                    </div>
                </Tooltip>
                {active.effects.length === 0 && (
                    <p className="text-[11px] text-ink-2 leading-relaxed">
                        None yet - add blur, levels, pixel sort and more with <i className="font-serif font-bold">fx</i> above.
                    </p>
                )}
                {active.effects.map((fx, i) => (
                    <EffectCard
                        key={fx.id}
                        layerId={active.id}
                        effect={fx}
                        isFirst={i === 0}
                        isLast={i === active.effects.length - 1}
                    />
                ))}
            </div>
        </div>
    );
};

// plain numbers and booleans only - safe as props
const TransformSection: React.FC<{ transform: LayerTransform; onChange: (t: LayerTransform) => void }> = ({
    transform: t,
    onChange,
}) => (
    <div className="space-y-1">
        <div className="flex items-center justify-between">
            <Tooltip help={HELP.layerTransform}>
                <div className="text-[10px] font-bold uppercase tracking-wider text-ink-2">
                    Transform {isIdentity(t) && <span className="normal-case font-normal">- none (V to move)</span>}
                </div>
            </Tooltip>
            <div className="flex items-center">
                <button onClick={() => onChange({ ...t, flipX: !t.flipX })} className={`p-0.5 ${t.flipX ? 'text-glx-orange' : 'text-ink-2 hover:text-ink'}`} title="Flip horizontal">
                    <FlipHorizontal2 className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => onChange({ ...t, flipY: !t.flipY })} className={`p-0.5 ${t.flipY ? 'text-glx-orange' : 'text-ink-2 hover:text-ink'}`} title="Flip vertical">
                    <FlipVertical2 className="w-3.5 h-3.5" />
                </button>
                <button
                    onClick={() => onChange({ ...IDENTITY_TRANSFORM })}
                    disabled={isIdentity(t)}
                    className="p-0.5 text-ink-2 hover:text-ink disabled:opacity-30"
                    title="Reset transform"
                >
                    <RotateCcw className="w-3 h-3" />
                </button>
            </div>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
            <NumField label="X" value={t.x} unit="" onCommit={v => onChange({ ...t, x: Math.round(v) })} />
            <NumField label="Y" value={t.y} unit="" onCommit={v => onChange({ ...t, y: Math.round(v) })} />
            <NumField label="S" value={t.scale * 100} unit="%" onCommit={v => onChange({ ...t, scale: Math.max(0.02, v / 100) })} />
            <NumField label="R" value={t.rotation} unit="°" onCommit={v => onChange({ ...t, rotation: v })} />
        </div>
    </div>
);
