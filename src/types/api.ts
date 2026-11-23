export interface Application {
  name: string;
  slug: string;
  description?: string | null;
  inheritGlobals?: boolean;
  createdAt?: string;
}

/** Response of POST /management/applications — includes the one-time plain API key. */
export interface CreateApplicationResponse extends Application {
  id?: string;
  plainApiKey: string;
}

/** Response of POST /management/applications/{slug}/rotate-key. */
export interface RotateKeyResponse {
  plainApiKey: string;
}

export interface Environment {
  name: string;
  slug: string;
}

export type SecretVersionStatus = 'current' | 'valid' | 'scheduled' | 'expired' | 'disabled';

export interface SecretVersion {
  id?: string;
  version: number;
  isEnabled: boolean;
  expiresAt: string | null;
  notBefore: string | null;
  createdAt?: string;
  updatedAt?: string;
  /** The version consumers get now (guibranco/grimoire-api#96). */
  isCurrent?: boolean;
  status?: SecretVersionStatus;
}

/** Body of `PATCH …/versions/{env}/{version}`; omitted fields keep their value. */
export interface UpdateSecretVersionRequest {
  isEnabled?: boolean;
  notBefore?: string | null;
  expiresAt?: string | null;
  clearNotBefore?: boolean;
  clearExpiresAt?: boolean;
}

export interface Secret {
  id?: string;
  name: string;
  description?: string | null;
  /** Rotate at least this often (guibranco/grimoire-api#78); `null` for no schedule. */
  rotationIntervalDays?: number | null;
  createdAt?: string;
  updatedAt?: string;
}

/** Body of `PATCH …/secrets/{name}` (application or Global). Omitted fields keep their value. */
export interface UpdateSecretRequest {
  description?: string;
  rotationIntervalDays?: number;
  clearDescription?: boolean;
  clearRotationInterval?: boolean;
}

// ── Rotation (GET /management/secrets/expiring, guibranco/grimoire-api#78) ────

/** `expiry`: the current version's expiresAt; `rotation`: its rotation interval; `expired`: nothing valid left. */
export type SecretDueReason = 'expiry' | 'rotation' | 'expired';

/** A secret, in one environment, due for rotation. Never carries a value. */
export interface ExpiringSecret {
  /** Application slug; `null` for global secrets. */
  application: string | null;
  applicationName: string | null;
  secret: string;
  /** Environment slug (`*` for a global value targeting every environment). */
  environment: string;
  isGlobal: boolean;
  version: number;
  reason: SecretDueReason | (string & {});
  dueAt: string;
  /** Whole UTC calendar days until `dueAt`; negative when overdue. */
  daysRemaining: number;
  rotationIntervalDays: number | null;
}

export interface ExpiringSecretsResponse {
  generatedAt: string;
  withinDays: number;
  items: ExpiringSecret[];
}

/** Result of `POST /management/secrets/expiring/notify`. */
export interface RotationReminderRun {
  due: number;
  sent: number;
  alreadySent: number;
  webhookConfigured: boolean;
  delivered: boolean;
}

/** How a configuration value is shaped. Array and JSON values are JSON text in `value`. */
export type ConfigValueType = 'string' | 'multiline' | 'array' | 'json';

export interface Configuration {
  key: string;
  value: string;
  valueType?: ConfigValueType;
  description?: string | null;
  environmentSlug: string;
  updatedAt?: string;
}

