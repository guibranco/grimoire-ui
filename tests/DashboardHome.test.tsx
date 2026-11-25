import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent, within } from '@testing-library/react';
import { renderAt, pathOf } from './helpers';
import { api } from '../src/lib/api';
import { resetMockDatabase } from '../src/lib/mockApi';
import { useStore } from '../src/store/useStore';

vi.mock('../src/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/api')>();
  return { ...actual, fetchApiVersion: vi.fn().mockResolvedValue('2.0.0') };
});

const renderDashboard = () => renderAt('/');


const appsList = () => screen.findByRole('list', { name: 'Applications' });

const realGet = api.get.bind(api);
const overrideDashboard = (impl: () => Promise<unknown>) =>
  vi.spyOn(api, 'get').mockImplementation(((url: string, config?: unknown) =>
    url === '/dashboard' ? impl() : realGet(url, config as never)) as typeof api.get);

describe('Dashboard home', () => {
  beforeEach(() => {
    localStorage.clear();
    resetMockDatabase();
    useStore.setState({
      isAdminAuthenticated: true,
      lastVisitedAppSlug: null,
      lastVisitedEnvironmentSlug: null,
      dashboardAppsView: 'grid',
      dashboardAppsSort: 'name',
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders totals, applications, attention, global, feature flags and activity', async () => {
    renderDashboard();
    const list = await appsList();
    expect(within(list).getByRole('link', { name: 'Production Gateway' })).toBeDefined();
    expect(within(list).getByRole('link', { name: 'Auth Provider Security' })).toBeDefined();

    const totals = screen.getByRole('region', { name: 'Totals' });
    expect(within(totals).getByText('Applications')).toBeDefined();
    expect(within(totals).getByText('Feature flags')).toBeDefined();

    expect(screen.getByRole('list', { name: 'Errors' })).toBeDefined();
    expect(screen.getByRole('list', { name: 'Warnings' })).toBeDefined();
    expect(screen.getByRole('list', { name: 'Info' })).toBeDefined();

    const globalCard = screen.getAllByRole('link', { name: /global/i }).find((a) => /configs/.test(a.textContent ?? ''));
    expect(globalCard?.getAttribute('href')).toBe('/global');
    expect(screen.queryByText('SOON')).toBeNull();
    expect(screen.getAllByText('enabled').length).toBeGreaterThan(0);
    expect(screen.getByRole('list', { name: 'Recent activity' })).toBeDefined();
    // App description comes from /applications.
    expect(await within(list).findByText(/Primary configuration container/)).toBeDefined();
  });

  it('deep-links attention items to the offending entry', async () => {
    const router = renderDashboard();
    const errors = await screen.findByRole('list', { name: 'Errors' });
    const expired = within(errors).getByText('Secret expired').closest('a')!;
    expect(expired.getAttribute('href')).toBe('/apps/production-gateway/development/secrets?key=DATABASE_PASSWORDS');
    fireEvent.click(expired);
    await waitFor(() =>
      expect(pathOf(router)).toBe('/apps/production-gateway/development/secrets?key=DATABASE_PASSWORDS')
    );
  });

  it('links environment chips to the environment and shows attention badges', async () => {
    renderDashboard();
    const list = await appsList();
    const chip = within(list)
      .getAllByRole('link')
      .find((a) => a.getAttribute('href') === '/apps/production-gateway/staging');
    expect(chip).toBeDefined();
    expect(chip!.querySelector('[data-health="recent"]')).not.toBeNull();
    expect(within(list).getAllByText(/need attention/)).toHaveLength(2);
  });

  it('filters, sorts and switches layout, persisting the layout', async () => {
    renderDashboard();
    const list = await appsList();
    fireEvent.change(screen.getByRole('searchbox', { name: /filter applications/i }), { target: { value: 'auth' } });
    await waitFor(() => expect(within(list).queryByRole('link', { name: 'Production Gateway' })).toBeNull());
    expect(within(list).getByRole('link', { name: 'Auth Provider Security' })).toBeDefined();

    fireEvent.change(screen.getByRole('searchbox', { name: /filter applications/i }), { target: { value: '' } });
    fireEvent.change(screen.getByRole('combobox', { name: /sort/i }), { target: { value: 'lastFetched' } });
    await waitFor(() => {
      const names = within(screen.getByRole('list', { name: 'Applications' }))
        .getAllByRole('link')
        .filter((a) => !a.getAttribute('href')!.split('/')[3]);
      expect(names.map((a) => a.textContent)).toEqual(['Production Gateway', 'Auth Provider Security']);
    });

    fireEvent.click(screen.getByRole('button', { name: 'List view' }));
    expect(screen.getByRole('button', { name: 'List view' }).getAttribute('aria-pressed')).toBe('true');
    expect(useStore.getState().dashboardAppsView).toBe('list');
    expect(JSON.parse(localStorage.getItem('grimoire-storage')!).state.dashboardAppsView).toBe('list');
  });

  it('shows the continue card for the last visited application', async () => {
    useStore.setState({ lastVisitedAppSlug: 'auth-provider-security', lastVisitedEnvironmentSlug: 'staging' });
    const router = renderDashboard();
    const link = await screen.findByRole('link', { name: /continue to/i });
    expect(link.textContent).toContain('Auth Provider Security');
    fireEvent.click(link);
    await waitFor(() => expect(pathOf(router)).toBe('/apps/auth-provider-security/staging'));
  });

  it('opens Global with the create form from the quick actions', async () => {
    const router = renderDashboard();
    await appsList();
    fireEvent.click(screen.getByRole('link', { name: /new global secret/i }));
    expect(await screen.findByRole('dialog')).toBeDefined();
    await waitFor(() => expect(pathOf(router)).toBe('/global/secrets'));
  });

  it('opens global feature flags with the create form from the quick actions', async () => {
    const router = renderDashboard();
    await appsList();
    fireEvent.click(screen.getByRole('link', { name: /new global flag/i }));
    expect(await screen.findByRole('dialog')).toBeDefined();
    await waitFor(() => expect(pathOf(router)).toBe('/global/flags'));
  });

  it('opens the create application modal from the header', async () => {
    renderDashboard();
    await appsList();
    const header = screen.getByRole('heading', { name: 'Dashboard' }).closest('header')!;
    fireEvent.click(within(header).getByRole('button', { name: /new application/i }));
    expect(await screen.findByRole('dialog')).toBeDefined();
  });

  it('keeps the create call to action as the empty state', async () => {
    overrideDashboard(() =>
      Promise.resolve({ status: 200, data: { applications: [], totals: {}, global: {}, attention: [] } })
    );
    renderDashboard();
    expect(await screen.findByText('Welcome to Grimoire')).toBeDefined();
    expect(screen.getByRole('button', { name: /create new application/i })).toBeDefined();
  });

  it('degrades gracefully without audit log and shows feature flags when available', async () => {
    overrideDashboard(() =>
      Promise.resolve({
        status: 200,
        data: {
          generatedAt: new Date().toISOString(),
          totals: { applications: 1, environments: 0, secrets: 0, configurations: 0 },
          applications: [{ slug: 'solo', name: 'Solo', inheritGlobals: false, environments: [], secretCount: 0, configurationCount: 0, lastChangedAt: null, lastSeenAt: null }],
          global: { secretCount: 0, configurationCount: 0, lastChangedAt: null },
          featureFlags: { total: 5, enabled: 2 },
          recentActivity: null,
          attention: [],
        },
      })
    );
    renderDashboard();
    expect(await screen.findByText('Audit log not enabled yet.')).toBeDefined();
    expect(screen.getByText('All clear')).toBeDefined();
    expect(within(screen.getByRole('region', { name: 'Totals' })).getByText('Feature flags')).toBeDefined();
    expect(screen.queryByText('SOON')).toBeNull();
  });

  it('shows an error state with retry', async () => {
    const spy = overrideDashboard(() => Promise.reject(new Error('boom')));
    renderDashboard();
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/couldn't load the dashboard/i)).toBeDefined();

    spy.mockRestore();
    fireEvent.click(within(alert).getByRole('button', { name: /retry/i }));
    expect(await appsList()).toBeDefined();
  });
});
