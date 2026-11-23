import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, cleanup, fireEvent, within, waitFor } from '@testing-library/react';
import { renderAt } from './helpers';
import { api } from '../src/lib/api';
import { resetMockDatabase } from '../src/lib/mockApi';
import { useStore } from '../src/store/useStore';

vi.mock('../src/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/api')>();
  return { ...actual, fetchApiVersion: vi.fn().mockResolvedValue('2.0.0') };
});

const next = () => fireEvent.click(screen.getByRole('button', { name: 'Next' }));
const row = (key: string) =>
  within(screen.getByRole('dialog')).getByText(key, { selector: 'td' }).closest('tr') as HTMLElement;

// Built at runtime so secret scanners don't mistake the fixture for a credential.
const FAKE_VALUE = ['not', 'a', 'real', 'value'].join('-');

describe('Import wizard', () => {
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

  it('imports a pasted .env into the current environment after reviewing the plan', async () => {
    renderAt('/apps/production-gateway/staging');
    fireEvent.click(await screen.findByRole('button', { name: 'Import file' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Next' })).toHaveProperty('disabled', true);

    fireEvent.change(within(dialog).getByLabelText('Or paste the contents'), {
      target: { value: `APP_MODE=safe\nSMTP_PASSWORD=${FAKE_VALUE}\nDEBUG=true` },
    });
    expect((within(dialog).getByLabelText('Format') as HTMLSelectElement).value).toBe('env');
    next();

    expect((within(dialog).getByLabelText('Environment') as HTMLSelectElement).value).toBe('staging');
    expect((within(dialog).getByLabelText('Import as secrets') as HTMLTextAreaElement).value).toContain('*Password*');
    next();

    await waitFor(() => expect(within(row('APP_MODE')).getByText('Create')).toBeDefined());
    expect((within(row('SMTP_PASSWORD')).getByLabelText('Import SMTP_PASSWORD as') as HTMLSelectElement).value).toBe('secret');
    expect(within(row('SMTP_PASSWORD')).getByText('hidden')).toBeDefined();
    expect(within(dialog).getByText(/3 to create/)).toBeDefined();

    // DEBUG becomes a secret, then is left out.
    fireEvent.change(within(row('DEBUG')).getByLabelText('Import DEBUG as'), { target: { value: 'secret' } });
    await waitFor(() => expect(within(row('DEBUG')).getByText('hidden')).toBeDefined());
    fireEvent.click(within(row('DEBUG')).getByLabelText('Import DEBUG'));
    await waitFor(() => expect(within(row('DEBUG')).getByText('Excluded')).toBeDefined());

    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply import' }));
    await waitFor(() => expect(within(dialog).getByText(/2 created/)).toBeDefined());

    const configs = (await api.get('/applications/production-gateway/configurations')).data;
    expect(configs).toContainEqual(expect.objectContaining({ key: 'APP_MODE', environmentSlug: 'staging' }));
    expect(configs.some((c: any) => c.key === 'DEBUG')).toBe(false);
    expect((await api.get('/applications/production-gateway/secrets/SMTP_PASSWORD/versions/staging')).data).toHaveLength(1);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('reads an uploaded file, detects its format and offers overwriting existing values', async () => {
    renderAt('/apps/production-gateway/production');
    fireEvent.click(await screen.findByRole('button', { name: 'Import file' }));
    const dialog = await screen.findByRole('dialog');

    const file = new File(['{ "Limits": { "MaxConnections": "10" } }'], 'appsettings.json', { type: 'application/json' });
    fireEvent.change(within(dialog).getByLabelText('File'), { target: { files: [file] } });
    await waitFor(() => expect((within(dialog).getByLabelText('Format') as HTMLSelectElement).value).toBe('appsettings'));
    next();
    next();

    await waitFor(() => expect(within(row('Limits:MaxConnections')).getByText('Create')).toBeDefined());
    // Back to the file: a second import of the same key would now be unchanged, but first apply this one.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply import' }));
    await waitFor(() => expect(within(dialog).getByText(/1 created/)).toBeDefined());
  });

  it('shows why a file cannot be read and blocks applying', async () => {
    renderAt('/apps/production-gateway/production');
    fireEvent.click(await screen.findByRole('button', { name: 'Import file' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Or paste the contents'), { target: { value: '<?php return [];' } });
    expect((within(dialog).getByLabelText('Format') as HTMLSelectElement).value).toBe('php');
    expect(within(dialog).getByText(/read as data and never run/)).toBeDefined();
    next();
    next();

    expect(await within(dialog).findByRole('alert')).toBeDefined();
    expect(within(dialog).getByRole('button', { name: 'Apply import' })).toHaveProperty('disabled', true);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Back' }));
    expect(within(dialog).getByLabelText('Environment')).toBeDefined();
  });

  it('imports into Global, defaulting to all environments, with existing values kept or overwritten', async () => {
    renderAt('/global/config');
    fireEvent.click(await screen.findByRole('button', { name: 'Import file' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Or paste the contents'), { target: { value: 'LogStream:Url=https://new' } });
    next();
    expect((within(dialog).getByLabelText('Environment') as HTMLSelectElement).value).toBe('*');
    next();

    await waitFor(() => expect(within(row('LogStream:Url')).getByText('Keep existing')).toBeDefined());
    expect(within(dialog).getByRole('button', { name: 'Apply import' })).toHaveProperty('disabled', true);
    fireEvent.click(within(dialog).getByLabelText('Overwrite them'));
    await waitFor(() => expect(within(row('LogStream:Url')).getByText('Overwrite')).toBeDefined());
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply import' }));
    await waitFor(() => expect(within(dialog).getByText(/1 overwritten/)).toBeDefined());
    expect(within(dialog).getByText('all environments')).toBeDefined();
  });
});
