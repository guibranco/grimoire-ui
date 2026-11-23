import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ConfigTab } from '../src/components/config/ConfigTab';
import { api } from '../src/lib/api';
import { routeGet, useTestQueryClient } from './apiMock';

vi.mock('../src/lib/api', async (orig) => (await import('./apiMock')).mockApiModule(orig));

const APP = '/applications/my-app';
const EFFECTIVE = `${APP}/configurations/effective?environment=production`;

describe('ConfigTab', () => {
  const client = useTestQueryClient();

  const renderTab = () =>
    render(
      <QueryClientProvider client={client.current}>
        <MemoryRouter>
          <ConfigTab appSlug="my-app" />
        </MemoryRouter>
      </QueryClientProvider>
    );

  /** The application, its production environment, and its effective configuration. */
  const mockApp = (configs: unknown[], inheritGlobals = true) =>
    routeGet(api.get, {
      [APP]: { id: '1', name: 'My App', slug: 'my-app', inheritGlobals },
      [`${APP}/environments`]: [{ name: 'Production', slug: 'production' }],
      [EFFECTIVE]: configs,
    });

  it('displays configuration keys, values, and descriptions with exact API casing', async () => {
    mockApp([
      {
        key: 'FeatureFlag.EnableBetaUI',
        value: 'TrueOrMixedCaseValue',
        description: 'Enables Beta UI for Selected Users',
        source: 'application',
        overridesGlobal: false,
      },
    ]);

    const { container } = renderTab();

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
    mockApp([
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
    ]);

    renderTab();

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
    const mockPut = api.put as ReturnType<typeof vi.fn>;
    mockPut.mockResolvedValue({ status: 200, data: { slug: 'my-app', name: 'My App', inheritGlobals: true } });
    mockApp([], false);

    renderTab();

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
    const mockPost = api.post as ReturnType<typeof vi.fn>;
    mockPost.mockResolvedValue({ status: 201, data: {} });
    mockApp([
      { key: 'AllowedIps', value: '["10.0.0.1","10.0.0.2"]', valueType: 'array', source: 'application', overridesGlobal: false },
    ]);
    renderTab();

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

describe('ConfigTab import', () => {
  const client = useTestQueryClient();

  it('reads the chosen JSON file and creates each key in the active environment', async () => {
    routeGet(api.get, {
      [APP]: { id: '1', name: 'My App', slug: 'my-app', inheritGlobals: true },
      [`${APP}/environments`]: [{ name: 'Production', slug: 'production' }],
      [EFFECTIVE]: [],
    });
    const mockPost = api.post as ReturnType<typeof vi.fn>;
    mockPost.mockResolvedValue({ status: 201, data: {} });
    const { container } = render(
      <QueryClientProvider client={client.current}>
        <MemoryRouter>
          <ConfigTab appSlug="my-app" />
        </MemoryRouter>
      </QueryClientProvider>
    );
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(EFFECTIVE));

    const file = new File([JSON.stringify({ Mode: 'safe', Limit: 5 })], 'config.json', { type: 'application/json' });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });

    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(2));
    expect(mockPost).toHaveBeenCalledWith(
      `${APP}/configurations`,
      expect.objectContaining({ environmentSlug: 'production', key: 'Mode', description: 'Imported configuration' })
    );
  });
});
