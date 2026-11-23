import type { ConfigurationRevision } from '@/types/api';

/** Where a configuration key lives: an application environment, or a global environment slug (`*` included). */
export type ConfigScope = { appSlug: string; envSlug: string } | { global: true; envSlug: string };

const seg = encodeURIComponent;

export const isGlobalScope = (scope: ConfigScope): scope is { global: true; envSlug: string } => 'global' in scope;

/** `/applications/{app}/configurations/{env}/{key}` or `/global/configurations/{env}/{key}`. */
export function configEntryUrl(scope: ConfigScope, key: string): string {
  return isGlobalScope(scope)
    ? `/global/configurations/${seg(scope.envSlug)}/${seg(key)}`
    : `/applications/${seg(scope.appSlug)}/configurations/${seg(scope.envSlug)}/${seg(key)}`;
}

export const configHistoryUrl = (scope: ConfigScope, key: string) => `${configEntryUrl(scope, key)}/history`;
export const configRollbackUrl = (scope: ConfigScope, key: string, revision: number) =>
  `${configEntryUrl(scope, key)}/rollback/${revision}`;

export const CHANGE_LABELS: Record<string, string> = {
  baseline: 'Baseline',
  create: 'Created',
  update: 'Updated',
  delete: 'Deleted',
  rollback: 'Rolled back',
};

export const changeLabel = (change: string) => CHANGE_LABELS[change] ?? change;

/** Revisions that can be restored: they have a value and aren't the key's current state. */
export function canRollBackTo(revision: ConfigurationRevision, newest: ConfigurationRevision | undefined): boolean {
  if (revision.value === null || !newest || revision.revision === newest.revision) return false;
  return !(
    newest.value === revision.value &&
    newest.valueType === revision.valueType &&
    (newest.description ?? null) === (revision.description ?? null)
  );
}

export type DiffLine = { kind: 'same' | 'added' | 'removed'; text: string };

/**
 * Line diff (longest common subsequence) between two values. Values are small configuration
 * entries, so the quadratic table is fine; very long inputs fall back to remove-all/add-all.
 */
export function lineDiff(before: string | null, after: string | null, maxCells = 250_000): DiffLine[] {
  const a = before === null ? [] : before.split('\n');
  const b = after === null ? [] : after.split('\n');
  if (a.length * b.length > maxCells) {
    return [...a.map((text) => ({ kind: 'removed' as const, text })), ...b.map((text) => ({ kind: 'added' as const, text }))];
  }
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ kind: 'same', text: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ kind: 'removed', text: a[i++] });
    } else {
      out.push({ kind: 'added', text: b[j++] });
    }
  }
  while (i < a.length) out.push({ kind: 'removed', text: a[i++] });
  while (j < b.length) out.push({ kind: 'added', text: b[j++] });
  return out;
}
