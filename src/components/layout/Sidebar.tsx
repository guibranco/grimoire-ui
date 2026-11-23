import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { appPath, auditPath, dashboardPath, globalPath, reportsPath, rotationPath } from '@/lib/routes';
import { useQuery } from '@tanstack/react-query';
import { api, fetchApiVersion, getApiConnectionInfo, getApiDocsUrl, UI_REPOSITORY_URL, UI_VERSION } from '@/lib/api';
import { Application, GlobalConfiguration, Secret } from '@/types/api';
import {
  Plus,
  Loader2,
  Globe,
  LayoutDashboard,
  ScrollText,
  Search,
  X,
  BarChart3,
  TimerReset,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';
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


interface SidebarSectionProps {
  title: string;
  count?: number;
  action?: React.ReactNode;
  children: React.ReactNode;
}

/** A labelled group of sidebar links; the label names the `<nav>` for assistive tech. */
const SidebarSection: React.FC<SidebarSectionProps> = ({ title, count, action, children }) => {
  const headingId = React.useId();
  return (
    <section className="pt-3 first:pt-1">
      <div className="px-3 pb-1.5 flex items-center justify-between gap-2 min-h-5">
        <h2 id={headingId} className="text-[10px] font-bold text-zinc-600 uppercase tracking-[0.2em]">
          {title}
          {count !== undefined && (
            <span className="ml-1.5 font-mono tracking-normal text-zinc-700">{count}</span>
          )}
        </h2>
        {action}
      </div>
      <nav aria-labelledby={headingId} className="space-y-0.5">
        {children}
      </nav>
    </section>
  );
};

interface SidebarNavItemProps {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  /** `global` uses the Global (sky) accent; everything else uses the Grimoire (amber) accent. */
  accent?: 'grimoire' | 'global';
  count?: number;
  onNavigate?: () => void;
}

const SidebarNavItem: React.FC<SidebarNavItemProps> = ({
  to,
  label,
  icon: Icon,
  end,
  accent = 'grimoire',
  count,
  onNavigate,
}) => {
  const isGlobal = accent === 'global';
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) => cn(
        "w-full flex items-center gap-2.5 px-3 py-2 md:py-1.5 text-[13px] font-medium transition-all border-l-2",
        isActive
          ? cn("bg-zinc-900", isGlobal ? "border-global text-global" : "border-grimoire text-grimoire")
          : cn(
              "border-transparent text-sidebar-foreground hover:bg-sidebar-accent",
              isGlobal ? "hover:text-global" : "hover:text-foreground"
            )
      )}
    >
      <Icon className={cn("w-3.5 h-3.5 shrink-0", isGlobal && "text-global")} aria-hidden="true" />
      <span className="flex-1 truncate font-sans">{label}</span>
      {count !== undefined && (
        <Badge
          variant="outline"
          className={cn(
            "text-[9px] font-mono px-1.5 py-0 h-4",
            isGlobal ? "border-global/30 bg-global/10 text-global" : "border-zinc-700 text-zinc-400"
          )}
        >
          {count}
        </Badge>
      )}
    </NavLink>
  );
};

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

  const sortedApps = React.useMemo(
    () =>
      (Array.isArray(apps) ? [...apps] : []).sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      ),
    [apps]
  );

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

  const apiDocsUrl = getApiDocsUrl();
  const apiVersionLabel = apiVersion ? `API ${formattedApiVersion}` : 'API version unavailable';
  const apiLinkTitle = connectionInfo.isMock
    ? 'Open the Grimoire API repository on GitHub'
    : `Open the API docs (${apiVersionLabel})`;
  const versionLinkClass =
    'flex items-center gap-1 w-fit max-w-full hover:text-zinc-300 hover:underline underline-offset-2 transition-colors focus-visible:outline-none focus-visible:text-zinc-300 focus-visible:underline';

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

      <div className="px-2 pt-3 pb-2">
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

      <ScrollArea className="flex-1 min-h-0">
        <div className="px-2 pb-4">
          <SidebarSection title="Overview">
            <SidebarNavItem to={dashboardPath()} end icon={LayoutDashboard} label="Dashboard" onNavigate={close} />
            <SidebarNavItem to={reportsPath()} icon={BarChart3} label="Reports" onNavigate={close} />
          </SidebarSection>

          <SidebarSection title="Shared">
            <SidebarNavItem
              to={globalPath()}
              icon={Globe}
              label="Global"
              accent="global"
              count={globalCount}
              onNavigate={close}
            />
          </SidebarSection>

          <SidebarSection title="Governance">
            <SidebarNavItem to={rotationPath()} icon={TimerReset} label="Rotation" onNavigate={close} />
            <SidebarNavItem to={auditPath()} icon={ScrollText} label="Audit log" onNavigate={close} />
          </SidebarSection>

          <SidebarSection
            title="Applications"
            count={isLoading ? undefined : sortedApps.length}
            action={
              <button
                type="button"
                onClick={() => {
                  close();
                  onCreateApp();
                }}
                aria-label="New application"
                title="New application"
                className="h-5 w-5 inline-flex items-center justify-center text-zinc-500 hover:text-grimoire hover:bg-zinc-800 transition-colors"
              >
                <Plus className="w-3 h-3" />
              </button>
            }
          >
            {isLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            ) : sortedApps.length === 0 ? (
              <button
                type="button"
                onClick={() => {
                  close();
                  onCreateApp();
                }}
                className="w-full mt-1 flex items-center justify-center gap-2 px-3 py-2 border border-dashed border-zinc-700 text-zinc-500 text-[10px] font-bold tracking-widest uppercase hover:border-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <Plus className="w-3 h-3" />
                New Application
              </button>
            ) : (
              sortedApps.map((app) => (
                <NavLink
                  key={app.slug}
                  to={appPath(app.slug)}
                  onClick={close}
                  title={app.name}
                  className={({ isActive }) => cn(
                    "w-full flex items-center gap-2.5 px-3 py-2.5 md:py-1.5 text-[13px] font-medium transition-all border-l-2",
                    isActive
                      ? "bg-zinc-900 border-grimoire text-grimoire"
                      : "border-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground"
                  )}
                >
                  <span className="truncate flex-1 text-left font-sans">{app.name}</span>
                </NavLink>
              ))
            )}
          </SidebarSection>
        </div>
      </ScrollArea>

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
            <a
              href={UI_REPOSITORY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={versionLinkClass}
              title="Open the Grimoire UI repository on GitHub"
            >
              <span className="truncate">UI: v{UI_VERSION}</span>
              <ExternalLink className="w-2.5 h-2.5 shrink-0 opacity-60" aria-hidden="true" />
            </a>
            <a
              href={apiDocsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={versionLinkClass}
              title={apiLinkTitle}
            >
              <span className="truncate">API: {apiVersionLoading ? '...' : formattedApiVersion}</span>
              <ExternalLink className="w-2.5 h-2.5 shrink-0 opacity-60" aria-hidden="true" />
            </a>
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
