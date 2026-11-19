import React, { useEffect, useState } from 'react';
import { Menu } from 'lucide-react';
import { Outlet, useLocation } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { SetupScreen } from '@/components/auth/SetupScreen';
import { Sidebar } from '@/components/layout/Sidebar';
import { CreateAppModal } from '@/components/modals/CreateAppModal';
import logoMark from '@/assets/logo-mark.svg';

/** Opens the "New Application" modal from anywhere inside the shell (e.g. the dashboard). */
export const CreateAppContext = React.createContext<() => void>(() => {});

/**
 * Layout route: auth gate, sidebar and mobile header around the routed view.
 * While disconnected the URL is left untouched, so a deep link resolves once
 * the user connects.
 */
export const AppShell: React.FC = () => {
  const isAdminAuthenticated = useStore((s) => s.isAdminAuthenticated);
  const [isCreateAppOpen, setIsCreateAppOpen] = useState(false);
  const [isNavOpen, setIsNavOpen] = useState(false);
  const location = useLocation();

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setIsNavOpen(false);
  }, [location.pathname, location.search]);

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
    return <SetupScreen />;
  }

  return (
    <CreateAppContext.Provider value={() => setIsCreateAppOpen(true)}>
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

          <Outlet />
        </main>

        <CreateAppModal open={isCreateAppOpen} onOpenChange={setIsCreateAppOpen} />
      </div>
    </CreateAppContext.Provider>
  );
};
