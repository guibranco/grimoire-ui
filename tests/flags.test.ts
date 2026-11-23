import { describe, it, expect } from 'vitest';
import {
  attributeSuggestions,
  emptyFlagForm,
  evenRollout,
  flagFormBody,
  flagFormFrom,
  flagTypeLabel,
  isProductionEnvironment,
  newRule,
  operatorLabel,
  rolloutTotal,
  savedTargetingBody,
  setRolloutWeight,
  stateFor,
  targetingBody,
  targetingDraft,
  targetingSummary,
  validateFlagForm,
  validateTargeting,
} from '../src/lib/flags';
import { flagsPath } from '../src/lib/routes';
import type { FeatureFlag, FlagEnvironmentState } from '../src/types/api';

const env = (over: Partial<FlagEnvironmentState> = {}): FlagEnvironmentState => ({
  environment: 'production',
  enabled: true,
  offVariant: null,
  rules: [],
  fallthrough: null,
  version: 1,
  updatedAt: null,
  ...over,
});

const FLAG: FeatureFlag = {
  key: 'checkout',
  description: 'x',
  type: 'multivariate',
  variants: [
    { key: 'control', value: { a: 1 } },
    { key: 'treatment', value: 'b' },
  ],
  defaultVariant: 'control',
  tags: ['q4'],
  createdAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-01T00:00:00Z',
  environments: [env()],
};

const BOOL: FeatureFlag = {
  ...FLAG,
  key: 'kill',
  type: 'boolean',
  variants: [
    { key: 'on', value: true },
    { key: 'off', value: false },
  ],
  defaultVariant: 'off',
};

describe('flagsPath', () => {
  it('builds list, detail and history URLs', () => {
    expect(flagsPath('app', 'prod')).toBe('/apps/app/prod/flags');
    expect(flagsPath('app', 'prod', 'a:b')).toBe('/apps/app/prod/flags?flag=a%3Ab');
    expect(flagsPath('app', 'prod', 'k', 'history')).toBe('/apps/app/prod/flags?flag=k&view=history');
    expect(flagsPath('app', 'prod', null, 'history')).toBe('/apps/app/prod/flags');
  });
});

describe('summaries and labels', () => {
  it('summarises targeting', () => {
    expect(targetingSummary(FLAG, env())).toBe('—');
    expect(targetingSummary(FLAG, env({ fallthrough: { variant: 'treatment' } }))).toBe('→ treatment');
    expect(targetingSummary(FLAG, env({ fallthrough: { variant: 'control' } }))).toBe('—');
    expect(
      targetingSummary(FLAG, env({ fallthrough: { rollout: [{ variant: 'control', weight: 50 }, { variant: 'treatment', weight: 50 }] } }))
    ).toBe('50/50 %');
    expect(targetingSummary(BOOL, env({ fallthrough: { rollout: [{ variant: 'on', weight: 12.5 }, { variant: 'off', weight: 87.5 }] } }))).toBe(
      '12.5 %'
    );
    expect(targetingSummary(BOOL, env({ fallthrough: { rollout: [{ variant: 'off', weight: 100 }] } }))).toBe('0 %');
    const userRule = { conditions: [{ attribute: 'userId', operator: 'in' as const, values: ['a', 'b'] }], serve: { variant: 'on' } };
    expect(targetingSummary(BOOL, env({ rules: [userRule, userRule] }))).toBe('users: 4');
    expect(
      targetingSummary(BOOL, env({ rules: [{ conditions: [{ attribute: 'email', operator: 'endsWith', values: ['x'] }], serve: { variant: 'on' } }] }))
    ).toBe('1 rule');
    expect(
      targetingSummary(BOOL, env({ rules: [userRule, { conditions: [{ attribute: 'e', operator: 'in', values: ['x'] }], serve: { variant: 'on' } }] }))
    ).toBe('2 rules');
  });

  it('labels types and operators, spots production and suggests attributes', () => {
    expect(flagTypeLabel(BOOL)).toBe('boolean');
    expect(flagTypeLabel(FLAG)).toBe('A/B');
    expect(flagTypeLabel({ ...FLAG, variants: [...FLAG.variants, { key: 'c', value: 1 }] })).toBe('multi(3)');
    expect(operatorLabel('semVerGte')).toBe('semver ≥');
    expect(operatorLabel('weird')).toBe('weird');
    expect(isProductionEnvironment({ slug: 'production' })).toBe(true);
    expect(isProductionEnvironment({ slug: 'live', name: 'Prod EU' })).toBe(true);
    expect(isProductionEnvironment({ slug: 'staging', name: 'Staging' })).toBe(false);
    const withRules = {
      ...FLAG,
      environments: [
        env({
          rules: [{ conditions: [{ attribute: 'plan', operator: 'in', values: ['pro'] }], serve: { rollout: [], bucketBy: 'accountId' } }],
          fallthrough: { rollout: [], bucketBy: 'tenantId' },
        }),
      ],
    };
    const attrs = attributeSuggestions([withRules]);
    expect(attrs).toEqual(expect.arrayContaining(['userId', 'email', 'plan', 'accountId', 'tenantId']));
  });

  it('defaults a missing environment state to off', () => {
    expect(stateFor(FLAG, 'nope')).toMatchObject({ enabled: false, version: 0, rules: [] });
  });
});

