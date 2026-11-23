import { forgetMockFlags, handleFlagRequest, resetMockFlags } from './mockFlags';
import { forgetMockAccessTokens, handleAccessTokenRequest, handleTrustPolicyRequest, resetMockAccessTokens } from './mockAccessTokens';
import { AxiosResponse, AxiosRequestConfig } from 'axios';
import { parseArrayItems } from './configValue';
import { AUDIT_ACTION_LABELS } from './audit';
import { isValidVersion, versionsToExpire, withStatus, wouldLeaveNoValidVersion } from './secretVersions';
import { daysRemaining, secretDue, MAX_ROTATION_INTERVAL_DAYS } from './rotation';

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
      // Demo: drives `secret-rotation-due` and the rotation page (guibranco/grimoire-api#78).
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

/**
 * Demo Consumer API secret reads for the usage reports (guibranco/grimoire-api#84): one entry per
 * reading application environment and secret. REDIS_CACHE_TOKEN is never read and
 * JWT_SIGNING_SECRET hasn't been read for months, so the unused-secrets report has something to show.
 */
const MOCK_SECRET_READS: { application: string; environment: string; secret: string; isGlobal: boolean; lastReadAt: string; readCount: number }[] = [
  { application: "production-gateway", environment: "production", secret: "DATABASE_PASSWORDS", isGlobal: false, lastReadAt: daysFromLoad(-0.02), readCount: 18432 },
  { application: "production-gateway", environment: "staging", secret: "DATABASE_PASSWORDS", isGlobal: false, lastReadAt: daysFromLoad(-3), readCount: 911 },
  { application: "production-gateway", environment: "production", secret: "Sentry--Dsn", isGlobal: true, lastReadAt: daysFromLoad(-0.02), readCount: 4210 },
  { application: "auth-provider-security", environment: "production", secret: "Sentry--Dsn", isGlobal: true, lastReadAt: daysFromLoad(-10), readCount: 377 },
  { application: "auth-provider-security", environment: "production", secret: "JWT_SIGNING_SECRET", isGlobal: false, lastReadAt: daysFromLoad(-120), readCount: 52 },
];

// Storage Helpers
const isBrowser = typeof window !== 'undefined';

/** Ten random base-36 characters for a demo API key, from a cryptographic source. */
const randomKeySuffix = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => (b % 36).toString(36)).join('');

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
  return structuredClone(defaultValue); // deep clone
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
/** Configuration revisions (guibranco/grimoire-api#77), keyed by `a:{app}:{env}:{key}` or `g:{env}:{key}`. */
let configRevisions = getStored<Record<string, any[]>>('config_revisions', {});

function sanitizeSecretMetadata(secret: any) {
  if (!secret) return secret;
  const { values: _ignored, ...metadata } = secret;
  return metadata;
}

// Reset handler (useful for testing)
export function resetMockDatabase() {
  applications = structuredClone(DEFAULT_APPLICATIONS);
  environments = structuredClone(DEFAULT_ENVIRONMENTS);
  secrets = structuredClone(DEFAULT_SECRETS);
  configurations = structuredClone(DEFAULT_CONFIGURATIONS);
  secretVersions = structuredClone(DEFAULT_SECRET_VERSIONS);
  globalConfigurations = structuredClone(DEFAULT_GLOBAL_CONFIGURATIONS);
  globalSecrets = structuredClone(DEFAULT_GLOBAL_SECRETS);
  globalSecretVersions = structuredClone(DEFAULT_GLOBAL_SECRET_VERSIONS);
  configRevisions = {};
  resetMockFlags();
  resetMockAccessTokens();
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
    localStorage.removeItem('grm_mock_config_revisions');
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
  /** Readable description, as the dashboard feed shows it. */
  action: string;
  /** Audit action code (guibranco/grimoire-api#76). */
  code: string;
  application: string | null;
  environment: string | null;
  target: string | null;
  targetType: string | null;
  outcome: string;
  statusCode: number;
  ipAddress: string | null;
  userAgent: string | null;
}

const MOCK_ACTOR = 'admin';
const MOCK_AUDIT_CAP = 500;
const CODE_BY_LABEL: Record<string, string> = Object.fromEntries(
  Object.entries(AUDIT_ACTION_LABELS).map(([code, label]) => [label, code])
);
let activityLog: MockActivity[] = [];
let activitySeq = 0;

type SeedActivity = Omit<MockActivity, 'id' | 'code' | 'outcome' | 'statusCode' | 'ipAddress' | 'userAgent'> &
  Partial<Pick<MockActivity, 'outcome' | 'statusCode' | 'ipAddress' | 'userAgent'>>;

const withAuditFields = (e: SeedActivity, id: string): MockActivity => ({
  id,
  code: CODE_BY_LABEL[e.action] ?? e.action,
  outcome: 'success',
  statusCode: 200,
  ipAddress: '127.0.0.1',
  userAgent: e.actor.startsWith('app:') ? 'Grimoire.Consumer/1.4.0' : 'grimoire-ui',
  ...e,
});

function seedActivity(): MockActivity[] {
  const seed: SeedActivity[] = [
    { occurredAt: daysFromLoad(-0.005), actor: 'app:production-gateway', action: 'Read secret', application: 'production-gateway', environment: 'production', target: 'DATABASE_PASSWORDS', targetType: 'secret' },
    { occurredAt: daysFromLoad(-0.006), actor: 'app:production-gateway', action: 'Read configuration', application: 'production-gateway', environment: 'production', target: null, targetType: 'configuration' },
    { occurredAt: daysFromLoad(-0.01), actor: MOCK_ACTOR, action: 'Updated configuration', application: 'production-gateway', environment: 'production', target: 'MAX_DB_CONNECTIONS', targetType: 'configuration' },
    { occurredAt: daysFromLoad(-0.05), actor: 'app:auth-provider-security', action: 'Read secret', application: 'auth-provider-security', environment: 'staging', target: 'OAUTH_CLIENT_SECRET', targetType: 'secret', outcome: 'notfound', statusCode: 404 },
    { occurredAt: daysFromLoad(-0.1), actor: 'anonymous', action: 'Rejected unauthenticated request', application: null, environment: null, target: 'GET /consumer/secrets/DATABASE_PASSWORDS', targetType: null, outcome: 'forbidden', statusCode: 401, ipAddress: '203.0.113.7', userAgent: 'curl/8.5.0' },
    { occurredAt: daysFromLoad(-0.2), actor: MOCK_ACTOR, action: 'Added secret version', application: 'auth-provider-security', environment: 'staging', target: 'JWT_SIGNING_SECRET', targetType: 'secret', statusCode: 201 },
    { occurredAt: daysFromLoad(-1.5), actor: 'ci-deploy', action: 'Updated global configuration', application: null, environment: null, target: 'LogStream:Url', targetType: 'configuration' },
    { occurredAt: daysFromLoad(-4), actor: MOCK_ACTOR, action: 'Created application', application: 'auth-provider-security', environment: null, target: 'Auth Provider Security', targetType: 'application', statusCode: 201 },
  ];
  return seed.map((e, i) => withAuditFields(e, `seed-${i}`));
}
activityLog = seedActivity();

type MutationEntry = Omit<SeedActivity, 'occurredAt' | 'actor'>;
type MutationRule = {
  methods: readonly string[];
  pattern: RegExp;
  describe: (m: string[], verb: string, body: any) => MutationEntry;
};

