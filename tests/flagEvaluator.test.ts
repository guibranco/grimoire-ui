import { describe, it, expect } from 'vitest';
import vectors from './fixtures/flag-test-vectors.json';
import {
  bucketOf,
  compareSemVer,
  conditionMatches,
  evaluateFlag,
  murmur3,
  parseSemVer,
  pickVariant,
  toContext,
} from '../src/lib/flagEvaluator';

/** The shared vectors from guibranco/grimoire-api `docs/feature-flags/test-vectors.json`. */
type Vectors = {
  hashes: { input: string; murmur3_32: number }[];
  buckets: { flagKey: string; salt: string; value: string; bucket: number }[];
  flags: Record<string, any>;
  cases: { flag: string; context: Record<string, string>; expected: any }[];
};
const v = vectors as unknown as Vectors;

describe('flag evaluator — shared test vectors', () => {
  it.each(v.hashes)('murmur3_32($input)', ({ input, murmur3_32 }) => {
    expect(murmur3(input)).toBe(murmur3_32);
  });

  it.each(v.buckets)('bucket($flagKey, $salt, $value)', ({ flagKey, salt, value, bucket }) => {
    expect(bucketOf(flagKey, salt, value)).toBe(bucket);
  });

  it.each(v.cases.map((c, i) => [i, c] as const))('case %i', (_, c) => {
    const flag = v.flags[c.flag];
    expect(evaluateFlag(flag, flag.state, c.context)).toEqual(c.expected);
  });
});

describe('flag evaluator — edge cases', () => {
  it('matches published Murmur3 values', () => {
    expect(murmur3('', 1)).toBe(0x514e28b7);
    expect(murmur3('', 0xffffffff)).toBe(0x81f16f39);
    expect(murmur3('aaaa', 0x9747b28c)).toBe(0x5a97808a);
    expect(murmur3('Hello, world!', 0x9747b28c)).toBe(0x24884cba);
    expect(murmur3('The quick brown fox jumps over the lazy dog', 0x9747b28c)).toBe(0x2fa826cd);
  });

  it('gives rounding leftovers to the last slice', () => {
    const r = [
      { variant: 'a', weight: 33.33 },
      { variant: 'b', weight: 33.33 },
      { variant: 'c', weight: 33.33 },
    ];
    expect(pickVariant(r, 3332)).toBe('a');
    expect(pickVariant(r, 3333)).toBe('b');
    expect(pickVariant(r, 9999)).toBe('c');
  });

  it('compares semantic versions by precedence', () => {
    const cmp = (a: string, b: string) => compareSemVer(parseSemVer(a)!, parseSemVer(b)!);
    expect(cmp('1.0.0-alpha', '1.0.0')).toBe(-1);
    expect(cmp('1.0.0-alpha.1', '1.0.0-alpha.beta')).toBe(-1);
    expect(cmp('1.0.0-beta.2', '1.0.0-beta.11')).toBe(-1);
    expect(cmp('1.0.0-rc.1', '1.0.0-beta.11')).toBe(1);
    expect(cmp('1.10.0', '1.9.0')).toBe(1);
    expect(cmp('v1.2.3+b', '1.2.3')).toBe(0);
    expect(cmp('1.0.0', '1.0.0-x')).toBe(1);
    expect(parseSemVer('1.2')).toBeNull();
    expect(parseSemVer('01.2.3')).toBeNull();
    expect(parseSemVer('99999999999.0.0')).toBeNull();
    expect(parseSemVer(null)).toBeNull();
  });

  it('never matches a missing attribute, an invalid regex or an unknown operator', () => {
    expect(conditionMatches({ attribute: 'x', operator: 'notIn', values: ['a'] }, {})).toBe(false);
    expect(conditionMatches({ attribute: 'x', operator: 'matches', values: ['('] }, { x: '(' })).toBe(false);
    expect(conditionMatches({ attribute: 'x', operator: 'semVerGte', values: ['1.0'] }, { x: '1.0.0' })).toBe(false);
    expect(conditionMatches({ attribute: 'x', operator: 'bogus' as any, values: ['a'] }, { x: 'a' })).toBe(false);
    expect(conditionMatches({ attribute: 'toString', operator: 'in', values: ['a'] }, {})).toBe(false);
  });

  it('serves the default variant when disabled without an off variant or no state at all', () => {
    const flag = { key: 'f', salt: 's', variants: [], defaultVariant: 'off' };
    expect(evaluateFlag(flag, null, {}).reason).toBe('OFF');
    expect(evaluateFlag(flag, { enabled: true, offVariant: null, rules: [], fallthrough: { variant: 'on' } }, {}).variant).toBe('on');
  });

  it('converts context values', () => {
    expect(toContext({ a: 'x', b: 2, c: true, d: null, e: { f: 1 } })).toEqual({ a: 'x', b: '2', c: 'true' });
  });
});
