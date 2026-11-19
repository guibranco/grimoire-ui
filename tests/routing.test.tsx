import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { routes } from '../src/router';
import { api } from '../src/lib/api';
import { useStore } from '../src/store/useStore';

vi.mock('../src/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/api')>();
  return {
    ...actual,
    fetchApiVersion: vi.fn().mockResolvedValue('2.0.0'),
    api: {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    },
  };
});

const notFound = () => Promise.reject({ response: { status: 404, data: { message: 'not found' } } });

const responses: Record<string, unknown> = {
  '/applications': [
    { id: '1', name: 'My App', slug: 'my-app', inheritGlobals: true },
    { id: '2', name: 'Other App', slug: 'other-app', inheritGlobals: true },
  ],
  '/applications/my-app': { id: '1', name: 'My App', slug: 'my-app', inheritGlobals: true },
  '/applications/other-app': { id: '2', name: 'Other App', slug: 'other-app', inheritGlobals: true },
  '/applications/my-app/environments': [
    { name: 'Production', slug: 'production' },
    { name: 'Staging', slug: 'staging' },
  ],
  '/applications/other-app/environments': [],
  '/applications/my-app/configurations/effective?environment=production': [
    { key: 'PROD_ONLY_KEY', value: 'p', description: '', source: 'application', overridesGlobal: false },
    { key: 'SMTP_HOST', value: 'smtp.example.com', description: '', source: 'global', overridesGlobal: false },
  ],
  '/applications/my-app/configurations/effective?environment=staging': [
    { key: 'STAGING_ONLY_KEY', value: 's', description: '', source: 'application', overridesGlobal: false },
  ],
  '/global/configurations': [
    { key: 'SMTP_HOST', value: 'smtp.example.com', description: '', environmentSlug: '*' },
    { key: 'OTHER_KEY', value: 'x', description: '', environmentSlug: '*' },
  ],
};

const renderAt = (path: string) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  return router;
};

const pathOf = (router: ReturnType<typeof createMemoryRouter>) =>
  router.state.location.pathname + router.state.location.search;