const decode = (s: string) => decodeURIComponent(s);
/** Path segment, or the body field when the segment is absent (e.g. POST to a collection). */
const segOr = (segment: string | undefined, fallback: unknown) => (segment ? decode(segment) : (fallback as string) ?? null);
const entry = (
  action: string,
  application: string | null,
  environment: string | null,
  target: string | null,
  targetType: string | null
): MutationEntry => ({ action, application, environment, target, targetType });

const WRITE = ['POST', 'PUT', 'DELETE'] as const;
const VERBS: Record<string, string> = { POST: 'Created', PUT: 'Updated', DELETE: 'Deleted', PATCH: 'Updated' };

/** First matching rule wins, so specific paths come before the collections they belong to. */
const MUTATION_RULES: MutationRule[] = [
  { methods: ['PATCH'], pattern: /^\/applications\/([^/]+)\/secrets\/([^/]+)\/versions\/([^/]+)\/\d+$/, describe: (m) => entry('Updated secret version', decode(m[1]), decode(m[3]), decode(m[2]), 'secret') },
  { methods: ['PATCH'], pattern: /^\/global\/secrets\/([^/]+)\/versions\/([^/]+)\/\d+$/, describe: (m) => entry('Updated global secret version', null, decode(m[2]), decode(m[1]), 'secret') },
  { methods: ['PATCH'], pattern: /^\/applications\/([^/]+)\/secrets\/([^/]+)$/, describe: (m) => entry('Updated secret', decode(m[1]), null, decode(m[2]), 'secret') },
  { methods: ['PATCH'], pattern: /^\/global\/secrets\/([^/]+)$/, describe: (m) => entry('Updated global secret', null, null, decode(m[1]), 'secret') },
  { methods: ['POST'], pattern: /^\/secrets\/expiring\/notify$/, describe: () => entry('Sent rotation reminders', null, null, null, null) },
  { methods: ['POST'], pattern: /^\/applications\/([^/]+)\/configurations\/([^/]+)\/([^/]+)\/rollback\/\d+$/, describe: (m) => entry('Rolled back configuration', decode(m[1]), decode(m[2]), decode(m[3]), 'configuration') },
  { methods: ['POST'], pattern: /^\/global\/configurations\/([^/]+)\/([^/]+)\/rollback\/\d+$/, describe: (m) => entry('Rolled back global configuration', null, decode(m[1]), decode(m[2]), 'configuration') },
  { methods: ['POST'], pattern: /^\/applications\/([^/]+)\/secrets\/([^/]+)\/versions\/([^/]+)\/\d+\/rollback$/, describe: (m) => entry('Rolled back secret', decode(m[1]), decode(m[3]), decode(m[2]), 'secret') },
  { methods: ['POST'], pattern: /^\/global\/secrets\/([^/]+)\/versions\/([^/]+)\/\d+\/rollback$/, describe: (m) => entry('Rolled back global secret', null, decode(m[2]), decode(m[1]), 'secret') },
  { methods: ['POST'], pattern: /^\/applications\/([^/]+)\/feature-flags\/([^/]+)\/environments\/([^/]+)\/toggle$/, describe: (m) => entry('Toggled feature flag', decode(m[1]), decode(m[3]), decode(m[2]), 'feature-flag') },
  { methods: ['PUT'], pattern: /^\/applications\/([^/]+)\/feature-flags\/([^/]+)\/environments\/([^/]+)$/, describe: (m) => entry('Updated feature flag targeting', decode(m[1]), decode(m[3]), decode(m[2]), 'feature-flag') },
  { methods: WRITE, pattern: /^\/applications\/([^/]+)\/feature-flags(?:\/([^/]+))?$/, describe: (m, verb, body) => entry(`${verb} feature flag`, decode(m[1]), null, segOr(m[2], body?.key), 'feature-flag') },
  { methods: ['POST'], pattern: /^\/applications$/, describe: (_m, _v, body) => entry('Created application', body?.slug ?? null, null, null, null) },
  { methods: WRITE, pattern: /^\/applications\/([^/]+)$/, describe: (m, verb) => entry(`${verb} application`, decode(m[1]), null, null, null) },
  { methods: WRITE, pattern: /^\/applications\/([^/]+)\/rotate-key$/, describe: (m) => entry('Rotated API key', decode(m[1]), null, null, null) },
  { methods: ['POST'], pattern: /^\/applications\/([^/]+)\/access-tokens\/[^/]+\/revoke$/, describe: (m) => entry('Revoked access token', decode(m[1]), null, null, 'access-token') },
  { methods: ['POST'], pattern: /^\/applications\/([^/]+)\/access-tokens$/, describe: (m, _v, body) => entry('Created access token', decode(m[1]), null, body?.name ?? null, 'access-token') },
  { methods: ['POST'], pattern: /^\/applications\/([^/]+)\/trust-policies$/, describe: (m, _v, body) => entry('Created trust policy', decode(m[1]), null, body?.name ?? null, 'trust-policy') },
  { methods: ['PUT'], pattern: /^\/applications\/([^/]+)\/trust-policies\/[^/]+$/, describe: (m, _v, body) => entry('Updated trust policy', decode(m[1]), null, body?.name ?? null, 'trust-policy') },
  { methods: ['DELETE'], pattern: /^\/applications\/([^/]+)\/trust-policies\/[^/]+$/, describe: (m) => entry('Deleted trust policy', decode(m[1]), null, null, 'trust-policy') },
  { methods: WRITE, pattern: /^\/applications\/([^/]+)\/environments(?:\/([^/]+))?$/, describe: (m, _v, body) => entry(`${m[2] ? 'Deleted' : 'Created'} environment`, decode(m[1]), segOr(m[2], body?.slug), null, null) },
  { methods: WRITE, pattern: /^\/applications\/([^/]+)\/secrets\/([^/]+)\/values$/, describe: (m, _v, body) => entry('Added secret version', decode(m[1]), body?.environmentSlug ?? null, decode(m[2]), 'secret') },
  { methods: WRITE, pattern: /^\/applications\/([^/]+)\/secrets(?:\/([^/]+))?$/, describe: (m, verb, body) => entry(`${verb} secret`, decode(m[1]), null, segOr(m[2], body?.name), 'secret') },
  { methods: WRITE, pattern: /^\/applications\/([^/]+)\/configurations(?:\/([^/]+)\/([^/]+))?$/, describe: (m, verb, body) => entry(`${verb} configuration`, decode(m[1]), segOr(m[2], body?.environmentSlug), segOr(m[3], body?.key), 'configuration') },
  { methods: WRITE, pattern: /^\/global\/configurations(?:\/([^/]+)\/([^/]+))?$/, describe: (m, verb, body) => entry(`${verb} global configuration`, null, segOr(m[1], body?.environmentSlug), segOr(m[2], body?.key), 'configuration') },
  { methods: WRITE, pattern: /^\/global\/secrets\/([^/]+)\/values$/, describe: (m, _v, body) => entry('Added global secret version', null, body?.environmentSlug ?? null, decode(m[1]), 'secret') },
  { methods: WRITE, pattern: /^\/global\/secrets(?:\/([^/]+))?$/, describe: (m, verb, body) => entry(`${verb} global secret`, null, null, segOr(m[1], body?.name), 'secret') },
];

/** Human-readable audit entry for a successful mutation, mirroring what the audit log will record. */
function describeMutation(method: string, path: string, body: any): MutationEntry | null {
  for (const rule of MUTATION_RULES) {
    if (!rule.methods.includes(method)) continue;
    const m = rule.pattern.exec(path);
    if (m) return rule.describe(m, VERBS[method], body);
  }
  return null;
}

