import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';

/**
 * Replaces `api` in `src/lib/api` with mocks and keeps everything else. Use it as
 * `vi.mock('../src/lib/api', async (orig) => (await import('./apiMock')).mockApiModule(orig))`.
 */
export async function mockApiModule(importOriginal: () => Promise<unknown>) {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } };
}

/** A fresh query client (no retries) per test, with mocks cleared and the DOM cleaned up after. */
export function useTestQueryClient() {
  const ref = { current: undefined as unknown as QueryClient };
  beforeEach(() => {
    ref.current = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.clearAllMocks();
  });
  afterEach(() => cleanup());
  return ref;
}

type Mocked = { mockImplementation: (fn: (url: string) => Promise<unknown>) => unknown };

/**
 * Answers `api.get` from a table of URL → response data. Other URLs get `fallback(url)`, an empty
 * list by default. Pass the mocked `api.get` (this module can't import `api` itself).
 */
export function routeGet(
  get: unknown,
  routes: Record<string, unknown>,
  fallback: (url: string) => Promise<unknown> = () => Promise.resolve({ data: [] })
) {
  (get as Mocked).mockImplementation((url: string) =>
    url in routes ? Promise.resolve({ data: routes[url] }) : fallback(url)
  );
}

/** A 404 rejection, as axios raises it. */
export const notFound = () => Promise.reject(Object.assign(new Error('Not Found'), { response: { status: 404 } }));
