import { describe, it, expect } from 'vitest';
import {
  convertValue,
  exportValue,
  importEntry,
  parseArrayItems,
  previewValue,
  toEditorValue,
  toSubmitValue,
  validateConfigValue,
  valueTypeOf,
} from '../src/lib/configValue';

describe('configValue', () => {
  it('treats a missing valueType as string', () => {
    expect(valueTypeOf({})).toBe('string');
    expect(valueTypeOf({ valueType: 'json' })).toBe('json');
  });

  it('parses array items from JSON or one per line', () => {
    expect(parseArrayItems('["a","b"]')).toEqual(['a', 'b']);
    expect(parseArrayItems(' a \r\n\nb\n')).toEqual(['a', 'b']);
    expect(parseArrayItems('')).toEqual([]);
  });

  it('validates values the way the API does', () => {
    expect(validateConfigValue('string', '{ nope')).toBeNull();
    expect(validateConfigValue('array', 'one\ntwo')).toBeNull();
    expect(validateConfigValue('array', '[1,2]')).toMatch(/string/);
    expect(validateConfigValue('array', '["a"')).toMatch(/JSON/);
    expect(validateConfigValue('json', '{"a":1}')).toBeNull();
    expect(validateConfigValue('json', '42')).toMatch(/object or array/);
    expect(validateConfigValue('json', '{ nope')).toMatch(/Invalid JSON/);
  });

  it('submits arrays as a JSON array without blank items', () => {
    expect(toSubmitValue('array', '["a","","b"]')).toBe('["a","b"]');
    expect(toSubmitValue('multiline', 'a\nb')).toBe('a\nb');
  });

  it('keeps what the user typed when switching type', () => {
    expect(convertValue('multiline', 'array', 'a\nb')).toBe('["a","b"]');
    expect(convertValue('array', 'multiline', '["a","b"]')).toBe('a\nb');
    expect(convertValue('array', 'string', '["a","b"]')).toBe('a,b');
    expect(convertValue('array', 'json', '["a"]')).toBe('[\n  "a"\n]');
    expect(convertValue('json', 'array', '["a", 1]')).toBe('["a","1"]');
    expect(convertValue('multiline', 'string', 'a\nb')).toBe('a b');
    expect(convertValue('string', 'json', '{"a":1}')).toBe('{\n  "a": 1\n}');
  });

  it('builds previews and editor values', () => {
    expect(previewValue('array', '["10.0.0.1","10.0.0.2"]')).toBe('10.0.0.1, 10.0.0.2');
    expect(previewValue('array', '[]')).toBe('[ ]');
    expect(previewValue('multiline', 'a\nb')).toBe('a ↵ b');
    expect(previewValue('json', '{ "a" : 1 }')).toBe('{"a":1}');
    expect(toEditorValue('json', '{"a":1}')).toBe('{\n  "a": 1\n}');
  });

  it('round-trips structured values through export and import', () => {
    expect(exportValue('array', '["a"]')).toEqual(['a']);
    expect(exportValue('json', '{"a":1}')).toEqual({ a: 1 });
    expect(exportValue('string', '["a"]')).toBe('["a"]');
    expect(importEntry(['a'])).toEqual({ value: '["a"]', valueType: 'array' });
    expect(importEntry({ a: 1 })).toEqual({ value: '{"a":1}', valueType: 'json' });
    expect(importEntry([1, 2])).toEqual({ value: '[1,2]', valueType: 'json' });
    expect(importEntry('a\nb')).toEqual({ value: 'a\nb', valueType: 'multiline' });
    expect(importEntry(3)).toEqual({ value: '3', valueType: 'string' });
  });
});
