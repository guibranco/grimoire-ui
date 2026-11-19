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

export interface SecretVersion {
  id?: string;
  version: number;
  isEnabled: boolean;
  expiresAt: string | null;
  notBefore: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface Secret {
  id?: string;
  name: string;
  description?: string | null;
  createdAt?: string;
  updatedAt?: string;
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
  | 'rotation-due';

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
