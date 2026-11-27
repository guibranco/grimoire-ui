import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { GlobalConfigTab } from '../src/components/global/GlobalConfigTab';
import { api } from '../src/lib/api';
import { useTestQueryClient } from './apiMock';

vi.mock('../src/lib/api', async (orig) => (await import('./apiMock')).mockApiModule(orig));

describe('GlobalConfigTab', () => {
  const client = useTestQueryClient();

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
      <QueryClientProvider client={client.current}>
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
      <QueryClientProvider client={client.current}>
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

  it('imports a JSON file of environment → key → value', async () => {
    setupDefaultMocks();
    const mockPost = api.post as ReturnType<typeof vi.fn>;
    mockPost.mockResolvedValue({ status: 201, data: {} });
    const { container } = render(
      <QueryClientProvider client={client.current}>
        <GlobalConfigTab />
      </QueryClientProvider>
    );
    await waitFor(() => expect(screen.getByText('LogStream:Url')).toBeDefined());

    const file = new File([JSON.stringify({ '*': { Region: 'eu' }, staging: { Debug: true } })], 'globals.json');
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });

    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(2));
    expect(mockPost).toHaveBeenCalledWith(
      '/global/configurations',
      expect.objectContaining({ environmentSlug: 'staging', key: 'Debug' })
    );
  });

  it('lists Global:Sentinel in its own system section after the user entries', async () => {
    const mockGet = api.get as ReturnType<typeof vi.fn>;
    mockGet.mockImplementation((url: string) =>
      Promise.resolve({
        data: url.startsWith('/global/configurations')
          ? [
              { environmentSlug: '*', key: 'Global:Sentinel', value: '1795540000000' },
              { environmentSlug: '*', key: 'Region', value: 'eu' },
            ]
          : [],
      })
    );
    render(
      <QueryClientProvider client={client.current}>
        <GlobalConfigTab />
      </QueryClientProvider>
    );
    await waitFor(() => expect(screen.getByText('Global:Sentinel')).toBeDefined());

    const rows = screen.getAllByRole('row');
    const divider = screen.getByTestId('system-keys-divider') as HTMLTableRowElement;
    const dividerAt = rows.indexOf(divider);
    expect(rows.findIndex((r) => r.textContent?.includes('Region'))).toBeLessThan(dividerAt);
    expect(rows.findIndex((r) => r.textContent?.includes('Global:Sentinel') && r !== divider)).toBeGreaterThan(dividerAt);
    expect(screen.queryByLabelText('Edit Global:Sentinel')).toBeNull();
    expect(screen.getByLabelText('Edit Region')).toBeDefined();
  });

  it('skips sentinel keys when importing', async () => {
    setupDefaultMocks();
    const mockPost = api.post as ReturnType<typeof vi.fn>;
    mockPost.mockResolvedValue({ status: 201, data: {} });
    const { container } = render(
      <QueryClientProvider client={client.current}>
        <GlobalConfigTab />
      </QueryClientProvider>
    );
    await waitFor(() => expect(screen.getByText('LogStream:Url')).toBeDefined());

    const file = new File([JSON.stringify({ '*': { Region: 'eu', 'Global:Sentinel': '123' } })], 'globals.json');
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });

    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost).toHaveBeenCalledWith('/global/configurations', expect.objectContaining({ key: 'Region' }));
  });

  it('rejects a file that is not an object of environments', async () => {
    setupDefaultMocks();
    const { container } = render(
      <QueryClientProvider client={client.current}>
        <GlobalConfigTab />
      </QueryClientProvider>
    );
    await waitFor(() => expect(screen.getByText('LogStream:Url')).toBeDefined());

    const file = new File(['[1, 2]'], 'globals.json');
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });

    await waitFor(() => expect(api.post).not.toHaveBeenCalled());
  });
});
