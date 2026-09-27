import { useState } from 'react';
import { AppProvider } from './core/AppContext';
import { Sidebar } from './components/Sidebar';
import { CanvasViewer } from './components/CanvasViewer';
import { Toasts } from './components/Toasts';
import { Tour } from './components/Tour';
import { AboutModal } from './components/AboutModal';
import { PanelLeft, CircleHelp } from 'lucide-react';

function App() {
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [showAbout, setShowAbout] = useState(false);

    return (
        <AppProvider>
            <div className="flex flex-col h-screen w-screen overflow-hidden bg-cream text-ink font-sans">
                {/* top app bar */}
                <header className="flex items-center justify-between px-3 h-11 border-b border-ink bg-cream flex-shrink-0 z-40">
                    <div className="flex items-center gap-2.5">
                        <button
                            onClick={() => setSidebarOpen(o => !o)}
                            className="p-1.5 rounded-md border border-ink bg-cream-2 hover:bg-white text-ink transition-colors"
                            title={sidebarOpen ? 'Hide controls' : 'Show controls'}
                        >
                            <PanelLeft className="w-3.5 h-3.5" />
                        </button>
                        <div className="w-5 h-5 rounded-[5px] border border-ink grid grid-cols-2 overflow-hidden">
                            <div className="bg-glx-orange" />
                            <div className="bg-ink" />
                            <div className="bg-glx-green" />
                            <div className="bg-cream-2" />
                        </div>
                        <h1 className="text-[15px] font-black tracking-tight">GLIC Web</h1>
                        <span className="text-[11px] text-ink-2 hidden sm:inline">GLitch Image Codec</span>
                    </div>
                    <button
                        onClick={() => setShowAbout(true)}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-ink bg-cream-2 hover:bg-white text-[11px] font-bold text-ink transition-colors"
                        title="Help, guided tour & shortcuts"
                    >
                        <CircleHelp className="w-3.5 h-3.5" /> Help
                    </button>
                </header>

                <div className="flex flex-1 min-h-0 relative">
                    {/* sidebar: static on desktop, overlay drawer on small screens */}
                    <div
                        className={`h-full flex-shrink-0 transition-all duration-200 md:relative absolute z-30 ${
                            sidebarOpen ? 'translate-x-0' : '-translate-x-full md:w-0 md:overflow-hidden'
                        }`}
                    >
                        <Sidebar />
                    </div>

                    <main className="flex-1 relative flex flex-col min-w-0 overflow-hidden bg-stage">
                        <CanvasViewer />
                    </main>
                </div>

                <Toasts />
                <Tour />
                <AboutModal open={showAbout} onClose={() => setShowAbout(false)} />
            </div>
        </AppProvider>
    );
}

export default App;
