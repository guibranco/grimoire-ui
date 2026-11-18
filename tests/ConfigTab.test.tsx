import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigTab } from '../src/components/config/ConfigTab';
import { api } from '../src/lib/api';
import { useStore } from '../src/store/useStore';

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
    useStore.setState({ selectedEnvironmentSlug: null });
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('displays configuration keys, values, and descriptions with exact API casing', async () => {
    const mockGet = api.get as ReturnType<typeof vi.fn>;
    mockGet.mockImplementation((url: string) => {
      if (url === '/applications/my-app') {
        return Promise.resolve({
          data: { id: '1', name: 'My App', slug: 'my-app', inheritGlobals: true },
        });
      }
      if (url === '/applications/my-app/environments') {
        return Promise.resolve({
          data: [{ name: 'Production', slug: 'production' }],
        });
      }
      if (url === '/applications/my-app/configurations/effective?environment=production') {
        return Promise.resolve({
          data: [
            {
              key: 'FeatureFlag.EnableBetaUI',
              value: 'TrueOrMixedCaseValue',
              description: 'Enables Beta UI for Selected Users',
              source: 'application',
              overridesGlobal: false,
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

  it('renders inherited Global badge, overrides global badge, Override prefill, and Show inherited toggle', async () => {
    const mockGet = api.get as ReturnType<typeof vi.fn>;
    mockGet.mockImplementation((url: string) => {
      if (url === '/applications/my-app') {
        return Promise.resolve({
          data: { id: '1', name: 'My App', slug: 'my-app', inheritGlobals: true },
        });
      }
      if (url === '/applications/my-app/environments') {
        return Promise.resolve({
          data: [{ name: 'Production', slug: 'production' }],
        });
      }
      if (url === '/applications/my-app/configurations/effective?environment=production') {
        return Promise.resolve({
          data: [
            {
              key: 'LogStream:Url',
              value: 'https://logs.internal',
              description: 'Centralized logs',
              source: 'global',
              globalEnvironmentSlug: '*',
              overridesGlobal: false,
            },
            {
              key: 'FeatureFlags:NewDashboard',
              value: 'false',
              description: 'App override',
              source: 'application',
              overridesGlobal: true,
            },
          ],
        });
      }
      return Promise.resolve({ data: [] });
    });

    const { fireEvent } = await import('@testing-library/react');

    render(
      <QueryClientProvider client={queryClient}>
        <ConfigTab appSlug="my-app" />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('LogStream:Url')).toBeDefined();
      expect(screen.getByText('FeatureFlags:NewDashboard')).toBeDefined();
      expect(screen.getByText('Global')).toBeDefined();
      expect(screen.getByText('overrides global')).toBeDefined();
    });

    // Clicking Override opens inline add row prefilled with inherited key & value
    fireEvent.click(screen.getByRole('button', { name: /Override/i }));
    const keyInput = screen.getByPlaceholderText('CONFIG_KEY') as HTMLInputElement;
    const valInput = screen.getByPlaceholderText('Value') as HTMLInputElement;
    expect(keyInput.value).toBe('LogStream:Url');
    expect(valInput.value).toBe('https://logs.internal');

    // Toggle "Show inherited" off hides global rows
    const showInheritedSwitch = screen.getByRole('switch', { name: 'Show inherited' });
    fireEvent.click(showInheritedSwitch);
    await waitFor(() => {
      expect(screen.queryByText('LogStream:Url')).toBeNull();
      expect(screen.getByText('FeatureFlags:NewDashboard')).toBeDefined();
    });
  });

  it('shows opt-out banner and enables inheritance when Turn it on is clicked', async () => {
    const mockGet = api.get as ReturnType<typeof vi.fn>;
    const mockPut = api.put as ReturnType<typeof vi.fn>;
    mockPut.mockResolvedValue({ status: 200, data: { slug: 'my-app', name: 'My App', inheritGlobals: true } });

    mockGet.mockImplementation((url: string) => {
      if (url === '/applications/my-app') {
        return Promise.resolve({
          data: { id: '1', name: 'My App', slug: 'my-app', inheritGlobals: false },
        });
      }
      if (url === '/applications/my-app/environments') {
        return Promise.resolve({
          data: [{ name: 'Production', slug: 'production' }],
        });
      }
      return Promise.resolve({ data: [] });
    });

    const { fireEvent } = await import('@testing-library/react');

    render(
      <QueryClientProvider client={queryClient}>
        <ConfigTab appSlug="my-app" />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('This application does not inherit global values')).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Turn it on' }));

    await waitFor(() => {
      expect(mockPut).toHaveBeenCalledWith('/applications/my-app', {
        name: 'My App',
        description: '',
        inheritGlobals: true,
      });
    });
  });

  it('shows array values with a type badge and sends valueType when saving an array', async () => {
    const mockGet = api.get as ReturnType<typeof vi.fn>;
    const mockPost = api.post as ReturnType<typeof vi.fn>;
    mockPost.mockResolvedValue({ status: 201, data: {} });
    mockGet.mockImplementation((url: string) => {
      if (url === '/applications/my-app') {
        return Promise.resolve({ data: { id: '1', name: 'My App', slug: 'my-app', inheritGlobals: true } });
      }
      if (url === '/applications/my-app/environments') {
        return Promise.resolve({ data: [{ name: 'Production', slug: 'production' }] });
      }
      if (url === '/applications/my-app/configurations/effective?environment=production') {
        return Promise.resolve({
          data: [
            {
              key: 'AllowedIps',
              value: '["10.0.0.1","10.0.0.2"]',
              valueType: 'array',
              description: null,
              source: 'application',
              overridesGlobal: false,
            },
          ],
        });
      }
      return Promise.resolve({ data: [] });
    });

    const { fireEvent } = await import('@testing-library/react');

    render(
      <QueryClientProvider client={queryClient}>
        <ConfigTab appSlug="my-app" />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('AllowedIps')).toBeDefined();
      expect(screen.getByText('array')).toBeDefined();
      expect(screen.getByText('10.0.0.1, 10.0.0.2')).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /Add Config/i }));
    fireEvent.change(screen.getByPlaceholderText('CONFIG_KEY'), { target: { value: 'BlockedIps' } });
    // Type the list as multiline text, then switch to array: each line becomes an item.
    fireEvent.change(screen.getByLabelText('Value type'), { target: { value: 'multiline' } });
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: '1.1.1.1\n2.2.2.2' } });
    fireEvent.change(screen.getByLabelText('Value type'), { target: { value: 'array' } });
    expect((screen.getByLabelText('Item 2') as HTMLInputElement).value).toBe('2.2.2.2');

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/applications/my-app/configurations', {
        environmentSlug: 'production',
        key: 'BlockedIps',
        value: '["1.1.1.1","2.2.2.2"]',
        description: '',
        valueType: 'array',
      });
    });
  });
});
