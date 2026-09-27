import React, { useEffect, useState } from 'react';
import { useApp } from '../core/AppContext';
import { listProjects, deleteProject, type ProjectMeta } from '../core/projects';
import { Trash2, FolderOpen, X } from 'lucide-react';

export const ProjectsModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
    const { openProject, toast } = useApp();
    const [projects, setProjects] = useState<ProjectMeta[] | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

    // reset on open (render-phase adjustment, per React's derived-state guidance)
    const [lastOpen, setLastOpen] = useState(open);
    if (open !== lastOpen) {
        setLastOpen(open);
        if (open) {
            setConfirmDelete(null);
            setProjects(null);
        }
    }

    useEffect(() => {
        if (!open) return;
        let live = true;
        listProjects()
            .then(p => {
                if (live) setProjects(p);
            })
            .catch(() => {
                if (!live) return;
                toast('error', 'Could not read saved projects');
                setProjects([]);
            });
        return () => {
            live = false;
        };
    }, [open, toast]);

    if (!open) return null;

    const handleDelete = async (id: string) => {
        if (confirmDelete !== id) {
            setConfirmDelete(id);
            return;
        }
        try {
            await deleteProject(id);
            setProjects(p => (p ? p.filter(m => m.id !== id) : p));
        } catch {
            toast('error', 'Delete failed');
        }
        setConfirmDelete(null);
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div
                className="bg-cream border border-ink rounded-xl shadow-2xl shadow-black/50 max-w-lg w-full max-h-[80vh] flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-4 py-3 border-b border-line">
                    <h2 className="text-sm font-black uppercase tracking-wider">Open project</h2>
                    <button onClick={onClose} className="text-ink-2 hover:text-ink transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
                    {projects === null && <p className="text-xs text-ink-2 text-center py-6">Loading…</p>}
                    {projects?.length === 0 && (
                        <p className="text-xs text-ink-2 text-center py-6">
                            No saved projects yet — use File → Save to keep one in this browser.
                        </p>
                    )}
                    {projects?.map(p => (
                        <div
                            key={p.id}
                            className="flex items-center gap-3 p-2 bg-cream-2 border border-ink rounded-lg hover:bg-white transition-colors"
                        >
                            <img
                                src={p.thumb}
                                alt=""
                                className="w-14 h-14 object-contain rounded-md border border-line bg-stage flex-shrink-0"
                                style={{ imageRendering: 'pixelated' }}
                            />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold truncate">{p.name}</p>
                                <p className="text-[11px] text-ink-2">
                                    {p.width} × {p.height} · {p.layerCount} layer{p.layerCount === 1 ? '' : 's'} ·{' '}
                                    {new Date(p.updatedAt).toLocaleString()}
                                </p>
                            </div>
                            <button
                                onClick={async () => {
                                    onClose();
                                    await openProject(p.id);
                                }}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-glx-green border border-ink rounded-md text-[11px] font-bold text-ink hover:brightness-105 transition-all flex-shrink-0"
                            >
                                <FolderOpen className="w-3.5 h-3.5" /> Open
                            </button>
                            <button
                                onClick={() => handleDelete(p.id)}
                                className={`p-1.5 rounded-md border transition-colors flex-shrink-0 ${
                                    confirmDelete === p.id
                                        ? 'bg-red-600 border-red-700 text-white'
                                        : 'bg-cream-2 border-ink/40 text-ink-2 hover:text-red-600 hover:border-red-600'
                                }`}
                                title={confirmDelete === p.id ? 'Click again to delete permanently' : 'Delete project'}
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