function recordActivity(method: string, path: string, body: any) {
  const entry = describeMutation(method, path, body);
  if (!entry) return;
  const statusCode = method === 'POST' ? 201 : method === 'DELETE' ? 204 : 200;
  activityLog.unshift(
    withAuditFields({ occurredAt: new Date().toISOString(), actor: MOCK_ACTOR, statusCode, ...entry }, `act-${++activitySeq}`)
  );
  activityLog = activityLog.slice(0, MOCK_AUDIT_CAP);
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

const SEVERITY: Record<string, 'error' | 'warning' | 'info'> = {
  'secret-expired': 'error',
  'secret-no-valid-version': 'error',
  'secret-expiring': 'warning',
  'consumer-stale': 'warning',
  'secret-rotation-due': 'warning',
  'consumer-never-seen': 'info',
  'config-empty-value': 'info',
};

function buildDashboard(expiringWithinDays: number, staleAfterDays: number) {
  const now = Date.now();
  const attention: any[] = [];
  const add = (kind: string, fields: Record<string, unknown>) =>
    attention.push({ kind, severity: SEVERITY[kind], application: null, environment: null, target: null, dueAt: null, lastSeenAt: null, ...fields });

  /** Mirrors the API dashboard rules, with expiry and rotation from `secretDue`. */
  const evaluateSecret = (application: string | null, environment: string | null, secret: any, versions: any[]) => {
    const base = { application, environment, target: secret.name };
    const due = secretDue(versions, secret.rotationIntervalDays, now);
    if (versions.some((v) => isValidVersion(v, now))) {
      if (due && new Date(due.dueAt).getTime() <= now + expiringWithinDays * DAY) {
        add(due.reason === 'rotation' ? 'secret-rotation-due' : 'secret-expiring', { ...base, dueAt: due.dueAt });
      }
    } else if (due?.reason === 'expired') {
      add('secret-expired', { ...base, dueAt: due.dueAt });
    } else {
      add('secret-no-valid-version', base);
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
    recentActivity: activityLog
      .filter((e) => !e.code.endsWith('.read') && e.code !== 'auth.failed')
      .slice(0, 20)
      .map(({ id, occurredAt, actor, action, code, application, environment, target, targetType }) => ({
        id, occurredAt, actor, action, code, application, environment, target, targetType,
      })),
    attention,
  };
}

type MockSearchHit = {
  type: string;
  name: string;
  application: string | null;
  environments: string[];
  description: string | null;
  valueType: string | null;
};

const SEARCH_TYPE_ORDER = ['application', 'secret', 'configuration', 'global-secret', 'global-configuration'];

/** Environment slugs, sorted with `*` (all environments) first. */
const sortSearchEnvs = (envs: Iterable<string>) =>
  [...new Set(envs)].sort((a, b) => {
    if (a === b) return 0;
    if (a === '*') return -1;
    if (b === '*') return 1;
    return a.localeCompare(b);
  });

/** 0 exact, 1 prefix, 2 contains; `null` when `value` doesn't contain `needle`. */
const rateSearchMatch = (needle: string, value: string | null | undefined): number | null => {
  const v = (value ?? '').toLowerCase();
  if (v === needle) return 0;
  if (v.startsWith(needle)) return 1;
  if (v.includes(needle)) return 2;
  return null;
};

const scoreSearchHit = (needle: string, hit: MockSearchHit): number | null => {
  const scores = [rateSearchMatch(needle, hit.name)];
  if (hit.type === 'application') scores.push(rateSearchMatch(needle, hit.application));
  const best = scores.filter((s): s is number => s !== null);
  if (best.length) return Math.min(...best);
  return hit.description?.toLowerCase().includes(needle) ? 3 : null;
};

/** Environments of versioned secrets, from `prefix<env>` keys holding at least one version. */
const versionedEnvs = (versions: Record<string, any[]>, prefix: string) =>
  Object.keys(versions)
    .filter((k) => k.startsWith(prefix) && (versions[k] ?? []).length > 0)
    .map((k) => k.slice(prefix.length));

/** Groups configuration rows by key into one hit per key, listing their environments. */
const groupConfigHits = (rows: any[], type: string, application: string | null): MockSearchHit[] => {
  const byKey = new Map<string, any[]>();
  for (const row of rows) byKey.set(row.key, [...(byKey.get(row.key) ?? []), row]);
  return [...byKey].map(([key, group]) => ({
    type,
    name: key,
    application,
    environments: sortSearchEnvs(group.map((r) => r.environmentSlug)),
    description: group.find((r) => r.description)?.description ?? null,
    valueType: group[0].valueType ?? 'string',
  }));
};

function collectSearchHits(matches: (...values: (string | null | undefined)[]) => boolean): MockSearchHit[] {
  const hits: MockSearchHit[] = (applications as any[])
    .filter((app) => matches(app.name, app.slug, app.description))
    .map((app) => ({ type: 'application', name: app.name, application: app.slug, environments: [], description: app.description || null, valueType: null }));

  for (const [appSlug, list] of Object.entries(secrets as Record<string, any[]>)) {
    for (const s of list.filter((x) => matches(x.name, x.description))) {
      const envs = versionedEnvs(secretVersions, `${appSlug}:${s.name}:`);
      hits.push({ type: 'secret', name: s.name, application: appSlug, environments: sortSearchEnvs(envs), description: s.description || null, valueType: null });
    }
  }

  for (const [appSlug, list] of Object.entries(configurations as Record<string, any[]>)) {
    hits.push(...groupConfigHits(list.filter((c) => matches(c.key, c.description)), 'configuration', appSlug));
  }

  for (const s of (globalSecrets as any[]).filter((x) => matches(x.name, x.description))) {
    const envs = versionedEnvs(globalSecretVersions, `${s.name}:`);
    hits.push({ type: 'global-secret', name: s.name, application: null, environments: sortSearchEnvs(envs), description: s.description || null, valueType: null });
  }

  hits.push(
    ...groupConfigHits((globalConfigurations as any[]).filter((c) => matches(c.key, c.description)), 'global-configuration', null)
  );
  return hits;
}

/**
 * Mirrors GET /management/search (guibranco/grimoire-api#105): names, keys, slugs and
 * descriptions only — values are never matched or returned.
 */
function buildSearch(query: string, limit: number) {
  const term = query.trim();
  const needle = term.toLowerCase();
  const matches = (...values: (string | null | undefined)[]) => values.some((v) => !!v && v.toLowerCase().includes(needle));

  const ranked = collectSearchHits(matches)
    .map((hit) => ({ hit, score: scoreSearchHit(needle, hit) }))
    .filter((x): x is { hit: MockSearchHit; score: number } => x.score !== null)
    .sort((a, b) =>
      (a.score - b.score) ||
      (SEARCH_TYPE_ORDER.indexOf(a.hit.type) - SEARCH_TYPE_ORDER.indexOf(b.hit.type)) ||
      a.hit.name.localeCompare(b.hit.name, undefined, { sensitivity: 'base' }) ||
      String(a.hit.application ?? '').localeCompare(String(b.hit.application ?? ''))
    )
    .map((x) => x.hit);

  return { query: term, results: ranked.slice(0, limit), truncated: ranked.length > limit };
}

const MOCK_AUDIT_OUTCOMES = new Set(['success', 'notfound', 'forbidden', 'invalid', 'conflict', 'error']);

type AuditParam = (key: string) => string | null;

/** `null` when the query would be rejected with 400 by the API. */
function validAuditQuery(param: AuditParam) {
  const page = param('page') === null ? 1 : Number(param('page'));
  const pageSize = param('pageSize') === null ? 50 : Number(param('pageSize'));
  const outcome = param('outcome');
  const from = param('from') ? Date.parse(param('from')!) : null;
  const to = param('to') ? Date.parse(param('to')!) : null;
  if (!Number.isInteger(page) || page < 1) return null;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 200) return null;
  if (outcome && !MOCK_AUDIT_OUTCOMES.has(outcome)) return null;
  if (from !== null && to !== null && from > to) return null;
  return { page, pageSize, from, to };
}

function matchesAuditFilters(e: MockActivity, param: AuditParam, from: number | null, to: number | null) {
  const eq = (field: string | null, wanted: string | null) => !wanted || field === wanted;
  const action = param('action');
  const env = param('environment');
  const at = Date.parse(e.occurredAt);
  return (
    eq(e.application, param('application')) &&
    eq(e.actor, param('actor')) &&
    eq(e.target, param('target')) &&
    eq(e.outcome, param('outcome')) &&
    (!env || (e.environment ?? '').split(',').includes(env)) &&
    (!action || (action.endsWith('*') ? e.code.startsWith(action.slice(0, -1)) : e.code === action)) &&
    (param('includeReads') !== 'false' || !e.code.endsWith('.read')) &&
    (from === null || at >= from) &&
    (to === null || at <= to)
  );
}

/** Mirrors GET /management/audit (guibranco/grimoire-api#76): filters, newest first, paged. */
function buildAuditPage(param: AuditParam) {
  const query = validAuditQuery(param);
  if (!query) return null;
  const { page, pageSize, from, to } = query;
  const matching = activityLog
    .filter((e) => matchesAuditFilters(e, param, from, to))
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));

  return {
    items: matching.slice((page - 1) * pageSize, page * pageSize).map((e) => ({
      id: e.id,
      occurredAt: e.occurredAt,
      actor: e.actor,
      action: e.code,
      description: e.action,
      application: e.application,
      environment: e.environment,
      targetType: e.targetType,
      target: e.target,
      outcome: e.outcome,
      statusCode: e.statusCode,
      ipAddress: e.ipAddress,
      userAgent: e.userAgent,
    })),
    page,
    pageSize,
    totalCount: matching.length,
  };
}

