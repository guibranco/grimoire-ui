import { evaluateFlag, toContext } from '@/lib/flagEvaluator';
import { FLAG_KEY_PATTERN, VARIANT_KEY_PATTERN, isSemVerOperator } from '@/lib/flags';
import { parseSemVer } from '@/lib/flagEvaluator';

/**
 * Demo implementation of the feature flag endpoints (guibranco/grimoire-api#90) for the mock API.
 * Mirrors the API's behaviour and the main validation rules; evaluation uses the shared-spec
 * evaluator, so the dry run serves what a real client would.
 */

interface StoredState {
  enabled: boolean;
  offVariant: string | null;
  rules: any[];
  fallthrough: any;
  version: number;
  updatedAt: string;
}

interface StoredFlag {
  key: string;
  description: string | null;
  type: 'boolean' | 'multivariate';
  variants: { key: string; value: unknown }[];
  defaultVariant: string;
  tags: string[];
  salt: string;
  createdAt: string;
  updatedAt: string;
  states: Record<string, StoredState>;
}

export interface MockFlagContext {
  /** The application's environments, or `null` when the application doesn't exist. */
  environmentsOf: (appSlug: string) => { slug: string }[] | null;
}

export interface MockFlagResponse {
  status: number;
  data: unknown;
}

const BOOLEAN_VARIANTS = [
  { key: 'on', value: true },
  { key: 'off', value: false },
];

const isBrowser = typeof window !== 'undefined';
const STORAGE_FLAGS = 'grm_mock_flags';
const STORAGE_HISTORY = 'grm_mock_flag_history';

const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

const state = (enabled: boolean, extra: Partial<StoredState> = {}, daysAgo = 1): StoredState => ({
  enabled,
  offVariant: null,
  rules: [],
  fallthrough: null,
  version: 1,
  updatedAt: ago(daysAgo),
  ...extra,
});

/** Demo flags, as in the issue's wireframes. */
function seedFlags(): Record<string, StoredFlag[]> {
  const flag = (f: Omit<StoredFlag, 'createdAt' | 'updatedAt'>, daysAgo: number): StoredFlag => ({
    ...f,
    createdAt: ago(daysAgo + 7),
    updatedAt: ago(daysAgo),
  });
  return {
    'production-gateway': [
      flag(
        {
          key: 'new-pdf-parser',
          description: 'Parse uploaded PDFs with the new streaming parser.',
          type: 'boolean',
          variants: BOOLEAN_VARIANTS,
          defaultVariant: 'off',
          tags: ['parsing'],
          salt: '1f0e2d3c4b5a6978',
          states: { development: state(true, {}, 0.1), staging: state(true, {}, 0.1) },
        },
        0.1
      ),
      flag(
        {
          key: 'checkout-redesign',
          description: 'New checkout page layout.',
          type: 'multivariate',
          variants: [
            { key: 'control', value: { layout: 'classic' } },
            { key: 'treatment', value: { layout: 'one-page' } },
          ],
          defaultVariant: 'control',
          tags: ['checkout', 'q4'],
          salt: '9f2c4e1a7b3d5f60',
          states: Object.fromEntries(
            ['development', 'staging', 'production'].map((env) => [
              env,
              state(true, {
                offVariant: 'control',
                fallthrough: { rollout: [{ variant: 'control', weight: 50 }, { variant: 'treatment', weight: 50 }], bucketBy: null },
              }),
            ])
          ),
        },
        1
      ),
      flag(
        {
          key: 'beta-dashboard',
          description: 'Redesigned dashboard for beta testers.',
          type: 'boolean',
          variants: BOOLEAN_VARIANTS,
          defaultVariant: 'off',
          tags: ['beta'],
          salt: 'b3e7a0c4d2f18e65',
          states: Object.fromEntries(
            ['development', 'staging', 'production'].map((env) => [
              env,
              state(
                true,
                {
                  rules: [
                    { conditions: [{ attribute: 'userId', operator: 'in', values: ['u-123', 'u-456'] }], serve: { variant: 'on' } },
                    {
                      conditions: [
                        { attribute: 'email', operator: 'endsWith', values: ['@straccini.com'] },
                        { attribute: 'country', operator: 'in', values: ['IE', 'BR', 'PT'] },
                      ],
                      serve: { rollout: [{ variant: 'on', weight: 50 }, { variant: 'off', weight: 50 }], bucketBy: 'userId' },
                    },
                    { conditions: [{ attribute: 'appVersion', operator: 'semVerGte', values: ['3.0.0'] }], serve: { variant: 'on' } },
                  ],
                  fallthrough: { variant: 'off' },
                },
                3
              ),
            ])
          ),
        },
        3
      ),
      flag(
        {
          key: 'email-provider',
          description: 'Which email provider sends transactional mail.',
          type: 'multivariate',
          variants: [
            { key: 'ses', value: 'ses' },
            { key: 'sendgrid', value: 'sendgrid' },
            { key: 'smtp', value: 'smtp' },
          ],
          defaultVariant: 'ses',
          tags: ['email'],
          salt: '5a5a5a5a5a5a5a5a',
          states: {
            development: state(
              true,
              {
                rules: [
                  { conditions: [{ attribute: 'userId', operator: 'in', values: ['u-1', 'u-2', 'u-3', 'u-4'] }], serve: { variant: 'sendgrid' } },
                ],
              },
              7
            ),
          },
        },
        7
      ),
    ],
  };
}

