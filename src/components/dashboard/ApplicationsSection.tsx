import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Boxes, Globe, LayoutGrid, List, Lock, Search, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { appPath } from '@/lib/routes';
import { sortAndFilterApps } from '@/lib/dashboard';
import { useStore, type DashboardAppsSort } from '@/store/useStore';
import type { AttentionSeverity, DashboardApplication, DashboardEnvironment } from '@/types/api';
import { HealthDot, Panel, RelativeTime, Skeleton, healthTitle } from './parts';

export type DashboardAppRow = DashboardApplication & { description?: string | null };

export interface AppAttention {
  count: number;
  worst: AttentionSeverity;
}

const SORT_LABELS: Record<DashboardAppsSort, string> = {
  name: 'Name',
  lastChanged: 'Last changed',
  lastFetched: 'Last fetched',
};

const ATTENTION_BADGE: Record<AttentionSeverity, string> = {
  error: 'border-red-500/40 bg-red-500/10 text-red-400',
  warning: 'border-amber-500/40 bg-amber-500/10 text-amber-400',
  info: 'border-zinc-700 bg-zinc-800/60 text-zinc-400',
};

const AttentionBadge: React.FC<{ attention?: AppAttention }> = ({ attention }) =>
  attention && attention.count > 0 ? (
    <span
      title={`${attention.count} item${attention.count === 1 ? '' : 's'} need attention`}
      className={cn(
        'relative z-10 inline-flex items-center gap-1 px-1.5 py-0.5 border text-[10px] font-mono font-bold',
        ATTENTION_BADGE[attention.worst]
      )}
    >
      <AlertTriangle className="w-3 h-3" aria-hidden="true" />
      {attention.count}
      <span className="sr-only"> need attention</span>
    </span>
  ) : null;

const EnvChip: React.FC<{ appSlug: string; env: DashboardEnvironment }> = ({ appSlug, env }) => (
  <Link
    to={appPath(appSlug, env.slug)}
    title={`${env.name ?? env.slug}: ${env.secretCount} secrets, ${env.configurationCount} configurations · ${healthTitle(env.lastSeenAt)}`}
    className="relative z-10 inline-flex items-center gap-1.5 px-1.5 py-0.5 border border-zinc-800 bg-zinc-900 text-[10px] font-mono text-zinc-300 hover:border-zinc-600 hover:text-foreground transition-colors"
  >
    <HealthDot lastSeenAt={env.lastSeenAt} />
    <span>{env.slug}</span>
    <span className="text-zinc-600" aria-label={`${env.secretCount} secrets, ${env.configurationCount} configurations`}>
      <span className="text-grimoire/80">{env.secretCount}</span>
      <span>/</span>
      <span className="text-config/80">{env.configurationCount}</span>
    </span>
  </Link>
);

const Counts: React.FC<{ app: DashboardAppRow }> = ({ app }) => (
  <span className="flex items-center gap-3 text-[11px] font-mono">
    <span className="flex items-center gap-1 text-grimoire" title="Secrets">
      <Lock className="w-3 h-3" aria-hidden="true" />
      {app.secretCount}
      <span className="sr-only"> secrets</span>
    </span>
    <span className="flex items-center gap-1 text-config" title="Configurations">
      <Settings className="w-3 h-3" aria-hidden="true" />
      {app.configurationCount}
      <span className="sr-only"> configurations</span>
    </span>
  </span>
);

const InheritsBadge: React.FC = () => (
  <span
    title="Inherits Global configuration and secrets"
    className="inline-flex items-center gap-1 px-1.5 py-0.5 border border-global/30 bg-global/10 text-global text-[9px] font-mono uppercase tracking-wider"
  >
    <Globe className="w-2.5 h-2.5" aria-hidden="true" />
    Inherits globals
  </span>
);

/** Card with a stretched title link; env chips and badges sit above it (`z-10`). */
const AppCard: React.FC<{ app: DashboardAppRow; attention?: AppAttention }> = ({ app, attention }) => (
  <li className="group relative flex flex-col gap-3 p-4 border border-border bg-zinc-950/40 hover:border-grimoire/50 hover:bg-zinc-900/60 transition-colors">
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <Link
          to={appPath(app.slug)}
          className="block truncate text-sm font-semibold text-zinc-100 group-hover:text-grimoire after:absolute after:inset-0"
        >
          {app.name}
        </Link>
        <span className="block truncate font-mono text-[10px] text-zinc-500">{app.slug}</span>
      </div>
      <AttentionBadge attention={attention} />
    </div>
    {app.description && <p className="text-xs text-zinc-500 line-clamp-2">{app.description}</p>}
    <div className="flex flex-wrap items-center gap-2">
      <Counts app={app} />
      {app.inheritGlobals && <InheritsBadge />}
    </div>
    <div className="flex flex-wrap gap-1.5">
      {app.environments.length > 0 ? (
        app.environments.map((env) => <EnvChip key={env.slug} appSlug={app.slug} env={env} />)
      ) : (
        <span className="text-[10px] font-mono text-zinc-600">No environments</span>
      )}
    </div>
    <dl className="mt-auto grid grid-cols-2 gap-2 pt-2 border-t border-zinc-900 text-[10px]">
      <div>
        <dt className="uppercase tracking-widest text-zinc-600">Last changed</dt>
        <dd className="font-mono text-zinc-300"><RelativeTime value={app.lastChangedAt} /></dd>
      </div>
      <div>
        <dt className="uppercase tracking-widest text-zinc-600">Last fetched</dt>
        <dd className="font-mono text-zinc-300 flex items-center gap-1.5">
          <HealthDot lastSeenAt={app.lastSeenAt} />
          <RelativeTime value={app.lastSeenAt} />
        </dd>
      </div>
    </dl>
  </li>
);

