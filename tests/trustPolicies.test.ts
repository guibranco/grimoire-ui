import { describe, it, expect } from 'vitest';
import {
  emptyTrustPolicyDraft,
  matchSummary,
  trustPolicyBody,
  trustPolicyDraftFrom,
  trustPolicyUrl,
  validateTrustPolicyDraft,
} from '../src/lib/trustPolicies';
import type { TrustPolicy } from '../src/types/api';

const policy: TrustPolicy = {
  id: 'p1',
  name: 'deploy',
  repository: 'guibranco/app',
  refPattern: 'refs/tags/v*',
  gitHubEnvironment: null,
  environments: null,
  scopes: ['secrets'],
  tokenLifetimeMinutes: 30,
  lastUsedAt: null,
  createdAt: '2026-11-23T00:00:00Z',
};

describe('trust policy helpers', () => {
  it('builds encoded URLs', () => {
    expect(trustPolicyUrl('my app', 'a/b')).toBe('/applications/my%20app/trust-policies/a%2Fb');
  });

  it('round-trips a policy through the form draft', () => {
    const draft = trustPolicyDraftFrom(policy);
    expect(draft).toMatchObject({ allEnvironments: true, gitHubEnvironment: '', lifetime: '30' });
    expect(trustPolicyBody(draft)).toEqual({
      name: 'deploy',
      repository: 'guibranco/app',
      refPattern: 'refs/tags/v*',
      gitHubEnvironment: null,
      environments: null,
      scopes: ['secrets'],
      tokenLifetimeMinutes: 30,
    });
  });

  it('sends blank ref and GitHub environment as null', () => {
    const body = trustPolicyBody({ ...emptyTrustPolicyDraft(), refPattern: '  ', gitHubEnvironment: ' prod ', environments: ['staging'] });
    expect(body).toMatchObject({ refPattern: null, gitHubEnvironment: 'prod', environments: ['staging'], tokenLifetimeMinutes: 15 });
  });

  it('validates like the API', () => {
    const ok = { ...emptyTrustPolicyDraft(), name: 'deploy', repository: 'guibranco/app', allEnvironments: true };
    expect(validateTrustPolicyDraft(ok, [])).toEqual({});
    expect(validateTrustPolicyDraft({ ...ok, name: '' }, []).name).toMatch(/name/);
    expect(validateTrustPolicyDraft(ok, ['deploy']).name).toMatch(/already exists/);
    expect(validateTrustPolicyDraft({ ...ok, repository: 'app' }, []).repository).toMatch(/owner\/repo/);
    expect(validateTrustPolicyDraft({ ...ok, refPattern: 'main' }, []).refPattern).toMatch(/full ref/);
    expect(validateTrustPolicyDraft({ ...ok, refPattern: '' }, [])).toEqual({});
    expect(validateTrustPolicyDraft({ ...ok, allEnvironments: false }, []).environments).toBeTruthy();
    expect(validateTrustPolicyDraft({ ...ok, scopes: [] }, []).scopes).toBeTruthy();
    expect(validateTrustPolicyDraft({ ...ok, lifetime: '61' }, []).lifetime).toMatch(/1 to 60/);
    expect(validateTrustPolicyDraft({ ...ok, lifetime: '1.5' }, []).lifetime).toBeTruthy();
  });

  it('summarises what a policy matches', () => {
    expect(matchSummary({ refPattern: null, gitHubEnvironment: null })).toBe('any ref');
    expect(matchSummary({ refPattern: 'refs/heads/main', gitHubEnvironment: 'production' })).toBe(
      'refs/heads/main · environment production'
    );
  });
});
