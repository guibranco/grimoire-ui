import React, { useEffect, useId, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Loader2, RefreshCw, RotateCcw, ScrollText } from 'lucide-react';
import { api } from '@/lib/api';
import {
  AUDIT_ACTION_GROUPS,
  AUDIT_OUTCOMES,
  AUDIT_PAGE_SIZE,
  type AuditFilters,
  auditEventLink,
  filtersFromSearchParams,
  filtersToApiParams,
  filtersToSearchParams,
  hasActiveFilters,
  outcomeLabel,
} from '@/lib/audit';
import { appPath } from '@/lib/routes';
import { useDebouncedValue } from '@/lib/search';
import type { Application, AuditEvent, AuditPage } from '@/types/api';
import { RelativeTime } from '@/components/dashboard/parts';
import { cn } from '@/lib/utils';

const OUTCOME_STYLES: Record<string, string> = {
  success: 'border-emerald-700/50 text-emerald-400',
  notfound: 'border-amber-700/50 text-amber-400',
  forbidden: 'border-red-700/60 text-red-400',
  invalid: 'border-amber-700/50 text-amber-400',
  conflict: 'border-amber-700/50 text-amber-400',
  error: 'border-red-700/60 text-red-400',
};

const fieldClass =
  'h-8 bg-zinc-950 border border-border px-2 text-[12px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500';
const labelClass = 'flex flex-col gap-1 text-[9px] font-bold font-mono uppercase tracking-[0.2em] text-zinc-500';

const isNotFound = (err: unknown) =>
  (err as { response?: { status?: number } } | null)?.response?.status === 404;

interface AuditLogPanelProps {
  /** Pin the log to one application (its Activity tab): hides that filter. */
  application?: string;
  className?: string;
}

/**
 * Filterable, paged audit log backed by `GET /management/audit`. Filters live in the URL so a
 * filtered view can be bookmarked and shared. Never shows secret or configuration values — the
 * API doesn't return any.
 */
