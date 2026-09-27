import { useState } from 'react';
import { AppProvider } from './core/AppContext';
import { Sidebar } from './components/Sidebar';
import { CanvasViewer } from './components/CanvasViewer';
import { Toasts } from './components/Toasts';
import { Tour } from './components/Tour';
import { PanelLeft } from 'lucide-react';

function App() {
    const [sidebarOpen, setSidebarOpen] = useState(true);

    return (
        <AppProvider>
            <div className="flex h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-200 font-sans">
                {/* sidebar: static on desktop, overlay drawer on small screens */}
                <div
                    className={`h-full flex-shrink-0 transition-all duration-200 md:relative absolute z-30 ${
                        sidebarOpen ? 'translate-x-0' : '-translate-x-full md:w-0 md:overflow-hidden'
                    }`}
                >
                    <Sidebar />
                </div>

                <main className="flex-1 relative flex flex-col min-w-0 overflow-hidden">
                    <button
                        onClick={() => setSidebarOpen(o => !o)}
                        className="absolute top-4 left-4 z-20 p-2 bg-zinc-900/90 hover:bg-zinc-800 text-zinc-300 rounded-lg border border-zinc-700 backdrop-blur-sm transition-colors"
                        title={sidebarOpen ? 'Hide controls' : 'Show controls'}
                    >
                        <PanelLeft className="w-4 h-4" />
                    </button>
                    <CanvasViewer />
                </main>

                <Toasts />
                <Tour />
            </div>
        </AppProvider>
    );
}

export default App;
