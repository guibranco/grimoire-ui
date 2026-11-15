import React from 'react';
import { useStore } from '@/store/useStore';
import { useQuery } from '@tanstack/react-query';
import { api, fetchApiVersion, getApiConnectionInfo, UI_VERSION } from '@/lib/api';
import { Application, GlobalConfiguration, Secret } from '@/types/api';
import {
  Plus,
  Loader2,
  Globe,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

export const Sidebar: React.FC<{ onCreateApp: () => void }> = ({ onCreateApp }) => {
  const {
    selectedView,
    selectedAppSlug,
    setSelectedView,
    setSelectedAppSlug,
    clearGlobalHighlight,
    disconnect,
  } = useStore();

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

  return (
    <aside className="w-[220px] border-r border-border bg-sidebar flex flex-col h-screen fixed left-0 top-0 z-20">
      <div className="p-5 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 bg-grimoire shrink-0" />
          <h1 className="text-base font-bold tracking-tight text-foreground uppercase">Grimoire</h1>
        </div>
        <div className="text-[10px] text-zinc-600 font-mono mt-1 uppercase tracking-widest">v{UI_VERSION}-STABLE</div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col pt-3">
        <div className="px-2 pb-3 border-b border-border/60">
          <button
            type="button"
            onClick={() => {
              clearGlobalHighlight();
              setSelectedView('global');
            }}
            className={cn(
              "w-full flex items-center justify-between gap-2 px-3 py-2 text-[13px] font-medium transition-all",
              selectedView === 'global'
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
          </button>
        </div>

        <div className="px-5 pt-4 pb-2 flex items-center justify-between">
          <h2 className="text-[10px] font-bold text-zinc-600 uppercase tracking-[0.2em]">Applications</h2>
        </div>

        <ScrollArea className="flex-1 px-2 mt-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-0.5">
              {(Array.isArray(apps) ? apps : []).map((app) => (
                <button
                  key={app.slug}
                  onClick={() => setSelectedAppSlug(app.slug)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-1.5 text-[13px] font-medium transition-all group relative",
                    selectedView === 'app' && selectedAppSlug === app.slug
                      ? "bg-zinc-900 border-l-2 border-grimoire text-grimoire"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground"
                  )}
                >
                  <span className="truncate flex-1 text-left font-sans">{app.name}</span>
                </button>
              ))}
              <button
                onClick={onCreateApp}
                className="w-[calc(100%-16px)] mx-2 mt-4 flex items-center justify-center gap-2 px-3 py-2 border border-dashed border-zinc-700 text-zinc-500 text-[10px] font-bold tracking-widest uppercase hover:border-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <Plus className="w-3 h-3" />
                New Application
              </button>
            </div>
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
          onClick={disconnect}
        >
          Disconnect
        </Button>
      </div>
    </aside>
  );
};
