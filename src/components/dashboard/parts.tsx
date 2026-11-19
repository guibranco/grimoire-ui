import React from 'react';
import { cn } from '@/lib/utils';
import {
  CONSUMER_HEALTH_LABEL,
  consumerHealth,
  formatAbsolute,
  formatRelative,
  type ConsumerHealth,
} from '@/lib/dashboard';

/** Bordered dashboard panel with a small uppercase title row. */
export const Panel: React.FC<{
  title: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  labelledBy?: string;
  children: React.ReactNode;
}> = ({ title, icon, actions, className, bodyClassName, labelledBy, children }) => (
  <section aria-labelledby={labelledBy} className={cn('border border-border bg-card/60 min-w-0', className)}>
    <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-border">
      <h3
        id={labelledBy}
        className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400"
      >
        {icon}
        {title}
      </h3>
      {actions}
    </header>
    <div className={cn('p-4', bodyClassName)}>{children}</div>
  </section>
);

/** Relative time with the absolute timestamp on hover. */
export const RelativeTime: React.FC<{ value: string | null | undefined; fallback?: string; className?: string }> = ({
  value,
  fallback = 'Never',
  className,
}) => {
  const absolute = formatAbsolute(value);
  if (!absolute) return <span className={cn('text-zinc-600', className)}>{fallback}</span>;
  return (
    <time dateTime={value ?? undefined} title={absolute} className={className}>
      {formatRelative(value, fallback)}
    </time>
  );
};

const HEALTH_DOT: Record<ConsumerHealth, string> = {
  fresh: 'bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.5)]',
  recent: 'bg-amber-500',
  stale: 'bg-red-500',
  never: 'bg-zinc-600',
};

/** Square status dot for when an environment's consumer was last seen. */
export const HealthDot: React.FC<{ lastSeenAt: string | null | undefined; staleAfterDays?: number; className?: string }> = ({
  lastSeenAt,
  staleAfterDays,
  className,
}) => {
  const health = consumerHealth(lastSeenAt, staleAfterDays);
  return (
    <span
      aria-hidden="true"
      data-health={health}
      className={cn('inline-block w-1.5 h-1.5 shrink-0', HEALTH_DOT[health], className)}
    />
  );
};

export const healthTitle = (lastSeenAt: string | null | undefined, staleAfterDays?: number) => {
  const health = consumerHealth(lastSeenAt, staleAfterDays);
  return health === 'never'
    ? CONSUMER_HEALTH_LABEL.never
    : `${CONSUMER_HEALTH_LABEL[health]} · last fetched ${formatRelative(lastSeenAt)}`;
};

/** Pulsing placeholder block. */
export const Skeleton: React.FC<{ className?: string }> = ({ className }) => (
  <div aria-hidden="true" className={cn('animate-pulse bg-zinc-800/60', className)} />
);
