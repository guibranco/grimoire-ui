import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { GrimoireTab } from '../src/components/grimoire/GrimoireTab';
import { api } from '../src/lib/api';
import { notFound, routeGet, useTestQueryClient } from './apiMock';

vi.mock('../src/lib/api', async (orig) => (await import('./apiMock')).mockApiModule(orig));

const APP = '/applications/my-app';
const PRODUCTION = { name: 'Production', slug: 'production' };
const STAGING = { name: 'Staging', slug: 'staging' };

const appSecret = (name: string, description: string | null) => ({
  name,
  description,
  source: 'application',
  overridesGlobal: false,
});

const version = (n: number, createdAt: string, id?: string) => ({
  ...(id ? { id } : {}),
  version: n,
  isEnabled: true,
  expiresAt: null,
  notBefore: null,
  createdAt,
});

describe('GrimoireTab', () => {
  const client = useTestQueryClient();

  const renderTab = () =>
    render(
      <QueryClientProvider client={client.current}>
        <MemoryRouter>
          <GrimoireTab appSlug="my-app" />
        </MemoryRouter>
      </QueryClientProvider>
    );

  /** The application (inheriting globals) plus `routes`; unknown URLs get `fallback`. */
  const mockApp = (routes: Record<string, unknown>, fallback?: (url: string) => Promise<unknown>) =>
    routeGet(api.get, { [APP]: { id: '1', name: 'My App', slug: 'my-app', inheritGlobals: true }, ...routes }, fallback);

  it('renders without crashing when secrets have null descriptions, missing dates, or 404 version endpoints', async () => {
    mockApp(
      {
        [`${APP}/secrets/effective`]: [appSecret('DB_PASSWORD', null), appSecret('API_TOKEN', 'Main API token')],
        [`${APP}/environments`]: [PRODUCTION, STAGING],
        [`${APP}/secrets/DB_PASSWORD`]: {
          id: '11112222-3333-4444-5555-666677778888',
          name: 'DB_PASSWORD',
          description: 'Resolved description',
          createdAt: '2026-01-15T12:00:00Z',
        },
        [`${APP}/secrets/DB_PASSWORD/versions/production`]: [version(3, '2026-01-15T12:00:00Z')],
      },
      (url) => (url.includes('/versions/') ? notFound() : Promise.resolve({ data: [] }))
    );
    renderTab();

    await waitFor(() => {
      expect(screen.getByText('DB_PASSWORD')).toBeDefined();
      expect(screen.getByText('API_TOKEN')).toBeDefined();
      expect(screen.getByText('pro')).toBeDefined();
    });

    fireEvent.click(screen.getByText('DB_PASSWORD'));

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(`${APP}/secrets/DB_PASSWORD`);
      expect(screen.getByText('v3')).toBeDefined();
      expect(screen.getByText('Resolved description')).toBeDefined();
      expect(screen.getByText('enabled')).toBeDefined();
      expect(screen.getByText('missing')).toBeDefined();
    });
  });

  it('resolves status and latest version strictly from /versions/{envSlug} metadata', async () => {
    mockApp({
      [`${APP}/secrets/effective`]: [appSecret('Mailbox--Password', 'Mail password')],
      [`${APP}/environments`]: [PRODUCTION, STAGING],
      [`${APP}/secrets/Mailbox--Password`]: {
        id: '90871406-362f-403b-8acb-ba1331a40f72',
        name: 'Mailbox--Password',
        description: 'Mail password',
        createdAt: '2026-11-15T19:11:05.2077893+00:00',
        updatedAt: '2026-11-15T19:11:05.2077894+00:00',
      },
      [`${APP}/secrets/Mailbox--Password/versions/production`]: [
        version(2, '2026-11-15T19:11:40.9908309+00:00', '0d9aeb93-b2d5-41d8-b779-ec2009d801bb'),
        version(1, '2026-11-15T19:11:05.740662+00:00', '5bf7a610-9b6b-42ed-90ef-ba340d0b800e'),
      ],
      [`${APP}/secrets/Mailbox--Password/versions/staging`]: [],
    });
    renderTab();

    await waitFor(() => {
      expect(screen.getByText('Mailbox--Password')).toBeDefined();
      expect(screen.getByText('pro')).toBeDefined();
    });

    fireEvent.click(screen.getByText('Mailbox--Password'));

    await waitFor(() => {
      expect(screen.getByText('#90871406')).toBeDefined();
      expect(screen.getByText('enabled')).toBeDefined();
      expect(screen.getByText('v2')).toBeDefined();
      expect(screen.getByText('missing')).toBeDefined();
    });
  });

  it('displays inherited global secrets with Global badge, resolves global versions, and opens Override modal prefilled', async () => {
    mockApp({
      [`${APP}/secrets/effective`]: [
        { name: 'Sentry--Dsn', description: 'Shared error reporting', source: 'global', overridesGlobal: false },
      ],
      [`${APP}/environments`]: [PRODUCTION],
      [`/global/secrets/Sentry--Dsn/versions/${encodeURIComponent('*')}`]: [
        version(1, '2026-11-15T12:00:00Z', 'gv-1'),
      ],
    });
    renderTab();

    await waitFor(() => {
      expect(screen.getByText('Sentry--Dsn')).toBeDefined();
      expect(screen.getByText('Global')).toBeDefined();
      expect(screen.getByText('pro')).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /Override/i }));

    await waitFor(() => {
      expect(screen.getByText('Override Global Secret')).toBeDefined();
      const nameInput = screen.getByLabelText('Secret Key / Name') as HTMLInputElement;
      expect(nameInput.value).toBe('Sentry--Dsn');
    });
  });
});
