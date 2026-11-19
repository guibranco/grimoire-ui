import { describe, it, expect, vi } from 'vitest';
import axios from 'axios';
import { QueryClient } from '@tanstack/react-query';
import {
  DASHBOARD_QUERY_KEY,
  activityLink,
  attentionCountByApp,
  attentionDetail,
  attentionLabel,
  attentionLink,
  consumerHealth,
  formatRelative,
  groupAttention,
  invalidateDashboardOnMutations,
  parseDashboard,
  sortAndFilterApps,
} from '../src/lib/dashboard';
import type { AttentionItem, DashboardApplication } from '../src/types/api';

const NOW = new Date('2026-11-19T12:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000).toISOString();

const item = (overrides: Partial<AttentionItem>): AttentionItem => ({
  kind: 'consumer-stale',
  severity: 'warning',
  application: null,
  environment: null,
  target: null,
  ...overrides,
});

const app = (overrides: Partial<DashboardApplication>): DashboardApplication => ({
  slug: 'a',
  name: 'A',
  inheritGlobals: true,
  environments: [],
  secretCount: 0,
  configurationCount: 0,
  lastChangedAt: null,
  lastSeenAt: null,
  ...overrides,
});

describe('parseDashboard', () => {
  it('rejects payloads that are not a dashboard', () => {
    expect(() => parseDashboard([])).toThrow();
    expect(() => parseDashboard({})).toThrow();
    expect(() => parseDashboard(null)).toThrow();
  });

  it('fills in optional sections and keeps null for unavailable features', () => {
    const parsed = parseDashboard({ applications: [{ slug: 'x', name: 'X' }] });
    expect(parsed.applications[0]).toMatchObject({ environments: [], secretCount: 0, lastSeenAt: null });
    expect(parsed.totals.applications).toBe(1);
    expect(parsed.featureFlags).toBeNull();
    expect(parsed.recentActivity).toBeNull();
    expect(parsed.attention).toEqual([]);
  });

  it('keeps feature flags and activity when present', () => {
    const parsed = parseDashboard({
      applications: [],
      featureFlags: { total: 4, enabled: 3 },
      recentActivity: [],
    });
    expect(parsed.featureFlags).toEqual({ total: 4, enabled: 3 });
    expect(parsed.recentActivity).toEqual([]);
  });
});

describe('consumerHealth', () => {
  it('is green under a day, amber under the stale threshold, red after it, grey when never seen', () => {
    expect(consumerHealth(hoursAgo(2), 7, NOW)).toBe('fresh');
    expect(consumerHealth(hoursAgo(48), 7, NOW)).toBe('recent');
    expect(consumerHealth(hoursAgo(24 * 8), 7, NOW)).toBe('stale');
    expect(consumerHealth(hoursAgo(24 * 3), 2, NOW)).toBe('stale');
    expect(consumerHealth(null, 7, NOW)).toBe('never');
    expect(consumerHealth('not-a-date', 7, NOW)).toBe('never');
  });
});

describe('formatRelative', () => {
  it('formats past and missing values', () => {
    expect(formatRelative(null)).toBe('Never');
    expect(formatRelative(undefined, '—')).toBe('—');
    expect(formatRelative(new Date().toISOString())).toBe('just now');
    expect(formatRelative(new Date(Date.now() - 3 * 86400_000).toISOString())).toBe('3 days ago');
  });
});

describe('attention helpers', () => {
  const items = [
    item({ kind: 'config-empty-value', severity: 'info', application: 'a', environment: 'prod', target: 'K' }),
    item({ kind: 'secret-expired', severity: 'error', application: 'a', environment: 'prod', target: 'S' }),
    item({ kind: 'consumer-stale', severity: 'warning', application: 'b', environment: 'dev' }),
    item({ kind: 'secret-expiring', severity: 'warning', application: null, environment: null, target: 'G' }),
  ];

  it('groups by severity in error → warning → info order, omitting empty groups', () => {
    const groups = groupAttention(items);
    expect(groups.map((g) => g.severity)).toEqual(['error', 'warning', 'info']);
    expect(groups[1].items).toHaveLength(2);
    expect(groupAttention([items[0]]).map((g) => g.severity)).toEqual(['info']);
  });

  it('counts items per application', () => {
    const counts = attentionCountByApp(items);
    expect(counts.get('a')).toBe(2);
    expect(counts.get('b')).toBe(1);
    expect(counts.size).toBe(2);
  });

  it('deep-links to the offending entry', () => {
    expect(attentionLink(items[0])).toBe('/apps/a/prod/config?key=K');
    expect(attentionLink(items[1])).toBe('/apps/a/prod/secrets?key=S');
    expect(attentionLink(items[2])).toBe('/apps/b/dev');
    expect(attentionLink(items[3])).toBe('/global/secrets?key=G');
    expect(attentionLink(item({ kind: 'rotation-due', application: 'a', environment: '*', target: 'R' }))).toBe(
      '/apps/a?key=R'
    );
    expect(attentionLink(item({ kind: 'config-empty-value', application: null, environment: 'prod', target: 'C' }))).toBe(
      '/global/config?key=C'
    );
  });

  it('labels every known kind and falls back for unknown ones', () => {
    expect(attentionLabel('secret-no-valid-version')).toBe('No valid secret version');
    expect(attentionLabel('rotation-due')).toBe('Rotation due');
    expect(attentionLabel('something-new')).toBe('Something new');
  });

  it('describes due dates and last seen times', () => {
    expect(attentionDetail(item({ kind: 'consumer-never-seen' }))).toBe('no recorded fetches');
    expect(attentionDetail(item({ kind: 'consumer-stale', lastSeenAt: new Date(Date.now() - 9 * 86400_000).toISOString() }))).toBe(
      'last seen 9 days ago'
    );
    expect(attentionDetail(item({ kind: 'secret-expiring', dueAt: null }))).toBeNull();
    expect(attentionDetail(item({ kind: 'config-empty-value' }))).toBeNull();
  });
});

describe('activityLink', () => {
  it('links to the most specific place an event names', () => {
    expect(
      activityLink({ occurredAt: '', action: 'Updated', application: 'a', environment: 'prod', target: 'K', targetType: 'configuration' })
    ).toBe('/apps/a/prod/config?key=K');
    expect(activityLink({ occurredAt: '', action: 'Created application', application: 'a' })).toBe('/apps/a');
    expect(activityLink({ occurredAt: '', action: 'Updated', target: 'S', targetType: 'secret' })).toBe('/global/secrets?key=S');
    expect(activityLink({ occurredAt: '', action: 'Signed in' })).toBeNull();
  });
});

describe('sortAndFilterApps', () => {
  const apps = [
    app({ slug: 'beta', name: 'Beta', lastChangedAt: hoursAgo(1), lastSeenAt: null }),
    app({ slug: 'alpha', name: 'alpha', lastChangedAt: hoursAgo(5), lastSeenAt: hoursAgo(1) }),
    { ...app({ slug: 'gamma', name: 'Gamma', lastChangedAt: null, lastSeenAt: hoursAgo(3) }), description: 'payments gateway' },
  ];

  it('sorts by name case-insensitively', () => {
    expect(sortAndFilterApps(apps, 'name', '').map((a) => a.slug)).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('sorts dates most recent first with missing values last', () => {
    expect(sortAndFilterApps(apps, 'lastChanged', '').map((a) => a.slug)).toEqual(['beta', 'alpha', 'gamma']);
    expect(sortAndFilterApps(apps, 'lastFetched', '').map((a) => a.slug)).toEqual(['alpha', 'gamma', 'beta']);
  });

  it('filters by name, slug and description without mutating the input', () => {
    expect(sortAndFilterApps(apps, 'name', 'PAY').map((a) => a.slug)).toEqual(['gamma']);
    expect(sortAndFilterApps(apps, 'name', 'bet').map((a) => a.slug)).toEqual(['beta']);
    expect(apps[0].slug).toBe('beta');
  });
});

describe('invalidateDashboardOnMutations', () => {
  it('invalidates the dashboard after successful writes only', async () => {
    const client = axios.create();
    client.defaults.adapter = async (config) => ({
      data: {},
      status: config.url === '/fail' ? 409 : 200,
      statusText: '',
      headers: {},
      config,
    });
    client.defaults.validateStatus = () => true;
    const queryClient = new QueryClient();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    invalidateDashboardOnMutations(client, queryClient);

    await client.get('/applications');
    expect(spy).not.toHaveBeenCalled();
    await client.post('/fail');
    expect(spy).not.toHaveBeenCalled();
    await client.put('/applications/a', {});
    await client.delete('/applications/a');
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenCalledWith({ queryKey: DASHBOARD_QUERY_KEY });
  });
});
