import React, { useId } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import {
  OPERATORS,
  bucketByLabel,
  evenRollout,
  isSemVerOperator,
  newCondition,
  newRule,
  rolloutTotal,
  setRolloutWeight,
  type ConditionDraft,
  type FieldErrors,
  type RuleDraft,
  type ServeDraft,
  type TargetingDraft,
} from '@/lib/flags';
import type { ConditionOperator, FeatureFlag } from '@/types/api';
import { ChipsInput, FieldError, inputClass, selectClass } from './parts';

const SLICE_COLOURS = ['bg-flags', 'bg-sky-500', 'bg-amber-500', 'bg-violet-500', 'bg-rose-500', 'bg-teal-400'];

/** Serve a fixed variant or a weighted rollout; sliders and number inputs stay in sync. */
const ServeEditor: React.FC<{
  flag: FeatureFlag;
  serve: ServeDraft;
  onChange: (serve: ServeDraft) => void;
  errors: FieldErrors;
  path: string;
  label: string;
  attributesListId: string;
}> = ({ flag, serve, onChange, errors, path, label, attributesListId }) => {
  const name = useId();
  const total = rolloutTotal(serve.rollout);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-300">
        <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-500">Serve</span>
        <label className="inline-flex items-center gap-1.5">
          <input
            type="radio"
            name={name}
            checked={serve.mode === 'variant'}
            onChange={() => onChange({ ...serve, mode: 'variant' })}
            aria-label={`${label}: serve a variant`}
          />
          <span>variant</span>
        </label>
        <select
          aria-label={`${label} variant`}
          value={serve.variant}
          disabled={serve.mode !== 'variant'}
          onChange={(e) => onChange({ ...serve, variant: e.target.value })}
          aria-invalid={!!errors[`${path}.variant`] || undefined}
          className={cn(selectClass, 'disabled:opacity-40')}
        >
          {flag.variants.map((v) => (
            <option key={v.key} value={v.key}>
              {v.key}
            </option>
          ))}
        </select>
        <label className="inline-flex items-center gap-1.5">
          <input
            type="radio"
            name={name}
            checked={serve.mode === 'rollout'}
            onChange={() =>
              onChange({ ...serve, mode: 'rollout', rollout: serve.rollout.length ? serve.rollout : evenRollout(flag.variants) })
            }
            aria-label={`${label}: percentage rollout`}
          />
          <span>percentage rollout</span>
        </label>
      </div>
      <FieldError errors={errors} path={`${path}.variant`} />

      {serve.mode === 'rollout' && (
        <div className="space-y-1.5 pl-1">
          {serve.rollout.map((slice, i) => (
            <div key={slice.variant} className="grid grid-cols-[110px_1fr_80px] items-center gap-2">
              <span className="flex items-center gap-1.5 font-mono text-xs text-zinc-300 truncate">
                <span className={cn('inline-block w-2 h-2 shrink-0', SLICE_COLOURS[i % SLICE_COLOURS.length])} aria-hidden="true" />
                {slice.variant}
              </span>
              <input
                type="range"
                min={0}
                max={100}
                step={0.5}
                value={slice.weight}
                aria-label={`${label} ${slice.variant} weight slider`}
                onChange={(e) => onChange({ ...serve, rollout: setRolloutWeight(serve.rollout, i, Number(e.target.value)) })}
                className="accent-emerald-500"
              />
              <span className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  value={slice.weight}
                  aria-label={`${label} ${slice.variant} weight`}
                  onChange={(e) => onChange({ ...serve, rollout: setRolloutWeight(serve.rollout, i, Number(e.target.value)) })}
                  className={cn(inputClass, 'h-7 w-16 text-right font-mono')}
                />
                <span className="text-xs text-zinc-500">%</span>
              </span>
            </div>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <label className="inline-flex items-center gap-1.5 text-zinc-500">
              <span>bucket by</span>
              <input
                aria-label={`${label} bucket by`}
                list={attributesListId}
                value={serve.bucketBy}
                placeholder="userId"
                onChange={(e) => onChange({ ...serve, bucketBy: e.target.value })}
                className={cn(inputClass, 'h-7 w-32 font-mono')}
              />
            </label>
            <output className={cn('font-mono', total === 100 ? 'text-emerald-400' : 'text-red-400')}>
              Σ = {total} % {total === 100 ? '✓' : '✗'}
            </output>
          </div>
          <p className="text-[10px] text-zinc-600">
            Users without <code className="font-mono">{bucketByLabel(serve)}</code> get the default variant.
          </p>
          <FieldError errors={errors} path={`${path}.rollout`} />
        </div>
      )}
    </div>
  );
};

function valuePlaceholder(operator: ConditionOperator): string {
  if (isSemVerOperator(operator)) return '2.0.0';
  return operator === 'matches' ? '^acme-' : 'value, Enter';
}

const ConditionRow: React.FC<{
  condition: ConditionDraft;
  index: number;
  ruleLabel: string;
  onChange: (c: ConditionDraft) => void;
  onRemove: () => void;
  canRemove: boolean;
  errors: FieldErrors;
  path: string;
  attributesListId: string;
}> = ({ condition, index, ruleLabel, onChange, onRemove, canRemove, errors, path, attributesListId }) => {
  const label = `${ruleLabel} condition ${index + 1}`;
  return (
    <div className="grid grid-cols-[34px_140px_130px_1fr_auto] items-start gap-2">
      <span className="h-8 inline-flex items-center text-[10px] font-bold uppercase tracking-widest text-zinc-500">
        {index === 0 ? 'if' : 'and'}
      </span>
      <div>
        <input
          aria-label={`${label} attribute`}
          list={attributesListId}
          value={condition.attribute}
          onChange={(e) => onChange({ ...condition, attribute: e.target.value })}
          aria-invalid={!!errors[`${path}.attribute`] || undefined}
          className={cn(inputClass, 'font-mono')}
        />
        <FieldError errors={errors} path={`${path}.attribute`} />
      </div>
      <select
        aria-label={`${label} operator`}
        value={condition.operator}
        onChange={(e) => onChange({ ...condition, operator: e.target.value as ConditionOperator })}
        className={selectClass}
      >
        {OPERATORS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <div>
        <ChipsInput
          label={`${label} values`}
          values={condition.values}
          onChange={(values) => onChange({ ...condition, values })}
          placeholder={valuePlaceholder(condition.operator)}
          invalid={!!errors[`${path}.values`]}
        />
        <FieldError errors={errors} path={`${path}.values`} />
      </div>
      <button
        type="button"
        onClick={onRemove}
        disabled={!canRemove}
        aria-label={`Remove ${label}`}
        className="h-8 w-8 inline-flex items-center justify-center border border-zinc-800 text-zinc-500 hover:text-red-400 disabled:opacity-40"
      >
        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
    </div>
  );
};

const RuleCard: React.FC<{
  flag: FeatureFlag;
  rule: RuleDraft;
  index: number;
  count: number;
  onChange: (rule: RuleDraft) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
  errors: FieldErrors;
  attributesListId: string;
}> = ({ flag, rule, index, count, onChange, onMove, onRemove, errors, attributesListId }) => {
  const label = `Rule ${index + 1}`;
  const path = `rules.${index}`;
  const iconButton = 'h-7 w-7 inline-flex items-center justify-center border border-zinc-800 text-zinc-500 hover:text-zinc-200 disabled:opacity-30';
  return (
    <section aria-label={label} className="border border-zinc-800 bg-black/30 p-3 space-y-3">
      <header className="flex items-center justify-between">
        <h4 className="text-[11px] font-bold uppercase tracking-widest text-zinc-400">{label}</h4>
        <div className="flex items-center gap-1">
          <button type="button" className={iconButton} onClick={() => onMove(-1)} disabled={index === 0} aria-label={`Move ${label} up`}>
            <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={iconButton}
            onClick={() => onMove(1)}
            disabled={index === count - 1}
            aria-label={`Move ${label} down`}
          >
            <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <button type="button" className={cn(iconButton, 'hover:text-red-400')} onClick={onRemove} aria-label={`Delete ${label}`}>
            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      </header>
      <div className="space-y-2">
        {rule.conditions.map((c, j) => (
          <ConditionRow
            key={c.id}
            condition={c}
            index={j}
            ruleLabel={label}
            onChange={(next) => onChange({ ...rule, conditions: rule.conditions.map((x) => (x.id === c.id ? next : x)) })}
            onRemove={() => onChange({ ...rule, conditions: rule.conditions.filter((x) => x.id !== c.id) })}
            canRemove={rule.conditions.length > 1}
            errors={errors}
            path={`${path}.conditions.${j}`}
            attributesListId={attributesListId}
          />
        ))}
        <button
          type="button"
          onClick={() => onChange({ ...rule, conditions: [...rule.conditions, newCondition()] })}
          className="inline-flex items-center gap-1 text-xs text-flags hover:underline"
        >
          <Plus className="w-3 h-3" aria-hidden="true" /> And
        </button>
        <FieldError errors={errors} path={path} />
      </div>
      <ServeEditor
        flag={flag}
        serve={rule.serve}
        onChange={(serve) => onChange({ ...rule, serve })}
        errors={errors}
        path={`${path}.serve`}
        label={label}
        attributesListId={attributesListId}
      />
    </section>
  );
};

/**
 * The targeting of one environment: on/off and off variant, ordered rules (first match wins)
 * and the default rule for everyone else. Controlled: the parent owns the draft.
 */
export const TargetingEditor: React.FC<{
  flag: FeatureFlag;
  environment: string;
  draft: TargetingDraft;
  onChange: (draft: TargetingDraft) => void;
  errors: FieldErrors;
  attributes: string[];
}> = ({ flag, environment, draft, onChange, errors, attributes }) => {
  const attributesListId = useId();
  const moveRule = (index: number, delta: -1 | 1) => {
    const rules = [...draft.rules];
    const [rule] = rules.splice(index, 1);
    rules.splice(index + delta, 0, rule);
    onChange({ ...draft, rules });
  };

  return (
    <div className="space-y-4">
      <datalist id={attributesListId}>
        {attributes.map((a) => (
          <option key={a} value={a} />
        ))}
      </datalist>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border border-zinc-800 bg-card/60 p-3">
        <label className="inline-flex items-center gap-2 text-sm text-zinc-200">
          Flag in <span className="font-mono">{environment}</span>
          <Switch
            checked={draft.enabled}
            onCheckedChange={(enabled) => onChange({ ...draft, enabled })}
            aria-label={`Enabled in ${environment}`}
            className="data-checked:bg-flags"
          />
          <span className={cn('text-xs font-bold', draft.enabled ? 'text-flags' : 'text-zinc-500')}>{draft.enabled ? 'ON' : 'OFF'}</span>
        </label>
        <label className="inline-flex items-center gap-2 text-xs text-zinc-400">
          <span>When off serve</span>
          <select
            aria-label="Off variant"
            value={draft.offVariant}
            onChange={(e) => onChange({ ...draft, offVariant: e.target.value })}
            aria-invalid={!!errors.offVariant || undefined}
            className={selectClass}
          >
            <option value="">{flag.defaultVariant} (default)</option>
            {flag.variants
              .filter((v) => v.key !== flag.defaultVariant)
              .map((v) => (
                <option key={v.key} value={v.key}>
                  {v.key}
                </option>
              ))}
          </select>
        </label>
        <FieldError errors={errors} path="offVariant" />
      </div>

      <div className="space-y-2">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
          Targeting rules <span className="normal-case tracking-normal text-zinc-600">(first match wins)</span>
        </h3>
        {draft.rules.length === 0 && <p className="text-xs text-zinc-600">No rules: everyone gets the default rule below.</p>}
        {draft.rules.map((rule, i) => (
          <RuleCard
            key={rule.id}
            flag={flag}
            rule={rule}
            index={i}
            count={draft.rules.length}
            onChange={(next) => onChange({ ...draft, rules: draft.rules.map((r) => (r.id === rule.id ? next : r)) })}
            onMove={(delta) => moveRule(i, delta)}
            onRemove={() => onChange({ ...draft, rules: draft.rules.filter((r) => r.id !== rule.id) })}
            errors={errors}
            attributesListId={attributesListId}
          />
        ))}
        <button
          type="button"
          onClick={() => onChange({ ...draft, rules: [...draft.rules, newRule(flag)] })}
          className="inline-flex items-center gap-1 h-7 px-2 border border-dashed border-zinc-700 text-xs text-zinc-300 hover:border-flags hover:text-flags"
        >
          <Plus className="w-3 h-3" aria-hidden="true" /> Add rule
        </button>
      </div>

      <section aria-label="Default rule" className="border border-zinc-800 bg-black/30 p-3 space-y-2">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Default (everyone else)</h3>
        <ServeEditor
          flag={flag}
          serve={draft.fallthrough}
          onChange={(fallthrough) => onChange({ ...draft, fallthrough })}
          errors={errors}
          path="fallthrough"
          label="Default rule"
          attributesListId={attributesListId}
        />
      </section>
    </div>
  );
};