describe('flag form', () => {
  it('validates create input like the API', () => {
    expect(validateFlagForm({ ...emptyFlagForm(), key: 'ok-key' }, 'create')).toEqual({});
    expect(validateFlagForm({ ...emptyFlagForm(), key: '' }, 'create').key).toMatch(/required/);
    expect(validateFlagForm({ ...emptyFlagForm(), key: 'has space' }, 'create').key).toBeDefined();
    expect(validateFlagForm({ ...emptyFlagForm(), key: 'x'.repeat(501) }, 'create').key).toMatch(/500/);
    expect(validateFlagForm({ ...emptyFlagForm(), key: 'k', description: 'd'.repeat(1001) }, 'create').description).toBeDefined();
    expect(validateFlagForm({ ...emptyFlagForm(), key: 'k', tags: Array.from({ length: 21 }, (_, i) => `t${i}`) }, 'create').tags).toBeDefined();

    const multi = { ...emptyFlagForm(), key: 'k', type: 'multivariate' as const, defaultVariant: 'control' };
    expect(validateFlagForm(multi, 'create')).toEqual({});
    expect(validateFlagForm({ ...multi, variants: [{ id: 'a-1', key: 'a', value: '1' }], defaultVariant: 'a' }, 'create').variants).toBeDefined();
    const dup = validateFlagForm({ ...multi, variants: [{ id: 'a-1', key: 'a', value: '1' }, { id: 'a-2', key: 'a', value: '2' }], defaultVariant: 'a' }, 'create');
    expect(dup['variants.1.key']).toMatch(/unique/);
    const bad = validateFlagForm({ ...multi, variants: [{ id: 'a b-1', key: 'a b', value: '1' }, { id: 'c-not json', key: 'c', value: 'not json' }], defaultVariant: 'c' }, 'create');
    expect(bad['variants.0.key']).toBeDefined();
    expect(bad['variants.1.value']).toMatch(/JSON/);
    expect(validateFlagForm({ ...multi, defaultVariant: 'zzz' }, 'create').defaultVariant).toBeDefined();
    expect(validateFlagForm({ ...emptyFlagForm(), key: '' }, 'edit').key).toBeUndefined();
  });

  it('builds request bodies', () => {
    const multi = { ...emptyFlagForm(), key: ' k ', type: 'multivariate' as const, defaultVariant: 'control', description: ' ', tags: ['a'] };
    expect(flagFormBody(multi, 'create')).toEqual({
      key: 'k',
      type: 'multivariate',
      description: null,
      defaultVariant: 'control',
      tags: ['a'],
      variants: [
        { key: 'control', value: false },
        { key: 'treatment', value: true },
      ],
    });
    expect(flagFormBody(flagFormFrom(BOOL), 'edit')).toEqual({ description: 'x', defaultVariant: 'off', tags: ['q4'] });
    expect(flagFormFrom(FLAG).variants[0]).toMatchObject({ key: 'control', value: '{"a":1}' });
  });
});

