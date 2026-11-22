import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { routes } from '../src/router';
import { api } from '../src/lib/api';
import { resetMockDatabase } from '../src/lib/mockApi';
import { useStore } from '../src/store/useStore';

vi.mock('../src/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/api')>();
  return { ...actual, fetchApiVersion: vi.fn().mockResolvedValue('2.0.0') };
});

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

const auditTable = () => screen.findByRole('table', { name: /audit events/i });
const rows = (table: HTMLElement) => within(table).getAllByRole('row').slice(1);

describe('Audit log viewer', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('grimoire_api_url', 'mock://');
    localStorage.setItem('grimoire_api_key', 'mock_admin_key');
    resetMockDatabase();
    useStore.setState({ isAdminAuthenticated: true, lastVisitedAppSlug: null, lastVisitedEnvironmentSlug: null, recentAppSlugs: [] });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('lists events with actor, description, code, outcome and links', async () => {
    renderAt('/audit');
    const table = await auditTable();
    expect(rows(table).length).toBeGreaterThan(3);

    const read = rows(table).find((r) => /DATABASE_PASSWORDS/.test(r.textContent ?? '') && /Read secret/.test(r.textContent ?? ''))!;
    expect(read.textContent).toMatch(/app:production-gateway/);
    expect(read.textContent).toMatch(/secret\.read/);
    expect(within(read).getByRole('link', { name: 'DATABASE_PASSWORDS' }).getAttribute('href')).toBe(
      '/apps/production-gateway/production/secrets?key=DATABASE_PASSWORDS'
    );

    const rejected = rows(table).find((r) => /anonymous/.test(r.textContent ?? ''))!;
    expect(rejected.textContent).toMatch(/Forbidden/);
    expect(screen.getByRole('navigation', { name: 'Audit log pages' }).textContent).toMatch(/1–\d+ of \d+/);
  });

  it('keeps filters in the URL and applies them', async () => {
    const router = renderAt('/audit');
    await auditTable();

    fireEvent.change(screen.getByRole('combobox', { name: 'Outcome' }), { target: { value: 'notfound' } });
    await waitFor(() => expect(pathOf(router)).toBe('/audit?outcome=notfound'));
    await waitFor(async () => {
      const r = rows(await auditTable());
      expect(r).toHaveLength(1);
      expect(r[0].textContent).toMatch(/OAUTH_CLIENT_SECRET/);
    });

    fireEvent.click(screen.getByRole('checkbox', { name: /include consumer reads/i }));
    await waitFor(() => expect(pathOf(router)).toBe('/audit?outcome=notfound&includeReads=false'));
    expect(await screen.findByText(/No audit events match/)).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /clear filters/i }));
    await waitFor(() => expect(pathOf(router)).toBe('/audit'));
  });

  it('debounces free-text filters', async () => {
    const router = renderAt('/audit');
    await auditTable();
    fireEvent.change(screen.getByRole('textbox', { name: 'Secret / key' }), { target: { value: 'JWT_SIGNING_SECRET' } });
    expect(pathOf(router)).toBe('/audit');
    await waitFor(() => expect(pathOf(router)).toBe('/audit?target=JWT_SIGNING_SECRET'));
    await waitFor(async () => expect(rows(await auditTable())).toHaveLength(1));
  });

  it('opens pre-filtered from a shared link and pages', async () => {
    for (let i = 0; i < 55; i++) {
      await api.post('/applications/production-gateway/configurations', { environmentSlug: 'staging', key: `BULK_${i}`, value: 'v' });
    }
    const router = renderAt('/audit?action=configuration.create');
    const table = await auditTable();
    expect(rows(table)).toHaveLength(50);
    expect((screen.getByRole('combobox', { name: 'Action' }) as HTMLSelectElement).value).toBe('configuration.create');

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(pathOf(router)).toBe('/audit?action=configuration.create&page=2'));
    await waitFor(async () => expect(rows(await auditTable())).toHaveLength(5));
    expect(screen.getByRole('button', { name: 'Next page' }).hasAttribute('disabled')).toBe(true);
  });

  it('explains when the API has no audit log', async () => {
    const realGet = api.get.bind(api);
    vi.spyOn(api, 'get').mockImplementation(((url: string, config?: unknown) =>
      url === '/audit'
        ? Promise.reject(Object.assign(new Error('404'), { response: { status: 404 } }))
        : realGet(url, config as never)) as typeof api.get);
    renderAt('/audit');
    expect(await screen.findByText(/doesn't have an audit log yet/)).toBeDefined();
  });

  it('shows an application Activity tab pinned to that application', async () => {
    renderAt('/apps/production-gateway/production/activity');
    const table = await auditTable();
    expect(screen.queryByRole('combobox', { name: 'Application' })).toBeNull();
    expect(rows(table).length).toBeGreaterThan(0);
    expect(rows(table).every((r) => !/auth-provider-security|anonymous/.test(r.textContent ?? ''))).toBe(true);
  });

  it('is linked from the dashboard feed and the sidebar', async () => {
    const router = renderAt('/');
    const viewAll = await screen.findByRole('link', { name: 'View all' });
    expect(viewAll.getAttribute('href')).toBe('/audit?includeReads=false');
    expect(screen.getByRole('link', { name: 'Audit log' }).getAttribute('href')).toBe('/audit');
    fireEvent.click(viewAll);
    await waitFor(() => expect(pathOf(router)).toBe('/audit?includeReads=false'));
    await auditTable();
  });
});
