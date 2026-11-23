import type {
  ConditionOperator,
  FeatureFlag,
  FlagEnvironmentState,
  FlagServe,
  FlagType,
  FlagVariant,
  RolloutSlice,
  TargetingRule,
} from '@/types/api';
import { DEFAULT_BUCKET_BY, parseSemVer } from '@/lib/flagEvaluator';
import { flagsPath, globalFlagsPath, type FlagView } from '@/lib/routes';

/**
 * Feature flag helpers for the UI (guibranco/grimoire-ui#453): query keys, URLs, the targeting
 * editor's draft model and the client-side validation that mirrors the API's.
 */

/** Where flags live: one application, or the global flags (guibranco/grimoire-api#90). */
export type FlagScopeRef = { kind: 'app'; appSlug: string } | { kind: 'global' };

export const appScope = (appSlug: string): FlagScopeRef => ({ kind: 'app', appSlug });
export const GLOBAL_SCOPE: FlagScopeRef = { kind: 'global' };
export const isGlobalScope = (scope: FlagScopeRef): scope is { kind: 'global' } => scope.kind === 'global';

/** `*`: a global flag's state for every environment. */
export const ALL_ENVIRONMENTS = '*';

const scopeId = (scope: FlagScopeRef) => (isGlobalScope(scope) ? '*global' : scope.appSlug);

export const FLAGS_QUERY_KEY = 'feature-flags';
export const flagsQueryKey = (scope: FlagScopeRef) => [FLAGS_QUERY_KEY, scopeId(scope)] as const;
export const flagQueryKey = (scope: FlagScopeRef, key: string) => [FLAGS_QUERY_KEY, scopeId(scope), key] as const;
export const flagHistoryQueryKey = (scope: FlagScopeRef, key: string) =>
  [FLAGS_QUERY_KEY, scopeId(scope), key, 'history'] as const;

const seg = encodeURIComponent;
export const flagsUrl = (scope: FlagScopeRef) =>
  isGlobalScope(scope) ? '/global/feature-flags' : `/applications/${seg(scope.appSlug)}/feature-flags`;
export const flagUrl = (scope: FlagScopeRef, key: string) => `${flagsUrl(scope)}/${seg(key)}`;
export const flagEnvironmentUrl = (scope: FlagScopeRef, key: string, env: string) =>
  `${flagUrl(scope, key)}/environments/${seg(env)}`;

/** The flag list (or a flag, or its history) in the UI, for either scope. */
export const flagPagePath = (scope: FlagScopeRef, env: string, flag?: string | null, view?: FlagView | null) =>
  isGlobalScope(scope) ? globalFlagsPath(env, flag, view) : flagsPath(scope.appSlug, env, flag, view);

export const FLAG_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
export const VARIANT_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
export const MAX_VARIANTS = 20;
export const MAX_TAGS = 20;

export const OPERATORS: { value: ConditionOperator; label: string }[] = [
  { value: 'in', label: 'is one of' },
  { value: 'notIn', label: 'is not one of' },
  { value: 'equals', label: 'equals' },
  { value: 'contains', label: 'contains' },
  { value: 'startsWith', label: 'starts with' },
  { value: 'endsWith', label: 'ends with' },
  { value: 'matches', label: 'matches regex' },
  { value: 'semVerGte', label: 'semver ≥' },
  { value: 'semVerLt', label: 'semver <' },
];

export const operatorLabel = (op: string) => OPERATORS.find((o) => o.value === op)?.label ?? op;
export const isSemVerOperator = (op: string) => op === 'semVerGte' || op === 'semVerLt';

/** Suggested context attributes; previously used ones are added by `attributeSuggestions`. */
export const COMMON_ATTRIBUTES = ['userId', 'email', 'tenant', 'country', 'appVersion'] as const;

/** Attributes a state's conditions and rollouts use. */
function usedAttributes(env: FlagEnvironmentState): string[] {
  const conditions = env.rules.flatMap((r) => r.conditions.map((c) => c.attribute));
  const bucketBy = [env.fallthrough, ...env.rules.map((r) => r.serve)].flatMap((sv) => (sv?.bucketBy ? [sv.bucketBy] : []));
  return [...conditions, ...bucketBy];
}

export function attributeSuggestions(flags: FeatureFlag[]): string[] {
  const seen = new Set<string>(COMMON_ATTRIBUTES);
  for (const attribute of flags.flatMap((f) => f.environments.flatMap(usedAttributes))) seen.add(attribute);
  return [...seen];
}

/** Environments where a change asks for confirmation (global `*` reaches production too). */
export const isProductionEnvironment = (env: { slug: string; name?: string | null }) =>
  env.slug === ALL_ENVIRONMENTS || /prod/i.test(env.slug) || /prod/i.test(env.name ?? '');

