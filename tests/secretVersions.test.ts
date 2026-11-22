import { describe, it, expect, beforeEach } from 'vitest';
import {
  currentVersion,
  openEndedOlderVersions,
  versionsToExpire,
  versionStatus,
  withStatus,
  wouldLeaveNoValidVersion,
} from '../src/lib/secretVersions';
import { api } from '../src/lib/api';
import { resetMockDatabase } from '../src/lib/mockApi';
import type { SecretVersion } from '../src/types/api';

const NOW = Date.parse('2026-11-22T12:00:00Z');
const day = 24 * 60 * 60 * 1000;
const iso = (offsetDays: number) => new Date(NOW + offsetDays * day).toISOString();
const v = (version: number, extra: Partial<SecretVersion> = {}): SecretVersion => ({
  version,
  isEnabled: true,
  notBefore: null,
  expiresAt: null,
  ...extra,
});

describe('secret version rules', () => {
  it('serves the highest valid version and labels the rest', () => {
    const versions = [v(1), v(2, { expiresAt: iso(-1) }), v(3, { notBefore: iso(1) }), v(4, { isEnabled: false })];
    expect(currentVersion(versions, NOW)).toBe(1);
    expect(versions.map((x) => versionStatus(x, 1, NOW))).toEqual(['current', 'expired', 'scheduled', 'disabled']);
    expect(currentVersion([v(1, { isEnabled: false })], NOW)).toBeNull();
  });

  it('fills isCurrent/status only when the API did not send them', () => {
    const filled = withStatus([v(1), v(2)], NOW);
    expect(filled.map((x) => [x.version, x.isCurrent, x.status])).toEqual([
      [2, true, 'current'],
      [1, false, 'valid'],
    ]);
    const fromApi = withStatus([v(1, { isCurrent: true, status: 'current' })], NOW);
    expect(fromApi[0].status).toBe('current');
  });

  it('finds older open-ended versions, ignoring scheduled and expiring ones', () => {
    const versions = withStatus([v(1), v(2, { expiresAt: iso(5) }), v(3), v(4, { notBefore: iso(2) })], NOW);
    expect(openEndedOlderVersions(versions).map((x) => x.version)).toEqual([1]);
  });

  it('expires enabled versions with no or a later expiry', () => {
    const cutoff = new Date(NOW + 7 * day);
    const picked = versionsToExpire([v(1), v(2, { expiresAt: iso(30) }), v(3, { expiresAt: iso(2) }), v(4, { isEnabled: false })], cutoff);
    expect(picked.map((x) => x.version)).toEqual([1, 2]);
  });

  it('flags changes that would leave no valid version', () => {
    expect(wouldLeaveNoValidVersion([v(1), v(2)], 2, { isEnabled: false, notBefore: null, expiresAt: null }, NOW)).toBe(false);
    expect(wouldLeaveNoValidVersion([v(2)], 2, { isEnabled: false, notBefore: null, expiresAt: null }, NOW)).toBe(true);
    expect(wouldLeaveNoValidVersion([v(2, { isEnabled: false })], 2, { isEnabled: false, notBefore: null, expiresAt: null }, NOW)).toBe(false);
  });
});

describe('mock secret version lifecycle', () => {
  const versionsUrl = '/applications/production-gateway/secrets/ROTATE_ME/versions/staging';
  const versions = async () => (await api.get<SecretVersion[]>(versionsUrl)).data;
  const addValue = (value: string, extra: Record<string, unknown> = {}) =>
    api.post('/applications/production-gateway/secrets/ROTATE_ME/values', [{ environmentSlug: 'staging', value, ...extra }]);

  beforeEach(async () => {
    localStorage.setItem('grimoire_api_url', 'mock://');
    localStorage.setItem('grimoire_api_key', 'mock_admin_key');
    resetMockDatabase();
    await api.post('/applications/production-gateway/secrets', { name: 'ROTATE_ME' });
    await addValue('one');
  });

  it('returns status and isCurrent, newest first', async () => {
    await addValue('two');
    const list = await versions();
    expect(list.map((x) => [x.version, x.status, x.isCurrent])).toEqual([
      [2, 'current', true],
      [1, 'valid', false],
    ]);
  });

  it('applies previousVersionGraceDays to older versions', async () => {
    await addValue('two', { previousVersionGraceDays: 3 });
    const v1 = (await versions()).find((x) => x.version === 1)!;
    const expires = Date.parse(v1.expiresAt!);
    expect(expires - Date.now()).toBeGreaterThan(3 * day - 60_000);
    expect(expires - Date.now()).toBeLessThan(3 * day + 60_000);
  });

  it('updates a version, guarding the last valid one unless forced', async () => {
    const refused = await api.patch(`${versionsUrl}/1`, { isEnabled: false });
    expect(refused.status).toBe(409);
    const forced = await api.patch(`${versionsUrl}/1`, { isEnabled: false }, { params: { force: true } });
    expect(forced.status).toBe(200);
    expect(forced.data.status).toBe('disabled');
    expect((await api.patch(`${versionsUrl}/1`, { expiresAt: iso(1), clearExpiresAt: true })).status).toBe(400);
    expect((await api.patch(`${versionsUrl}/9`, { isEnabled: true })).status).toBe(404);
  });

  it('records version updates in the audit log', async () => {
    await addValue('two');
    await api.patch(`${versionsUrl}/1`, { isEnabled: false });
    const page = (await api.get('/audit', { params: { action: 'secret.version-update' } })).data;
    expect(page.items[0]).toMatchObject({ description: 'Updated secret version', target: 'ROTATE_ME', environment: 'staging' });
  });
});
