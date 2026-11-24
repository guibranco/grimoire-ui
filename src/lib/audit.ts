import type { AuditEvent, AuditOutcome } from '@/types/api';
import { appPath, flagsPath, globalPath, type EntryTab } from '@/lib/routes';

/**
 * Action codes recorded by the API (guibranco/grimoire-api#76), grouped for the filter. One per
 * line as `code | label`; a `# Group | prefix` line starts a group.
 */
const AUDIT_ACTION_TABLE = `
# Applications | application.*
application.create | Created application
application.update | Updated application
application.delete | Deleted application
application.rotate-key | Rotated API key
# Access tokens | access-token.*
access-token.create | Created access token
access-token.revoke | Revoked access token
access-token.denied | Denied access token request
access-token.oidc-exchange | Exchanged GitHub OIDC token
# Trust policies | trust-policy.*
trust-policy.create | Created trust policy
trust-policy.update | Updated trust policy
trust-policy.delete | Deleted trust policy
# Environments | environment.*
environment.create | Created environment
environment.delete | Deleted environment
# Secrets | secret.*
secret.create | Created secret
secret.update | Updated secret
secret.write | Added secret version
secret.delete | Deleted secret
secret.version-update | Updated secret version
secret.rollback | Rolled back secret
secret.read | Read secret
secret.list | Listed secrets
# Configuration | configuration.*
configuration.create | Created configuration
configuration.update | Updated configuration
configuration.delete | Deleted configuration
configuration.rollback | Rolled back configuration
configuration.read | Read configuration
# Publishing | publishing.*
publishing.update | Changed auto-publish
publishing.publish | Published configuration
# Feature flags | feature-flag.*
feature-flag.create | Created feature flag
feature-flag.update | Updated feature flag
feature-flag.delete | Deleted feature flag
feature-flag.environment-update | Updated feature flag targeting
feature-flag.toggle | Toggled feature flag
feature-flag.read | Read feature flags
# Global | global-*
global-secret.create | Created global secret
global-secret.update | Updated global secret
global-secret.write | Added global secret version
global-secret.delete | Deleted global secret
global-secret.version-update | Updated global secret version
global-secret.rollback | Rolled back global secret
global-configuration.create | Created global configuration
global-configuration.update | Updated global configuration
global-configuration.delete | Deleted global configuration
global-configuration.rollback | Rolled back global configuration
global-publishing.update | Changed global auto-publish
global-publishing.publish | Published global configuration
# Other | 
import.apply | Imported values
export.read | Exported values
backup.create | Created backup
rotation.remind | Sent rotation reminders
auth.failed | Rejected unauthenticated request
`;

export const AUDIT_ACTION_GROUPS: { label: string; prefix: string; actions: { code: string; label: string }[] }[] =
  AUDIT_ACTION_TABLE.trim()
    .split('\n')
    .reduce<{ label: string; prefix: string; actions: { code: string; label: string }[] }[]>((groups, line) => {
      const [left, right] = line.split(' | ');
      if (left.startsWith('# ')) groups.push({ label: left.slice(2), prefix: right, actions: [] });
      else groups.at(-1)!.actions.push({ code: left, label: right });
      return groups;
    }, []);

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
