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

const base = '/applications/production-gateway/feature-flags';
const flagsTable = () => screen.findByRole('table', { name: 'Feature flags' });
const rows = (t: HTMLElement) => within(t).getAllByRole('row').slice(1);
const envState = async (key: string, env: string) =>
  ((await api.get(`${base}/${key}`)).data.environments as any[]).find((e) => e.environment === env);

describe('Feature flags', () => {
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

  describe('list', () => {
    it('shows flags with a switch per environment and the targeting summary', async () => {
      renderAt('/apps/production-gateway/production/flags');
      const t = await flagsTable();
      expect(rows(t).map((r) => within(r).getAllByRole('button')[0].textContent)).toEqual([
        'beta-dashboard',
        'checkout-redesign',
        'email-provider',
        'new-pdf-parser',
      ]);
      const checkout = rows(t)[1];
      expect(checkout.textContent).toMatch(/A\/B/);
      expect(checkout.textContent).toMatch(/50\/50 %/);
      expect(within(rows(t)[0]).getByRole('switch', { name: 'beta-dashboard in production' }).getAttribute('aria-checked')).toBe('true');
      expect(within(rows(t)[3]).getByRole('switch', { name: 'new-pdf-parser in production' }).getAttribute('aria-checked')).toBe('false');
      expect(screen.getByText('4 flags')).toBeTruthy();

      fireEvent.change(screen.getByLabelText('Targeting environment'), { target: { value: 'development' } });
      expect(rows(t)[2].textContent).toMatch(/users: 4/);
    });

    it('searches and filters by tag', async () => {
      renderAt('/apps/production-gateway/production/flags');
      const t = await flagsTable();
      fireEvent.change(screen.getByLabelText('Search flags'), { target: { value: 'transactional' } });
      expect(rows(t)).toHaveLength(1);
      expect(screen.getByText('1 of 4 flags')).toBeTruthy();
      fireEvent.change(screen.getByLabelText('Search flags'), { target: { value: '' } });
      fireEvent.change(screen.getByLabelText('Tag'), { target: { value: 'q4' } });
      expect(rows(t).map((r) => within(r).getAllByRole('button')[0].textContent)).toEqual(['checkout-redesign']);
    });

    it('toggles outside production straight away, optimistically', async () => {
      renderAt('/apps/production-gateway/production/flags');
      await flagsTable();
      const toggle = screen.getByRole('switch', { name: 'email-provider in staging' });
      fireEvent.click(toggle);
      expect(screen.queryByRole('dialog')).toBeNull();
      await waitFor(() =>
        expect(screen.getByRole('switch', { name: 'email-provider in staging' }).getAttribute('aria-checked')).toBe('true')
      );
      await waitFor(async () => expect((await envState('email-provider', 'staging')).enabled).toBe(true));
    });

    it('asks before toggling production', async () => {
      renderAt('/apps/production-gateway/production/flags');
      await flagsTable();
      fireEvent.click(screen.getByRole('switch', { name: 'new-pdf-parser in production' }));
      const dialog = await screen.findByRole('dialog');
      expect(dialog.textContent).toMatch(/Turn new-pdf-parser on in production/);
      expect((await envState('new-pdf-parser', 'production'))?.enabled).toBe(false);
      fireEvent.click(within(dialog).getByRole('button', { name: 'Turn on' }));
      await waitFor(async () => expect((await envState('new-pdf-parser', 'production')).enabled).toBe(true));
      await waitFor(() =>
        expect(screen.getByRole('switch', { name: 'new-pdf-parser in production' }).getAttribute('aria-checked')).toBe('true')
      );
    });

    it('rolls an optimistic toggle back when the API refuses', async () => {
      renderAt('/apps/production-gateway/production/flags');
      await flagsTable();
      vi.spyOn(api, 'post').mockResolvedValueOnce({ status: 500, data: { detail: 'boom' } } as any);
      fireEvent.click(screen.getByRole('switch', { name: 'email-provider in staging' }));
      await waitFor(() =>
        expect(screen.getByRole('switch', { name: 'email-provider in staging' }).getAttribute('aria-checked')).toBe('false')
      );
    });

    it('creates a multivariate flag and opens it', async () => {
      const router = renderAt('/apps/production-gateway/staging/flags');
      await flagsTable();
      fireEvent.click(screen.getByRole('button', { name: 'New flag' }));
      const dialog = await screen.findByRole('dialog');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));
      expect(await within(dialog).findByText('Key is required.')).toBeTruthy();

      fireEvent.change(within(dialog).getByLabelText('Key *'), { target: { value: 'pricing-page' } });
      fireEvent.click(within(dialog).getByLabelText('Multivariate (A/B/n)'));
      fireEvent.change(within(dialog).getByLabelText('Variant 2 value'), { target: { value: 'not json' } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));
      expect(await within(dialog).findByText(/Must be valid JSON/)).toBeTruthy();

      fireEvent.change(within(dialog).getByLabelText('Variant 2 value'), { target: { value: '{"price":9}' } });
      fireEvent.click(within(dialog).getByRole('button', { name: /Add variant/ }));
      fireEvent.change(within(dialog).getByLabelText('Add tag'), { target: { value: 'growth' } });
      fireEvent.keyDown(within(dialog).getByLabelText('Add tag'), { key: 'Enter' });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));

      await waitFor(() => expect(pathOf(router)).toBe('/apps/production-gateway/staging/flags?flag=pricing-page'));
      const created = (await api.get(`${base}/pricing-page`)).data;
      expect(created).toMatchObject({ type: 'multivariate', defaultVariant: 'control', tags: ['growth'] });
      expect(created.variants.map((v: any) => v.key)).toEqual(['control', 'treatment', 'variant-3']);
      expect(created.variants[1].value).toEqual({ price: 9 });
    });

    it('shows the API error on a duplicate key', async () => {
      renderAt('/apps/production-gateway/staging/flags');
      await flagsTable();
      fireEvent.click(screen.getByRole('button', { name: 'New flag' }));
      const dialog = await screen.findByRole('dialog');
      fireEvent.change(within(dialog).getByLabelText('Key *'), { target: { value: 'beta-dashboard' } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));
      await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());
      expect((await api.get(base)).data).toHaveLength(4);
    });

    it('offers to create the first flag when there are none', async () => {
      renderAt('/apps/auth-provider-security/production/flags');
      expect(await screen.findByText('No feature flags yet')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'New flag' }));
      expect(await screen.findByRole('dialog')).toBeTruthy();
    });

    it('explains when the API has no feature flags', async () => {
      const real = api.get.bind(api);
      vi.spyOn(api, 'get').mockImplementation((url: string, ...rest: any[]) =>
        url.includes('feature-flags') ? Promise.resolve({ status: 404, data: {} } as any) : (real as any)(url, ...rest)
      );
      renderAt('/apps/production-gateway/production/flags');
      expect(await screen.findByText("Couldn't load feature flags")).toBeTruthy();
    });
  });

  describe('detail', () => {
    it('opens from the list and shows the environment targeting', async () => {
      const router = renderAt('/apps/production-gateway/production/flags');
      await flagsTable();
      fireEvent.click(screen.getByRole('button', { name: 'beta-dashboard' }));
      await waitFor(() => expect(pathOf(router)).toBe('/apps/production-gateway/production/flags?flag=beta-dashboard'));
      expect(await screen.findByRole('region', { name: 'Rule 1' })).toBeTruthy();
      expect(screen.getAllByRole('region', { name: /^Rule \d$/ })).toHaveLength(3);
      expect(screen.getByLabelText('Rule 2 condition 2 attribute')).toHaveProperty('value', 'country');
      expect(screen.getByRole('switch', { name: 'Enabled in production' }).getAttribute('aria-checked')).toBe('true');
      expect(screen.queryByRole('region', { name: 'Unsaved changes' })).toBeNull();
    });

    it('edits a rule, reviews the diff and saves', async () => {
      renderAt('/apps/production-gateway/staging/flags?flag=beta-dashboard');
      await screen.findByRole('region', { name: 'Rule 1' });

      const values = screen.getByLabelText('Rule 1 condition 1 values');
      fireEvent.change(values, { target: { value: 'u-999' } });
      fireEvent.keyDown(values, { key: 'Enter' });
      expect(await screen.findByRole('region', { name: 'Unsaved changes' })).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: 'Review & save' }));
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByLabelText('Targeting changes').textContent).toMatch(/\+ .*u-999/);
      fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

      await waitFor(async () =>
        expect((await envState('beta-dashboard', 'staging')).rules[0].conditions[0].values).toEqual(['u-123', 'u-456', 'u-999'])
      );
      await waitFor(() => expect(screen.queryByRole('region', { name: 'Unsaved changes' })).toBeNull());
    });

    it('requires an explicit confirmation in production', async () => {
      renderAt('/apps/production-gateway/production/flags?flag=new-pdf-parser');
      fireEvent.click(await screen.findByRole('switch', { name: 'Enabled in production' }));
      fireEvent.click(screen.getByRole('button', { name: 'Review & save' }));
      const dialog = await screen.findByRole('dialog');
      const save = within(dialog).getByRole('button', { name: 'Save' }) as HTMLButtonElement;
      expect(save.disabled).toBe(true);
      fireEvent.click(within(dialog).getByRole('checkbox'));
      expect(save.disabled).toBe(false);
      fireEvent.click(save);
      await waitFor(async () => expect((await envState('new-pdf-parser', 'production')).enabled).toBe(true));
    });

    it('blocks saving until rollout weights sum to 100, then discards', async () => {
      renderAt('/apps/production-gateway/staging/flags?flag=checkout-redesign');
      const weight = await screen.findByLabelText('Default rule control weight');
      fireEvent.change(weight, { target: { value: '30' } });
      expect((screen.getByLabelText('Default rule treatment weight') as HTMLInputElement).value).toBe('70');

      fireEvent.click(screen.getByRole('button', { name: 'Add rule' }));
      fireEvent.click(screen.getByLabelText('Rule 1: percentage rollout'));
      fireEvent.click(screen.getByRole('button', { name: 'Review & save' }));
      expect(await screen.findByText(/Add at least one value/)).toBeTruthy();
      expect((screen.getByRole('button', { name: 'Review & save' }) as HTMLButtonElement).disabled).toBe(true);
      expect(screen.queryByRole('dialog')).toBeNull();

      fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
      await waitFor(() => expect(screen.queryByRole('region', { name: 'Unsaved changes' })).toBeNull());
      expect(screen.queryByRole('region', { name: 'Rule 1' })).toBeNull();
    });

    it('adds, reorders and removes rules and conditions', async () => {
      renderAt('/apps/production-gateway/staging/flags?flag=beta-dashboard');
      await screen.findByRole('region', { name: 'Rule 3' });
      expect(screen.getByLabelText('Rule 3 condition 1 attribute')).toHaveProperty('value', 'appVersion');
      fireEvent.click(screen.getByRole('button', { name: 'Move Rule 3 up' }));
      expect(screen.getByLabelText('Rule 2 condition 1 attribute')).toHaveProperty('value', 'appVersion');
      fireEvent.click(screen.getByRole('button', { name: 'Move Rule 1 down' }));
      expect(screen.getByLabelText('Rule 1 condition 1 attribute')).toHaveProperty('value', 'appVersion');

      fireEvent.click(within(screen.getByRole('region', { name: 'Rule 1' })).getByRole('button', { name: 'And' }));
      expect(screen.getByLabelText('Rule 1 condition 2 attribute')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Remove Rule 1 condition 2' }));
      expect(screen.queryByLabelText('Rule 1 condition 2 attribute')).toBeNull();
      fireEvent.change(screen.getByLabelText('Rule 1 condition 1 operator'), { target: { value: 'semVerLt' } });
      fireEvent.click(screen.getByRole('button', { name: 'Delete Rule 1' }));
      expect(screen.getAllByRole('region', { name: /^Rule \d$/ })).toHaveLength(2);
    });

    it('switches environments and keeps them locked while there are unsaved changes', async () => {
      const router = renderAt('/apps/production-gateway/staging/flags?flag=new-pdf-parser');
      const env = await screen.findByRole('navigation', { name: 'Environment' });
      fireEvent.click(within(env).getByRole('link', { name: 'development' }));
      await waitFor(() => expect(pathOf(router)).toBe('/apps/production-gateway/development/flags?flag=new-pdf-parser'));

      fireEvent.click(await screen.findByRole('switch', { name: 'Enabled in development' }));
      expect(within(screen.getByRole('navigation', { name: 'Environment' })).queryAllByRole('link')).toHaveLength(0);
    });

    it('tests an evaluation in a side panel', async () => {
      renderAt('/apps/production-gateway/production/flags?flag=beta-dashboard');
      fireEvent.click(await screen.findByRole('button', { name: 'Test' }));
      const panel = screen.getByRole('complementary', { name: 'Test evaluation' });
      fireEvent.change(within(panel).getByLabelText('Context (JSON)'), { target: { value: '{"userId":"u-123"}' } });
      fireEvent.click(within(panel).getByRole('button', { name: 'Evaluate' }));
      const result = await within(panel).findByLabelText('Evaluation result');
      expect(result.textContent).toMatch(/on/);
      expect(result.textContent).toMatch(/RULE_MATCH \(rule 1\)/);

      fireEvent.change(within(panel).getByLabelText('Context (JSON)'), { target: { value: '[1]' } });
      fireEvent.click(within(panel).getByRole('button', { name: 'Evaluate' }));
      expect(await within(panel).findByRole('alert')).toBeTruthy();
      fireEvent.click(within(panel).getByRole('button', { name: 'Close test panel' }));
      expect(screen.queryByRole('complementary', { name: 'Test evaluation' })).toBeNull();
    });

    it('shows the history with diffs', async () => {
      await api.post(`${base}/new-pdf-parser/environments/staging/toggle`);
      renderAt('/apps/production-gateway/staging/flags?flag=new-pdf-parser&view=history');
      const table = await screen.findByRole('table', { name: 'Flag history' });
      const first = within(table).getAllByRole('row')[1];
      expect(first.textContent).toMatch(/toggled ON → OFF/);
      expect(first.textContent).toMatch(/staging/);
    });

    it('edits and deletes the flag', async () => {
      const router = renderAt('/apps/production-gateway/staging/flags?flag=checkout-redesign');
      fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
      const dialog = await screen.findByRole('dialog');
      fireEvent.change(within(dialog).getByLabelText('Description'), { target: { value: 'Checkout v2' } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
      expect(await screen.findByText('Checkout v2')).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
      const confirm = await screen.findByRole('dialog');
      fireEvent.change(within(confirm).getByRole('textbox'), { target: { value: 'DELETE' } });
      fireEvent.click(within(confirm).getByRole('button', { name: 'Delete' }));
      await waitFor(() => expect(pathOf(router)).toBe('/apps/production-gateway/staging/flags'));
      expect((await api.get(`${base}/checkout-redesign`)).status).toBe(404);
    });

    it('says so for an unknown flag', async () => {
      renderAt('/apps/production-gateway/staging/flags?flag=nope');
      expect(await screen.findByText('Flag not found')).toBeTruthy();
    });
  });

  it('is a tab of the application view', async () => {
    const router = renderAt('/apps/production-gateway/production/config');
    fireEvent.click(await screen.findByRole('tab', { name: /Feature Flags/ }));
    await waitFor(() => expect(pathOf(router)).toBe('/apps/production-gateway/production/flags'));
  });

  describe('global', () => {
    const gbase = '/global/feature-flags';
    const globalState = async (key: string, env: string) =>
      ((await api.get(`${gbase}/${key}`)).data.environments as any[]).find((e) => e.environment === env);

    it('opens from the Global view and lists * and every environment', async () => {
      const router = renderAt('/global');
      fireEvent.click(await screen.findByRole('tab', { name: /Feature Flags/ }));
      await waitFor(() => expect(pathOf(router)).toBe('/global/flags'));
      const t = await flagsTable();
      expect(rows(t).map((r) => within(r).getAllByRole('button')[0].textContent)).toEqual(['maintenance-mode', 'new-telemetry-exporter']);
      const headers = within(t).getAllByRole('columnheader').map((h) => h.textContent);
      expect(headers.slice(2, 3)).toEqual(['*']);
      expect(within(rows(t)[1]).getByRole('switch', { name: 'new-telemetry-exporter in *' }).getAttribute('aria-checked')).toBe('true');
      // No state of its own: follows * (on), dimmed.
      expect(within(rows(t)[1]).getByRole('switch', { name: 'new-telemetry-exporter in production (follows *)' }).getAttribute('aria-checked')).toBe('true');
      expect(within(rows(t)[0]).getByRole('switch', { name: 'maintenance-mode in staging' }).getAttribute('aria-checked')).toBe('true');
      expect(rows(t)[1].textContent).toMatch(/25 %/);
    });

    it('opens the create form with ?new=1 and drops it from the URL', async () => {
      const router = renderAt('/global/flags?new=1');
      expect(await screen.findByRole('dialog')).toBeDefined();
      await waitFor(() => expect(pathOf(router)).toBe('/global/flags'));
    });

    it('asks before toggling *, explaining the reach', async () => {
      renderAt('/global/flags');
      await flagsTable();
      fireEvent.click(screen.getByRole('switch', { name: 'maintenance-mode in *' }));
      const dialog = await screen.findByRole('dialog');
      expect(dialog.textContent).toMatch(/every environment that follows \*/);
      fireEvent.click(within(dialog).getByRole('button', { name: 'Turn on' }));
      await waitFor(async () => expect((await globalState('maintenance-mode', '*')).enabled).toBe(true));
    });

    it('overrides a following environment when its switch is used', async () => {
      renderAt('/global/flags');
      await flagsTable();
      fireEvent.click(screen.getByRole('switch', { name: 'new-telemetry-exporter in development (follows *)' }));
      await waitFor(async () => expect(await globalState('new-telemetry-exporter', 'development')).toMatchObject({ enabled: false, version: 1 }));
      await waitFor(() => expect(screen.getByRole('switch', { name: 'new-telemetry-exporter in development' }).getAttribute('aria-checked')).toBe('false'));
    });

    it('shows * targeting for a following environment and keeps the scope in links', async () => {
      const router = renderAt('/global/flags?env=development&flag=new-telemetry-exporter');
      expect((await screen.findByRole('note')).textContent).toMatch(/development follows \*/);
      expect(screen.getByRole('switch', { name: 'Enabled in development' }).getAttribute('aria-checked')).toBe('true');
      expect(screen.queryByRole('region', { name: 'Unsaved changes' })).toBeNull();
      fireEvent.click(screen.getByRole('link', { name: /^\*$/ }));
      await waitFor(() => expect(pathOf(router)).toBe('/global/flags?flag=new-telemetry-exporter'));
      expect(screen.queryByRole('note')).toBeNull();
    });
  });
});
