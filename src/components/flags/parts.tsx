import React, { useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FieldErrors } from '@/lib/flags';

/** Small uppercase label used across the flag forms. */
export const FieldLabel: React.FC<{ htmlFor?: string; children: React.ReactNode }> = ({ htmlFor, children }) => (
  <label htmlFor={htmlFor} className="block text-[10px] uppercase font-bold tracking-widest text-zinc-500 mb-1">
    {children}
  </label>
);

export const FieldError: React.FC<{ errors: FieldErrors; path: string; id?: string }> = ({ errors, path, id }) =>
  errors[path] ? (
    <p id={id} role="alert" className="mt-1 text-[11px] text-red-400">
      {errors[path]}
    </p>
  ) : null;

export const inputClass =
  'h-8 w-full bg-zinc-950 border border-zinc-800 px-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 aria-[invalid=true]:border-red-500/60';

export const selectClass =
  'h-8 bg-zinc-950 border border-zinc-800 px-2 text-xs text-zinc-200 focus:outline-none focus:border-zinc-600 aria-[invalid=true]:border-red-500/60';

/**
 * Chips editor: Enter or comma adds the typed value, Backspace on an empty input removes the
 * last chip. Used for tags and condition values.
 */
export const ChipsInput: React.FC<{
  values: string[];
  onChange: (values: string[]) => void;
  label: string;
  placeholder?: string;
  invalid?: boolean;
  list?: string;
}> = ({ values, onChange, label, placeholder, invalid, list }) => {
  const [text, setText] = useState('');
  const add = () => {
    const v = text.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setText('');
  };
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-1 min-h-8 px-1.5 py-1 bg-zinc-950 border',
        invalid ? 'border-red-500/60' : 'border-zinc-800 focus-within:border-zinc-600'
      )}
    >
      {values.map((v) => (
        <span key={v} className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-zinc-900 border border-zinc-800 font-mono text-[11px] text-zinc-200">
          {v}
          <button
            type="button"
            onClick={() => onChange(values.filter((x) => x !== v))}
            aria-label={`Remove ${v}`}
            className="text-zinc-500 hover:text-zinc-200"
          >
            <X className="w-3 h-3" aria-hidden="true" />
          </button>
        </span>
      ))}
      <input
        aria-label={label}
        aria-invalid={invalid || undefined}
        value={text}
        list={list}
        placeholder={values.length ? '' : placeholder}
        onChange={(e) => setText(e.target.value)}
        onBlur={add}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add();
          } else if (e.key === 'Backspace' && !text && values.length) {
            onChange(values.slice(0, -1));
          }
        }}
        className="flex-1 min-w-[80px] h-6 bg-transparent text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
      />
    </div>
  );
};
