import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { History, Loader2, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmationModal } from '@/components/shared/ConfirmationModal';
import { RelativeTime } from '@/components/dashboard/parts';
import { api } from '@/lib/api';
import { apiErrorMessage } from '@/lib/errors';
import {
  canRollBackTo,
  changeLabel,
  configHistoryUrl,
  configRollbackUrl,
  isGlobalScope,
  lineDiff,
  type ConfigScope,
} from '@/lib/history';
import { cn } from '@/lib/utils';
import type { ConfigurationRevision } from '@/types/api';

const CHANGE_STYLES: Record<string, string> = {
  baseline: 'border-zinc-700 text-zinc-400',
  create: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
  update: 'border-config/40 bg-config/10 text-config',
  delete: 'border-red-500/40 bg-red-500/10 text-red-400',
  rollback: 'border-amber-500/40 bg-amber-500/10 text-amber-400',
};

/** What changed from the previous revision: a line diff of the value, plus type/description notes. */
const RevisionDiff: React.FC<{ revision: ConfigurationRevision; previous?: ConfigurationRevision }> = ({
  revision,
  previous,
}) => {
  if (revision.change === 'delete') {
    return <p className="text-[11px] text-zinc-500">Key deleted.</p>;
  }
  const lines = lineDiff(previous?.value ?? null, revision.value);
  const notes: string[] = [];
  if (previous && previous.valueType !== revision.valueType) notes.push(`type ${previous.valueType} → ${revision.valueType}`);
  if (previous && (previous.description ?? '') !== (revision.description ?? '')) notes.push('description changed');
  return (
    <div className="space-y-1">
      <pre aria-label={`Value at revision ${revision.revision}`} className="font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all bg-black/40 border border-zinc-900 p-2 max-h-48 overflow-auto">
        {lines.map((line, i) => (
          <span
            key={i}
            className={cn(
              'block',
              line.kind === 'added' && previous && 'bg-emerald-500/10 text-emerald-300',
              line.kind === 'removed' && 'bg-red-500/10 text-red-300 line-through decoration-red-500/50',
              line.kind === 'same' && 'text-zinc-400',
              line.kind === 'added' && !previous && 'text-zinc-200'
            )}
          >
            {previous && line.kind === 'added' && '+ '}
            {line.kind === 'removed' && '− '}
            {line.text || ' '}
          </span>
        ))}
      </pre>
      {notes.length > 0 && <p className="text-[10px] text-zinc-500">{notes.join(' · ')}</p>}
    </div>
  );
};

interface ConfigHistoryModalProps {
  scope: ConfigScope;
  configKey: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Revisions of one configuration key, newest first, with an inline diff and "Rollback to this". */
export const ConfigHistoryModal: React.FC<ConfigHistoryModalProps> = ({ scope, configKey, open, onOpenChange }) => {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState<ConfigurationRevision | null>(null);
  const isGlobal = isGlobalScope(scope);
  const queryKey = ['config-history', isGlobal ? 'global' : scope.appSlug, scope.envSlug, configKey];

  const { data, isPending, error } = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await api.get<ConfigurationRevision[]>(configHistoryUrl(scope, configKey));
      if (res.status >= 400) throw Object.assign(new Error(`Request failed with status ${res.status}`), { response: res });
      return Array.isArray(res.data) ? res.data : [];
    },
    enabled: open,
    retry: false,
  });
  const revisions = data ?? [];
  const newest = revisions[0];

  const rollback = async (revision: ConfigurationRevision) => {
    try {
      const res = await api.post(configRollbackUrl(scope, configKey, revision.revision));
      if (res.status >= 400) throw Object.assign(new Error(`Request failed with status ${res.status}`), { response: res });
      toast.success(`Restored revision ${revision.revision}`);
      await queryClient.invalidateQueries({ queryKey: ['config-history'] });
      await queryClient.invalidateQueries({ queryKey: ['effective-configurations'] });
      await queryClient.invalidateQueries({ queryKey: ['global-configurations'] });
      await queryClient.invalidateQueries({ queryKey: ['configurations'] });
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to roll back'));
    }
  };

  let body: React.ReactNode;
  if (isPending) {
    body = (
      <div className="flex justify-center py-10" aria-busy="true">
        <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
      </div>
    );
  } else if (error) {
    body = <p role="alert" className="py-6 text-center text-xs text-zinc-500">{apiErrorMessage(error, 'No history for this key yet.')}</p>;
  } else {
    body = (
      <ol aria-label="Revisions" className="space-y-3">
        {revisions.map((revision, i) => (
          <li key={revision.revision} data-revision={revision.revision} className="border border-zinc-900 bg-black/20 p-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-zinc-300">r{revision.revision}</span>
              <span className={cn('px-1.5 py-0.5 border text-[9px] font-bold uppercase tracking-widest', CHANGE_STYLES[revision.change] ?? CHANGE_STYLES.baseline)}>
                {changeLabel(revision.change)}
                {revision.rolledBackFrom !== null && ` from r${revision.rolledBackFrom}`}
              </span>
              <span className="text-[11px] text-zinc-500">
                {revision.changedBy} · <RelativeTime value={revision.changedAt} className="font-mono" />
              </span>
              {canRollBackTo(revision, newest) && (
                <button
                  type="button"
                  onClick={() => setConfirming(revision)}
                  className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 border border-zinc-800 text-[10px] font-bold uppercase tracking-widest text-zinc-300 hover:border-amber-500/60 hover:text-amber-400"
                >
                  <RotateCcw className="w-3 h-3" aria-hidden="true" />
                  Rollback to this
                </button>
              )}
            </div>
            <RevisionDiff revision={revision} previous={revisions[i + 1]} />
          </li>
        ))}
      </ol>
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl bg-card border-2 border-border max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold tracking-tight uppercase">
              <History className="w-4 h-4" aria-hidden="true" />
              History
            </DialogTitle>
            <DialogDescription className="font-mono text-xs break-all">
              {configKey} · {isGlobal ? 'Global' : scope.appSlug} / {scope.envSlug === '*' ? 'all environments' : scope.envSlug}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto pr-1">{body}</div>
        </DialogContent>
      </Dialog>
      <ConfirmationModal
        open={!!confirming}
        onOpenChange={(o) => !o && setConfirming(null)}
        title={`Restore revision ${confirming?.revision ?? ''}?`}
        description={`${configKey} goes back to the value it had at revision ${confirming?.revision ?? ''}. This is recorded as a new revision, so it can be undone the same way.`}
        confirmText="Restore"
        onConfirm={async () => {
          if (confirming) await rollback(confirming);
          setConfirming(null);
        }}
      />
    </>
  );
};
