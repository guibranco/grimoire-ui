import React from 'react';
import { ACCESS_TOKEN_SCOPES } from '@/lib/accessTokens';
import type { AccessTokenScope, Environment } from '@/types/api';
import { FieldError } from '@/components/flags/parts';

export const checkboxClass = 'h-3.5 w-3.5 accent-grimoire';
export const optionClass = 'inline-flex items-center gap-1.5 text-xs text-zinc-300 cursor-pointer';
export const legendClass = 'block text-[10px] uppercase font-bold tracking-widest text-zinc-500 mb-1';

export const toggle = <T extends string>(list: T[], value: T, on: boolean) =>
  on ? [...list, value] : list.filter((v) => v !== value);

interface EnvironmentsFieldProps {
  envs: Environment[];
  all: boolean;
  selected: string[];
  onChange: (patch: { allEnvironments?: boolean; environments?: string[] }) => void;
  errors: Record<string, string>;
}

/** "All environments" or a checkbox per environment. */
export const EnvironmentsField: React.FC<EnvironmentsFieldProps> = ({ envs, all, selected, onChange, errors }) => (
  <fieldset>
    <legend className={legendClass}>Environments</legend>
    <label className={optionClass}>
      <input
        type="checkbox"
        className={checkboxClass}
        checked={all}
        onChange={(e) => onChange({ allEnvironments: e.target.checked })}
      />
      <span>All environments, including ones added later</span>
    </label>
    {!all && (
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
        {envs.map((env) => (
          <label key={env.slug} className={optionClass}>
            <input
              type="checkbox"
              className={checkboxClass}
              checked={selected.includes(env.slug)}
              onChange={(e) => onChange({ environments: toggle(selected, env.slug, e.target.checked) })}
            />
            <span className="font-mono">{env.slug}</span>
          </label>
        ))}
      </div>
    )}
    <FieldError errors={errors} path="environments" />
  </fieldset>
);

interface ScopesFieldProps {
  selected: AccessTokenScope[];
  onChange: (scopes: AccessTokenScope[]) => void;
  errors: Record<string, string>;
}

/** What a token can read. */
export const ScopesField: React.FC<ScopesFieldProps> = ({ selected, onChange, errors }) => (
  <fieldset>
    <legend className={legendClass}>Can read</legend>
    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
      {ACCESS_TOKEN_SCOPES.map((scope) => (
        <label key={scope.value} className={optionClass}>
          <input
            type="checkbox"
            className={checkboxClass}
            checked={selected.includes(scope.value)}
            onChange={(e) => onChange(toggle<AccessTokenScope>(selected, scope.value, e.target.checked))}
          />
          <span>{scope.label}</span>
        </label>
      ))}
    </div>
    <FieldError errors={errors} path="scopes" />
  </fieldset>
);
