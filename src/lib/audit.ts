import type { AuditEvent, AuditOutcome } from '@/types/api';
import { appPath, flagsPath, globalPath, type EntryTab } from '@/lib/routes';

/** Action codes recorded by the API (guibranco/grimoire-api#76), grouped for the filter. */
export const AUDIT_ACTION_GROUPS: { label: string; prefix: string; actions: { code: string; label: string }[] }[] = [
  {
    label: 'Applications',
    prefix: 'application.*',
    actions: [
      { code: 'application.create', label: 'Created application' },
      { code: 'application.update', label: 'Updated application' },
      { code: 'application.delete', label: 'Deleted application' },
      { code: 'application.rotate-key', label: 'Rotated API key' },
    ],
  },
  {
    label: 'Access tokens',
    prefix: 'access-token.*',
    actions: [
      { code: 'access-token.create', label: 'Created access token' },
      { code: 'access-token.revoke', label: 'Revoked access token' },
      { code: 'access-token.denied', label: 'Denied access token request' },
    ],
  },
  {
    label: 'Environments',
    prefix: 'environment.*',
    actions: [
      { code: 'environment.create', label: 'Created environment' },
      { code: 'environment.delete', label: 'Deleted environment' },
    ],
  },
  {
    label: 'Secrets',
    prefix: 'secret.*',
    actions: [
      { code: 'secret.create', label: 'Created secret' },
      { code: 'secret.update', label: 'Updated secret' },
      { code: 'secret.write', label: 'Added secret version' },
      { code: 'secret.delete', label: 'Deleted secret' },
      { code: 'secret.version-update', label: 'Updated secret version' },
      { code: 'secret.rollback', label: 'Rolled back secret' },
      { code: 'secret.read', label: 'Read secret' },
    ],
  },
  {
    label: 'Configuration',
    prefix: 'configuration.*',
    actions: [
      { code: 'configuration.create', label: 'Created configuration' },
      { code: 'configuration.update', label: 'Updated configuration' },
      { code: 'configuration.delete', label: 'Deleted configuration' },
      { code: 'configuration.rollback', label: 'Rolled back configuration' },
      { code: 'configuration.read', label: 'Read configuration' },
    ],
  },
  {
    label: 'Feature flags',
    prefix: 'feature-flag.*',
    actions: [
      { code: 'feature-flag.create', label: 'Created feature flag' },
      { code: 'feature-flag.update', label: 'Updated feature flag' },
      { code: 'feature-flag.delete', label: 'Deleted feature flag' },
      { code: 'feature-flag.environment-update', label: 'Updated feature flag targeting' },
      { code: 'feature-flag.toggle', label: 'Toggled feature flag' },
      { code: 'feature-flag.read', label: 'Read feature flags' },
    ],
  },
  {
    label: 'Global',
    prefix: 'global-*',
    actions: [
      { code: 'global-secret.create', label: 'Created global secret' },
      { code: 'global-secret.update', label: 'Updated global secret' },
      { code: 'global-secret.write', label: 'Added global secret version' },
      { code: 'global-secret.delete', label: 'Deleted global secret' },
      { code: 'global-secret.version-update', label: 'Updated global secret version' },
      { code: 'global-secret.rollback', label: 'Rolled back global secret' },
      { code: 'global-configuration.create', label: 'Created global configuration' },
      { code: 'global-configuration.update', label: 'Updated global configuration' },
      { code: 'global-configuration.delete', label: 'Deleted global configuration' },
      { code: 'global-configuration.rollback', label: 'Rolled back global configuration' },
    ],
  },
  {
    label: 'Other',
    prefix: '',
    actions: [
      { code: 'backup.create', label: 'Created backup' },
      { code: 'rotation.remind', label: 'Sent rotation reminders' },
      { code: 'auth.failed', label: 'Rejected unauthenticated request' },
    ],
  },
];

export const AUDIT_ACTION_LABELS: Record<string, string> = Object.fromEntries(
  AUDIT_ACTION_GROUPS.flatMap((g) => g.actions.map((a) => [a.code, a.label]))
);

export const AUDIT_OUTCOMES: { value: AuditOutcome; label: string }[] = [
  { value: 'success', label: 'Success' },
  { value: 'notfound', label: 'Not found' },
  { value: 'forbidden', label: 'Forbidden' },
  { value: 'invalid', label: 'Invalid' },
  { value: 'conflict', label: 'Conflict' },
  { value: 'error', label: 'Error' },
];

