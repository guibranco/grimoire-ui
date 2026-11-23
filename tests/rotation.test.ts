import { describe, it, expect } from 'vitest';
import {
  daysRemaining,
  dueBucket,
  dueCounts,
  dueInWords,
  expiringSecretLink,
  parseExpiring,
  rotationIntervalValue,
  secretDue,
} from '../src/lib/rotation';
import { rotationPath } from '../src/lib/routes';
import { secretUpdateBody } from '../src/components/grimoire/EditSecretModal';
import type { ExpiringSecret, SecretVersion } from '../src/types/api';

const NOW = new Date('2026-11-23T12:00:00.000Z').getTime();
const DAY = 24 * 60 * 60 * 1000;
const at = (days: number) => new Date(NOW + days * DAY).toISOString();

const v = (version: number, overrides: Partial<SecretVersion> = {}): SecretVersion => ({
  version,
  isEnabled: true,
  expiresAt: null,
  notBefore: null,
  createdAt: at(-1),
  ...overrides,
});

const item = (overrides: Partial<ExpiringSecret>): ExpiringSecret => ({
  application: 'billing',
  applicationName: 'Billing',
  secret: 'DB_PASSWORD',
  environment: 'production',
  isGlobal: false,
  version: 1,
  reason: 'rotation',
  dueAt: at(5),
  daysRemaining: 5,
  rotationIntervalDays: 90,
  ...overrides,
});

describe('secretDue (mirrors the API SecretDueRules)', () => {
  it('is never due without expiry or interval', () => {
    expect(secretDue([v(1)], null, NOW)).toBeNull();
  });

  it('uses the current version expiry', () => {
    expect(secretDue([v(1, { expiresAt: at(5) })], null, NOW)).toEqual({ reason: 'expiry', dueAt: at(5), version: 1 });
  });

  it('counts rotation from notBefore, else createdAt', () => {
    expect(secretDue([v(1, { createdAt: at(-80) })], 90, NOW)?.dueAt).toBe(at(10));
    expect(secretDue([v(1, { createdAt: at(-80), notBefore: at(-30) })], 90, NOW)?.dueAt).toBe(at(60));
  });

  it('takes the earlier of expiry and rotation', () => {
    expect(secretDue([v(1, { createdAt: at(0), expiresAt: at(5) })], 10, NOW)?.reason).toBe('expiry');
    expect(secretDue([v(1, { createdAt: at(0), expiresAt: at(10) })], 5, NOW)?.reason).toBe('rotation');
  });

  it('only looks at the current version', () => {
    expect(secretDue([v(1, { expiresAt: at(2) }), v(2, { createdAt: at(0) })], 30, NOW)).toEqual({
      reason: 'rotation',
      dueAt: at(30),
      version: 2,
    });
  });

  it('treats a scheduled replacement before the due date as planned', () => {
    expect(secretDue([v(1, { expiresAt: at(5) }), v(2, { notBefore: at(4) })], null, NOW)).toBeNull();
    expect(secretDue([v(1, { expiresAt: at(5) }), v(2, { notBefore: at(6) })], null, NOW)?.reason).toBe('expiry');
  });

  it('reports expired when the latest enabled version expired', () => {
    expect(secretDue([v(1, { expiresAt: at(-3) }), v(2, { isEnabled: false })], 30, NOW)).toEqual({
      reason: 'expired',
      dueAt: at(-3),
      version: 1,
    });
    expect(secretDue([v(1, { isEnabled: false })], 30, NOW)).toBeNull();
  });
});

describe('rotation helpers', () => {
  it('counts UTC calendar days', () => {
    expect(daysRemaining('2026-11-24T01:00:00.000Z', NOW)).toBe(1);
    expect(daysRemaining('2026-11-23T23:00:00.000Z', NOW)).toBe(0);
    expect(daysRemaining(at(-2), NOW)).toBe(-2);
  });

  it('buckets and words due dates', () => {
    expect(dueBucket(item({ daysRemaining: -1 }))).toBe('overdue');
    expect(dueBucket(item({ reason: 'expired', daysRemaining: 0 }))).toBe('overdue');
    expect(dueBucket(item({ daysRemaining: 7 }))).toBe('week');
    expect(dueBucket(item({ daysRemaining: 8 }))).toBe('month');
    expect(dueBucket(item({ daysRemaining: 31 }))).toBe('later');
    expect([0, 1, -1, 5, -3].map(dueInWords)).toEqual(['today', 'tomorrow', 'yesterday', 'in 5 days', '3 days ago']);
  });

  it('counts cumulatively for the dashboard widget', () => {
    const counts = dueCounts([-2, 3, 20, 60, 120].map((d) => item({ daysRemaining: d })));
    expect(counts).toEqual({ overdue: 1, week: 2, month: 3, quarter: 4 });
  });

  it('links to the secret in its application or in Global', () => {
    expect(expiringSecretLink(item({}))).toBe('/apps/billing/production/secrets?key=DB_PASSWORD');
    expect(expiringSecretLink(item({ application: null, isGlobal: true, environment: '*' }))).toBe(
      '/global/secrets?key=DB_PASSWORD'
    );
  });

  it('builds the rotation path, omitting the default window', () => {
    expect(rotationPath()).toBe('/rotation');
    expect(rotationPath(30)).toBe('/rotation');
    expect(rotationPath(7)).toBe('/rotation?within=7');
  });

  it('parses payloads and rejects anything else', () => {
    const parsed = parseExpiring({ generatedAt: at(0), withinDays: 7, items: [{ ...item({}), isGlobal: undefined, daysRemaining: undefined }] });
    expect(parsed.withinDays).toBe(7);
    expect(parsed.items[0]).toMatchObject({ isGlobal: false, rotationIntervalDays: 90 });
    expect(typeof parsed.items[0].daysRemaining).toBe('number');
    expect(() => parseExpiring({ title: 'Not Found' })).toThrow();
  });

  it('validates the rotation interval field', () => {
    expect(rotationIntervalValue('90')).toBe(90);
    expect(rotationIntervalValue('')).toBeNull();
    expect(rotationIntervalValue('0')).toBeNull();
    expect(rotationIntervalValue('3651')).toBeNull();
    expect(rotationIntervalValue('1.5')).toBeNull();
  });

  it('sends only what changed when editing a secret', () => {
    const secret = { description: 'db', rotationIntervalDays: 90 };
    expect(secretUpdateBody(secret, { description: 'db', rotationIntervalDays: '90' })).toBeNull();
    expect(secretUpdateBody(secret, { description: 'db', rotationIntervalDays: '30' })).toEqual({ rotationIntervalDays: 30 });
    expect(secretUpdateBody(secret, { description: '', rotationIntervalDays: '' })).toEqual({
      clearDescription: true,
      clearRotationInterval: true,
    });
    expect(secretUpdateBody({ description: null }, { description: 'new', rotationIntervalDays: '7' })).toEqual({
      description: 'new',
      rotationIntervalDays: 7,
    });
  });
});
