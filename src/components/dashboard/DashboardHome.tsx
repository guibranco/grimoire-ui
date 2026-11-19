import React, { useContext } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { api } from '@/lib/api';
import { appPath } from '@/lib/routes';
import { Application } from '@/types/api';
import { useStore } from '@/store/useStore';
import { CreateAppContext } from '@/components/layout/AppShell';
import logoMark from '@/assets/logo-mark.svg';

/**
 * Home route (`/`). Placeholder until the full dashboard lands (#470); offers a
 * "Continue to …" shortcut back to the last visited application.
 */
export const DashboardHome: React.FC = () => {
  const openCreateApp = useContext(CreateAppContext);
  const lastVisitedAppSlug = useStore((s) => s.lastVisitedAppSlug);
  const lastVisitedEnvironmentSlug = useStore((s) => s.lastVisitedEnvironmentSlug);

  const { data: apps } = useQuery({
    queryKey: ['applications'],
    queryFn: async () => {
      const res = await api.get<Application[]>('/applications');
      return res.data;
    },
  });

  const lastApp = lastVisitedAppSlug && Array.isArray(apps)
    ? apps.find((a) => a.slug === lastVisitedAppSlug)
    : undefined;

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-12 text-center text-zinc-400">
      <img src={logoMark} alt="Grimoire" className="w-20 h-20 mb-6" />
      <h2 className="text-2xl font-bold tracking-tight mb-2 text-zinc-100 italic">Welcome to Grimoire</h2>
      <p className="text-zinc-500 max-w-sm mb-8 uppercase tracking-widest font-mono text-[10px]">
        Select Global or an application from the sidebar, or create a new one to get started.
      </p>

      {lastApp && (
        <Link
          to={appPath(lastApp.slug, lastVisitedEnvironmentSlug)}
          className="mb-4 w-full max-w-sm flex items-center justify-between gap-3 px-4 py-3 border border-border bg-zinc-900/60 text-left hover:border-grimoire/60 hover:bg-zinc-900 transition-colors group"
        >
          <span className="min-w-0">
            <span className="block text-[10px] font-mono uppercase tracking-widest text-zinc-500">Continue to</span>
            <span className="block truncate text-sm font-semibold text-zinc-100 group-hover:text-grimoire">
              {lastApp.name}
              {lastVisitedEnvironmentSlug && (
                <span className="ml-2 font-mono text-[11px] font-normal text-zinc-500">/ {lastVisitedEnvironmentSlug}</span>
              )}
            </span>
          </span>
          <ArrowRight className="w-4 h-4 shrink-0 text-zinc-500 group-hover:text-grimoire" />
        </Link>
      )}

      <button
        type="button"
        onClick={openCreateApp}
        className="px-8 py-2 bg-grimoire text-black font-bold tracking-tight uppercase hover:bg-grimoire/90 transition-colors text-xs"
      >
        Create New Application
      </button>
    </div>
  );
};
