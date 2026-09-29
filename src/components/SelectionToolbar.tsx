import React, { useRef } from 'react';
import { type CombineMode, type SelectionTool, type ToolOptions } from '../core/selection';
import { Segmented } from './controls/Modal';
import { HELP, type HelpEntry } from '../core/help';
import { Tooltip } from './controls/Tooltip';
import { Hand, Move, SquareDashed, CircleDashed, Lasso, Wand2, Paintbrush, Plus, Minus, Square, XCircle, RotateCcw, Blend, FileUp, FileDown, SquaresIntersect } from 'lucide-react';

interface ToolDef {
    id: SelectionTool;
    icon: React.ReactNode;
    help: HelpEntry;
}

const TOOLS: ToolDef[] = [
    { id: 'move', icon: <Move className="w-4 h-4" />, help: HELP.toolMove },
    { id: 'rect', icon: <SquareDashed className="w-4 h-4" />, help: HELP.toolRect },
    { id: 'ellipse', icon: <CircleDashed className="w-4 h-4" />, help: HELP.toolEllipse },
    { id: 'lasso', icon: <Lasso className="w-4 h-4" />, help: HELP.toolLasso },
    { id: 'wand', icon: <Wand2 className="w-4 h-4" />, help: HELP.toolWand },
    { id: 'brush', icon: <Paintbrush className="w-4 h-4" />, help: HELP.toolBrush },
    { id: 'hand', icon: <Hand className="w-4 h-4" />, help: HELP.toolHand },
];

const MODES: { id: CombineMode; icon: React.ReactNode; label: string }[] = [
    { id: 'replace', icon: <Square className="w-3.5 h-3.5" />, label: 'New selection' },
    { id: 'add', icon: <Plus className="w-3.5 h-3.5" />, label: 'Add (Shift)' },
    { id: 'subtract', icon: <Minus className="w-3.5 h-3.5" />, label: 'Subtract (Alt)' },
    { id: 'intersect', icon: <SquaresIntersect className="w-3.5 h-3.5" />, label: 'Intersect (Shift+Alt)' },
];

export type ObjectStatus = null | { kind: 'loading'; fraction: number } | { kind: 'busy' };

interface Props {
    objectStatus: ObjectStatus;
    tool: SelectionTool;
    setTool: (t: SelectionTool) => void;
    options: ToolOptions;
    setOptions: (o: ToolOptions) => void;
    hasSelection: boolean;
    hasLastSelection: boolean;
    coveragePct: number | null;
    onSelectAll: () => void;
    onClear: () => void;
    onInvert: () => void;
    onReselect: () => void;
    onApplyFeather: () => void;
    onImportMask: (file: File) => void;
    onExportMask: () => void;
}

