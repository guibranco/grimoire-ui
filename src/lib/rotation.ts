import type { ExpiringSecret, ExpiringSecretsResponse, SecretDueReason, SecretVersion } from '@/types/api';
import { appPath, globalPath, DEFAULT_ROTATION_WINDOW } from '@/lib/routes';
import { isValidVersion } from '@/lib/secretVersions';

/**
 * Rotation rules, mirroring the API's `SecretDueRules` (guibranco/grimoire-api#78) so the demo
 * API, the dashboard and the rotation page agree. Also the UI helpers for `/rotation`.
 */

export const EXPIRING_QUERY_KEY = ['expiring-secrets'] as const;
export const MAX_ROTATION_INTERVAL_DAYS = 3650;

/** Windows offered on the rotation page and the dashboard widget. */
export const ROTATION_WINDOWS = [7, 30, 90] as const;
export type RotationWindow = (typeof ROTATION_WINDOWS)[number];
export { DEFAULT_ROTATION_WINDOW };

export const isRotationWindow = (value: unknown): value is RotationWindow =>
  ROTATION_WINDOWS.includes(Number(value) as RotationWindow);

const DAY_MS = 24 * 60 * 60 * 1000;
const time = (v: string | null | undefined) => {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
};

export interface SecretDue {
  reason: SecretDueReason;
  dueAt: string;
  version: number;
}

type VersionLike = Pick<SecretVersion, 'version' | 'isEnabled' | 'notBefore' | 'expiresAt' | 'createdAt'>;

/**
 * When a secret (in one environment) next needs rotating: the earlier of the current version's
 * expiry and its rotation date (`rotationIntervalDays` after `notBefore`, else `createdAt`). A
 * newer version scheduled to take over by then means the rotation is planned. With no valid
 * version left, `expired` when the latest enabled one expired.
 */
export function secretDue(
  versions: VersionLike[],
  rotationIntervalDays: number | null | undefined,
  now = Date.now()
): SecretDue | null {
  const valid = versions.filter((v) => isValidVersion(v, now));
  const current = valid.reduce<VersionLike | null>((best, v) => (!best || v.version > best.version ? v : best), null);

  if (!current) {
    const latest = versions
      .filter((v) => v.isEnabled)
      .reduce<VersionLike | null>((best, v) => (!best || v.version > best.version ? v : best), null);
    const expiredAt = time(latest?.expiresAt);
    return latest && expiredAt !== null && expiredAt <= now
      ? { reason: 'expired', dueAt: new Date(expiredAt).toISOString(), version: latest.version }
      : null;
  }

  const expiresAt = time(current.expiresAt);
  const start = time(current.notBefore) ?? time(current.createdAt);
  const rotationAt = rotationIntervalDays && rotationIntervalDays > 0 && start !== null ? start + rotationIntervalDays * DAY_MS : null;

  let due: { reason: SecretDueReason; at: number } | null = null;
  if (expiresAt !== null && (rotationAt === null || expiresAt <= rotationAt)) due = { reason: 'expiry', at: expiresAt };
  else if (rotationAt !== null) due = { reason: 'rotation', at: rotationAt };
  if (!due) return null;

  const dueAt = due.at;
  const replaced = versions.some((v) => {
    const nb = time(v.notBefore);
    const exp = time(v.expiresAt);
    return v.isEnabled && v.version > current.version && nb !== null && nb <= dueAt && (exp === null || exp > dueAt);
  });
  return replaced ? null : { reason: due.reason, dueAt: new Date(dueAt).toISOString(), version: current.version };
}

/** Whole UTC calendar days from `now` to `dueAt`; negative when overdue. */
export function daysRemaining(dueAt: string, now = Date.now()): number {
  const startOfDay = (t: number) => {
    const d = new Date(t);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  };
  return Math.round((startOfDay(new Date(dueAt).getTime()) - startOfDay(now)) / DAY_MS);
}

export type DueBucket = 'overdue' | 'week' | 'month' | 'later';

