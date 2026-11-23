import { describe, it, expect } from 'vitest';
import {
  ImportParseError,
  detectFormat,
  globMatch,
  importUrl,
  parseEnv,
  parseJsonObject,
  parsePatterns,
  planImport,
  writes,
  DEFAULT_SECRET_KEYS,
} from '../src/lib/importer';

describe('detectFormat', () => {
  it.each([
    ['.env', 'A=1', 'env'],
    ['production.env', '', 'env'],
    ['config.php', '', 'php'],
    [null, '<?php return [];', 'php'],
    ['appsettings.Production.json', '{"A":"1"}', 'appsettings'],
    ['settings.json', '{"A":{"B":"1"}}', 'appsettings'],
    ['settings.json', '{"A":"1","B":[1]}', 'json'],
    [null, '{ not json', 'appsettings'],
    [null, 'A=1', 'env'],
  ] as const)('%s → %s', (name, content, expected) => {
    expect(detectFormat(name, content)).toBe(expected);
  });
});

describe('patterns and globs', () => {
  it('splits patterns on lines and commas', () => {
    expect(parsePatterns('*Password*\n, *Token* ,\n\n')).toEqual(['*Password*', '*Token*']);
  });

  it.each([
    ['DB_PASSWORD', '*password*', true],
    ['ConnectionStrings:Main', 'ConnectionStrings:*', true],
    ['X:ConnectionStrings:Main', 'ConnectionStrings:*', false],
    ['abc', 'a*b*c', true],
    ['acb', 'a*b*c', false],
    ['Token', 'Token', true],
    ['Tokens', 'Token', false],
  ] as const)('%s ~ %s → %s', (key, glob, expected) => {
    expect(globMatch(key, glob)).toBe(expected);
  });
});

describe('importUrl', () => {
  it('targets the application or Global with the environment and dry-run flag', () => {
    expect(importUrl({ appSlug: 'shop' }, 'production', true)).toBe('/applications/shop/import?environment=production&dryRun=true');
    expect(importUrl('global', '*', false)).toBe('/global/import?environment=*&dryRun=false');
  });
});

describe('parseEnv', () => {
  it('reads quoted, unquoted and exported values', () => {
    const values = parseEnv(
      [
        '# comment',
        'export HOST=localhost',
        'PASSWORD="p\\"w # x"',
        "LITERAL='$HOME'",
        'PLAIN = a b # note',
        'MULTI="one',
        'two"',
        'ESCAPED="a\\nb"',
      ].join('\n')
    );
    expect(Object.fromEntries(values.map((v) => [v.key, v.value]))).toEqual({
      HOST: 'localhost',
      PASSWORD: 'p"w # x',
      LITERAL: '$HOME',
      PLAIN: 'a b',
      MULTI: 'one\ntwo',
      ESCAPED: 'a\nb',
    });
    expect(values.find((v) => v.key === 'MULTI')?.type).toBe('multiline');
  });

  it.each([
    ['NOT VALID', 'Line 1: expected KEY=value.'],
    ['A="open', 'Line 1: unterminated double quote.'],
    ["A='open", 'Line 1: unterminated single quote.'],
  ])('reports %s', (content, message) => {
    expect(() => parseEnv(content)).toThrow(new ImportParseError(message));
  });
});

describe('parseJsonObject', () => {
  it('flattens appsettings sections and types arrays', () => {
    const values = parseJsonObject(
      '{"ConnectionStrings":{"Main":"Server=db"},"Hosts":["a","b"],"Routes":[{"p":"/"}],"Retries":3,"Off":null}',
      true
    );
    expect(values).toEqual([
      { key: 'ConnectionStrings:Main', value: 'Server=db', type: 'string' },
      { key: 'Hosts', value: '["a","b"]', type: 'array' },
      { key: 'Routes', value: '[{"p":"/"}]', type: 'json' },
      { key: 'Retries', value: '3', type: 'string' },
      { key: 'Off', value: '', type: 'string' },
    ]);
  });

  it('keeps objects as JSON values without flattening', () => {
    expect(parseJsonObject('{"Limits":{"Max":5}}', false)).toEqual([{ key: 'Limits', value: '{"Max":5}', type: 'json' }]);
  });

  it('rejects what is not a JSON object', () => {
    expect(() => parseJsonObject('[1]', false)).toThrow('Expected a JSON object at the top level.');
    expect(() => parseJsonObject('{', true)).toThrow(/^Invalid JSON/);
  });
});

describe('planImport', () => {
  const snapshot = {
    configuration: new Map([
      ['Mode', { value: 'safe', type: 'string' as const }],
      ['Region', { value: 'eu', type: 'string' as const }],
      ['ApiToken', { value: 'x', type: 'string' as const }],
    ]),
    secrets: new Map([
      ['DbPassword', true],
      ['CachePassword', false],
      ['Feature', true],
    ]),
  };
  const values = [
    { key: 'Mode', value: 'safe', type: 'string' as const },
    { key: 'Region', value: 'us', type: 'string' as const },
    { key: 'New', value: '1', type: 'string' as const },
    { key: 'DbPassword', value: 'p', type: 'string' as const },
    { key: 'CachePassword', value: 'c', type: 'string' as const },
    { key: 'ApiToken', value: 't', type: 'string' as const },
    { key: 'Feature', value: 'on', type: 'string' as const },
    { key: 'New', value: '2', type: 'string' as const },
  ];
  const plan = (overwrite: boolean, kinds = {}, exclude: string[] = []) =>
    Object.fromEntries(
      planImport(values, snapshot, { secretKeys: DEFAULT_SECRET_KEYS, kinds, exclude, overwrite }).map((i) => [i.key, i])
    );

  it('classifies keys and compares them with what exists', () => {
    const p = plan(false);
    expect(p.Mode.action).toBe('unchanged');
    expect(p.Region.action).toBe('skip');
    expect(p.New).toMatchObject({ action: 'create', value: '2' });
    expect(p.DbPassword).toMatchObject({ kind: 'secret', action: 'skip', value: null, valueType: null });
    expect(p.CachePassword.action).toBe('create');
    expect(p.ApiToken).toMatchObject({ kind: 'secret', action: 'conflict' });
    expect(p.Feature).toMatchObject({ kind: 'configuration', action: 'conflict' });
  });

  it('overwrites when asked, honours kinds and exclusions, and lists only writes', () => {
    const p = plan(true, { ApiToken: 'configuration' }, ['Region']);
    expect(p.DbPassword.action).toBe('update');
    expect(p.ApiToken).toMatchObject({ kind: 'configuration', action: 'update' });
    expect(p.Region.action).toBe('excluded');
    expect(writes(Object.values(p)).map((i) => i.key).sort()).toEqual(['ApiToken', 'CachePassword', 'DbPassword', 'New']);
  });
});
