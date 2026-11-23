/**
 * URL helpers for Grimoire UI routing.
 *
 * The URL is the source of truth for which view, application, environment and
 * tab are shown. Build links with these helpers rather than hand-writing paths
 * so encoding and defaults stay consistent.
 */

export type AppTab = 'config' | 'secrets' | 'activity' | 'compare';
/** Tabs that list entries (and can highlight one with `?key=`). */
export type EntryTab = 'config' | 'secrets';
export type GlobalTab = 'config' | 'secrets';

export const APP_TABS: readonly AppTab[] = ['config', 'secrets', 'activity', 'compare'];
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
 * `/apps/:appSlug[/:envSlug[/:tab]][?key=...]`. The default tab is omitted
 * unless a key is highlighted, and a tab can only be expressed when an
 * environment is known. `key` highlights a configuration key or secret name.
 */
export const appPath = (
  appSlug: string,
  envSlug?: string | null,
  tab?: AppTab | null,
  key?: string | null
) => {
  let path = `/apps/${seg(appSlug)}`;
  if (envSlug) {
    path += `/${seg(envSlug)}`;
    if (tab && (tab !== DEFAULT_APP_TAB || key)) path += `/${tab}`;
  }
  if (key) path += `?${new URLSearchParams({ key }).toString()}`;
  return path;
};

/** `/apps/:appSlug/:from/compare[?to=...]` — the environment comparison tab. */
export const comparePath = (appSlug: string, from: string, to?: string | null) =>
  `/apps/${seg(appSlug)}/${seg(from)}/compare${to ? `?${new URLSearchParams({ to }).toString()}` : ''}`;

/** `/global[/:tab][?key=...]`. `key` highlights a config key or secret name. */
export const globalPath = (tab?: GlobalTab | null, key?: string | null) => {
  let path = '/global';
  if (tab && (tab !== DEFAULT_GLOBAL_TAB || key)) path += `/${tab}`;
  if (key) path += `?${new URLSearchParams({ key }).toString()}`;
  return path;
};

/** `/audit[?filters]` — the audit log, optionally pre-filtered. */
export const auditPath = (filters?: Record<string, string | number | boolean | null | undefined>) => {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters ?? {})) {
    if (v !== null && v !== undefined && v !== '') params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `/audit?${qs}` : '/audit';
};

/** Default look-ahead of the rotation page, in days. */
export const DEFAULT_ROTATION_WINDOW = 30;

/** `/rotation[?within=N]` — secrets due for rotation (guibranco/grimoire-api#78); the default window is omitted. */
export const rotationPath = (within?: number | null) =>
  within && within !== DEFAULT_ROTATION_WINDOW ? `/rotation?within=${within}` : '/rotation';

/** `/global[/:tab]?new=1` — opens Global with the create form for that tab. */
export const globalCreatePath = (tab: GlobalTab) => {
  const base = globalPath(tab);
  return `${base}${base.includes('?') ? '&' : '?'}new=1`;
};

/**
 * Router basename derived from Vite's `base` (`/grimoire-ui/` on GitHub Pages,
 * `/` in dev). React Router expects no trailing slash.
 */
export const routerBasename = (baseUrl: string = import.meta.env.BASE_URL ?? '/') => {
  let end = baseUrl.length;
  while (end > 0 && baseUrl[end - 1] === '/') end--;
  return baseUrl.slice(0, end) || '/';
};