/** Colour bucket: overdue/expired, within 7 days, within 30 days, later. */
export function dueBucket(item: Pick<ExpiringSecret, 'daysRemaining' | 'reason'>): DueBucket {
  if (item.reason === 'expired' || item.daysRemaining < 0) return 'overdue';
  if (item.daysRemaining <= 7) return 'week';
  if (item.daysRemaining <= 30) return 'month';
  return 'later';
}

export const BUCKET_STYLES: Record<DueBucket, { label: string; text: string; badge: string; dot: string }> = {
  overdue: { label: 'Overdue', text: 'text-red-400', badge: 'border-red-500/40 bg-red-500/10 text-red-400', dot: 'bg-red-500' },
  week: { label: '≤ 7 days', text: 'text-amber-400', badge: 'border-amber-500/40 bg-amber-500/10 text-amber-400', dot: 'bg-amber-500' },
  month: { label: '≤ 30 days', text: 'text-yellow-300', badge: 'border-yellow-400/30 bg-yellow-400/5 text-yellow-300', dot: 'bg-yellow-400' },
  later: { label: 'Later', text: 'text-zinc-400', badge: 'border-zinc-700 bg-zinc-900 text-zinc-400', dot: 'bg-zinc-500' },
};

export const REASON_LABELS: Record<string, string> = {
  expiry: 'Expires',
  rotation: 'Rotation due',
  expired: 'Expired',
};

export const reasonLabel = (reason: string) => REASON_LABELS[reason] ?? reason;

/** "in 5 days", "today", "3 days ago". */
export function dueInWords(days: number): string {
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

export interface DueCounts {
  overdue: number;
  week: number;
  month: number;
  quarter: number;
}

/** Cumulative counts for the dashboard widget: overdue, and due within 7 / 30 / 90 days (overdue included). */
export function dueCounts(items: ExpiringSecret[]): DueCounts {
  const counts: DueCounts = { overdue: 0, week: 0, month: 0, quarter: 0 };
  for (const item of items) {
    const bucket = dueBucket(item);
    if (bucket === 'overdue') counts.overdue++;
    if (item.daysRemaining <= 7) counts.week++;
    if (item.daysRemaining <= 30) counts.month++;
    if (item.daysRemaining <= 90) counts.quarter++;
  }
  return counts;
}

/** Link to the secret in its application (environment + secrets tab) or in Global. */
export function expiringSecretLink(item: ExpiringSecret): string {
  if (item.isGlobal || !item.application) return globalPath('secrets', item.secret);
  return appPath(item.application, item.environment, 'secrets', item.secret);
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Validates an expiring-secrets payload; throws when it isn't one (e.g. an API without #78). */
export function parseExpiring(data: unknown): ExpiringSecretsResponse {
  if (!isRecord(data) || !Array.isArray(data.items)) throw new Error('Unexpected expiring-secrets response');
  return {
    generatedAt: typeof data.generatedAt === 'string' ? data.generatedAt : new Date().toISOString(),
    withinDays: typeof data.withinDays === 'number' ? data.withinDays : DEFAULT_ROTATION_WINDOW,
    items: (data.items as unknown[]).filter(isRecord).map((i) => {
      const item = i as unknown as ExpiringSecret;
      return {
        ...item,
        isGlobal: item.isGlobal ?? !item.application,
        daysRemaining: typeof item.daysRemaining === 'number' ? item.daysRemaining : daysRemaining(item.dueAt),
        rotationIntervalDays: item.rotationIntervalDays ?? null,
      };
    }),
  };
}

/** Parses a "rotate every N days" form field: a whole number 1–3650, `null` when empty or invalid. */
export const rotationIntervalValue = (raw: unknown): number | null => {
  if (raw === null || raw === undefined || String(raw).trim() === '') return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= MAX_ROTATION_INTERVAL_DAYS ? n : null;
};

export const isRotationIntervalInput = (raw: string | null | undefined) =>
  raw === null || raw === undefined || raw.trim() === '' || rotationIntervalValue(raw) !== null;

export const ROTATION_INTERVAL_MESSAGE = `Whole days between 1 and ${MAX_ROTATION_INTERVAL_DAYS}`;
