import { describe, it, expect, beforeEach } from 'vitest';
import {
  AUDIT_ACTION_LABELS,
  auditEventLink,
  EMPTY_AUDIT_FILTERS,
  filtersFromSearchParams,
  filtersToApiParams,
  filtersToSearchParams,
  hasActiveFilters,
} from '../src/lib/audit';
import { auditPath, isAppTab } from '../src/lib/routes';
import { api } from '../src/lib/api';
import { resetMockDatabase } from '../src/lib/mockApi';
import type { AuditEvent, AuditPage } from '../src/types/api';

const event = (overrides: Partial<AuditEvent>): AuditEvent => ({
  id: 'e1',
  occurredAt: '2026-11-22T10:00:00Z',
  actor: 'admin',
  action: 'secret.write',
  description: 'Added secret version',
  application: 'app',
  environment: 'production',
  targetType: 'secret',
  target: 'DB_PASS',
  outcome: 'success',
  statusCode: 201,
  ...overrides,
});

describe('audit filters', () => {
  it('round-trips through the URL, keeping only non-defaults', () => {
    const filters = { ...EMPTY_AUDIT_FILTERS, action: 'secret.*', includeReads: false, page: 3 };
    const params = filtersToSearchParams(filters);
    expect(params.toString()).toBe('action=secret.*&includeReads=false&page=3');
    expect(filtersFromSearchParams(params)).toEqual(filters);
    expect(filtersToSearchParams(EMPTY_AUDIT_FILTERS).toString()).toBe('');
  });

  it('ignores invalid page numbers', () => {
    expect(filtersFromSearchParams(new URLSearchParams('page=-2')).page).toBe(1);
    expect(filtersFromSearchParams(new URLSearchParams('page=abc')).page).toBe(1);
  });

  it('turns whole days into an inclusive ISO range for the API', () => {
    const params = filtersToApiParams({ ...EMPTY_AUDIT_FILTERS, from: '2026-11-01', to: '2026-11-02' });
    expect(new Date(params.from as string).getTime()).toBe(new Date('2026-11-01T00:00:00').getTime());
    expect(new Date(params.to as string).getTime()).toBe(new Date('2026-11-02T23:59:59.999').getTime());
    expect(params).not.toHaveProperty('includeReads');
    expect(filtersToApiParams({ ...EMPTY_AUDIT_FILTERS, includeReads: false }).includeReads).toBe(false);
  });

  it('detects active filters, optionally ignoring pinned ones', () => {
    expect(hasActiveFilters(EMPTY_AUDIT_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...EMPTY_AUDIT_FILTERS, page: 4 })).toBe(false);
    const pinned = { ...EMPTY_AUDIT_FILTERS, application: 'app' };
    expect(hasActiveFilters(pinned)).toBe(true);
    expect(hasActiveFilters(pinned, ['application'])).toBe(false);
  });

  it('builds the audit route and accepts the activity app tab', () => {
    expect(auditPath()).toBe('/audit');
    expect(auditPath({ includeReads: false, action: null })).toBe('/audit?includeReads=false');
    expect(isAppTab('activity')).toBe(true);
  });
});

describe('auditEventLink', () => {
  it('opens the entry in its application, environment and tab', () => {
    expect(auditEventLink(event({}))).toBe('/apps/app/production/secrets?key=DB_PASS');
    expect(auditEventLink(event({ targetType: 'configuration', target: 'HOST' }))).toBe('/apps/app/production/config?key=HOST');
  });

  it('opens Global entries in Global', () => {
    expect(auditEventLink(event({ application: null, action: 'global-secret.write' }))).toBe('/global/secrets?key=DB_PASS');
  });

  it('does not highlight deleted entries or link deleted applications', () => {
    expect(auditEventLink(event({ action: 'secret.delete' }))).toBe('/apps/app/production/secrets');
    expect(auditEventLink(event({ action: 'application.delete', targetType: 'application' }))).toBeNull();
  });

  it('skips the environment when several were touched', () => {
    expect(auditEventLink(event({ environment: 'local,production' }))).toBe('/apps/app');
  });
});

describe('mock GET /audit', () => {
  beforeEach(() => {
    localStorage.setItem('grimoire_api_url', 'mock://');
    localStorage.setItem('grimoire_api_key', 'mock_admin_key');
    resetMockDatabase();
  });

  const audit = async (params: Record<string, unknown> = {}) => (await api.get<AuditPage>('/audit', { params })).data;

  it('returns codes with descriptions, newest first, and never values', async () => {
    const page = await audit();
    expect(page.totalCount).toBeGreaterThan(0);
    const times = page.items.map((i) => Date.parse(i.occurredAt));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    for (const item of page.items) {
      expect(item.description).toBe(AUDIT_ACTION_LABELS[item.action] ?? item.description);
      expect(item).not.toHaveProperty('value');
    }
  });

  it('filters by action prefix, reads, outcome and application', async () => {
    const secrets = await audit({ action: 'secret.*' });
    expect(secrets.items.every((i) => i.action.startsWith('secret.'))).toBe(true);
    const noReads = await audit({ action: 'secret.*', includeReads: false });
    expect(noReads.items.some((i) => i.action.endsWith('.read'))).toBe(false);
    expect(noReads.totalCount).toBeLessThan(secrets.totalCount);
    const notFound = await audit({ outcome: 'notfound' });
    expect(notFound.items.every((i) => i.outcome === 'notfound')).toBe(true);
    const app = await audit({ application: 'production-gateway' });
    expect(app.items.every((i) => i.application === 'production-gateway')).toBe(true);
  });

  it('records changes made through the mock API', async () => {
    await api.post('/applications/production-gateway/configurations', { environmentSlug: 'staging', key: 'NEW_KEY', value: 'v' });
    const page = await audit({ target: 'NEW_KEY' });
    expect(page.items[0]).toMatchObject({ action: 'configuration.create', description: 'Created configuration', actor: 'admin', environment: 'staging', statusCode: 201 });
  });

  it('pages and validates like the API', async () => {
    const first = await audit({ pageSize: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.totalCount).toBeGreaterThan(2);
    expect((await api.get('/audit', { params: { pageSize: 0 } })).status).toBe(400);
    expect((await api.get('/audit', { params: { outcome: 'maybe' } })).status).toBe(400);
    expect((await api.get('/audit', { params: { from: '2026-02-01', to: '2026-01-01' } })).status).toBe(400);
  });

  it('keeps reads and rejected requests out of the dashboard feed', async () => {
    const dashboard = (await api.get('/dashboard')).data;
    expect(dashboard.recentActivity.length).toBeGreaterThan(0);
    for (const e of dashboard.recentActivity) {
      expect(e.code.endsWith('.read')).toBe(false);
      expect(e.code).not.toBe('auth.failed');
    }
  });
});
