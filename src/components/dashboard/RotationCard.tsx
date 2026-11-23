import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, TimerReset } from 'lucide-react';
import { cn } from '@/lib/utils';
import { dueCounts, type DueCounts } from '@/lib/rotation';
import { rotationPath } from '@/lib/routes';
import { useExpiringSecrets } from '@/components/rotation/useExpiringSecrets';
import { Skeleton } from './parts';

const ROWS: { key: keyof DueCounts; label: string; within: number | null; tone: string }[] = [
  { key: 'overdue', label: 'Overdue', within: null, tone: 'text-red-400' },
  { key: 'week', label: '7 days', within: 7, tone: 'text-amber-400' },
  { key: 'month', label: '30 days', within: 30, tone: 'text-yellow-300' },
  { key: 'quarter', label: '90 days', within: 90, tone: 'text-zinc-300' },
];

/**
 * Dashboard widget: secrets expiring or due for rotation in the next 7/30/90 days
 * (cumulative, overdue included). Hidden when the API doesn't provide the endpoint.
 */
export const RotationCard: React.FC<{ className?: string }> = ({ className }) => {
  const { data, error, isPending } = useExpiringSecrets(90);
  if (error) return null;
  if (isPending) return <Skeleton className={cn('h-28', className)} />;

  const counts = dueCounts(data.items);
  return (
    <section
      aria-labelledby="dashboard-rotation-title"
      className={cn('flex flex-col gap-3 p-4 border border-border bg-card/60', className)}
    >
      <span className="flex items-center justify-between">
        <h3
          id="dashboard-rotation-title"
          className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400"
        >
          <TimerReset className="w-3.5 h-3.5" aria-hidden="true" />
          Rotation
        </h3>
        <Link to={rotationPath()} className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-zinc-500 hover:text-grimoire">
          View all
          <ArrowRight className="w-3 h-3" aria-hidden="true" />
        </Link>
      </span>
      <dl className="grid grid-cols-4 gap-2">
        {ROWS.map(({ key, label, within, tone }) => (
          <Link
            key={key}
            to={rotationPath(within ?? 7)}
            className="flex flex-col-reverse items-start px-2 py-1.5 border border-zinc-900 hover:border-zinc-700"
          >
            <dt className="text-[9px] uppercase tracking-widest text-zinc-500">{label}</dt>
            <dd className={cn('font-mono text-xl font-semibold leading-none', counts[key] > 0 ? tone : 'text-zinc-600')}>
              {counts[key]}
            </dd>
          </Link>
        ))}
      </dl>
    </section>
  );
};