function load<T>(key: string, fallback: () => T): T {
  if (isBrowser) {
    const raw = localStorage.getItem(key);
    if (raw) {
      try {
        return JSON.parse(raw) as T;
      } catch {
        // fall through to the default
      }
    }
  }
  return fallback();
}

let flags: Record<string, StoredFlag[]> = load(STORAGE_FLAGS, seedFlags);
let history: Record<string, any[]> = load(STORAGE_HISTORY, () => ({}));

function persist() {
  if (!isBrowser) return;
  localStorage.setItem(STORAGE_FLAGS, JSON.stringify(flags));
  localStorage.setItem(STORAGE_HISTORY, JSON.stringify(history));
}

export function resetMockFlags() {
  flags = seedFlags();
  history = {};
  if (isBrowser) {
    localStorage.removeItem(STORAGE_FLAGS);
    localStorage.removeItem(STORAGE_HISTORY);
  }
}

/** Drops an application's flags (when the demo deletes the application). */
export function forgetMockFlags(appSlug: string) {
  delete flags[appSlug];
  persist();
}

const ok = (data: unknown, status = 200): MockFlagResponse => ({ status, data });
const problem = (status: number, detail: string): MockFlagResponse => ({
  status,
  data: { type: 'about:blank', title: status === 404 ? 'Not Found' : 'Conflict', status, detail },
});
const invalid = (errors: Record<string, string[]>): MockFlagResponse => ({
  status: 400,
  data: { title: 'One or more validation errors occurred.', status: 400, errors },
});

const snapshotFlag = (f: StoredFlag) => ({
  key: f.key,
  description: f.description,
  type: f.type,
  variants: f.variants,
  defaultVariant: f.defaultVariant,
  tags: f.tags,
});

const snapshotState = (s: StoredState | undefined) =>
  s ? { enabled: s.enabled, offVariant: s.offVariant, rules: s.rules, fallthrough: s.fallthrough, version: s.version } : null;

function record(app: string, key: string, change: string, environment: string | null, before: unknown, after: unknown) {
  const id = `${app}/${key}`;
  history[id] = [{ change, environment, actor: 'admin', changedAt: new Date().toISOString(), before, after }, ...(history[id] ?? [])];
}

function toResponse(f: StoredFlag, envs: { slug: string }[]) {
  return {
    ...snapshotFlag(f),
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
    environments: envs.map((e) => {
      const s = f.states[e.slug];
      return s
        ? { environment: e.slug, ...snapshotState(s), updatedAt: s.updatedAt }
        : { environment: e.slug, enabled: false, offVariant: null, rules: [], fallthrough: null, version: 0, updatedAt: null };
    }),
  };
}

function validateCreate(body: any): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  const key = typeof body?.key === 'string' ? body.key : '';
  if (!key || key.length > 500 || !FLAG_KEY_PATTERN.test(key)) errors.Key = ["'Key' is invalid."];
  const type = body?.type ?? 'boolean';
  if (type !== 'boolean' && type !== 'multivariate') errors.Type = ["'Type' must be 'boolean' or 'multivariate'."];
  if (type === 'boolean' && body?.variants) errors.Variants = ['Boolean flags have the fixed variants on and off.'];
  if (type === 'multivariate') Object.assign(errors, validateVariants(body?.variants));
  return errors;
}

function validateVariants(variants: any): Record<string, string[]> {
  if (!Array.isArray(variants) || variants.length < 2 || variants.length > 20)
    return { Variants: ['A multivariate flag needs 2 to 20 variants.'] };
  const keys = variants.map((v: any) => v?.key);
  if (keys.some((k: unknown) => typeof k !== 'string' || !VARIANT_KEY_PATTERN.test(k)))
    return { Variants: ['Invalid variant key.'] };
  if (new Set(keys).size !== keys.length) return { Variants: ['Variant keys must be unique.'] };
  return {};
}