describe('targeting draft', () => {
  const state = env({
    offVariant: 'control',
    rules: [
      {
        conditions: [{ attribute: 'userId', operator: 'in', values: ['u-1'] }],
        serve: { rollout: [{ variant: 'control', weight: 25 }, { variant: 'treatment', weight: 75 }], bucketBy: 'accountId' },
      },
    ],
    fallthrough: { variant: 'treatment' },
  });

  it('round-trips a saved state, so an untouched draft is not dirty', () => {
    const body = targetingBody(FLAG, targetingDraft(FLAG, state));
    expect(body).toEqual({
      enabled: true,
      offVariant: 'control',
      rules: [
        {
          conditions: [{ attribute: 'userId', operator: 'in', values: ['u-1'] }],
          serve: { rollout: [{ variant: 'control', weight: 25 }, { variant: 'treatment', weight: 75 }], bucketBy: 'accountId' },
        },
      ],
      fallthrough: { variant: 'treatment' },
    });
    expect(savedTargetingBody(FLAG, state)).toEqual(body);
  });

  it('sends a default-variant fallthrough as null and empty bucket-by as null', () => {
    const draft = targetingDraft(FLAG, env());
    expect(targetingBody(FLAG, draft).fallthrough).toBeNull();
    draft.fallthrough = { ...draft.fallthrough, mode: 'rollout' };
    expect(targetingBody(FLAG, draft).fallthrough).toEqual({ rollout: evenRollout(FLAG.variants), bucketBy: null });
    expect(targetingBody(FLAG, { ...draft, offVariant: '' }).offVariant).toBeNull();
  });

  it('validates like the API', () => {
    const draft = targetingDraft(FLAG, state);
    expect(validateTargeting(FLAG, draft)).toEqual({});

    const rule = draft.rules[0];
    const broken = {
      ...draft,
      offVariant: 'gone',
      rules: [
        { ...rule, conditions: [] },
        {
          ...rule,
          conditions: [
            { ...rule.conditions[0], attribute: ' ', values: [] },
            { ...rule.conditions[0], operator: 'semVerGte' as const, values: ['1.0', '2.0.0'] },
            { ...rule.conditions[0], operator: 'semVerLt' as const, values: ['1.0'] },
            { ...rule.conditions[0], operator: 'matches' as const, values: ['ok', '('] },
          ],
          serve: { ...rule.serve, rollout: [{ variant: 'control', weight: 60 }, { variant: 'treatment', weight: 30 }] },
        },
      ],
      fallthrough: { ...draft.fallthrough, mode: 'variant' as const, variant: 'gone' },
    };
    const errors = validateTargeting(FLAG, broken);
    expect(errors.offVariant).toBeDefined();
    expect(errors['rules.0']).toMatch(/condition/);
    expect(errors['rules.1.conditions.0.attribute']).toBeDefined();
    expect(errors['rules.1.conditions.0.values']).toBeDefined();
    expect(errors['rules.1.conditions.1.values']).toMatch(/one version/);
    expect(errors['rules.1.conditions.2.values']).toMatch(/semantic/);
    expect(errors['rules.1.conditions.3.values']).toMatch(/\(/);
    expect(errors['rules.1.serve.rollout']).toMatch(/90/);
    expect(errors['fallthrough.variant']).toBeDefined();

    const rollout = (r: { variant: string; weight: number }[]) =>
      validateTargeting(FLAG, { ...draft, fallthrough: { ...draft.fallthrough, mode: 'rollout', rollout: r } })['fallthrough.rollout'];
    expect(rollout([])).toMatch(/at least one/);
    expect(rollout([{ variant: 'nope', weight: 100 }])).toMatch(/Unknown/);
    expect(rollout([{ variant: 'control', weight: 50 }, { variant: 'control', weight: 50 }])).toMatch(/once/);
    expect(rollout([{ variant: 'control', weight: 99.995 }, { variant: 'treatment', weight: 0.005 }])).toMatch(/decimals/);
    expect(rollout([{ variant: 'control', weight: 33.33 }, { variant: 'treatment', weight: 66.67 }])).toBeUndefined();
  });

  it('keeps two-way rollouts at 100 and clamps weights', () => {
    const two = [
      { variant: 'a', weight: 50 },
      { variant: 'b', weight: 50 },
    ];
    expect(setRolloutWeight(two, 0, 12.5)).toEqual([
      { variant: 'a', weight: 12.5 },
      { variant: 'b', weight: 87.5 },
    ]);
    expect(setRolloutWeight(two, 1, 150)[1].weight).toBe(100);
    expect(setRolloutWeight(two, 1, -3)).toEqual([
      { variant: 'a', weight: 100 },
      { variant: 'b', weight: 0 },
    ]);
    const three = [...two, { variant: 'c', weight: 0 }];
    expect(rolloutTotal(setRolloutWeight(three, 2, 10))).toBe(110);
    expect(rolloutTotal(evenRollout([{ key: 'a' }, { key: 'b' }, { key: 'c' }]))).toBe(100);
    expect(evenRollout([{ key: 'a' }, { key: 'b' }, { key: 'c' }]).map((s) => s.weight)).toEqual([33.34, 33.33, 33.33]);
  });

  it('creates rules serving a non-default variant', () => {
    expect(newRule(FLAG).serve).toMatchObject({ mode: 'variant', variant: 'treatment' });
    expect(newRule({ ...FLAG, variants: [{ key: 'control', value: 1 }] }).serve.variant).toBe('control');
  });
});
