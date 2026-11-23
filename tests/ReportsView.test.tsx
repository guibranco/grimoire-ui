import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, cleanup, fireEvent, within, waitFor } from '@testing-library/react';
import { renderAt, pathOf } from './helpers';
import { api } from '../src/lib/api';
import { resetMockDatabase } from '../src/lib/mockApi';
import { useStore } from '../src/store/useStore';

vi.mock('../src/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/api')>();
  return { ...actual, fetchApiVersion: vi.fn().mockResolvedValue('2.0.0') };
});

const table = () => screen.findByRole('table', { name: /unused secrets/i });
const rows = (t: HTMLElement) => within(t).getAllByRole('row').slice(1);
const node = (id: string) => document.querySelector<HTMLButtonElement>(`[data-node="${id}"]`);

describe('Reports page', () => {
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

  describe('Unused secrets', () => {
    it('lists never-read secrets first with links into the application', async () => {
      renderAt('/reports');
      const t = await table();
      const [first, second] = rows(t);
      expect(first.textContent).toMatch(/REDIS_CACHE_TOKEN/);
      expect(first.textContent).toMatch(/never/);
      await waitFor(() =>
        expect(within(first).getByRole('link', { name: 'REDIS_CACHE_TOKEN' }).getAttribute('href')).toBe(
          '/apps/production-gateway/production/secrets?key=REDIS_CACHE_TOKEN'
        )
      );
      expect(second.textContent).toMatch(/JWT_SIGNING_SECRET/);
      expect(second.textContent).toMatch(/120 days ago/);
      expect(within(second).getByRole('link', { name: 'JWT_SIGNING_SECRET' }).getAttribute('href')).toBe(
        '/apps/auth-provider-security/production/secrets?key=JWT_SIGNING_SECRET'
      );
      expect(screen.getByText(/2 unused · 1 never read/)).toBeTruthy();
    });

    it('switches the window through the URL', async () => {
      const router = renderAt('/reports');
      await table();
      const spy = vi.spyOn(api, 'get');
      fireEvent.click(screen.getByRole('button', { name: '365 days' }));
      await waitFor(() => expect(pathOf(router)).toBe('/reports?days=365'));
      await waitFor(() => expect(spy).toHaveBeenCalledWith('/reports/unused-secrets', { params: { days: 365 } }));
      await waitFor(() => expect(rows(screen.getByRole('table', { name: /unused secrets/i }))).toHaveLength(1));
    });

    it('filters by scope', async () => {
      await api.post('/global/secrets', { name: 'IDLE_GLOBAL', description: 'x' });
      renderAt('/reports');
      const t = await table();
      expect(rows(t)).toHaveLength(3);
      fireEvent.click(screen.getByRole('button', { name: 'Global' }));
      expect(rows(screen.getByRole('table', { name: /unused secrets/i })).map((r) => r.textContent)).toEqual([
        expect.stringMatching(/IDLE_GLOBAL/),
      ]);
      fireEvent.click(screen.getByRole('button', { name: 'Applications' }));
      expect(rows(screen.getByRole('table', { name: /unused secrets/i }))).toHaveLength(2);
    });

    it('deletes a secret after confirmation and refreshes the report', async () => {
      renderAt('/reports');
      await table();
      fireEvent.click(screen.getByRole('button', { name: 'Delete REDIS_CACHE_TOKEN' }));
      const dialog = await screen.findByRole('dialog');
      fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'DELETE' } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
      await waitFor(() => expect(screen.queryByRole('button', { name: 'Delete REDIS_CACHE_TOKEN' })).toBeNull());
      const secrets = (await api.get('/applications/production-gateway/secrets')).data as any[];
      expect(secrets.some((s) => s.name === 'REDIS_CACHE_TOKEN')).toBe(false);
    });

    it('says so when everything is in use', async () => {
      await api.delete('/applications/production-gateway/secrets/REDIS_CACHE_TOKEN');
      renderAt('/reports?days=365');
      expect(await screen.findByText('Everything is in use')).toBeTruthy();
    });

    it('explains when the API has no reports', async () => {
      vi.spyOn(api, 'get').mockResolvedValue({ status: 404, data: { status: 404 } } as any);
      renderAt('/reports');
      expect(await screen.findByText(/Couldn't load the unused secrets report/)).toBeTruthy();
    });
  });

  describe('Dependencies', () => {
    it('draws applications and secrets, hiding configuration keys until asked', async () => {
      renderAt('/reports/dependencies');
      await waitFor(() => expect(node('app:production-gateway')).not.toBeNull());
      expect(node('secret:production-gateway/DATABASE_PASSWORDS')).not.toBeNull();
      expect(node('global-secret:Sentry--Dsn')).not.toBeNull();
      expect(node('config:production-gateway/MAX_DB_CONNECTIONS')).toBeNull();
      expect(document.querySelectorAll('path[data-kind="reads"]').length).toBeGreaterThan(0);

      fireEvent.click(screen.getByRole('button', { name: 'Config keys' }));
      expect(node('config:production-gateway/MAX_DB_CONNECTIONS')).not.toBeNull();

      fireEvent.click(screen.getByRole('button', { name: /reads/ }));
      expect(document.querySelectorAll('path[data-kind="reads"]')).toHaveLength(0);
    });

    it('focuses a node through the URL and lists its connections', async () => {
      const router = renderAt('/reports/dependencies');
      await waitFor(() => expect(node('global-secret:Sentry--Dsn')).not.toBeNull());
      fireEvent.click(node('global-secret:Sentry--Dsn')!);
      await waitFor(() => expect(pathOf(router)).toBe('/reports/dependencies?focus=global-secret%3ASentry--Dsn'));

      const details = screen.getByRole('complementary', { name: 'Selected node' });
      expect(within(details).getByText('Global secret')).toBeTruthy();
      expect(within(details).getByRole('link', { name: /Open/ }).getAttribute('href')).toBe('/global/secrets?key=Sentry--Dsn');
      expect(details.textContent).toMatch(/4210 reads/);
      // Unrelated secrets drop out of the canvas.
      expect(node('secret:production-gateway/REDIS_CACHE_TOKEN')).toBeNull();

      fireEvent.click(within(details).getByRole('button', { name: /Production Gateway/ }));
      await waitFor(() => expect(pathOf(router)).toBe('/reports/dependencies?focus=app%3Aproduction-gateway'));
      expect(node('secret:production-gateway/REDIS_CACHE_TOKEN')).not.toBeNull();

      fireEvent.click(screen.getByRole('button', { name: 'Clear focus' }));
      await waitFor(() => expect(pathOf(router)).toBe('/reports/dependencies'));
    });

    it('clicking the focused node again shows everything', async () => {
      const router = renderAt('/reports/dependencies?focus=app%3Aproduction-gateway');
      await waitFor(() => expect(node('app:production-gateway')?.getAttribute('aria-pressed')).toBe('true'));
      fireEvent.click(node('app:production-gateway')!);
      await waitFor(() => expect(pathOf(router)).toBe('/reports/dependencies'));
    });

    it('finds a node by name', async () => {
      const router = renderAt('/reports/dependencies');
      await waitFor(() => expect(node('app:production-gateway')).not.toBeNull());
      fireEvent.change(screen.getByLabelText('Find a node'), { target: { value: 'jwt_signing' } });
      fireEvent.click(screen.getByRole('button', { name: 'Focus' }));
      await waitFor(() =>
        expect(pathOf(router)).toBe('/reports/dependencies?focus=secret%3Aauth-provider-security%2FJWT_SIGNING_SECRET')
      );
    });

    it('explains when the API has no reports', async () => {
      vi.spyOn(api, 'get').mockResolvedValue({ status: 404, data: { status: 404 } } as any);
      renderAt('/reports/dependencies');
      expect(await screen.findByText(/Couldn't load the dependency graph/)).toBeTruthy();
    });
  });

  it('is reachable from the sidebar', async () => {
    const router = renderAt('/');
    fireEvent.click(await screen.findByRole('link', { name: 'Reports' }));
    await waitFor(() => expect(pathOf(router)).toBe('/reports'));
    fireEvent.click(screen.getByRole('link', { name: 'Dependencies' }));
    await waitFor(() => expect(pathOf(router)).toBe('/reports/dependencies'));
  });
});
