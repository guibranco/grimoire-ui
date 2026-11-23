import type { AccessToken, AccessTokenScope, AccessTokenStatus } from '@/types/api';

/** Access tokens for the Consumer API (guibranco/grimoire-api#75, guibranco/grimoire-ui#444). */

export const ACCESS_TOKENS_QUERY_KEY = 'access-tokens';
export const accessTokensQueryKey = (appSlug: string) => [ACCESS_TOKENS_QUERY_KEY, appSlug] as const;

const seg = encodeURIComponent;
export const accessTokensUrl = (appSlug: string) => `/applications/${seg(appSlug)}/access-tokens`;
export const revokeAccessTokenUrl = (appSlug: string, id: string) =>
  `${accessTokensUrl(appSlug)}/${seg(id)}/revoke`;

export const TOKEN_PREFIX = 'grm_tok_';

export const ACCESS_TOKEN_SCOPES: { value: AccessTokenScope; label: string }[] = [
  { value: 'secrets', label: 'Secrets' },
  { value: 'configurations', label: 'Configurations' },
  { value: 'feature-flags', label: 'Feature flags' },
];

export const scopeLabel = (scope: AccessTokenScope) =>
  ACCESS_TOKEN_SCOPES.find((s) => s.value === scope)?.label ?? scope;

export const STATUS_LABELS: Record<AccessTokenStatus, string> = {
  active: 'Active',
  expired: 'Expired',
  revoked: 'Revoked',
};

/** Expiry presets offered when creating a token; `null` days never expires. */
export const EXPIRY_PRESETS: { value: string; label: string; days: number | null }[] = [
  { value: '30', label: '30 days', days: 30 },
  { value: '90', label: '90 days', days: 90 },
  { value: '365', label: '1 year', days: 365 },
  { value: 'never', label: 'Never', days: null },
];
export const DEFAULT_EXPIRY = '90';

/** The `expiresAt` for a preset, counted from `now`. */
export function expiresAtFor(preset: string, now: Date = new Date()): string | null {
  const days = EXPIRY_PRESETS.find((p) => p.value === preset)?.days ?? null;
  return days === null ? null : new Date(now.getTime() + days * 86_400_000).toISOString();
}

/** Active tokens first, then by newest. */
export function sortTokens(tokens: AccessToken[]): AccessToken[] {
  const rank = (t: AccessToken) => (t.status === 'active' ? 0 : 1);
  return [...tokens].sort((a, b) => rank(a) - rank(b) || b.createdAt.localeCompare(a.createdAt));
}

/** "All environments" or the listed slugs. */
export const environmentsLabel = (environments: string[] | null) =>
  environments === null ? 'All environments' : environments.join(', ');

export interface TokenDraft {
  name: string;
  allEnvironments: boolean;
  environments: string[];
  scopes: AccessTokenScope[];
  expiry: string;
}

export const emptyTokenDraft = (): TokenDraft => ({
  name: '',
  allEnvironments: false,
  environments: [],
  scopes: ['secrets', 'configurations'],
  expiry: DEFAULT_EXPIRY,
});

/** Problems the API would reject, keyed by field. */
export function validateTokenDraft(draft: TokenDraft, taken: string[]): Partial<Record<keyof TokenDraft, string>> {
  const errors: Partial<Record<keyof TokenDraft, string>> = {};
  const name = draft.name.trim();
  if (!name) errors.name = 'Give the token a name.';
  else if (name.length > 100) errors.name = 'Use at most 100 characters.';
  else if (taken.includes(name)) errors.name = 'A token with this name already exists.';
  if (!draft.allEnvironments && draft.environments.length === 0)
    errors.environments = 'Pick at least one environment, or allow all of them.';
  if (draft.scopes.length === 0) errors.scopes = 'Pick at least one scope.';
  return errors;
}