/** Mirrors `previousVersionGraceDays` on POST …/values (guibranco/grimoire-api#96). */
function applyGracePeriod(existing: any[], graceDays: unknown) {
  if (typeof graceDays !== 'number' || !Number.isInteger(graceDays) || graceDays < 0) return;
  const expiresAt = new Date(Date.now() + graceDays * DAY);
  for (const v of versionsToExpire(existing, expiresAt)) v.expiresAt = expiresAt.toISOString();
}

/** Mirrors PATCH …/versions/{env}/{version}: merge, validate, guard against leaving no valid version. */
function updateMockVersion(
  store: Record<string, any[]>,
  key: string,
  version: number,
  body: any,
  searchParams: URLSearchParams,
  config: AxiosRequestConfig,
  storageKey: string
): Promise<AxiosResponse> {
  const versions = store[key] || [];
  const target = versions.find((v: any) => v.version === version);
  if (!target) return makeResponse(404, { title: 'Secret version not found.', status: 404 }, config);

  if ((body?.clearNotBefore && body?.notBefore) || (body?.clearExpiresAt && body?.expiresAt)) {
    return makeResponse(400, { title: 'One or more validation errors occurred.', status: 400 }, config);
  }
  const next = {
    isEnabled: body?.isEnabled ?? target.isEnabled,
    notBefore: body?.clearNotBefore ? null : body?.notBefore ?? target.notBefore,
    expiresAt: body?.clearExpiresAt ? null : body?.expiresAt ?? target.expiresAt,
  };
  if (next.notBefore && next.expiresAt && new Date(next.expiresAt) <= new Date(next.notBefore)) {
    return makeResponse(400, { title: 'One or more validation errors occurred.', status: 400 }, config);
  }
  const force = (searchParams.get('force') ?? String(config.params?.force ?? '')) === 'true';
  if (!force && wouldLeaveNoValidVersion(versions, version, next)) {
    return makeResponse(
      409,
      { title: 'Conflict', status: 409, detail: 'This change would leave the secret with no valid version in this environment.' },
      config
    );
  }
  Object.assign(target, next);
  saveStored(storageKey, store);
  return makeResponse(200, withStatus(versions).find((v) => v.version === version), config);
}


// ── Configuration history (guibranco/grimoire-api#77) ─────────────────────────

const revisionKey = (appSlug: string | null, envSlug: string, key: string) =>
  appSlug ? `a:${appSlug}:${envSlug}:${key}` : `g:${envSlug}:${key}`;

const revisionOf = (entry: any, revision: number, change: string, changedBy = 'admin', rolledBackFrom: number | null = null) => ({
  revision,
  change,
  value: change === 'delete' ? null : entry.value,
  valueType: entry.valueType ?? 'string',
  description: entry.description || null,
  rolledBackFrom,
  changedBy,
  changedAt: change === 'baseline' ? entry.updatedAt ?? entry.createdAt ?? new Date().toISOString() : new Date().toISOString(),
});

/** Revisions oldest first; entries that predate history get a `baseline`, like the API migration. */
function revisionsFor(k: string, current: any | undefined): any[] {
  if (!configRevisions[k] && current) configRevisions[k] = [revisionOf(current, 1, 'baseline', 'system')];
  return configRevisions[k] ?? [];
}

/** Appends a revision when value, type or description changed (or on create/delete). */
function recordConfigRevision(k: string, before: any | undefined, after: any | undefined, rolledBackFrom: number | null = null) {
  const list = revisionsFor(k, before);
  const same =
    before && after && before.value === after.value && (before.valueType ?? 'string') === (after.valueType ?? 'string') &&
    (before.description || null) === (after.description || null);
  if (same) return;
  let change = 'update';
  if (!after) change = 'delete';
  else if (rolledBackFrom !== null) change = 'rollback';
  else if (!before) change = 'create';
  list.push(revisionOf(after ?? before, list.length + 1, change, 'admin', rolledBackFrom));
  configRevisions[k] = list;
  saveStored('config_revisions', configRevisions);
}

const snapshot = (entry: any) => (entry ? { ...entry } : undefined);

function historyResponse(k: string, current: any, config: AxiosRequestConfig) {
  const list = revisionsFor(k, current);
  if (list.length === 0) return makeResponse(404, { title: 'Not Found', status: 404, detail: 'Configuration not found.' }, config);
  return makeResponse(200, [...list].reverse(), config);
}

/** Restores a revision into `entries` (creating the entry if it was deleted), recording a rollback. */
function rollbackConfig(
  k: string,
  entries: any[],
  find: (e: any) => boolean,
  create: () => any,
  revision: number,
  config: AxiosRequestConfig,
  save: () => void
) {
  const current = entries.find(find);
  const target = revisionsFor(k, current).find((r) => r.revision === revision);
  if (!target) return makeResponse(404, { title: 'Not Found', status: 404, detail: 'Revision not found.' }, config);
  if (target.value === null) {
    return makeResponse(400, { title: 'Bad Request', status: 400, detail: `Revision ${revision} deleted the key, so it has no value to restore.` }, config);
  }
  const before = snapshot(current);
  const entry = current ?? create();
  if (!current) entries.push(entry);
  entry.value = target.value;
  entry.valueType = target.valueType;
  entry.description = target.description ?? '';
  entry.updatedAt = new Date().toISOString();
  recordConfigRevision(k, before, entry, revision);
  save();
  return makeResponse(200, entry, config);
}

