import { describe, it, expect } from 'vitest';
import { resolveApiBaseUrl } from '../src/lib/api';

describe('resolveApiBaseUrl', () => {
  it('keeps http(s) URLs, without the trailing slash', () => {
    expect(resolveApiBaseUrl('https://vault.example.com:8443/')).toBe('https://vault.example.com:8443');
    expect(resolveApiBaseUrl(' http://localhost:5000/grimoire/ ')).toBe('http://localhost:5000/grimoire');
  });

  it('assumes https when the scheme is missing', () => {
    expect(resolveApiBaseUrl('vault.example.com')).toBe('https://vault.example.com');
  });

  it('drops query strings and fragments', () => {
    expect(resolveApiBaseUrl('https://vault.example.com/api?x=1#y')).toBe('https://vault.example.com/api');
  });

  it('rejects other schemes, credentials, the demo marker and blanks', () => {
    expect(resolveApiBaseUrl('javascript://alert(1)')).toBeNull();
    expect(resolveApiBaseUrl('file:///etc/passwd')).toBeNull();
    expect(resolveApiBaseUrl('https://user:pass@vault.example.com')).toBeNull();
    expect(resolveApiBaseUrl('mock://')).toBeNull();
    expect(resolveApiBaseUrl('   ')).toBeNull();
    expect(resolveApiBaseUrl(null)).toBeNull();
  });
});
