import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../core/AppContext';
import { sendView, type ViewCommand } from '../core/viewBus';
import { fileToImageData } from '../core/imageio';
import { openIncomingImage } from '../core/incomingImage';
import { ProjectsModal } from './ProjectsModal';
import { ExportModal } from './ExportModal';
import { ImageSizeModal, CanvasSizeModal } from './SizeModals';
import { openShare } from '../social/shareBus';
import { useSession } from '../social/session';
import { hasEncode } from '../social/editorOutput';

// Pattrn-style menu bar: File (project lifecycle, import/export), Image
// (image and canvas size), Layer (Photoshop's arrange/merge commands) and View (zoom / segmentation / chrome). Zoom state lives in the canvas viewer, so
// View items dispatch commands over the view bus.

interface Item {
    label: string;
    hint?: string;
    disabled?: boolean;
    danger?: boolean;
    onClick: () => void;
}

type Separator = 'sep';
type MenuId = 'file' | 'edit' | 'image' | 'layer' | 'view';

const MenuButton: React.FC<{
    id: MenuId;
    label: string;
    items: (Item | Separator)[];
    openMenu: MenuId | null;
    setOpenMenu: React.Dispatch<React.SetStateAction<MenuId | null>>;
}> = ({ id, label, items, openMenu, setOpenMenu }) => (
    <div className="relative" data-tour={`menu-${id}`}>
        <button
            onClick={() => setOpenMenu(m => (m === id ? null : id))}
            onMouseEnter={() => openMenu && setOpenMenu(id)}
            className={`px-1.5 sm:px-2.5 py-1 rounded-md text-[12px] font-bold transition-colors ${
                openMenu === id ? 'bg-glx-orange text-ink' : 'text-ink hover:bg-cream-3'
            }`}
        >
            {label}
        </button>
        {openMenu === id && <MenuPanel items={items} onClose={() => setOpenMenu(null)} />}
    </div>
);

const MenuPanel: React.FC<{ items: (Item | Separator)[]; onClose: () => void }> = ({ items, onClose }) => (
    <div className="absolute left-0 top-full mt-1 w-64 bg-cream-2 border border-ink rounded-lg shadow-xl shadow-black/25 py-1 z-50">
        {items.map((item, i) =>
            item === 'sep' ? (
                <div key={i} className="my-1 border-t border-line" />
            ) : (
                <button
                    key={i}
                    disabled={item.disabled}
                    onClick={() => {
                        onClose();
                        item.onClick();
                    }}
                    className={`w-full flex items-center justify-between gap-4 px-3 py-1.5 text-left text-[12px] transition-colors ${
                        item.disabled
                            ? 'text-ink/30 cursor-not-allowed'
                            : item.danger
                              ? 'text-red-700 hover:bg-red-50'
                              : 'text-ink hover:bg-glx-orange/30'
                    }`}
                >
                    <span>{item.label}</span>
                    {item.hint && <span className="text-[10px] font-mono text-ink-2">{item.hint}</span>}
                </button>
            )
        )}
    </div>
);