export const AUDIT_PAGE_SIZE = 50;

/** Filters shared by the URL, the filter bar and `GET /management/audit`. */
export interface AuditFilters {
  application: string;
  action: string;
  actor: string;
  environment: string;
  target: string;
  outcome: string;
  /** `YYYY-MM-DD`, inclusive (local day). */
  from: string;
  to: string;
  includeReads: boolean;
  page: number;
}

export const EMPTY_AUDIT_FILTERS: AuditFilters = {
  application: '',
  action: '',
  actor: '',
  environment: '',
  target: '',
  outcome: '',
  from: '',
  to: '',
  includeReads: true,
  page: 1,
};

const TEXT_KEYS = ['application', 'action', 'actor', 'environment', 'target', 'outcome', 'from', 'to'] as const;

export function filtersFromSearchParams(params: URLSearchParams): AuditFilters {
  const filters: AuditFilters = { ...EMPTY_AUDIT_FILTERS };
  for (const key of TEXT_KEYS) filters[key] = params.get(key) ?? '';
  filters.includeReads = params.get('includeReads') !== 'false';
  const page = Number(params.get('page'));
  filters.page = Number.isInteger(page) && page > 0 ? page : 1;
  return filters;
}

/** Only non-default values, so URLs stay short and shareable. */
export function filtersToSearchParams(filters: AuditFilters): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of TEXT_KEYS) if (filters[key]) params.set(key, filters[key]);
  if (!filters.includeReads) params.set('includeReads', 'false');
  if (filters.page > 1) params.set('page', String(filters.page));
  return params;
}

const isDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Query parameters for the API: whole local days become ISO instants. */
export function filtersToApiParams(filters: AuditFilters, pageSize = AUDIT_PAGE_SIZE) {
  const params: Record<string, string | number | boolean> = { page: filters.page, pageSize };
  for (const key of ['application', 'action', 'actor', 'environment', 'target', 'outcome'] as const) {
    if (filters[key]) params[key] = filters[key];
  }
  if (isDay(filters.from)) params.from = new Date(`${filters.from}T00:00:00`).toISOString();
  if (isDay(filters.to)) params.to = new Date(`${filters.to}T23:59:59.999`).toISOString();
  if (!filters.includeReads) params.includeReads = false;
  return params;
}

export const hasActiveFilters = (filters: AuditFilters, ignore: (keyof AuditFilters)[] = []) =>
  (Object.keys(EMPTY_AUDIT_FILTERS) as (keyof AuditFilters)[])
    .filter((k) => k !== 'page' && !ignore.includes(k))
    .some((k) => filters[k] !== EMPTY_AUDIT_FILTERS[k]);

const AUDIT_TARGET_TABS: Record<string, EntryTab> = { secret: 'secrets', configuration: 'config' };

/** A single, concrete environment slug of the event, if any. */
const singleEnvironment = (event: AuditEvent) =>
  event.environment && !event.environment.includes(',') && event.environment !== '*' ? event.environment : null;

/** The flag view needs an environment; flag-level changes open the application. */
function flagEventLink(event: AuditEvent, application: string, env: string | null): string {
  const flag = event.action.endsWith('.delete') ? null : event.target;
  return env ? flagsPath(application, env, flag) : appPath(application);
}

/** Where an audit event's entry lives, if it still can be opened. */
export function auditEventLink(event: AuditEvent): string | null {
  if (event.outcome !== 'success' && event.action.endsWith('.delete')) return null;
  const env = singleEnvironment(event);
  if (event.targetType === 'feature-flag' && event.application) return flagEventLink(event, event.application, env);
  const tab = AUDIT_TARGET_TABS[(event.targetType ?? '').toLowerCase()] ?? null;
  const key = tab && !event.action.endsWith('.delete') ? event.target : null;
  if (event.application) {
    if (event.action === 'application.delete') return null;
    // Without an environment the URL can't name the tab (the app opens on config), so only a
    // configuration key can still be highlighted.
    const appKey = env || tab === 'config' ? key : null;
    return appPath(event.application, env, tab, appKey);
  }
  return tab ? globalPath(tab, key) : null;
}

export const outcomeLabel = (outcome: string) =>
  AUDIT_OUTCOMES.find((o) => o.value === outcome)?.label ?? outcome;
