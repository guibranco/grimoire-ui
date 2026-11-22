import React, { useContext, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertOctagon, ArrowRight, Lock, Plus, RefreshCw, Search, Settings } from 'lucide-react';
import { api } from '@/lib/api';
import { appPath, globalCreatePath } from '@/lib/routes';
import {
  DASHBOARD_QUERY_KEY,
  DASHBOARD_REFETCH_INTERVAL_MS,
  SEVERITIES,
  parseDashboard,
} from '@/lib/dashboard';
import { cn } from '@/lib/utils';
import type { Application, AttentionSeverity, DashboardResponse } from '@/types/api';
import { useStore } from '@/store/useStore';
import { CreateAppContext } from '@/components/layout/AppShell';
import { useCommandPalette } from '@/components/command/CommandPalette';
import { paletteShortcutLabel } from '@/lib/search';
import logoMark from '@/assets/logo-mark.svg';
import { RelativeTime, Skeleton } from './parts';
import { ApplicationsSection, ApplicationsSkeleton, type AppAttention, type DashboardAppRow } from './ApplicationsSection';
import { AttentionPanel, AttentionSkeleton } from './AttentionPanel';
import { FeatureFlagsCard, GlobalCard, TotalsSkeleton, TotalsStrip } from './SummaryCards';
import { ActivityFeed, ActivitySkeleton } from './ActivityFeed';

export const useDashboard = () =>
  useQuery({
    queryKey: DASHBOARD_QUERY_KEY,
    queryFn: async (): Promise<DashboardResponse> => {
      const res = await api.get('/dashboard');
      // The demo mock adapter resolves error statuses instead of rejecting like axios does.
      if (res.status >= 400) {
        throw Object.assign(new Error(`Request failed with status ${res.status}`), { response: res });
      }
      return parseDashboard(res.data);
    },
    refetchOnWindowFocus: true,
    refetchInterval: DASHBOARD_REFETCH_INTERVAL_MS,
  });

/*
 * Section order. Desktop (md+): continue → totals → apps → attention → global/flags → activity.
 * Mobile: continue → attention → apps → totals → activity → global/flags.
 */
const ORDER = {
  continue: 'order-1',
  totals: 'order-4 md:order-2',
  apps: 'order-3',
  attention: 'order-2 md:order-4',
  cards: 'order-6 md:order-5',
  activity: 'order-5 md:order-6',
};

const quickAction =
  'h-8 inline-flex items-center gap-1.5 px-3 border text-[10px] font-bold uppercase tracking-widest transition-colors';

const Header: React.FC<{
  generatedAt?: string;
  isFetching: boolean;
  refreshFailed: boolean;
  onRefresh: () => void;
  onCreateApp: () => void;
  onSearch: () => void;
}> = ({ generatedAt, isFetching, refreshFailed, onRefresh, onCreateApp, onSearch }) => (
  <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
    <div className="min-w-0">
      <h2 className="text-xl font-semibold tracking-tight text-foreground">Dashboard</h2>
      <p className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
        {generatedAt ? (
          <span>
            Updated <RelativeTime value={generatedAt} className="font-mono text-zinc-400" />
          </span>
        ) : (
          <span>Loading…</span>
        )}
        {refreshFailed && <span className="text-red-400">· Refresh failed, showing last data</span>}
        <button
          type="button"
          onClick={onRefresh}
          disabled={isFetching}
          aria-label="Refresh dashboard"
          title="Refresh"
          className="h-6 w-6 inline-flex items-center justify-center text-zinc-500 hover:text-zinc-200 disabled:opacity-60"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', isFetching && 'animate-spin')} aria-hidden="true" />
        </button>
      </p>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onCreateApp}
        className={cn(quickAction, 'border-grimoire bg-grimoire text-black hover:bg-grimoire/90')}
      >
        <Plus className="w-3 h-3" aria-hidden="true" />
        New application
      </button>
      <Link
        to={globalCreatePath('config')}
        className={cn(quickAction, 'border-zinc-800 text-zinc-300 hover:border-config/60 hover:text-config')}
      >
        <Settings className="w-3 h-3" aria-hidden="true" />
        New global config
      </Link>
      <Link
        to={globalCreatePath('secrets')}
        className={cn(quickAction, 'border-zinc-800 text-zinc-300 hover:border-grimoire/60 hover:text-grimoire')}
      >
        <Lock className="w-3 h-3" aria-hidden="true" />
        New global secret
      </Link>
      <button
        type="button"
        onClick={onSearch}
        className={cn(quickAction, 'border-zinc-800 text-zinc-300 hover:border-zinc-600 hover:text-foreground')}
      >
        <Search className="w-3 h-3" aria-hidden="true" />
        Search
        <kbd className="ml-1 px-1 border border-zinc-700 font-mono text-[9px] normal-case tracking-normal">{paletteShortcutLabel()}</kbd>
      </button>
    </div>
  </header>
);

