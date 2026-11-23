import { describe, it, expect, beforeEach } from 'vitest';
import { appPath, globalPath, isAppTab, isGlobalTab, routerBasename } from '../src/lib/routes';
import { useStore } from '../src/store/useStore';

describe('route helpers', () => {
  it('builds application paths, omitting the default tab', () => {
    expect(appPath('my-app')).toBe('/apps/my-app');
    expect(appPath('my-app', 'prod')).toBe('/apps/my-app/prod');
    expect(appPath('my-app', 'prod', 'config')).toBe('/apps/my-app/prod');
    expect(appPath('my-app', 'prod', 'secrets')).toBe('/apps/my-app/prod/secrets');
    // A tab needs an environment segment to live in.
    expect(appPath('my-app', null, 'secrets')).toBe('/apps/my-app');
    expect(appPath('a b', 'x/y')).toBe('/apps/a%20b/x%2Fy');
  });

  it('builds application paths with a highlighted key', () => {
    expect(appPath('my-app', 'prod', 'config', 'SMTP_HOST')).toBe('/apps/my-app/prod/config?key=SMTP_HOST');
    expect(appPath('my-app', 'prod', 'secrets', 'A&B')).toBe('/apps/my-app/prod/secrets?key=A%26B');
    expect(appPath('my-app', null, null, 'K')).toBe('/apps/my-app?key=K');
  });

  it('builds Global paths with an optional highlighted key', () => {
    expect(globalPath()).toBe('/global');
    expect(globalPath('config')).toBe('/global');
    expect(globalPath('secrets')).toBe('/global/secrets');
    expect(globalPath('config', 'SMTP_HOST')).toBe('/global/config?key=SMTP_HOST');
    expect(globalPath('secrets', 'A&B')).toBe('/global/secrets?key=A%26B');
  });

  it('validates tabs', () => {
    expect(isAppTab('config')).toBe(true);
    expect(isAppTab('secrets')).toBe(true);
    expect(isAppTab('flags')).toBe(true);
    expect(isAppTab('flagz')).toBe(false);
    expect(isAppTab(undefined)).toBe(false);
    expect(isGlobalTab('secrets')).toBe(true);
    expect(isGlobalTab('nope')).toBe(false);
  });

  it('derives the router basename from the Vite base', () => {
    expect(routerBasename('/')).toBe('/');
    expect(routerBasename('/grimoire-ui/')).toBe('/grimoire-ui');
    expect(routerBasename('/grimoire-ui//')).toBe('/grimoire-ui');
    expect(routerBasename('')).toBe('/');
  });
});

describe('navigation store', () => {
  beforeEach(() => {
    useStore.setState({ lastVisitedAppSlug: null, lastVisitedEnvironmentSlug: null, recentAppSlugs: [] });
  });

  it('remembers and forgets the last visited application', () => {
    useStore.getState().setLastVisited('my-app', 'prod');
    expect(useStore.getState()).toMatchObject({ lastVisitedAppSlug: 'my-app', lastVisitedEnvironmentSlug: 'prod' });

    useStore.getState().forgetLastVisited('other-app');
    expect(useStore.getState().lastVisitedAppSlug).toBe('my-app');

    useStore.getState().forgetLastVisited('my-app');
    expect(useStore.getState()).toMatchObject({ lastVisitedAppSlug: null, lastVisitedEnvironmentSlug: null });
  });

  it('persists only the last visited application, recent applications and dashboard view preferences', () => {
    useStore.getState().setLastVisited('my-app', 'prod');
    useStore.getState().setDashboardAppsView('list');
    useStore.getState().setDashboardAppsSort('lastFetched');
    const stored = JSON.parse(localStorage.getItem('grimoire-storage') ?? '{}');
    expect(stored.state).toEqual({
      lastVisitedAppSlug: 'my-app',
      lastVisitedEnvironmentSlug: 'prod',
      recentAppSlugs: ['my-app'],
      dashboardAppsView: 'list',
      dashboardAppsSort: 'lastFetched',
    });
    expect(stored.version).toBe(1);
    useStore.setState({ dashboardAppsView: 'grid', dashboardAppsSort: 'name' });
  });

  it('ignores invalid persisted dashboard view preferences', () => {
    const merge = useStore.persist.getOptions().merge!;
    const current = useStore.getState();
    const merged = merge({ dashboardAppsView: 'table', dashboardAppsSort: 'size', lastVisitedAppSlug: 'x' }, current);
    expect(merged).toMatchObject({ dashboardAppsView: 'grid', dashboardAppsSort: 'name', lastVisitedAppSlug: 'x' });
  });

  it('keeps the five most recently visited applications, newest first and without duplicates', () => {
    const { setLastVisited } = useStore.getState();
    ['a', 'b', 'c', 'a', 'd', 'e', 'f'].forEach((slug) => setLastVisited(slug));
    expect(useStore.getState().recentAppSlugs).toEqual(['f', 'e', 'd', 'a', 'c']);

    setLastVisited(null);
    expect(useStore.getState().recentAppSlugs).toEqual(['f', 'e', 'd', 'a', 'c']);

    useStore.getState().forgetLastVisited('d');
    expect(useStore.getState().recentAppSlugs).toEqual(['f', 'e', 'a', 'c']);
  });

  it('sanitises persisted recent applications', () => {
    const merge = useStore.persist.getOptions().merge!;
    const merged = merge({ recentAppSlugs: ['a', 'a', 3, '', 'b', 'c', 'd', 'e', 'f'] }, useStore.getState());
    expect(merged.recentAppSlugs).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(merge({ recentAppSlugs: 'nope' }, useStore.getState()).recentAppSlugs).toEqual([]);
  });

  it('migrates the v0 persisted selection into the last visited application', async () => {
    const migrate = useStore.persist.getOptions().migrate!;
    expect(await migrate({ selectedView: 'app', selectedAppSlug: 'legacy', selectedEnvironmentSlug: 'qa' }, 0)).toEqual({
      lastVisitedAppSlug: 'legacy',
      lastVisitedEnvironmentSlug: 'qa',
    });
  });
});
