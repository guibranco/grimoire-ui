import type { ConfigValueType, ImportAction, ImportFormat, ImportKind, ImportPlanItem } from '@/types/api';

/** Keys that look like credentials (the API's defaults), matched case-insensitively. */
export const DEFAULT_SECRET_KEYS = ['*Password*', '*Secret*', '*Token*', 'ConnectionStrings:*'];

export const IMPORT_FORMATS: { value: ImportFormat; label: string }[] = [
  { value: 'env', label: '.env' },
  { value: 'appsettings', label: 'appsettings.json' },
  { value: 'php', label: 'PHP config' },
  { value: 'json', label: 'Flat JSON' },
];

/** Where an import goes: an application or Global. */
export type ImportScope = { appSlug: string } | 'global';

export const importUrl = (scope: ImportScope, environment: string, dryRun: boolean) => {
  const base = scope === 'global' ? '/global/import' : `/applications/${scope.appSlug}/import`;
  return `${base}?${new URLSearchParams({ environment, dryRun: String(dryRun) }).toString()}`;
};

/**
 * The format a file is probably in, from its name and then its content: `.env*` files and
 * `KEY=value` text are env, `.php`/`<?php` is PHP, JSON with nested objects is appsettings.
 */
export function detectFormat(fileName: string | null, content: string): ImportFormat {
  const name = (fileName ?? '').toLowerCase();
  const text = content.trimStart();
  if (name.endsWith('.php') || text.startsWith('<?php')) return 'php';
  if (name.startsWith('.env') || name.endsWith('.env')) return 'env';
  if (name.endsWith('.json') || text.startsWith('{')) {
    if (name.startsWith('appsettings')) return 'appsettings';
    try {
      const parsed = JSON.parse(content);
      const nested = Object.values(parsed ?? {}).some((v) => v !== null && typeof v === 'object' && !Array.isArray(v));
      return nested ? 'appsettings' : 'json';
    } catch {
      return 'appsettings';
    }
  }
  return 'env';
}

/** Secret patterns typed one per line or comma-separated; blanks dropped. */
export const parsePatterns = (text: string) =>
  text
    .split(/[\n,]/)
    .map((p) => p.trim())
    .filter(Boolean);

/** Whether `key` matches the glob (`*` = any run of characters), ignoring case. */
export function globMatch(key: string, glob: string): boolean {
  const text = key.toUpperCase();
  const pattern = glob.toUpperCase();
  let t = 0;
  let g = 0;
  let star = -1;
  let mark = 0;
  while (t < text.length) {
    if (pattern[g] === '*') {
      star = g++;
      mark = t;
    } else if (g < pattern.length && pattern[g] === text[t]) {
      g++;
      t++;
    } else if (star >= 0) {
      g = star + 1;
      t = ++mark;
    } else {
      return false;
    }
  }
  while (pattern[g] === '*') g++;
  return g === pattern.length;
}

export const ACTION_LABELS: Record<ImportAction, string> = {
  create: 'Create',
  update: 'Overwrite',
  unchanged: 'Unchanged',
  skip: 'Keep existing',
  conflict: 'Conflict',
  excluded: 'Excluded',
};

/** What applying writes: created and overwritten keys. */
export const writes = <T extends ImportPlanItem>(items: T[]) =>
  items.filter((i) => i.action === 'create' || i.action === 'update');

// ── Parsing and planning for the demo API (the real API does this server-side) ──

export interface ImportedValue {
  key: string;
  value: string;
  type: ConfigValueType;
}

export class ImportParseError extends Error {}

const textType = (value: string): ConfigValueType => (value.includes('\n') ? 'multiline' : 'string');

/** dotenv: `KEY=value`, `export`, `#` comments, single quotes (literal), double quotes (escapes, may span lines). */
export function parseEnv(content: string): ImportedValue[] {
  const lines = content.replace(/\r\n?/g, '\n').split('\n');
  const values: ImportedValue[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^(?:export\s+)?([A-Za-z_][\w.:-]*)\s*=(.*)$/.exec(line);
    if (!m) throw new ImportParseError(`Line ${i + 1}: expected KEY=value.`);
    const raw = m[2].trimStart();
    let value: string;
    if (raw.startsWith('"')) {
      [value, i] = readDoubleQuoted(lines, i, raw.slice(1));
    } else if (raw.startsWith("'")) {
      const end = raw.indexOf("'", 1);
      if (end < 0) throw new ImportParseError(`Line ${i + 1}: unterminated single quote.`);
      value = raw.slice(1, end);
    } else {
      const comment = raw.indexOf(' #');
      value = (comment >= 0 ? raw.slice(0, comment) : raw).trim();
    }
    values.push({ key: m[1], value, type: textType(value) });
  }
  return values;
}