export const AuditLogPanel: React.FC<AuditLogPanelProps> = ({ application, className }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = filtersFromSearchParams(searchParams);
  const pinned = application ? { ...filters, application } : filters;
  const formId = useId();

  // Free-text filters are typed into local state and applied after a short pause.
  const [text, setText] = useState({ actor: filters.actor, environment: filters.environment, target: filters.target });
  const debouncedText = useDebouncedValue(text, 300);

  const update = (patch: Partial<AuditFilters>, resetPage = true) => {
    const next = { ...filters, ...patch, ...(resetPage ? { page: 1 } : {}) };
    const params = filtersToSearchParams(next);
    if (application) params.delete('application');
    // Keep unrelated params (e.g. ?key=) out of the way: the audit filters own this URL.
    setSearchParams(params, { replace: true });
  };

  useEffect(() => {
    if (
      debouncedText.actor !== filters.actor ||
      debouncedText.environment !== filters.environment ||
      debouncedText.target !== filters.target
    ) {
      update(debouncedText);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedText]);

  // Back/forward or a pasted link changes the URL: show its values in the text boxes.
  useEffect(() => {
    setText({ actor: filters.actor, environment: filters.environment, target: filters.target });
  }, [filters.actor, filters.environment, filters.target]);

  const apiParams = filtersToApiParams(pinned);
  const query = useQuery({
    queryKey: ['audit', apiParams],
    queryFn: async () => {
      const res = await api.get<AuditPage>('/audit', { params: apiParams });
      if (res.status >= 400) {
        throw Object.assign(new Error(`Request failed with status ${res.status}`), { response: res });
      }
      return res.data;
    },
    placeholderData: keepPreviousData,
    retry: (count, err) => !isNotFound(err) && count < 1,
  });

  const { data: apps } = useQuery({
    queryKey: ['applications'],
    queryFn: async () => (await api.get<Application[]>('/applications')).data,
    enabled: !application,
  });

  const data = query.data;
  const total = data?.totalCount ?? 0;
  const pageSize = data?.pageSize ?? AUDIT_PAGE_SIZE;
  const firstRow = total === 0 ? 0 : (pinned.page - 1) * pageSize + 1;
  const lastRow = Math.min(total, pinned.page * pageSize);
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const filtered = hasActiveFilters(filters, application ? ['application'] : []);

  return (
    <section className={cn('flex flex-col gap-3', className)} aria-label="Audit log">
      <form
        id={formId}
        role="search"
        aria-label="Audit log filters"
        onSubmit={(e) => e.preventDefault()}
        className="grid gap-2 grid-cols-2 md:grid-cols-4 xl:grid-cols-8 items-end border border-border bg-zinc-900/40 p-3"
      >
        {!application && (
          <label className={labelClass}>
            Application
            <select
              className={fieldClass}
              value={filters.application}
              onChange={(e) => update({ application: e.target.value })}
            >
              <option value="">All</option>
              {(Array.isArray(apps) ? apps : []).map((a) => (
                <option key={a.slug} value={a.slug}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className={labelClass}>
          Action
          <select className={fieldClass} value={filters.action} onChange={(e) => update({ action: e.target.value })}>
            <option value="">All</option>
            {AUDIT_ACTION_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.prefix && <option value={group.prefix}>All {group.label.toLowerCase()}</option>}
                {group.actions.map((a) => (
                  <option key={a.code} value={a.code}>
                    {a.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Outcome
          <select className={fieldClass} value={filters.outcome} onChange={(e) => update({ outcome: e.target.value })}>
            <option value="">All</option>
            {AUDIT_OUTCOMES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Actor
          <input
            className={fieldClass}
            placeholder="admin, app:slug…"
            value={text.actor}
            onChange={(e) => setText((t) => ({ ...t, actor: e.target.value }))}
          />
        </label>
        <label className={labelClass}>
          Environment
          <input
            className={fieldClass}
            placeholder="production"
            value={text.environment}
            onChange={(e) => setText((t) => ({ ...t, environment: e.target.value }))}
          />
        </label>
        <label className={labelClass}>
          Secret / key
          <input
            className={cn(fieldClass, 'font-mono')}
            placeholder="DB_PASSWORD"
            value={text.target}
            onChange={(e) => setText((t) => ({ ...t, target: e.target.value }))}
          />
        </label>
        <label className={labelClass}>
          From
          <input type="date" className={fieldClass} value={filters.from} max={filters.to || undefined} onChange={(e) => update({ from: e.target.value })} />
        </label>
        <label className={labelClass}>
          To
          <input type="date" className={fieldClass} value={filters.to} min={filters.from || undefined} onChange={(e) => update({ to: e.target.value })} />
        </label>
        <div className="col-span-2 md:col-span-4 xl:col-span-8 flex flex-wrap items-center gap-3 pt-1">
          <label className="inline-flex items-center gap-2 text-[11px] text-zinc-400 cursor-pointer">
            <input
              type="checkbox"
              checked={filters.includeReads}
              onChange={(e) => update({ includeReads: e.target.checked })}
              className="accent-amber-500"
            />
            Include consumer reads
          </label>
          {filtered && (
            <button
              type="button"
              onClick={() => {
                setText({ actor: '', environment: '', target: '' });
                setSearchParams(new URLSearchParams(), { replace: true });
              }}
              className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-zinc-500 hover:text-zinc-200"
            >
              <RotateCcw className="w-3 h-3" aria-hidden="true" />
              Clear filters
            </button>
          )}
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="ml-auto inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-zinc-500 hover:text-zinc-200"
          >
            <RefreshCw className={cn('w-3 h-3', query.isFetching && 'animate-spin')} aria-hidden="true" />
            Refresh
          </button>
        </div>
      </form>

      {isNotFound(query.error) ? (
        <p role="status" className="p-6 text-sm text-zinc-500 border border-border">
          This Grimoire API doesn't have an audit log yet. Update it to a version with guibranco/grimoire-api#76.
        </p>
      ) : query.isError && !data ? (
        <p role="alert" className="p-6 text-sm text-red-400 border border-border">
          Couldn't load the audit log.{' '}
          <button type="button" className="underline" onClick={() => void query.refetch()}>
            Retry
          </button>
        </p>
      ) : (
        <AuditTable events={data?.items} loading={query.isLoading} showApplication={!application} />
      )}

      {total > 0 && (
        <nav aria-label="Audit log pages" className="flex items-center justify-between text-[11px] text-zinc-500 font-mono">
          <span aria-live="polite">
            {firstRow}–{lastRow} of {total}
          </span>
          <span className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Previous page"
              disabled={pinned.page <= 1}
              onClick={() => update({ page: pinned.page - 1 }, false)}
              className="h-7 w-7 inline-flex items-center justify-center border border-border disabled:opacity-30 hover:bg-zinc-800"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span>
              {pinned.page} / {lastPage}
            </span>
            <button
              type="button"
              aria-label="Next page"
              disabled={pinned.page >= lastPage}
              onClick={() => update({ page: pinned.page + 1 }, false)}
              className="h-7 w-7 inline-flex items-center justify-center border border-border disabled:opacity-30 hover:bg-zinc-800"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </span>
        </nav>
      )}
    </section>
  );
};

const AuditTable: React.FC<{ events: AuditEvent[] | undefined; loading: boolean; showApplication: boolean }> = ({
  events,
  loading,
  showApplication,
}) => {
  if (loading && !events) {
    return (
      <div className="flex items-center justify-center p-10 border border-border">
        <Loader2 className="w-5 h-5 animate-spin text-zinc-500" aria-label="Loading audit log" />
      </div>
    );
  }
  if (!events || events.length === 0) {
    return (
      <div className="p-10 text-center border border-border text-zinc-500">
        <ScrollText className="w-6 h-6 mx-auto mb-2 opacity-40" aria-hidden="true" />
        <p className="text-xs">No audit events match these filters.</p>
      </div>
    );
  }

  return (
    <div className="border border-border overflow-x-auto">
      <table className="w-full text-left text-[12px]">
        <caption className="sr-only">Audit events, newest first</caption>
        <thead className="bg-zinc-900/60 text-[9px] font-bold font-mono uppercase tracking-[0.2em] text-zinc-500">
          <tr>
            <th scope="col" className="px-3 py-2 font-bold">When</th>
            <th scope="col" className="px-3 py-2 font-bold">Actor</th>
            <th scope="col" className="px-3 py-2 font-bold">Action</th>
            {showApplication && <th scope="col" className="px-3 py-2 font-bold">Application</th>}
            <th scope="col" className="px-3 py-2 font-bold">Environment</th>
            <th scope="col" className="px-3 py-2 font-bold">Target</th>
            <th scope="col" className="px-3 py-2 font-bold">Outcome</th>
            <th scope="col" className="px-3 py-2 font-bold">Client</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-900">
          {events.map((e) => {
            const link = auditEventLink(e);
            return (
              <tr key={e.id} className="hover:bg-zinc-900/40 align-top">
                <td className="px-3 py-2 whitespace-nowrap">
                  <RelativeTime value={e.occurredAt} className="font-mono text-zinc-400" />
                </td>
                <td className="px-3 py-2 font-mono text-zinc-300 whitespace-nowrap">{e.actor}</td>
                <td className="px-3 py-2">
                  <span className="block text-zinc-200">{e.description}</span>
                  <span className="block font-mono text-[10px] text-zinc-600">{e.action}</span>
                </td>
                {showApplication && (
                  <td className="px-3 py-2 whitespace-nowrap">
                    {e.application ? (
                      <Link to={appPath(e.application)} className="text-zinc-300 hover:text-grimoire">
                        {e.application}
                      </Link>
                    ) : (
                      <span className="text-zinc-600">{e.targetType ? 'Global' : '—'}</span>
                    )}
                  </td>
                )}
                <td className="px-3 py-2 font-mono text-zinc-400">{e.environment?.split(',').join(', ') || '—'}</td>
                <td className="px-3 py-2 font-mono break-all">
                  {e.target ? (
                    link ? (
                      <Link to={link} className="text-zinc-200 hover:text-grimoire">
                        {e.target}
                      </Link>
                    ) : (
                      <span className="text-zinc-300">{e.target}</span>
                    )
                  ) : (
                    <span className="text-zinc-600">—</span>
                  )}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <span
                    title={`HTTP ${e.statusCode}`}
                    className={cn('px-1.5 py-0.5 border text-[10px] font-mono uppercase', OUTCOME_STYLES[e.outcome] ?? 'border-zinc-700 text-zinc-400')}
                  >
                    {outcomeLabel(e.outcome)}
                  </span>
                </td>
                <td className="px-3 py-2 text-[10px] font-mono text-zinc-500 max-w-[220px]">
                  <span className="block">{e.ipAddress ?? '—'}</span>
                  {e.userAgent && <span className="block truncate" title={e.userAgent}>{e.userAgent}</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
