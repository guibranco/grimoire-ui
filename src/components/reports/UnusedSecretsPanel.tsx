import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AlertOctagon, CheckCircle2, ExternalLink, Globe, Loader2, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatAbsolute } from '@/lib/dashboard';
import { apiErrorMessage } from '@/lib/errors';
import { lastReadInWords, unusedSecretDeletePath, unusedSecretLink } from '@/lib/reports';
import { ConfirmationModal } from '@/components/shared/ConfirmationModal';
import type { UnusedSecret } from '@/types/api';
import { useFirstEnvironments, useUnusedSecrets } from './useReports';

type Scope = 'all' | 'application' | 'global';
const SCOPES: { value: Scope; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'application', label: 'Applications' },
  { value: 'global', label: 'Global' },
];

const chip = 'h-[26px] px-2.5 border text-[10px] font-bold uppercase tracking-widest transition-colors';
const chipClass = (active: boolean) =>
  cn(chip, active ? 'border-grimoire bg-grimoire/15 text-grimoire' : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200');

const itemKey = (i: UnusedSecret) => `${i.isGlobal ? '*' : i.application}:${i.secret}`;

const LastRead: React.FC<{ item: UnusedSecret }> = ({ item }) => (
  <span className="flex flex-col">
    <span className={cn('font-mono text-xs font-semibold', item.lastReadAt ? 'text-amber-400' : 'text-red-400')}>
      {lastReadInWords(item.lastReadAt)}
    </span>
    {item.lastReadAt && (
      <time dateTime={item.lastReadAt} title={formatAbsolute(item.lastReadAt)} className="font-mono text-[10px] text-zinc-500">
        {item.lastReadAt.slice(0, 10)}
      </time>
    )}
  </span>
);

const ReadBy: React.FC<{ item: UnusedSecret }> = ({ item }) => {
  if (item.reads.length === 0) return <span className="text-xs text-zinc-600">—</span>;
  return (
    <ul className="flex flex-wrap gap-1">
      {item.reads.map((r) => (
        <li
          key={`${r.application}:${r.environment}`}
          title={`${r.readCount} read${r.readCount === 1 ? '' : 's'}, last ${formatAbsolute(r.lastReadAt)}`}
          className="px-1.5 py-0.5 border border-zinc-800 bg-zinc-900 font-mono text-[10px] text-zinc-400"
        >
          {item.isGlobal ? `${r.application}/` : ''}
          {r.environment} · {lastReadInWords(r.lastReadAt)}
        </li>
      ))}
    </ul>
  );
};

/** Reports → Unused secrets: secrets with no Consumer API read in the window (guibranco/grimoire-ui#451). */
export const UnusedSecretsPanel: React.FC<{ days: number; windows: React.ReactNode }> = ({ days, windows }) => {
  const { data, error, isPending } = useUnusedSecrets(days);
  const queryClient = useQueryClient();
  const [scope, setScope] = useState<Scope>('all');
  const [deleting, setDeleting] = useState<UnusedSecret | null>(null);

  const all = data?.items ?? [];
  const items = useMemo(
    () => all.filter((i) => scope === 'all' || (scope === 'global') === i.isGlobal),
    [all, scope]
  );
  const firstEnvs = useFirstEnvironments(items.flatMap((i) => (i.application && !i.isGlobal ? [i.application] : [])));
  const neverRead = all.filter((i) => !i.lastReadAt).length;

  const confirmDelete = async () => {
    const target = deleting;
    if (!target) return;
    try {
      const res = await api.delete(unusedSecretDeletePath(target));
      if (res.status >= 400) throw Object.assign(new Error(`Request failed with status ${res.status}`), { response: res });
      toast.success(`Deleted ${target.secret}`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['reports'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: target.isGlobal ? ['global-secrets'] : ['secrets', target.application] }),
      ]);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to delete secret'));
    }
  };

  let content: React.ReactNode;
  if (isPending) {
    content = (
      <div className="flex items-center justify-center py-16" aria-busy="true" aria-label="Loading unused secrets">
        <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
      </div>
    );
  } else if (error || !data) {
    content = (
      <div role="alert" className="flex flex-col items-center gap-3 py-16 border border-red-500/30 bg-red-500/5 text-center">
        <AlertOctagon className="w-6 h-6 text-red-400" aria-hidden="true" />
        <h3 className="text-sm font-bold text-zinc-100">Couldn't load the unused secrets report</h3>
        <p className="text-xs text-zinc-500 max-w-sm">
          Check the connection, or that the API is recent enough to provide{' '}
          <code className="font-mono text-zinc-400">/management/reports/unused-secrets</code>.
        </p>
      </div>
    );
  } else if (items.length === 0) {
    content = (
      <div className="flex items-center gap-3 p-4 border border-border bg-card/60 text-sm text-emerald-400">
        <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
        <span className="font-semibold">Everything is in use</span>
        <span className="text-xs text-zinc-500">Every secret was read in the last {days} days.</span>
      </div>
    );
  } else {
    content = (
      <div className="border border-border overflow-x-auto">
        <table className="w-full text-left" aria-label="Unused secrets">
          <thead className="bg-black/40">
            <tr className="text-[10px] uppercase font-bold tracking-widest text-zinc-500">
              <th scope="col" className="px-4 h-8">Last read</th>
              <th scope="col" className="px-4 h-8">Secret</th>
              <th scope="col" className="px-4 h-8">Where</th>
              <th scope="col" className="px-4 h-8 hidden lg:table-cell">Read by</th>
              <th scope="col" className="px-4 h-8 hidden md:table-cell">Created</th>
              <th scope="col" className="px-4 h-8 text-right"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const link = unusedSecretLink(item, item.application ? firstEnvs[item.application] : null);
              return (
                <tr
                  key={itemKey(item)}
                  className={cn(
                    'border-t border-zinc-900 hover:bg-zinc-900/60 border-l-2',
                    item.lastReadAt ? 'border-l-amber-500' : 'border-l-red-500'
                  )}
                >
                  <td className="px-4 py-2 whitespace-nowrap"><LastRead item={item} /></td>
                  <td className="px-4 py-2">
                    <Link to={link} className="font-mono text-sm text-zinc-200 hover:text-grimoire break-all">
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
                  </td>
                  <td className="px-4 py-2 hidden lg:table-cell"><ReadBy item={item} /></td>
                  <td className="px-4 py-2 hidden md:table-cell font-mono text-xs text-zinc-500">
                    {item.createdAt ? (
                      <time dateTime={item.createdAt} title={formatAbsolute(item.createdAt)}>{item.createdAt.slice(0, 10)}</time>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        to={link}
                        aria-label={`Open ${item.secret} to disable its versions`}
                        title="Open (disable versions there)"
                        className="h-7 w-7 inline-flex items-center justify-center border border-zinc-800 text-zinc-500 hover:text-zinc-200"
                      >
                        <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                      </Link>
                      <button
                        type="button"
                        onClick={() => setDeleting(item)}
                        aria-label={`Delete ${item.secret}`}
                        title="Delete secret"
                        className="h-7 w-7 inline-flex items-center justify-center border border-zinc-800 text-zinc-500 hover:border-red-500/50 hover:text-red-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
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
    <section aria-label="Unused secrets" className="flex flex-col gap-3">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
        <p className="text-[11px] text-zinc-500">
          Secrets with no successful Consumer API read in the window, never-read first. Reads are tracked from the audit
          log's history onward.
          {data && (
            <span className="text-zinc-400">
              {' '}
              {all.length} unused · {neverRead} never read.
            </span>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <fieldset className="flex items-center gap-1 border-0 p-0 m-0">
            <legend className="sr-only">Scope</legend>
            {SCOPES.map((s) => (
              <button key={s.value} type="button" aria-pressed={scope === s.value} onClick={() => setScope(s.value)} className={chipClass(scope === s.value)}>
                {s.label}
              </button>
            ))}
          </fieldset>
          {windows}
        </div>
      </div>
      {content}
      <ConfirmationModal
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        onConfirm={confirmDelete}
        title={`Delete ${deleting?.secret ?? 'secret'}?`}
        description={
          deleting?.isGlobal
            ? 'Deletes the global secret and every version. Applications that inherit it lose access.'
            : `Deletes the secret and every version from ${deleting?.applicationName ?? deleting?.application ?? 'the application'}.`
        }
        confirmText="Delete"
        variant="destructive"
      />
    </section>
  );
};

