import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { routes } from '../src/router';
import { resetMockDatabase } from '../src/lib/mockApi';
import { useStore } from '../src/store/useStore';

vi.mock('../src/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/api')>();
  return { ...actual, fetchApiVersion: vi.fn().mockResolvedValue('2.0.0') };
});

const renderAt = (path = '/') => {
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

const openWithShortcut = async (init: KeyboardEventInit = { metaKey: true }) => {
  fireEvent.keyDown(window, { key: 'k', ...init });
  return screen.findByRole('combobox', { name: /search applications/i });
};

const type = (input: HTMLElement, value: string) => fireEvent.change(input, { target: { value } });

const selected = () => screen.getAllByRole('option').find((o) => o.getAttribute('aria-selected') === 'true');

describe('Command palette', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('grimoire_api_url', 'mock://');
    localStorage.setItem('grimoire_api_key', 'mock_admin_key');
    resetMockDatabase();
    useStore.setState({
      isAdminAuthenticated: true,
      lastVisitedAppSlug: null,
      lastVisitedEnvironmentSlug: null,
      recentAppSlugs: [],
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('opens with ⌘K and Ctrl+K, and closes with Escape', async () => {
    renderAt('/');
    const input = await openWithShortcut({ metaKey: true });
    expect(input).toBeDefined();

    fireEvent.keyDown(input, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('combobox')).toBeNull());

    expect(await openWithShortcut({ ctrlKey: true })).toBeDefined();
  });

  it('opens from the dashboard and sidebar Search buttons', async () => {
    renderAt('/');
    const buttons = await screen.findAllByRole('button', { name: /search/i });
    expect(buttons.length).toBeGreaterThanOrEqual(2);
    fireEvent.click(buttons[buttons.length - 1]);
    expect(await screen.findByRole('combobox')).toBeDefined();
  });

  it('lists commands and recent applications when empty, and runs them with Enter', async () => {
    useStore.setState({ recentAppSlugs: ['auth-provider-security'] });
    const router = renderAt('/');
    const input = await openWithShortcut();

    const recent = await screen.findByRole('group', { name: 'Recent applications' });
    expect(await within(recent).findByText('Auth Provider Security')).toBeDefined();
    const commands = screen.getByRole('group', { name: 'Commands' });
    expect(within(commands).getByText('Go to Global')).toBeDefined();

    type(input, 'global');
    await waitFor(() => expect(selected()?.textContent).toMatch(/Go to Global/));
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(pathOf(router)).toBe('/global'));
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('asks for two characters before searching', async () => {
    renderAt('/');
    const input = await openWithShortcut();
    type(input, 'r');
    expect(await screen.findByText(/at least 2 characters/i)).toBeDefined();
  });

  it('searches, groups results and opens the exact entry with ?key=', async () => {
    const router = renderAt('/');
    const input = await openWithShortcut();
    type(input, 'redis');

    const secrets = await screen.findByRole('group', { name: 'Secrets' });
    const option = within(secrets).getByRole('option');
    expect(option.textContent).toMatch(/REDIS_CACHE_TOKEN/);
    expect(option.textContent).toMatch(/production-gateway · production/);
    expect(option.querySelector('mark')?.textContent).toBe('REDIS');

    fireEvent.click(option);
    await waitFor(() =>
      expect(pathOf(router)).toBe('/apps/production-gateway/production/secrets?key=REDIS_CACHE_TOKEN')
    );
  });

  it('moves the selection with the arrow keys', async () => {
    renderAt('/');
    const input = await openWithShortcut();
    await screen.findByRole('group', { name: 'Commands' });

    const first = selected();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(selected()).not.toBe(first);
    expect(input.getAttribute('aria-activedescendant')).toBe(selected()?.id);
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(selected()).toBe(first);
    // Wraps around from the top to the last item.
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    const options = screen.getAllByRole('option');
    expect(selected()).toBe(options[options.length - 1]);
  });

  it('opens a focused option with Enter', async () => {
    const router = renderAt('/apps/production-gateway');
    await openWithShortcut();
    const option = within(await screen.findByRole('group', { name: 'Commands' })).getByText('Go to Global').closest('[role="option"]') as HTMLElement;
    expect(option.getAttribute('tabindex')).toBe('-1');
    option.focus();
    fireEvent.keyDown(option, { key: 'Enter' });
    await waitFor(() => expect(pathOf(router)).toBe('/global'));
  });

  it('prefers the last visited environment for that application', async () => {
    useStore.setState({ lastVisitedAppSlug: 'production-gateway', lastVisitedEnvironmentSlug: 'staging' });
    const router = renderAt('/');
    const input = await openWithShortcut();
    type(input, 'MAX_DB_CONNECTIONS');

    const config = await screen.findByRole('group', { name: 'Configuration' });
    fireEvent.click(within(config).getByRole('option'));
    await waitFor(() =>
      expect(pathOf(router)).toBe('/apps/production-gateway/staging/config?key=MAX_DB_CONNECTIONS')
    );
  });

  it('says when nothing matches, without searching values', async () => {
    renderAt('/');
    const input = await openWithShortcut();
    type(input, 'logs.internal.grimoire');
    expect(await screen.findByText(/No applications, secrets or keys match/)).toBeDefined();
  });

  it('is not available while disconnected', async () => {
    useStore.setState({ isAdminAuthenticated: false });
    renderAt('/');
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole('combobox')).toBeNull();
  });
});
