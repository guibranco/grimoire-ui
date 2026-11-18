import React, { useCallback, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, ListPlus, Plus, Wand2, X } from 'lucide-react';
import type { ConfigValueType } from '@/types/api';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  CONFIG_VALUE_TYPES,
  convertValue,
  parseArrayItems,
  prettyJson,
  previewValue,
  toEditorValue,
  toSubmitValue,
  validateConfigValue,
} from '@/lib/configValue';

type Accent = 'config' | 'global';

const textFor = (accent: Accent) =>
  accent === 'global' ? 'text-global hover:text-global/80' : 'text-config hover:text-config/80';

const ringFor = (accent: Accent) =>
  accent === 'global' ? 'focus-visible:ring-global' : 'focus-visible:ring-config';

export interface ConfigValueState {
  valueType: ConfigValueType;
  value: string;
  setValue: (value: string) => void;
  /** Switches type, converting what was typed (e.g. lines become array items). */
  changeType: (next: ConfigValueType) => void;
  /** Replaces type and value, e.g. when the row is reseeded. */
  reset: (type: ConfigValueType, raw: string) => void;
  /** The value to send to the API, or the error to show. */
  prepare: (key: string) => { ok: true; value: string } | { ok: false; error: string };
}

/** Value-type and value state for an add/edit row. */
export const useConfigValue = (seedType: ConfigValueType, seedValue: string): ConfigValueState => {
  const [valueType, setValueType] = useState<ConfigValueType>(seedType);
  const [value, setValue] = useState(() => toEditorValue(seedType, seedValue));

  const reset = useCallback((type: ConfigValueType, raw: string) => {
    setValueType(type);
    setValue(toEditorValue(type, raw));
  }, []);

  const changeType = (next: ConfigValueType) => {
    setValue(convertValue(valueType, next, value));
    setValueType(next);
  };

  const prepare = (key: string) => {
    if (!key.trim() || (valueType !== 'array' && !value.trim()))
      return { ok: false as const, error: 'Key and value are required' };
    const submit = toSubmitValue(valueType, value);
    const error = validateConfigValue(valueType, submit);
    return error ? { ok: false as const, error } : { ok: true as const, value: submit };
  };

  return { valueType, value, setValue, changeType, reset, prepare };
};

/** Type selector plus the matching editor, for an add/edit row. */
export const ConfigValueField: React.FC<{ state: ConfigValueState; accent?: Accent; autoFocus?: boolean }> = ({
  state,
  accent = 'config',
  autoFocus,
}) => (
  <div className="space-y-1.5">
    <ValueTypeSelect value={state.valueType} onChange={state.changeType} accent={accent} />
    <ConfigValueEditor
      type={state.valueType}
      value={state.value}
      onChange={state.setValue}
      accent={accent}
      autoFocus={autoFocus}
    />
  </div>
);

export const ValueTypeSelect: React.FC<{
  value: ConfigValueType;
  onChange: (type: ConfigValueType) => void;
  accent?: Accent;
}> = ({ value, onChange, accent = 'config' }) => (
  <select
    aria-label="Value type"
    value={value}
    onChange={(e) => onChange(e.target.value as ConfigValueType)}
    className={cn(
      'h-7 px-2 bg-card border border-border text-[10px] font-bold uppercase tracking-widest text-zinc-300 cursor-pointer',
      accent === 'global' ? 'focus:border-global' : 'focus:border-config'
    )}
  >
    {CONFIG_VALUE_TYPES.map((t) => (
      <option key={t.value} value={t.value} title={t.hint}>
        {t.label}
      </option>
    ))}
  </select>
);

interface ConfigValueEditorProps {
  type: ConfigValueType;
  /** For "array", a JSON array of strings; otherwise the raw text. */
  value: string;
  onChange: (value: string) => void;
  accent?: Accent;
  autoFocus?: boolean;
}

