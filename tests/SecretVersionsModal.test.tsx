import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SecretVersionsModal } from '../src/components/grimoire/SecretVersionsModal';
import { EditSecretValueModal } from '../src/components/grimoire/EditSecretValueModal';
import { api } from '../src/lib/api';
import { resetMockDatabase } from '../src/lib/mockApi';
import type { SecretVersion } from '../src/types/api';

const versionsUrl = '/applications/production-gateway/secrets/ROTATE_ME/versions/staging';
const addValue = (value: string, extra: Record<string, unknown> = {}) =>
  api.post('/applications/production-gateway/secrets/ROTATE_ME/values', [{ environmentSlug: 'staging', value, ...extra }]);
const stored = async () => (await api.get<SecretVersion[]>(versionsUrl)).data;

const renderModal = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SecretVersionsModal scope={{ appSlug: 'production-gateway' }} secretName="ROTATE_ME" envSlug="staging" open onOpenChange={() => {}} />
    </QueryClientProvider>
  );

const row = async (version: number) => {
  let found: HTMLElement | null = null;
  await waitFor(() => {
    found = document.querySelector(`tr[data-version="${version}"]`);
    expect(found).not.toBeNull();
  });
  return found as unknown as HTMLElement;
};

describe('SecretVersionsModal', () => {
  beforeEach(async () => {
    localStorage.setItem('grimoire_api_url', 'mock://');
    localStorage.setItem('grimoire_api_key', 'mock_admin_key');
    resetMockDatabase();
    await api.post('/applications/production-gateway/secrets', { name: 'ROTATE_ME' });
    await addValue('one');
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows which version is served and each status', async () => {
    await addValue('two');
    await addValue('three', { notBefore: new Date(Date.now() + 86_400_000).toISOString() });
    renderModal();

    const v2 = await row(2);
    expect(within(v2).getByText('Serving')).toBeDefined();
    expect(within(v2).getByText('Current')).toBeDefined();
    expect(within(await row(3)).getByText('Scheduled')).toBeDefined();
    expect(within(await row(1)).getByText('Valid')).toBeDefined();
    expect(screen.getByRole('columnheader', { name: 'Created' })).toBeDefined();
  });

  it('disables a version and falls back to the previous one', async () => {
    await addValue('two');
    renderModal();
    fireEvent.click(within(await row(2)).getByRole('button', { name: /disable/i }));

    await waitFor(async () => expect((await stored()).find((v) => v.version === 2)!.isEnabled).toBe(false));
    await waitFor(async () => expect(within(await row(1)).getByText('Serving')).toBeDefined());
    expect(within(await row(2)).getByText('Disabled')).toBeDefined();
  });

  it('asks before leaving no valid version, then forces', async () => {
    renderModal();
    fireEvent.click(within(await row(1)).getByRole('button', { name: /disable/i }));

    expect(await screen.findByText('Leave no valid version?')).toBeDefined();
    expect((await stored())[0].isEnabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Apply anyway' }));
    await waitFor(async () => expect((await stored())[0].isEnabled).toBe(false));
  });

  it('edits and clears the expiry date', async () => {
    await addValue('two');
    renderModal();
    fireEvent.click(within(await row(1)).getByRole('button', { name: 'Edit dates for v1' }));
    fireEvent.change(screen.getByLabelText('Expires at for v1'), { target: { value: '2099-01-31' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save dates for v1' }));
    await waitFor(async () => expect((await stored()).find((v) => v.version === 1)!.expiresAt).toBe('2099-01-31T00:00:00.000Z'));

    fireEvent.click(within(await row(1)).getByRole('button', { name: 'Edit dates for v1' }));
    fireEvent.change(screen.getByLabelText('Expires at for v1'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save dates for v1' }));
    await waitFor(async () => expect((await stored()).find((v) => v.version === 1)!.expiresAt).toBeNull());
  });

  it('warns about older open-ended versions and expires them', async () => {
    await addValue('two');
    await addValue('three');
    renderModal();

    const banner = await screen.findByRole('alert');
    expect(banner.textContent).toMatch(/2 older versions are still accepted with no expiry \(v2, v1\)/);
    fireEvent.change(within(banner).getByLabelText('Days until older versions expire'), { target: { value: '3' } });
    fireEvent.click(within(banner).getByRole('button', { name: 'Expire older' }));

    await waitFor(async () => {
      const list = await stored();
      expect(list.filter((v) => v.version < 3).every((v) => v.expiresAt)).toBe(true);
      expect(list.find((v) => v.version === 3)!.expiresAt).toBeNull();
    });
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });
});

describe('EditSecretValueModal grace period', () => {
  beforeEach(async () => {
    localStorage.setItem('grimoire_api_url', 'mock://');
    localStorage.setItem('grimoire_api_key', 'mock_admin_key');
    resetMockDatabase();
    await api.post('/applications/production-gateway/secrets', { name: 'ROTATE_ME' });
    await addValue('one');
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  const renderEdit = () =>
    render(
      <QueryClientProvider client={new QueryClient()}>
        <EditSecretValueModal scope={{ appSlug: 'production-gateway' }} secretName="ROTATE_ME" envSlug="staging" open onOpenChange={() => {}} />
      </QueryClientProvider>
    );

  it('sends previousVersionGraceDays when set', async () => {
    const post = vi.spyOn(api, 'post');
    renderEdit();
    fireEvent.change(screen.getByPlaceholderText('Enter new secret value...'), { target: { value: 'two' } });
    fireEvent.change(screen.getByLabelText(/expire previous versions after/i), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update Value' }));

    await waitFor(() => expect(post).toHaveBeenCalled());
    expect((post.mock.calls[0][1] as any[])[0]).toMatchObject({ value: 'two', previousVersionGraceDays: 5 });
    await waitFor(async () => expect((await stored()).find((v) => v.version === 1)!.expiresAt).not.toBeNull());
  });

  it('omits it when empty and rejects out-of-range values', async () => {
    const post = vi.spyOn(api, 'post');
    renderEdit();
    fireEvent.change(screen.getByPlaceholderText('Enter new secret value...'), { target: { value: 'two' } });
    fireEvent.change(screen.getByLabelText(/expire previous versions after/i), { target: { value: '9999' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update Value' }));
    expect(await screen.findByText(/Whole days between 0 and 3650/)).toBeDefined();
    expect(post).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/expire previous versions after/i), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update Value' }));
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect((post.mock.calls[0][1] as any[])[0]).not.toHaveProperty('previousVersionGraceDays');
  });
});
