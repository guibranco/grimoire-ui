import { describe, it, expect } from 'vitest';
import { apiErrorMessage } from '../src/lib/errors';

describe('apiErrorMessage', () => {
  it('prefers the first validation error', () => {
    const err = { response: { data: { title: 'One or more validation errors occurred.', errors: { Value: ['The value is not valid JSON'] } } } };
    expect(apiErrorMessage(err, 'fallback')).toBe('The value is not valid JSON');
  });

  it('reads the problem detail', () => {
    const err = { response: { data: { title: 'Not Found', status: 404, detail: 'Secret not found.' } } };
    expect(apiErrorMessage(err, 'fallback')).toBe('Secret not found.');
  });

  it('reads the demo API message and accepts a response', () => {
    expect(apiErrorMessage({ response: { data: { message: 'Mock says no' } } }, 'fallback')).toBe('Mock says no');
    expect(apiErrorMessage({ status: 409, data: { detail: 'Already exists.' } }, 'fallback')).toBe('Already exists.');
  });

  it('falls back for anything else', () => {
    expect(apiErrorMessage(new Error('x'), 'fallback')).toBe('fallback');
    expect(apiErrorMessage(undefined, 'fallback')).toBe('fallback');
    expect(apiErrorMessage({ response: { data: 'Bad Gateway' } }, 'fallback')).toBe('fallback');
    expect(apiErrorMessage({ response: { data: { errors: { a: [''] }, detail: ' ' } } }, 'fallback')).toBe('fallback');
  });
});