const ContinueCard: React.FC<{ appSlug: string; appName: string; envSlug: string | null; className?: string }> = ({
  appSlug,
  appName,
  envSlug,
  className,
}) => (
  <Link
    to={appPath(appSlug, envSlug)}
    className={cn(
      'flex items-center justify-between gap-3 px-4 py-3 border border-border bg-zinc-900/60 hover:border-grimoire/60 hover:bg-zinc-900 transition-colors group',
      className
    )}
  >
    <span className="min-w-0">
      <span className="block text-[10px] font-mono uppercase tracking-widest text-zinc-500">Continue to</span>
      <span className="block truncate text-sm font-semibold text-zinc-100 group-hover:text-grimoire">
        {appName}
        {envSlug && <span className="ml-2 font-mono text-[11px] font-normal text-zinc-500">/ {envSlug}</span>}
      </span>
    </span>
    <ArrowRight className="w-4 h-4 shrink-0 text-zinc-500 group-hover:text-grimoire" aria-hidden="true" />
  </Link>
);

/** No applications yet: keep the original call to action. */
const EmptyEstate: React.FC<{ onCreateApp: () => void }> = ({ onCreateApp }) => (
  <div className="flex-1 flex flex-col items-center justify-center py-12 text-center text-zinc-400">
    <img src={logoMark} alt="Grimoire" className="w-20 h-20 mb-6" />
    <h3 className="text-2xl font-bold tracking-tight mb-2 text-zinc-100 italic">Welcome to Grimoire</h3>
    <p className="text-zinc-500 max-w-sm mb-8 uppercase tracking-widest font-mono text-[10px]">
      Create your first application, or define Global values every application inherits.
    </p>
    <button
      type="button"
      onClick={onCreateApp}
      className="px-8 py-2 bg-grimoire text-black font-bold tracking-tight uppercase hover:bg-grimoire/90 transition-colors text-xs"
    >
      Create New Application
    </button>
  </div>
);

const ErrorState: React.FC<{ onRetry: () => void; retrying: boolean }> = ({ onRetry, retrying }) => (
  <div role="alert" className="flex flex-col items-center justify-center gap-3 py-16 border border-red-500/30 bg-red-500/5 text-center">
    <AlertOctagon className="w-6 h-6 text-red-400" aria-hidden="true" />
    <h3 className="text-sm font-bold text-zinc-100">Couldn't load the dashboard</h3>
    <p className="text-xs text-zinc-500 max-w-sm">
      The Grimoire API didn't return dashboard data. Check the connection, or that the API is recent enough to
      provide <code className="font-mono text-zinc-400">/management/dashboard</code>.
    </p>
    <button
      type="button"
      onClick={onRetry}
      disabled={retrying}
      className="mt-1 px-4 py-2 border border-border text-xs uppercase font-bold tracking-widest hover:bg-muted disabled:opacity-60"
    >
      {retrying ? 'Retrying…' : 'Retry'}
    </button>
  </div>
);

