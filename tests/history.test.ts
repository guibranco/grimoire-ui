import { describe, it, expect } from 'vitest';
import { canRollBackTo, configHistoryUrl, configRollbackUrl, lineDiff } from '../src/lib/history';
import { comparePath } from '../src/lib/routes';
import type { ConfigurationRevision } from '../src/types/api';

const rev = (revision: number, value: string | null, overrides: Partial<ConfigurationRevision> = {}): ConfigurationRevision => ({
  revision,
  change: value === null ? 'delete' : 'update',
  value,
  valueType: 'string',
  description: null,
  rolledBackFrom: null,
  changedBy: 'admin',
  changedAt: '2026-11-23T00:00:00Z',
  ...overrides,
});

describe('history helpers', () => {
  it('builds app and global URLs, encoding segments', () => {
    expect(configHistoryUrl({ appSlug: 'billing', envSlug: 'prod' }, 'A/B')).toBe('/applications/billing/configurations/prod/A%2FB/history');
    expect(configRollbackUrl({ global: true, envSlug: '*' }, 'K', 3)).toBe('/global/configurations/*/K/rollback/3');
    expect(comparePath('billing', 'staging', 'production')).toBe('/apps/billing/staging/compare?to=production');
    expect(comparePath('billing', 'staging')).toBe('/apps/billing/staging/compare');
  });

  it('offers rollback only for older revisions with a different value', () => {
    const newest = rev(3, 'b');
    expect(canRollBackTo(rev(2, 'a'), newest)).toBe(true);
    expect(canRollBackTo(newest, newest)).toBe(false);
    expect(canRollBackTo(rev(1, 'b'), newest)).toBe(false);
    expect(canRollBackTo(rev(1, 'b', { valueType: 'multiline' }), newest)).toBe(true);
    expect(canRollBackTo(rev(2, null), newest)).toBe(false);
    expect(canRollBackTo(rev(2, 'a'), rev(3, null))).toBe(true);
  });

  it('diffs values line by line', () => {
    expect(lineDiff('a\nb\nc', 'a\nx\nc')).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'removed', text: 'b' },
      { kind: 'added', text: 'x' },
      { kind: 'same', text: 'c' },
    ]);
    expect(lineDiff(null, 'new')).toEqual([{ kind: 'added', text: 'new' }]);
    expect(lineDiff('old', null)).toEqual([{ kind: 'removed', text: 'old' }]);
  });

  it('falls back to remove-all/add-all for huge values', () => {
    const big = Array.from({ length: 10 }, (_, i) => `l${i}`).join('\n');
    const diff = lineDiff(big, big + '\nz', 50);
    expect(diff.filter((d) => d.kind === 'removed')).toHaveLength(10);
    expect(diff.filter((d) => d.kind === 'added')).toHaveLength(11);
  });
});
