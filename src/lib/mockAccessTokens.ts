import type { AccessToken, AccessTokenScope } from '@/types/api';
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

function load(): Record<string, AccessToken[]> {
  if (isBrowser) {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        return JSON.parse(raw) as Record<string, AccessToken[]>;
      } catch {
        // fall through to the seed
      }
    }
  }
  return seed();
}

let tokens = load();

function persist() {
  if (isBrowser) localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
}

export function resetMockAccessTokens() {
  tokens = seed();
  if (isBrowser) localStorage.removeItem(STORAGE_KEY);
}

/** Drops an application's tokens (when the demo deletes the application). */
export function forgetMockAccessTokens(appSlug: string) {
  delete tokens[appSlug];
  persist();
}

const randomString = (length: number) =>
  Array.from(crypto.getRandomValues(new Uint8Array(length)), (b) => BASE62[b % BASE62.length]).join('');

/** Status as of now, so expiry shows without a write. */
const withStatus = (t: AccessToken): AccessToken => ({
  ...t,
  status: t.revokedAt ? 'revoked' : t.expiresAt && new Date(t.expiresAt) <= new Date() ? 'expired' : 'active',
});

const ok = (data: unknown, status = 200): MockTokenResponse => ({ status, data });
const notFound = (detail: string): MockTokenResponse => ({
  status: 404,
  data: { type: 'about:blank', title: 'Not Found', status: 404, detail },
});
const invalid = (errors: Record<string, string[]>): MockTokenResponse => ({
  status: 400,
  data: { title: 'One or more validation errors occurred.', status: 400, errors },
});

function validate(body: any, envSlugs: string[]): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 100) errors.Name = ['Name must be 1 to 100 characters.'];
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
  if (body?.expiresAt && !(new Date(body.expiresAt) > new Date())) errors.ExpiresAt = ['The expiry must be in the future.'];
  return errors;
}

/** Handles `/applications/{slug}/access-tokens[/{id}/revoke]`; `null` for any other path. */
export function handleAccessTokenRequest(
  ctx: MockTokenContext,
  method: string,
  path: string,
  body: any
): MockTokenResponse | null {
  const match = /^\/applications\/([^/]+)\/access-tokens(?:\/([^/]+)\/(revoke))?$/.exec(path);
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
  const list = tokens[app] ?? [];

  if (!id && method === 'GET') return ok(list.map(withStatus));

  if (!id && method === 'POST') {
    const errors = validate(body, envs.map((e) => e.slug));
    if (Object.keys(errors).length) return invalid(errors);
    const name = body.name.trim();
    if (list.some((t) => t.name === name))
      return { status: 409, data: { title: 'Conflict', status: 409, detail: 'An access token with this name already exists.' } };
    const secret = randomString(40);
    const token: AccessToken = {
      id: crypto.randomUUID(),
      name,
      prefix: secret.slice(0, 8),
      environments: body.environments
        ? [...new Set<string>(body.environments.map((e: string) => e.toLowerCase()))].sort()
        : null,
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

  if (id && method === 'POST') {
    const token = list.find((t) => t.id === id);
    if (!token) return notFound('Access token not found.');
    token.revokedAt ??= new Date().toISOString();
    persist();
    return ok(withStatus(token));
  }

  return null;
}
