import type { ConfigValueType } from '@/types/api';

export const CONFIG_VALUE_TYPES: { value: ConfigValueType; label: string; hint: string }[] = [
  { value: 'string', label: 'String', hint: 'Single-line text' },
  { value: 'multiline', label: 'Multiline', hint: 'Text with line breaks' },
  { value: 'array', label: 'Array', hint: 'List of strings (e.g. IP allow-list)' },
  { value: 'json', label: 'JSON', hint: 'JSON object or array' },
];

/** Value type of an entry, treating a missing field (older API) as "string". */
export const valueTypeOf = (entry: { valueType?: ConfigValueType | null }): ConfigValueType =>
  entry.valueType ?? 'string';

/**
 * Items of an array value. Accepts a JSON array of strings or one item per line, the same
 * inputs the API accepts.
 */
export const parseArrayItems = (value: string): string[] => {
  const trimmed = value.trim();
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.map((item) => (typeof item === 'string' ? item : JSON.stringify(item)));
    } catch {
      // Fall through to line splitting.
    }
  }
  return trimmed
    .split(/\r?\n|\r/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
};

/** Pretty-prints JSON for editing; returns the input unchanged if it isn't valid JSON. */
export const prettyJson = (value: string): string => {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
};

/**
 * Error message for a value that the API would reject for this type, or null when it's valid.
 * Mirrors the server rules so the user sees the problem before saving.
 */
export const validateConfigValue = (type: ConfigValueType, value: string): string | null => {
  if (type === 'array') return validateArray(value);
  if (type === 'json') return validateJson(value);
  return null;
};

const validateArray = (value: string): string | null => {
  const trimmed = value.trim();
  // Anything not starting with "[" is one item per line, which is always valid.
  if (!trimmed.startsWith('[')) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return 'Not a valid JSON array';
  }
  if (!Array.isArray(parsed)) return 'Must be a JSON array of strings';
  return parsed.every((item) => typeof item === 'string') ? null : 'Every item must be a string';
};

const validateJson = (value: string): string | null => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (e) {
    return e instanceof Error ? `Invalid JSON: ${e.message}` : 'Invalid JSON';
  }
  return parsed !== null && typeof parsed === 'object' ? null : 'Must be a JSON object or array';
};

/** Value to send to the API: arrays go as a JSON array of their non-blank items. */
export const toSubmitValue = (type: ConfigValueType, value: string): string =>
  type === 'array'
    ? JSON.stringify(parseArrayItems(value).filter((item) => item.trim() !== ''))
    : value;

/** Converts the value being edited when the user switches value type, keeping what they typed. */
export const convertValue = (from: ConfigValueType, to: ConfigValueType, value: string): string => {
  if (from === to) return value;
  if (to === 'array') return JSON.stringify(parseArrayItems(value));
  if (from === 'array') return fromArray(to, parseArrayItems(value));
  if (to === 'json') return prettyJson(value);
  if (to === 'string') return value.replace(/\r?\n/g, ' ');
  return value;
};

const fromArray = (to: ConfigValueType, items: string[]): string => {
  if (to === 'json') return JSON.stringify(items, null, 2);
  return items.join(to === 'multiline' ? '\n' : ',');
};

/** One-line preview for list views. */
export const previewValue = (type: ConfigValueType, value: string): string => {
  if (type === 'array') {
    const items = parseArrayItems(value);
    return items.length === 0 ? '[ ]' : items.join(', ');
  }
  if (type === 'multiline') return value.replace(/\r?\n/g, ' ↵ ');
  if (type === 'json') {
    try {
      return JSON.stringify(JSON.parse(value));
    } catch {
      return value;
    }
  }
  return value;
};

/** Seed value for the editor: arrays as JSON, JSON pretty-printed. */
export const toEditorValue = (type: ConfigValueType, value: string): string => {
  if (type === 'array') return JSON.stringify(parseArrayItems(value));
  if (type === 'json') return prettyJson(value);
  return value;
};

/** Export form of a value: arrays and JSON as real JSON, so an export can be re-imported. */
export const exportValue = (type: ConfigValueType, value: string): unknown => {
  if (type === 'array' || type === 'json') {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
};

/** Value and value type for an imported entry, inferred from its JSON shape. */
export const importEntry = (raw: unknown): { value: string; valueType: ConfigValueType } => {
  if (Array.isArray(raw) && raw.every((item) => typeof item === 'string'))
    return { value: JSON.stringify(raw), valueType: 'array' };
  if (raw !== null && typeof raw === 'object') return { value: JSON.stringify(raw), valueType: 'json' };
  const text = raw === null || raw === undefined ? '' : String(raw as string | number | boolean);
  return { value: text, valueType: /[\r\n]/.test(text) ? 'multiline' : 'string' };
};

