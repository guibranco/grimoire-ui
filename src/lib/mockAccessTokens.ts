import type { AccessToken, AccessTokenScope, TrustPolicy } from '@/types/api';
import { ACCESS_TOKEN_SCOPES, TOKEN_PREFIX } from '@/lib/accessTokens';

/**
 * Demo implementation of the access token endpoints (guibranco/grimoire-api#75) for the mock API:
 * list, create (the plain token is returned once) and revoke. Mirrors the API's validation.
 */

export interface MockTokenContext {
  /** The application's environments, or `null` when the application doesn't exist. */
  environmentsOf: (appSlug: string) => { slug: string }[] | null;
}

export interface MockTokenResponse {
  status: number;
  data: unknown;
}

const isBrowser = typeof window !== 'undefined';
const STORAGE_KEY = 'grm_mock_access_tokens';
const POLICIES_KEY = 'grm_mock_trust_policies';
const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const KNOWN_SCOPES = ACCESS_TOKEN_SCOPES.map((s) => s.value);

const daysFromNow = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

function seed(): Record<string, AccessToken[]> {
  return {
    'production-gateway': [
      {
        id: 'b8e4a6f2-1c3d-4e5f-8a9b-0c1d2e3f4a5b',
        name: 'github-actions',
        prefix: 'Qm7Xc2Lp',
        environments: ['staging'],
        scopes: ['secrets', 'configurations'],
        expiresAt: daysFromNow(64),
        lastUsedAt: daysFromNow(-0.02),
        revokedAt: null,
        createdAt: daysFromNow(-26),
        status: 'active',
      },
      {
        id: 'c9f5b7a3-2d4e-4f60-9bac-1d2e3f4a5b6c',
        name: 'edge-runtime',
        prefix: 'Hk4Tz9Wa',
        environments: ['production'],
        scopes: ['secrets', 'configurations', 'feature-flags'],
        expiresAt: null,
        lastUsedAt: daysFromNow(-0.001),
        revokedAt: null,
        createdAt: daysFromNow(-90),
        status: 'active',
      },
      {
        id: 'd0a6c8b4-3e5f-4a71-8cbd-2e3f4a5b6c7d',
        name: 'old-deploy-script',
        prefix: 'Pb2Nr6Ye',
        environments: null,
        scopes: ['secrets'],
        expiresAt: null,
        lastUsedAt: daysFromNow(-40),
        revokedAt: daysFromNow(-30),
        createdAt: daysFromNow(-200),
        status: 'revoked',
      },
    ],
  };
}

function seedPolicies(): Record<string, TrustPolicy[]> {
  return {
    'production-gateway': [
      {
        id: 'e1b7d9c5-4f60-4b82-9dce-3f4a5b6c7d8e',
        name: 'deploy main',
        repository: 'guibranco/production-gateway',
        refPattern: 'refs/heads/main',
        gitHubEnvironment: 'production',
        environments: ['production'],
        scopes: ['secrets', 'configurations'],
        tokenLifetimeMinutes: 15,
        lastUsedAt: daysFromNow(-0.3),
        createdAt: daysFromNow(-12),
      },
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
        // fall through to the seed
      }
    }
  }
  return fallback();
}

let tokens = load(STORAGE_KEY, seed);
let policies = load(POLICIES_KEY, seedPolicies);

function persist() {
  if (!isBrowser) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
  localStorage.setItem(POLICIES_KEY, JSON.stringify(policies));
}

export function resetMockAccessTokens() {
  tokens = seed();
  policies = seedPolicies();
  if (isBrowser) {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(POLICIES_KEY);
  }
}

/** Drops an application's tokens and trust policies (when the demo deletes the application). */
export function forgetMockAccessTokens(appSlug: string) {
  delete tokens[appSlug];
  delete policies[appSlug];
  persist();
}

const randomString = (length: number) =>
  Array.from(crypto.getRandomValues(new Uint8Array(length)), (b) => BASE62[b % BASE62.length]).join('');

function statusOf(t: AccessToken): AccessToken['status'] {
  if (t.revokedAt) return 'revoked';
  return t.expiresAt && Date.parse(t.expiresAt) <= Date.now() ? 'expired' : 'active';
}

