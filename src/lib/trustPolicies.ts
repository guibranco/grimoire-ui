import type { AccessTokenScope, TrustPolicy, TrustPolicyRequest } from '@/types/api';

/** GitHub OIDC trust policies (guibranco/grimoire-api#75, guibranco/grimoire-ui#444). */

export const TRUST_POLICIES_QUERY_KEY = 'trust-policies';
export const trustPoliciesQueryKey = (appSlug: string) => [TRUST_POLICIES_QUERY_KEY, appSlug] as const;

const seg = encodeURIComponent;
export const trustPoliciesUrl = (appSlug: string) => `/applications/${seg(appSlug)}/trust-policies`;
export const trustPolicyUrl = (appSlug: string, id: string) => `${trustPoliciesUrl(appSlug)}/${seg(id)}`;

export const DEFAULT_LIFETIME_MINUTES = 15;
export const MAX_LIFETIME_MINUTES = 60;
export const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export interface TrustPolicyDraft {
  name: string;
  repository: string;
  refPattern: string;
  gitHubEnvironment: string;
  allEnvironments: boolean;
  environments: string[];
  scopes: AccessTokenScope[];
  lifetime: string;
}

export const emptyTrustPolicyDraft = (): TrustPolicyDraft => ({
  name: '',
  repository: '',
  refPattern: 'refs/heads/main',
  gitHubEnvironment: '',
  allEnvironments: false,
  environments: [],
  scopes: ['secrets', 'configurations'],
  lifetime: String(DEFAULT_LIFETIME_MINUTES),
});

export const trustPolicyDraftFrom = (p: TrustPolicy): TrustPolicyDraft => ({
  name: p.name,
  repository: p.repository,
  refPattern: p.refPattern ?? '',
  gitHubEnvironment: p.gitHubEnvironment ?? '',
  allEnvironments: p.environments === null,
  environments: p.environments ?? [],
  scopes: p.scopes,
  lifetime: String(p.tokenLifetimeMinutes),
});

export const trustPolicyBody = (d: TrustPolicyDraft): TrustPolicyRequest => ({
  name: d.name.trim(),
  repository: d.repository.trim(),
  refPattern: d.refPattern.trim() || null,
  gitHubEnvironment: d.gitHubEnvironment.trim() || null,
  environments: d.allEnvironments ? null : d.environments,
  scopes: d.scopes,
  tokenLifetimeMinutes: Number(d.lifetime),
});

/** Problems the API would reject, keyed by field. */
export function validateTrustPolicyDraft(
  d: TrustPolicyDraft,
  takenNames: string[]
): Partial<Record<keyof TrustPolicyDraft, string>> {
  const errors: Partial<Record<keyof TrustPolicyDraft, string>> = {};
  const name = d.name.trim();
  if (!name) errors.name = 'Give the policy a name.';
  else if (name.length > 100) errors.name = 'Use at most 100 characters.';
  else if (takenNames.includes(name)) errors.name = 'A policy with this name already exists.';
  if (!REPOSITORY_PATTERN.test(d.repository.trim())) errors.repository = 'Use owner/repo, e.g. guibranco/grimoire-api.';
  const ref = d.refPattern.trim();
  if (ref && !ref.startsWith('refs/')) errors.refPattern = 'Use a full ref, e.g. refs/heads/main or refs/tags/v*.';
  if (!d.allEnvironments && d.environments.length === 0)
    errors.environments = 'Pick at least one environment, or allow all of them.';
  if (d.scopes.length === 0) errors.scopes = 'Pick at least one scope.';
  const lifetime = Number(d.lifetime);
  if (!Number.isInteger(lifetime) || lifetime < 1 || lifetime > MAX_LIFETIME_MINUTES)
    errors.lifetime = `Use 1 to ${MAX_LIFETIME_MINUTES} minutes.`;
  return errors;
}

/** "refs/heads/main · env production" style summary of what a policy matches. */
export function matchSummary(p: Pick<TrustPolicy, 'refPattern' | 'gitHubEnvironment'>): string {
  const parts = [p.refPattern ?? 'any ref'];
  if (p.gitHubEnvironment) parts.push(`environment ${p.gitHubEnvironment}`);
  return parts.join(' · ');
}