export const SelectionToolbar: React.FC<Props> = ({
    tool,
    setTool,
    options,
    setOptions,
    hasSelection,
    hasLastSelection,
    coveragePct,
    onSelectAll,
    onClear,
    onInvert,
    onReselect,
    onApplyFeather,
    onImportMask,
    onExportMask,
    objectStatus,
}) => {
    const showOptions = tool !== 'move' && tool !== 'hand';
    const maskInputRef = useRef<HTMLInputElement>(null);

    return (
        // stop pointer events here: clicks on the toolbar must not become canvas
        // gestures (a leaked pointerup would read as click-away and clear the mask)
        <div
            data-tour="selection-tools"
            className="absolute left-4 top-1/2 -translate-y-1/2 z-10 flex items-start gap-2"
            onPointerDown={e => e.stopPropagation()}
            onPointerUp={e => e.stopPropagation()}
        >
            {/* tool strip */}
            <div className="flex flex-col bg-cream-2 border border-ink rounded-lg backdrop-blur-sm overflow-hidden">
                {TOOLS.map(t => (
                    <Tooltip key={t.id} help={t.help}>
                        <button
                            onClick={() => setTool(t.id)}
                            className={`p-2.5 transition-colors ${
                                tool === t.id ? 'bg-glx-orange text-ink' : 'text-ink hover:bg-white'
                            }`}
                        >
                            {t.icon}
                        </button>
                    </Tooltip>
                ))}
            </div>

            {/* context options */}
            {showOptions && (
                <div className="flex flex-col gap-2.5 bg-cream-2 border border-ink rounded-lg backdrop-blur-sm p-2.5 w-44">
                    <Tooltip help={HELP.combineMode}>
                    <div className="flex rounded-md overflow-hidden border border-ink">
                        {MODES.map(m => (
                            <button
                                key={m.id}
                                onClick={() => setOptions({ ...options, mode: m.id })}
                                className={`flex-1 flex items-center justify-center py-1.5 transition-colors ${
                                    options.mode === m.id ? 'bg-glx-orange text-ink' : 'text-ink-2 hover:bg-white'
                                }`}
                                title={m.label}
                            >
                                {m.icon}
                            </button>
                        ))}
                    </div>
                    </Tooltip>

                    {tool === 'brush' && (
                        <Tooltip help={HELP.brushSize}>
                        <label className="flex flex-col gap-1 text-[10px] text-ink-2 uppercase tracking-wide">
                            <span className="flex justify-between">
                                Brush size <span className="font-mono text-ink">{options.brushSize}px</span>
                            </span>
                            <input
                                type="range"
                                min={2}
                                max={512}
                                value={options.brushSize}
                                onChange={e => setOptions({ ...options, brushSize: parseInt(e.target.value) })}
                                className="w-full h-1.5 bg-cream-3 rounded-lg appearance-none cursor-pointer accent-glx-orange"
                            />
                            <span className="normal-case tracking-normal text-ink-2">[ and ] resize · Alt erases</span>
                        </label>
                        </Tooltip>
                    )}

                    {tool === 'wand' && (
                        <>
                            <Tooltip help={HELP.wandMode}>
                                <div>
                                    <Segmented<ToolOptions['wandMode']>
                                        value={options.wandMode}
                                        onChange={wandMode => setOptions({ ...options, wandMode })}
                                        options={[
                                            { value: 'color', label: 'Color' },
                                            { value: 'object', label: 'Object' },
                                        ]}
                                    />
                                </div>
                            </Tooltip>
                            {options.wandMode === 'color' ? (
                                <>
                                <Tooltip help={HELP.tolerance}>
                                <label className="flex flex-col gap-1 text-[10px] text-ink-2 uppercase tracking-wide">
                                    <span className="flex justify-between">
                                        Tolerance <span className="font-mono text-ink">{options.tolerance}</span>
                                    </span>
                                    <input
                                        type="range"
                                        min={0}
                                        max={255}
                                        value={options.tolerance}
                                        onChange={e => setOptions({ ...options, tolerance: parseInt(e.target.value) })}
                                        className="w-full h-1.5 bg-cream-3 rounded-lg appearance-none cursor-pointer accent-glx-orange"
                                    />
                                </label>
                                </Tooltip>
                                <Tooltip help={HELP.contiguous}>
                                <label className="flex items-center justify-between text-[10px] text-ink-2 uppercase tracking-wide cursor-pointer">
                                    Contiguous
                                    <input
                                        type="checkbox"
                                        checked={options.contiguous}
                                        onChange={e => setOptions({ ...options, contiguous: e.target.checked })}
                                        className="accent-glx-green"
                                    />
                                </label>
                                </Tooltip>
                                </>
                            ) : (
                                <>
                                    <Tooltip help={HELP.objectSource}>
                                        <div className="space-y-1">
                                            <div className="text-[10px] text-ink-2 uppercase tracking-wide">Detect on</div>
                                            <Segmented<ToolOptions['objectSource']>
                                                value={options.objectSource}
                                                onChange={objectSource => setOptions({ ...options, objectSource })}
                                                options={[
                                                    { value: 'source', label: 'Original' },
                                                    { value: 'visible', label: 'Visible' },
                                                ]}
                                            />
                                        </div>
                                    </Tooltip>
                                    {objectStatus?.kind === 'loading' ? (
                                        <div className="space-y-1">
                                            <div className="w-full bg-cream-3 rounded-full h-1.5 overflow-hidden">
                                                <div
                                                    className="bg-glx-orange h-full transition-all"
                                                    style={{ width: `${Math.round(objectStatus.fraction * 100)}%` }}
                                                />
                                            </div>
                                            <p className="text-[10px] text-ink-2">Loading object model (once, ~18 MB)…</p>
                                        </div>
                                    ) : (
                                        <p className="text-[10px] text-ink-2 leading-snug">
                                            {objectStatus?.kind === 'busy'
                                                ? 'Finding the object…'
                                                : 'Click an object, or drag along it. Shift adds, Alt subtracts, Shift+Alt intersects.'}
                                        </p>
                                    )}
                                </>
                            )}
                        </>
                    )}

                    <Tooltip help={HELP.feather}>
                    <label className="flex flex-col gap-1 text-[10px] text-ink-2 uppercase tracking-wide">
                        <span className="flex justify-between">
                            Feather <span className="font-mono text-ink">{options.feather}px</span>
                        </span>
                        <input
                            type="range"
                            min={0}
                            max={64}
                            value={options.feather}
                            onChange={e => setOptions({ ...options, feather: parseInt(e.target.value) })}
                            className="w-full h-1.5 bg-cream-3 rounded-lg appearance-none cursor-pointer accent-glx-orange"
                        />
                    </label>
                    </Tooltip>

                    <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                        <Tooltip help={HELP.selectAll}>
                        <button onClick={onSelectAll} className="py-1.5 rounded bg-cream-3 hover:bg-white text-ink transition-colors">
                            All
                        </button>
                        </Tooltip>
                        <Tooltip help={HELP.invertSelection}>
                        <button
                            onClick={onInvert}
                            disabled={!hasSelection}
                            className="py-1.5 rounded bg-cream-3 hover:bg-white text-ink disabled:opacity-40 transition-colors"
                        >
                            Invert
                        </button>
                        </Tooltip>
                        <Tooltip help={HELP.clearSelection}>
                        <button
                            onClick={onClear}
                            disabled={!hasSelection}
                            className="py-1.5 rounded bg-cream-3 hover:bg-white text-ink disabled:opacity-40 transition-colors flex items-center justify-center gap-1"
                        >
                            <XCircle className="w-3 h-3" /> Clear
                        </button>
                        </Tooltip>
                        <Tooltip help={HELP.reselect}>
                        <button
                            onClick={onReselect}
                            disabled={!hasLastSelection || hasSelection}
                            className="py-1.5 rounded bg-cream-3 hover:bg-white text-ink disabled:opacity-40 transition-colors flex items-center justify-center gap-1"
                        >
                            <RotateCcw className="w-3 h-3" /> Redo
                        </button>
                        </Tooltip>
                    </div>
                    <Tooltip help={HELP.featherApply}>
                    <button
                        onClick={onApplyFeather}
                        disabled={!hasSelection || options.feather === 0}
                        className="py-1.5 rounded bg-cream-3 hover:bg-white text-ink disabled:opacity-40 transition-colors text-[10px] flex items-center justify-center gap-1"
                    >
                        <Blend className="w-3 h-3" /> Feather selection
                    </button>
                    </Tooltip>

                    <div className="grid grid-cols-2 gap-1.5 text-[10px] pt-1 border-t border-line">
                        <Tooltip help={HELP.maskIn}>
                        <button
                            onClick={() => maskInputRef.current?.click()}
                            className="py-1.5 rounded bg-cream-3 hover:bg-white text-ink transition-colors flex items-center justify-center gap-1"
                        >
                            <FileUp className="w-3 h-3" /> Mask in
                        </button>
                        </Tooltip>
                        <Tooltip help={HELP.maskOut}>
                        <button
                            onClick={onExportMask}
                            disabled={!hasSelection}
                            className="py-1.5 rounded bg-cream-3 hover:bg-white text-ink disabled:opacity-40 transition-colors flex items-center justify-center gap-1"
                        >
                            <FileDown className="w-3 h-3" /> Mask out
                        </button>
                        </Tooltip>
                        <input
                            ref={maskInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={e => {
                                const f = e.target.files?.[0];
                                if (f) onImportMask(f);
                                e.target.value = '';
                            }}
                        />
                    </div>

                    {coveragePct !== null && (
                        <p className="text-[10px] text-ink-2 text-center">selection covers {coveragePct}%</p>
                    )}
                </div>
            )}
        </div>
    );
};