export const MenuBar: React.FC<{ sidebarOpen: boolean; onToggleSidebar: () => void }> = ({
    sidebarOpen,
    onToggleSidebar,
}) => {
    const {
        projectName,
        projectId,
        saveProject,
        newProject,
        importGlic,
        savePng,
        saveGlic,
        processed,
        encodedFile,
        originalImage,
        layers,
        activeLayerId,
        duplicateLayer,
        deleteLayer,
        moveLayer,
        mergeDown,
        mergeVisible,
        flatten,
        selection,
        layerViaCopy,
        clearSelectedPixels,
        setLayerTransform,
        orientCanvas,
        copyImage,
        undo,
        canUndo,
        toast,
    } = useApp();

    const communityOffline = useSession().offline;
    const [openMenu, setOpenMenu] = useState<MenuId | null>(null);
    const [dialog, setDialog] = useState<'export' | 'image-size' | 'canvas-size' | null>(null);
    const [showProjects, setShowProjects] = useState(false);
    const [showSaveAs, setShowSaveAs] = useState(false);
    const [saveAsName, setSaveAsName] = useState('');
    const [confirmNew, setConfirmNew] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const glicInputRef = useRef<HTMLInputElement>(null);
    const pickImage = useCallback(() => imageInputRef.current?.click(), []);
    const pickGlic = useCallback(() => glicInputRef.current?.click(), []);

    // click-away / Escape closes menus
    useEffect(() => {
        if (!openMenu) return;
        const onDown = (e: PointerEvent) => {
            if (!rootRef.current?.contains(e.target as Node)) setOpenMenu(null);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpenMenu(null);
        };
        window.addEventListener('pointerdown', onDown);
        window.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('pointerdown', onDown);
            window.removeEventListener('keydown', onKey);
        };
    }, [openMenu]);

    // drop a pending New-Project confirmation when the menu closes
    // (render-phase adjustment, per React's derived-state guidance)
    const [lastMenu, setLastMenu] = useState(openMenu);
    if (openMenu !== lastMenu) {
        setLastMenu(openMenu);
        if (!openMenu) setConfirmNew(false);
    }

    const hasContent = !!originalImage || layers.length > 0;

    const handleNew = () => {
        if (hasContent && !confirmNew) {
            setConfirmNew(true);
            setOpenMenu('file'); // keep the menu open for the confirm click
            toast('info', 'Unsaved work will be lost - click New Project again to confirm');
            return;
        }
        setConfirmNew(false);
        newProject();
    };

    const fileItems: (Item | Separator)[] = [
        {
            label: confirmNew ? 'New Project — sure?' : 'New Project',
            danger: confirmNew,
            onClick: handleNew,
        },
        { label: 'Open…', onClick: () => setShowProjects(true) },
        {
            label: projectId ? `Save “${projectName}”` : 'Save',
            disabled: !originalImage,
            onClick: () => void saveProject(),
        },
        {
            label: 'Save As…',
            disabled: !originalImage,
            onClick: () => {
                setSaveAsName('');
                setShowSaveAs(true);
            },
        },
        'sep',
        { label: 'Import image…', onClick: pickImage },
        { label: 'Import .glic…', hint: 'I', onClick: pickGlic },
        'sep',
        { label: 'Export…', disabled: !originalImage, onClick: () => setDialog('export') },
        { label: 'Quick export PNG', hint: 'S', disabled: !processed, onClick: () => void savePng() },
        { label: 'Export .glic', hint: 'G', disabled: !encodedFile, onClick: saveGlic },
        ...(communityOffline
            ? []
            : (['sep', { label: hasEncode(layers) ? 'Share to Gallery…' : 'Share to Gallery… (encode first)', disabled: !hasEncode(layers), onClick: openShare }] as const)),
    ];

    const pasteFromMenu = async () => {
        // the menu has no paste event to read, so ask the async clipboard API (it may prompt)
        try {
            for (const item of await navigator.clipboard.read()) {
                const type = item.types.find(t => t.startsWith('image/'));
                if (!type) continue;
                const blob = await item.getType(type);
                openIncomingImage({ image: await fileToImageData(new File([blob], 'pasted', { type })), name: 'Pasted', via: 'paste' });
                return;
            }
            toast('info', 'The clipboard has no image to paste');
        } catch {
            toast('info', 'Press ⌘V (Ctrl+V) to paste - this browser blocks reading the clipboard from a menu');
        }
    };

    const editItems: (Item | Separator)[] = [
        { label: 'Undo', hint: 'U', disabled: !canUndo, onClick: undo },
        'sep',
        { label: selection ? 'Copy selection' : 'Copy image', hint: '⌘C', disabled: !originalImage, onClick: () => void copyImage() },
        { label: 'Paste image', hint: '⌘V', onClick: () => void pasteFromMenu() },
    ];

    const imageItems: (Item | Separator)[] = [
        { label: 'Image size…', disabled: !originalImage, onClick: () => setDialog('image-size') },
        { label: 'Canvas size…', disabled: !originalImage, onClick: () => setDialog('canvas-size') },
        'sep',
        { label: 'Rotate 90° clockwise', disabled: !originalImage, onClick: () => orientCanvas({ turns: 1 }, 'Rotated 90° clockwise') },
        { label: 'Rotate 90° counter-clockwise', disabled: !originalImage, onClick: () => orientCanvas({ turns: 3 }, 'Rotated 90° counter-clockwise') },
        { label: 'Rotate 180°', disabled: !originalImage, onClick: () => orientCanvas({ turns: 2 }, 'Rotated 180°') },
        { label: 'Flip canvas horizontal', disabled: !originalImage, onClick: () => orientCanvas({ turns: 0, flipX: true }, 'Flipped horizontally') },
        { label: 'Flip canvas vertical', disabled: !originalImage, onClick: () => orientCanvas({ turns: 0, flipY: true }, 'Flipped vertically') },
    ];

    const activeIdx = layers.findIndex(l => l.id === activeLayerId);
    const active = activeIdx >= 0 ? layers[activeIdx] : null;
    const layerCmds = {
        // Photoshop: ⌘J with a selection lifts it onto a new layer, without one duplicates
        duplicate: () => (selection ? layerViaCopy(false) : active && duplicateLayer(active.id)),
        viaCut: () => selection && layerViaCopy(true),
        forward: () => active && moveLayer(active.id, 1),
        backward: () => active && moveLayer(active.id, -1),
        mergeDown: () => active && mergeDown(active.id),
        mergeVisible,
        copy: () => void copyImage(),
    };
    const layerItems: (Item | Separator)[] = [
        { label: 'Duplicate layer', hint: selection ? '' : '⌘J', disabled: !active, onClick: () => active && duplicateLayer(active.id) },
        { label: 'Delete layer', disabled: !active, onClick: () => active && deleteLayer(active.id) },
        'sep',
        { label: 'Layer via copy', hint: selection ? '⌘J' : '', disabled: !selection, onClick: () => layerViaCopy(false) },
        { label: 'Layer via cut', hint: '⇧⌘J', disabled: !selection || !active, onClick: () => layerViaCopy(true) },
        { label: 'Delete selected area', hint: '⌫', disabled: !selection || !active, onClick: clearSelectedPixels },
        'sep',
        { label: 'Flip layer horizontal', disabled: !active, onClick: () => active && setLayerTransform(active.id, { ...active.transform, flipX: !active.transform.flipX }, true) },
        { label: 'Flip layer vertical', disabled: !active, onClick: () => active && setLayerTransform(active.id, { ...active.transform, flipY: !active.transform.flipY }, true) },
        { label: 'Reset transform', disabled: !active, onClick: () => active && setLayerTransform(active.id, { x: 0, y: 0, scale: 1, rotation: 0, flipX: false, flipY: false }, true) },
        'sep',
        { label: 'Bring forward', hint: '⌘]', disabled: !active || activeIdx === layers.length - 1, onClick: layerCmds.forward },
        { label: 'Send backward', hint: '⌘[', disabled: !active || activeIdx === 0, onClick: layerCmds.backward },
        'sep',
        { label: activeIdx === 0 ? 'Merge down into Background' : 'Merge down', hint: '⌘E', disabled: !active, onClick: layerCmds.mergeDown },
        { label: 'Merge visible', hint: '⇧⌘E', disabled: !layers.some(l => l.visible), onClick: mergeVisible },
        { label: 'Flatten image', disabled: layers.length === 0, onClick: flatten },
    ];

    // Photoshop's layer shortcuts (⌘ on macOS, Ctrl elsewhere)
    const layerCmdsRef = useRef(layerCmds);
    useEffect(() => {
        layerCmdsRef.current = layerCmds;
    });
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return;
            const c = layerCmdsRef.current;
            const k = e.key.toLowerCase();
            const run = (fn: () => unknown) => {
                e.preventDefault();
                fn();
            };
            if (k === 'j') run(e.shiftKey ? c.viaCut : c.duplicate);
            // ⌘C copies the picture unless the user is copying selected text
            else if (k === 'c' && !e.shiftKey && !window.getSelection()?.toString()) run(c.copy);
            else if (k === 'e') run(e.shiftKey ? c.mergeVisible : c.mergeDown);
            else if (e.key === ']') run(c.forward);
            else if (e.key === '[') run(c.backward);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    const view = (cmd: ViewCommand): (() => void) => () => sendView(cmd);
    const viewItems: (Item | Separator)[] = [
        { label: 'Zoom in', onClick: view('zoom-in') },
        { label: 'Zoom out', onClick: view('zoom-out') },
        { label: 'Fit to window', hint: 'F', onClick: view('fit') },
        { label: 'Actual size (100%)', onClick: view('actual') },
        'sep',
        { label: 'Segmentation view', disabled: !processed, onClick: view('toggle-segmentation') },
        'sep',
        { label: sidebarOpen ? 'Hide controls' : 'Show controls', onClick: onToggleSidebar },
    ];

    return (
        <div ref={rootRef} className="flex items-center gap-0.5">
            <MenuButton id="file" label="File" items={fileItems} openMenu={openMenu} setOpenMenu={setOpenMenu} />
            <MenuButton id="edit" label="Edit" items={editItems} openMenu={openMenu} setOpenMenu={setOpenMenu} />
            <MenuButton id="image" label="Image" items={imageItems} openMenu={openMenu} setOpenMenu={setOpenMenu} />
            <MenuButton id="layer" label="Layer" items={layerItems} openMenu={openMenu} setOpenMenu={setOpenMenu} />
            <MenuButton id="view" label="View" items={viewItems} openMenu={openMenu} setOpenMenu={setOpenMenu} />
            <span className="hidden md:inline ml-2 text-[11px] text-ink-2 truncate max-w-40" title={projectName}>
                {projectName}
                {projectId ? '' : originalImage ? ' *' : ''}
            </span>

            <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async e => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (!f) return;
                    try {
                        openIncomingImage({ image: await fileToImageData(f), name: f.name.replace(/\.[^.]+$/, ''), via: 'upload' });
                    } catch {
                        toast('error', 'Could not load image');
                    }
                }}
            />
            <input
                ref={glicInputRef}
                type="file"
                accept=".glic"
                className="hidden"
                onChange={async e => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (!f) return;
                    await importGlic(new Uint8Array(await f.arrayBuffer()), false);
                }}
            />

            <ProjectsModal open={showProjects} onClose={() => setShowProjects(false)} />
            {dialog === 'export' && originalImage && <ExportModal onClose={() => setDialog(null)} />}
            {dialog === 'image-size' && originalImage && <ImageSizeModal onClose={() => setDialog(null)} />}
            {dialog === 'canvas-size' && originalImage && <CanvasSizeModal onClose={() => setDialog(null)} />}

            {showSaveAs && (
                <div
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                    onClick={() => setShowSaveAs(false)}
                >
                    <div
                        className="bg-cream border border-ink rounded-xl shadow-2xl shadow-black/50 w-80 p-4 space-y-3"
                        onClick={e => e.stopPropagation()}
                    >
                        <h2 className="text-sm font-black uppercase tracking-wider">Save project as</h2>
                        <input
                            autoFocus
                            value={saveAsName}
                            onChange={e => setSaveAsName(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter') {
                                    setShowSaveAs(false);
                                    void saveProject({ name: saveAsName, asNew: true });
                                }
                                if (e.key === 'Escape') setShowSaveAs(false);
                            }}
                            placeholder="Leave empty for Project-000N"
                            className="w-full bg-cream-2 border border-ink text-ink text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-glx-orange"
                        />
                        <div className="flex gap-2 justify-end">
                            <button
                                onClick={() => setShowSaveAs(false)}
                                className="px-3 py-1.5 rounded-md border border-ink bg-cream-2 hover:bg-white text-[12px] font-bold transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    setShowSaveAs(false);
                                    void saveProject({ name: saveAsName, asNew: true });
                                }}
                                className="px-3 py-1.5 rounded-md border border-ink bg-glx-green hover:brightness-105 text-[12px] font-bold text-ink transition-all"
                            >
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
