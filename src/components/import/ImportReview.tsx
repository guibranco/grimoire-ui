import React from 'react';
import { AlertTriangle, Loader2, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ACTION_LABELS } from '@/lib/importer';
import type { ImportAction, ImportKind, ImportPlan, ImportPlanItem } from '@/types/api';

const ACTION_CLASS: Record<ImportAction, string> = {
  create: 'border-emerald-500/40 text-emerald-300',
  update: 'border-amber-500/40 text-amber-300',
  unchanged: 'border-zinc-700 text-zinc-500',
  skip: 'border-zinc-700 text-zinc-400',
  conflict: 'border-red-500/40 text-red-300',
  excluded: 'border-zinc-800 text-zinc-600',
};

interface Props {
  plan: ImportPlan | undefined;
  loading: boolean;
  error: string | null;
  overwrite: boolean;
  onOverwrite: (overwrite: boolean) => void;
  onKind: (key: string, kind: ImportKind) => void;
  onInclude: (key: string, include: boolean) => void;
}

/** The dry-run plan: per key, secret or configuration, and what applying does. */
export const ImportReview: React.FC<Props> = ({ plan, loading, error, overwrite, onOverwrite, onKind, onInclude }) => {
  if (error) {
    return (
      <p role="alert" className="flex items-start gap-2 border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-300">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
        {error}
      </p>
    );
  }
  if (!plan) {
    return (
      <p className="flex items-center gap-2 text-xs text-zinc-500">
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Reading the file…
      </p>
    );
  }

  const { summary } = plan;
  return (
    <div className="space-y-3">
      <fieldset className="flex flex-wrap items-center gap-4 text-xs text-zinc-300">
        <legend className="sr-only">Keys that already have another value</legend>
        <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-500">Existing values</span>
        <label className="inline-flex items-center gap-1.5">
          <input type="radio" name="import-conflict" checked={!overwrite} onChange={() => onOverwrite(false)} />
          <span>Keep them</span>
        </label>
        <label className="inline-flex items-center gap-1.5">
          <input type="radio" name="import-conflict" checked={overwrite} onChange={() => onOverwrite(true)} />
          <span>Overwrite them</span>
        </label>
        {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-500" aria-label="Updating the plan" />}
      </fieldset>

      <output className="block text-xs text-zinc-400" aria-live="polite">
        {summary.create} to create · {summary.update} to overwrite · {summary.unchanged} unchanged · {summary.skipped} left alone
      </output>

      <div className="border border-zinc-900 max-h-[45vh] overflow-auto">
        <table className="w-full text-xs">
          <thead className="bg-zinc-900/60 text-[10px] uppercase tracking-widest text-zinc-500 sticky top-0">
            <tr>
              <th className="px-3 py-2 text-left font-bold w-8">
                <span className="sr-only">Import</span>
              </th>
              <th className="px-3 py-2 text-left font-bold">Key</th>
              <th className="px-3 py-2 text-left font-bold">As</th>
              <th className="px-3 py-2 text-left font-bold">Value</th>
              <th className="px-3 py-2 text-left font-bold">Result</th>
            </tr>
          </thead>
          <tbody>
            {plan.items.map((item) => (
              <ReviewRow key={item.key} item={item} onKind={onKind} onInclude={onInclude} />
            ))}
          </tbody>
        </table>
      </div>

      {plan.items.some((i) => i.action === 'conflict') && (
        <p className="text-[11px] text-zinc-500">
          <span className="text-red-300">Conflict</span>: the key already exists as the other kind. Switch it, or leave it out.
        </p>
      )}
      {plan.skipped.length > 0 && (
        <p className="text-[11px] text-zinc-500">
          Not plain data, so not imported: <span className="font-mono">{plan.skipped.join(', ')}</span>
        </p>
      )}
    </div>
  );
};

const ReviewRow: React.FC<{
  item: ImportPlanItem;
  onKind: (key: string, kind: ImportKind) => void;
  onInclude: (key: string, include: boolean) => void;
}> = ({ item, onKind, onInclude }) => {
  const excluded = item.action === 'excluded';
  return (
    <tr className={cn('border-t border-zinc-900', excluded && 'opacity-50')}>
      <td className="px-3 py-1.5">
        <input
          type="checkbox"
          checked={!excluded}
          onChange={(e) => onInclude(item.key, e.target.checked)}
          aria-label={`Import ${item.key}`}
        />
      </td>
      <td className="px-3 py-1.5 font-mono text-zinc-200 break-all">{item.key}</td>
      <td className="px-3 py-1.5">
        <select
          value={item.kind}
          onChange={(e) => onKind(item.key, e.target.value as ImportKind)}
          aria-label={`Import ${item.key} as`}
          className="h-7 bg-zinc-950 border border-zinc-800 px-1.5 text-[11px] text-zinc-200"
        >
          <option value="configuration">Configuration</option>
          <option value="secret">Secret</option>
        </select>
      </td>
      <td className="px-3 py-1.5 font-mono text-zinc-400 max-w-[16rem] truncate" title={item.value ?? undefined}>
        {item.kind === 'secret' ? (
          <span className="inline-flex items-center gap-1 text-zinc-600">
            <Lock className="w-3 h-3" aria-hidden="true" /> hidden
          </span>
        ) : (
          item.value || '—'
        )}
      </td>
      <td className="px-3 py-1.5">
        <span className={cn('px-1.5 py-0.5 border text-[10px] uppercase font-bold tracking-wider', ACTION_CLASS[item.action])}>
          {ACTION_LABELS[item.action]}
        </span>
      </td>
    </tr>
  );
};
