import { AxiosResponse, AxiosRequestConfig } from 'axios';
import { parseArrayItems } from './configValue';

// Mock Database Initial State
const DEFAULT_APPLICATIONS = [
  {
    name: "Production Gateway",
    slug: "production-gateway",
    description: "Primary configuration container for Edge Proxy, Database connectors, and API gateways.",
    inheritGlobals: true,
    createdAt: "2026-06-20T10:00:00.000Z"
  },
  {
    name: "Auth Provider Security",
    slug: "auth-provider-security",
    description: "Private vault for OAuth credentials, SAML keys, and JSON Web Token signing secrets.",
    inheritGlobals: true,
    createdAt: "2026-06-21T12:30:00.000Z"
  }
];

const DEFAULT_ENVIRONMENTS: Record<string, { name: string, slug: string }[]> = {
  "production-gateway": [
    { name: "Production", slug: "production" },
    { name: "Staging", slug: "staging" },
    { name: "Development", slug: "development" }
  ],
  "auth-provider-security": [
    { name: "Production", slug: "production" },
    { name: "Staging", slug: "staging" }
  ]
};

const DEFAULT_SECRETS: Record<string, any[]> = {
  "production-gateway": [
    {
      id: "11111111-1111-4111-8111-111111111111",
      name: "DATABASE_PASSWORDS",
      description: "Encrypted PostgreSQL server authentication keys for primary cluster.",
      createdAt: "2026-06-20T10:15:00.000Z",
      updatedAt: "2026-06-20T10:15:00.000Z"
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      name: "REDIS_CACHE_TOKEN",
      description: "Distributed cache access tokens.",
      createdAt: "2026-06-20T11:00:00.000Z",
      updatedAt: "2026-06-20T11:00:00.000Z"
    }
  ],
  "auth-provider-security": [
    {
      id: "33333333-3333-4333-8333-333333333333",
      name: "JWT_SIGNING_SECRET",
      description: "Symmetric key for JWT validation and encryption tokens.",
      // Dashboard demo: drives `rotation-due` (rotation policies: guibranco/grimoire-api#78).
      rotationIntervalDays: 90,
      createdAt: "2026-06-21T12:45:00.000Z",
      updatedAt: "2026-06-21T12:45:00.000Z"
    }
  ]
};

// Demo dates relative to when the mock loads, so the dashboard always has something to flag.
const MOCK_LOADED_AT = Date.now();
const DAY = 24 * 60 * 60 * 1000;
const daysFromLoad = (days: number) => new Date(MOCK_LOADED_AT + days * DAY).toISOString();

const DEFAULT_SECRET_VERSIONS: Record<string, any[]> = {
  // Dashboard demo: expired with no other valid version → `secret-expired`.
  "production-gateway:DATABASE_PASSWORDS:development": [
    {
      id: "aaaa3333-3333-4333-8333-333333333333",
      version: 1,
      isEnabled: true,
      expiresAt: daysFromLoad(-2),
      notBefore: null,
      createdAt: daysFromLoad(-60)
    }
  ],
  // Dashboard demo: expires soon → `secret-expiring`.
  "auth-provider-security:JWT_SIGNING_SECRET:staging": [
    {
      id: "cccc4444-3333-4333-8333-333333333333",
      version: 1,
      isEnabled: true,
      expiresAt: daysFromLoad(5),
      notBefore: null,
      createdAt: daysFromLoad(-25)
    }
  ],
  "production-gateway:DATABASE_PASSWORDS:production": [
    {
      id: "aaaa1111-1111-4111-8111-111111111111",
      version: 1,
      isEnabled: true,
      expiresAt: null,
      notBefore: null,
      createdAt: "2026-06-20T10:15:00.000Z"
    }
  ],
  "production-gateway:DATABASE_PASSWORDS:staging": [
    {
      id: "aaaa2222-2222-4222-8222-222222222222",
      version: 2,
      isEnabled: true,
      expiresAt: null,
      notBefore: null,
      createdAt: "2026-06-20T12:00:00.000Z"
    },
    {
      id: "aaaa2221-2222-4222-8222-222222222222",
      version: 1,
      isEnabled: true,
      expiresAt: null,
      notBefore: null,
      createdAt: "2026-06-20T10:20:00.000Z"
    }
  ],
  "production-gateway:REDIS_CACHE_TOKEN:production": [
    {
      id: "bbbb1111-1111-4111-8111-111111111111",
      version: 1,
      isEnabled: false,
      expiresAt: null,
      notBefore: null,
      createdAt: "2026-06-20T11:00:00.000Z"
    }
  ],
  "auth-provider-security:JWT_SIGNING_SECRET:production": [
    {
      id: "cccc3333-3333-4333-8333-333333333333",
      version: 3,
      isEnabled: true,
      expiresAt: "2027-06-21T12:45:00.000Z",
      notBefore: null,
      createdAt: "2026-06-21T12:45:00.000Z"
    },
    {
      id: "cccc2222-3333-4333-8333-333333333333",
      version: 2,
      isEnabled: true,
      expiresAt: null,
      notBefore: null,
      createdAt: "2026-06-21T12:30:00.000Z"
    },
    {
      id: "cccc1111-3333-4333-8333-333333333333",
      version: 1,
      isEnabled: true,
      expiresAt: null,
      notBefore: null,
      createdAt: "2026-06-21T12:00:00.000Z"
    }
  ]
};

// Mirrors the API: arrays are stored as a JSON array of their non-blank items.
const storedValue = (valueType: string | undefined, value: string): string =>
  valueType === 'array' ? JSON.stringify(parseArrayItems(value)) : value;

const DEFAULT_CONFIGURATIONS: Record<string, any[]> = {
  "production-gateway": [
    {
      key: "MAX_DB_CONNECTIONS",
      value: "100",
      description: "The maximum pool size of Database connection pool.",
      environmentSlug: "production",
      updatedAt: "2026-06-20T10:10:00.000Z"
    },
    {
      key: "MAX_DB_CONNECTIONS",
      value: "20",
      description: "The maximum pool size of Database connection pool.",
      environmentSlug: "staging",
      updatedAt: "2026-06-20T10:10:00.000Z"
    },
    {
      key: "COMPRESSION_ENABLED",
      value: "true",
      description: "Gzip level responses compression switch.",
      environmentSlug: "production",
      updatedAt: "2026-06-20T10:12:00.000Z"
    }
  ],
  "auth-provider-security": [
    {
      key: "OAUTH_CALLBACK_URL",
      value: "https://auth.internal.grimoire.dev/callback",
      description: "Where the identity provider redirects after sign-in.",
      environmentSlug: "production",
      updatedAt: "2026-06-21T13:00:00.000Z"
    },
    {
      // Dashboard demo: blank value → `config-empty-value`.
      key: "OAUTH_CALLBACK_URL",
      value: "",
      description: "Where the identity provider redirects after sign-in.",
      environmentSlug: "staging",
      updatedAt: "2026-06-21T13:00:00.000Z"
    }
  ]
};

