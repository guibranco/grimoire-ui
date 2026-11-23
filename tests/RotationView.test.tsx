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

const table = () => screen.findByRole('table', { name: /expiring secrets/i });
const rows = (t: HTMLElement) => within(t).getAllByRole('row').slice(1);

describe('Rotation page', () => {
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

  it('lists due secrets, colour-coded, with links to them', async () => {
    renderAt('/rotation');
    const t = await table();
    const all = rows(t);
    expect(all.length).toBeGreaterThanOrEqual(3);

    const expired = all.find((r) => /DATABASE_PASSWORDS/.test(r.textContent ?? ''))!;
    expect(expired.getAttribute('data-bucket')).toBe('overdue');
    expect(expired.textContent).toMatch(/Expired/);
    expect(within(expired).getByRole('link', { name: 'DATABASE_PASSWORDS' }).getAttribute('href')).toBe(
      '/apps/production-gateway/development/secrets?key=DATABASE_PASSWORDS'
    );

    const staging = all.find((r) => /JWT_SIGNING_SECRET/.test(r.textContent ?? '') && /staging/.test(r.textContent ?? ''))!;
    expect(staging.getAttribute('data-bucket')).toBe('week');
    expect(staging.textContent).toMatch(/in 5 days/);
    expect(staging.textContent).toMatch(/90 days/);
  });

  it('switches the window through the URL', async () => {
    const router = renderAt('/rotation');
    await table();
    const spy = vi.spyOn(api, 'get');
    fireEvent.click(screen.getByRole('button', { name: '7 days' }));
    await waitFor(() => expect(pathOf(router)).toBe('/rotation?within=7'));
    expect(screen.getByRole('button', { name: '7 days' }).getAttribute('aria-pressed')).toBe('true');
    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith('/secrets/expiring', { params: { withinDays: 7 } })
    );
  });

  it('runs reminders and explains a missing webhook', async () => {
    renderAt('/rotation');
    await table();
    fireEvent.click(screen.getByRole('button', { name: /send reminders now/i }));
    expect(await screen.findByRole('status')).toHaveTextContent(/no webhook is configured/i);
  });

  it('shows the widget on the dashboard and links to the page', async () => {
    renderAt('/');
    const widget = await screen.findByRole('region', { name: /rotation/i });
    const overdue = within(widget).getByText('Overdue').closest('a')!;
    expect(Number(overdue.querySelector('dd')!.textContent)).toBeGreaterThanOrEqual(2);
    expect(within(widget).getByRole('link', { name: /view all/i }).getAttribute('href')).toBe('/rotation');
  });

  it('is reachable from the sidebar', async () => {
    const router = renderAt('/audit');
    fireEvent.click(await screen.findByRole('link', { name: 'Rotation' }));
    await waitFor(() => expect(pathOf(router)).toBe('/rotation'));
  });
});
