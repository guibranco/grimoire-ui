import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { AlertOctagon, BellRing, CheckCircle2, Globe, Loader2, RefreshCw, TimerReset } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatAbsolute } from '@/lib/dashboard';
import {
  BUCKET_STYLES,
  DEFAULT_ROTATION_WINDOW,
  ROTATION_WINDOWS,
  dueBucket,
  dueInWords,
  expiringSecretLink,
  isRotationWindow,
  reasonLabel,
} from '@/lib/rotation';
import type { ExpiringSecret, RotationReminderRun } from '@/types/api';
import { useExpiringSecrets } from './useExpiringSecrets';
import { apiErrorMessage } from '@/lib/errors';

const chip = 'h-[26px] px-2.5 border text-[10px] font-bold uppercase tracking-widest transition-colors';

const DueCell: React.FC<{ item: ExpiringSecret }> = ({ item }) => {
  const style = BUCKET_STYLES[dueBucket(item)];
  return (
    <span className="flex flex-col">
      <span className={cn('font-mono text-xs font-semibold', style.text)}>{dueInWords(item.daysRemaining)}</span>
      <time dateTime={item.dueAt} title={formatAbsolute(item.dueAt)} className="font-mono text-[10px] text-zinc-500">
        {item.dueAt.slice(0, 10)}
      </time>
    </span>
  );
};

const ReminderStatus: React.FC<{ run: RotationReminderRun }> = ({ run }) => {
  if (!run.webhookConfigured) {
    return (
      <output className="block text-[11px] text-amber-400">
        {run.due} due, but no webhook is configured: set <code className="font-mono">RotationReminders:WebhookUrl</code> on
        the API to send reminders.
      </output>
    );
  }
  if (!run.delivered) {
    return (
      <output className="block text-[11px] text-red-400">
        The webhook call failed. Nothing was marked as sent; the next run will retry.
      </output>
    );
  }
  return (
    <output className="block text-[11px] text-emerald-400">
      Sent {run.sent} reminder{run.sent === 1 ? '' : 's'}
      {run.alreadySent > 0 && <span className="text-zinc-500"> · {run.alreadySent} already sent before</span>}
    </output>
  );
};