describe('URL routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useStore.setState({ isAdminAuthenticated: true, lastVisitedAppSlug: null, lastVisitedEnvironmentSlug: null });
    (api.get as ReturnType<typeof vi.fn>).mockImplementation((url: string) =>
      url in responses ? Promise.resolve({ data: responses[url] }) : url.startsWith('/applications/missing') ? notFound() : Promise.resolve({ data: [] })
    );
  });

  afterEach(() => cleanup());

  it('renders the dashboard at / with an active Dashboard sidebar entry', async () => {
    renderAt('/');
    expect(await screen.findByText('Welcome to Grimoire')).toBeDefined();
    expect(screen.getByRole('link', { name: /dashboard/i }).getAttribute('aria-current')).toBe('page');
  });

  it('shows a "Continue to" link for the last visited application', async () => {
    useStore.setState({ lastVisitedAppSlug: 'my-app', lastVisitedEnvironmentSlug: 'staging' });
    const router = renderAt('/');
    const link = await screen.findByRole('link', { name: /continue to/i });
    expect(link.textContent).toContain('My App');
    fireEvent.click(link);
    await waitFor(() => expect(pathOf(router)).toBe('/apps/my-app/staging'));
  });

  it('deep-links to an application with its default environment and remembers it', async () => {
    renderAt('/apps/my-app');
    expect(await screen.findByText('PROD_ONLY_KEY')).toBeDefined();
    const appLink = screen.getByRole('link', { name: 'My App' });
    expect(appLink.getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Other App' }).getAttribute('aria-current')).toBeNull();
    await waitFor(() => {
      expect(useStore.getState().lastVisitedAppSlug).toBe('my-app');
      expect(useStore.getState().lastVisitedEnvironmentSlug).toBe('production');
    });
  });

  it('deep-links to a specific environment', async () => {
    renderAt('/apps/my-app/staging');
    expect(await screen.findByText('STAGING_ONLY_KEY')).toBeDefined();
    expect(screen.queryByText('PROD_ONLY_KEY')).toBeNull();
  });

  it('deep-links to a specific tab', async () => {
    renderAt('/apps/my-app/staging/secrets');
    const secretsTab = await screen.findByRole('tab', { name: /secrets/i });
    await waitFor(() => expect(secretsTab.getAttribute('aria-selected')).toBe('true'));
  });

  it('puts tab changes in the URL and supports back/forward', async () => {
    const router = renderAt('/apps/my-app');
    const secretsTab = await screen.findByRole('tab', { name: /secrets/i });
    await screen.findByText('PROD_ONLY_KEY');
    fireEvent.click(secretsTab);
    await waitFor(() => expect(pathOf(router)).toBe('/apps/my-app/production/secrets'));
    await waitFor(() => expect(secretsTab.getAttribute('aria-selected')).toBe('true'));

    await act(() => router.navigate(-1));
    expect(pathOf(router)).toBe('/apps/my-app');
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: /configuration/i }).getAttribute('aria-selected')).toBe('true')
    );

    await act(() => router.navigate(1));
    expect(pathOf(router)).toBe('/apps/my-app/production/secrets');
  });

  it('moves a tab picked while environments are loading into the URL', async () => {
    let releaseEnvs!: () => void;
    const envsGate = new Promise<void>((resolve) => { releaseEnvs = resolve; });
    const get = api.get as ReturnType<typeof vi.fn>;
    const base = get.getMockImplementation() as (url: string) => Promise<unknown>;
    get.mockImplementation((url: string) =>
      url === '/applications/my-app/environments' ? envsGate.then(() => base(url)) : base(url)
    );

    const router = renderAt('/apps/my-app');
    fireEvent.click(await screen.findByRole('tab', { name: /secrets/i }));
    expect(pathOf(router)).toBe('/apps/my-app');

    await act(async () => releaseEnvs());
    await waitFor(() => expect(pathOf(router)).toBe('/apps/my-app/production/secrets'));
    // replace navigation: no extra history entry for the pending selection
    expect(router.state.historyAction).toBe('REPLACE');
  });

  it('keeps the delete target environment when the route changes under the dialog', async () => {
    const del = api.delete as ReturnType<typeof vi.fn>;
    del.mockResolvedValue({ data: {} });
    const router = renderAt('/apps/my-app/production');
    fireEvent.click(await screen.findByRole('button', { name: 'Delete PROD_ONLY_KEY' }));
    await screen.findByText(/delete the configuration key "PROD_ONLY_KEY" from production/i);

    await act(() => router.navigate('/apps/my-app/staging'));
    await screen.findByText('STAGING_ONLY_KEY');
    expect(screen.getByText(/delete the configuration key "PROD_ONLY_KEY" from production/i)).toBeDefined();

    fireEvent.change(screen.getByPlaceholderText('DELETE'), { target: { value: 'DELETE' } });
    fireEvent.click(screen.getByRole('button', { name: /remove entry/i }));
    await waitFor(() =>
      expect(del).toHaveBeenCalledWith('/applications/my-app/configurations/production/PROD_ONLY_KEY')
    );
  });

  it('switches applications from the sidebar', async () => {
    const router = renderAt('/apps/my-app');
    await screen.findByText('PROD_ONLY_KEY');
    fireEvent.click(screen.getByRole('link', { name: 'Other App' }));
    await waitFor(() => expect(pathOf(router)).toBe('/apps/other-app'));
    expect(await screen.findByRole('heading', { name: 'Other App' })).toBeDefined();
  });

  it('redirects an unknown environment to the default one', async () => {
    const router = renderAt('/apps/my-app/nope/secrets');
    await waitFor(() => expect(pathOf(router)).toBe('/apps/my-app/production/secrets'));
  });

  it('shows "Application not found" for an unknown application', async () => {
    renderAt('/apps/missing');
    expect(await screen.findByText('Application not found')).toBeDefined();
    expect(screen.getByRole('link', { name: /back to dashboard/i }).getAttribute('href')).toBe('/');
    expect(useStore.getState().lastVisitedAppSlug).toBeNull();
  });

  it('shows a not-found state for an unknown tab', async () => {
    renderAt('/apps/my-app/production/bogus');
    expect(await screen.findByText('Page not found')).toBeDefined();
  });

  it('shows a not-found state for unknown routes', async () => {
    const router = renderAt('/definitely/not/here');
    expect(await screen.findByText('Page not found')).toBeDefined();
    fireEvent.click(screen.getByRole('link', { name: /back to dashboard/i }));
    await waitFor(() => expect(pathOf(router)).toBe('/'));
  });

  it('opens Global with the requested tab and highlights ?key=', async () => {
    renderAt('/global/config?key=SMTP_HOST');
    const cell = await screen.findByText('OTHER_KEY');
    expect(cell.closest('tr')?.className).not.toContain('bg-global/10');
    const highlighted = screen.getAllByText('SMTP_HOST').map((el) => el.closest('tr'));
    expect(highlighted.some((row) => row?.className.includes('bg-global/10'))).toBe(true);
    expect(screen.getByRole('link', { name: /global/i }).getAttribute('aria-current')).toBe('page');
  });

  it('drops the highlight when switching Global tabs', async () => {
    const router = renderAt('/global/config?key=SMTP_HOST');
    fireEvent.click(await screen.findByRole('tab', { name: /secrets/i }));
    await waitFor(() => expect(pathOf(router)).toBe('/global/secrets'));
  });

  it('navigates from an inherited config to Global with ?key=', async () => {
    const router = renderAt('/apps/my-app');
    fireEvent.click(await screen.findByRole('button', { name: /view in global/i }));
    await waitFor(() => expect(pathOf(router)).toBe('/global/config?key=SMTP_HOST'));
  });

  it('keeps the deep link behind the setup screen while disconnected', async () => {
    useStore.setState({ isAdminAuthenticated: false });
    const router = renderAt('/apps/my-app/staging');
    expect(await screen.findByText('Connect to Grimoire')).toBeDefined();
    expect(pathOf(router)).toBe('/apps/my-app/staging');

    act(() => useStore.setState({ isAdminAuthenticated: true }));
    expect(await screen.findByText('STAGING_ONLY_KEY')).toBeDefined();
  });

  it('returns to / on disconnect', async () => {
    const router = renderAt('/apps/my-app');
    await screen.findByText('PROD_ONLY_KEY');
    fireEvent.click(screen.getByRole('button', { name: /disconnect/i }));
    expect(await screen.findByText('Connect to Grimoire')).toBeDefined();
    expect(pathOf(router)).toBe('/');
  });
});
