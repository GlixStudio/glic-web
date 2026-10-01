import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../core/AppContext';
import { Play, Download, Undo2, Repeat, FileUp, X, Layers } from 'lucide-react';
import { HELP } from '../core/help';
import { Tooltip } from './controls/Tooltip';

export const ActionBar: React.FC = () => {
    const {
        originalImage,
        processed,
        encodedFile,
        isProcessing,
        progress,
        canUndo,
        encodeNow,
        newLayerEncode,
        iterate,
        iterateLayers,
        encodeLayerOnly,
        setEncodeLayerOnly,
        undo,
        cancel,
        importGlic,
        savePng,
        saveGlic,
    } = useApp();

    const glicInputRef = useRef<HTMLInputElement>(null);
    const [overrideHeader, setOverrideHeader] = useState(false);
    const [iterateCount, setIterateCount] = useState(5);

    // keyboard shortcuts (plain keys, ignored while typing in a field)
    const actions = useRef({ encodeNow, newLayerEncode, undo, savePng: () => {}, saveGlic: () => {}, openImport: () => {} });
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return;
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            const a = actions.current;
            switch (e.key.toLowerCase()) {
                case 'e': e.preventDefault(); a.encodeNow(); break;
                case 'r': e.preventDefault(); a.newLayerEncode(); break;
                case 'u': e.preventDefault(); a.undo(); break;
                case 's': e.preventDefault(); a.savePng(); break;
                case 'g': e.preventDefault(); a.saveGlic(); break;
                case 'i': e.preventDefault(); a.openImport(); break;
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    const onGlicFile = async (file: File) => {
        const buf = await file.arrayBuffer();
        await importGlic(new Uint8Array(buf), overrideHeader);
    };

    // keep shortcut handlers pointing at the latest closures
    useEffect(() => {
        actions.current = {
            encodeNow,
            newLayerEncode,
            undo,
            savePng,
            saveGlic,
            openImport: () => glicInputRef.current?.click(),
        };
    });

    return (
        <div className="p-3 border-t border-ink bg-cream flex flex-col gap-2 flex-shrink-0">
            {/* progress */}
            {isProcessing && (
                <div className="flex items-center gap-2">
                    <div className="flex-1 bg-cream-3 border border-ink/30 rounded-full h-2 overflow-hidden">
                        <div
                            className="bg-glx-orange h-full transition-all duration-150"
                            style={{ width: `${Math.round((progress ?? 0) * 100)}%` }}
                        />
                    </div>
                    <span className="text-[10px] text-ink-2 font-mono w-8 text-right">
                        {Math.round((progress ?? 0) * 100)}%
                    </span>
                    <button
                        onClick={cancel}
                        className="p-1 text-ink-2 hover:text-red-600 transition-colors"
                        title="Cancel"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}

            <div className="flex gap-2">
                <Tooltip help={HELP.encode}>
                <button
                    data-tour="encode"
                    className={`flex-1 py-2.5 rounded-lg font-bold flex items-center justify-center gap-2 transition-all transform active:scale-95 ${
                        !originalImage || isProcessing
                            ? 'bg-cream-3 text-ink/30 border border-ink/20 cursor-not-allowed'
                            : 'bg-glx-green text-ink border border-ink hover:brightness-105 shadow-[2px_2px_0_0_rgba(22,21,15,0.9)] active:shadow-none'
                    }`}
                    onClick={encodeNow}
                    disabled={!originalImage || isProcessing}
                >
                    <Play className="w-4 h-4 fill-current" />
                    <span className="text-sm">ENCODE</span>
                    <span className="text-[10px] opacity-60 font-normal">E</span>
                </button>
                </Tooltip>

                <Tooltip help={HELP.newLayer}>
                <button
                    className={`flex-1 py-2.5 rounded-lg font-bold flex items-center justify-center gap-2 transition-all transform active:scale-95 ${
                        !originalImage || isProcessing
                            ? 'bg-cream-3 text-ink/30 border border-ink/20 cursor-not-allowed'
                            : 'bg-cream-2 text-ink border border-ink hover:bg-white shadow-[2px_2px_0_0_rgba(22,21,15,0.9)] active:shadow-none'
                    }`}
                    onClick={newLayerEncode}
                    disabled={!originalImage || isProcessing}
                >
                    <Layers className="w-4 h-4" />
                    <span className="text-sm">NEW LAYER</span>
                    <span className="text-[10px] opacity-60 font-normal">R</span>
                </button>
                </Tooltip>
            </div>

            <Tooltip help={HELP.layerOnly}>
            <label className="flex items-center gap-2 text-[11px] text-ink-2 cursor-pointer select-none">
                <input
                    type="checkbox"
                    checked={encodeLayerOnly}
                    onChange={e => setEncodeLayerOnly(e.target.checked)}
                    className="accent-glx-green"
                />
                Layer only (encode the active layer’s own pixels)
            </label>
            </Tooltip>

            <div className="flex gap-2 items-stretch">
                <label className="flex items-center gap-1 text-xs font-medium text-ink" title="Iteration count">
                    <Repeat className="w-3 h-3" />
                    <span className="sr-only">Iterations</span>×
                    <select
                        value={iterateCount}
                        onChange={e => setIterateCount(parseInt(e.target.value))}
                        className="w-12 h-full bg-cream-2 border border-ink text-ink text-xs rounded-lg px-1 focus:outline-none"
                    >
                        {[2, 3, 5, 10, 20].map(n => (
                            <option key={n} value={n}>
                                {n}
                            </option>
                        ))}
                    </select>
                </label>
                {(
                    [
                        { help: HELP.iterate, label: '→ 1 layer', run: iterate },
                        { help: HELP.iterateLayers, label: `→ ${iterateCount} layers`, run: iterateLayers },
                    ] as const
                ).map(b => (
                    <Tooltip key={b.label} help={b.help}>
                        <button
                            className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1 ${
                                !originalImage || isProcessing
                                    ? 'text-ink/30 bg-cream-3 border border-ink/20 cursor-not-allowed'
                                    : 'text-ink bg-cream-2 hover:bg-white border border-ink'
                            }`}
                            onClick={() => b.run(iterateCount)}
                            disabled={!originalImage || isProcessing}
                        >
                            {b.label}
                        </button>
                    </Tooltip>
                ))}
            </div>

            <div className="flex gap-2">
                <Tooltip help={HELP.undo}>
                <button
                    className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
                        !canUndo || isProcessing
                            ? 'text-ink/30 bg-cream-3 border border-ink/20 cursor-not-allowed'
                            : 'text-ink bg-cream-2 hover:bg-white border border-ink'
                    }`}
                    onClick={undo}
                    disabled={!canUndo || isProcessing}
                >
                    <Undo2 className="w-3 h-3" />
                    Undo
                    <span className="text-[9px] opacity-60">U</span>
                </button>
                </Tooltip>
            </div>

            <div className="flex gap-2 pt-1 border-t border-line">
                <Tooltip help={HELP.savePng}>
                <button
                    className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
                        !processed
                            ? 'text-ink/30 bg-cream-3 border border-ink/20 cursor-not-allowed'
                            : 'text-ink bg-cream-2 hover:bg-white border border-ink'
                    }`}
                    onClick={savePng}
                    disabled={!processed}
                >
                    <Download className="w-3 h-3" /> PNG
                    <span className="text-[9px] opacity-60">S</span>
                </button>
                </Tooltip>
                <Tooltip help={HELP.saveGlic}>
                <button
                    className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
                        !encodedFile
                            ? 'text-ink/30 bg-cream-3 border border-ink/20 cursor-not-allowed'
                            : 'text-ink bg-cream-2 hover:bg-white border border-ink'
                    }`}
                    onClick={saveGlic}
                    disabled={!encodedFile}
                >
                    <Download className="w-3 h-3" /> .glic
                    <span className="text-[9px] opacity-60">G</span>
                </button>
                </Tooltip>
                <Tooltip help={HELP.importGlic}>
                <button
                    className="flex-1 py-2 rounded-lg text-xs font-medium text-ink bg-cream-2 hover:bg-white border border-ink transition-all flex items-center justify-center gap-1.5"
                    onClick={() => glicInputRef.current?.click()}
                    disabled={isProcessing}
                >
                    <FileUp className="w-3 h-3" /> Import
                    <span className="text-[9px] opacity-60">I</span>
                </button>
                </Tooltip>
                <input
                    ref={glicInputRef}
                    type="file"
                    accept=".glic"
                    className="hidden"
                    onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) onGlicFile(f);
                        e.target.value = '';
                    }}
                />
            </div>

            <Tooltip help={HELP.overrideHeader}>
            <label className="flex items-center gap-2 text-[11px] text-ink-2 cursor-pointer select-none">
                <input
                    type="checkbox"
                    checked={overrideHeader}
                    onChange={e => setOverrideHeader(e.target.checked)}
                    className="accent-glx-green"
                />
                Override header on import (decode with current settings)
            </label>
            </Tooltip>
        </div>
    );
};
