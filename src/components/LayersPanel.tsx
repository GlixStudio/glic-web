import React, { useRef, useState } from 'react';
import { useApp } from '../core/AppContext';
import { BLEND_MODES, type GlitchLayer } from '../core/layers';
import { imageDataToThumbnail } from '../core/imageio';
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

const LayerRow: React.FC<{ layer: GlitchLayer; isActive: boolean; isTop: boolean; isBottom: boolean }> = ({
    layer,
    isActive,
    isTop,
    isBottom,
}) => {
    const { setActiveLayerId, updateLayer, moveLayer, duplicateLayer, deleteLayer } = useApp();
    const [renaming, setRenaming] = useState(false);
    const [nameDraft, setNameDraft] = useState(layer.name);

    const commitRename = () => {
        const name = nameDraft.trim();
        if (name) updateLayer(layer.id, { name });
        setRenaming(false);
    };

    return (
        <div
            className={`group flex items-center gap-1.5 px-1.5 py-1 rounded-md cursor-pointer border ${
                isActive ? 'bg-blue-600/20 border-blue-600/60' : 'border-transparent hover:bg-zinc-800/60'
            }`}
            onClick={() => setActiveLayerId(layer.id)}
        >
            <button
                onClick={e => {
                    e.stopPropagation();
                    updateLayer(layer.id, { visible: !layer.visible });
                }}
                className={`p-0.5 flex-shrink-0 ${layer.visible ? 'text-zinc-300' : 'text-zinc-600'}`}
                title={layer.visible ? 'Hide layer' : 'Show layer'}
            >
                {layer.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            </button>

            {layer.thumb ? (
                <img
                    src={layer.thumb}
                    alt=""
                    className="w-8 h-8 object-contain rounded-sm border border-zinc-700 bg-zinc-900 flex-shrink-0"
                    style={{ imageRendering: 'pixelated' }}
                />
            ) : (
                <div className="w-8 h-8 rounded-sm border border-zinc-700 bg-zinc-900 flex-shrink-0" />
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
                    className="flex-1 min-w-0 bg-zinc-900 border border-zinc-600 text-zinc-200 text-[11px] rounded px-1 py-0.5 focus:outline-none"
                />
            ) : (
                <span
                    className={`flex-1 min-w-0 truncate text-[11px] ${isActive ? 'text-zinc-100' : 'text-zinc-400'}`}
                    onDoubleClick={() => {
                        setNameDraft(layer.name);
                        setRenaming(true);
                    }}
                    title={`${layer.name} - double-click to rename`}
                >
                    {layer.name}
                </span>
            )}

            {layer.mask && (
                <span title="Layer has a mask">
                    <Scan className="w-3 h-3 text-blue-400 flex-shrink-0" />
                </span>
            )}

            <div className="hidden group-hover:flex items-center flex-shrink-0">
                <button
                    onClick={e => {
                        e.stopPropagation();
                        moveLayer(layer.id, 1);
                    }}
                    disabled={isTop}
                    className="p-0.5 text-zinc-500 hover:text-zinc-200 disabled:opacity-30"
                    title="Move up"
                >
                    <ArrowUp className="w-3 h-3" />
                </button>
                <button
                    onClick={e => {
                        e.stopPropagation();
                        moveLayer(layer.id, -1);
                    }}
                    disabled={isBottom}
                    className="p-0.5 text-zinc-500 hover:text-zinc-200 disabled:opacity-30"
                    title="Move down"
                >
                    <ArrowDown className="w-3 h-3" />
                </button>
                <button
                    onClick={e => {
                        e.stopPropagation();
                        duplicateLayer(layer.id);
                    }}
                    className="p-0.5 text-zinc-500 hover:text-zinc-200"
                    title="Duplicate layer"
                >
                    <Copy className="w-3 h-3" />
                </button>
                <button
                    onClick={e => {
                        e.stopPropagation();
                        deleteLayer(layer.id);
                    }}
                    className="p-0.5 text-zinc-500 hover:text-red-400"
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
                className="absolute right-4 top-16 z-10 flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900/90 border border-zinc-700 rounded-lg backdrop-blur-sm text-xs text-zinc-300 hover:bg-zinc-800 transition-colors"
                title="Show layers"
            >
                <Layers className="w-3.5 h-3.5" /> Layers · {layers.length}
            </button>
        );
    }

    return (
        <div
            className="absolute right-4 top-16 z-10 w-60 bg-zinc-900/95 border border-zinc-700 rounded-lg backdrop-blur-sm flex flex-col max-h-[70%]"
            onPointerDown={e => e.stopPropagation()}
            onPointerUp={e => e.stopPropagation()}
        >
            <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-zinc-800">
                <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                    <Layers className="w-3 h-3" /> Layers
                </span>
                <div className="flex items-center gap-0.5">
                    <button
                        onClick={flatten}
                        className="p-1 text-zinc-500 hover:text-zinc-200 transition-colors"
                        title="Flatten: bake the composite into a new baseline (undoable)"
                    >
                        <Combine className="w-3.5 h-3.5" />
                    </button>
                    <button
                        onClick={() => setCollapsed(true)}
                        className="p-1 text-zinc-500 hover:text-zinc-200 transition-colors"
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
                        layer={layer}
                        isActive={layer.id === activeLayerId}
                        isTop={i === 0}
                        isBottom={i === layers.length - 1}
                    />
                ))}
            </div>

            {/* active layer controls */}
            {active && (
                <div className="border-t border-zinc-800 p-2.5 space-y-2">
                    <div className="flex items-center gap-2">
                        <select
                            value={active.blendMode}
                            onChange={e => updateLayer(active.id, { blendMode: e.target.value as GlitchLayer['blendMode'] })}
                            className="flex-1 min-w-0 bg-zinc-900 border border-zinc-700 text-zinc-200 text-[11px] rounded px-1.5 py-1 focus:outline-none focus:border-blue-500"
                            title="Blend mode"
                        >
                            {BLEND_MODES.map(m => (
                                <option key={m.value} value={m.value}>
                                    {m.label}
                                </option>
                            ))}
                        </select>
                        <span className="text-[10px] font-mono text-zinc-400 w-8 text-right">
                            {opacityDraft ?? active.opacity}%
                        </span>
                    </div>
                    <input
                        type="range"
                        min={0}
                        max={100}
                        value={opacityDraft ?? active.opacity}
                        onChange={e => setOpacity(parseInt(e.target.value), false)}
                        onPointerUp={e => setOpacity(parseInt((e.target as HTMLInputElement).value), true)}
                        onKeyUp={e => setOpacity(parseInt((e.target as HTMLInputElement).value), true)}
                        className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        title="Layer opacity"
                    />

                    <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                        <button
                            onClick={() => {
                                if (!selection) return;
                                setLayerMaskFromSelection(active.id);
                                toast('success', `Mask set on ${active.name}`);
                            }}
                            disabled={!selection}
                            className="py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 disabled:opacity-40 transition-colors"
                            title="Replace this layer's mask with the working selection"
                        >
                            Set mask
                        </button>
                        <button
                            onClick={() => active.mask && setSelection(active.mask.slice())}
                            disabled={!active.mask}
                            className="py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 disabled:opacity-40 transition-colors"
                            title="Load this layer's mask into the working selection for editing"
                        >
                            Edit mask
                        </button>
                        <button
                            onClick={() =>
                                updateLayer(active.id, {
                                    mask: null,
                                    thumb: imageDataToThumbnail(active.result, null),
                                })
                            }
                            disabled={!active.mask}
                            className="py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 disabled:opacity-40 transition-colors"
                            title="Remove this layer's mask (full-frame)"
                        >
                            Remove
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
