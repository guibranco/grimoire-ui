import React, { useState } from 'react';
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
      <div className="min-h-screen bg-background text-foreground flex">
        <Sidebar onCreateApp={() => setIsCreateAppOpen(true)} />
        
        <main className="flex-1 ml-[220px] min-h-screen flex flex-col">
          {selectedView === 'global' ? (
            <GlobalView />
          ) : selectedAppSlug ? (
            <AppDetailView key={selectedAppSlug} />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-zinc-400">
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
