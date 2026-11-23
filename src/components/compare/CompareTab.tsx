import React, { useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeftRight, CheckCircle2, Globe, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { apiErrorMessage } from '@/lib/errors';
import { appPath, comparePath } from '@/lib/routes';
import { cn } from '@/lib/utils';
import type { ConfigurationDiffItem, ConfigurationDiffResponse, ConfigurationDiffSide, Environment } from '@/types/api';

const STATUS_STYLES: Record<string, { label: string; badge: string; row: string }> = {
  added: { label: 'Added', badge: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400', row: 'border-l-emerald-500' },
  removed: { label: 'Removed', badge: 'border-red-500/40 bg-red-500/10 text-red-400', row: 'border-l-red-500' },
  changed: { label: 'Changed', badge: 'border-amber-500/40 bg-amber-500/10 text-amber-400', row: 'border-l-amber-500' },
  unchanged: { label: 'Same', badge: 'border-zinc-700 text-zinc-500', row: 'border-l-zinc-800' },
};

const select =
  'h-8 bg-zinc-950 border border-border px-2 text-xs font-mono text-zinc-200 focus:outline-none focus:border-config';

const Value: React.FC<{ side: ConfigurationDiffSide | null; highlight: string }> = ({ side, highlight }) => {
  if (!side) return <span className="text-zinc-700">—</span>;
  return (
    <span className="flex flex-col gap-0.5">
      <code className={cn('font-mono text-[11px] whitespace-pre-wrap break-all', highlight)}>{side.value || '""'}</code>
      {side.source === 'global' && (
        <span className="inline-flex items-center gap-1 text-[10px] text-global">
          <Globe className="w-2.5 h-2.5" aria-hidden="true" />
          global{side.globalEnvironmentSlug === '*' ? ' (all environments)' : ''}
        </span>
      )}
    </span>
  );
};

/**
 * Compare tab (`/apps/:app/:from/compare?to=…`): effective configuration of two environments
 * side by side (guibranco/grimoire-ui#446). Secrets are never compared.
 */
export const CompareTab: React.FC<{ appSlug: string; envs: Environment[]; fromSlug: string | null }> = ({
  appSlug,
  envs,
  fromSlug,
}) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const showUnchanged = searchParams.get('unchanged') === '1';
  const requestedTo = searchParams.get('to');
  const toSlug =
    requestedTo && envs.some((e) => e.slug === requestedTo) ? requestedTo : envs.find((e) => e.slug !== fromSlug)?.slug ?? null;
  const ready = !!fromSlug && !!toSlug && fromSlug !== toSlug;

  const { data, isPending, error } = useQuery({
    queryKey: ['config-diff', appSlug, fromSlug, toSlug, showUnchanged],
    queryFn: async (): Promise<ConfigurationDiffResponse> => {
      const res = await api.get<ConfigurationDiffResponse>(`/applications/${encodeURIComponent(appSlug)}/configurations/diff`, {
        params: { from: fromSlug, to: toSlug, includeUnchanged: showUnchanged },
      });
      if (res.status >= 400) throw Object.assign(new Error(`Request failed with status ${res.status}`), { response: res });
      return res.data;
    },
    enabled: ready,
    retry: false,
  });

  const counts = useMemo(() => {
    const c: Record<string, number> = { added: 0, removed: 0, changed: 0, unchanged: 0 };
    for (const item of data?.items ?? []) c[item.status] = (c[item.status] ?? 0) + 1;
    return c;
  }, [data]);

  if (envs.length < 2) {
    return <p className="p-6 text-sm text-zinc-500">Add a second environment to compare configuration.</p>;
  }

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (value === null) next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  };

  let content: React.ReactNode;
  if (!ready) {
    content = <p className="p-6 text-sm text-zinc-500">Pick two different environments.</p>;
  } else if (isPending) {
    content = (
      <div className="flex justify-center py-12" aria-busy="true" aria-label="Comparing">
        <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
      </div>
    );
  } else if (error || !data) {
    content = (
      <p role="alert" className="p-6 text-sm text-red-400">
        {apiErrorMessage(error, 'Couldn’t compare the environments. The API may be too old to provide the diff.')}
      </p>
    );
  } else if (data.items.length === 0) {
    content = (
      <p className="flex items-center gap-2 p-6 text-sm text-emerald-400">
        <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
        {fromSlug} and {toSlug} have the same configuration.
      </p>
    );
  } else {
    content = (
      <table className="w-full text-left" aria-label="Configuration differences">
        <thead className="bg-black/40">
          <tr className="text-[10px] uppercase font-bold tracking-widest text-zinc-500">
            <th scope="col" className="px-4 h-8">Key</th>
            <th scope="col" className="px-4 h-8">Status</th>
            <th scope="col" className="px-4 h-8 font-mono normal-case">{fromSlug}</th>
            <th scope="col" className="px-4 h-8 font-mono normal-case">{toSlug}</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((item: ConfigurationDiffItem) => {
            const style = STATUS_STYLES[item.status] ?? STATUS_STYLES.unchanged;
            const changed = item.status === 'changed';
            const linkEnv = item.to ? toSlug : fromSlug;
            return (
              <tr key={item.key} data-status={item.status} className={cn('border-t border-zinc-900 border-l-2 align-top', style.row)}>
                <td className="px-4 py-2">
                  <Link to={appPath(appSlug, linkEnv, 'config', item.key)} className="font-mono text-sm text-zinc-200 hover:text-config break-all">
                    {item.key}
                  </Link>
                </td>
                <td className="px-4 py-2">
                  <span className={cn('px-1.5 py-0.5 border text-[10px] font-bold uppercase tracking-widest', style.badge)}>{style.label}</span>
                </td>
                <td className="px-4 py-2">
                  <Value side={item.from} highlight={changed ? 'text-red-300' : 'text-zinc-400'} />
                </td>
                <td className="px-4 py-2">
                  <Value side={item.to} highlight={changed ? 'text-emerald-300' : 'text-zinc-400'} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-zinc-500">
          From{' '}
          <select
            className={select}
            value={fromSlug ?? ''}
            onChange={(e) => navigate(comparePath(appSlug, e.target.value, toSlug === e.target.value ? fromSlug : toSlug))}
          >
            {envs.map((e) => (
              <option key={e.slug} value={e.slug}>{e.slug}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          aria-label="Swap environments"
          title="Swap"
          disabled={!ready}
          onClick={() => fromSlug && toSlug && navigate(comparePath(appSlug, toSlug, fromSlug))}
          className="h-8 w-8 inline-flex items-center justify-center border border-border text-zinc-400 hover:text-zinc-100 disabled:opacity-50"
        >
          <ArrowLeftRight className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
        <label className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-zinc-500">
          To{' '}
          <select className={select} value={toSlug ?? ''} onChange={(e) => setParam('to', e.target.value)}>
            {envs.map((e) => (
              <option key={e.slug} value={e.slug}>{e.slug}</option>
            ))}
          </select>
        </label>
        <label className="ml-2 flex items-center gap-2 text-[11px] text-zinc-400">
          <input type="checkbox" checked={showUnchanged} onChange={(e) => setParam('unchanged', e.target.checked ? '1' : null)} />
          <span>Show unchanged</span>
        </label>
        {data && (
          <p className="ml-auto text-[11px] font-mono text-zinc-500" aria-live="polite">
            {counts.changed} changed · {counts.added} only in {toSlug} · {counts.removed} only in {fromSlug}
          </p>
        )}
      </div>
      <div className="border border-border overflow-x-auto">{content}</div>
      <p className="text-[10px] text-zinc-600">
        Effective configuration, globals included. Secrets are never compared.
      </p>
    </div>
  );
};
