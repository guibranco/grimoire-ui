import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, cleanup, fireEvent, within, waitFor } from '@testing-library/react';
import { renderAt } from './helpers';
import { api } from '../src/lib/api';
import { resetMockDatabase } from '../src/lib/mockApi';
import { useStore } from '../src/store/useStore';
import { asPublishingStatus, describePublishing, isSentinelKey, publishUrl, publishingUrl, timeAgo } from '../src/lib/publishing';
import type { PublishingStatus } from '../src/types/api';

vi.mock('../src/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/api')>();
  return { ...actual, fetchApiVersion: vi.fn().mockResolvedValue('2.0.0') };
});

const STAGED = '/applications/production-gateway/environments/production/publishing';
const LIVE = '/applications/production-gateway/environments/staging/publishing';
const bar = () => screen.findByTestId('publish-bar');

describe('publishing helpers', () => {
  const status = (overrides: Partial<PublishingStatus> = {}): PublishingStatus => ({
    autoPublish: true,
    sentinelKey: 'Sentinel',
    sentinelValue: '1',
    lastPublishedAt: null,
    pendingChangesSince: null,
    hasPendingChanges: false,
    ...overrides,
  });
  const now = new Date('2026-11-24T12:00:00Z');

  it('recognises only the two sentinel keys', () => {
    expect(isSentinelKey('Sentinel')).toBe(true);
    expect(isSentinelKey('Global:Sentinel')).toBe(true);
    expect(isSentinelKey('sentinel')).toBe(false);
    expect(isSentinelKey('App:Sentinel')).toBe(false);
  });

  it('builds application and global URLs', () => {
    expect(publishingUrl({ appSlug: 'my app', envSlug: 'prod' })).toBe('/applications/my%20app/environments/prod/publishing');
    expect(publishUrl({ appSlug: 'a', envSlug: 'b' })).toBe('/applications/a/environments/b/publish');
    expect(publishingUrl({ global: true })).toBe('/global/publishing');
    expect(publishUrl({ global: true })).toBe('/global/publish');
  });

  it('ignores answers that are not a publishing status (older APIs)', () => {
    expect(asPublishingStatus([])).toBeNull();
    expect(asPublishingStatus(undefined)).toBeNull();
    expect(asPublishingStatus({ message: 'not found' })).toBeNull();
    expect(asPublishingStatus({ autoPublish: false, sentinelKey: 'Sentinel', pendingChangesSince: '2026-01-01T00:00:00Z' }))
      .toMatchObject({ hasPendingChanges: true, sentinelValue: null });
  });

  it('describes the status', () => {
    expect(timeAgo('2026-11-24T11:59:30Z', now)).toBe('just now');
    expect(timeAgo('2026-11-24T11:55:00Z', now)).toBe('5 min ago');
    expect(timeAgo('2026-11-24T09:00:00Z', now)).toBe('3 h ago');
    expect(timeAgo('2026-11-21T12:00:00Z', now)).toBe('3 d ago');
    expect(describePublishing(status(), now)).toBe('Every change is published straight away.');
    expect(describePublishing(status({ autoPublish: false, lastPublishedAt: '2026-11-24T11:55:00Z' }), now))
      .toBe('Up to date: running clients have every change. Last published 5 min ago.');
    expect(
      describePublishing(status({ autoPublish: false, hasPendingChanges: true, pendingChangesSince: '2026-11-24T09:00:00Z' }), now)
    ).toBe('Unpublished changes since 3 h ago. Running clients reload when you publish.');
  });
});

describe('Publish bar', () => {
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

  it('shows staged changes and publishes them after confirmation', async () => {
    renderAt('/apps/production-gateway/production/config');
    const publishBar = await bar();
    await waitFor(() => expect(publishBar.textContent).toMatch(/Unpublished changes since/));
    expect((within(publishBar).getByRole('switch', { name: 'Auto-publish' }) as HTMLElement).getAttribute('aria-checked')).toBe('false');

    fireEvent.click(within(publishBar).getByRole('button', { name: /Publish changes/ }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toMatch(/Bumps Sentinel for production-gateway \/ production/);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Publish' }));

    await waitFor(() => expect(publishBar.textContent).toMatch(/Up to date: running clients have every change/));
    expect(within(publishBar).queryByRole('button', { name: /Publish changes/ })).toBeNull();
    expect((await api.get(STAGED)).data).toMatchObject({ hasPendingChanges: false });
  });

  it('turning auto-publish on publishes pending changes', async () => {
    renderAt('/apps/production-gateway/production/config');
    const publishBar = await bar();
    await waitFor(() => expect(publishBar.textContent).toMatch(/Unpublished changes/));

    fireEvent.click(within(publishBar).getByRole('switch', { name: 'Auto-publish' }));

    await waitFor(() => expect(publishBar.textContent).toMatch(/Every change is published straight away/));
    expect((await api.get(STAGED)).data).toMatchObject({ autoPublish: true, hasPendingChanges: false });
  });

  it('a change with auto-publish off shows up as pending', async () => {
    await api.put(LIVE, { autoPublish: false });
    await api.post('/applications/production-gateway/configurations', {
      environmentSlug: 'staging',
      key: 'NewKey',
      value: 'x',
    });

    expect((await api.get(LIVE)).data).toMatchObject({ autoPublish: false, hasPendingChanges: true });
  });

  it('a change with auto-publish on bumps the sentinel', async () => {
    const before = (await api.get(LIVE)).data.sentinelValue;
    await api.post('/applications/production-gateway/configurations', {
      environmentSlug: 'staging',
      key: 'NewKey',
      value: 'x',
    });

    const after = (await api.get(LIVE)).data;
    expect(after.sentinelValue).not.toBe(before);
    expect(after.hasPendingChanges).toBe(false);
  });

  it('global changes go through the global sentinel, with a warning before publishing', async () => {
    await api.put('/global/publishing', { autoPublish: false });
    await api.post('/global/configurations', { environmentSlug: '*', key: 'Region', value: 'eu' });

    renderAt('/global/config');
    const publishBar = await bar();
    await waitFor(() => expect(publishBar.textContent).toMatch(/Unpublished changes/));
    fireEvent.click(within(publishBar).getByRole('button', { name: /Publish changes/ }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toMatch(/Every application that inherits global values reloads/);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Publish' }));

    await waitFor(() => expect(publishBar.textContent).toMatch(/Up to date/));
    expect((await api.get('/global/publishing')).data).toMatchObject({ sentinelKey: 'Global:Sentinel', hasPendingChanges: false });
  });

  it('returns 404 for an unknown environment', async () => {
    // The demo API answers errors with their status rather than throwing.
    expect((await api.get('/applications/production-gateway/environments/nope/publishing')).status).toBe(404);
  });
});
