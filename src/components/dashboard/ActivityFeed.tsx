import React from 'react';
import { Link } from 'react-router-dom';
import { History } from 'lucide-react';
import { activityLink } from '@/lib/dashboard';
import { auditPath } from '@/lib/routes';
import type { ActivityEvent } from '@/types/api';
import { Panel, RelativeTime, Skeleton } from './parts';

const where = (event: ActivityEvent, appNames: Map<string, string>) => {
  const parts: string[] = [];
  if (event.application) parts.push(appNames.get(event.application) ?? event.application);
  else if (event.targetType) parts.push('Global');
  if (event.environment && event.environment !== '*') parts.push(event.environment);
  return parts.join(' / ');
};

/**
 * Last audit events (changes only). `events === null` means the API has no audit log
 * (guibranco/grimoire-api#76) or it is disabled; "View all" opens the audit log viewer.
 */
export const ActivityFeed: React.FC<{
  events: ActivityEvent[] | null;
  appNames: Map<string, string>;
  className?: string;
}> = ({ events, appNames, className }) => (
  <Panel
    className={className}
    labelledBy="dashboard-activity-title"
    icon={<History className="w-3.5 h-3.5" aria-hidden="true" />}
    title="Recent activity"
    bodyClassName="p-0"
    actions={
      events !== null && (
        <Link
          to={auditPath({ includeReads: false })}
          className="text-[10px] uppercase tracking-widest text-zinc-400 hover:text-zinc-100"
        >
          View all
        </Link>
      )
    }
  >
    {events === null ? (
      <p className="p-4 text-xs text-zinc-500">Audit log not enabled yet.</p>
    ) : events.length === 0 ? (
      <p className="p-4 text-xs text-zinc-500">No recent activity.</p>
    ) : (
      <ol aria-label="Recent activity" className="divide-y divide-zinc-900">
        {events.slice(0, 20).map((event, i) => {
          const to = activityLink(event);
          const location = where(event, appNames);
          const body = (
            <>
              <span className="text-xs text-zinc-200">
                {event.actor && <span className="font-semibold text-zinc-100">{event.actor} </span>}
                <span className="text-zinc-400">{event.action.charAt(0).toLowerCase() + event.action.slice(1)}</span>
                {event.target && <span className="ml-1 font-mono text-[11px] text-zinc-200">{event.target}</span>}
              </span>
              {location && <span className="text-[11px] text-zinc-500 truncate">{location}</span>}
              <RelativeTime value={event.occurredAt} className="sm:ml-auto text-[11px] font-mono text-zinc-500 shrink-0" />
            </>
          );
          const cls = 'flex flex-col sm:flex-row sm:items-center gap-x-3 gap-y-0.5 px-4 py-2';
          return (
            <li key={event.id ?? `${event.occurredAt}:${i}`}>
              {to ? (
                <Link to={to} className={`${cls} hover:bg-zinc-900/70 transition-colors`}>
                  {body}
                </Link>
              ) : (
                <div className={cls}>{body}</div>
              )}
            </li>
          );
        })}
      </ol>
    )}
  </Panel>
);

export const ActivitySkeleton: React.FC<{ className?: string }> = ({ className }) => (
  <Panel className={className} title="Recent activity" icon={<History className="w-3.5 h-3.5" aria-hidden="true" />}>
    <div className="space-y-2">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-5" />
      ))}
    </div>
  </Panel>
);