/** Mirrors `GET …/configurations/diff`: effective configuration of two environments, key by key. */
function buildConfigDiff(appSlug: string, from: string, to: string, includeUnchanged: boolean) {
  const left = new Map<string, any>(effectiveConfigFor(appSlug, from).map((e) => [e.key, e]));
  const right = new Map<string, any>(effectiveConfigFor(appSlug, to).map((e) => [e.key, e]));
  const side = (e: any) =>
    e ? { value: e.value, valueType: e.valueType ?? 'string', source: e.source, globalEnvironmentSlug: e.globalEnvironmentSlug ?? null } : null;
  const status = (a: any, b: any) => {
    if (!a) return 'added';
    if (!b) return 'removed';
    return a.value === b.value && (a.valueType ?? 'string') === (b.valueType ?? 'string') ? 'unchanged' : 'changed';
  };
  const keys = [...new Set([...left.keys(), ...right.keys()])].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return keys
    .map((key) => ({ key, status: status(left.get(key), right.get(key)), from: side(left.get(key)), to: side(right.get(key)) }))
    .filter((d) => includeUnchanged || d.status !== 'unchanged');
}

/** Copies a version's stored value into a new current version (the demo stores values in clear). */
function rollbackSecret(store: Record<string, any[]>, k: string, version: number, body: any, config: AxiosRequestConfig, save: () => void) {
  const versions = store[k] || [];
  const source = versions.find((v: any) => v.version === version);
  if (!source) return makeResponse(404, { title: 'Not Found', status: 404, detail: 'Secret version not found.' }, config);
  const next = Math.max(...versions.map((v: any) => v.version)) + 1;
  applyGracePeriod(versions, body?.previousVersionGraceDays);
  const created = {
    ...source,
    id: `ver-${Date.now()}`,
    version: next,
    isEnabled: true,
    expiresAt: null,
    notBefore: null,
    createdAt: new Date().toISOString(),
  };
  versions.unshift(created);
  store[k] = versions;
  save();
  const { value: _hidden, ...metadata } = withStatus(versions).find((v: any) => v.version === next) as any;
  return makeResponse(200, metadata, config);
}

/** Mirrors the API's effective configuration: application values, then the env-slug global, then `*`. */
function effectiveConfigFor(appSlug: string, envSlug: string): any[] {
  const app = applications.find(a => a.slug === appSlug);
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
    return appOnly;
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

  return effective;
}

/** PATCH a secret's description / rotation interval, validated like the API. */
function updateMockSecret(secret: any, body: any, config: AxiosRequestConfig, save: () => void) {
  if (!secret) return makeResponse(404, { title: 'Not Found', status: 404, detail: 'Secret not found.' }, config);
  const errors: Record<string, string[]> = {};
  const interval = body?.rotationIntervalDays;
  if (interval !== undefined && interval !== null && (!Number.isInteger(interval) || interval < 1 || interval > MAX_ROTATION_INTERVAL_DAYS)) {
    errors.rotationIntervalDays = [`Must be between 1 and ${MAX_ROTATION_INTERVAL_DAYS}.`];
  }
  if (body?.clearRotationInterval && interval !== undefined && interval !== null) {
    errors.rotationIntervalDays = ["Use either 'rotationIntervalDays' or 'clearRotationInterval', not both."];
  }
  if (body?.clearDescription && body?.description !== undefined && body?.description !== null) {
    errors.description = ["Use either 'description' or 'clearDescription', not both."];
  }
  if (Object.keys(errors).length > 0) {
    return makeResponse(400, { title: 'One or more validation errors occurred.', status: 400, errors }, config);
  }
  if (body?.clearDescription) secret.description = null;
  else if (typeof body?.description === 'string') secret.description = body.description;
  if (body?.clearRotationInterval) secret.rotationIntervalDays = null;
  else if (interval !== undefined && interval !== null) secret.rotationIntervalDays = interval;
  secret.updatedAt = new Date().toISOString();
  save();
  return makeResponse(200, sanitizeSecretMetadata(secret), config);
}

/** Mirrors `GET /management/secrets/expiring`: due within `withinDays`, overdue and expired always. */
function buildExpiring(withinDays: number) {
  const now = Date.now();
  const before = now + withinDays * DAY;
  const items: any[] = [];
  const push = (secret: any, application: { slug: string; name: string } | null, environment: string, versions: any[]) => {
    const due = secretDue(versions, secret.rotationIntervalDays, now);
    if (!due || new Date(due.dueAt).getTime() > before) return;
    items.push({
      application: application?.slug ?? null,
      applicationName: application?.name ?? null,
      secret: secret.name,
      environment,
      isGlobal: !application,
      version: due.version,
      reason: due.reason,
      dueAt: due.dueAt,
      daysRemaining: daysRemaining(due.dueAt, now),
      rotationIntervalDays: secret.rotationIntervalDays ?? null,
    });
  };

  applications.forEach((app: any) => {
    (secrets[app.slug] || []).forEach((secret: any) => {
      (environments[app.slug] || []).forEach((env: any) => {
        const versions = secretVersions[`${app.slug}:${secret.name}:${env.slug}`] || [];
        if (versions.length > 0) push(secret, app, env.slug, versions);
      });
    });
  });

  globalSecrets.forEach((secret: any) => {
    const keys = Object.keys(globalSecretVersions).filter((k) => k.startsWith(`${secret.name}:`));
    const wildcard = globalSecretVersions[`${secret.name}:*`] || [];
    const wildcardCovers = wildcard.some((v: any) => isValidVersion(v, now));
    keys.forEach((k) => {
      const slug = k.slice(secret.name.length + 1);
      const versions = globalSecretVersions[k] || [];
      if (versions.length === 0) return;
      // A specific slug with nothing valid falls back to "*", like consumers.
      if (slug !== '*' && wildcardCovers && !versions.some((v: any) => isValidVersion(v, now))) return;
      push(secret, null, slug, versions);
    });
  });

  return items.sort(
    (a, b) =>
      new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime() ||
      Number(a.isGlobal) - Number(b.isGlobal) ||
      String(a.application).localeCompare(String(b.application)) ||
      a.secret.localeCompare(b.secret) ||
      a.environment.localeCompare(b.environment)
  );
}

/** Reads of live secrets by live applications (the demo's deletions drop their reads). */
function liveSecretReads() {
  const appSlugs = new Set(applications.map((a: any) => a.slug));
  return MOCK_SECRET_READS.filter((r) => {
    if (!appSlugs.has(r.application)) return false;
    if (r.isGlobal) return globalSecrets.some((g: any) => g.name === r.secret);
    return (secrets[r.application] || []).some((x: any) => x.name === r.secret);
  });
}

/** Mirrors `GET /management/reports/unused-secrets`: never read first, then the longest unread. */
function buildUnusedSecrets(days: number) {
  const since = Date.now() - days * DAY;
  const reads = liveSecretReads();
  const items: any[] = [];
  const push = (application: any, secret: any) => {
    const own = reads
      .filter((r) => r.secret === secret.name && (application ? !r.isGlobal && r.application === application.slug : r.isGlobal))
      .sort((a, b) => b.lastReadAt.localeCompare(a.lastReadAt))
      .map(({ application: app, environment, lastReadAt, readCount }) => ({ application: app, environment, lastReadAt, readCount }));
    const lastReadAt = own[0]?.lastReadAt ?? null;
    if (lastReadAt && new Date(lastReadAt).getTime() >= since) return;
    items.push({
      application: application?.slug ?? null,
      applicationName: application?.name ?? null,
      secret: secret.name,
      isGlobal: !application,
      createdAt: secret.createdAt,
      lastReadAt,
      readCount: own.reduce((sum, r) => sum + r.readCount, 0),
      reads: own,
    });
  };
  applications.forEach((app: any) => (secrets[app.slug] || []).forEach((secret: any) => push(app, secret)));
  globalSecrets.forEach((secret: any) => push(null, secret));
  const rank = (i: any) => (i.lastReadAt ? new Date(i.lastReadAt).getTime() : -Infinity);
  return items.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      Number(a.isGlobal) - Number(b.isGlobal) ||
      String(a.application ?? '').localeCompare(String(b.application ?? '')) ||
      a.secret.localeCompare(b.secret)
  );
}

