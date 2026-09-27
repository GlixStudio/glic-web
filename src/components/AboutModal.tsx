import React from 'react';
import { startTour } from '../core/tour';
import { Compass } from 'lucide-react';

const SHORTCUTS: [string, string][] = [
    ['E', 'Encode into the active layer'],
    ['R', 'Encode into a new layer on top'],
    ['U', 'Undo last encode'],
    ['S', 'Save processed image (PNG)'],
    ['G', 'Save .glic file'],
    ['I', 'Import .glic file'],
    ['C (hold)', 'Compare with source image'],
    ['F', 'Fit image / 100% zoom toggle'],
    ['V', 'Move / pan tool'],
    ['M', 'Rect marquee (again: ellipse)'],
    ['L', 'Lasso'],
    ['W', 'Magic wand'],
    ['B', 'Mask brush (Alt erases)'],
    ['[ / ]', 'Brush size'],
    ['A', 'Select all'],
    ['X', 'Invert selection'],
    ['D / Esc', 'Deselect'],
    ['Shift / Alt drag', 'Add / subtract from selection'],
    ['Space (hold)', 'Pan while a tool is active'],
];

export const AboutModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
    if (!open) return null;
    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div
                className="bg-cream-2 border border-ink rounded-lg shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
                onClick={e => e.stopPropagation()}
            >
                <div className="p-6 space-y-4">
                    <div className="flex items-center justify-between border-b border-line pb-4">
                        <h2 className="text-2xl font-bold text-ink">Help &amp; About</h2>
                        <button onClick={onClose} className="text-ink-2 hover:text-ink transition-colors">
                            <span className="text-2xl">×</span>
                        </button>
                    </div>

                    <div className="space-y-4 text-ink text-sm leading-relaxed">
                        <button
                            onClick={() => {
                                onClose();
                                startTour();
                            }}
                            className="w-full py-2.5 rounded-lg font-bold text-sm bg-glx-green hover:brightness-105 text-ink border border-ink transition-colors flex items-center justify-center gap-2"
                        >
                            <Compass className="w-4 h-4" /> Start the guided tour
                        </button>
                        <p className="text-xs text-ink-2">
                            Tip: hover any control anywhere in the app for a plain-language explanation of what it does.
                        </p>
                        <p>
                            <strong className="text-ink">GLIC Web</strong> is a web port of{' '}
                            <strong className="text-ink">GLIC</strong> (GLitch Image Codec), the Processing tool for
                            image compression built for databending. GLIC has been a huge inspiration for GLIX's aesthetics
                            and design approach, so we ported it to the web to share it with the world.
                        </p>

                        <div>
                            <h3 className="text-ink font-bold mb-2">Features</h3>
                            <ul className="list-disc list-inside space-y-1 ml-2 text-ink-2">
                                <li>All 67 original JWave wavelets, bit-faithful to desktop GLIC</li>
                                <li>Glitch layers with masks, opacity, and blend modes - non-destructive</li>
                                <li>Selection tools: marquees, lasso, wand, brush, feather, mask import/export</li>
                                <li>16 color spaces, 18 block predictors, quad-tree segmentation</li>
                                <li>.glic files compatible with the original desktop GLIC</li>
                                <li>Decode with overridden settings, iterate, databend-tolerant import</li>
                                <li>Tileset + GIF/WebM animation export</li>
                            </ul>
                        </div>

                        <div>
                            <h3 className="text-ink font-bold mb-2">Keyboard shortcuts</h3>
                            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-ink-2">
                                {SHORTCUTS.map(([key, desc]) => (
                                    <div key={key} className="flex items-center gap-2">
                                        <kbd className="px-1.5 py-0.5 bg-cream-3 border border-ink rounded text-[11px] font-mono text-ink">
                                            {key}
                                        </kbd>
                                        <span className="text-xs">{desc}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-1">
                            <p>
                                GLIC source:{' '}
                                <a href="https://github.com/GlitchCodec/GLIC" className="text-ink underline decoration-glx-orange decoration-2" target="_blank" rel="noopener noreferrer">
                                    github.com/GlitchCodec/GLIC
                                </a>
                            </p>
                            <p>
                                GLIC Web source:{' '}
                                <a href="https://github.com/GlixStudio/glic-web" className="text-ink underline decoration-glx-orange decoration-2" target="_blank" rel="noopener noreferrer">
                                    github.com/GlixStudio/glic-web
                                </a>
                            </p>
                            <p>
                                Made by{' '}
                                <a href="https://home.glix.studio" className="text-ink underline decoration-glx-orange decoration-2" target="_blank" rel="noopener noreferrer">
                                    Glix Studio
                                </a>
                                {' · '}
                                <a href="https://glix.shop" className="text-ink underline decoration-glx-orange decoration-2" target="_blank" rel="noopener noreferrer">
                                    Glix Shop
                                </a>
                            </p>
                        </div>

                        <div className="pt-4 border-t border-line">
                            <p className="text-ink-2 text-xs">
                                <strong className="text-ink">Copyleft Glix Studio {new Date().getFullYear()}</strong>
                                <br />
                                This software is free and open source. Use, modify, and distribute freely. Presets by: Myrto,
                                Saturn Kat, Letsglitchit, Vivi, NoNoNoNoNo, Pandy Chan, GenerateMe, Jay Di, José Irion Neto.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