export interface GlobalConfiguration {
  id?: string;
  environmentSlug: string; // "*" = all environments
  key: string;
  value: string;
  valueType?: ConfigValueType;
  description?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface GlobalEnvironment {
  slug: string;
  name: string;
  applicationCount: number;
}

export type ValueSource = 'application' | 'global';

export interface EffectiveConfiguration {
  key: string;
  value: string;
  valueType?: ConfigValueType;
  description?: string | null;
  source: ValueSource;
  globalEnvironmentSlug?: string | null;
  overridesGlobal: boolean;
}

// ── Configuration history (guibranco/grimoire-api#77) ──────────────────────

export type ConfigurationChange = 'baseline' | 'create' | 'update' | 'delete' | 'rollback';

/** One change to a configuration key. `value` is `null` for deletes. */
export interface ConfigurationRevision {
  revision: number;
  change: ConfigurationChange | (string & {});
  value: string | null;
  valueType: ConfigValueType;
  description: string | null;
  rolledBackFrom: number | null;
  changedBy: string;
  changedAt: string;
}

export type ConfigurationDiffStatus = 'added' | 'removed' | 'changed' | 'unchanged';

export interface ConfigurationDiffSide {
  value: string;
  valueType: ConfigValueType;
  source: ValueSource;
  globalEnvironmentSlug: string | null;
}

export interface ConfigurationDiffItem {
  key: string;
  status: ConfigurationDiffStatus | (string & {});
  from: ConfigurationDiffSide | null;
  to: ConfigurationDiffSide | null;
}

export interface ConfigurationDiffResponse {
  from: string;
  to: string;
  items: ConfigurationDiffItem[];
}

export interface EffectiveSecret {
  id?: string;
  name: string;
  description?: string | null;
  source: ValueSource;
  overridesGlobal: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export enum SecretStatus {
  ENABLED = 'enabled',
  DISABLED = 'disabled',
  EXPIRED = 'expired',
  PENDING = 'pending',
  MISSING = 'missing',
}

// ── Dashboard (GET /management/dashboard, guibranco/grimoire-api#104) ──────────

export interface DashboardTotals {
  applications: number;
  environments: number;
  secrets: number;
  configurations: number;
}

export interface DashboardEnvironment {
  slug: string;
  name?: string;
  secretCount: number;
  configurationCount: number;
  lastChangedAt?: string | null;
  /** Last time a consumer fetched from this environment; `null` when never seen. */
  lastSeenAt: string | null;
}

export interface DashboardApplication {
  slug: string;
  name: string;
  inheritGlobals: boolean;
  environments: DashboardEnvironment[];
  secretCount: number;
  configurationCount: number;
  lastChangedAt: string | null;
  lastSeenAt: string | null;
}

export interface DashboardGlobal {
  secretCount: number;
  configurationCount: number;
  lastChangedAt: string | null;
}

/** `null` until feature flags land (guibranco/grimoire-api#90). */
export interface DashboardFeatureFlags {
  total: number;
  enabled: number;
}

export type AttentionSeverity = 'error' | 'warning' | 'info';

export type AttentionKind =
  | 'secret-expired'
  | 'secret-expiring'
  | 'secret-no-valid-version'
  | 'consumer-stale'
  | 'consumer-never-seen'
  | 'config-empty-value'
  | 'secret-rotation-due';

export interface AttentionItem {
  kind: AttentionKind | (string & {});
  severity: AttentionSeverity;
  /** Application slug; `null` for Global entries. */
  application: string | null;
  /** Environment slug; `null` (or `*`) when not tied to one environment. */
  environment: string | null;
  /** Secret name or configuration key. */
  target: string | null;
  dueAt?: string | null;
  lastSeenAt?: string | null;
}

/** Audit event (guibranco/grimoire-api#76). Fields beyond `occurredAt`/`action` are optional. */
export interface ActivityEvent {
  id?: string;
  occurredAt: string;
  actor?: string | null;
  action: string;
  application?: string | null;
  environment?: string | null;
  target?: string | null;
  /** `secret` or `configuration`, when the event touches an entry. */
  targetType?: string | null;
  /** Audit action code (e.g. `secret.write`); `action` is its readable description. */
  code?: string | null;
}

export interface DashboardResponse {
  generatedAt: string;
  totals: DashboardTotals;
  applications: DashboardApplication[];
  global: DashboardGlobal;
  featureFlags: DashboardFeatureFlags | null;
  /** `null` while the audit log isn't available. */
  recentActivity: ActivityEvent[] | null;
  attention: AttentionItem[];
}

// ── Search (GET /management/search, guibranco/grimoire-api#105) ───────────────

export type SearchResultType =
  | 'application'
  | 'secret'
  | 'configuration'
  | 'global-secret'
  | 'global-configuration';

/** Where a name or key lives. Never carries a value. */
export interface SearchResult {
  type: SearchResultType | (string & {});
  /** Application name, secret name or configuration key. */
  name: string;
  /** Application slug; `null` for Global entries. */
  application: string | null;
  /** Environments holding a value (`*` = all environments, Global only). */
  environments: string[];
  description?: string | null;
  /** Configuration value type; configuration hits only. */
  valueType?: ConfigValueType | null;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  truncated: boolean;
}

// ── Audit log (GET /management/audit, guibranco/grimoire-api#76) ───────────────

export type AuditOutcome = 'success' | 'notfound' | 'forbidden' | 'invalid' | 'conflict' | 'error';

/** One audited request. Never carries secret or configuration values. */
export interface AuditEvent {
  id: string;
  occurredAt: string;
  /** `admin`, `app:<slug>` or `anonymous`. */
  actor: string;
  /** Action code, e.g. `secret.read`. */
  action: string;
  /** Human-readable action, e.g. "Read secret". */
  description: string;
  application: string | null;
  /** Environment slug(s), comma-separated when one request touched several. */
  environment: string | null;
  targetType: string | null;
  target: string | null;
  /** Secret version created or changed, when the request touched exactly one. */
  version?: number | null;
  outcome: AuditOutcome | (string & {});
  statusCode: number;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface AuditPage {
  items: AuditEvent[];
  page: number;
  pageSize: number;
  totalCount: number;
}

/** Last read of a secret by one application environment (guibranco/grimoire-api#84). */
export interface SecretReadInfo {
  application: string;
  environment: string;
  lastReadAt: string;
  readCount: number;
}

/** A secret with no Consumer API read in the report window. Never carries a value. */
export interface UnusedSecret {
  /** Owning application slug; `null` for a global secret. */
  application: string | null;
  applicationName: string | null;
  secret: string;
  isGlobal: boolean;
  createdAt: string;
  /** `null` when never read. */
  lastReadAt: string | null;
  readCount: number;
  reads: SecretReadInfo[];
}

/** `GET /management/reports/unused-secrets?days=N`. */
export interface UnusedSecretsResponse {
  generatedAt: string;
  days: number;
  since: string;
  items: UnusedSecret[];
}

export type DependencyNodeType = 'application' | 'secret' | 'global-secret' | 'config-key' | 'global-config-key';
export type DependencyEdgeKind = 'owns' | 'reads' | 'overrides' | 'inherits';

export interface DependencyNode {
  /** `app:{slug}`, `secret:{slug}/{name}`, `global-secret:{name}`, `config:{slug}/{key}` or `global-config:{key}`. */
  id: string;
  type: DependencyNodeType;
  label: string;
  /** Owning application slug for secrets and keys. */
  application: string | null;
  /** Environments a configuration key exists in. */
  environments: string[];
}

export interface DependencyEdge {
  source: string;
  target: string;
  kind: DependencyEdgeKind;
  /** For `reads`: the reading environments. */
  environments: string[];
  lastReadAt: string | null;
  readCount: number | null;
}

/** `GET /management/reports/dependencies`. */
export interface DependencyGraph {
  generatedAt: string;
  nodes: DependencyNode[];
  edges: DependencyEdge[];
}
