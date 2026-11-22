import type { SecretVersion, SecretVersionStatus } from '@/types/api';

/**
 * Mirrors the API's resolution rule (guibranco/grimoire-api#96): the highest version that is
 * enabled and inside its notBefore/expiresAt window is served. Used by the demo API and as a
 * fallback when an older API doesn't send `isCurrent`/`status`.
 */
export const MAX_GRACE_DAYS = 3650;

const time = (v: string | null | undefined) => (v ? new Date(v).getTime() : null);

export function isValidVersion(v: Pick<SecretVersion, 'isEnabled' | 'notBefore' | 'expiresAt'>, now = Date.now()) {
  const nb = time(v.notBefore);
  const exp = time(v.expiresAt);
  return v.isEnabled && (nb === null || nb <= now) && (exp === null || exp >= now);
}

export function currentVersion(versions: SecretVersion[], now = Date.now()): number | null {
  const valid = versions.filter((v) => isValidVersion(v, now)).map((v) => v.version);
  return valid.length ? Math.max(...valid) : null;
}

export function versionStatus(v: SecretVersion, current: number | null, now = Date.now()): SecretVersionStatus {
  if (!v.isEnabled) return 'disabled';
  const exp = time(v.expiresAt);
  if (exp !== null && exp < now) return 'expired';
  const nb = time(v.notBefore);
  if (nb !== null && nb > now) return 'scheduled';
  return v.version === current ? 'current' : 'valid';
}

/** Newest first, with `isCurrent`/`status` filled in when the API didn't send them. */
export function withStatus(versions: SecretVersion[], now = Date.now()): SecretVersion[] {
  const current = currentVersion(versions, now);
  return [...versions]
    .sort((a, b) => b.version - a.version)
    .map((v) => ({
      ...v,
      isCurrent: v.isCurrent ?? v.version === current,
      status: v.status || versionStatus(v, current, now),
    }));
}

/** Enabled versions with no expiry, other than the current one: older values still accepted. */
export function openEndedOlderVersions(versions: SecretVersion[]): SecretVersion[] {
  return versions.filter((v) => v.isEnabled && !v.expiresAt && !v.isCurrent && v.status !== 'scheduled');
}

/** Versions a grace period expires: enabled, with no expiry or one later than `expiresAt`. */
export function versionsToExpire<T extends Pick<SecretVersion, 'isEnabled' | 'expiresAt'>>(versions: T[], expiresAt: Date): T[] {
  return versions.filter((v) => v.isEnabled && (!v.expiresAt || new Date(v.expiresAt) > expiresAt));
}

/** `true` when changing `target` to `next` would leave no valid version although one exists now. */
export function wouldLeaveNoValidVersion(
  versions: SecretVersion[],
  target: number,
  next: Pick<SecretVersion, 'isEnabled' | 'notBefore' | 'expiresAt'>,
  now = Date.now()
) {
  if (currentVersion(versions, now) === null) return false;
  const after = versions.map((v) => (v.version === target ? { ...v, ...next } : v));
  return currentVersion(after, now) === null;
}

export const STATUS_LABELS: Record<SecretVersionStatus, string> = {
  current: 'Current',
  valid: 'Valid',
  scheduled: 'Scheduled',
  expired: 'Expired',
  disabled: 'Disabled',
};
