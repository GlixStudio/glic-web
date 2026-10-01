import React, { useMemo, useRef, useState } from 'react';
import { useApp } from '../core/AppContext';
import { BLEND_MODES, type GlitchLayer } from '../core/layers';
import { EFFECTS, EFFECT_GROUPS, type EffectType } from '../core/effects';
import { imageDataToThumbnail } from '../core/imageio';
import { HELP } from '../core/help';
import { Tooltip } from './controls/Tooltip';
import { LayerProperties } from './LayerProperties';
import {
    Eye,
    EyeOff,
    Copy,
    Trash2,
    Scan,
    Lock,
    LockOpen,
    SlidersHorizontal,
    Contrast,
    ArrowDownToLine,
} from 'lucide-react';

type DropSpot = { id: string | null; above: boolean } | null;

// Only primitives cross this prop boundary on purpose: React's dev-mode render
// profiler deep-diffs changed props, and a GlitchLayer carries multi-megabyte
// typed arrays (file, mask) that it would walk element by element on every update.
interface LayerRowProps {
    id: string;
    name: string;
    kind: GlitchLayer['kind'];
    visible: boolean;
    hasMask: boolean;
    fxCount: number;
    thumb: string | null;
    isActive: boolean;
    drop: 'above' | 'below' | null;
    onDragStart: (id: string) => void;
    onDragOverRow: (id: string, above: boolean) => void;
    onDropRow: () => void;
    onDragEnd: () => void;
}