/** Editor that matches the value type: input, textarea, list editor or JSON editor. */
export const ConfigValueEditor: React.FC<ConfigValueEditorProps> = ({
  type,
  value,
  onChange,
  accent = 'config',
  autoFocus,
}) => {
  if (type === 'array') return <ArrayEditor value={value} onChange={onChange} accent={accent} />;
  if (type === 'json') return <JsonEditor value={value} onChange={onChange} accent={accent} autoFocus={autoFocus} />;
  if (type === 'multiline')
    return (
      <Textarea
        aria-label="Value"
        placeholder="Value (line breaks are kept)"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        autoFocus={autoFocus}
        className={cn('min-h-20 font-mono text-xs border-border bg-card rounded-none', ringFor(accent))}
      />
    );
  return (
    <Input
      aria-label="Value"
      placeholder="Value"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      autoFocus={autoFocus}
      className={cn('h-8 font-mono text-xs border-border bg-card', ringFor(accent))}
    />
  );
};

interface Row {
  id: number;
  text: string;
}

const ArrayEditor: React.FC<{ value: string; onChange: (value: string) => void; accent: Accent }> = ({
  value,
  onChange,
  accent,
}) => {
  const items = parseArrayItemsKeepingBlanks(value);
  const [pasting, setPasting] = useState(false);
  const [pasteText, setPasteText] = useState('');

  // Stable row keys, so focus stays in the right input when rows move or are removed.
  const nextId = useRef(0);
  const ids = useRef<number[]>([]);
  if (ids.current.length !== items.length) ids.current = items.map(() => nextId.current++);
  const rows: Row[] = items.map((text, i) => ({ id: ids.current[i], text }));

  const update = (next: Row[]) => {
    ids.current = next.map((r) => r.id);
    onChange(JSON.stringify(next.map((r) => r.text)));
  };
  const newRows = (texts: string[]): Row[] => texts.map((text) => ({ id: nextId.current++, text }));
  const move = (from: number, to: number) => {
    if (to < 0 || to >= rows.length) return;
    const next = [...rows];
    const [row] = next.splice(from, 1);
    next.splice(to, 0, row);
    update(next);
  };

  if (pasting) {
    return (
      <div className="space-y-1.5">
        <Textarea
          aria-label="Paste items, one per line"
          placeholder={'One item per line\n10.0.0.1\n10.0.0.2'}
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          rows={5}
          autoFocus
          className={cn('min-h-24 font-mono text-xs border-border bg-card rounded-none', ringFor(accent))}
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              update(newRows(parseArrayItems(pasteText)));
              setPasting(false);
            }}
            className={cn('text-[10px] font-bold uppercase tracking-widest', textFor(accent))}
          >
            Replace list
          </button>
          <button
            type="button"
            onClick={() => {
              update([...rows.filter((r) => r.text.trim() !== ''), ...newRows(parseArrayItems(pasteText))]);
              setPasting(false);
            }}
            className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 hover:text-zinc-200"
          >
            Append
          </button>
          <button
            type="button"
            onClick={() => setPasting(false)}
            className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 hover:text-zinc-400"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {rows.length === 0 && (
        <p className="text-[10px] uppercase tracking-widest text-zinc-600 py-1">Empty list</p>
      )}
      {rows.map((row, index) => (
        <div key={row.id} className="flex items-center gap-1">
          <span className="w-5 text-right text-[10px] font-mono text-zinc-600 shrink-0">{index}</span>
          <Input
            aria-label={`Item ${index + 1}`}
            value={row.text}
            onChange={(e) => {
              const next = [...rows];
              next[index] = { ...row, text: e.target.value };
              update(next);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                const next = [...rows];
                next.splice(index + 1, 0, ...newRows(['']));
                update(next);
              }
            }}
            className={cn('h-7 font-mono text-xs border-border bg-card', ringFor(accent))}
          />
          <IconButton label={`Move item ${index + 1} up`} disabled={index === 0} onClick={() => move(index, index - 1)}>
            <ArrowUp className="w-3 h-3" />
          </IconButton>
          <IconButton
            label={`Move item ${index + 1} down`}
            disabled={index === rows.length - 1}
            onClick={() => move(index, index + 1)}
          >
            <ArrowDown className="w-3 h-3" />
          </IconButton>
          <IconButton label={`Remove item ${index + 1}`} onClick={() => update(rows.filter((r) => r.id !== row.id))}>
            <X className="w-3 h-3" />
          </IconButton>
        </div>
      ))}
      <div className="flex gap-3 pt-1 pl-6">
        <button
          type="button"
          onClick={() => update([...rows, ...newRows([''])])}
          className={cn(
            'inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest',
            textFor(accent)
          )}
        >
          <Plus className="w-3 h-3" /> Add item
        </button>
        <button
          type="button"
          onClick={() => {
            setPasteText('');
            setPasting(true);
          }}
          className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-zinc-400 hover:text-zinc-200"
        >
          <ListPlus className="w-3 h-3" /> Paste lines
        </button>
      </div>
    </div>
  );
};

