import { AppProvider } from './core/AppContext';
import { Sidebar } from './components/Sidebar';
import { CanvasViewer } from './components/CanvasViewer';

function App() {
  return (
    <AppProvider>
      <div className="flex h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-200 font-sans">
        <Sidebar />
        <main className="flex-1 relative flex flex-col min-w-0 overflow-hidden">
          <CanvasViewer />
        </main>
      </div>
    </AppProvider>
  );
}

export default App;