const AppRow: React.FC<{ app: DashboardAppRow; attention?: AppAttention }> = ({ app, attention }) => (
  <li className="group relative grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto_7rem_7rem_3rem] items-center gap-2 md:gap-4 px-4 py-3 border-b border-zinc-900 last:border-b-0 hover:bg-zinc-900/50 transition-colors">
    <div className="min-w-0">
      <Link
        to={appPath(app.slug)}
        className="block truncate text-sm font-semibold text-zinc-100 group-hover:text-grimoire after:absolute after:inset-0"
      >
        {app.name}
      </Link>
      <span className="flex items-center gap-2 font-mono text-[10px] text-zinc-500">
        <span className="truncate">{app.slug}</span>
        {app.inheritGlobals && <Globe className="w-3 h-3 text-global shrink-0" aria-label="Inherits globals" />}
      </span>
    </div>
    <div className="flex flex-wrap gap-1.5">
      {app.environments.map((env) => (
        <EnvChip key={env.slug} appSlug={app.slug} env={env} />
      ))}
    </div>
    <Counts app={app} />
    <span className="text-[11px] font-mono text-zinc-400">
      <span className="md:hidden text-zinc-600">Changed </span>
      <RelativeTime value={app.lastChangedAt} />
    </span>
    <span className="text-[11px] font-mono text-zinc-400 flex items-center gap-1.5">
      <span className="md:hidden text-zinc-600">Fetched </span>
      <HealthDot lastSeenAt={app.lastSeenAt} />
      <RelativeTime value={app.lastSeenAt} />
    </span>
    <span className="md:justify-self-end">
      <AttentionBadge attention={attention} />
    </span>
  </li>
);

export const ApplicationsSection: React.FC<{
  apps: DashboardAppRow[];
  attentionByApp: Map<string, AppAttention>;
  className?: string;
}> = ({ apps, attentionByApp, className }) => {
  const view = useStore((s) => s.dashboardAppsView);
  const setView = useStore((s) => s.setDashboardAppsView);
  const sort = useStore((s) => s.dashboardAppsSort);
  const setSort = useStore((s) => s.setDashboardAppsSort);
  const [filter, setFilter] = useState('');

  const visible = useMemo(() => sortAndFilterApps(apps, sort, filter), [apps, sort, filter]);

  const toggle = (value: typeof view, label: string, icon: React.ReactNode) => (
    <button
      type="button"
      aria-pressed={view === value}
      aria-label={label}
      title={label}
      onClick={() => setView(value)}
      className={cn(
        'h-7 w-7 inline-flex items-center justify-center border border-zinc-800 transition-colors',
        view === value ? 'bg-zinc-800 text-grimoire' : 'text-zinc-500 hover:text-zinc-200'
      )}
    >
      {icon}
    </button>
  );

  return (
    <Panel
      className={className}
      labelledBy="dashboard-apps-title"
      icon={<Boxes className="w-3.5 h-3.5" aria-hidden="true" />}
      title={<>Applications <span className="font-mono text-zinc-600">{apps.length}</span></>}
      bodyClassName="p-0"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative">
            <span className="sr-only">Filter applications</span>
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-600" aria-hidden="true" />
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter…"
              className="h-7 w-36 md:w-44 pl-7 pr-2 bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-grimoire/60"
            />
          </label>
          <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-zinc-500">
            <span>Sort</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as DashboardAppsSort)}
              className="h-7 px-1.5 bg-zinc-950 border border-zinc-800 text-xs normal-case tracking-normal text-zinc-200 focus:border-grimoire/60"
            >
              {(Object.keys(SORT_LABELS) as DashboardAppsSort[]).map((key) => (
                <option key={key} value={key}>
                  {SORT_LABELS[key]}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="flex border-0 p-0 m-0 min-w-0" aria-label="Layout">
            {toggle('grid', 'Grid view', <LayoutGrid className="w-3.5 h-3.5" />)}
            {toggle('list', 'List view', <List className="w-3.5 h-3.5" />)}
          </fieldset>
        </div>
      }
    >
      {visible.length === 0 ? (
        <p className="p-8 text-center text-xs text-zinc-500">No applications match “{filter}”.</p>
      ) : (
        <ul
          aria-label="Applications"
          className={view === 'grid' ? 'grid gap-3 p-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3' : undefined}
        >
          {visible.map((app) => {
            const Item = view === 'grid' ? AppCard : AppRow;
            return <Item key={app.slug} app={app} attention={attentionByApp.get(app.slug)} />;
          })}
        </ul>
      )}
    </Panel>
  );
};

export const ApplicationsSkeleton: React.FC<{ className?: string }> = ({ className }) => (
  <Panel className={className} title="Applications" icon={<Boxes className="w-3.5 h-3.5" aria-hidden="true" />}>
    <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-44" />
      ))}
    </div>
  </Panel>
);
