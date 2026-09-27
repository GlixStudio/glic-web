import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../core/AppContext';
import { Play, Download, Undo2, Repeat, FileUp, X } from 'lucide-react';
import {
    imageDataToCanvas,
    canvasToPngBlob,
    downloadBlob,
    timestampedFilename,
} from '../core/imageio';

export const ActionBar: React.FC = () => {
    const {
        originalImage,
        processed,
        encodedFile,
        isProcessing,
        progress,
        canUndo,
        filters,
        encodeNow,
        reEncode,
        iterate,
        undo,
        cancel,
        importGlic,
        toast,
    } = useApp();

    const glicInputRef = useRef<HTMLInputElement>(null);
    const [overrideHeader, setOverrideHeader] = useState(false);
    const [iterateCount, setIterateCount] = useState(5);

    // keyboard shortcuts (plain keys, ignored while typing in a field)
    const actions = useRef({ encodeNow, reEncode, undo, saveImage: () => {}, saveGlic: () => {}, openImport: () => {} });
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return;
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            const a = actions.current;
            switch (e.key.toLowerCase()) {
                case 'e': e.preventDefault(); a.encodeNow(); break;
                case 'r': e.preventDefault(); a.reEncode(); break;
                case 'u': e.preventDefault(); a.undo(); break;
                case 's': e.preventDefault(); a.saveImage(); break;
                case 'g': e.preventDefault(); a.saveGlic(); break;
                case 'i': e.preventDefault(); a.openImport(); break;
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    const saveImage = async () => {
        if (!processed) return;
        try {
            const canvas = imageDataToCanvas(processed, filters);
            downloadBlob(await canvasToPngBlob(canvas), timestampedFilename('glic-image', 'png'));
        } catch (e) {
            toast('error', `Save failed: ${(e as Error).message}`);
        }
    };

    const saveGlic = () => {
        if (!encodedFile) return;
        downloadBlob(
            new Blob([encodedFile.buffer as ArrayBuffer], { type: 'application/octet-stream' }),
            timestampedFilename('glic-output', 'glic')
        );
    };

    const onGlicFile = async (file: File) => {
        const buf = await file.arrayBuffer();
        await importGlic(new Uint8Array(buf), overrideHeader);
    };

    // keep shortcut handlers pointing at the latest closures
    useEffect(() => {
        actions.current = {
            encodeNow,
            reEncode,
            undo,
            saveImage,
            saveGlic,
            openImport: () => glicInputRef.current?.click(),
        };
    });

    return (
        <div className="p-3 border-t border-zinc-900 bg-zinc-950 flex flex-col gap-2 flex-shrink-0">
            {/* progress */}
            {isProcessing && (
                <div className="flex items-center gap-2">
                    <div className="flex-1 bg-zinc-900 rounded-full h-2 overflow-hidden">
                        <div
                            className="bg-blue-500 h-full transition-all duration-150"
                            style={{ width: `${Math.round((progress ?? 0) * 100)}%` }}
                        />
                    </div>
                    <span className="text-[10px] text-zinc-500 font-mono w-8 text-right">
                        {Math.round((progress ?? 0) * 100)}%
                    </span>
                    <button
                        onClick={cancel}
                        className="p-1 text-zinc-500 hover:text-red-400 transition-colors"
                        title="Cancel"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}

            <div className="flex gap-2">
                <button
                    className={`flex-1 py-2.5 rounded-lg font-bold flex items-center justify-center gap-2 transition-all transform active:scale-95 ${
                        !originalImage || isProcessing
                            ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                            : 'bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-900/20'
                    }`}
                    onClick={encodeNow}
                    disabled={!originalImage || isProcessing}
                    title="Encode the source image (E)"
                >
                    <Play className="w-4 h-4 fill-current" />
                    <span className="text-sm">ENCODE</span>
                    <span className="text-[10px] opacity-60 font-normal">E</span>
                </button>

                <button
                    className={`flex-1 py-2.5 rounded-lg font-bold flex items-center justify-center gap-2 transition-all transform active:scale-95 ${
                        !processed || isProcessing
                            ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                            : 'bg-purple-600 text-white hover:bg-purple-500 shadow-lg shadow-purple-900/20'
                    }`}
                    onClick={reEncode}
                    disabled={!processed || isProcessing}
                    title="Feed the result back through the encoder (R)"
                >
                    <Repeat className="w-4 h-4" />
                    <span className="text-sm">RE-ENCODE</span>
                    <span className="text-[10px] opacity-60 font-normal">R</span>
                </button>
            </div>

            <div className="flex gap-2">
                <button
                    className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
                        !processed || isProcessing
                            ? 'text-zinc-600 bg-zinc-900 cursor-not-allowed'
                            : 'text-zinc-300 hover:text-zinc-100 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800'
                    }`}
                    onClick={() => iterate(iterateCount)}
                    disabled={!processed || isProcessing}
                    title={`Re-encode ${iterateCount} times in a row`}
                >
                    <Repeat className="w-3 h-3" />
                    Iterate ×
                </button>
                <select
                    value={iterateCount}
                    onChange={e => setIterateCount(parseInt(e.target.value))}
                    className="w-14 bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs rounded-lg px-1 focus:outline-none"
                    title="Iteration count"
                >
                    {[2, 3, 5, 10, 20].map(n => (
                        <option key={n} value={n}>
                            {n}
                        </option>
                    ))}
                </select>
                <button
                    className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
                        !canUndo || isProcessing
                            ? 'text-zinc-600 bg-zinc-900 cursor-not-allowed'
                            : 'text-zinc-300 hover:text-zinc-100 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800'
                    }`}
                    onClick={undo}
                    disabled={!canUndo || isProcessing}
                    title="Undo last encode (U)"
                >
                    <Undo2 className="w-3 h-3" />
                    Undo
                    <span className="text-[9px] opacity-60">U</span>
                </button>
            </div>

            <div className="flex gap-2 pt-1 border-t border-zinc-800">
                <button
                    className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
                        !processed
                            ? 'text-zinc-600 bg-zinc-900 cursor-not-allowed'
                            : 'text-zinc-300 hover:text-zinc-100 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800'
                    }`}
                    onClick={saveImage}
                    disabled={!processed}
                    title="Save processed image as PNG (S)"
                >
                    <Download className="w-3 h-3" /> PNG
                    <span className="text-[9px] opacity-60">S</span>
                </button>
                <button
                    className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
                        !encodedFile
                            ? 'text-zinc-600 bg-zinc-900 cursor-not-allowed'
                            : 'text-zinc-300 hover:text-zinc-100 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800'
                    }`}
                    onClick={saveGlic}
                    disabled={!encodedFile}
                    title="Save the .glic file (G) - open it in desktop GLIC or databend it"
                >
                    <Download className="w-3 h-3" /> .glic
                    <span className="text-[9px] opacity-60">G</span>
                </button>
                <button
                    className="flex-1 py-2 rounded-lg text-xs font-medium text-zinc-300 hover:text-zinc-100 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 transition-all flex items-center justify-center gap-1.5"
                    onClick={() => glicInputRef.current?.click()}
                    disabled={isProcessing}
                    title="Decode a .glic file (I)"
                >
                    <FileUp className="w-3 h-3" /> Import
                    <span className="text-[9px] opacity-60">I</span>
                </button>
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

            <label className="flex items-center gap-2 text-[11px] text-zinc-500 cursor-pointer select-none" title="Decode imported .glic files with the current settings instead of the ones stored in the file (original GLIC's header-override glitch trick)">
                <input
                    type="checkbox"
                    checked={overrideHeader}
                    onChange={e => setOverrideHeader(e.target.checked)}
                    className="accent-blue-500"
                />
                Override header on import (decode with current settings)
            </label>
        </div>
    );
};