/** Ordinal (code unit) order, like the API's `StringComparer.Ordinal`. */
function compareOrdinal(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** Mirrors `GET /management/reports/dependencies`. */
function buildDependencies() {
  const nodes = new Map<string, any>();
  const edges: any[] = [];
  const node = (id: string, type: string, label: string, application: string | null, envs: string[] = []) =>
    nodes.set(id, { id, type, label, application, environments: [...new Set(envs)].sort(compareOrdinal) });
  const edge = (source: string, target: string, kind: string, extra: Partial<Record<string, any>> = {}) =>
    edges.push({ source, target, kind, environments: [], lastReadAt: null, readCount: null, ...extra });

  const globalSecretNames = new Set(globalSecrets.map((g: any) => g.name));
  globalSecrets.forEach((g: any) => node(`global-secret:${g.name}`, 'global-secret', g.name, null));
  const globalKeys = new Map<string, string[]>();
  globalConfigurations.forEach((c: any) => globalKeys.set(c.key, [...(globalKeys.get(c.key) ?? []), c.environmentSlug]));
  globalKeys.forEach((envs, key) => node(`global-config:${key}`, 'global-config-key', key, null, envs));

  applications.forEach((app: any) => {
    const appId = `app:${app.slug}`;
    const inherits = app.inheritGlobals !== false;
    node(appId, 'application', app.name, null);
    (secrets[app.slug] || []).forEach((secret: any) => {
      const id = `secret:${app.slug}/${secret.name}`;
      node(id, 'secret', secret.name, app.slug);
      edge(appId, id, 'owns');
      if (inherits && globalSecretNames.has(secret.name)) edge(id, `global-secret:${secret.name}`, 'overrides');
    });
    const keys = new Map<string, string[]>();
    (configurations[app.slug] || []).forEach((c: any) => keys.set(c.key, [...(keys.get(c.key) ?? []), c.environmentSlug]));
    keys.forEach((envs, key) => {
      const id = `config:${app.slug}/${key}`;
      node(id, 'config-key', key, app.slug, envs);
      edge(appId, id, 'owns');
      if (inherits && globalKeys.has(key)) edge(id, `global-config:${key}`, 'overrides');
    });
    if (inherits) {
      globalKeys.forEach((_, key) => {
        if (!keys.has(key)) edge(appId, `global-config:${key}`, 'inherits');
      });
    }
  });

  const grouped = new Map<string, typeof MOCK_SECRET_READS>();
  liveSecretReads().forEach((r) => {
    const target = r.isGlobal ? `global-secret:${r.secret}` : `secret:${r.application}/${r.secret}`;
    const k = `app:${r.application}|${target}`;
    grouped.set(k, [...(grouped.get(k) ?? []), r]);
  });
  grouped.forEach((rs, k) => {
    const [source, target] = k.split('|');
    edge(source, target, 'reads', {
      environments: [...new Set(rs.map((r) => r.environment))].sort(compareOrdinal),
      lastReadAt: rs.map((r) => r.lastReadAt).sort(compareOrdinal).at(-1),
      readCount: rs.reduce((sum, r) => sum + r.readCount, 0),
    });
  });

  const sortedNodes = [...nodes.values()].sort((a, b) => compareOrdinal(a.id, b.id));
  edges.sort(
    (a, b) => compareOrdinal(a.source, b.source) || compareOrdinal(a.target, b.target) || compareOrdinal(a.kind, b.kind)
  );
  return { generatedAt: new Date().toISOString(), nodes: sortedNodes, edges };
}

const parseDays = (raw: unknown, fallback: number, min: number) => {
  const n = Number(raw);
  return raw === undefined || raw === null || raw === '' || !Number.isInteger(n) ? fallback : Math.max(min, Math.min(3650, n));
};

/** Query string merged with axios `params` (which the URL doesn't carry). */
function withParams(query: URLSearchParams, params: unknown): URLSearchParams {
  const merged = new URLSearchParams(query);
  if (params && typeof params === 'object') {
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && !merged.has(k)) merged.set(k, String(v));
  }
  return merged;
}

