import React, { useRef, useState } from 'react';
import { useApp } from '../core/AppContext';
import { openMaskImport } from '../core/maskImportBus';
import { maskToImageData } from '../core/selection';
import { fileToImageData } from '../core/imageio';
import { HELP } from '../core/help';
import { Tooltip } from './controls/Tooltip';
import { Plus, Minus, SquareDashed, Layers, Move, Trash2, FileUp, BookmarkPlus, Combine } from 'lucide-react';

// Primitives only: a SavedMask carries a full-resolution typed array, and React's
// dev profiler deep-diffs changed props (see LayerRow).
interface MaskRowProps {
    id: string;
    name: string;
    thumb: string;
    sizeLabel: string | null;
    hasLayer: boolean;
}

const RowBtn: React.FC<{ title: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }> = ({
    title,
    onClick,
    disabled,
    children,
}) => (
    <button
        title={title}
        disabled={disabled}
        onClick={e => {
            e.stopPropagation();
            onClick();
        }}
        className="p-0.5 text-ink-2 hover:text-ink disabled:opacity-30 transition-colors"
    >
        {children}
    </button>
);

const MaskRow: React.FC<MaskRowProps> = ({ id, name, thumb, sizeLabel, hasLayer }) => {
    const { selectFromMask, applyMaskToLayer, renameMask, deleteMask, masks, toast } = useApp();
    const [renaming, setRenaming] = useState(false);
    const [draft, setDraft] = useState(name);
    const [confirm, setConfirm] = useState(false);

    const commit = () => {
        if (draft.trim()) renameMask(id, draft);
        setRenaming(false);
    };

    const place = () => {
        const m = masks.find(x => x.id === id);
        if (m) openMaskImport({ image: maskToImageData(m.mask, m.width, m.height), name: m.name, fromLibrary: true });
    };

    return (
        <div
            className="group flex items-center gap-1.5 px-1.5 py-1 rounded-md cursor-pointer border border-transparent hover:bg-white/60"
            onClick={() => {
                selectFromMask(id, 'replace');
                toast('info', `Selected “${name}”`);
            }}
            title="Click to select this mask"
        >
            <img src={thumb} alt="" className="w-8 h-8 object-contain rounded-sm border border-ink bg-ink flex-shrink-0" />
            <div className="flex-1 min-w-0">
                {renaming ? (
                    <input
                        autoFocus
                        value={draft}
                        onChange={e => setDraft(e.target.value)}
                        onBlur={commit}
                        onKeyDown={e => {
                            if (e.key === 'Enter') commit();
                            if (e.key === 'Escape') setRenaming(false);
                        }}
                        onClick={e => e.stopPropagation()}
                        className="w-full bg-cream-2 border border-ink text-[11px] rounded px-1 py-0.5 focus:outline-none"
                    />
                ) : (
                    <div
                        className="text-[11px] text-ink truncate"
                        onDoubleClick={e => {
                            e.stopPropagation();
                            setDraft(name);
                            setRenaming(true);
                        }}
                        title={`${name} - double-click to rename`}
                    >
                        {name}
                    </div>
                )}
                {sizeLabel && <div className="text-[9px] text-ink-2 font-mono">{sizeLabel} · stretched</div>}
            </div>
            <div className="hidden group-hover:flex items-center flex-shrink-0">
                <RowBtn title="Add to selection" onClick={() => selectFromMask(id, 'add')}>
                    <Plus className="w-3 h-3" />
                </RowBtn>
                <RowBtn title="Subtract from selection" onClick={() => selectFromMask(id, 'subtract')}>
                    <Minus className="w-3 h-3" />
                </RowBtn>
                <RowBtn title="Intersect with selection" onClick={() => selectFromMask(id, 'intersect')}>
                    <Combine className="w-3 h-3" />
                </RowBtn>
                <RowBtn
                    title="Use as the active layer's mask"
                    disabled={!hasLayer}
                    onClick={() => {
                        applyMaskToLayer(id);
                        toast('success', `“${name}” set as the layer mask`);
                    }}
                >
                    <Layers className="w-3 h-3" />
                </RowBtn>
                <RowBtn title="Place again: size, rotate, move, repeat" onClick={place}>
                    <Move className="w-3 h-3" />
                </RowBtn>
                <RowBtn
                    title={confirm ? 'Click again to delete' : 'Delete mask'}
                    onClick={() => {
                        if (confirm) deleteMask(id);
                        else {
                            setConfirm(true);
                            window.setTimeout(() => setConfirm(false), 2500);
                        }
                    }}
                >
                    <Trash2 className={`w-3 h-3 ${confirm ? 'text-red-600' : ''}`} />
                </RowBtn>
            </div>
        </div>
    );
};

/** Masks tab of the right-hand dock: the persistent mask library. */
export const MasksPanel: React.FC = () => {
    const { masks, selection, originalImage, saveMask, layers, activeLayerId, toast } = useApp();
    const fileRef = useRef<HTMLInputElement>(null);
    const w = originalImage?.width ?? 0;
    const h = originalImage?.height ?? 0;

    return (
        <>
            <div className="flex gap-1.5 p-1.5 border-b border-line text-[10px]">
                <Tooltip help={HELP.saveSelectionMask}>
                    <button
                        onClick={() => {
                            if (!selection) return;
                            saveMask(selection, w, h);
                            toast('success', 'Selection saved to the Masks library');
                        }}
                        disabled={!selection}
                        className="flex-1 py-1.5 rounded bg-cream-3 hover:bg-white text-ink disabled:opacity-40 transition-colors flex items-center justify-center gap-1"
                    >
                        <BookmarkPlus className="w-3 h-3" /> Save selection
                    </button>
                </Tooltip>
                <Tooltip help={HELP.maskIn}>
                    <button
                        onClick={() => fileRef.current?.click()}
                        className="flex-1 py-1.5 rounded bg-cream-3 hover:bg-white text-ink transition-colors flex items-center justify-center gap-1"
                    >
                        <FileUp className="w-3 h-3" /> Import…
                    </button>
                </Tooltip>
                <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async e => {
                        const f = e.target.files?.[0];
                        e.target.value = '';
                        if (!f) return;
                        try {
                            openMaskImport({ image: await fileToImageData(f), name: f.name.replace(/\.[^.]+$/, '') });
                        } catch {
                            toast('error', 'Could not read mask image');
                        }
                    }}
                />
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-1.5 space-y-0.5">
                {masks.length === 0 ? (
                    <p className="p-1.5 text-[11px] text-ink-2 leading-relaxed">
                        <SquareDashed className="inline w-3 h-3 mr-1" />
                        No saved masks yet. Save a selection or import an image - masks stay here across images and projects.
                    </p>
                ) : (
                    [...masks].reverse().map(m => (
                        <MaskRow
                            key={m.id}
                            id={m.id}
                            name={m.name}
                            thumb={m.thumb}
                            sizeLabel={m.width === w && m.height === h ? null : `${m.width}×${m.height}`}
                            hasLayer={layers.length > 0 && activeLayerId !== null}
                        />
                    ))
                )}
            </div>
        </>
    );
};
