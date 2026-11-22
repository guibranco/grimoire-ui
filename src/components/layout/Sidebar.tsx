import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { appPath, dashboardPath, globalPath } from '@/lib/routes';
import { useQuery } from '@tanstack/react-query';
import { api, fetchApiVersion, getApiConnectionInfo, UI_VERSION } from '@/lib/api';
import { Application, GlobalConfiguration, Secret } from '@/types/api';
import {
  Plus,
  Loader2,
  Globe,
  LayoutDashboard,
  Search,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import logoMark from '@/assets/logo-mark.svg';
import { useCommandPalette } from '@/components/command/CommandPalette';
import { paletteShortcutLabel } from '@/lib/search';

interface SidebarProps {
  onCreateApp: () => void;
  /** Whether the off-canvas drawer is open (mobile only; always visible from md up). */
  open?: boolean;
  onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ onCreateApp, open = false, onClose }) => {
  const disconnect = useStore((s) => s.disconnect);
  const navigate = useNavigate();
  const palette = useCommandPalette();

  const connectionInfo = getApiConnectionInfo();

  const { data: apps, isLoading } = useQuery({
    queryKey: ['applications'],
    queryFn: async () => {
      const res = await api.get<Application[]>('/applications');
      return res.data;
    },
  });

  const { data: globalConfigs } = useQuery({
    queryKey: ['global-configurations', 'all'],
    queryFn: async () => {
      const res = await api.get<GlobalConfiguration[]>('/global/configurations');
      return res.data;
    },
  });

  const { data: globalSecrets } = useQuery({
    queryKey: ['global-secrets'],
    queryFn: async () => {
      const res = await api.get<Secret[]>('/global/secrets');
      return res.data;
    },
  });

  const globalCount =
    (Array.isArray(globalConfigs) ? globalConfigs.length : 0) +
    (Array.isArray(globalSecrets) ? globalSecrets.length : 0);

  const { data: apiVersion, isLoading: apiVersionLoading } = useQuery({
    queryKey: ['api-version', connectionInfo.rawUrl],
    queryFn: fetchApiVersion,
    retry: false,
    staleTime: 60_000,
  });

  const formattedApiVersion = apiVersion
    ? `v${apiVersion.replace(/^v/i, '')}`
    : 'N/A';

  const close = () => onClose?.();

  return (
    <>
    <div
      aria-hidden="true"
      onClick={close}
      className={cn(
        "fixed inset-0 z-30 bg-black/70 backdrop-blur-[1px] transition-opacity md:hidden",
        open ? "opacity-100" : "pointer-events-none opacity-0"
      )}
    />
    <aside
      id="app-sidebar"
      className={cn(
        "w-[260px] md:w-[220px] border-r border-border bg-sidebar flex flex-col h-dvh fixed left-0 top-0 z-40 md:z-20",
        "transition-transform duration-200 ease-out md:translate-x-0",
        open ? "translate-x-0 shadow-2xl" : "-translate-x-full"
      )}
    >
      <div className="p-5 border-b border-border">
        <div className="flex items-center gap-2">
          <img src={logoMark} alt="" aria-hidden="true" className="w-6 h-6 shrink-0" />
          <h1 className="text-base font-bold tracking-tight text-foreground uppercase flex-1">Grimoire</h1>
          <button
            type="button"
            onClick={close}
            aria-label="Close navigation"
            className="md:hidden -mr-2 h-9 w-9 inline-flex items-center justify-center text-zinc-400 hover:text-foreground hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="text-[10px] text-zinc-600 font-mono mt-1 uppercase tracking-widest">v{UI_VERSION}-STABLE</div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col pt-3">
        <div className="px-2 pb-2">
          <button
            type="button"
            onClick={() => {
              close();
              palette.open();
            }}
            className="w-full h-8 flex items-center gap-2 px-2.5 border border-border bg-zinc-900/60 text-[12px] text-zinc-500 hover:text-zinc-300 hover:border-zinc-700 transition-colors"
          >
            <Search className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span className="flex-1 text-left">Search…</span>
            <kbd className="px-1 border border-zinc-700 font-mono text-[9px] text-zinc-500">{paletteShortcutLabel()}</kbd>
          </button>
        </div>
        <nav aria-label="Primary" className="px-2 pb-3 border-b border-border/60 space-y-0.5">
          <NavLink
            to={dashboardPath()}
            end
            onClick={close}
            className={({ isActive }) => cn(
              "w-full flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium transition-all",
              isActive
                ? "bg-zinc-900 border-l-2 border-grimoire text-grimoire"
                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground"
            )}
          >
            <LayoutDashboard className="w-3.5 h-3.5 shrink-0" />
            <span className="font-sans">Dashboard</span>
          </NavLink>
          <NavLink
            to={globalPath()}
            onClick={close}
            className={({ isActive }) => cn(
              "w-full flex items-center justify-between gap-2 px-3 py-2 text-[13px] font-medium transition-all",
              isActive
                ? "bg-zinc-900 border-l-2 border-global text-global"
                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-global"
            )}
          >
            <span className="flex items-center gap-2.5">
              <Globe className="w-3.5 h-3.5 text-global shrink-0" />
              <span className="font-sans">Global</span>
            </span>
            <Badge
              variant="outline"
              className="border-global/30 bg-global/10 text-global text-[9px] font-mono px-1.5 py-0 h-4"
            >
              {globalCount}
            </Badge>
          </NavLink>
        </nav>

        <div className="px-5 pt-4 pb-2 flex items-center justify-between">
          <h2 className="text-[10px] font-bold text-zinc-600 uppercase tracking-[0.2em]">Applications</h2>
        </div>

        <ScrollArea className="flex-1 px-2 mt-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <nav aria-label="Applications" className="space-y-0.5">
              {(Array.isArray(apps) ? apps : []).map((app) => (
                <NavLink
                  key={app.slug}
                  to={appPath(app.slug)}
                  onClick={close}
                  className={({ isActive }) => cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 md:py-1.5 text-[13px] font-medium transition-all group relative",
                    isActive
                      ? "bg-zinc-900 border-l-2 border-grimoire text-grimoire"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground"
                  )}
                >
                  <span className="truncate flex-1 text-left font-sans">{app.name}</span>
                </NavLink>
              ))}
              <button
                onClick={() => {
                  close();
                  onCreateApp();
                }}
                className="w-[calc(100%-16px)] mx-2 mt-4 flex items-center justify-center gap-2 px-3 py-2 border border-dashed border-zinc-700 text-zinc-500 text-[10px] font-bold tracking-widest uppercase hover:border-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <Plus className="w-3 h-3" />
                New Application
              </button>
            </nav>
          )}
        </ScrollArea>
      </div>

      <div className="p-4 border-t border-zinc-800 bg-black/40 space-y-2.5">
        <div className="space-y-1">
          <div
            className="flex items-center gap-2 text-[9px] font-mono text-zinc-400"
            title={connectionInfo.rawUrl}
          >
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0 shadow-[0_0_4px_rgba(34,197,94,0.4)]" />
            <span className="truncate">CONNECTED: {connectionInfo.label}</span>
          </div>
          <div className="pl-3.5 flex flex-col gap-0.5 text-[9px] font-mono text-zinc-500">
            <span>UI: v{UI_VERSION}</span>
            <span className="truncate" title={apiVersion ? `API ${formattedApiVersion}` : 'API version unavailable'}>
              API: {apiVersionLoading ? '...' : formattedApiVersion}
            </span>
          </div>
        </div>
        <Button
          variant="ghost"
          className="w-full h-8 bg-zinc-800 text-[10px] font-bold uppercase tracking-widest hover:bg-zinc-700 text-zinc-400"
          onClick={() => {
            disconnect();
            navigate(dashboardPath(), { replace: true });
          }}
        >
          Disconnect
        </Button>
      </div>
    </aside>
    </>
  );
};