const serveVariants = (sv: any): string[] =>
  sv ? [sv.variant, ...(sv.rollout ?? []).map((r: any) => r.variant)].filter((v) => typeof v === 'string') : [];

function validateServe(sv: any, path: string, errors: Record<string, string[]>) {
  const hasVariant = typeof sv?.variant === 'string';
  const hasRollout = Array.isArray(sv?.rollout);
  if (hasVariant === hasRollout) {
    errors[path] = ["Serve either a 'Variant' or a 'Rollout', not both."];
    return;
  }
  if (hasRollout) {
    const total = Math.round(sv.rollout.reduce((s: number, r: any) => s + Number(r.weight), 0) * 100) / 100;
    if (total !== 100) errors[`${path}.Rollout`] = ['Rollout weights must sum to 100.'];
  }
}

function validateState(body: any, variants: Set<string>): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  const rules = Array.isArray(body?.rules) ? body.rules : [];
  rules.forEach((rule: any, i: number) => {
    const conditions = Array.isArray(rule?.conditions) ? rule.conditions : [];
    if (conditions.length === 0) errors[`Rules[${i}].Conditions`] = ['A rule needs 1 to 20 conditions.'];
    conditions.forEach((c: any, j: number) => {
      const values = Array.isArray(c?.values) ? c.values : [];
      if (!c?.attribute || values.length === 0) errors[`Rules[${i}].Conditions[${j}]`] = ['Attribute and values are required.'];
      else if (isSemVerOperator(c.operator) && (values.length !== 1 || !parseSemVer(values[0])))
        errors[`Rules[${i}].Conditions[${j}].Values`] = ['Values must be one semantic version.'];
    });
    validateServe(rule?.serve, `Rules[${i}].Serve`, errors);
  });
  if (body?.fallthrough) validateServe(body.fallthrough, 'Fallthrough', errors);
  const unknown = [body?.offVariant, ...serveVariants(body?.fallthrough), ...rules.flatMap((r: any) => serveVariants(r?.serve))].filter(
    (v) => typeof v === 'string' && !variants.has(v)
  );
  if (unknown.length) errors.Variant = [`Unknown variants: ${[...new Set(unknown)].join(', ')}.`];
  return errors;
}

const randomSalt = () =>
  Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

const sortTags = (tags: unknown): string[] =>
  Array.isArray(tags)
    ? [...new Set(tags.filter((t): t is string => typeof t === 'string').map((t) => t.trim()))].sort((a, b) => a.localeCompare(b))
    : [];

const FLAGS_PATH = /^\/applications\/([^/]+)\/feature-flags(?:\/([^/]+)(?:\/(history|evaluate|environments\/([^/]+)(\/toggle)?))?)?$/;

