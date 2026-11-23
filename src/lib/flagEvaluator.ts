import type { FlagCondition, FlagServe, FlagVariant, RolloutSlice, TargetingRule } from '@/types/api';

/**
 * TypeScript implementation of the feature flag evaluation spec (guibranco/grimoire-api
 * `docs/feature-flags/evaluation-spec.md`). Used by the demo API's dry run; checked against the
 * shared test vectors so it serves exactly what every Grimoire client would.
 */

export const BUCKET_COUNT = 10_000;
export const DEFAULT_BUCKET_BY = 'userId';

export interface EvalFlag {
  key: string;
  salt: string;
  variants: FlagVariant[];
  defaultVariant: string;
}

export interface EvalState {
  enabled: boolean;
  offVariant: string | null;
  rules: TargetingRule[];
  fallthrough: FlagServe | null;
}

export interface EvalResult {
  variant: string;
  reason: 'OFF' | 'RULE_MATCH' | 'FALLTHROUGH' | 'MISSING_BUCKET_BY';
  matchedRuleIndex: number | null;
  bucket: number | null;
}

/** MurmurHash3 x86 32-bit over UTF-8, unsigned. */
export function murmur3(text: string, seed = 0): number {
  const data = new TextEncoder().encode(text);
  const c1 = 0xcc9e2d51;
  const c2 = 0x1b873593;
  let h = seed >>> 0;
  const blocks = data.length >> 2;
  for (let i = 0; i < blocks; i++) {
    const o = i * 4;
    let k = data[o] | (data[o + 1] << 8) | (data[o + 2] << 16) | (data[o + 3] << 24);
    k = Math.imul(k, c1);
    k = (k << 15) | (k >>> 17);
    k = Math.imul(k, c2);
    h ^= k;
    h = (h << 13) | (h >>> 19);
    h = (Math.imul(h, 5) + 0xe6546b64) | 0;
  }
  const tail = blocks * 4;
  let k1 = 0;
  const rest = data.length & 3;
  if (rest === 3) k1 ^= data[tail + 2] << 16;
  if (rest >= 2) k1 ^= data[tail + 1] << 8;
  if (rest >= 1) {
    k1 ^= data[tail];
    k1 = Math.imul(k1, c1);
    k1 = (k1 << 15) | (k1 >>> 17);
    k1 = Math.imul(k1, c2);
    h ^= k1;
  }
  h ^= data.length;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export const bucketOf = (flagKey: string, salt: string, value: string) =>
  murmur3(`${flagKey}.${salt}.${value}`) % BUCKET_COUNT;

/** The slice whose cumulative `weight × 100` range contains the bucket; leftovers go to the last. */
export function pickVariant(rollout: RolloutSlice[], bucket: number): string {
  let upper = 0;
  for (const slice of rollout) {
    upper += Math.round(slice.weight * 100);
    if (bucket < upper) return slice.variant;
  }
  return rollout.at(-1)!.variant;
}

// ---- SemVer 2.0.0 ----

const SEMVER =
  /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*)?$/;

export interface SemVer {
  core: [number, number, number];
  pre: string[];
}

export function parseSemVer(text: string | null | undefined): SemVer | null {
  const m = text ? SEMVER.exec(text.trim()) : null;
  if (!m) return null;
  const core = [Number(m[1]), Number(m[2]), Number(m[3])] as [number, number, number];
  if (core.some((n) => !Number.isSafeInteger(n) || n > 2147483647)) return null;
  return { core, pre: m[4] ? m[4].split('.') : [] };
}

const sign = (n: number) => Math.sign(n);
const NUMERIC = /^\d+$/;

