import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Boxes, Flag, Globe, Layers, Lock, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { globalPath } from '@/lib/routes';
import type { DashboardFeatureFlags, DashboardGlobal, DashboardTotals } from '@/types/api';
import { RelativeTime, Skeleton } from './parts';

const StatTile: React.FC<{ label: string; value: React.ReactNode; icon: React.ReactNode; accent?: string }> = ({
  label,
  value,
  icon,
  accent = 'text-zinc-100',
}) => (
  <div className="flex items-center gap-3 px-4 py-3 border border-border bg-card/60 min-w-0">
    <span className={cn('shrink-0', accent)}>{icon}</span>
    {/* Label first in the DOM (dt before dd); shown below the value. */}
    <div className="min-w-0 flex flex-col-reverse">
      <dt className="mt-1 text-[10px] uppercase tracking-[0.2em] text-zinc-500 truncate">{label}</dt>
      <dd className={cn('text-2xl font-semibold font-mono leading-none', accent)}>{value}</dd>
    </div>
  </div>
);

/** Totals strip. The feature flag tile only appears once the API reports flags. */
export const TotalsStrip: React.FC<{
  totals: DashboardTotals;
  featureFlags: DashboardFeatureFlags | null;
  className?: string;
}> = ({ totals, featureFlags, className }) => (
  <section aria-label="Totals" className={className}>
    <dl
      className={cn(
        'grid gap-3 grid-cols-2',
        featureFlags ? 'md:grid-cols-3 xl:grid-cols-5' : 'md:grid-cols-4'
      )}
    >
      <StatTile label="Applications" value={totals.applications} icon={<Boxes className="w-5 h-5" />} />
      <StatTile label="Environments" value={totals.environments} icon={<Layers className="w-5 h-5" />} />
      <StatTile label="Secrets" value={totals.secrets} icon={<Lock className="w-5 h-5" />} accent="text-grimoire" />
      <StatTile
        label="Configurations"
        value={totals.configurations}
        icon={<Settings className="w-5 h-5" />}
        accent="text-config"
      />
      {featureFlags && (
        <StatTile
          label="Feature flags"
          value={
            <>
              {featureFlags.enabled}
              <span className="text-sm text-zinc-500">/{featureFlags.total}</span>
            </>
          }
          icon={<Flag className="w-5 h-5" />}
        />
      )}
    </dl>
  </section>
);

export const TotalsSkeleton: React.FC<{ className?: string }> = ({ className }) => (
  <div className={cn('grid gap-3 grid-cols-2 md:grid-cols-4', className)}>
    {[0, 1, 2, 3].map((i) => (
      <Skeleton key={i} className="h-[66px]" />
    ))}
  </div>
);

export const GlobalCard: React.FC<{ global: DashboardGlobal }> = ({ global }) => (
  <Link
    to={globalPath()}
    className="group flex flex-col gap-3 p-4 border border-border bg-card/60 hover:border-global/50 transition-colors"
  >
    <span className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-global">
        <Globe className="w-3.5 h-3.5" aria-hidden="true" />
        Global
      </span>
      <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-global" aria-hidden="true" />
    </span>
    <span className="flex items-center gap-5 font-mono text-sm">
      <span className="flex items-center gap-1.5 text-config">
        <Settings className="w-3.5 h-3.5" aria-hidden="true" />
        {global.configurationCount}
        <span className="text-[10px] uppercase tracking-widest text-zinc-500">configs</span>
      </span>
      <span className="flex items-center gap-1.5 text-grimoire">
        <Lock className="w-3.5 h-3.5" aria-hidden="true" />
        {global.secretCount}
        <span className="text-[10px] uppercase tracking-widest text-zinc-500">secrets</span>
      </span>
    </span>
    <span className="text-[10px] text-zinc-500">
      Last changed <RelativeTime value={global.lastChangedAt} className="font-mono text-zinc-300" />
    </span>
  </Link>
);

/** Placeholder until feature flags land (#453, guibranco/grimoire-api#90). */
export const FeatureFlagsCard: React.FC<{ featureFlags: DashboardFeatureFlags | null }> = ({ featureFlags }) => (
  <div className="flex flex-col gap-3 p-4 border border-border bg-card/60">
    <span className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">
        <Flag className="w-3.5 h-3.5" aria-hidden="true" />
        Feature flags
      </span>
      {!featureFlags && (
        <span className="px-1.5 py-0.5 border border-border text-[9px] font-mono tracking-widest text-zinc-500">SOON</span>
      )}
    </span>
    {featureFlags ? (
      <span className="font-mono text-sm text-zinc-200">
        {featureFlags.enabled} <span className="text-zinc-500">of</span> {featureFlags.total}{' '}
        <span className="text-[10px] uppercase tracking-widest text-zinc-500">enabled</span>
      </span>
    ) : (
      <span className="text-xs text-zinc-500">
        Toggle features per environment and target audiences — coming soon.
      </span>
    )}
  </div>
);
