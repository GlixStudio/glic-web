import React from 'react';
import { type CombineMode, type SelectionTool, type ToolOptions } from '../core/selection';
import { useRef } from 'react';
import { Hand, SquareDashed, CircleDashed, Lasso, Wand2, Paintbrush, Plus, Minus, Square, XCircle, RotateCcw, Blend, FileUp, FileDown } from 'lucide-react';

interface ToolDef {
    id: SelectionTool;
    icon: React.ReactNode;
    label: string;
    shortcut: string;
}

const TOOLS: ToolDef[] = [
    { id: 'move', icon: <Hand className="w-4 h-4" />, label: 'Move / pan', shortcut: 'V' },
    { id: 'rect', icon: <SquareDashed className="w-4 h-4" />, label: 'Rectangular marquee', shortcut: 'M' },
    { id: 'ellipse', icon: <CircleDashed className="w-4 h-4" />, label: 'Elliptical marquee', shortcut: 'M again' },
    { id: 'lasso', icon: <Lasso className="w-4 h-4" />, label: 'Lasso', shortcut: 'L' },
    { id: 'wand', icon: <Wand2 className="w-4 h-4" />, label: 'Magic wand', shortcut: 'W' },
    { id: 'brush', icon: <Paintbrush className="w-4 h-4" />, label: 'Mask brush (Alt = erase)', shortcut: 'B' },
];

const MODES: { id: CombineMode; icon: React.ReactNode; label: string }[] = [
    { id: 'replace', icon: <Square className="w-3.5 h-3.5" />, label: 'New selection' },
    { id: 'add', icon: <Plus className="w-3.5 h-3.5" />, label: 'Add (Shift)' },
    { id: 'subtract', icon: <Minus className="w-3.5 h-3.5" />, label: 'Subtract (Alt)' },
];

interface Props {
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
}) => {
    const showOptions = tool !== 'move';
    const maskInputRef = useRef<HTMLInputElement>(null);

    return (
        <div className="absolute left-4 top-1/2 -translate-y-1/2 z-10 flex items-start gap-2">
            {/* tool strip */}
            <div className="flex flex-col bg-zinc-900/90 border border-zinc-700 rounded-lg backdrop-blur-sm overflow-hidden">
                {TOOLS.map(t => (
                    <button
                        key={t.id}
                        onClick={() => setTool(t.id)}
                        className={`p-2.5 transition-colors ${
                            tool === t.id ? 'bg-blue-600 text-white' : 'text-zinc-300 hover:bg-zinc-800'
                        }`}
                        title={`${t.label} (${t.shortcut})`}
                    >
                        {t.icon}
                    </button>
                ))}
            </div>

            {/* context options */}
            {showOptions && (
                <div className="flex flex-col gap-2.5 bg-zinc-900/90 border border-zinc-700 rounded-lg backdrop-blur-sm p-2.5 w-44">
                    <div className="flex rounded-md overflow-hidden border border-zinc-700">
                        {MODES.map(m => (
                            <button
                                key={m.id}
                                onClick={() => setOptions({ ...options, mode: m.id })}
                                className={`flex-1 flex items-center justify-center py-1.5 transition-colors ${
                                    options.mode === m.id ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:bg-zinc-800'
                                }`}
                                title={m.label}
                            >
                                {m.icon}
                            </button>
                        ))}
                    </div>

                    {tool === 'brush' && (
                        <label className="flex flex-col gap-1 text-[10px] text-zinc-400 uppercase tracking-wide">
                            <span className="flex justify-between">
                                Brush size <span className="font-mono text-zinc-300">{options.brushSize}px</span>
                            </span>
                            <input
                                type="range"
                                min={2}
                                max={512}
                                value={options.brushSize}
                                onChange={e => setOptions({ ...options, brushSize: parseInt(e.target.value) })}
                                className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                            />
                            <span className="normal-case tracking-normal text-zinc-500">[ and ] resize · Alt erases</span>
                        </label>
                    )}

                    {tool === 'wand' && (
                        <>
                            <label className="flex flex-col gap-1 text-[10px] text-zinc-400 uppercase tracking-wide">
                                <span className="flex justify-between">
                                    Tolerance <span className="font-mono text-zinc-300">{options.tolerance}</span>
                                </span>
                                <input
                                    type="range"
                                    min={0}
                                    max={255}
                                    value={options.tolerance}
                                    onChange={e => setOptions({ ...options, tolerance: parseInt(e.target.value) })}
                                    className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                />
                            </label>
                            <label className="flex items-center justify-between text-[10px] text-zinc-400 uppercase tracking-wide cursor-pointer">
                                Contiguous
                                <input
                                    type="checkbox"
                                    checked={options.contiguous}
                                    onChange={e => setOptions({ ...options, contiguous: e.target.checked })}
                                    className="accent-blue-500"
                                />
                            </label>
                        </>
                    )}

                    <label className="flex flex-col gap-1 text-[10px] text-zinc-400 uppercase tracking-wide">
                        <span className="flex justify-between">
                            Feather <span className="font-mono text-zinc-300">{options.feather}px</span>
                        </span>
                        <input
                            type="range"
                            min={0}
                            max={64}
                            value={options.feather}
                            onChange={e => setOptions({ ...options, feather: parseInt(e.target.value) })}
                            className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                    </label>

                    <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                        <button onClick={onSelectAll} className="py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors" title="Select the whole image (A)">
                            All
                        </button>
                        <button
                            onClick={onInvert}
                            disabled={!hasSelection}
                            className="py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 disabled:opacity-40 transition-colors"
                            title="Invert selection (X)"
                        >
                            Invert
                        </button>
                        <button
                            onClick={onClear}
                            disabled={!hasSelection}
                            className="py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 disabled:opacity-40 transition-colors flex items-center justify-center gap-1"
                            title="Deselect (Esc / D)"
                        >
                            <XCircle className="w-3 h-3" /> Clear
                        </button>
                        <button
                            onClick={onReselect}
                            disabled={!hasLastSelection || hasSelection}
                            className="py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 disabled:opacity-40 transition-colors flex items-center justify-center gap-1"
                            title="Restore the last selection"
                        >
                            <RotateCcw className="w-3 h-3" /> Redo
                        </button>
                    </div>
                    <button
                        onClick={onApplyFeather}
                        disabled={!hasSelection || options.feather === 0}
                        className="py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 disabled:opacity-40 transition-colors text-[10px] flex items-center justify-center gap-1"
                        title="Blur the current selection's edges by the feather amount"
                    >
                        <Blend className="w-3 h-3" /> Feather selection
                    </button>

                    <div className="grid grid-cols-2 gap-1.5 text-[10px] pt-1 border-t border-zinc-800">
                        <button
                            onClick={() => maskInputRef.current?.click()}
                            className="py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors flex items-center justify-center gap-1"
                            title="Load a grayscale image as the selection mask (white = selected; resized to fit)"
                        >
                            <FileUp className="w-3 h-3" /> Mask in
                        </button>
                        <button
                            onClick={onExportMask}
                            disabled={!hasSelection}
                            className="py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 disabled:opacity-40 transition-colors flex items-center justify-center gap-1"
                            title="Save the selection mask as a grayscale PNG"
                        >
                            <FileDown className="w-3 h-3" /> Mask out
                        </button>
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
                        <p className="text-[10px] text-zinc-500 text-center">selection covers {coveragePct}%</p>
                    )}
                </div>
            )}
        </div>
    );
};