const ESCAPES: Record<string, string> = { n: '\n', r: '\r', t: '\t' };

function readDoubleQuoted(lines: string[], start: number, first: string): [string, number] {
  let out = '';
  let text = first;
  for (let line = start; ; ) {
    for (let j = 0; j < text.length; j++) {
      const c = text[j];
      if (c === '"') return [out, line];
      if (c === '\\' && j + 1 < text.length) {
        const next = text[++j];
        out += ESCAPES[next] ?? next;
      } else {
        out += c;
      }
    }
    if (++line >= lines.length) throw new ImportParseError(`Line ${start + 1}: unterminated double quote.`);
    out += '\n';
    text = lines[line];
  }
}

const isScalar = (v: unknown) => ['string', 'number', 'boolean'].includes(typeof v);

function jsonValue(key: string, v: unknown): ImportedValue {
  if (typeof v === 'string') return { key, value: v, type: textType(v) };
  if (v === null) return { key, value: '', type: 'string' };
  if (Array.isArray(v) && v.every(isScalar)) return { key, value: JSON.stringify(v.map(String)), type: 'array' };
  if (typeof v === 'object') return { key, value: JSON.stringify(v), type: 'json' };
  return { key, value: String(v), type: 'string' };
}

/** A JSON object; with `flatten` (appsettings), nested objects become `Section:Key`. */
export function parseJsonObject(content: string, flatten: boolean): ImportedValue[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    throw new ImportParseError(`Invalid JSON: ${(err as Error).message}`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ImportParseError('Expected a JSON object at the top level.');
  }
  const values: ImportedValue[] = [];
  const walk = (obj: Record<string, unknown>, prefix: string | null) => {
    for (const [name, v] of Object.entries(obj)) {
      const key = prefix === null ? name : `${prefix}:${name}`;
      if (flatten && v !== null && typeof v === 'object' && !Array.isArray(v)) walk(v as Record<string, unknown>, key);
      else values.push(jsonValue(key, v));
    }
  };
  walk(parsed as Record<string, unknown>, null);
  return values;
}

/** What a target already holds: configuration by key, and whether each secret has a value here. */
export interface ImportSnapshot {
  configuration: Map<string, { value: string; type: ConfigValueType }>;
  secrets: Map<string, boolean>;
}

/** The demo's plan. Secret values aren't kept by the demo, so a secret with a value counts as different. */
export function planImport(
  values: ImportedValue[],
  snapshot: ImportSnapshot,
  options: { secretKeys: string[]; kinds: Record<string, ImportKind>; exclude: string[]; overwrite: boolean }
): (ImportPlanItem & { type: ConfigValueType })[] {
  const last = new Map(values.map((v) => [v.key, v]));
  return [...last.values()].map((v) => {
    const kind: ImportKind =
      options.kinds[v.key] ?? (options.secretKeys.some((g) => globMatch(v.key, g)) ? 'secret' : 'configuration');
    let action: ImportAction;
    if (options.exclude.includes(v.key)) action = 'excluded';
    else if (kind === 'secret') {
      if (snapshot.configuration.has(v.key)) action = 'conflict';
      else if (!snapshot.secrets.get(v.key)) action = 'create';
      else action = options.overwrite ? 'update' : 'skip';
    } else if (snapshot.secrets.has(v.key)) action = 'conflict';
    else {
      const existing = snapshot.configuration.get(v.key);
      if (!existing) action = 'create';
      else if (existing.value === v.value && existing.type === v.type) action = 'unchanged';
      else action = options.overwrite ? 'update' : 'skip';
    }
    return {
      key: v.key,
      kind,
      action,
      value: kind === 'secret' ? null : v.value,
      valueType: kind === 'secret' ? null : v.type,
      type: v.type,
    };
  });
}