/**
 * When each environment's consumer last fetched (the real API records this on
 * consumer requests). Missing entries have never been seen.
 */
const MOCK_LAST_SEEN: Record<string, string> = {
  "production-gateway:production": daysFromLoad(-0.02),
  "production-gateway:staging": daysFromLoad(-3),
  "auth-provider-security:production": daysFromLoad(-10),
  "auth-provider-security:staging": daysFromLoad(-0.1),
};

// Storage Helpers
const isBrowser = typeof window !== 'undefined';

function getStored<T>(key: string, defaultValue: T): T {
  if (isBrowser) {
    const item = localStorage.getItem('grm_mock_' + key);
    if (item) {
      try {
        return JSON.parse(item);
      } catch (e) {
        // Fallback
      }
    }
  }
  return JSON.parse(JSON.stringify(defaultValue)); // deep clone
}

function saveStored<T>(key: string, data: T): void {
  if (isBrowser) {
    localStorage.setItem('grm_mock_' + key, JSON.stringify(data));
  }
}

const DEFAULT_GLOBAL_CONFIGURATIONS = [
  {
    id: "gcfg-1111-4111-8111-111111111111",
    environmentSlug: "*",
    key: "LogStream:Url",
    value: "https://logs.internal.grimoire.dev",
    description: "Centralized log ingestion endpoint across all environments.",
    createdAt: "2026-06-20T09:00:00.000Z",
    updatedAt: "2026-06-20T09:00:00.000Z"
  },
  {
    id: "gcfg-2222-4222-8222-222222222222",
    environmentSlug: "production",
    key: "FeatureFlags:NewDashboard",
    value: "true",
    description: "Enable redesigned dashboard in production environments.",
    createdAt: "2026-06-20T09:05:00.000Z",
    updatedAt: "2026-06-20T09:05:00.000Z"
  },
  {
    id: "gcfg-3333-4333-8333-333333333333",
    environmentSlug: "*",
    key: "Network:AllowedIps",
    value: "[\"10.0.0.1\",\"10.0.0.2\",\"192.168.1.0/24\"]",
    valueType: "array",
    description: "IP allow-list shared by every application.",
    createdAt: "2026-06-20T09:06:00.000Z",
    updatedAt: "2026-06-20T09:06:00.000Z"
  },
  {
    id: "gcfg-4444-4444-8444-444444444444",
    environmentSlug: "*",
    key: "Smtp",
    value: "{\"host\":\"smtp.internal.grimoire.dev\",\"port\":587,\"useTls\":true}",
    valueType: "json",
    description: "Shared SMTP relay settings.",
    createdAt: "2026-06-20T09:07:00.000Z",
    updatedAt: "2026-06-20T09:07:00.000Z"
  }
];

const DEFAULT_GLOBAL_SECRETS = [
  {
    id: "gsec-1111-4111-8111-111111111111",
    name: "Sentry--Dsn",
    description: "Shared error tracking DSN inherited across applications.",
    createdAt: "2026-06-20T09:10:00.000Z",
    updatedAt: "2026-06-20T09:10:00.000Z"
  }
];

const DEFAULT_GLOBAL_SECRET_VERSIONS: Record<string, any[]> = {
  "Sentry--Dsn:*": [
    {
      id: "gver-1111-4111-8111-111111111111",
      version: 1,
      isEnabled: true,
      expiresAt: null,
      notBefore: null,
      createdAt: "2026-06-20T09:10:00.000Z"
    }
  ]
};

// In-Memory Database instances
let applications = getStored('applications', DEFAULT_APPLICATIONS);
let environments = getStored('environments', DEFAULT_ENVIRONMENTS);
let secrets = getStored('secrets', DEFAULT_SECRETS);
let configurations = getStored('configurations', DEFAULT_CONFIGURATIONS);
let secretVersions = getStored<Record<string, any[]>>('secret_versions', DEFAULT_SECRET_VERSIONS);
let globalConfigurations = getStored('global_configurations', DEFAULT_GLOBAL_CONFIGURATIONS);
let globalSecrets = getStored('global_secrets', DEFAULT_GLOBAL_SECRETS);
let globalSecretVersions = getStored<Record<string, any[]>>('global_secret_versions', DEFAULT_GLOBAL_SECRET_VERSIONS);

function sanitizeSecretMetadata(secret: any) {
  if (!secret) return secret;
  const { values: _ignored, ...metadata } = secret;
  return metadata;
}

// Reset handler (useful for testing)
export function resetMockDatabase() {
  applications = JSON.parse(JSON.stringify(DEFAULT_APPLICATIONS));
  environments = JSON.parse(JSON.stringify(DEFAULT_ENVIRONMENTS));
  secrets = JSON.parse(JSON.stringify(DEFAULT_SECRETS));
  configurations = JSON.parse(JSON.stringify(DEFAULT_CONFIGURATIONS));
  secretVersions = JSON.parse(JSON.stringify(DEFAULT_SECRET_VERSIONS));
  globalConfigurations = JSON.parse(JSON.stringify(DEFAULT_GLOBAL_CONFIGURATIONS));
  globalSecrets = JSON.parse(JSON.stringify(DEFAULT_GLOBAL_SECRETS));
  globalSecretVersions = JSON.parse(JSON.stringify(DEFAULT_GLOBAL_SECRET_VERSIONS));
  activityLog = seedActivity();
  if (isBrowser) {
    localStorage.removeItem('grm_mock_applications');
    localStorage.removeItem('grm_mock_environments');
    localStorage.removeItem('grm_mock_secrets');
    localStorage.removeItem('grm_mock_configurations');
    localStorage.removeItem('grm_mock_secret_versions');
    localStorage.removeItem('grm_mock_global_configurations');
    localStorage.removeItem('grm_mock_global_secrets');
    localStorage.removeItem('grm_mock_global_secret_versions');
  }
}

