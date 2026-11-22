import { describe, it, expect, beforeEach } from 'vitest';
import {
  highlightSegments,
  isPaletteShortcut,
  pickEnvironment,
  searchResultPath,
} from '../src/lib/search';
import { api } from '../src/lib/api';
import { resetMockDatabase } from '../src/lib/mockApi';
import type { SearchResponse, SearchResult } from '../src/types/api';

const hit = (overrides: Partial<SearchResult>): SearchResult => ({
  type: 'configuration',
  name: 'KEY',
  application: 'app',
  environments: [],
  ...overrides,
});

describe('searchResultPath', () => {
  it('opens applications', () => {
    expect(searchResultPath(hit({ type: 'application', name: 'My App', application: 'my-app' }))).toBe('/apps/my-app');
  });

  it('deep links configuration and secrets to their tab with ?key=', () => {
    expect(searchResultPath(hit({ name: 'SMTP_HOST', environments: ['local', 'production'] }))).toBe(
      '/apps/app/local/config?key=SMTP_HOST'
    );
    expect(searchResultPath(hit({ type: 'secret', name: 'DB_PASS', environments: ['production'] }))).toBe(
      '/apps/app/production/secrets?key=DB_PASS'
    );
  });

  it('prefers the last visited environment when the entry has a value there', () => {
    const h = hit({ name: 'K', environments: ['local', 'production'] });
    expect(searchResultPath(h, 'production')).toBe('/apps/app/production/config?key=K');
    expect(searchResultPath(h, 'staging')).toBe('/apps/app/local/config?key=K');
  });

  it('falls back to the application when an entry has no value yet', () => {
    expect(searchResultPath(hit({ type: 'secret', name: 'EMPTY' }))).toBe('/apps/app');
  });

  it('opens Global tabs for global entries', () => {
    expect(searchResultPath(hit({ type: 'global-secret', name: 'RELAY', application: null, environments: ['*'] }))).toBe(
      '/global/secrets?key=RELAY'
    );
    expect(searchResultPath(hit({ type: 'global-configuration', name: 'PORT', application: null }))).toBe(
      '/global/config?key=PORT'
    );
  });

  it('never picks the * pseudo-environment for an application route', () => {
    expect(pickEnvironment(['*', 'prod'])).toBe('prod');
    expect(pickEnvironment(['*'])).toBeNull();
  });
});

describe('highlightSegments', () => {
  it('marks every case-insensitive occurrence', () => {
    expect(highlightSegments('SMTP_HOST_smtp', 'smtp')).toEqual([
      { text: 'SMTP', match: true, start: 0 },
      { text: '_HOST_', match: false, start: 4 },
      { text: 'smtp', match: true, start: 10 },
    ]);
  });

  it('returns the text untouched without a query or match', () => {
    expect(highlightSegments('abc', '  ')).toEqual([{ text: 'abc', match: false, start: 0 }]);
    expect(highlightSegments('abc', 'z')).toEqual([{ text: 'abc', match: false, start: 0 }]);
  });
});

describe('isPaletteShortcut', () => {
  const key = (k: Partial<KeyboardEvent>) => ({ key: 'k', metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...k });
  it('accepts ⌘K and Ctrl+K only', () => {
    expect(isPaletteShortcut(key({ metaKey: true }))).toBe(true);
    expect(isPaletteShortcut(key({ ctrlKey: true, key: 'K' }))).toBe(true);
    expect(isPaletteShortcut(key({}))).toBe(false);
    expect(isPaletteShortcut(key({ ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(isPaletteShortcut(key({ metaKey: true, key: 'j' }))).toBe(false);
  });
});

describe('mock GET /search', () => {
  beforeEach(() => {
    localStorage.setItem('grimoire_api_url', 'mock://');
    localStorage.setItem('grimoire_api_key', 'mock_admin_key');
    resetMockDatabase();
  });

  const search = async (q: string, limit?: number) =>
    (await api.get<SearchResponse>('/search', { params: { q, limit } })).data;

  it('groups configuration keys per application with their environments', async () => {
    const res = await search('max_db');
    const config = res.results.find((r) => r.name === 'MAX_DB_CONNECTIONS')!;
    expect(config).toMatchObject({ type: 'configuration', application: 'production-gateway' });
    expect(config.environments).toEqual(expect.arrayContaining(['production', 'staging']));
    expect(res.results.filter((r) => r.name === 'MAX_DB_CONNECTIONS')).toHaveLength(1);
  });

  it('lists secret environments from their versions and never returns values', async () => {
    const res = await search('REDIS');
    const secret = res.results.find((r) => r.type === 'secret')!;
    expect(secret).toMatchObject({ name: 'REDIS_CACHE_TOKEN', application: 'production-gateway', environments: ['production'] });
    expect(JSON.stringify(res)).not.toMatch(/"value"/);
  });

  it('ranks exact and prefix matches before substring and description matches', async () => {
    const res = await search('gateway');
    expect(res.results[0]).toMatchObject({ type: 'application', application: 'production-gateway' });
  });

  it('does not match values', async () => {
    const res = await search('logs.internal.grimoire');
    expect(res.results).toEqual([]);
  });

  it('rejects short queries and out-of-range limits', async () => {
    expect((await api.get('/search', { params: { q: 'a' } })).status).toBe(400);
    expect((await api.get('/search', { params: { q: 'ab', limit: 51 } })).status).toBe(400);
  });

  it('respects the limit and reports truncation', async () => {
    const res = await search('ti', 1);
    expect(res.results).toHaveLength(1);
    expect(res.truncated).toBe(true);
  });
});
