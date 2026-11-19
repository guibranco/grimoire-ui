import React from 'react';
import { Link } from 'react-router-dom';
import { AlertOctagon, AlertTriangle, CheckCircle2, Info, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { attentionDetail, attentionLabel, attentionLink, groupAttention } from '@/lib/dashboard';
import type { AttentionItem, AttentionSeverity } from '@/types/api';
import { Panel, Skeleton } from './parts';

const SEVERITY_META: Record<AttentionSeverity, { label: string; icon: React.ElementType; text: string; border: string }> = {
  error: { label: 'Errors', icon: AlertOctagon, text: 'text-red-400', border: 'border-l-red-500' },
  warning: { label: 'Warnings', icon: AlertTriangle, text: 'text-amber-400', border: 'border-l-amber-500' },
  info: { label: 'Info', icon: Info, text: 'text-sky-400', border: 'border-l-zinc-600' },
};

const location = (item: AttentionItem, appNames: Map<string, string>) => {
  const scope = item.application ? appNames.get(item.application) ?? item.application : 'Global';
  const env = item.environment && item.environment !== '*' ? item.environment : null;
  return env ? `${scope} / ${env}` : scope;
};

export const AttentionPanel: React.FC<{
  items: AttentionItem[];
  appNames: Map<string, string>;
  className?: string;
}> = ({ items, appNames, className }) => {
  const groups = groupAttention(items);
  return (
    <Panel
      className={className}
      labelledBy="dashboard-attention-title"
      icon={<ShieldAlert className="w-3.5 h-3.5" aria-hidden="true" />}
      title={<>Needs attention <span className="font-mono text-zinc-600">{items.length}</span></>}
      bodyClassName="p-0"
    >
      {groups.length === 0 ? (
        <div className="flex items-center gap-3 p-4 text-sm text-emerald-400">
          <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
          <span className="font-semibold">All clear</span>
          <span className="text-xs text-zinc-500">Nothing needs attention right now.</span>
        </div>
      ) : (
        groups.map(({ severity, items: groupItems }) => {
          const meta = SEVERITY_META[severity];
          const Icon = meta.icon;
          return (
            <div key={severity} className="border-b border-border last:border-b-0">
              <h4 className={cn('flex items-center gap-2 px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-[0.2em]', meta.text)}>
                <Icon className="w-3 h-3" aria-hidden="true" />
                {meta.label} <span className="font-mono text-zinc-600">{groupItems.length}</span>
              </h4>
              <ul aria-label={meta.label} className="pb-2">
                {groupItems.map((item, i) => {
                  const detail = attentionDetail(item);
                  return (
                    <li key={`${item.kind}:${item.application}:${item.environment}:${item.target}:${i}`}>
                      <Link
                        to={attentionLink(item)}
                        className={cn(
                          'flex flex-col sm:flex-row sm:items-center gap-x-3 gap-y-0.5 mx-2 px-2 py-1.5 border-l-2 hover:bg-zinc-900/70 transition-colors',
                          meta.border
                        )}
                      >
                        <span className="text-xs font-semibold text-zinc-200 shrink-0">{attentionLabel(item.kind)}</span>
                        {item.target && (
                          <span className="font-mono text-[11px] text-zinc-300 truncate">{item.target}</span>
                        )}
                        <span className="text-[11px] text-zinc-500 truncate">{location(item, appNames)}</span>
                        {detail && <span className="sm:ml-auto text-[11px] font-mono text-zinc-500 shrink-0">{detail}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })
      )}
    </Panel>
  );
};

export const AttentionSkeleton: React.FC<{ className?: string }> = ({ className }) => (
  <Panel className={className} title="Needs attention" icon={<ShieldAlert className="w-3.5 h-3.5" aria-hidden="true" />}>
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-6" />
      ))}
    </div>
  </Panel>
);