// REST Helper function to build response
function makeResponse(status: number, data: any, config: AxiosRequestConfig): Promise<AxiosResponse> {
  return Promise.resolve({
    data,
    status,
    statusText: status >= 200 && status < 300 ? 'OK' : 'Error',
    headers: {},
    config
  } as AxiosResponse);
}

// ── Dashboard (GET /dashboard) ───────────────────────────────────────────────

interface MockActivity {
  id: string;
  occurredAt: string;
  actor: string;
  action: string;
  application: string | null;
  environment: string | null;
  target: string | null;
  targetType: string | null;
}

const MOCK_ACTOR = 'admin';
let activityLog: MockActivity[] = [];
let activitySeq = 0;

function seedActivity(): MockActivity[] {
  const seed: Omit<MockActivity, 'id'>[] = [
    { occurredAt: daysFromLoad(-0.01), actor: MOCK_ACTOR, action: 'Updated configuration', application: 'production-gateway', environment: 'production', target: 'MAX_DB_CONNECTIONS', targetType: 'configuration' },
    { occurredAt: daysFromLoad(-0.2), actor: MOCK_ACTOR, action: 'Added secret version', application: 'auth-provider-security', environment: 'staging', target: 'JWT_SIGNING_SECRET', targetType: 'secret' },
    { occurredAt: daysFromLoad(-1.5), actor: 'ci-deploy', action: 'Updated global configuration', application: null, environment: null, target: 'LogStream:Url', targetType: 'configuration' },
    { occurredAt: daysFromLoad(-4), actor: MOCK_ACTOR, action: 'Created application', application: 'auth-provider-security', environment: null, target: null, targetType: null },
  ];
  return seed.map((e, i) => ({ id: `seed-${i}`, ...e }));
}
activityLog = seedActivity();

/** Human-readable audit entry for a successful mutation, mirroring what the audit log will record. */
function describeMutation(method: string, path: string, body: any): Omit<MockActivity, 'id' | 'occurredAt' | 'actor'> | null {
  const verb = method === 'POST' ? 'Created' : method === 'PUT' ? 'Updated' : method === 'DELETE' ? 'Deleted' : null;
  if (!verb) return null;
  const d = (s: string) => decodeURIComponent(s);
  let m: RegExpMatchArray | null;
  if (path === '/applications') return { action: 'Created application', application: body?.slug ?? null, environment: null, target: null, targetType: null };
  if ((m = path.match(/^\/applications\/([^/]+)$/))) return { action: `${verb} application`, application: d(m[1]), environment: null, target: null, targetType: null };
  if ((m = path.match(/^\/applications\/([^/]+)\/rotate-key$/))) return { action: 'Rotated API key', application: d(m[1]), environment: null, target: null, targetType: null };
  if ((m = path.match(/^\/applications\/([^/]+)\/environments(?:\/([^/]+))?$/))) return { action: `${m[2] ? 'Deleted' : 'Created'} environment`, application: d(m[1]), environment: m[2] ? d(m[2]) : body?.slug ?? null, target: null, targetType: null };
  if ((m = path.match(/^\/applications\/([^/]+)\/secrets\/([^/]+)\/values$/))) return { action: 'Added secret version', application: d(m[1]), environment: body?.environmentSlug ?? null, target: d(m[2]), targetType: 'secret' };
  if ((m = path.match(/^\/applications\/([^/]+)\/secrets(?:\/([^/]+))?$/))) return { action: `${verb} secret`, application: d(m[1]), environment: null, target: m[2] ? d(m[2]) : body?.name ?? null, targetType: 'secret' };
  if ((m = path.match(/^\/applications\/([^/]+)\/configurations(?:\/([^/]+)\/([^/]+))?$/))) return { action: `${verb} configuration`, application: d(m[1]), environment: m[2] ? d(m[2]) : body?.environmentSlug ?? null, target: m[3] ? d(m[3]) : body?.key ?? null, targetType: 'configuration' };
  if ((m = path.match(/^\/global\/configurations(?:\/([^/]+)\/([^/]+))?$/))) return { action: `${verb} global configuration`, application: null, environment: m[1] ? d(m[1]) : body?.environmentSlug ?? null, target: m[2] ? d(m[2]) : body?.key ?? null, targetType: 'configuration' };
  if ((m = path.match(/^\/global\/secrets\/([^/]+)\/values$/))) return { action: 'Added global secret version', application: null, environment: body?.environmentSlug ?? null, target: d(m[1]), targetType: 'secret' };
  if ((m = path.match(/^\/global\/secrets(?:\/([^/]+))?$/))) return { action: `${verb} global secret`, application: null, environment: null, target: m[1] ? d(m[1]) : body?.name ?? null, targetType: 'secret' };
  return null;
}

function recordActivity(method: string, path: string, body: any) {
  const entry = describeMutation(method, path, body);
  if (!entry) return;
  activityLog.unshift({ id: `act-${++activitySeq}`, occurredAt: new Date().toISOString(), actor: MOCK_ACTOR, ...entry });
  activityLog = activityLog.slice(0, 50);
}

const maxIso = (...values: (string | null | undefined)[]): string | null => {
  let best: number | null = null;
  for (const v of values) {
    if (!v) continue;
    const t = new Date(v).getTime();
    if (!Number.isNaN(t) && (best === null || t > best)) best = t;
  }
  return best === null ? null : new Date(best).toISOString();
};

type SecretState =
  | { kind: 'secret-expired'; dueAt: string | null }
  | { kind: 'secret-no-valid-version' }
  | { kind: 'secret-expiring'; dueAt: string }
  | { kind: 'ok'; current: any };

/** Mirrors the API rules for a secret's versions in one environment. */
function evaluateVersions(versions: any[], now: number, expiringWithinDays: number): SecretState {
  const t = (v: string | null | undefined) => (v ? new Date(v).getTime() : null);
  const valid = versions
    .filter((v) => v.isEnabled && (t(v.notBefore) ?? -Infinity) <= now && (t(v.expiresAt) ?? Infinity) > now)
    .sort((a, b) => b.version - a.version);
  if (valid.length === 0) {
    const expired = versions.filter((v) => v.isEnabled && (t(v.expiresAt) ?? Infinity) <= now);
    return expired.length > 0
      ? { kind: 'secret-expired', dueAt: maxIso(...expired.map((v) => v.expiresAt)) }
      : { kind: 'secret-no-valid-version' };
  }
  const current = valid[0];
  const exp = t(current.expiresAt);
  if (exp !== null && exp - now <= expiringWithinDays * DAY) {
    return { kind: 'secret-expiring', dueAt: current.expiresAt };
  }
  return { kind: 'ok', current };
}