/** Route element for `/rotation`: secrets expiring or due for rotation (guibranco/grimoire-ui#447). */
export const RotationView: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const within = isRotationWindow(searchParams.get('within')) ? Number(searchParams.get('within')) : DEFAULT_ROTATION_WINDOW;
  const { data, error, isPending, isFetching, refetch } = useExpiringSecrets(within);
  const [lastRun, setLastRun] = useState<RotationReminderRun | null>(null);

  const notify = useMutation({
    mutationFn: async () => {
      const res = await api.post<RotationReminderRun>('/secrets/expiring/notify');
      // 502 carries the run too (delivered: false).
      if (res.status >= 400 && res.status !== 502) throw new Error(`Request failed with status ${res.status}`);
      return res.data;
    },
    onSuccess: (run) => setLastRun(run),
    onError: (err: any) => {
      if (err?.response?.status === 502 && err.response.data) setLastRun(err.response.data);
      else toast.error(apiErrorMessage(err, 'Failed to run rotation reminders'));
    },
  });

  const setWindow = (days: number) => {
    const next = new URLSearchParams(searchParams);
    if (days === DEFAULT_ROTATION_WINDOW) next.delete('within');
    else next.set('within', String(days));
    setSearchParams(next, { replace: true });
  };

  const items = data?.items ?? [];

  let content: React.ReactNode;
  if (isPending) {
    content = (
      <div className="flex items-center justify-center py-16" aria-busy="true" aria-label="Loading expiring secrets">
        <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
      </div>
    );
  } else if (error || !data) {
    content = (
      <div role="alert" className="flex flex-col items-center gap-3 py-16 border border-red-500/30 bg-red-500/5 text-center">
        <AlertOctagon className="w-6 h-6 text-red-400" aria-hidden="true" />
        <h3 className="text-sm font-bold text-zinc-100">Couldn't load expiring secrets</h3>
        <p className="text-xs text-zinc-500 max-w-sm">
          Check the connection, or that the API is recent enough to provide{' '}
          <code className="font-mono text-zinc-400">/management/secrets/expiring</code>.
        </p>
      </div>
    );
  } else if (items.length === 0) {
    content = (
      <div className="flex items-center gap-3 p-4 border border-border bg-card/60 text-sm text-emerald-400">
        <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
        <span className="font-semibold">Nothing due</span>
        <span className="text-xs text-zinc-500">No secret expires or needs rotating in the next {within} days.</span>
      </div>
    );
  } else {
    content = (
      <div className="border border-border overflow-x-auto">
        <table className="w-full text-left" aria-label="Expiring secrets">
          <thead className="bg-black/40">
            <tr className="text-[10px] uppercase font-bold tracking-widest text-zinc-500">
              <th scope="col" className="px-4 h-8">Due</th>
              <th scope="col" className="px-4 h-8">Secret</th>
              <th scope="col" className="px-4 h-8">Where</th>
              <th scope="col" className="px-4 h-8">Reason</th>
              <th scope="col" className="px-4 h-8 hidden md:table-cell">Version</th>
              <th scope="col" className="px-4 h-8 hidden md:table-cell">Rotate every</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const bucket = dueBucket(item);
              return (
                <tr
                  key={`${item.isGlobal ? 'g' : item.application}:${item.secret}:${item.environment}`}
                  data-bucket={bucket}
                  className={cn('border-t border-zinc-900 hover:bg-zinc-900/60 border-l-2', {
                    'border-l-red-500': bucket === 'overdue',
                    'border-l-amber-500': bucket === 'week',
                    'border-l-yellow-400': bucket === 'month',
                    'border-l-zinc-700': bucket === 'later',
                  })}
                >
                  <td className="px-4 py-2 whitespace-nowrap"><DueCell item={item} /></td>
                  <td className="px-4 py-2">
                    <Link to={expiringSecretLink(item)} className="font-mono text-sm text-zinc-200 hover:text-grimoire break-all">
                      {item.secret}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-xs text-zinc-400">
                    {item.isGlobal ? (
                      <span className="inline-flex items-center gap-1 text-global">
                        <Globe className="w-3 h-3" aria-hidden="true" />
                        Global
                      </span>
                    ) : (
                      item.applicationName ?? item.application
                    )}
                    <span className="font-mono text-zinc-500">
                      {' / '}
                      {item.environment === '*' ? 'all environments' : item.environment}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <span className={cn('px-1.5 py-0.5 border text-[10px] font-bold uppercase tracking-widest whitespace-nowrap', BUCKET_STYLES[bucket].badge)}>
                      {reasonLabel(item.reason)}
                    </span>
                  </td>
                  <td className="px-4 py-2 hidden md:table-cell font-mono text-xs text-zinc-400">v{item.version}</td>
                  <td className="px-4 py-2 hidden md:table-cell font-mono text-xs text-zinc-400">
                    {item.rotationIntervalDays ? `${item.rotationIntervalDays} days` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-[#0A0A0B]">
      <div className="mx-auto w-full max-w-[1400px] p-4 md:p-6 flex flex-col gap-4">
        <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground">
              <TimerReset className="w-5 h-5 text-zinc-400" aria-hidden="true" />
              Rotation
            </h2>
            <p className="text-[11px] text-zinc-500">
              Secrets whose current version expires or is due for rotation, across applications and Global. Overdue and
              expired secrets are always listed. Names and dates only, never values.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <fieldset className="flex items-center gap-1 border-0 p-0 m-0">
              <legend className="sr-only">Due within</legend>
              {ROTATION_WINDOWS.map((days) => (
                <button
                  key={days}
                  type="button"
                  aria-pressed={within === days}
                  onClick={() => setWindow(days)}
                  className={cn(
                    chip,
                    within === days
                      ? 'border-grimoire bg-grimoire/15 text-grimoire'
                      : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200'
                  )}
                >
                  {days} days
                </button>
              ))}
            </fieldset>
            <button
              type="button"
              onClick={() => void refetch()}
              disabled={isFetching}
              aria-label="Refresh"
              title="Refresh"
              className="h-[26px] w-[26px] inline-flex items-center justify-center border border-zinc-800 text-zinc-500 hover:text-zinc-200 disabled:opacity-60"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', isFetching && 'animate-spin')} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => notify.mutate()}
              disabled={notify.isPending}
              className={cn(chip, 'inline-flex items-center gap-1.5 border-zinc-800 text-zinc-300 hover:border-zinc-600 hover:text-foreground disabled:opacity-60')}
            >
              {notify.isPending ? <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" /> : <BellRing className="w-3 h-3" aria-hidden="true" />}
              Send reminders now
            </button>
          </div>
        </header>

        {lastRun && <ReminderStatus run={lastRun} />}

        {content}
      </div>
    </div>
  );
};
