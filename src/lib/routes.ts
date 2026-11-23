/**
 * URL helpers for Grimoire UI routing.
 *
 * The URL is the source of truth for which view, application, environment and
 * tab are shown. Build links with these helpers rather than hand-writing paths
 * so encoding and defaults stay consistent.
 */

export type AppTab = 'config' | 'flags' | 'secrets' | 'tokens' | 'activity' | 'compare';
/** Tabs that list entries (and can highlight one with `?key=`). */
export type EntryTab = 'config' | 'secrets';
export type GlobalTab = 'config' | 'flags' | 'secrets';

export const APP_TABS: readonly AppTab[] = ['config', 'flags', 'secrets', 'tokens', 'activity', 'compare'];
export const GLOBAL_TABS: readonly GlobalTab[] = ['config', 'flags', 'secrets'];

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
export const comparePath = (appSlug: string, from: string, to?: string | null) => {
  const query = to ? '?' + new URLSearchParams({ to }).toString() : '';
  return `/apps/${seg(appSlug)}/${seg(from)}/compare${query}`;
};

export type FlagView = 'targeting' | 'history';

/**
 * `/apps/:appSlug/:envSlug/flags[?flag=key[&view=history]]` (guibranco/grimoire-ui#453). Without
 * `flag` it is the flag list; with it, that flag's targeting in `envSlug` (or its history).
 */
export const flagsPath = (appSlug: string, envSlug: string, flag?: string | null, view?: FlagView | null) => {
  const query = new URLSearchParams();
  if (flag) query.set('flag', flag);
  if (flag && view === 'history') query.set('view', 'history');
  const qs = query.toString();
  const path = `/apps/${seg(appSlug)}/${seg(envSlug)}/flags`;
  return qs ? `${path}?${qs}` : path;
};

/**
 * `/global/flags[?env=slug][&flag=key[&view=history]]`: global flags, their targeting for an
 * environment slug (`*`, the default, is omitted) or a flag's history.
 */
export const globalFlagsPath = (env?: string | null, flag?: string | null, view?: FlagView | null) => {
  const query = new URLSearchParams();
  if (env && env !== '*') query.set('env', env);
  if (flag) query.set('flag', flag);
  if (flag && view === 'history') query.set('view', 'history');
  const qs = query.toString();
  return qs ? `/global/flags?${qs}` : '/global/flags';
};

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

export type ReportTab = 'unused' | 'dependencies';
export const REPORT_TABS: readonly ReportTab[] = ['unused', 'dependencies'];
export const DEFAULT_REPORT_TAB: ReportTab = 'unused';
/** Default window of the unused-secrets report, in days. */
export const DEFAULT_UNUSED_WINDOW = 90;

export const isReportTab = (value: unknown): value is ReportTab =>
  typeof value === 'string' && (REPORT_TABS as readonly string[]).includes(value);

/**
 * `/reports[/dependencies]` (guibranco/grimoire-ui#451). Unused secrets take `?days=N` (default
 * omitted); the dependency graph takes `?focus=<node id>`.
 */
export const reportsPath = (tab?: ReportTab | null, params?: { days?: number | null; focus?: string | null }) => {
  const path = tab && tab !== DEFAULT_REPORT_TAB ? `/reports/${tab}` : '/reports';
  const query = new URLSearchParams();
  if (params?.days && params.days !== DEFAULT_UNUSED_WINDOW) query.set('days', String(params.days));
  if (params?.focus) query.set('focus', params.focus);
  const qs = query.toString();
  return qs ? `${path}?${qs}` : path;
};

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
