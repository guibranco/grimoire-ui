import { describe, it, expect } from 'vitest';
import { extractPlainApiKey } from '../src/lib/api';

describe('extractPlainApiKey', () => {
  it('reads plainApiKey as returned by the Grimoire API', () => {
    expect(extractPlainApiKey({ id: '1', name: 'App', slug: 'app', plainApiKey: 'grm_abc' })).toBe('grm_abc');
  });

  it('falls back to legacy apiKey / key fields', () => {
    expect(extractPlainApiKey({ apiKey: 'grm_legacy' })).toBe('grm_legacy');
    expect(extractPlainApiKey({ key: 'grm_old' })).toBe('grm_old');
  });

  it('returns null when no key is present', () => {
    expect(extractPlainApiKey({ name: 'App' })).toBeNull();
    expect(extractPlainApiKey({ plainApiKey: '' })).toBeNull();
    expect(extractPlainApiKey(null)).toBeNull();
    expect(extractPlainApiKey(undefined)).toBeNull();
  });
});
