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

const base = '/applications/production-gateway/access-tokens';
const tokensTable = () => screen.findByRole('table', { name: 'Access tokens' });
const rows = (t: HTMLElement) => within(t).getAllByRole('row').slice(1);
const tokenNamed = async (name: string) => ((await api.get(base)).data as any[]).find((t) => t.name === name);

describe('Access tokens', () => {
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

  it('opens from the application tabs and lists tokens, active first', async () => {
    const router = renderAt('/apps/production-gateway/production');
    fireEvent.mouseDown(await screen.findByRole('tab', { name: /Access Tokens/ }));
    fireEvent.click(screen.getByRole('tab', { name: /Access Tokens/ }));
    await waitFor(() => expect(pathOf(router)).toBe('/apps/production-gateway/production/tokens'));

    const t = await tokensTable();
    expect(rows(t).map((r) => within(r).getAllByRole('cell')[0].textContent)).toEqual([
      'github-actionsgrm_tok_Qm7Xc2Lp…',
      'edge-runtimegrm_tok_Hk4Tz9Wa…',
      'old-deploy-scriptgrm_tok_Pb2Nr6Ye…',
    ]);
    expect(rows(t)[0].textContent).toMatch(/staging/);
    expect(rows(t)[0].textContent).toMatch(/Secrets, Configurations/);
    expect(rows(t)[2].textContent).toMatch(/All environments/);
    expect(rows(t)[2].textContent).toMatch(/Revoked/);
    expect(within(rows(t)[2]).queryByRole('button', { name: /Revoke/ })).toBeNull();
    expect(screen.getByRole('region', { name: 'Legacy API key' }).textContent).toMatch(/every environment/);
  });

  it('creates a token and shows it once', async () => {
    renderAt('/apps/production-gateway/production/tokens');
    await tokensTable();
    fireEvent.click(screen.getByRole('button', { name: /New token/ }));
    const dialog = await screen.findByRole('dialog');

    // Nothing filled in: the form explains what's missing and sends nothing.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create token' }));
    expect(within(dialog).getByText('Give the token a name.')).toBeTruthy();
    expect(within(dialog).getByText(/Pick at least one environment/)).toBeTruthy();

    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'nightly-job' } });
    fireEvent.click(within(dialog).getByLabelText('production'));
    fireEvent.click(within(dialog).getByLabelText('Configurations'));
    fireEvent.click(within(dialog).getByLabelText('Feature flags'));
    fireEvent.click(within(dialog).getByLabelText('30 days'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create token' }));

    const reveal = await screen.findByRole('dialog', { name: 'Access token created' });
    const plain = (within(reveal).getByRole('textbox') as HTMLInputElement).value;
    expect(plain).toMatch(/^grm_tok_/);
    const created = await tokenNamed('nightly-job');
    expect(created).toMatchObject({ environments: ['production'], scopes: ['secrets', 'feature-flags'] });
    const days = (new Date(created.expiresAt).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThan(30.1);

    // Closing needs the "copied" confirmation; then the token is never shown again.
    const close = () => within(reveal).getByRole('button', { name: /Ready, Close/ }) as HTMLButtonElement;
    expect(close().disabled).toBe(true);
    fireEvent.click(within(reveal).getByRole('checkbox', { name: /I have copied the access token/ }));
    fireEvent.click(close());
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.body.textContent).not.toContain(plain);
    const t = await tokensTable();
    await waitFor(() => expect(rows(t)[0].textContent).toMatch(/nightly-job/));
  });

  it('can allow every environment and never expire', async () => {
    renderAt('/apps/production-gateway/production/tokens');
    await tokensTable();
    fireEvent.click(screen.getByRole('button', { name: /New token/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'runtime' } });
    fireEvent.click(within(dialog).getByLabelText(/All environments/));
    expect(within(dialog).queryByLabelText('production')).toBeNull();
    fireEvent.click(within(dialog).getByLabelText('Never'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create token' }));
    await screen.findByRole('dialog', { name: 'Access token created' });
    expect(await tokenNamed('runtime')).toMatchObject({ environments: null, expiresAt: null });
  });

  it('rejects a name already in use', async () => {
    renderAt('/apps/production-gateway/production/tokens');
    await tokensTable();
    fireEvent.click(screen.getByRole('button', { name: /New token/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'github-actions' } });
    fireEvent.click(within(dialog).getByLabelText(/All environments/));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create token' }));
    expect(await within(dialog).findByText(/already exists/)).toBeTruthy();
  });

  it('revokes after confirmation', async () => {
    renderAt('/apps/production-gateway/production/tokens');
    const t = await tokensTable();
    fireEvent.click(within(rows(t)[0]).getByRole('button', { name: 'Revoke github-actions' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toMatch(/stops working at once/);
    const confirm = within(dialog).getByRole('button', { name: 'Revoke' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(within(dialog).getByPlaceholderText('REVOKE'), { target: { value: 'REVOKE' } });
    fireEvent.click(confirm);
    await waitFor(async () => expect((await tokenNamed('github-actions')).status).toBe('revoked'));
    await waitFor(() => expect(within(rows(t)[1]).queryByRole('button', { name: /Revoke/ })).toBeNull());
  });

  it('shows an empty state for an application without tokens', async () => {
    renderAt('/apps/auth-provider-security/production/tokens');
    expect(await screen.findByText('No access tokens yet')).toBeTruthy();
  });
});