const JsonEditor: React.FC<{
  value: string;
  onChange: (value: string) => void;
  accent: Accent;
  autoFocus?: boolean;
}> = ({ value, onChange, accent, autoFocus }) => {
  const error = value.trim() === '' ? null : validateConfigValue('json', value);
  return (
    <div className="space-y-1">
      <Textarea
        aria-label="JSON value"
        aria-invalid={!!error}
        placeholder={'{\n  "key": "value"\n}'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Tab') {
            e.preventDefault();
            const el = e.currentTarget;
            const { selectionStart, selectionEnd } = el;
            const next = `${value.slice(0, selectionStart)}  ${value.slice(selectionEnd)}`;
            onChange(next);
            requestAnimationFrame(() => el.setSelectionRange(selectionStart + 2, selectionStart + 2));
          }
        }}
        rows={6}
        spellCheck={false}
        autoFocus={autoFocus}
        className={cn('min-h-28 font-mono text-xs border-border bg-card rounded-none', ringFor(accent))}
      />
      <div className="flex items-center justify-between gap-2">
        <span className={cn('text-[10px] font-mono', error ? 'text-destructive' : 'text-zinc-600')}>
          {error ?? (value.trim() ? 'Valid JSON' : '')}
        </span>
        <button
          type="button"
          disabled={!!error || value.trim() === ''}
          onClick={() => onChange(prettyJson(value))}
          className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-zinc-400 hover:text-zinc-200 disabled:opacity-40"
        >
          <Wand2 className="w-3 h-3" /> Format
        </button>
      </div>
    </div>
  );
};

const IconButton: React.FC<{
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}> = ({ label, onClick, disabled, children }) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    disabled={disabled}
    onClick={onClick}
    className="h-7 w-6 inline-flex items-center justify-center text-zinc-500 hover:text-zinc-200 disabled:opacity-30 shrink-0"
  >
    {children}
  </button>
);

/** Like parseArrayItems, but keeps blank items so a freshly added row stays visible while editing. */
const parseArrayItemsKeepingBlanks = (value: string): string[] => {
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map((i) => (typeof i === 'string' ? i : JSON.stringify(i)));
  } catch {
    // Not JSON yet.
  }
  return parseArrayItems(value);
};

export const ValueTypeBadge: React.FC<{ type: ConfigValueType }> = ({ type }) =>
  type === 'string' ? null : (
    <Badge
      variant="outline"
      className="border-zinc-700 bg-zinc-900 text-zinc-400 text-[9px] font-bold uppercase tracking-widest"
    >
      {type === 'json' ? 'JSON' : type}
    </Badge>
  );

const fullValue = (type: ConfigValueType, value: string): string => {
  if (type === 'array') return parseArrayItems(value).join('\n');
  if (type === 'json') return prettyJson(value);
  return value;
};

/** List-view value: type badge plus a one-line preview that expands to the full value. */
export const ConfigValueCell: React.FC<{ type: ConfigValueType; value: string; className?: string }> = ({
  type,
  value,
  className,
}) => {
  const [expanded, setExpanded] = useState(false);
  if (type === 'string') return <span className={className}>{value}</span>;

  const full = fullValue(type, value);

  return (
    <div className={cn('min-w-0', className)}>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        aria-label={expanded ? 'Collapse value' : 'Expand value'}
        className="flex items-center gap-1.5 max-w-full text-left hover:text-zinc-100 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="w-3 h-3 shrink-0 text-zinc-500" />
        ) : (
          <ChevronRight className="w-3 h-3 shrink-0 text-zinc-500" />
        )}
        <ValueTypeBadge type={type} />
        {!expanded && <span className="truncate max-w-[420px]">{previewValue(type, value)}</span>}
      </button>
      {expanded && (
        <pre className="mt-1.5 p-2 bg-zinc-950 border border-zinc-800 text-[11px] whitespace-pre-wrap break-all max-h-64 overflow-auto">
          {full}
        </pre>
      )}
    </div>
  );
};
