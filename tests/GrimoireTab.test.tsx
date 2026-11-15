import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GrimoireTab } from '../src/components/grimoire/GrimoireTab';
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

describe('GrimoireTab', () => {
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

  it('renders without crashing when secrets omit values or have null description', async () => {
    const mockGet = api.get as ReturnType<typeof vi.fn>;
    mockGet.mockImplementation((url: string) => {
      if (url === '/applications/my-app/secrets') {
        return Promise.resolve({
          data: [
            { name: 'DB_PASSWORD', description: null, createdAt: '' },
            { name: 'API_TOKEN', description: 'Main API token', values: null },
          ],
        });
      }
      if (url === '/applications/my-app/environments') {
        return Promise.resolve({
          data: [
            { name: 'Production', slug: 'production' },
            { name: 'Staging', slug: 'staging' },
          ],
        });
      }
      if (url === '/applications/my-app/secrets/DB_PASSWORD') {
        return Promise.resolve({
          data: {
            name: 'DB_PASSWORD',
            description: 'Resolved description',
            createdAt: '2026-01-15T12:00:00Z',
            values: [
              {
                environmentSlug: 'production',
                version: 3,
                isEnabled: true,
                expiresAt: null,
                notBefore: null,
              },
            ],
          },
        });
      }
      return Promise.resolve({ data: [] });
    });

    render(
      <QueryClientProvider client={queryClient}>
        <GrimoireTab appSlug="my-app" />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('DB_PASSWORD')).toBeDefined();
      expect(screen.getByText('API_TOKEN')).toBeDefined();
    });

    // Expand DB_PASSWORD and verify detail fetch loads version info safely
    fireEvent.click(screen.getByText('DB_PASSWORD'));

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/applications/my-app/secrets/DB_PASSWORD');
      expect(screen.getByText('v3')).toBeDefined();
      expect(screen.getByText('Resolved description')).toBeDefined();
    });
  });

  it('resolves status and latest version from /versions/{envSlug} when secret detail omits values', async () => {
    const mockGet = api.get as ReturnType<typeof vi.fn>;
    mockGet.mockImplementation((url: string) => {
      if (url === '/applications/my-app/secrets') {
        return Promise.resolve({
          data: [
            {
              id: '90871406-362f-403b-8acb-ba1331a40f72',
              name: 'Mailbox--Password',
              description: 'Mail password',
              createdAt: '2026-11-15T19:11:05.2077893+00:00',
              updatedAt: '2026-11-15T19:11:05.2077894+00:00',
            },
          ],
        });
      }
      if (url === '/applications/my-app/environments') {
        return Promise.resolve({
          data: [
            { name: 'Production', slug: 'production' },
            { name: 'Staging', slug: 'staging' },
          ],
        });
      }
      if (url === '/applications/my-app/secrets/Mailbox--Password') {
        return Promise.resolve({
          data: {
            id: '90871406-362f-403b-8acb-ba1331a40f72',
            name: 'Mailbox--Password',
            description: 'Mail password',
            createdAt: '2026-11-15T19:11:05.2077893+00:00',
            updatedAt: '2026-11-15T19:11:05.2077894+00:00',
          },
        });
      }
      if (url === '/applications/my-app/secrets/Mailbox--Password/versions/production') {
        return Promise.resolve({
          data: [
            {
              id: '0d9aeb93-b2d5-41d8-b779-ec2009d801bb',
              version: 2,
              isEnabled: true,
              expiresAt: null,
              notBefore: null,
              createdAt: '2026-11-15T19:11:40.9908309+00:00',
            },
            {
              id: '5bf7a610-9b6b-42ed-90ef-ba340d0b800e',
              version: 1,
              isEnabled: true,
              expiresAt: null,
              notBefore: null,
              createdAt: '2026-11-15T19:11:05.740662+00:00',
            },
          ],
        });
      }
      if (url === '/applications/my-app/secrets/Mailbox--Password/versions/staging') {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: [] });
    });

    render(
      <QueryClientProvider client={queryClient}>
        <GrimoireTab appSlug="my-app" />
      </QueryClientProvider>
    );

    // Presence badge appears once /versions/production resolves
    await waitFor(() => {
      expect(screen.getByText('Mailbox--Password')).toBeDefined();
      expect(screen.getByText('pro')).toBeDefined();
    });

    fireEvent.click(screen.getByText('Mailbox--Password'));

    await waitFor(() => {
      expect(screen.getByText('#90871406')).toBeDefined();
      expect(screen.getByText('enabled')).toBeDefined();
      expect(screen.getByText('v2')).toBeDefined();
      expect(screen.getByText('missing')).toBeDefined();
    });
  });
});