/** Home route (`/`): estate overview fed by `GET /management/dashboard`. */
export const DashboardHome: React.FC = () => {
  const openCreateApp = useContext(CreateAppContext);
  const palette = useCommandPalette();
  const lastVisitedAppSlug = useStore((s) => s.lastVisitedAppSlug);
  const lastVisitedEnvironmentSlug = useStore((s) => s.lastVisitedEnvironmentSlug);
  const { data, error, isPending, isFetching, refetch } = useDashboard();

  // Descriptions aren't part of the dashboard payload; the sidebar already loads them.
  const { data: appList } = useQuery({
    queryKey: ['applications'],
    queryFn: async () => {
      const res = await api.get<Application[]>('/applications');
      return res.data;
    },
  });

  const apps: DashboardAppRow[] = useMemo(() => {
    const descriptions = new Map((Array.isArray(appList) ? appList : []).map((a) => [a.slug, a.description]));
    return (data?.applications ?? []).map((a) => ({ ...a, description: descriptions.get(a.slug) ?? null }));
  }, [data, appList]);

  const appNames = useMemo(() => new Map(apps.map((a) => [a.slug, a.name])), [apps]);

  const attentionByApp = useMemo(() => {
    const map = new Map<string, AppAttention>();
    const rank = (s: AttentionSeverity) => SEVERITIES.indexOf(s);
    for (const item of data?.attention ?? []) {
      if (!item.application) continue;
      const current = map.get(item.application);
      const severity = SEVERITIES.includes(item.severity) ? item.severity : 'info';
      map.set(item.application, {
        count: (current?.count ?? 0) + 1,
        worst: current && rank(current.worst) <= rank(severity) ? current.worst : severity,
      });
    }
    return map;
  }, [data]);

  const lastApp = lastVisitedAppSlug ? apps.find((a) => a.slug === lastVisitedAppSlug) : undefined;
  const lastEnv =
    lastApp && lastVisitedEnvironmentSlug && lastApp.environments.some((e) => e.slug === lastVisitedEnvironmentSlug)
      ? lastVisitedEnvironmentSlug
      : null;

  let content: React.ReactNode;
  if (isPending) {
    content = (
      <div className="flex flex-col gap-4 md:gap-6" aria-busy="true" aria-label="Loading dashboard">
        <TotalsSkeleton className={ORDER.totals} />
        <ApplicationsSkeleton className={ORDER.apps} />
        <AttentionSkeleton className={ORDER.attention} />
        <div className={cn('grid gap-3 md:grid-cols-2', ORDER.cards)}>
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <ActivitySkeleton className={ORDER.activity} />
      </div>
    );
  } else if (!data) {
    content = <ErrorState onRetry={() => void refetch()} retrying={isFetching} />;
  } else if (data.applications.length === 0) {
    content = <EmptyEstate onCreateApp={openCreateApp} />;
  } else {
    content = (
      <div className="flex flex-col gap-4 md:gap-6">
        {lastApp && (
          <ContinueCard
            className={ORDER.continue}
            appSlug={lastApp.slug}
            appName={lastApp.name}
            envSlug={lastEnv}
          />
        )}
        <TotalsStrip className={ORDER.totals} totals={data.totals} featureFlags={data.featureFlags} />
        <ApplicationsSection className={ORDER.apps} apps={apps} attentionByApp={attentionByApp} />
        <AttentionPanel className={ORDER.attention} items={data.attention} appNames={appNames} />
        <div className={cn('grid gap-3 md:grid-cols-2', ORDER.cards)}>
          <GlobalCard global={data.global} />
          <FeatureFlagsCard featureFlags={data.featureFlags} />
        </div>
        <ActivityFeed className={ORDER.activity} events={data.recentActivity} appNames={appNames} />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-[#0A0A0B]">
      <div className="mx-auto w-full max-w-[1400px] p-4 md:p-6 flex flex-col gap-4 md:gap-6">
        <Header
          generatedAt={data?.generatedAt}
          isFetching={isFetching}
          refreshFailed={!!error && !!data}
          onRefresh={() => void refetch()}
          onCreateApp={openCreateApp}
          onSearch={palette.open}
        />
        {content}
      </div>
    </div>
  );
};