function compareIdentifier(a: string, b: string): number {
  const an = NUMERIC.test(a);
  const bn = NUMERIC.test(b);
  if (an && bn) return sign(Number(a) - Number(b));
  if (an) return -1;
  if (bn) return 1;
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function compareSemVer(a: SemVer, b: SemVer): number {
  for (let i = 0; i < 3; i++) if (a.core[i] !== b.core[i]) return sign(a.core[i] - b.core[i]);
  if (a.pre.length === 0 || b.pre.length === 0) return sign(b.pre.length - a.pre.length);
  for (let i = 0; i < Math.min(a.pre.length, b.pre.length); i++) {
    const c = compareIdentifier(a.pre[i], b.pre[i]);
    if (c !== 0) return c;
  }
  return sign(a.pre.length - b.pre.length);
}

// ---- conditions ----

function regexMatches(actual: string, pattern: string): boolean {
  try {
    return new RegExp(pattern).test(actual);
  } catch {
    return false;
  }
}

function semverCompare(actual: string, values: string[]): number | null {
  const a = parseSemVer(actual);
  const b = parseSemVer(values[0]);
  return a && b ? compareSemVer(a, b) : null;
}

/** A missing attribute never matches; comparisons are ordinal and case-sensitive. */
export function conditionMatches(condition: FlagCondition, context: Record<string, string>): boolean {
  if (!Object.hasOwn(context, condition.attribute)) return false;
  const actual = context[condition.attribute];
  const values = condition.values;
  switch (condition.operator) {
    case 'in':
    case 'equals':
      return values.includes(actual);
    case 'notIn':
      return !values.includes(actual);
    case 'contains':
      return values.some((v) => actual.includes(v));
    case 'startsWith':
      return values.some((v) => actual.startsWith(v));
    case 'endsWith':
      return values.some((v) => actual.endsWith(v));
    case 'matches':
      return values.some((v) => regexMatches(actual, v));
    case 'semVerGte': {
      const c = semverCompare(actual, values);
      return c !== null && c >= 0;
    }
    case 'semVerLt': {
      const c = semverCompare(actual, values);
      return c !== null && c < 0;
    }
    default:
      return false;
  }
}

function serve(
  flag: EvalFlag,
  sv: FlagServe,
  context: Record<string, string>,
  reason: EvalResult['reason'],
  ruleIndex: number | null
): EvalResult {
  if (!sv.rollout?.length) {
    return { variant: sv.variant ?? flag.defaultVariant, reason, matchedRuleIndex: ruleIndex, bucket: null };
  }
  const by = sv.bucketBy || DEFAULT_BUCKET_BY;
  const value = context[by];
  if (!value) {
    return { variant: flag.defaultVariant, reason: 'MISSING_BUCKET_BY', matchedRuleIndex: ruleIndex, bucket: null };
  }
  const bucket = bucketOf(flag.key, flag.salt, value);
  return { variant: pickVariant(sv.rollout, bucket), reason, matchedRuleIndex: ruleIndex, bucket };
}

/** Off → first matching rule → fallthrough (or the default variant). */
export function evaluateFlag(flag: EvalFlag, state: EvalState | null, context: Record<string, string>): EvalResult {
  if (!state?.enabled) {
    return { variant: state?.offVariant ?? flag.defaultVariant, reason: 'OFF', matchedRuleIndex: null, bucket: null };
  }
  const index = state.rules.findIndex((rule) => rule.conditions.every((c) => conditionMatches(c, context)));
  if (index >= 0) return serve(flag, state.rules[index].serve, context, 'RULE_MATCH', index);
  if (!state.fallthrough) {
    return { variant: flag.defaultVariant, reason: 'FALLTHROUGH', matchedRuleIndex: null, bucket: null };
  }
  return serve(flag, state.fallthrough, context, 'FALLTHROUGH', null);
}

/** Context values as rules compare them: strings as-is, numbers and booleans as JSON text. */
export function toContext(input: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(input)) {
    if (typeof v === 'string') out[k] = v;
    else if (typeof v === 'number' || typeof v === 'boolean') out[k] = JSON.stringify(v);
  }
  return out;
}
