/**
 * URL helpers for Grimoire UI routing.
 *
 * The URL is the source of truth for which view, application, environment and
 * tab are shown. Build links with these helpers rather than hand-writing paths
 * so encoding and defaults stay consistent.
 */

export type AppTab = 'config' | 'secrets';
export type GlobalTab = 'config' | 'secrets';

export const APP_TABS: readonly AppTab[] = ['config', 'secrets'];
export const GLOBAL_TABS: readonly GlobalTab[] = ['config', 'secrets'];

export const DEFAULT_APP_TAB: AppTab = 'config';
export const DEFAULT_GLOBAL_TAB: GlobalTab = 'config';

export const isAppTab = (value: unknown): value is AppTab =>
  typeof value === 'string' && (APP_TABS as readonly string[]).includes(value);

export const isGlobalTab = (value: unknown): value is GlobalTab =>
  typeof value === 'string' && (GLOBAL_TABS as readonly string[]).includes(value);

const seg = (value: string) => encodeURIComponent(value);

export const dashboardPath = () => '/';

/**
 * `/apps/:appSlug[/:envSlug[/:tab]]`. The default tab is omitted, and a tab can
 * only be expressed when an environment is known.
 */
export const appPath = (appSlug: string, envSlug?: string | null, tab?: AppTab | null) => {
  let path = `/apps/${seg(appSlug)}`;
  if (envSlug) {
    path += `/${seg(envSlug)}`;
    if (tab && tab !== DEFAULT_APP_TAB) path += `/${tab}`;
  }
  return path;
};

/** `/global[/:tab][?key=...]`. `key` highlights a config key or secret name. */
export const globalPath = (tab?: GlobalTab | null, key?: string | null) => {
  let path = '/global';
  if (tab && (tab !== DEFAULT_GLOBAL_TAB || key)) path += `/${tab}`;
  if (key) path += `?${new URLSearchParams({ key }).toString()}`;
  return path;
};

/**
 * Router basename derived from Vite's `base` (`/grimoire-ui/` on GitHub Pages,
 * `/` in dev). React Router expects no trailing slash.
 */
export const routerBasename = (baseUrl: string = import.meta.env.BASE_URL ?? '/') =>
  baseUrl.replace(/\/+$/, '') || '/';
