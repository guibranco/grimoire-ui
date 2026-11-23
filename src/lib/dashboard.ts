import { formatDistanceToNowStrict } from 'date-fns';
import type { AxiosInstance } from 'axios';
import type { QueryClient } from '@tanstack/react-query';
import type {
  ActivityEvent,
  AttentionItem,
  AttentionSeverity,
  DashboardApplication,
  DashboardResponse,
} from '@/types/api';
import { appPath, globalPath, type EntryTab } from '@/lib/routes';
import { EXPIRING_QUERY_KEY } from '@/lib/rotation';
import type { DashboardAppsSort } from '@/store/useStore';

/** Query key for `GET /dashboard`. Invalidated after every mutation (see `App.tsx`). */
export const DASHBOARD_QUERY_KEY = ['dashboard'] as const;

/** API defaults for the dashboard thresholds (`Dashboard:*` in grimoire-api appsettings). */
export const DEFAULT_EXPIRING_WITHIN_DAYS = 14;
export const DEFAULT_STALE_AFTER_DAYS = 7;

export const DASHBOARD_REFETCH_INTERVAL_MS = 60_000;

/**
 * Marks the dashboard (and the expiring-secrets list) stale after every successful create/update/delete made
 * through `client`, so it's fresh when the user comes back to it. Returns the
 * interceptor id (for `client.interceptors.response.eject`).
 */
export function invalidateDashboardOnMutations(client: AxiosInstance, queryClient: QueryClient): number {
  return client.interceptors.response.use((response) => {
    const method = (response.config?.method ?? 'get').toLowerCase();
    if (method !== 'get' && method !== 'head' && method !== 'options' && response.status < 400) {
      void queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: EXPIRING_QUERY_KEY });
    }
    return response;
  });
}

const DAY_MS = 24 * 60 * 60 * 1000;

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Validates and normalises a dashboard payload. Missing optional sections are
 * filled in so the view can render whatever the API version provides. Throws
 * when the payload isn't a dashboard at all (e.g. an older API without the endpoint).
 */
export function parseDashboard(data: unknown): DashboardResponse {
  if (!isRecord(data) || !Array.isArray(data.applications)) {
    throw new Error('Unexpected dashboard response');
  }
  const totals = isRecord(data.totals) ? data.totals : {};
  const global = isRecord(data.global) ? data.global : {};
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const applications = (data.applications as unknown[]).filter(isRecord).map((a) => ({
    ...(a as unknown as DashboardApplication),
    environments: Array.isArray(a.environments) ? (a.environments as DashboardApplication['environments']) : [],
    secretCount: num(a.secretCount),
    configurationCount: num(a.configurationCount),
    lastChangedAt: (a.lastChangedAt as string | null | undefined) ?? null,
    lastSeenAt: (a.lastSeenAt as string | null | undefined) ?? null,
  }));
  return {
    generatedAt: typeof data.generatedAt === 'string' ? data.generatedAt : new Date().toISOString(),
    totals: {
      applications: num(totals.applications ?? applications.length),
      environments: num(totals.environments),
      secrets: num(totals.secrets),
      configurations: num(totals.configurations),
    },
    applications,
    global: {
      secretCount: num(global.secretCount),
      configurationCount: num(global.configurationCount),
      lastChangedAt: (global.lastChangedAt as string | null | undefined) ?? null,
    },
    featureFlags: isRecord(data.featureFlags)
      ? { total: num(data.featureFlags.total), enabled: num(data.featureFlags.enabled) }
      : null,
    recentActivity: Array.isArray(data.recentActivity) ? (data.recentActivity as ActivityEvent[]) : null,
    attention: Array.isArray(data.attention) ? (data.attention as AttentionItem[]).filter(isRecord) : [],
  };
}

const toTime = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
};

/** "3 hours ago" / "in 5 days"; `fallback` when missing or invalid. */
export function formatRelative(value: string | null | undefined, fallback = 'Never', now: Date = new Date()): string {
  const t = toTime(value);
  if (t === null) return fallback;
  if (Math.abs(now.getTime() - t) < 45_000) return 'just now';
  return formatDistanceToNowStrict(t, { addSuffix: true });
}

/** Absolute timestamp for hover titles. */
export function formatAbsolute(value: string | null | undefined): string | undefined {
  const t = toTime(value);
  return t === null ? undefined : new Date(t).toLocaleString();
}

export type ConsumerHealth = 'fresh' | 'recent' | 'stale' | 'never';

/** Green < 1 day, amber < `staleAfterDays`, red stale, grey never seen. */
export function consumerHealth(
  lastSeenAt: string | null | undefined,
  staleAfterDays: number = DEFAULT_STALE_AFTER_DAYS,
  now: Date = new Date()
): ConsumerHealth {
  const t = toTime(lastSeenAt);
  if (t === null) return 'never';
  const age = now.getTime() - t;
  if (age < DAY_MS) return 'fresh';
  if (age < staleAfterDays * DAY_MS) return 'recent';
  return 'stale';
}

