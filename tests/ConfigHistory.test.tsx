import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderAt, pathOf } from './helpers';
import { api } from '../src/lib/api';
import { resetMockDatabase } from '../src/lib/mockApi';
import { useStore } from '../src/store/useStore';
import { SecretVersionsModal } from '../src/components/grimoire/SecretVersionsModal';

vi.mock('../src/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/api')>();
  return { ...actual, fetchApiVersion: vi.fn().mockResolvedValue('2.0.0') };
});

const base = '/applications/production-gateway/configurations';

describe('Configuration history and compare', () => {
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

  it('shows revisions with a diff and rolls back to one', async () => {
    await api.put(`${base}/production/MAX_DB_CONNECTIONS`, { value: '150' });
    renderAt('/apps/production-gateway/production/config');

    fireEvent.click(await screen.findByRole('button', { name: 'History of MAX_DB_CONNECTIONS' }));
    const list = await screen.findByRole('list', { name: 'Revisions' });
    const items = within(list).getAllByRole('listitem');
    expect(items.map((li) => li.getAttribute('data-revision'))).toEqual(['2', '1']);
    expect(items[0].textContent).toMatch(/Updated/);
    expect(within(items[0]).getByLabelText('Value at revision 2').textContent).toMatch(/− 100[\s\S]*\+ 150/);
    expect(within(items[0]).queryByRole('button', { name: /rollback to this/i })).toBeNull();

    const post = vi.spyOn(api, 'post');
    fireEvent.click(within(items[1]).getByRole('button', { name: /rollback to this/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Restore' }));

    await waitFor(() => expect(post).toHaveBeenCalledWith(`${base}/production/MAX_DB_CONNECTIONS/rollback/1`));
    await waitFor(() =>
      expect(within(screen.getByRole('list', { name: 'Revisions' })).getAllByRole('listitem')[0].textContent).toMatch(/Rolled back from r1/)
    );
    const stored = (await api.get(base)).data.find((c: any) => c.key === 'MAX_DB_CONNECTIONS' && c.environmentSlug === 'production');
    expect(stored.value).toBe('100');
  });

  it('opens history for global configuration', async () => {
    await api.post('/global/configurations', { environmentSlug: '*', key: 'G_HIST', value: 'one' });
    renderAt('/global/config');
    fireEvent.click(await screen.findByRole('button', { name: 'History of G_HIST' }));
    const list = await screen.findByRole('list', { name: 'Revisions' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(list.textContent).toMatch(/Created/);
  });

  it('compares two environments from the Compare tab', async () => {
    const router = renderAt('/apps/production-gateway/staging/compare?to=production');
    const table = await screen.findByRole('table', { name: /configuration differences/i });
    const rows = within(table).getAllByRole('row').slice(1);
    const max = rows.find((r) => /MAX_DB_CONNECTIONS/.test(r.textContent ?? ''))!;
    expect(max.getAttribute('data-status')).toBe('changed');
    expect(max.textContent).toMatch(/20[\s\S]*100/);
    expect(rows.find((r) => /COMPRESSION_ENABLED/.test(r.textContent ?? ''))!.getAttribute('data-status')).toBe('added');

    fireEvent.click(screen.getByRole('button', { name: 'Swap environments' }));
    await waitFor(() => expect(pathOf(router)).toBe('/apps/production-gateway/production/compare?to=staging'));
    await waitFor(() =>
      expect(
        within(screen.getByRole('table', { name: /configuration differences/i }))
          .getAllByRole('row')
          .find((r) => /COMPRESSION_ENABLED/.test(r.textContent ?? ''))!
          .getAttribute('data-status')
      ).toBe('removed')
    );
  });
});

describe('Secret rollback', () => {
  beforeEach(async () => {
    localStorage.setItem('grimoire_api_url', 'mock://');
    localStorage.setItem('grimoire_api_key', 'mock_admin_key');
    resetMockDatabase();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('copies an older version into a new current one', async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <SecretVersionsModal
          scope={{ appSlug: 'auth-provider-security' }}
          secretName="JWT_SIGNING_SECRET"
          envSlug="production"
          open
          onOpenChange={() => {}}
        />
      </QueryClientProvider>
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Roll back to v1' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Roll back' }));
    await waitFor(() => expect(document.querySelector('tr[data-version="4"]')).not.toBeNull());
    const current = document.querySelector('tr[data-version="4"]')!;
    expect(current.textContent).toMatch(/Serving/);
    expect(screen.queryByRole('button', { name: 'Roll back to v4' })).toBeNull();
  });
});
