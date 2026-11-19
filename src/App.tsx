import React, { useEffect, useState } from 'react';
import { Menu } from 'lucide-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { useStore } from './store/useStore';
import { SetupScreen } from './components/auth/SetupScreen';
import { Sidebar } from './components/layout/Sidebar';
import { AppDetailView } from './components/app/AppDetailView';
import { GlobalView } from './components/global/GlobalView';
import { CreateAppModal } from './components/modals/CreateAppModal';
import logoMark from '@/assets/logo-mark.svg';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export default function App() {
  const { isAdminAuthenticated, selectedView, selectedAppSlug } = useStore();
  const [isCreateAppOpen, setIsCreateAppOpen] = useState(false);
  const [isNavOpen, setIsNavOpen] = useState(false);

  // Close the mobile drawer on Escape and when the viewport grows past the md breakpoint.
  useEffect(() => {
    if (!isNavOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setIsNavOpen(false);
    const mq = window.matchMedia('(min-width: 768px)');
    const onMq = () => mq.matches && setIsNavOpen(false);
    window.addEventListener('keydown', onKey);
    mq.addEventListener('change', onMq);
    return () => {
      window.removeEventListener('keydown', onKey);
      mq.removeEventListener('change', onMq);
    };
  }, [isNavOpen]);

  if (!isAdminAuthenticated) {
    return (
      <QueryClientProvider client={queryClient}>
        <SetupScreen />
        <Toaster position="bottom-right" toastOptions={{
          style: {
            background: '#1C1C1F',
            color: '#F1F1F1',
            border: '1px solid #27272A',
            borderRadius: '0px',
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
          },
        }} />
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-dvh bg-background text-foreground flex">
        <Sidebar
          onCreateApp={() => setIsCreateAppOpen(true)}
          open={isNavOpen}
          onClose={() => setIsNavOpen(false)}
        />

        <main className="flex-1 min-w-0 md:ml-[220px] min-h-dvh flex flex-col">
          <div className="md:hidden sticky top-0 z-20 h-12 flex items-center gap-2 px-2 border-b border-border bg-sidebar shrink-0">
            <button
              type="button"
              onClick={() => setIsNavOpen(true)}
              aria-label="Open navigation"
              aria-controls="app-sidebar"
              aria-expanded={isNavOpen}
              className="h-10 w-10 inline-flex items-center justify-center text-zinc-300 hover:text-foreground hover:bg-zinc-800 transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
            <img src={logoMark} alt="" aria-hidden="true" className="w-5 h-5 shrink-0" />
            <span className="text-sm font-bold tracking-tight uppercase">Grimoire</span>
          </div>

          {selectedView === 'global' ? (
            <GlobalView />
          ) : selectedAppSlug ? (
            <AppDetailView key={selectedAppSlug} />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-12 text-center text-zinc-400">
              <img src={logoMark} alt="Grimoire" className="w-20 h-20 mb-6" />
              <h2 className="text-2xl font-bold tracking-tight mb-2 text-zinc-100 italic">Welcome to Grimoire</h2>
              <p className="text-zinc-500 max-w-sm mb-8 text-sm uppercase tracking-widest font-mono text-[10px]">
                Select Global or an application from the sidebar, or create a new one to get started.
              </p>
              <button 
                onClick={() => setIsCreateAppOpen(true)}
                className="px-8 py-2 bg-grimoire text-black font-bold tracking-tight uppercase hover:bg-grimoire/90 transition-colors text-xs"
              >
                Create New Application
              </button>
            </div>
          )}
        </main>

        <CreateAppModal open={isCreateAppOpen} onOpenChange={setIsCreateAppOpen} />
        
        <Toaster position="bottom-right" toastOptions={{
          style: {
            background: '#1C1C1F',
            color: '#F1F1F1',
            border: '1px solid #27272A',
            borderRadius: '0px',
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
          },
        }} />
      </div>
    </QueryClientProvider>
  );
}