const LayerRow: React.FC<LayerRowProps> = ({
    id,
    name,
    kind,
    visible,
    hasMask,
    fxCount,
    thumb,
    isActive,
    drop,
    onDragStart,
    onDragOverRow,
    onDropRow,
    onDragEnd,
}) => {
    const { layers, setActiveLayerId, updateLayer } = useApp();
    const [renaming, setRenaming] = useState(false);
    const [nameDraft, setNameDraft] = useState(name);

    const commitRename = () => {
        const next = nameDraft.trim();
        if (next) updateLayer(id, { name: next });
        setRenaming(false);
    };

    /** Alt/Option-click: show only this layer; again: show all (Photoshop's solo) */
    const toggleVisible = (solo: boolean) => {
        if (!solo) {
            updateLayer(id, { visible: !visible });
            return;
        }
        const others = layers.filter(l => l.id !== id);
        const alreadySolo = visible && others.every(l => !l.visible);
        for (const l of others) updateLayer(l.id, { visible: alreadySolo });
        updateLayer(id, { visible: true });
    };

    return (
        <div
            draggable={!renaming}
            onDragStart={e => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', id);
                onDragStart(id);
            }}
            onDragOver={e => {
                e.preventDefault();
                const r = e.currentTarget.getBoundingClientRect();
                onDragOverRow(id, e.clientY < r.top + r.height / 2);
            }}
            onDrop={e => {
                e.preventDefault();
                onDropRow();
            }}
            onDragEnd={onDragEnd}
            className={`relative group flex items-center gap-1.5 px-1.5 py-1 rounded-md cursor-pointer border ${
                isActive ? 'bg-blue-600/20 border-blue-600/60' : 'border-transparent hover:bg-white/60'
            }`}
            onClick={() => setActiveLayerId(id)}
        >
            {drop && (
                <div
                    className={`absolute left-1 right-1 h-0.5 bg-glx-orange rounded pointer-events-none ${
                        drop === 'above' ? '-top-px' : '-bottom-px'
                    }`}
                />
            )}
            <button
                onClick={e => {
                    e.stopPropagation();
                    toggleVisible(e.altKey);
                }}
                className={`p-0.5 flex-shrink-0 ${visible ? 'text-ink' : 'text-ink-2/70'}`}
                title={visible ? 'Hide layer (Alt-click: show only this one)' : 'Show layer (Alt-click: show only this one)'}
            >
                {visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            </button>

            {kind === 'adjustment' ? (
                <div className="w-8 h-8 rounded-sm border border-ink bg-cream-2 flex-shrink-0 flex items-center justify-center">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-ink-2" />
                </div>
            ) : thumb ? (
                <img
                    src={thumb}
                    alt=""
                    draggable={false}
                    className="w-8 h-8 object-contain rounded-sm border border-ink bg-cream-2 flex-shrink-0"
                    style={{ imageRendering: 'pixelated' }}
                />
            ) : (
                <div className="w-8 h-8 rounded-sm border border-ink bg-cream-2 flex-shrink-0" />
            )}

            {renaming ? (
                <input
                    autoFocus
                    value={nameDraft}
                    onChange={e => setNameDraft(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={e => {
                        if (e.key === 'Enter') commitRename();
                        if (e.key === 'Escape') setRenaming(false);
                    }}
                    onClick={e => e.stopPropagation()}
                    className="flex-1 min-w-0 bg-cream-2 border border-ink text-ink text-[11px] rounded px-1 py-0.5 focus:outline-none"
                />
            ) : (
                <span
                    className={`flex-1 min-w-0 truncate text-[11px] ${isActive ? 'text-ink' : 'text-ink-2'} ${
                        visible ? '' : 'opacity-60'
                    }`}
                    onDoubleClick={() => {
                        setNameDraft(name);
                        setRenaming(true);
                    }}
                    title={`${name} - double-click to rename, drag to reorder`}
                >
                    {name}
                </span>
            )}

            {fxCount > 0 && kind === 'pixel' && (
                <span className="text-[9px] font-bold italic text-glx-orange flex-shrink-0" title={`${fxCount} effect(s)`}>
                    fx
                </span>
            )}
            {hasMask && (
                <span title="Layer has a mask">
                    <Scan className="w-3 h-3 text-sky-600 flex-shrink-0" />
                </span>
            )}
        </div>
    );
};

/** the imported image: always at the bottom, locked like Photoshop's Background */
const BackgroundRow: React.FC<{
    isActive: boolean;
    drop: boolean;
    onDragOverRow: () => void;
    onDropRow: () => void;
}> = ({ isActive, drop, onDragOverRow, onDropRow }) => {
    const { originalImage, setActiveLayerId, backgroundVisible, backgroundLocked, setBackgroundVisible, setBackgroundLocked } =
        useApp();
    const thumb = useMemo(() => (originalImage ? imageDataToThumbnail(originalImage, null) : null), [originalImage]);
    return (
        <div
            onDragOver={e => {
                e.preventDefault();
                onDragOverRow();
            }}
            onDrop={e => {
                e.preventDefault();
                onDropRow();
            }}
            onClick={() => setActiveLayerId(null)}
            className={`relative flex items-center gap-1.5 px-1.5 py-1 rounded-md cursor-pointer border ${
                isActive ? 'bg-blue-600/20 border-blue-600/60' : 'border-transparent hover:bg-white/60'
            }`}
        >
            {drop && <div className="absolute left-1 right-1 -top-px h-0.5 bg-glx-orange rounded pointer-events-none" />}
            <button
                onClick={e => {
                    e.stopPropagation();
                    if (!backgroundLocked) setBackgroundVisible(!backgroundVisible);
                }}
                disabled={backgroundLocked}
                className={`p-0.5 flex-shrink-0 ${backgroundVisible ? 'text-ink' : 'text-ink-2/70'} disabled:cursor-not-allowed`}
                title={
                    backgroundLocked
                        ? 'Background is locked visible - click the lock to unlock it'
                        : backgroundVisible
                          ? 'Hide Background (layers composite over transparency)'
                          : 'Show Background'
                }
            >
                {backgroundVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            </button>
            {thumb && (
                <img
                    src={thumb}
                    alt=""
                    draggable={false}
                    className="w-8 h-8 object-contain rounded-sm border border-ink bg-cream-2 flex-shrink-0"
                />
            )}
            <span
                className={`flex-1 min-w-0 truncate text-[11px] italic ${isActive ? 'text-ink' : 'text-ink-2'} ${
                    backgroundVisible ? '' : 'opacity-60'
                }`}
            >
                Background
            </span>
            <button
                onClick={e => {
                    e.stopPropagation();
                    setBackgroundLocked(!backgroundLocked);
                }}
                className="p-0.5 flex-shrink-0 text-ink-2 hover:text-ink"
                title={
                    backgroundLocked
                        ? 'Locked visible - click to unlock, then hide it with the eye'
                        : 'Unlocked - click to lock it visible again'
                }
            >
                {backgroundLocked ? <Lock className="w-3 h-3" /> : <LockOpen className="w-3 h-3" />}
            </button>
        </div>
    );
};

/** a toolbar icon that opens a native picker of effects (grouped) */
const EffectSelect: React.FC<{
    icon: React.ReactNode;
    title: string;
    disabled?: boolean;
    onPick: (t: EffectType) => void;
}> = ({ icon, title, disabled, onPick }) => (
    <label
        className={`relative p-1.5 rounded text-ink-2 transition-colors ${
            disabled ? 'opacity-30 cursor-not-allowed' : 'hover:text-ink hover:bg-white cursor-pointer'
        }`}
        title={title}
    >
        {icon}
        <select
            value=""
            disabled={disabled}
            onChange={e => {
                if (e.target.value) onPick(e.target.value as EffectType);
            }}
            className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
            aria-label={title}
        >
            <option value="">{title}</option>
            {EFFECT_GROUPS.map(g => (
                <optgroup key={g.id} label={g.label}>
                    {EFFECTS.filter(e => e.group === g.id).map(e => (
                        <option key={e.type} value={e.type}>
                            {e.label}
                        </option>
                    ))}
                </optgroup>
            ))}
        </select>
    </label>
);

const ToolButton: React.FC<{
    title: string;
    disabled?: boolean;
    danger?: boolean;
    onClick: () => void;
    children: React.ReactNode;
}> = ({ title, disabled, danger, onClick, children }) => (
    <button
        onClick={onClick}
        disabled={disabled}
        title={title}
        className={`p-1.5 rounded text-ink-2 transition-colors disabled:opacity-30 ${
            danger ? 'hover:text-red-600' : 'hover:text-ink'
        } hover:bg-white disabled:hover:bg-transparent`}
    >
        {children}
    </button>
);

/** Layers tab of the right-hand dock. */
export const LayersPanel: React.FC = () => {
    const {
        layers,
        activeLayerId,
        updateLayer,
        reorderLayer,
        duplicateLayer,
        deleteLayer,
        mergeDown,
        addEffect,
        addAdjustmentLayer,
        selection,
        setLayerMaskFromSelection,
        toast,
    } = useApp();
    const active = layers.find(l => l.id === activeLayerId) ?? null;

    // opacity: live local value, committed debounced so big composites don't lag the drag
    const [opacityDraft, setOpacityDraft] = useState<number | null>(null);
    const commitTimer = useRef<number | null>(null);
    const setOpacity = (value: number, final: boolean) => {
        if (!active) return;
        setOpacityDraft(final ? null : value);
        if (commitTimer.current) window.clearTimeout(commitTimer.current);
        if (final) {
            updateLayer(active.id, { opacity: value });
        } else {
            commitTimer.current = window.setTimeout(() => updateLayer(active.id, { opacity: value }), 120);
        }
    };

    // drag-and-drop reorder
    const [dragId, setDragId] = useState<string | null>(null);
    const [dropSpot, setDropSpot] = useState<DropSpot>(null);
    const endDrag = () => {
        setDragId(null);
        setDropSpot(null);
    };
    const commitDrop = () => {
        if (!dragId || !dropSpot) return endDrag();
        const from = layers.findIndex(l => l.id === dragId);
        if (dropSpot.id === null) {
            reorderLayer(dragId, 0); // onto the Background: lowest layer
        } else {
            const t = layers.findIndex(l => l.id === dropSpot.id);
            const tAfterRemoval = from < t ? t - 1 : t;
            reorderLayer(dragId, tAfterRemoval + (dropSpot.above ? 1 : 0));
        }
        endDrag();
    };

    const blendDisabled = !active;

    return (
        <>
            {/* Photoshop-style header: blend mode + opacity of the active layer */}
            <div data-tour="layer-blend" className={`p-2 border-b border-line space-y-1.5 ${blendDisabled ? 'opacity-50' : ''}`}>
                <div className="flex items-center gap-2">
                    <Tooltip help={HELP.blendMode}>
                        <select
                            value={active?.blendMode ?? 'normal'}
                            disabled={blendDisabled}
                            onChange={e =>
                                active && updateLayer(active.id, { blendMode: e.target.value as GlitchLayer['blendMode'] })
                            }
                            className="flex-1 min-w-0 bg-cream-2 border border-ink text-ink text-[11px] rounded px-1.5 py-1 focus:outline-none focus:border-glx-orange"
                            title="Blend mode"
                        >
                            {BLEND_MODES.map(m => (
                                <React.Fragment key={m.value}>
                                    {m.group && <option disabled>──────────</option>}
                                    <option value={m.value}>{m.label}</option>
                                </React.Fragment>
                            ))}
                        </select>
                    </Tooltip>
                    <span className="text-[10px] font-mono text-ink-2 w-9 text-right">
                        {active ? `${opacityDraft ?? active.opacity}%` : '—'}
                    </span>
                </div>
                <Tooltip help={HELP.layerOpacity}>
                    <input
                        type="range"
                        min={0}
                        max={100}
                        disabled={blendDisabled}
                        value={active ? (opacityDraft ?? active.opacity) : 100}
                        onChange={e => setOpacity(parseInt(e.target.value), false)}
                        onPointerUp={e => setOpacity(parseInt((e.target as HTMLInputElement).value), true)}
                        onKeyUp={e => setOpacity(parseInt((e.target as HTMLInputElement).value), true)}
                        className="w-full h-1.5 bg-cream-3 rounded-lg appearance-none cursor-pointer accent-glx-orange"
                    />
                </Tooltip>
            </div>

            {/* stack, top layer first, Background last */}
            <div data-tour="layer-list" className="overflow-y-auto custom-scrollbar p-1.5 space-y-0.5 max-h-72 min-h-0 flex-shrink-0">
                {[...layers].reverse().map(layer => (
                    <LayerRow
                        key={layer.id}
                        id={layer.id}
                        name={layer.name}
                        kind={layer.kind}
                        visible={layer.visible}
                        hasMask={layer.mask !== null}
                        fxCount={layer.effects.filter(e => e.enabled).length}
                        thumb={layer.thumb}
                        isActive={layer.id === activeLayerId}
                        drop={
                            dragId && dragId !== layer.id && dropSpot?.id === layer.id
                                ? dropSpot.above
                                    ? 'above'
                                    : 'below'
                                : null
                        }
                        onDragStart={setDragId}
                        onDragOverRow={(id, above) => setDropSpot({ id, above })}
                        onDropRow={commitDrop}
                        onDragEnd={endDrag}
                    />
                ))}
                <BackgroundRow
                    isActive={activeLayerId === null}
                    drop={!!dragId && dropSpot?.id === null}
                    onDragOverRow={() => setDropSpot({ id: null, above: true })}
                    onDropRow={commitDrop}
                />
                {layers.length === 0 && (
                    <p className="px-1.5 pt-1.5 text-[11px] text-ink-2 leading-relaxed">
                        Press <kbd className="px-1 border border-ink rounded bg-cream-2 font-mono">E</kbd> to encode - it
                        lands as Layer 1 above your image, the next as Layer 2, and so on.
                    </p>
                )}
            </div>

            {/* footer toolbar, Photoshop order */}
            <div data-tour="layer-footer" className="flex items-center justify-between px-1.5 py-1 border-t border-line">
                <div className="flex items-center">
                    <EffectSelect
                        icon={<span className="block w-3.5 h-3.5 leading-[14px] text-center text-[11px] font-bold italic font-serif">fx</span>}
                        title="Add effect to layer"
                        disabled={!active}
                        onPick={t => active && addEffect(active.id, t)}
                    />
                    <EffectSelect
                        icon={<Contrast className="w-3.5 h-3.5" />}
                        title="New adjustment layer"
                        onPick={addAdjustmentLayer}
                    />
                    <ToolButton
                        title="Add mask from selection"
                        disabled={!active || !selection}
                        onClick={() => {
                            if (!active) return;
                            setLayerMaskFromSelection(active.id);
                            toast('success', `Mask set on ${active.name}`);
                        }}
                    >
                        <Scan className="w-3.5 h-3.5" />
                    </ToolButton>
                </div>
                <div className="flex items-center">
                    <ToolButton
                        title={active && layers.indexOf(active) === 0 ? 'Merge down into Background (⌘E)' : 'Merge down (⌘E)'}
                        disabled={!active}
                        onClick={() => active && mergeDown(active.id)}
                    >
                        <ArrowDownToLine className="w-3.5 h-3.5" />
                    </ToolButton>
                    <ToolButton title="Duplicate layer (⌘J)" disabled={!active} onClick={() => active && duplicateLayer(active.id)}>
                        <Copy className="w-3.5 h-3.5" />
                    </ToolButton>
                    <ToolButton title="Delete layer" danger disabled={!active} onClick={() => active && deleteLayer(active.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                    </ToolButton>
                </div>
            </div>

            <LayerProperties />
        </>
    );
};
