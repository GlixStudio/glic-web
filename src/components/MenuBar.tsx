import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../core/AppContext';
import { sendView, type ViewCommand } from '../core/viewBus';
import { fileToImageData } from '../core/imageio';
import { ProjectsModal } from './ProjectsModal';

// Pattrn-style menu bar: File (project lifecycle, import/export) and View
// (zoom / segmentation / chrome). Zoom state lives in the canvas viewer, so
// View items dispatch commands over the view bus.

interface Item {
    label: string;
    hint?: string;
    disabled?: boolean;
    danger?: boolean;
    onClick: () => void;
}

type Separator = 'sep';

const MenuButton: React.FC<{
    id: 'file' | 'view';
    label: string;
    items: (Item | Separator)[];
    openMenu: 'file' | 'view' | null;
    setOpenMenu: React.Dispatch<React.SetStateAction<'file' | 'view' | null>>;
}> = ({ id, label, items, openMenu, setOpenMenu }) => (
    <div className="relative">
        <button
            onClick={() => setOpenMenu(m => (m === id ? null : id))}
            onMouseEnter={() => openMenu && setOpenMenu(id)}
            className={`px-2.5 py-1 rounded-md text-[12px] font-bold transition-colors ${
                openMenu === id ? 'bg-glx-orange text-ink' : 'text-ink hover:bg-cream-3'
            }`}
        >
            {label}
        </button>
        {openMenu === id && <MenuPanel items={items} onClose={() => setOpenMenu(null)} />}
    </div>
);

const MenuPanel: React.FC<{ items: (Item | Separator)[]; onClose: () => void }> = ({ items, onClose }) => (
    <div className="absolute left-0 top-full mt-1 w-56 bg-cream-2 border border-ink rounded-lg shadow-xl shadow-black/25 py-1 z-50">
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
        loadImage,
        importGlic,
        savePng,
        saveGlic,
        processed,
        encodedFile,
        originalImage,
        layers,
        toast,
    } = useApp();

    const [openMenu, setOpenMenu] = useState<'file' | 'view' | null>(null);
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
        { label: 'Export PNG', hint: 'S', disabled: !processed, onClick: () => void savePng() },
        { label: 'Export .glic', hint: 'G', disabled: !encodedFile, onClick: saveGlic },
    ];

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
            <MenuButton id="view" label="View" items={viewItems} openMenu={openMenu} setOpenMenu={setOpenMenu} />
            <span className="ml-2 text-[11px] text-ink-2 truncate max-w-40" title={projectName}>
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
                        loadImage(await fileToImageData(f));
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