/** Status as of now, so expiry shows without a write. */
const withStatus = (t: AccessToken): AccessToken => ({ ...t, status: statusOf(t) });

const ok = (data: unknown, status = 200): MockTokenResponse => ({ status, data });
const notFound = (detail: string): MockTokenResponse => ({
  status: 404,
  data: { type: 'about:blank', title: 'Not Found', status: 404, detail },
});
const invalid = (errors: Record<string, string[]>): MockTokenResponse => ({
  status: 400,
  data: { title: 'One or more validation errors occurred.', status: 400, errors },
});

const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

/** Mirrors the API's TrustPolicyRequestValidator. */
function validatePolicy(body: any, envSlugs: string[]): Record<string, string[]> {
  const errors = validateScopesAndEnvironments(body, envSlugs);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 100) errors.Name = ['Name must be 1 to 100 characters.'];
  if (typeof body?.repository !== 'string' || !REPOSITORY.test(body.repository.trim()))
    errors.Repository = ['Use owner/repo.'];
  const optionalString = (v: unknown) => v === null || v === undefined || typeof v === 'string';
  if (!optionalString(body?.refPattern) || (body?.refPattern && !body.refPattern.trim().startsWith('refs/')))
    errors.RefPattern = ['Use a full ref.'];
  if (!optionalString(body?.gitHubEnvironment)) errors.GitHubEnvironment = ['Use a GitHub environment name.'];
  const lifetime = body?.tokenLifetimeMinutes;
  if (lifetime !== null && lifetime !== undefined && !(Number.isInteger(lifetime) && lifetime >= 1 && lifetime <= 60))
    errors.TokenLifetimeMinutes = ['Use 1 to 60 minutes.'];
  return errors;
}

function validateScopesAndEnvironments(body: any, envSlugs: string[]): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  const scopes = body?.scopes;
  if (!Array.isArray(scopes) || scopes.length === 0) errors.Scopes = ['Choose at least one scope.'];
  else if (!scopes.every((s: string) => KNOWN_SCOPES.includes(s as AccessTokenScope)))
    errors.Scopes = [`Scopes must be among: ${KNOWN_SCOPES.join(', ')}.`];
  const envs = body?.environments;
  if (envs !== null && envs !== undefined) {
    if (!Array.isArray(envs) || envs.length === 0)
      errors.Environments = ['List at least one environment, or omit environments for all of them.'];
    else {
      const unknown = envs.filter((e: string) => !envSlugs.includes(String(e).toLowerCase()));
      if (unknown.length) errors.Environments = [`Unknown environment(s): ${unknown.join(', ')}.`];
    }
  }
  return errors;
}

const normalizeEnvironments = (envs: string[] | null | undefined): string[] | null =>
  envs ? [...new Set(envs.map((e) => e.toLowerCase()))].sort((a, b) => a.localeCompare(b)) : null;

function validate(body: any, envSlugs: string[]): Record<string, string[]> {
  const errors = validateScopesAndEnvironments(body, envSlugs);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 100) errors.Name = ['Name must be 1 to 100 characters.'];
  if (body?.expiresAt) {
    const expires = Date.parse(body.expiresAt);
    if (Number.isNaN(expires) || expires <= Date.now()) errors.ExpiresAt = ['The expiry must be in the future.'];
  }
  return errors;
}

/** `{ app, id }` for `/applications/{slug}/access-tokens[/{id}/revoke]`; `null` for any other path. */
function parseRoute(path: string): { app: string; id?: string } | null {
  const match = /^\/applications\/([^/]+)\/access-tokens(?:\/([^/]+)\/revoke)?$/.exec(path);
  if (!match) return null;
  try {
    return { app: decodeURIComponent(match[1]), id: match[2] === undefined ? undefined : decodeURIComponent(match[2]) };
  } catch {
    return null;
  }
}