const SEVERITY: Record<string, 'error' | 'warning' | 'info'> = {
  'secret-expired': 'error',
  'secret-no-valid-version': 'error',
  'secret-expiring': 'warning',
  'consumer-stale': 'warning',
  'rotation-due': 'warning',
  'consumer-never-seen': 'info',
  'config-empty-value': 'info',
};

function buildDashboard(expiringWithinDays: number, staleAfterDays: number) {
  const now = Date.now();
  const attention: any[] = [];
  const add = (kind: string, fields: Record<string, unknown>) =>
    attention.push({ kind, severity: SEVERITY[kind], application: null, environment: null, target: null, dueAt: null, lastSeenAt: null, ...fields });

  const evaluateSecret = (application: string | null, environment: string | null, secret: any, versions: any[]) => {
    const state = evaluateVersions(versions, now, expiringWithinDays);
    const base = { application, environment, target: secret.name };
    if (state.kind === 'ok') {
      const interval = Number(secret.rotationIntervalDays);
      if (interval > 0 && state.current.createdAt) {
        const due = new Date(state.current.createdAt).getTime() + interval * DAY;
        if (due <= now) add('rotation-due', { ...base, dueAt: new Date(due).toISOString() });
      }
    } else if (state.kind === 'secret-no-valid-version') {
      add(state.kind, base);
    } else {
      add(state.kind, { ...base, dueAt: state.dueAt });
    }
  };

  const apps = applications.map((app: any) => {
    const appEnvs: any[] = environments[app.slug] || [];
    const appSecrets: any[] = secrets[app.slug] || [];
    const appConfigs: any[] = configurations[app.slug] || [];

    const envs = appEnvs.map((env: any) => {
      const envConfigs = appConfigs.filter((c) => c.environmentSlug === env.slug);
      const envSecrets = appSecrets.filter((s) => (secretVersions[`${app.slug}:${s.name}:${env.slug}`] || []).length > 0);
      const envVersions = envSecrets.flatMap((s) => secretVersions[`${app.slug}:${s.name}:${env.slug}`] || []);
      const lastSeenAt = MOCK_LAST_SEEN[`${app.slug}:${env.slug}`] ?? null;

      envSecrets.forEach((s) => evaluateSecret(app.slug, env.slug, s, secretVersions[`${app.slug}:${s.name}:${env.slug}`]));
      envConfigs
        .filter((c) => !String(c.value ?? '').trim())
        .forEach((c) => add('config-empty-value', { application: app.slug, environment: env.slug, target: c.key }));
      if (lastSeenAt === null) {
        if (envSecrets.length > 0 || envConfigs.length > 0) {
          add('consumer-never-seen', { application: app.slug, environment: env.slug });
        }
      } else if (now - new Date(lastSeenAt).getTime() >= staleAfterDays * DAY) {
        add('consumer-stale', { application: app.slug, environment: env.slug, lastSeenAt });
      }

      return {
        slug: env.slug,
        name: env.name || env.slug,
        secretCount: envSecrets.length,
        configurationCount: envConfigs.length,
        lastChangedAt: maxIso(
          ...envConfigs.map((c) => c.updatedAt),
          ...envVersions.map((v) => v.updatedAt ?? v.createdAt)
        ),
        lastSeenAt,
      };
    });

    return {
      slug: app.slug,
      name: app.name,
      inheritGlobals: app.inheritGlobals !== false,
      environments: envs,
      secretCount: appSecrets.length,
      configurationCount: appConfigs.length,
      lastChangedAt: maxIso(
        app.createdAt,
        ...appSecrets.map((s) => s.updatedAt),
        ...envs.map((e) => e.lastChangedAt)
      ),
      lastSeenAt: maxIso(...envs.map((e) => e.lastSeenAt)),
    };
  });

  globalSecrets.forEach((s: any) => {
    Object.keys(globalSecretVersions)
      .filter((k) => k.startsWith(`${s.name}:`))
      .forEach((k) => {
        const env = k.slice(s.name.length + 1);
        evaluateSecret(null, env === '*' ? null : env, s, globalSecretVersions[k]);
      });
  });
  globalConfigurations
    .filter((c: any) => !String(c.value ?? '').trim())
    .forEach((c: any) =>
      add('config-empty-value', { environment: c.environmentSlug === '*' ? null : c.environmentSlug, target: c.key })
    );

  return {
    generatedAt: new Date(now).toISOString(),
    totals: {
      applications: apps.length,
      environments: apps.reduce((n, a) => n + a.environments.length, 0),
      secrets: apps.reduce((n, a) => n + a.secretCount, 0),
      configurations: apps.reduce((n, a) => n + a.configurationCount, 0),
    },
    applications: apps,
    global: {
      secretCount: globalSecrets.length,
      configurationCount: globalConfigurations.length,
      lastChangedAt: maxIso(
        ...globalConfigurations.map((c: any) => c.updatedAt),
        ...globalSecrets.map((s: any) => s.updatedAt),
        ...Object.values(globalSecretVersions).flat().map((v: any) => v.createdAt)
      ),
    },
    // Feature flags aren't in the mock yet (guibranco/grimoire-api#90).
    featureFlags: null,
    recentActivity: activityLog.slice(0, 20),
    attention,
  };
}

const parseDays = (raw: unknown, fallback: number, min: number) => {
  const n = Number(raw);
  return raw === undefined || raw === null || raw === '' || !Number.isInteger(n) ? fallback : Math.max(min, Math.min(3650, n));
};