export const stateFor = (flag: FeatureFlag, env: string): FlagEnvironmentState =>
  flag.environments.find((e) => e.environment === env) ?? {
    environment: env,
    enabled: false,
    offVariant: null,
    rules: [],
    fallthrough: null,
    version: 0,
    updatedAt: null,
  };

/** A global flag's environment that has no state of its own follows `*`. */
export const followsAllEnvironments = (scope: FlagScopeRef, flag: FeatureFlag, env: string) =>
  isGlobalScope(scope) && env !== ALL_ENVIRONMENTS && stateFor(flag, env).version === 0;

/** The state that applies in an environment: its own, or `*` for a global flag that has none. */
export const effectiveStateFor = (scope: FlagScopeRef, flag: FeatureFlag, env: string): FlagEnvironmentState =>
  followsAllEnvironments(scope, flag, env)
    ? { ...stateFor(flag, ALL_ENVIRONMENTS), environment: env, version: 0, updatedAt: null }
    : stateFor(flag, env);

const formatWeight = (w: number) => `${Number(w.toFixed(2))}`;

/** One-line summary of an environment's targeting, for the flag list. */
export function targetingSummary(flag: FeatureFlag, state: FlagEnvironmentState): string {
  const { rules, fallthrough } = state;
  if (rules.length > 0) {
    const onlyUsers = rules.every(
      (r) => r.conditions.length === 1 && r.conditions[0].attribute === 'userId' && r.conditions[0].operator === 'in'
    );
    if (onlyUsers) return `users: ${rules.reduce((n, r) => n + r.conditions[0].values.length, 0)}`;
    return `${rules.length} rule${rules.length === 1 ? '' : 's'}`;
  }
  if (fallthrough?.rollout?.length) {
    if (flag.type === 'boolean') {
      const on = fallthrough.rollout.find((s) => s.variant === 'on')?.weight ?? 0;
      return `${formatWeight(on)} %`;
    }
    return `${fallthrough.rollout.map((s) => formatWeight(s.weight)).join('/')} %`;
  }
  if (fallthrough?.variant && fallthrough.variant !== flag.defaultVariant) return `→ ${fallthrough.variant}`;
  return '—';
}

export function flagTypeLabel(flag: Pick<FeatureFlag, 'type' | 'variants'>): string {
  if (flag.type === 'boolean') return 'boolean';
  return flag.variants.length === 2 ? 'A/B' : `multi(${flag.variants.length})`;
}

// ---- create / edit form ----

export interface VariantDraft {
  /** Stable React key; not sent. */
  id: string;
  key: string;
  /** JSON text. */
  value: string;
}

export interface FlagFormDraft {
  key: string;
  description: string;
  type: FlagType;
  variants: VariantDraft[];
  defaultVariant: string;
  tags: string[];
}

let variantIds = 0;
export const newVariantId = () => `v${++variantIds}`;

export const BOOLEAN_VARIANTS: VariantDraft[] = [
  { id: 'on', key: 'on', value: 'true' },
  { id: 'off', key: 'off', value: 'false' },
];

export const emptyFlagForm = (): FlagFormDraft => ({
  key: '',
  description: '',
  type: 'boolean',
  variants: [
    { id: newVariantId(), key: 'control', value: 'false' },
    { id: newVariantId(), key: 'treatment', value: 'true' },
  ],
  defaultVariant: 'off',
  tags: [],
});

export const flagFormFrom = (flag: FeatureFlag): FlagFormDraft => ({
  key: flag.key,
  description: flag.description ?? '',
  type: flag.type,
  variants: flag.variants.map((v) => ({ id: newVariantId(), key: v.key, value: JSON.stringify(v.value) })),
  defaultVariant: flag.defaultVariant,
  tags: [...flag.tags],
});

const isJson = (text: string) => {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
};

export type FieldErrors = Record<string, string>;

