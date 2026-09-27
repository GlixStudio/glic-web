import React, { useRef, useState } from 'react';
import { useApp } from '../core/AppContext';
import { BLEND_MODES, type GlitchLayer } from '../core/layers';
import { imageDataToThumbnail } from '../core/imageio';
import { HELP } from '../core/help';
import { Tooltip } from './controls/Tooltip';
import {
    Eye,
    EyeOff,
    Layers,
    ChevronUp,
    ArrowUp,
    ArrowDown,
    Copy,
    Trash2,
    Combine,
    Scan,
} from 'lucide-react';

// Only primitives cross this prop boundary on purpose: React's dev-mode render
// profiler deep-diffs changed props, and a GlitchLayer carries multi-megabyte
// typed arrays (file, mask) that it would walk element by element on every update.
interface LayerRowProps {
    id: string;
    name: string;
    visible: boolean;
    hasMask: boolean;
    thumb: string | null;
    isActive: boolean;
    isTop: boolean;
    isBottom: boolean;
}

const LayerRow: React.FC<LayerRowProps> = ({ id, name, visible, hasMask, thumb, isActive, isTop, isBottom }) => {
    const { setActiveLayerId, updateLayer, moveLayer, duplicateLayer, deleteLayer } = useApp();
    const [renaming, setRenaming] = useState(false);
    const [nameDraft, setNameDraft] = useState(name);

    const commitRename = () => {
        const next = nameDraft.trim();
        if (next) updateLayer(id, { name: next });
        setRenaming(false);
    };

    return (
        <div
            className={`group flex items-center gap-1.5 px-1.5 py-1 rounded-md cursor-pointer border ${
                isActive ? 'bg-blue-600/20 border-blue-600/60' : 'border-transparent hover:bg-white/60'
            }`}
            onClick={() => setActiveLayerId(id)}
        >
            <button
                onClick={e => {
                    e.stopPropagation();
                    updateLayer(id, { visible: !visible });
                }}
                className={`p-0.5 flex-shrink-0 ${visible ? 'text-ink' : 'text-ink-2/70'}`}
                title={visible ? 'Hide layer' : 'Show layer'}
            >
                {visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            </button>

            {thumb ? (
                <img
                    src={thumb}
                    alt=""
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
                    className={`flex-1 min-w-0 truncate text-[11px] ${isActive ? 'text-ink' : 'text-ink-2'}`}
                    onDoubleClick={() => {
                        setNameDraft(name);
                        setRenaming(true);
                    }}
                    title={`${name} - double-click to rename`}
                >
                    {name}
                </span>
            )}

            {hasMask && (
                <span title="Layer has a mask">
                    <Scan className="w-3 h-3 text-sky-600 flex-shrink-0" />
                </span>
            )}

            <div className="hidden group-hover:flex items-center flex-shrink-0">
                <button
                    onClick={e => {
                        e.stopPropagation();
                        moveLayer(id, 1);
                    }}
                    disabled={isTop}
                    className="p-0.5 text-ink-2 hover:text-ink disabled:opacity-30"
                    title="Move up"
                >
                    <ArrowUp className="w-3 h-3" />
                </button>
                <button
                    onClick={e => {
                        e.stopPropagation();
                        moveLayer(id, -1);
                    }}
                    disabled={isBottom}
                    className="p-0.5 text-ink-2 hover:text-ink disabled:opacity-30"
                    title="Move down"
                >
                    <ArrowDown className="w-3 h-3" />
                </button>
                <button
                    onClick={e => {
                        e.stopPropagation();
                        duplicateLayer(id);
                    }}
                    className="p-0.5 text-ink-2 hover:text-ink"
                    title="Duplicate layer"
                >
                    <Copy className="w-3 h-3" />
                </button>
                <button
                    onClick={e => {
                        e.stopPropagation();
                        deleteLayer(id);
                    }}
                    className="p-0.5 text-ink-2 hover:text-red-600"
                    title="Delete layer"
                >
                    <Trash2 className="w-3 h-3" />
                </button>
            </div>
        </div>
    );
};

export const LayersPanel: React.FC = () => {
    const {
        layers,
        activeLayerId,
        updateLayer,
        flatten,
        selection,
        setSelection,
        setLayerMaskFromSelection,
        toast,
    } = useApp();
    const [collapsed, setCollapsed] = useState(false);
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

    if (layers.length === 0) return null;

    if (collapsed) {
        return (
            <button
                onClick={() => setCollapsed(false)}
                onPointerDown={e => e.stopPropagation()}
                onPointerUp={e => e.stopPropagation()}
                className="absolute right-4 top-16 z-10 flex items-center gap-1.5 px-3 py-1.5 bg-cream-2 border border-ink rounded-lg backdrop-blur-sm text-xs text-ink hover:bg-white transition-colors"
                title="Show layers"
            >
                <Layers className="w-3.5 h-3.5" /> Layers · {layers.length}
            </button>
        );
    }

    return (
        <div
            data-tour="layers"
            className="absolute right-4 top-16 z-10 w-60 bg-cream border border-ink rounded-lg backdrop-blur-sm flex flex-col max-h-[70%]"
            onPointerDown={e => e.stopPropagation()}
            onPointerUp={e => e.stopPropagation()}
        >
            <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-line">
                <Tooltip help={HELP.layersPanel}>
                <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-2 cursor-help">
                    <Layers className="w-3 h-3" /> Layers
                </span>
                </Tooltip>
                <div className="flex items-center gap-0.5">
                    <Tooltip help={HELP.flatten}>
                    <button onClick={flatten} title="Flatten" className="p-1 text-ink-2 hover:text-ink transition-colors">
                        <Combine className="w-3.5 h-3.5" />
                    </button>
                    </Tooltip>
                    <button
                        onClick={() => setCollapsed(true)}
                        className="p-1 text-ink-2 hover:text-ink transition-colors"
                        title="Collapse"
                    >
                        <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* stack, top layer first */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-1.5 space-y-0.5">
                {[...layers].reverse().map((layer, i) => (
                    <LayerRow
                        key={layer.id}
                        id={layer.id}
                        name={layer.name}
                        visible={layer.visible}
                        hasMask={layer.mask !== null}
                        thumb={layer.thumb}
                        isActive={layer.id === activeLayerId}
                        isTop={i === 0}
                        isBottom={i === layers.length - 1}
                    />
                ))}
            </div>

            {/* active layer controls */}
            {active && (
                <div className="border-t border-line p-2.5 space-y-2">
                    <div className="flex items-center gap-2">
                        <Tooltip help={HELP.blendMode}>
                        <select
                            value={active.blendMode}
                            onChange={e => updateLayer(active.id, { blendMode: e.target.value as GlitchLayer['blendMode'] })}
                            className="flex-1 min-w-0 bg-cream-2 border border-ink text-ink text-[11px] rounded px-1.5 py-1 focus:outline-none focus:border-glx-orange"
                            title="Blend mode"
                        >
                            {BLEND_MODES.map(m => (
                                <option key={m.value} value={m.value}>
                                    {m.label}
                                </option>
                            ))}
                        </select>
                        </Tooltip>
                        <span className="text-[10px] font-mono text-ink-2 w-8 text-right">
                            {opacityDraft ?? active.opacity}%
                        </span>
                    </div>
                    <Tooltip help={HELP.layerOpacity}>
                    <input
                        type="range"
                        min={0}
                        max={100}
                        value={opacityDraft ?? active.opacity}
                        onChange={e => setOpacity(parseInt(e.target.value), false)}
                        onPointerUp={e => setOpacity(parseInt((e.target as HTMLInputElement).value), true)}
                        onKeyUp={e => setOpacity(parseInt((e.target as HTMLInputElement).value), true)}
                        className="w-full h-1.5 bg-cream-3 rounded-lg appearance-none cursor-pointer accent-glx-orange"
                    />
                    </Tooltip>

                    <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                        <Tooltip help={HELP.setMask}>
                        <button
                            onClick={() => {
                                if (!selection) return;
                                setLayerMaskFromSelection(active.id);
                                toast('success', `Mask set on ${active.name}`);
                            }}
                            disabled={!selection}
                            className="py-1.5 rounded bg-cream-3 hover:bg-white text-ink disabled:opacity-40 transition-colors"
                        >
                            Set mask
                        </button>
                        </Tooltip>
                        <Tooltip help={HELP.editMask}>
                        <button
                            onClick={() => active.mask && setSelection(active.mask.slice())}
                            disabled={!active.mask}
                            className="py-1.5 rounded bg-cream-3 hover:bg-white text-ink disabled:opacity-40 transition-colors"
                        >
                            Edit mask
                        </button>
                        </Tooltip>
                        <Tooltip help={HELP.removeMask}>
                        <button
                            onClick={() =>
                                updateLayer(active.id, {
                                    mask: null,
                                    thumb: imageDataToThumbnail(active.result, null),
                                })
                            }
                            disabled={!active.mask}
                            className="py-1.5 rounded bg-cream-3 hover:bg-white text-ink disabled:opacity-40 transition-colors"
                        >
                            Remove
                        </button>
                        </Tooltip>
                    </div>
                </div>
            )}
        </div>
    );
};
