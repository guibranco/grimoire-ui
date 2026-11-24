import type { PublishingStatus } from '@/types/api';

/**
 * Publishing and sentinel keys (guibranco/grimoire-api#95, guibranco/grimoire-ui#456). Clients
 * watch `Sentinel` / `Global:Sentinel` and reload when they change; with auto-publish off,
 * changes wait for "Publish changes".
 */

export const SENTINEL_KEY = 'Sentinel';
export const GLOBAL_SENTINEL_KEY = 'Global:Sentinel';

/** Sentinels are managed by Grimoire: shown read-only, never edited inline. */
export const isSentinelKey = (key: string) => key === SENTINEL_KEY || key === GLOBAL_SENTINEL_KEY;

/** An application environment, or the global layer. */
export type PublishingScope = { appSlug: string; envSlug: string } | { global: true };

const seg = encodeURIComponent;

const baseUrl = (scope: PublishingScope) =>
  'global' in scope ? '/global' : `/applications/${seg(scope.appSlug)}/environments/${seg(scope.envSlug)}`;

export const publishingUrl = (scope: PublishingScope) => `${baseUrl(scope)}/publishing`;
export const publishUrl = (scope: PublishingScope) => `${baseUrl(scope)}/publish`;

export const PUBLISHING_QUERY_KEY = 'publishing';
export const publishingQueryKey = (scope: PublishingScope) =>
  'global' in scope ? [PUBLISHING_QUERY_KEY, '*'] : [PUBLISHING_QUERY_KEY, scope.appSlug, scope.envSlug];

/** A usable status, or `null` for anything else (an older API answers 404 or an empty body). */
export function asPublishingStatus(data: unknown): PublishingStatus | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const status = data as Partial<PublishingStatus>;
  if (typeof status.autoPublish !== 'boolean' || typeof status.sentinelKey !== 'string') return null;
  return {
    autoPublish: status.autoPublish,
    sentinelKey: status.sentinelKey,
    sentinelValue: status.sentinelValue ?? null,
    lastPublishedAt: status.lastPublishedAt ?? null,
    pendingChangesSince: status.pendingChangesSince ?? null,
    hasPendingChanges: status.hasPendingChanges ?? status.pendingChangesSince != null,
  };
}

/** "just now", "5 min ago", "3 h ago", "2 d ago". */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const seconds = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

/** One-line summary of the status for the publish bar. */
export function describePublishing(status: PublishingStatus, now: Date = new Date()): string {
  if (status.hasPendingChanges && status.pendingChangesSince)
    return `Unpublished changes since ${timeAgo(status.pendingChangesSince, now)}. Running clients reload when you publish.`;
  if (status.hasPendingChanges) return 'Unpublished changes. Running clients reload when you publish.';
  const last = status.lastPublishedAt ? ` Last published ${timeAgo(status.lastPublishedAt, now)}.` : '';
  return status.autoPublish
    ? `Every change is published straight away.${last}`
    : `Up to date: running clients have every change.${last}`;
}