/** Mirrors the API's create/update validation. Keys are field paths, e.g. `variants.1.value`. */
export function validateFlagForm(form: FlagFormDraft, mode: 'create' | 'edit'): FieldErrors {
  const errors: FieldErrors = {};
  if (mode === 'create') {
    if (!form.key.trim()) errors.key = 'Key is required.';
    else if (form.key.length > 500) errors.key = 'At most 500 characters.';
    else if (!FLAG_KEY_PATTERN.test(form.key))
      errors.key = "Letters, digits, '.', '_', ':' and '-', starting with a letter or digit.";
  }
  if (form.description.length > 1000) errors.description = 'At most 1000 characters.';
  if (form.tags.length > MAX_TAGS) errors.tags = `At most ${MAX_TAGS} tags.`;

  const variants = form.type === 'boolean' ? BOOLEAN_VARIANTS : form.variants;
  if (form.type === 'multivariate') {
    if (variants.length < 2 || variants.length > MAX_VARIANTS)
      errors.variants = `A multivariate flag needs 2 to ${MAX_VARIANTS} variants.`;
    const seen = new Set<string>();
    variants.forEach((v, i) => {
      if (!VARIANT_KEY_PATTERN.test(v.key) || v.key.length > 100)
        errors[`variants.${i}.key`] = "Letters, digits, '.', '_' and '-'.";
      else if (seen.has(v.key)) errors[`variants.${i}.key`] = 'Variant keys must be unique.';
      seen.add(v.key);
      if (!isJson(v.value)) errors[`variants.${i}.value`] = 'Must be valid JSON (e.g. true, "blue", {"limit":5}).';
    });
  }
  if (!variants.some((v) => v.key === form.defaultVariant)) errors.defaultVariant = 'Pick one of the variants.';
  return errors;
}

/** Request body for create (with key and type) or update. */
export function flagFormBody(form: FlagFormDraft, mode: 'create' | 'edit') {
  const body: Record<string, unknown> = {
    description: form.description.trim() || null,
    defaultVariant: form.defaultVariant,
    tags: form.tags,
  };
  if (form.type === 'multivariate') {
    body.variants = form.variants.map((v) => ({ key: v.key, value: JSON.parse(v.value) as unknown }));
  }
  if (mode === 'create') {
    body.key = form.key.trim();
    body.type = form.type;
  }
  return body;
}

// ---- targeting editor ----

let draftIds = 0;
const nextId = () => `d${++draftIds}`;

export type ServeMode = 'variant' | 'rollout';

export interface ServeDraft {
  mode: ServeMode;
  variant: string;
  rollout: RolloutSlice[];
  bucketBy: string;
}

export interface ConditionDraft {
  id: string;
  attribute: string;
  operator: ConditionOperator;
  values: string[];
}

export interface RuleDraft {
  id: string;
  conditions: ConditionDraft[];
  serve: ServeDraft;
}

export interface TargetingDraft {
  enabled: boolean;
  /** `''` = the default variant. */
  offVariant: string;
  rules: RuleDraft[];
  fallthrough: ServeDraft;
}

/** An even split across the variants (two decimals; the remainder goes to the first). */
export function evenRollout(variants: Pick<FlagVariant, 'key'>[]): RolloutSlice[] {
  const n = Math.max(1, variants.length);
  const share = Math.floor(10000 / n) / 100;
  const slices = variants.map((v) => ({ variant: v.key, weight: share }));
  if (slices.length) slices[0].weight = Math.round((100 - share * (n - 1)) * 100) / 100;
  return slices;
}

function serveDraft(flag: FeatureFlag, sv: FlagServe | null | undefined): ServeDraft {
  if (sv?.rollout?.length) {
    return { mode: 'rollout', variant: flag.defaultVariant, rollout: sv.rollout.map((s) => ({ ...s })), bucketBy: sv.bucketBy ?? '' };
  }
  return { mode: 'variant', variant: sv?.variant ?? flag.defaultVariant, rollout: evenRollout(flag.variants), bucketBy: '' };
}

export const newCondition = (): ConditionDraft => ({ id: nextId(), attribute: 'userId', operator: 'in', values: [] });

export const newRule = (flag: FeatureFlag): RuleDraft => ({
  id: nextId(),
  conditions: [newCondition()],
  serve: serveDraft(flag, { variant: flag.variants.find((v) => v.key !== flag.defaultVariant)?.key ?? flag.defaultVariant }),
});

export function targetingDraft(flag: FeatureFlag, state: FlagEnvironmentState): TargetingDraft {
  return {
    enabled: state.enabled,
    offVariant: state.offVariant ?? '',
    rules: state.rules.map((r) => ({
      id: nextId(),
      conditions: r.conditions.map((c) => ({ id: nextId(), attribute: c.attribute, operator: c.operator, values: [...c.values] })),
      serve: serveDraft(flag, r.serve),
    })),
    fallthrough: serveDraft(flag, state.fallthrough),
  };
}

function serveBody(sv: ServeDraft): FlagServe {
  return sv.mode === 'variant'
    ? { variant: sv.variant }
    : { rollout: sv.rollout.map((s) => ({ variant: s.variant, weight: s.weight })), bucketBy: sv.bucketBy.trim() || null };
}