function createToken(app: string, list: AccessToken[], envSlugs: string[], body: any): MockTokenResponse {
  const errors = validate(body, envSlugs);
  if (Object.keys(errors).length) return invalid(errors);
  const name = body.name.trim();
  if (list.some((t) => t.name === name)) return conflict('An access token with this name already exists.');
  const secret = randomString(40);
  const environments = normalizeEnvironments(body.environments);
  const token: AccessToken = {
    id: crypto.randomUUID(),
    name,
    prefix: secret.slice(0, 8),
    environments,
    scopes: KNOWN_SCOPES.filter((s) => body.scopes.includes(s)),
    expiresAt: body.expiresAt ?? null,
    lastUsedAt: null,
    revokedAt: null,
    createdAt: new Date().toISOString(),
    status: 'active',
  };
  tokens[app] = [token, ...list];
  persist();
  return ok({ token, plainToken: TOKEN_PREFIX + secret }, 201);
}

function revokeToken(list: AccessToken[], id: string): MockTokenResponse {
  const token = list.find((t) => t.id === id);
  if (!token) return notFound('Access token not found.');
  token.revokedAt ??= new Date().toISOString();
  persist();
  return ok(withStatus(token));
}

const conflict = (detail: string): MockTokenResponse => ({ status: 409, data: { title: 'Conflict', status: 409, detail } });

function savePolicy(app: string, envSlugs: string[], body: any, existing?: TrustPolicy): MockTokenResponse {
  const errors = validatePolicy(body, envSlugs);
  if (Object.keys(errors).length) return invalid(errors);
  const list = policies[app] ?? [];
  const name = body.name.trim();
  if (list.some((p) => p.name === name && p.id !== existing?.id))
    return conflict('A trust policy with this name already exists.');
  const policy: TrustPolicy = {
    id: existing?.id ?? crypto.randomUUID(),
    name,
    repository: body.repository.trim(),
    refPattern: body.refPattern?.trim() || null,
    gitHubEnvironment: body.gitHubEnvironment?.trim() || null,
    environments: normalizeEnvironments(body.environments),
    scopes: KNOWN_SCOPES.filter((s) => body.scopes.includes(s)),
    tokenLifetimeMinutes: body.tokenLifetimeMinutes ?? 15,
    lastUsedAt: existing?.lastUsedAt ?? null,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };
  policies[app] = existing ? list.map((p) => (p.id === existing.id ? policy : p)) : [...list, policy];
  persist();
  return ok(policy, existing ? 200 : 201);
}

/** Handles `/applications/{slug}/trust-policies[/{id}]`; `null` for any other path. */
export function handleTrustPolicyRequest(
  ctx: MockTokenContext,
  method: string,
  path: string,
  body: any
): MockTokenResponse | null {
  const match = /^\/applications\/([^/]+)\/trust-policies(?:\/([^/]+))?$/.exec(path);
  if (!match) return null;
  let app: string;
  let id: string | undefined;
  try {
    app = decodeURIComponent(match[1]);
    id = match[2] === undefined ? undefined : decodeURIComponent(match[2]);
  } catch {
    return null;
  }
  const envs = ctx.environmentsOf(app);
  if (!envs) return notFound('Application not found.');
  const list = policies[app] ?? [];
  const envSlugs = envs.map((e) => e.slug);

  if (id === undefined) {
    if (method === 'GET') return ok([...list].sort((a, b) => a.name.localeCompare(b.name)));
    return method === 'POST' ? savePolicy(app, envSlugs, body) : null;
  }
  const existing = list.find((p) => p.id === id);
  if (!existing) return notFound('Trust policy not found.');
  if (method === 'PUT') return savePolicy(app, envSlugs, body, existing);
  if (method === 'DELETE') {
    policies[app] = list.filter((p) => p.id !== id);
    persist();
    return ok(null, 204);
  }
  return null;
}

/** Handles `/applications/{slug}/access-tokens[/{id}/revoke]`; `null` for any other path. */
export function handleAccessTokenRequest(
  ctx: MockTokenContext,
  method: string,
  path: string,
  body: any
): MockTokenResponse | null {
  const route = parseRoute(path);
  if (!route) return null;
  const envs = ctx.environmentsOf(route.app);
  if (!envs) return notFound('Application not found.');
  const list = tokens[route.app] ?? [];

  if (route.id !== undefined) return method === 'POST' ? revokeToken(list, route.id) : null;
  if (method === 'GET') return ok(list.map(withStatus));
  if (method === 'POST') return createToken(route.app, list, envs.map((e) => e.slug), body);
  return null;
}
