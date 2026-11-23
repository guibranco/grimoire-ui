import React from 'react';
import { Loader2 } from 'lucide-react';
import { RelativeTime } from '@/components/dashboard/parts';
import { cn } from '@/lib/utils';
import type { FlagScopeRef } from '@/lib/flags';
import type { FlagHistoryEntry } from '@/types/api';
import { JsonDiff } from './ReviewChangesDialog';
import { useFlagHistory } from './useFlags';

const CHANGE_LABELS: Record<string, string> = {
  create: 'created',
  update: 'edited the flag',
  environment: 'changed targeting',
  toggle: 'toggled',
  delete: 'deleted',
};

const CHANGE_STYLES: Record<string, string> = {
  create: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
  update: 'border-config/40 bg-config/10 text-config',
  environment: 'border-flags/40 bg-flags/10 text-flags',
  toggle: 'border-amber-500/40 bg-amber-500/10 text-amber-400',
  delete: 'border-red-500/40 bg-red-500/10 text-red-400',
};

const pretty = (v: unknown) => (v === null || v === undefined ? null : JSON.stringify(v, null, 2));

/** One-line description: "toggled ON → OFF", "changed targeting", … */
export function describeChange(entry: FlagHistoryEntry): string {
  if (entry.change === 'toggle') {
    const before = (entry.before as { enabled?: boolean } | null)?.enabled;
    const after = (entry.after as { enabled?: boolean } | null)?.enabled;
    return `toggled ${before ? 'ON' : 'OFF'} → ${after ? 'ON' : 'OFF'}`;
  }
  return CHANGE_LABELS[entry.change] ?? entry.change;
}

/** Every change to the flag, newest first, with an expandable before/after diff. */
export const FlagHistoryPanel: React.FC<{ scope: FlagScopeRef; flagKey: string }> = ({ scope, flagKey }) => {
  const { data, isPending, error } = useFlagHistory(scope, flagKey);
  if (isPending) {
    return (
      <div className="flex justify-center py-10" aria-busy="true" aria-label="Loading history">
        <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
      </div>
    );
  }
  if (error || !data) return <p className="text-xs text-zinc-500 py-6">No history recorded for this flag.</p>;

  return (
    <div className="border border-border overflow-x-auto">
      <table className="w-full text-left" aria-label="Flag history">
        <thead className="bg-black/40">
          <tr className="text-[10px] uppercase font-bold tracking-widest text-zinc-500">
            <th scope="col" className="px-3 h-8">When</th>
            <th scope="col" className="px-3 h-8">Env</th>
            <th scope="col" className="px-3 h-8">Who</th>
            <th scope="col" className="px-3 h-8">Change</th>
          </tr>
        </thead>
        <tbody>
          {data.map((entry, i) => (
            <tr key={`${entry.changedAt}-${i}`} className="border-t border-zinc-900 align-top">
              <td className="px-3 py-2 text-xs text-zinc-400 whitespace-nowrap">
                <RelativeTime value={entry.changedAt} />
              </td>
              <td className="px-3 py-2 font-mono text-xs text-zinc-400">{entry.environment ?? '—'}</td>
              <td className="px-3 py-2 font-mono text-xs text-zinc-400">{entry.actor}</td>
              <td className="px-3 py-2 text-xs">
                <details>
                  <summary className="cursor-pointer list-none inline-flex items-center gap-2">
                    <span className={cn('px-1.5 py-0.5 border text-[10px] font-bold uppercase tracking-widest', CHANGE_STYLES[entry.change] ?? 'border-zinc-700 text-zinc-400')}>
                      {entry.change}
                    </span>
                    <span className="text-zinc-300">{describeChange(entry)}</span>
                    <span className="text-[10px] text-zinc-600 underline">diff</span>
                  </summary>
                  <div className="mt-2">
                    <JsonDiff before={pretty(entry.before)} after={pretty(entry.after)} label={`Diff for ${describeChange(entry)}`} />
                  </div>
                </details>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
