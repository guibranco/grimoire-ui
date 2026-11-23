import { describe, it, expect } from 'vitest';
import {
  accessTokensUrl,
  emptyTokenDraft,
  environmentsLabel,
  expiresAtFor,
  revokeAccessTokenUrl,
  sortTokens,
  validateTokenDraft,
} from '../src/lib/accessTokens';
import type { AccessToken } from '../src/types/api';

const token = (over: Partial<AccessToken>): AccessToken => ({
  id: 'id',
  name: 'name',
  prefix: 'Abcdefgh',
  environments: null,
  scopes: ['secrets'],
  expiresAt: null,
  lastUsedAt: null,
  revokedAt: null,
  createdAt: '2026-11-01T00:00:00Z',
  status: 'active',
  ...over,
});

describe('access token helpers', () => {
  it('builds encoded URLs', () => {
    expect(accessTokensUrl('my app')).toBe('/applications/my%20app/access-tokens');
    expect(revokeAccessTokenUrl('app', 'a/b')).toBe('/applications/app/access-tokens/a%2Fb/revoke');
  });

  it('turns expiry presets into dates', () => {
    const now = new Date('2026-11-23T12:00:00Z');
    expect(expiresAtFor('30', now)).toBe('2026-12-23T12:00:00.000Z');
    expect(expiresAtFor('365', now)).toBe('2027-11-23T12:00:00.000Z');
    expect(expiresAtFor('never', now)).toBeNull();
  });

  it('lists active tokens first, newest first', () => {
    const sorted = sortTokens([
      token({ name: 'old-active', createdAt: '2026-01-01T00:00:00Z' }),
      token({ name: 'revoked', status: 'revoked', createdAt: '2026-11-20T00:00:00Z' }),
      token({ name: 'new-active', createdAt: '2026-11-01T00:00:00Z' }),
      token({ name: 'expired', status: 'expired', createdAt: '2026-06-01T00:00:00Z' }),
    ]);
    expect(sorted.map((t) => t.name)).toEqual(['new-active', 'old-active', 'revoked', 'expired']);
  });

  it('labels environments', () => {
    expect(environmentsLabel(null)).toBe('All environments');
    expect(environmentsLabel(['production', 'staging'])).toBe('production, staging');
  });

  it('validates the create form like the API', () => {
    const draft = emptyTokenDraft();
    expect(validateTokenDraft(draft, [])).toEqual({
      name: 'Give the token a name.',
      environments: 'Pick at least one environment, or allow all of them.',
    });
    expect(validateTokenDraft({ ...draft, name: 'ci', allEnvironments: true }, [])).toEqual({});
    expect(validateTokenDraft({ ...draft, name: ' ci ', environments: ['staging'] }, ['ci']).name).toMatch(/already exists/);
    expect(validateTokenDraft({ ...draft, name: 'x'.repeat(101), allEnvironments: true }, []).name).toMatch(/100/);
    expect(validateTokenDraft({ ...draft, name: 'ci', allEnvironments: true, scopes: [] }, []).scopes).toMatch(/scope/);
  });
});
