import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigTab } from '../src/components/config/ConfigTab';
import { api } from '../src/lib/api';

vi.mock('../src/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/api')>();
  return {
    ...actual,
    api: {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    },
  };
});

describe('ConfigTab', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('displays configuration keys, values, and descriptions with exact API casing', async () => {
    const mockGet = api.get as ReturnType<typeof vi.fn>;
    mockGet.mockImplementation((url: string) => {
      if (url === '/applications/my-app/environments') {
        return Promise.resolve({
          data: [{ name: 'Production', slug: 'production' }],
        });
      }
      if (url === '/applications/my-app/configurations') {
        return Promise.resolve({
          data: [
            {
              key: 'FeatureFlag.EnableBetaUI',
              value: 'TrueOrMixedCaseValue',
              description: 'Enables Beta UI for Selected Users',
              environmentSlug: 'production',
              updatedAt: '2026-11-15T10:00:00Z',
            },
          ],
        });
      }
      return Promise.resolve({ data: [] });
    });

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <ConfigTab appSlug="my-app" />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('FeatureFlag.EnableBetaUI')).toBeDefined();
      expect(screen.getByText('TrueOrMixedCaseValue')).toBeDefined();
      expect(screen.getByText('Enables Beta UI for Selected Users')).toBeDefined();
    });

    const hasCaseTransformAncestor = (el: HTMLElement | null) => {
      let current: HTMLElement | null = el;
      while (current && current !== container) {
        if (current.classList.contains('uppercase') || current.classList.contains('lowercase')) {
          return true;
        }
        current = current.parentElement;
      }
      return false;
    };

    expect(hasCaseTransformAncestor(screen.getByText('FeatureFlag.EnableBetaUI'))).toBe(false);
    expect(hasCaseTransformAncestor(screen.getByText('TrueOrMixedCaseValue'))).toBe(false);
    expect(hasCaseTransformAncestor(screen.getByText('Enables Beta UI for Selected Users'))).toBe(false);

    const searchInput = screen.getByPlaceholderText('Filter configs...');
    expect(searchInput.classList.contains('lowercase')).toBe(false);
    expect(hasCaseTransformAncestor(searchInput)).toBe(false);
  });
});
