import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EditSecretModal } from '../src/components/grimoire/EditSecretModal';
import { AddSecretModal } from '../src/components/grimoire/AddSecretModal';
import { api } from '../src/lib/api';
import { resetMockDatabase } from '../src/lib/mockApi';

const wrap = (ui: React.ReactNode) =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);

const secretUrl = '/applications/auth-provider-security/secrets/JWT_SIGNING_SECRET';

describe('EditSecretModal', () => {
  beforeEach(() => {
    localStorage.setItem('grimoire_api_url', 'mock://');
    localStorage.setItem('grimoire_api_key', 'mock_admin_key');
    resetMockDatabase();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  const renderEdit = (onOpenChange = vi.fn()) => {
    wrap(
      <EditSecretModal
        scope={{ appSlug: 'auth-provider-security' }}
        secretName="JWT_SIGNING_SECRET"
        open
        onOpenChange={onOpenChange}
      />
    );
    return onOpenChange;
  };

  it('loads the current interval and saves a new one', async () => {
    const onOpenChange = renderEdit();
    const field = await screen.findByLabelText(/rotate every/i);
    await waitFor(() => expect((field as HTMLInputElement).value).toBe('90'));

    const patch = vi.spyOn(api, 'patch');
    fireEvent.change(field, { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(patch).toHaveBeenCalledWith(secretUrl, { rotationIntervalDays: 30 });
    expect((await api.get(secretUrl)).data.rotationIntervalDays).toBe(30);
  });

  it('clears the schedule when emptied', async () => {
    const onOpenChange = renderEdit();
    const field = await screen.findByLabelText(/rotate every/i);
    await waitFor(() => expect((field as HTMLInputElement).value).toBe('90'));
    fireEvent.change(field, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect((await api.get(secretUrl)).data.rotationIntervalDays).toBeNull();
  });

  it('rejects an out-of-range interval without calling the API', async () => {
    renderEdit();
    const field = await screen.findByLabelText(/rotate every/i);
    await waitFor(() => expect((field as HTMLInputElement).value).toBe('90'));
    const patch = vi.spyOn(api, 'patch');
    fireEvent.change(field, { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/whole days between 1 and 3650/i)).toBeTruthy();
    expect(patch).not.toHaveBeenCalled();
  });
});

describe('AddSecretModal rotation interval', () => {
  beforeEach(() => {
    localStorage.setItem('grimoire_api_url', 'mock://');
    localStorage.setItem('grimoire_api_key', 'mock_admin_key');
    resetMockDatabase();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('sends the interval when creating a secret', async () => {
    const post = vi.spyOn(api, 'post');
    wrap(<AddSecretModal appSlug="production-gateway" open onOpenChange={() => {}} />);
    fireEvent.change(await screen.findByLabelText(/secret key/i), { target: { value: 'ROTATING' } });
    fireEvent.change(screen.getByLabelText(/^description$/i), { target: { value: 'rotates' } });
    fireEvent.change(screen.getByLabelText(/rotate every/i), { target: { value: '45' } });
    fireEvent.click(screen.getByRole('button', { name: /create secret/i }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/applications/production-gateway/secrets', {
        name: 'ROTATING',
        description: 'rotates',
        rotationIntervalDays: 45,
      })
    );
  });

  it('flags an invalid interval', async () => {
    const post = vi.spyOn(api, 'post');
    wrap(<AddSecretModal appSlug="production-gateway" open onOpenChange={() => {}} />);
    fireEvent.change(await screen.findByLabelText(/secret key/i), { target: { value: 'ROTATING' } });
    fireEvent.change(screen.getByLabelText(/^description$/i), { target: { value: 'rotates' } });
    fireEvent.change(screen.getByLabelText(/rotate every/i), { target: { value: '5000' } });
    fireEvent.click(screen.getByRole('button', { name: /create secret/i }));
    expect(await screen.findByText(/whole days between 1 and 3650/i)).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
  });
});