/** `PUT …/environments/{env}` body. A fallthrough serving the default variant is sent as `null`. */
export function targetingBody(flag: FeatureFlag, draft: TargetingDraft) {
  const fallthrough =
    draft.fallthrough.mode === 'variant' && draft.fallthrough.variant === flag.defaultVariant ? null : serveBody(draft.fallthrough);
  return {
    enabled: draft.enabled,
    offVariant: draft.offVariant || null,
    rules: draft.rules.map(
      (r): TargetingRule => ({
        conditions: r.conditions.map((c) => ({ attribute: c.attribute.trim(), operator: c.operator, values: c.values })),
        serve: serveBody(r.serve),
      })
    ),
    fallthrough,
  };
}

/** Comparable form of a saved state, so an untouched draft is not dirty. */
export const savedTargetingBody = (flag: FeatureFlag, state: FlagEnvironmentState) =>
  targetingBody(flag, targetingDraft(flag, state));

export const rolloutTotal = (rollout: RolloutSlice[]) => Math.round(rollout.reduce((s, r) => s + r.weight, 0) * 100) / 100;

const hasTwoDecimals = (w: number) => Math.abs(Math.round(w * 100) - w * 100) < 1e-9;

function isValidRegex(pattern: string) {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

function validateServe(sv: ServeDraft, variants: Set<string>, path: string, errors: FieldErrors) {
  if (sv.mode === 'variant') {
    if (!variants.has(sv.variant)) errors[`${path}.variant`] = 'Pick one of the variants.';
    return;
  }
  if (sv.rollout.length === 0) errors[`${path}.rollout`] = 'Add at least one variant.';
  else if (sv.rollout.some((s) => !variants.has(s.variant))) errors[`${path}.rollout`] = 'Unknown variant in the rollout.';
  else if (new Set(sv.rollout.map((s) => s.variant)).size !== sv.rollout.length)
    errors[`${path}.rollout`] = 'Each variant may appear once.';
  else if (sv.rollout.some((s) => !(s.weight >= 0 && s.weight <= 100) || !hasTwoDecimals(s.weight)))
    errors[`${path}.rollout`] = 'Weights must be 0–100 with at most two decimals.';
  else if (rolloutTotal(sv.rollout) !== 100) errors[`${path}.rollout`] = `Weights sum to ${rolloutTotal(sv.rollout)} %, not 100 %.`;
}

/** Mirrors the API's environment state validation. */
export function validateTargeting(flag: FeatureFlag, draft: TargetingDraft): FieldErrors {
  const errors: FieldErrors = {};
  const variants = new Set(flag.variants.map((v) => v.key));
  if (draft.offVariant && !variants.has(draft.offVariant)) errors.offVariant = 'Pick one of the variants.';
  draft.rules.forEach((rule, i) => {
    if (rule.conditions.length === 0) errors[`rules.${i}`] = 'A rule needs at least one condition.';
    rule.conditions.forEach((c, j) => {
      const path = `rules.${i}.conditions.${j}`;
      if (!c.attribute.trim()) errors[`${path}.attribute`] = 'Attribute is required.';
      if (c.values.length === 0) errors[`${path}.values`] = 'Add at least one value.';
      else if (isSemVerOperator(c.operator)) {
        if (c.values.length !== 1) errors[`${path}.values`] = 'Exactly one version.';
        else if (!parseSemVer(c.values[0])) errors[`${path}.values`] = 'Not a semantic version (e.g. 1.4.0).';
      } else if (c.operator === 'matches') {
        const bad = c.values.find((v) => !isValidRegex(v));
        if (bad !== undefined) errors[`${path}.values`] = `Not a valid regular expression: ${bad}`;
      }
    });
    validateServe(rule.serve, variants, `rules.${i}.serve`, errors);
  });
  validateServe(draft.fallthrough, variants, 'fallthrough', errors);
  return errors;
}

/**
 * Sets one slice's weight. With two slices the other takes the remainder, so the total stays at
 * 100; with more, the user balances them (save stays disabled until Σ = 100).
 */
export function setRolloutWeight(rollout: RolloutSlice[], index: number, weight: number): RolloutSlice[] {
  const w = Math.min(100, Math.max(0, Math.round(weight * 100) / 100));
  const next = rollout.map((s, i) => (i === index ? { ...s, weight: w } : { ...s }));
  if (next.length === 2) next[1 - index].weight = Math.round((100 - w) * 100) / 100;
  return next;
}

export const bucketByLabel = (sv: ServeDraft) => sv.bucketBy.trim() || DEFAULT_BUCKET_BY;

/** Pretty JSON of a targeting body, for the review diff. */
export const targetingText = (body: ReturnType<typeof targetingBody>) => JSON.stringify(body, null, 2);

/** Readable value of a variant. */
export const variantValueText = (value: unknown) => JSON.stringify(value);
