import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GlobalConfigTab } from '../src/components/global/GlobalConfigTab';
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

describe('GlobalConfigTab', () => {
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

  const setupDefaultMocks = () => {
    const mockGet = api.get as ReturnType<typeof vi.fn>;
    mockGet.mockImplementation((url: string) => {
      if (url === '/global/environments') {
        return Promise.resolve({
          data: [
            { slug: 'production', name: 'Production', applicationCount: 2 },
            { slug: 'staging', name: 'Staging', applicationCount: 1 },
          ],
        });
      }
      if (url.startsWith('/global/configurations')) {
        return Promise.resolve({
          data: [
            {
              environmentSlug: '*',
              key: 'LogStream:Url',
              value: 'https://logs.internal',
              description: 'Centralized log ingestor',
              updatedAt: '2026-11-15T10:00:00Z',
            },
            {
              environmentSlug: 'production',
              key: 'FeatureFlags:NewDashboard',
              value: 'true',
              description: 'Production rollout toggle',
              updatedAt: '2026-11-15T10:00:00Z',
            },
          ],
        });
      }
      return Promise.resolve({ data: [] });
    });
  };

  it('renders All environments pill for wildcard entries and never literal asterisk', async () => {
    setupDefaultMocks();

    render(
      <QueryClientProvider client={queryClient}>
        <GlobalConfigTab />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('LogStream:Url')).toBeDefined();
      expect(screen.getByText('FeatureFlags:NewDashboard')).toBeDefined();
    });

    // Both filter button and table cell badge should display "All environments"
    const allEnvLabels = screen.getAllByText('All environments');
    expect(allEnvLabels.length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText('*')).toBeNull();
  });

  it('creates, edits, and deletes global configurations using encoded wildcard slugs', async () => {
    setupDefaultMocks();
    const mockPost = api.post as ReturnType<typeof vi.fn>;
    const mockPut = api.put as ReturnType<typeof vi.fn>;
    const mockDelete = api.delete as ReturnType<typeof vi.fn>;

    mockPost.mockResolvedValue({ status: 201, data: { environmentSlug: '*', key: 'TimeoutSeconds', value: '30' } });
    mockPut.mockResolvedValue({ status: 200, data: { environmentSlug: '*', key: 'LogStream:Url', value: 'https://logs.v2.internal' } });
    mockDelete.mockResolvedValue({ status: 204, data: {} });

    render(
      <QueryClientProvider client={queryClient}>
        <GlobalConfigTab />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('LogStream:Url')).toBeDefined();
    });

    // Create new global entry defaulting to "*"
    fireEvent.click(screen.getByRole('button', { name: '+ Add Global' }));
    const envSelect = screen.getByLabelText('Global Environment') as HTMLSelectElement;
    expect(envSelect.value).toBe('*');

    fireEvent.change(screen.getByPlaceholderText('CONFIG_KEY'), { target: { value: 'TimeoutSeconds' } });
    fireEvent.change(screen.getByPlaceholderText('Value'), { target: { value: '30' } });
    fireEvent.change(screen.getByPlaceholderText('Description'), { target: { value: 'HTTP timeout' } });
    fireEvent.click(screen.getByLabelText('Save'));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/global/configurations', {
        environmentSlug: '*',
        key: 'TimeoutSeconds',
        value: '30',
        description: 'HTTP timeout',
        valueType: 'string',
      });
    });

    // Inline edit existing wildcard entry
    fireEvent.click(screen.getByLabelText('Edit LogStream:Url'));
    fireEvent.change(screen.getByPlaceholderText('Value'), { target: { value: 'https://logs.v2.internal' } });
    fireEvent.click(screen.getByLabelText('Save'));

    await waitFor(() => {
      expect(mockPut).toHaveBeenCalledWith(
        `/global/configurations/${encodeURIComponent('*')}/${encodeURIComponent('LogStream:Url')}`,
        {
          value: 'https://logs.v2.internal',
          description: 'Centralized log ingestor',
          valueType: 'string',
        }
      );
    });

    // Delete via ConfirmationModal requiring DELETE
    fireEvent.click(screen.getByLabelText('Delete LogStream:Url'));
    const confirmInput = screen.getByPlaceholderText('DELETE');
    fireEvent.change(confirmInput, { target: { value: 'DELETE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Delete Global' }));

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith(
        `/global/configurations/${encodeURIComponent('*')}/${encodeURIComponent('LogStream:Url')}`
      );
    });
  });
});