// Custom Axios Adapter
export async function mockApiAdapter(config: AxiosRequestConfig): Promise<AxiosResponse> {
  const response = await handleMockRequest(config);
  const method = (config.method || 'GET').toUpperCase();
  if (method !== 'GET' && response.status >= 200 && response.status < 300) {
    const path = new URL(
      (config.url || '').replace(/^(https?:\/\/[^\/]+)?\/?/, '/').replace(/^\/management\//, '/'),
      'http://localhost'
    ).pathname;
    let body: any = config.data;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    recordActivity(method, path, body ?? {});
  }
  return response;
}

function handleMockRequest(config: AxiosRequestConfig): Promise<AxiosResponse> {
  // Parse clean path
  let path = config.url || '';
  if (config.baseURL && path.startsWith(config.baseURL)) {
    path = path.substring(config.baseURL.length);
  }
  
  // Normalize leading slash and remove domain or /management prefix if any
  path = path.replace(/^(https?:\/\/[^\/]+)?\/?/, '/');
  if (path.startsWith('/management/')) {
    path = path.substring('/management'.length);
  }

  const method = (config.method || 'GET').toUpperCase();
  
  // Extract query parameters
  const urlObj = new URL(path, 'http://localhost');
  const cleanPath = urlObj.pathname;
  const searchParams = urlObj.searchParams;

  // Safe parse request payloads (JSON strings or objects)
  let body: any = {};
  if (config.data) {
    if (typeof config.data === 'string') {
      try {
        body = JSON.parse(config.data);
      } catch (e) {
        body = config.data;
      }
    } else {
      body = config.data;
    }
  }

  // --- Router for patterns ---

  // 0. GET /version or /health
  if ((cleanPath === '/version' || cleanPath === '/health') && method === 'GET') {
    return makeResponse(200, { status: 'Healthy', version: '1.2.0-mock' }, config);
  }

  // GET /dashboard?expiringWithinDays=&staleAfterDays=
  if (cleanPath === '/dashboard' && method === 'GET') {
    const expiring = parseDays(searchParams.get('expiringWithinDays') ?? config.params?.expiringWithinDays, 14, 0);
    const stale = parseDays(searchParams.get('staleAfterDays') ?? config.params?.staleAfterDays, 7, 1);
    return makeResponse(200, buildDashboard(expiring, stale), config);
  }

  // 1. GET /applications
  if (cleanPath === '/applications' && method === 'GET') {
    return makeResponse(200, applications, config);
  }

  // 2. POST /applications
  if (cleanPath === '/applications' && method === 'POST') {
    const newApp = {
      name: body.name || 'New App',
      slug: body.slug || (body.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      description: body.description || '',
      inheritGlobals: body.inheritGlobals !== undefined ? Boolean(body.inheritGlobals) : true,
      createdAt: new Date().toISOString()
    };
    applications.push(newApp);
    saveStored('applications', applications);
    
    // Seed default environments
    environments[newApp.slug] = [
      { name: "Production", slug: "production" },
      { name: "Staging", slug: "staging" }
    ];
    saveStored('environments', environments);

    const plainApiKey = `grm_sec_key_${Math.random().toString(36).substring(2, 12)}`;
    return makeResponse(201, { ...newApp, plainApiKey }, config);
  }

  // 3. GET /applications/:appSlug
  let match = cleanPath.match(/^\/applications\/([^\/]+)$/);
  if (match && method === 'GET') {
    const slug = match[1];
    const app = applications.find(a => a.slug === slug);
    if (!app) {
      return makeResponse(404, { message: `Application ${slug} not found` }, config);
    }
    return makeResponse(200, app, config);
  }

  // 3b. PUT /applications/:appSlug
  if (match && method === 'PUT') {
    const slug = match[1];
    const app = applications.find(a => a.slug === slug);
    if (!app) {
      return makeResponse(404, { message: `Application ${slug} not found` }, config);
    }
    if (body.name !== undefined) app.name = body.name;
    if (body.description !== undefined) app.description = body.description;
    if (body.inheritGlobals !== undefined) app.inheritGlobals = Boolean(body.inheritGlobals);
    saveStored('applications', applications);
    return makeResponse(200, app, config);
  }

  // 4. DELETE /applications/:appSlug
  if (match && method === 'DELETE') {
    const slug = match[1];
    const index = applications.findIndex(a => a.slug === slug);
    if (index === -1) {
      return makeResponse(404, { message: `Application ${slug} not found` }, config);
    }
    applications.splice(index, 1);
    saveStored('applications', applications);
    
    delete environments[slug];
    delete secrets[slug];
    delete configurations[slug];
    
    saveStored('environments', environments);
    saveStored('secrets', secrets);
    saveStored('configurations', configurations);

    return makeResponse(200, { message: `Application ${slug} deleted successfully` }, config);
  }

  // 5. POST /applications/:appSlug/rotate-key
  match = cleanPath.match(/^\/applications\/([^\/]+)\/rotate-key$/);
  if (match && method === 'POST') {
    const newKey = `grm_sec_key_${Math.random().toString(36).substring(2, 12)}`;
    return makeResponse(200, { plainApiKey: newKey }, config);
  }

  // 6. GET /applications/:appSlug/environments
  match = cleanPath.match(/^\/applications\/([^\/]+)\/environments$/);
  if (match && method === 'GET') {
    const slug = match[1];
    const appEnvs = environments[slug] || [];
    return makeResponse(200, appEnvs, config);
  }

  // 7. POST /applications/:appSlug/environments
  if (match && method === 'POST') {
    const slug = match[1];
    if (!environments[slug]) {
      environments[slug] = [];
    }
    const newEnv = {
      name: body.name || 'New Environment',
      slug: body.slug || (body.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    };
    environments[slug].push(newEnv);
    saveStored('environments', environments);
    return makeResponse(201, newEnv, config);
  }

  // 7b. DELETE /applications/:appSlug/environments/:envSlug
  match = cleanPath.match(/^\/applications\/([^\/]+)\/environments\/([^\/]+)$/);
  if (match && method === 'DELETE') {
    const appSlug = match[1];
    const envSlug = match[2];
    const appEnvs = environments[appSlug] || [];
    const index = appEnvs.findIndex(e => e.slug === envSlug);
    if (index === -1) {
      return makeResponse(404, { message: `Environment ${envSlug} not found` }, config);
    }
    appEnvs.splice(index, 1);
    saveStored('environments', environments);

    if (configurations[appSlug]) {
      configurations[appSlug] = configurations[appSlug].filter((c: any) => c.environmentSlug !== envSlug);
      saveStored('configurations', configurations);
    }

    return makeResponse(200, { message: `Environment ${envSlug} deleted successfully` }, config);
  }

  // 8. GET /applications/:appSlug/secrets
  match = cleanPath.match(/^\/applications\/([^\/]+)\/secrets$/);
  if (match && method === 'GET') {
    const slug = match[1];
    const appSecrets = (secrets[slug] || []).map(sanitizeSecretMetadata);
    return makeResponse(200, appSecrets, config);
  }

  // 9. POST /applications/:appSlug/secrets
  if (match && method === 'POST') {
    const slug = match[1];
    if (!secrets[slug]) {
      secrets[slug] = [];
    }
    const newSecretName = body.name || '';
    const existingIndex = secrets[slug].findIndex(s => s.name === newSecretName);
    const nowIso = new Date().toISOString();
    const newSecret = {
      id: existingIndex !== -1 ? secrets[slug][existingIndex].id : `sec-${Date.now()}`,
      name: newSecretName,
      description: body.description || '',
      createdAt: existingIndex !== -1 ? secrets[slug][existingIndex].createdAt : nowIso,
      updatedAt: nowIso
    };
    if (existingIndex !== -1) {
      secrets[slug][existingIndex] = newSecret;
    } else {
      secrets[slug].push(newSecret);
    }
    saveStored('secrets', secrets);
    return makeResponse(201, sanitizeSecretMetadata(newSecret), config);
  }

  // 10. POST /applications/:appSlug/secrets/:secretName/values
  match = cleanPath.match(/^\/applications\/([^\/]+)\/secrets\/([^\/]+)\/values$/);
  if (match && method === 'POST') {
    const appSlug = match[1];
    const secretName = decodeURIComponent(match[2]);
    const appSecrets = secrets[appSlug] || [];
    const secret = appSecrets.find(s => s.name === secretName);
    
    if (!secret) {
      return makeResponse(404, { message: `Secret ${secretName} not found` }, config);
    }

    const postedValues = Array.isArray(body) ? body : [body];
    
    postedValues.forEach((val: any) => {
      const historyKey = `${appSlug}:${secretName}:${val.environmentSlug}`;
      const existingVersions = secretVersions[historyKey] || [];
      const nextVersion = existingVersions.length > 0
        ? Math.max(...existingVersions.map((v: any) => v.version ?? 0)) + 1
        : 1;
      const nowIso = new Date().toISOString();

      const newVersionEntry = {
        id: `ver-${Date.now()}-${nextVersion}`,
        version: nextVersion,
        isEnabled: val.isEnabled !== undefined ? val.isEnabled : true,
        expiresAt: val.expiresAt || null,
        notBefore: val.notBefore || null,
        createdAt: nowIso,
      };

      secretVersions[historyKey] = [newVersionEntry, ...existingVersions];
      secret.updatedAt = nowIso;
    });

    saveStored('secrets', secrets);
    saveStored('secret_versions', secretVersions);
    return makeResponse(200, sanitizeSecretMetadata(secret), config);
  }

  // 10b. GET /applications/:appSlug/secrets/:secretName/versions/:envSlug
  match = cleanPath.match(/^\/applications\/([^\/]+)\/secrets\/([^\/]+)\/versions\/([^\/]+)$/);
  if (match && method === 'GET') {
    const appSlug = match[1];
    const secretName = decodeURIComponent(match[2]);
    const envSlug = decodeURIComponent(match[3]);
    const historyKey = `${appSlug}:${secretName}:${envSlug}`;
    const versions = secretVersions[historyKey] || [];
    return makeResponse(200, versions, config);
  }

  // 10c. GET /applications/:appSlug/configurations/effective?environment=
  match = cleanPath.match(/^\/applications\/([^\/]+)\/configurations\/effective$/);
  if (match && method === 'GET') {
    const appSlug = match[1];
    const app = applications.find(a => a.slug === appSlug);
    const envSlug = searchParams.get('environment') || config.params?.environment || '';
    const appConfigs = (configurations[appSlug] || []).filter(c => !envSlug || c.environmentSlug === envSlug);
    const inherits = app ? app.inheritGlobals !== false : true;

    if (!inherits) {
      const appOnly = appConfigs.map(c => ({
        key: c.key,
        value: c.value,
        valueType: c.valueType ?? 'string',
        description: c.description,
        source: 'application',
        globalEnvironmentSlug: null,
        overridesGlobal: false,
      }));
      return makeResponse(200, appOnly, config);
    }

    const globalStarMap = new Map<string, any>();
    const globalEnvMap = new Map<string, any>();
    globalConfigurations.forEach((gc: any) => {
      if (gc.environmentSlug === '*') {
        globalStarMap.set(gc.key, gc);
      } else if (envSlug && gc.environmentSlug === envSlug) {
        globalEnvMap.set(gc.key, gc);
      }
    });

    const appConfigMap = new Map<string, any>();
    appConfigs.forEach((c: any) => appConfigMap.set(c.key, c));

    const allKeys = new Set<string>([
      ...appConfigMap.keys(),
      ...globalEnvMap.keys(),
      ...globalStarMap.keys(),
    ]);

    const effective = Array.from(allKeys).map((key) => {
      const appItem = appConfigMap.get(key);
      const envGlobal = globalEnvMap.get(key);
      const starGlobal = globalStarMap.get(key);
      const hasGlobal = !!(envGlobal || starGlobal);

      if (appItem) {
        return {
          key: appItem.key,
          value: appItem.value,
          valueType: appItem.valueType ?? 'string',
          description: appItem.description,
          source: 'application',
          globalEnvironmentSlug: null,
          overridesGlobal: hasGlobal,
        };
      }

      if (envGlobal) {
        return {
          key: envGlobal.key,
          value: envGlobal.value,
          valueType: envGlobal.valueType ?? 'string',
          description: envGlobal.description,
          source: 'global',
          globalEnvironmentSlug: envGlobal.environmentSlug,
          overridesGlobal: false,
        };
      }

      return {
        key: starGlobal.key,
        value: starGlobal.value,
        valueType: starGlobal.valueType ?? 'string',
        description: starGlobal.description,
        source: 'global',
        globalEnvironmentSlug: '*',
        overridesGlobal: false,
      };
    });

    return makeResponse(200, effective, config);
  }

  // 10d. GET /applications/:appSlug/secrets/effective
  match = cleanPath.match(/^\/applications\/([^\/]+)\/secrets\/effective$/);
  if (match && method === 'GET') {
    const appSlug = match[1];
    const app = applications.find(a => a.slug === appSlug);
    const appSecrets = (secrets[appSlug] || []).map(sanitizeSecretMetadata);
    const inherits = app ? app.inheritGlobals !== false : true;

    if (!inherits) {
      return makeResponse(
        200,
        appSecrets.map((s: any) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          source: 'application',
          overridesGlobal: false,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
        })),
        config
      );
    }

    const globalMap = new Map<string, any>();
    globalSecrets.forEach((gs: any) => globalMap.set(gs.name, sanitizeSecretMetadata(gs)));

    const appMap = new Map<string, any>();
    appSecrets.forEach((s: any) => appMap.set(s.name, s));

    const allNames = new Set<string>([...appMap.keys(), ...globalMap.keys()]);
    const effective = Array.from(allNames).map((name) => {
      const appSecret = appMap.get(name);
      const globalSecret = globalMap.get(name);
      if (appSecret) {
        return {
          id: appSecret.id,
          name: appSecret.name,
          description: appSecret.description,
          source: 'application',
          overridesGlobal: !!globalSecret,
          createdAt: appSecret.createdAt,
          updatedAt: appSecret.updatedAt,
        };
      }
      return {
        id: globalSecret.id,
        name: globalSecret.name,
        description: globalSecret.description,
        source: 'global',
        overridesGlobal: false,
        createdAt: globalSecret.createdAt,
        updatedAt: globalSecret.updatedAt,
      };
    });

    return makeResponse(200, effective, config);
  }

  // 11a. GET /applications/:appSlug/secrets/:secretName
  match = cleanPath.match(/^\/applications\/([^\/]+)\/secrets\/([^\/]+)$/);
  if (match && method === 'GET') {
    const appSlug = match[1];
    const secretName = decodeURIComponent(match[2]);
    const appSecrets = secrets[appSlug] || [];
    const secret = appSecrets.find(s => s.name === secretName);
    if (!secret) {
      return makeResponse(404, { message: `Secret ${secretName} not found` }, config);
    }
    return makeResponse(200, sanitizeSecretMetadata(secret), config);
  }

  // 11b. DELETE /applications/:appSlug/secrets/:secretName
  if (match && method === 'DELETE') {
    const appSlug = match[1];
    const secretName = decodeURIComponent(match[2]);
    const appSecrets = secrets[appSlug] || [];
    const index = appSecrets.findIndex(s => s.name === secretName);
    if (index === -1) {
      return makeResponse(404, { message: `Secret ${secretName} not found` }, config);
    }
    appSecrets.splice(index, 1);
    const prefix = `${appSlug}:${secretName}:`;
    Object.keys(secretVersions).forEach((k) => {
      if (k.startsWith(prefix)) {
        delete secretVersions[k];
      }
    });
    saveStored('secrets', secrets);
    saveStored('secret_versions', secretVersions);
    return makeResponse(200, { message: `Secret ${secretName} deleted successfully` }, config);
  }

  // 12. GET /applications/:appSlug/configurations
  match = cleanPath.match(/^\/applications\/([^\/]+)\/configurations$/);
  if (match && method === 'GET') {
    const appSlug = match[1];
    const appConfigs = configurations[appSlug] || [];
    const envFilter = searchParams.get('environmentSlug') || config.params?.environmentSlug;
    
    const filtered = envFilter 
      ? appConfigs.filter(c => c.environmentSlug === envFilter)
      : appConfigs;
      
    return makeResponse(200, filtered, config);
  }

  // 13. POST /applications/:appSlug/configurations
  if (match && method === 'POST') {
    const appSlug = match[1];
    if (!configurations[appSlug]) {
      configurations[appSlug] = [];
    }
    
    const newConfigKey = body.key || '';
    const envSlug = body.environmentSlug;
    
    // Check if configuration already exists for this env
    const existingIndex = configurations[appSlug].findIndex(
      c => c.key === newConfigKey && c.environmentSlug === envSlug
    );
    
    const newConfigType = body.valueType || 'string';
    const newConfig = {
      key: newConfigKey,
      value: storedValue(newConfigType, body.value || ''),
      valueType: newConfigType,
      description: body.description || '',
      environmentSlug: envSlug,
      updatedAt: new Date().toISOString()
    };
    
    if (existingIndex !== -1) {
      configurations[appSlug][existingIndex] = newConfig;
    } else {
      configurations[appSlug].push(newConfig);
    }
    
    saveStored('configurations', configurations);
    return makeResponse(201, newConfig, config);
  }

  // 14. PUT /applications/:appSlug/configurations/:envSlug/:key
  match = cleanPath.match(/^\/applications\/([^\/]+)\/configurations\/([^\/]+)\/([^\/]+)$/);
  if (match && method === 'PUT') {
    const appSlug = match[1];
    const envSlug = decodeURIComponent(match[2]);
    const key = decodeURIComponent(match[3]);
    
    const appConfigs = configurations[appSlug] || [];
    const configItem = appConfigs.find(c => c.key === key && c.environmentSlug === envSlug);
    
    if (!configItem) {
      return makeResponse(404, { message: `Configuration for key ${key} in environment ${envSlug} not found` }, config);
    }
    
    if (body.valueType !== undefined) configItem.valueType = body.valueType;
    configItem.value =
      body.value !== undefined ? storedValue(configItem.valueType, body.value) : configItem.value;
    configItem.description = body.description !== undefined ? body.description : configItem.description;
    configItem.updatedAt = new Date().toISOString();
    
    saveStored('configurations', configurations);
    return makeResponse(200, configItem, config);
  }

  // 15. DELETE /applications/:appSlug/configurations/:envSlug/:key
  if (match && method === 'DELETE') {
    const appSlug = match[1];
    const envSlug = decodeURIComponent(match[2]);
    const key = decodeURIComponent(match[3]);
    
    const appConfigs = configurations[appSlug] || [];
    const index = appConfigs.findIndex(c => c.key === key && c.environmentSlug === envSlug);
    
    if (index === -1) {
      return makeResponse(404, { message: `Configuration for key ${key} in environment ${envSlug} not found` }, config);
    }
    
    appConfigs.splice(index, 1);
    saveStored('configurations', configurations);
    return makeResponse(200, { message: `Configuration key ${key} deleted successfully` }, config);
  }

  // 18. GET /global/environments
  if (cleanPath === '/global/environments' && method === 'GET') {
    const agg = new Map<string, { slug: string; name: string; applicationCount: number }>();
    Object.values(environments).forEach((appEnvList: any) => {
      const seenInApp = new Set<string>();
      (appEnvList || []).forEach((env: any) => {
        if (!env?.slug || seenInApp.has(env.slug)) return;
        seenInApp.add(env.slug);
        const existing = agg.get(env.slug);
        if (existing) {
          existing.applicationCount += 1;
        } else {
          agg.set(env.slug, {
            slug: env.slug,
            name: env.name || env.slug,
            applicationCount: 1,
          });
        }
      });
    });
    return makeResponse(200, Array.from(agg.values()), config);
  }

  // 19. GET /global/configurations?environment=
  if (cleanPath === '/global/configurations' && method === 'GET') {
    const envFilter = searchParams.get('environment') ?? config.params?.environment;
    const filtered = envFilter
      ? globalConfigurations.filter((c: any) => c.environmentSlug === envFilter)
      : globalConfigurations;
    return makeResponse(200, filtered, config);
  }

  // 20. POST /global/configurations
  if (cleanPath === '/global/configurations' && method === 'POST') {
    const envSlug = (body.environmentSlug || '*').trim() || '*';
    const key = body.key || '';
    const exists = globalConfigurations.some(
      (c: any) => c.environmentSlug === envSlug && c.key === key
    );
    if (exists) {
      return makeResponse(
        409,
        { message: `Global configuration "${key}" already exists in environment "${envSlug}"` },
        config
      );
    }
    const nowIso = new Date().toISOString();
    const newConfig = {
      id: `gcfg-${Date.now()}`,
      environmentSlug: envSlug,
      key,
      value: storedValue(body.valueType, body.value ?? ''),
      valueType: body.valueType || 'string',
      description: body.description || '',
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    globalConfigurations.push(newConfig);
    saveStored('global_configurations', globalConfigurations);
    return makeResponse(201, newConfig, config);
  }

  // 21. PUT & DELETE /global/configurations/:envSlug/:key
  match = cleanPath.match(/^\/global\/configurations\/([^\/]+)\/([^\/]+)$/);
  if (match && method === 'PUT') {
    const envSlug = decodeURIComponent(match[1]);
    const key = decodeURIComponent(match[2]);
    const item = globalConfigurations.find(
      (c: any) => c.environmentSlug === envSlug && c.key === key
    );
    if (!item) {
      return makeResponse(404, { message: `Global configuration ${key} not found` }, config);
    }
    if (body.valueType !== undefined) item.valueType = body.valueType;
    if (body.value !== undefined) item.value = storedValue(item.valueType, body.value);
    if (body.description !== undefined) item.description = body.description;
    item.updatedAt = new Date().toISOString();
    saveStored('global_configurations', globalConfigurations);
    return makeResponse(200, item, config);
  }

  if (match && method === 'DELETE') {
    const envSlug = decodeURIComponent(match[1]);
    const key = decodeURIComponent(match[2]);
    const index = globalConfigurations.findIndex(
      (c: any) => c.environmentSlug === envSlug && c.key === key
    );
    if (index === -1) {
      return makeResponse(404, { message: `Global configuration ${key} not found` }, config);
    }
    globalConfigurations.splice(index, 1);
    saveStored('global_configurations', globalConfigurations);
    return makeResponse(204, null, config);
  }

  // 22. GET & POST /global/secrets
  if (cleanPath === '/global/secrets' && method === 'GET') {
    return makeResponse(200, globalSecrets.map(sanitizeSecretMetadata), config);
  }

  if (cleanPath === '/global/secrets' && method === 'POST') {
    const name = body.name || '';
    const nowIso = new Date().toISOString();
    const existingIndex = globalSecrets.findIndex((s: any) => s.name === name);
    const item = {
      id: existingIndex !== -1 ? globalSecrets[existingIndex].id : `gsec-${Date.now()}`,
      name,
      description: body.description || '',
      createdAt: existingIndex !== -1 ? globalSecrets[existingIndex].createdAt : nowIso,
      updatedAt: nowIso,
    };
    if (existingIndex !== -1) {
      globalSecrets[existingIndex] = item;
    } else {
      globalSecrets.push(item);
    }
    saveStored('global_secrets', globalSecrets);
    return makeResponse(201, sanitizeSecretMetadata(item), config);
  }

  // 23. POST /global/secrets/:name/values
  match = cleanPath.match(/^\/global\/secrets\/([^\/]+)\/values$/);
  if (match && method === 'POST') {
    const secretName = decodeURIComponent(match[1]);
    const secret = globalSecrets.find((s: any) => s.name === secretName);
    if (!secret) {
      return makeResponse(404, { message: `Global secret ${secretName} not found` }, config);
    }
    const postedValues = Array.isArray(body) ? body : [body];
    postedValues.forEach((val: any) => {
      const envSlug = val.environmentSlug || '*';
      const historyKey = `${secretName}:${envSlug}`;
      const existingVersions = globalSecretVersions[historyKey] || [];
      const nextVersion = existingVersions.length > 0
        ? Math.max(...existingVersions.map((v: any) => v.version ?? 0)) + 1
        : 1;
      const nowIso = new Date().toISOString();
      const entry = {
        id: `gver-${Date.now()}-${nextVersion}`,
        version: nextVersion,
        isEnabled: val.isEnabled !== undefined ? val.isEnabled : true,
        expiresAt: val.expiresAt || null,
        notBefore: val.notBefore || null,
        createdAt: nowIso,
      };
      globalSecretVersions[historyKey] = [entry, ...existingVersions];
      secret.updatedAt = nowIso;
    });
    saveStored('global_secrets', globalSecrets);
    saveStored('global_secret_versions', globalSecretVersions);
    return makeResponse(200, sanitizeSecretMetadata(secret), config);
  }

  // 24. GET /global/secrets/:name/versions/:envSlug
  match = cleanPath.match(/^\/global\/secrets\/([^\/]+)\/versions\/([^\/]+)$/);
  if (match && method === 'GET') {
    const secretName = decodeURIComponent(match[1]);
    const envSlug = decodeURIComponent(match[2]);
    const historyKey = `${secretName}:${envSlug}`;
    return makeResponse(200, globalSecretVersions[historyKey] || [], config);
  }

  // 25. GET & DELETE /global/secrets/:name
  match = cleanPath.match(/^\/global\/secrets\/([^\/]+)$/);
  if (match && method === 'GET') {
    const secretName = decodeURIComponent(match[1]);
    const secret = globalSecrets.find((s: any) => s.name === secretName);
    if (!secret) {
      return makeResponse(404, { message: `Global secret ${secretName} not found` }, config);
    }
    return makeResponse(200, sanitizeSecretMetadata(secret), config);
  }

  if (match && method === 'DELETE') {
    const secretName = decodeURIComponent(match[1]);
    const index = globalSecrets.findIndex((s: any) => s.name === secretName);
    if (index === -1) {
      return makeResponse(404, { message: `Global secret ${secretName} not found` }, config);
    }
    globalSecrets.splice(index, 1);
    const prefix = `${secretName}:`;
    Object.keys(globalSecretVersions).forEach((k) => {
      if (k.startsWith(prefix)) delete globalSecretVersions[k];
    });
    saveStored('global_secrets', globalSecrets);
    saveStored('global_secret_versions', globalSecretVersions);
    return makeResponse(204, null, config);
  }

  // Fallback for default request
  return makeResponse(404, { message: `Mock route not found: ${method} ${path}` }, config);
}
