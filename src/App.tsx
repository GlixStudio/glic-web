import { useState } from 'react';
import { AppProvider } from './core/AppContext';
import { Sidebar } from './components/Sidebar';
import { CanvasViewer } from './components/CanvasViewer';
import { Toasts } from './components/Toasts';
import { Tour } from './components/Tour';
import { AboutModal } from './components/AboutModal';
import { MenuBar } from './components/MenuBar';
import { MaskImportHost } from './components/MaskImportModal';
import { IncomingImageHost } from './components/IncomingImageHost';
import { PhoneEncodeButton } from './components/PhoneEncodeButton';
import { isPhoneWidth } from './core/viewport';
import { PanelLeft, CircleHelp } from 'lucide-react';

function App() {
    // phones start with the canvas, the controls one tap away
    const [sidebarOpen, setSidebarOpen] = useState(() => !isPhoneWidth());
    const [showAbout, setShowAbout] = useState(false);

    return (
        <AppProvider>
            <div className="flex flex-col h-[100dvh] w-screen overflow-hidden bg-cream text-ink font-sans">
                {/* top app bar */}
                <header className="flex items-center justify-between gap-2 px-2 sm:px-3 h-11 border-b border-ink bg-cream flex-shrink-0 z-40">
                    <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
                        <button
                            onClick={() => setSidebarOpen(o => !o)}
                            className="p-1.5 rounded-md border border-ink bg-cream-2 hover:bg-white text-ink transition-colors"
                            title={sidebarOpen ? 'Hide controls' : 'Show controls'}
                        >
                            <PanelLeft className="w-3.5 h-3.5" />
                        </button>
                        <div className="w-5 h-5 flex-shrink-0 rounded-[5px] border border-ink grid grid-cols-2 overflow-hidden">
                            <div className="bg-glx-orange" />
                            <div className="bg-ink" />
                            <div className="bg-glx-green" />
                            <div className="bg-cream-2" />
                        </div>
                        <h1 className="hidden sm:block text-[15px] font-black tracking-tight whitespace-nowrap">GLIC Web</h1>
                        <div className="hidden sm:block w-px h-5 bg-line mx-1" />
                        <MenuBar sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen(o => !o)} />
                    </div>
                    <button
                        onClick={() => setShowAbout(true)}
                        className="flex-shrink-0 flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-md border border-ink bg-cream-2 hover:bg-white text-[11px] font-bold text-ink transition-colors"
                        title="Help, guided tour & shortcuts"
                    >
                        <CircleHelp className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Help</span>
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
                    {/* phones: tap outside the drawer to close it */}
                    {sidebarOpen && (
                        <div className="md:hidden absolute inset-0 z-20 bg-black/40" onClick={() => setSidebarOpen(false)} />
                    )}

                    <main className="flex-1 relative flex flex-col min-w-0 overflow-hidden bg-stage">
                        <CanvasViewer />
                        {!sidebarOpen && <PhoneEncodeButton />}
                    </main>
                </div>

                <Toasts />
                <Tour />
                <MaskImportHost />
                <IncomingImageHost />
                <AboutModal open={showAbout} onClose={() => setShowAbout(false)} />
            </div>
        </AppProvider>
    );
}

export default App;
