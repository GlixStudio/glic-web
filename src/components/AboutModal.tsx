import React from 'react';

const SHORTCUTS: [string, string][] = [
    ['E', 'Encode source image'],
    ['R', 'Re-encode current result'],
    ['U', 'Undo last encode'],
    ['S', 'Save processed image (PNG)'],
    ['G', 'Save .glic file'],
    ['I', 'Import .glic file'],
    ['C (hold)', 'Compare with source image'],
    ['F', 'Fit image / 100% zoom toggle'],
];

export const AboutModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
    if (!open) return null;
    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div
                className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
                onClick={e => e.stopPropagation()}
            >
                <div className="p-6 space-y-4">
                    <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
                        <h2 className="text-2xl font-bold text-zinc-100">About GLIC Web</h2>
                        <button onClick={onClose} className="text-zinc-400 hover:text-zinc-200 transition-colors">
                            <span className="text-2xl">×</span>
                        </button>
                    </div>

                    <div className="space-y-4 text-zinc-300 text-sm leading-relaxed">
                        <p>
                            <strong className="text-zinc-100">GLIC Web</strong> is a web port of{' '}
                            <strong className="text-zinc-100">GLIC</strong> (GLitch Image Codec), the Processing tool for
                            image compression built for databending. GLIC has been a huge inspiration for GLIX's aesthetics
                            and design approach, so we ported it to the web to share it with the world.
                        </p>

                        <div>
                            <h3 className="text-zinc-100 font-bold mb-2">Features</h3>
                            <ul className="list-disc list-inside space-y-1 ml-2 text-zinc-400">
                                <li>All 67 original JWave wavelets, bit-faithful to desktop GLIC</li>
                                <li>16 color spaces, 18 block predictors, quad-tree segmentation</li>
                                <li>.glic files compatible with the original desktop GLIC</li>
                                <li>Decode with overridden settings, iterate, databend-tolerant import</li>
                                <li>Tileset + GIF/WebM animation export</li>
                            </ul>
                        </div>

                        <div>
                            <h3 className="text-zinc-100 font-bold mb-2">Keyboard shortcuts</h3>
                            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-zinc-400">
                                {SHORTCUTS.map(([key, desc]) => (
                                    <div key={key} className="flex items-center gap-2">
                                        <kbd className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-[11px] font-mono text-zinc-300">
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
                                <a href="https://github.com/GlitchCodec/GLIC" className="text-blue-400 underline" target="_blank" rel="noopener noreferrer">
                                    github.com/GlitchCodec/GLIC
                                </a>
                            </p>
                            <p>
                                GLIC Web source:{' '}
                                <a href="https://github.com/GlixStudio/glic-web" className="text-blue-400 underline" target="_blank" rel="noopener noreferrer">
                                    github.com/GlixStudio/glic-web
                                </a>
                            </p>
                            <p>
                                Made by{' '}
                                <a href="https://home.glix.studio" className="text-blue-400 underline" target="_blank" rel="noopener noreferrer">
                                    Glix Studio
                                </a>
                                {' · '}
                                <a href="https://glix.shop" className="text-blue-400 underline" target="_blank" rel="noopener noreferrer">
                                    Glix Shop
                                </a>
                            </p>
                        </div>

                        <div className="pt-4 border-t border-zinc-800">
                            <p className="text-zinc-400 text-xs">
                                <strong className="text-zinc-300">Copyleft Glix Studio {new Date().getFullYear()}</strong>
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