// Custom Axios Adapter
export async function mockApiAdapter(config: AxiosRequestConfig): Promise<AxiosResponse> {
  const response = await handleMockRequest(config);
  const method = (config.method || 'GET').toUpperCase();
  if (method !== 'GET' && response.status >= 200 && response.status < 300) {
    const path = new URL(
      (config.url || '').replace(/^(https?:\/\/[^/]+)?\/?/, '/').replace(/^\/management\//, '/'),
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
  path = path.replace(/^(https?:\/\/[^/]+)?\/?/, '/');
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

  // Feature flags (guibranco/grimoire-api#90) live in their own module.
  const flagResponse = handleFlagRequest(
    {
      environmentsOf: (slug) => (applications.some((a: any) => a.slug === slug) ? environments[slug] || [] : null),
      globalEnvironmentSlugs: () =>
        Object.values(environments).flatMap((list: any) => (list || []).map((e: any) => e?.slug).filter(Boolean)),
    },
    method,
    cleanPath,
    body,
    withParams(searchParams, config.params)
  );
  if (flagResponse) return makeResponse(flagResponse.status, flagResponse.data, config);

  // Access tokens (guibranco/grimoire-api#75).
  const tokenResponse = handleAccessTokenRequest(
    { environmentsOf: (slug) => (applications.some((a: any) => a.slug === slug) ? environments[slug] || [] : null) },
    method,
    cleanPath,
    body
  );
  if (tokenResponse) return makeResponse(tokenResponse.status, tokenResponse.data, config);
  const policyResponse = handleTrustPolicyRequest(
    { environmentsOf: (slug) => (applications.some((a: any) => a.slug === slug) ? environments[slug] || [] : null) },
    method,
    cleanPath,
    body
  );
  if (policyResponse) return makeResponse(policyResponse.status, policyResponse.data, config);

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

  // GET /secrets/expiring?withinDays=30 (guibranco/grimoire-api#78)
  if (cleanPath === '/secrets/expiring' && method === 'GET') {
    const raw = searchParams.get('withinDays') ?? config.params?.withinDays;
    const withinDays = raw === undefined || raw === null || raw === '' ? 30 : Number(raw);
    if (!Number.isInteger(withinDays) || withinDays < 0 || withinDays > 3650) {
      return makeResponse(400, { title: 'One or more validation errors occurred.', status: 400, errors: { withinDays: ['Must be between 0 and 3650.'] } }, config);
    }
    return makeResponse(200, { generatedAt: new Date().toISOString(), withinDays, items: buildExpiring(withinDays) }, config);
  }

  // GET /reports/unused-secrets?days=90 (guibranco/grimoire-api#84)
  if (cleanPath === '/reports/unused-secrets' && method === 'GET') {
    const raw = searchParams.get('days') ?? config.params?.days;
    const days = raw === undefined || raw === null || raw === '' ? 90 : Number(raw);
    if (!Number.isInteger(days) || days < 1 || days > 3650) {
      return makeResponse(400, { title: 'One or more validation errors occurred.', status: 400, errors: { days: ['Must be between 1 and 3650.'] } }, config);
    }
    const now = Date.now();
    return makeResponse(
      200,
      { generatedAt: new Date(now).toISOString(), days, since: new Date(now - days * DAY).toISOString(), items: buildUnusedSecrets(days) },
      config
    );
  }

  // GET /reports/dependencies (guibranco/grimoire-api#84)
  if (cleanPath === '/reports/dependencies' && method === 'GET') {
    return makeResponse(200, buildDependencies(), config);
  }

  // POST /secrets/expiring/notify — the demo has no webhook, like an API without RotationReminders:WebhookUrl.
  if (cleanPath === '/secrets/expiring/notify' && method === 'POST') {
    const due = buildExpiring(30).length;
    return makeResponse(200, { due, sent: 0, alreadySent: 0, webhookConfigured: false, delivered: true }, config);
  }

  // GET /audit?application=&action=&actor=&environment=&target=&outcome=&from=&to=&includeReads=&page=&pageSize=
  if (cleanPath === '/audit' && method === 'GET') {
    const param = (key: string) => {
      const v = searchParams.get(key) ?? config.params?.[key];
      return v === undefined || v === null || v === '' ? null : String(v);
    };
    const page = buildAuditPage(param);
    return page
      ? makeResponse(200, page, config)
      : makeResponse(400, { title: 'One or more validation errors occurred.', status: 400 }, config);
  }

  // GET /search?q=&limit=
  if (cleanPath === '/search' && method === 'GET') {
    const q = String(searchParams.get('q') ?? config.params?.q ?? '').trim();
    const rawLimit = searchParams.get('limit') ?? config.params?.limit;
    const limit = rawLimit === undefined || rawLimit === null || rawLimit === '' ? 20 : Number(rawLimit);
    if (q.length < 2 || !Number.isInteger(limit) || limit < 1 || limit > 50) {
      return makeResponse(400, { title: 'One or more validation errors occurred.', status: 400 }, config);
    }
    return makeResponse(200, buildSearch(q, limit), config);
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

    const plainApiKey = `grm_sec_key_${randomKeySuffix()}`;
    return makeResponse(201, { ...newApp, plainApiKey }, config);
  }

  // 3. GET /applications/:appSlug
  let match = /^\/applications\/([^/]+)$/.exec(cleanPath);
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
    forgetMockFlags(slug);
    forgetMockAccessTokens(slug);
    
    saveStored('environments', environments);
    saveStored('secrets', secrets);
    saveStored('configurations', configurations);

    return makeResponse(200, { message: `Application ${slug} deleted successfully` }, config);
  }

  // 5. POST /applications/:appSlug/rotate-key
  match = /^\/applications\/([^/]+)\/rotate-key$/.exec(cleanPath);
  if (match && method === 'POST') {
    const newKey = `grm_sec_key_${randomKeySuffix()}`;
    return makeResponse(200, { plainApiKey: newKey }, config);
  }

  // 6. GET /applications/:appSlug/environments
  match = /^\/applications\/([^/]+)\/environments$/.exec(cleanPath);
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
  match = /^\/applications\/([^/]+)\/environments\/([^/]+)$/.exec(cleanPath);
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
  match = /^\/applications\/([^/]+)\/secrets$/.exec(cleanPath);
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
      rotationIntervalDays: body.rotationIntervalDays ?? null,
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
  match = /^\/applications\/([^/]+)\/secrets\/([^/]+)\/values$/.exec(cleanPath);
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

      applyGracePeriod(existingVersions, val.previousVersionGraceDays);
      secretVersions[historyKey] = [newVersionEntry, ...existingVersions];
      secret.updatedAt = nowIso;
    });

    saveStored('secrets', secrets);
    saveStored('secret_versions', secretVersions);
    return makeResponse(200, sanitizeSecretMetadata(secret), config);
  }

  // 10b. GET /applications/:appSlug/secrets/:secretName/versions/:envSlug
  match = /^\/applications\/([^/]+)\/secrets\/([^/]+)\/versions\/([^/]+)$/.exec(cleanPath);
  if (match && method === 'GET') {
    const appSlug = match[1];
    const secretName = decodeURIComponent(match[2]);
    const envSlug = decodeURIComponent(match[3]);
    const historyKey = `${appSlug}:${secretName}:${envSlug}`;
    const versions = secretVersions[historyKey] || [];
    return makeResponse(200, withStatus(versions), config);
  }

  // 10b2. PATCH /applications/:appSlug/secrets/:secretName/versions/:envSlug/:version
  match = /^\/applications\/([^/]+)\/secrets\/([^/]+)\/versions\/([^/]+)\/(\d+)$/.exec(cleanPath);
  if (match && method === 'PATCH') {
    const key = `${match[1]}:${decodeURIComponent(match[2])}:${decodeURIComponent(match[3])}`;
    return updateMockVersion(secretVersions, key, Number(match[4]), body, searchParams, config, 'secret_versions');
  }

  // 10c. GET /applications/:appSlug/configurations/effective?environment=
  match = /^\/applications\/([^/]+)\/configurations\/effective$/.exec(cleanPath);
  if (match && method === 'GET') {
    const envSlug = searchParams.get('environment') || config.params?.environment || '';
    return makeResponse(200, effectiveConfigFor(match[1], envSlug), config);
  }

  // 10d. GET /applications/:appSlug/secrets/effective
  match = /^\/applications\/([^/]+)\/secrets\/effective$/.exec(cleanPath);
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
  match = /^\/applications\/([^/]+)\/secrets\/([^/]+)$/.exec(cleanPath);
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

  // 11a'. PATCH /applications/:appSlug/secrets/:secretName — description and rotation interval
  if (match && method === 'PATCH') {
    const secret = (secrets[match[1]] || []).find((s: any) => s.name === decodeURIComponent(match![2]));
    return updateMockSecret(secret, body, config, () => saveStored('secrets', secrets));
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

  // Configuration history, rollback and environment diff (guibranco/grimoire-api#77)
  if (/^\/applications\/[^/]+\/configurations\/diff$/.test(cleanPath) && method === 'GET') {
    const appSlug = cleanPath.split('/')[2];
    const from = String(searchParams.get('from') ?? config.params?.from ?? '');
    const to = String(searchParams.get('to') ?? config.params?.to ?? '');
    const known = new Set((environments[appSlug] || []).map((e: any) => e.slug));
    if (!known.has(from) || !known.has(to)) {
      return makeResponse(404, { title: 'Not Found', status: 404, detail: 'Environment not found.' }, config);
    }
    const includeUnchanged = String(searchParams.get('includeUnchanged') ?? config.params?.includeUnchanged) === 'true';
    return makeResponse(200, { from, to, items: buildConfigDiff(appSlug, from, to, includeUnchanged) }, config);
  }

  match = /^\/applications\/([^/]+)\/configurations\/([^/]+)\/([^/]+)\/history$/.exec(cleanPath);
  if (match && method === 'GET') {
    const [appSlug, envSlug, key] = [match[1], decodeURIComponent(match[2]), decodeURIComponent(match[3])];
    const current = (configurations[appSlug] || []).find((c: any) => c.environmentSlug === envSlug && c.key === key);
    return historyResponse(revisionKey(appSlug, envSlug, key), current, config);
  }

  match = /^\/applications\/([^/]+)\/configurations\/([^/]+)\/([^/]+)\/rollback\/(\d+)$/.exec(cleanPath);
  if (match && method === 'POST') {
    const [appSlug, envSlug, key] = [match[1], decodeURIComponent(match[2]), decodeURIComponent(match[3])];
    configurations[appSlug] = configurations[appSlug] || [];
    return rollbackConfig(
      revisionKey(appSlug, envSlug, key),
      configurations[appSlug],
      (c) => c.environmentSlug === envSlug && c.key === key,
      () => ({ key, environmentSlug: envSlug, value: '', valueType: 'string', description: '' }),
      Number(match[4]),
      config,
      () => saveStored('configurations', configurations)
    );
  }

  match = /^\/global\/configurations\/([^/]+)\/([^/]+)\/history$/.exec(cleanPath);
  if (match && method === 'GET') {
    const [envSlug, key] = [decodeURIComponent(match[1]), decodeURIComponent(match[2])];
    const current = globalConfigurations.find((c: any) => c.environmentSlug === envSlug && c.key === key);
    return historyResponse(revisionKey(null, envSlug, key), current, config);
  }

  match = /^\/global\/configurations\/([^/]+)\/([^/]+)\/rollback\/(\d+)$/.exec(cleanPath);
  if (match && method === 'POST') {
    const [envSlug, key] = [decodeURIComponent(match[1]), decodeURIComponent(match[2])];
    return rollbackConfig(
      revisionKey(null, envSlug, key),
      globalConfigurations,
      (c) => c.environmentSlug === envSlug && c.key === key,
      () => ({ id: `gcfg-${Date.now()}`, environmentSlug: envSlug, key, createdAt: new Date().toISOString() }),
      Number(match[3]),
      config,
      () => saveStored('global_configurations', globalConfigurations)
    );
  }

  match = /^\/applications\/([^/]+)\/secrets\/([^/]+)\/versions\/([^/]+)\/(\d+)\/rollback$/.exec(cleanPath);
  if (match && method === 'POST') {
    const k = `${match[1]}:${decodeURIComponent(match[2])}:${decodeURIComponent(match[3])}`;
    return rollbackSecret(secretVersions, k, Number(match[4]), body, config, () => saveStored('secret_versions', secretVersions));
  }

  match = /^\/global\/secrets\/([^/]+)\/versions\/([^/]+)\/(\d+)\/rollback$/.exec(cleanPath);
  if (match && method === 'POST') {
    const k = `${decodeURIComponent(match[1])}:${decodeURIComponent(match[2])}`;
    return rollbackSecret(globalSecretVersions, k, Number(match[3]), body, config, () => saveStored('global_secret_versions', globalSecretVersions));
  }

  // 12. GET /applications/:appSlug/configurations
  match = /^\/applications\/([^/]+)\/configurations$/.exec(cleanPath);
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
    
    const previous = snapshot(configurations[appSlug][existingIndex]);
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
    recordConfigRevision(revisionKey(appSlug, envSlug, newConfigKey), previous, newConfig);
    
    saveStored('configurations', configurations);
    return makeResponse(201, newConfig, config);
  }

  // 14. PUT /applications/:appSlug/configurations/:envSlug/:key
  match = /^\/applications\/([^/]+)\/configurations\/([^/]+)\/([^/]+)$/.exec(cleanPath);
  if (match && method === 'PUT') {
    const appSlug = match[1];
    const envSlug = decodeURIComponent(match[2]);
    const key = decodeURIComponent(match[3]);
    
    const appConfigs = configurations[appSlug] || [];
    const configItem = appConfigs.find(c => c.key === key && c.environmentSlug === envSlug);
    
    if (!configItem) {
      return makeResponse(404, { message: `Configuration for key ${key} in environment ${envSlug} not found` }, config);
    }
    
    const previous = snapshot(configItem);
    if (body.valueType !== undefined) configItem.valueType = body.valueType;
    configItem.value =
      body.value !== undefined ? storedValue(configItem.valueType, body.value) : configItem.value;
    configItem.description = body.description !== undefined ? body.description : configItem.description;
    configItem.updatedAt = new Date().toISOString();
    recordConfigRevision(revisionKey(appSlug, envSlug, key), previous, configItem);
    
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
    
    recordConfigRevision(revisionKey(appSlug, envSlug, key), snapshot(appConfigs[index]), undefined);
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
    recordConfigRevision(revisionKey(null, envSlug, key), undefined, newConfig);
    saveStored('global_configurations', globalConfigurations);
    return makeResponse(201, newConfig, config);
  }

  // 21. PUT & DELETE /global/configurations/:envSlug/:key
  match = /^\/global\/configurations\/([^/]+)\/([^/]+)$/.exec(cleanPath);
  if (match && method === 'PUT') {
    const envSlug = decodeURIComponent(match[1]);
    const key = decodeURIComponent(match[2]);
    const item = globalConfigurations.find(
      (c: any) => c.environmentSlug === envSlug && c.key === key
    );
    if (!item) {
      return makeResponse(404, { message: `Global configuration ${key} not found` }, config);
    }
    const previous = snapshot(item);
    if (body.valueType !== undefined) item.valueType = body.valueType;
    if (body.value !== undefined) item.value = storedValue(item.valueType, body.value);
    if (body.description !== undefined) item.description = body.description;
    item.updatedAt = new Date().toISOString();
    recordConfigRevision(revisionKey(null, envSlug, key), previous, item);
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
    recordConfigRevision(revisionKey(null, envSlug, key), snapshot(globalConfigurations[index]), undefined);
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
      rotationIntervalDays: body.rotationIntervalDays ?? null,
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
  match = /^\/global\/secrets\/([^/]+)\/values$/.exec(cleanPath);
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
      applyGracePeriod(existingVersions, val.previousVersionGraceDays);
      globalSecretVersions[historyKey] = [entry, ...existingVersions];
      secret.updatedAt = nowIso;
    });
    saveStored('global_secrets', globalSecrets);
    saveStored('global_secret_versions', globalSecretVersions);
    return makeResponse(200, sanitizeSecretMetadata(secret), config);
  }

  // 24. GET /global/secrets/:name/versions/:envSlug
  match = /^\/global\/secrets\/([^/]+)\/versions\/([^/]+)$/.exec(cleanPath);
  if (match && method === 'GET') {
    const secretName = decodeURIComponent(match[1]);
    const envSlug = decodeURIComponent(match[2]);
    const historyKey = `${secretName}:${envSlug}`;
    return makeResponse(200, withStatus(globalSecretVersions[historyKey] || []), config);
  }

  // 24b. PATCH /global/secrets/:name/versions/:envSlug/:version
  match = /^\/global\/secrets\/([^/]+)\/versions\/([^/]+)\/(\d+)$/.exec(cleanPath);
  if (match && method === 'PATCH') {
    const key = `${decodeURIComponent(match[1])}:${decodeURIComponent(match[2])}`;
    return updateMockVersion(globalSecretVersions, key, Number(match[3]), body, searchParams, config, 'global_secret_versions');
  }

  // 25. GET & DELETE /global/secrets/:name
  match = /^\/global\/secrets\/([^/]+)$/.exec(cleanPath);
  if (match && method === 'GET') {
    const secretName = decodeURIComponent(match[1]);
    const secret = globalSecrets.find((s: any) => s.name === secretName);
    if (!secret) {
      return makeResponse(404, { message: `Global secret ${secretName} not found` }, config);
    }
    return makeResponse(200, sanitizeSecretMetadata(secret), config);
  }

  if (match && method === 'PATCH') {
    const secret = globalSecrets.find((s: any) => s.name === decodeURIComponent(match![1]));
    return updateMockSecret(secret, body, config, () => saveStored('global_secrets', globalSecrets));
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