/** Handles `/applications/{slug}/feature-flags…`; `null` for any other path. */
export function handleFlagRequest(
  ctx: MockFlagContext,
  method: string,
  path: string,
  body: any,
  query: URLSearchParams
): MockFlagResponse | null {
  const m = FLAGS_PATH.exec(path);
  if (!m) return null;
  const app = decodeURIComponent(m[1]);
  const key = m[2] ? decodeURIComponent(m[2]) : null;
  const sub = m[3] ?? null;
  const envSlug = m[4] ? decodeURIComponent(m[4]) : null;
  const toggle = !!m[5];

  const envs = ctx.environmentsOf(app);
  if (!envs) return problem(404, 'Application not found.');
  const list = (flags[app] ??= []);
  const flag = key ? list.find((f) => f.key === key) : undefined;

  if (!key) {
    if (method === 'GET') {
      const tag = query.get('tag');
      const env = query.get('environment');
      const enabled = query.get('enabled');
      if (env && !envs.some((e) => e.slug === env)) return problem(404, 'Environment not found.');
      return ok(
        list
          .filter((f) => !tag || f.tags.includes(tag))
          .filter((f) => !env || enabled === null || (f.states[env]?.enabled ?? false) === (enabled === 'true'))
          .sort((a, b) => a.key.localeCompare(b.key))
          .map((f) => toResponse(f, envs))
      );
    }
    if (method === 'POST') {
      const errors = validateCreate(body);
      if (Object.keys(errors).length) return invalid(errors);
      if (list.some((f) => f.key === body.key)) return problem(409, 'A feature flag with this key already exists.');
      const type = body.type ?? 'boolean';
      const variants = type === 'boolean' ? BOOLEAN_VARIANTS : body.variants.map((v: any) => ({ key: v.key, value: v.value }));
      const defaultVariant = body.defaultVariant ?? (type === 'boolean' ? 'off' : variants[0].key);
      if (!variants.some((v: any) => v.key === defaultVariant)) return invalid({ DefaultVariant: [`Unknown variant '${defaultVariant}'.`] });
      const now = new Date().toISOString();
      const created: StoredFlag = {
        key: body.key,
        description: body.description ?? null,
        type,
        variants,
        defaultVariant,
        tags: sortTags(body.tags),
        salt: randomSalt(),
        createdAt: now,
        updatedAt: now,
        states: {},
      };
      list.push(created);
      record(app, created.key, 'create', null, null, snapshotFlag(created));
      persist();
      return ok(toResponse(created, envs), 201);
    }
    return null;
  }

  if (sub === 'history' && method === 'GET') {
    const entries = history[`${app}/${key}`];
    return entries?.length ? ok(entries) : problem(404, 'Feature flag not found.');
  }
  if (!flag) return problem(404, 'Feature flag not found.');

  if (sub === 'evaluate' && method === 'POST') {
    if (!body?.environment) return invalid({ Environment: ["'Environment' must not be empty."] });
    if (!envs.some((e) => e.slug === body.environment)) return problem(404, 'Environment not found.');
    const result = evaluateFlag(flag, flag.states[body.environment] ?? null, toContext(body.context ?? {}));
    return ok({ ...result, value: flag.variants.find((v) => v.key === result.variant)?.value ?? null });
  }

  if (envSlug !== null) {
    if (!envs.some((e) => e.slug === envSlug)) return problem(404, 'Environment not found.');
    const before = snapshotState(flag.states[envSlug]);
    const current = flag.states[envSlug] ?? state(false, { version: 0 });
    let next: StoredState;
    if (toggle && method === 'POST') {
      next = { ...current, enabled: typeof body?.enabled === 'boolean' ? body.enabled : !current.enabled };
    } else if (!toggle && method === 'PUT') {
      const errors = validateState(body, new Set(flag.variants.map((v) => v.key)));
      if (Object.keys(errors).length) return invalid(errors);
      next = {
        ...current,
        enabled: !!body.enabled,
        offVariant: body.offVariant ?? null,
        rules: body.rules ?? [],
        fallthrough: body.fallthrough ?? null,
      };
    } else return null;
    next.version = current.version + 1;
    next.updatedAt = new Date().toISOString();
    flag.states[envSlug] = next;
    record(app, flag.key, toggle ? 'toggle' : 'environment', envSlug, before, snapshotState(next));
    persist();
    return ok(toResponse(flag, envs));
  }

  if (sub !== null) return null;
  if (method === 'GET') return ok(toResponse(flag, envs));
  if (method === 'DELETE') {
    flags[app] = list.filter((f) => f !== flag);
    record(app, flag.key, 'delete', null, snapshotFlag(flag), null);
    persist();
    return ok(null, 204);
  }
  if (method === 'PUT') {
    if (flag.type === 'boolean' && body?.variants) return invalid({ Variants: ["Boolean flags have the fixed variants 'on' and 'off'."] });
    if (body?.variants) {
      const errors = validateVariants(body.variants);
      if (Object.keys(errors).length) return invalid(errors);
    }
    const variants = body?.variants ?? flag.variants;
    const keys = new Set(variants.map((v: any) => v.key));
    const defaultVariant = body?.defaultVariant ?? flag.defaultVariant;
    if (!keys.has(defaultVariant)) return invalid({ DefaultVariant: [`Unknown variant '${defaultVariant}'.`] });
    const inUse = Object.values(flag.states)
      .flatMap((s) => [s.offVariant, ...serveVariants(s.fallthrough), ...s.rules.flatMap((r: any) => serveVariants(r.serve))])
      .filter((v): v is string => typeof v === 'string' && !keys.has(v));
    if (inUse.length) return invalid({ Variants: [`Variants still used by environment targeting: ${[...new Set(inUse)].join(', ')}.`] });
    const before = snapshotFlag(flag);
    Object.assign(flag, {
      description: body?.description ?? null,
      variants,
      defaultVariant,
      tags: sortTags(body?.tags),
      updatedAt: new Date().toISOString(),
    });
    record(app, flag.key, 'update', null, before, snapshotFlag(flag));
    persist();
    return ok(toResponse(flag, envs));
  }
  return null;
}