export const CONSUMER_HEALTH_LABEL: Record<ConsumerHealth, string> = {
  fresh: 'Seen in the last day',
  recent: 'Seen recently',
  stale: 'Stale',
  never: 'Never seen',
};

const SEVERITY_ORDER: Record<AttentionSeverity, number> = { error: 0, warning: 1, info: 2 };
export const SEVERITIES: readonly AttentionSeverity[] = ['error', 'warning', 'info'];

const severityOf = (item: AttentionItem): AttentionSeverity =>
  item.severity in SEVERITY_ORDER ? item.severity : 'info';

/** Attention items grouped by severity, error → warning → info. Empty groups are omitted. */
export function groupAttention(items: AttentionItem[]): { severity: AttentionSeverity; items: AttentionItem[] }[] {
  return SEVERITIES.map((severity) => ({
    severity,
    items: items.filter((i) => severityOf(i) === severity),
  })).filter((g) => g.items.length > 0);
}

/** Number of attention items per application slug. */
export function attentionCountByApp(items: AttentionItem[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (item.application) counts.set(item.application, (counts.get(item.application) ?? 0) + 1);
  }
  return counts;
}

const ATTENTION_LABELS: Record<string, string> = {
  'secret-expired': 'Secret expired',
  'secret-expiring': 'Secret expiring',
  'secret-no-valid-version': 'No valid secret version',
  'consumer-stale': 'Stale consumer',
  'consumer-never-seen': 'Never fetched',
  'config-empty-value': 'Empty configuration value',
  'secret-rotation-due': 'Rotation due',
};

export const attentionLabel = (kind: string) =>
  ATTENTION_LABELS[kind] ?? kind.replaceAll('-', ' ').replace(/^./, (c) => c.toUpperCase());

/** Short detail line, e.g. "expires in 3 days" or "last seen 9 days ago". */
export function attentionDetail(item: AttentionItem): string | null {
  switch (item.kind) {
    case 'secret-expiring':
      return item.dueAt ? `expires ${formatRelative(item.dueAt)}` : null;
    case 'secret-expired':
      return item.dueAt ? `expired ${formatRelative(item.dueAt)}` : null;
    case 'secret-rotation-due':
      return item.dueAt ? `due ${formatRelative(item.dueAt)}` : null;
    case 'consumer-stale':
      return item.lastSeenAt ? `last seen ${formatRelative(item.lastSeenAt)}` : null;
    case 'consumer-never-seen':
      return 'no recorded fetches';
    default:
      return null;
  }
}

const tabForKind = (kind: string): EntryTab | null => {
  if (kind.startsWith('secret-')) return 'secrets';
  if (kind.startsWith('config-')) return 'config';
  return null;
};

const realEnv = (env: string | null | undefined) => (env && env !== '*' ? env : null);

/** Deep link to the offending app/env/entry, highlighting it with `?key=`. */
export function attentionLink(item: AttentionItem): string {
  const tab = tabForKind(item.kind);
  if (!item.application) {
    return globalPath(tab ?? 'config', tab ? item.target : null);
  }
  return appPath(item.application, realEnv(item.environment), tab, tab ? item.target : null);
}

/** Entries tab for an audit target type: `secret*` → secrets, `config*` → config. */
export function entryTabFor(
  targetType: string,
  matches: (type: string, prefix: string) => boolean = (type, prefix) => type === prefix
): EntryTab | null {
  if (matches(targetType, 'secret')) return 'secrets';
  if (matches(targetType, 'config')) return 'config';
  return null;
}

/** Deep link for an audit event, as specific as its fields allow. */
export function activityLink(event: ActivityEvent): string | null {
  const tab = entryTabFor((event.targetType ?? '').toLowerCase(), (type, prefix) => type.startsWith(prefix));
  const key = tab ? event.target ?? null : null;
  if (event.application) return appPath(event.application, realEnv(event.environment), tab, key);
  if (tab) return globalPath(tab, key);
  return null;
}

/** Filters by name/slug/description and sorts; most recent first for the date sorts, never-seen last. */
export function sortAndFilterApps<T extends DashboardApplication & { description?: string | null }>(
  apps: T[],
  sort: DashboardAppsSort,
  filter: string
): T[] {
  const q = filter.trim().toLowerCase();
  const filtered = q
    ? apps.filter((a) =>
        [a.name, a.slug, a.description ?? ''].some((v) => (v ?? '').toLowerCase().includes(q))
      )
    : apps.slice();
  const byName = (a: T, b: T) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  const byDateDesc = (pick: (a: T) => string | null) => (a: T, b: T) => {
    const ta = toTime(pick(a));
    const tb = toTime(pick(b));
    if (ta === tb) return byName(a, b);
    if (ta === null) return 1;
    if (tb === null) return -1;
    return tb - ta;
  };
  const comparers: Record<DashboardAppsSort, (a: T, b: T) => number> = {
    lastChanged: byDateDesc((a) => a.lastChangedAt),
    lastFetched: byDateDesc((a) => a.lastSeenAt),
    name: byName,
  };
  return filtered.sort(comparers[sort] ?? byName);
}
