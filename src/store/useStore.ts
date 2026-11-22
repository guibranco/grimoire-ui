import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { clearDetectedApiVersion } from '@/lib/api';

/**
 * Navigation (view, application, environment, tab, highlighted key) lives in
 * the URL — see `src/lib/routes.ts`. The store only keeps auth state and the
 * last visited application/environment for the dashboard's "Continue to …",
 * the recently visited applications for the command palette, plus the
 * dashboard's application list preferences.
 */
export type DashboardAppsView = 'grid' | 'list';
export type DashboardAppsSort = 'name' | 'lastChanged' | 'lastFetched';

const isAppsView = (v: unknown): v is DashboardAppsView => v === 'grid' || v === 'list';
const isAppsSort = (v: unknown): v is DashboardAppsSort =>
  v === 'name' || v === 'lastChanged' || v === 'lastFetched';

/** How many recently visited applications the command palette offers. */
export const MAX_RECENT_APPS = 5;

const toRecentApps = (v: unknown): string[] =>
  Array.isArray(v)
    ? [...new Set(v.filter((s): s is string => typeof s === 'string' && s.length > 0))].slice(0, MAX_RECENT_APPS)
    : [];

interface AppState {
  isAdminAuthenticated: boolean;
  lastVisitedAppSlug: string | null;
  lastVisitedEnvironmentSlug: string | null;
  /** Most recently visited application slugs, newest first (at most `MAX_RECENT_APPS`). */
  recentAppSlugs: string[];
  dashboardAppsView: DashboardAppsView;
  dashboardAppsSort: DashboardAppsSort;

  setAdminAuthenticated: (auth: boolean) => void;
  setLastVisited: (appSlug: string | null, environmentSlug?: string | null) => void;
  /** Forget the last visited app if it matches `appSlug` (e.g. after deleting it). */
  forgetLastVisited: (appSlug: string) => void;
  setDashboardAppsView: (view: DashboardAppsView) => void;
  setDashboardAppsSort: (sort: DashboardAppsSort) => void;
  disconnect: () => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      isAdminAuthenticated: !!(localStorage.getItem('grimoire_api_url') && localStorage.getItem('grimoire_api_key')),
      lastVisitedAppSlug: null,
      lastVisitedEnvironmentSlug: null,
      recentAppSlugs: [],
      dashboardAppsView: 'grid',
      dashboardAppsSort: 'name',

      setAdminAuthenticated: (auth) => set({ isAdminAuthenticated: auth }),
      setLastVisited: (appSlug, environmentSlug = null) =>
        set((state) => ({
          lastVisitedAppSlug: appSlug,
          lastVisitedEnvironmentSlug: appSlug ? environmentSlug : null,
          recentAppSlugs: appSlug ? toRecentApps([appSlug, ...state.recentAppSlugs]) : state.recentAppSlugs,
        })),
      forgetLastVisited: (appSlug) =>
        set((state) => ({
          ...(state.lastVisitedAppSlug === appSlug
            ? { lastVisitedAppSlug: null, lastVisitedEnvironmentSlug: null }
            : {}),
          recentAppSlugs: state.recentAppSlugs.filter((s) => s !== appSlug),
        })),
      setDashboardAppsView: (dashboardAppsView) => set({ dashboardAppsView }),
      setDashboardAppsSort: (dashboardAppsSort) => set({ dashboardAppsSort }),
      disconnect: () => {
        localStorage.removeItem('grimoire_api_url');
        localStorage.removeItem('grimoire_api_key');
        clearDetectedApiVersion();
        set({
          isAdminAuthenticated: false,
          lastVisitedAppSlug: null,
          lastVisitedEnvironmentSlug: null,
          recentAppSlugs: [],
        });
      },
    }),
    {
      name: 'grimoire-storage',
      version: 1,
      partialize: (state) => ({
        lastVisitedAppSlug: state.lastVisitedAppSlug,
        lastVisitedEnvironmentSlug: state.lastVisitedEnvironmentSlug,
        recentAppSlugs: state.recentAppSlugs,
        dashboardAppsView: state.dashboardAppsView,
        dashboardAppsSort: state.dashboardAppsSort,
      }),
      // Ignore persisted view preferences that aren't valid values.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppState>;
        return {
          ...current,
          ...p,
          recentAppSlugs: toRecentApps(p.recentAppSlugs),
          dashboardAppsView: isAppsView(p.dashboardAppsView) ? p.dashboardAppsView : current.dashboardAppsView,
          dashboardAppsSort: isAppsSort(p.dashboardAppsSort) ? p.dashboardAppsSort : current.dashboardAppsSort,
        };
      },
      // v0 persisted the current selection; carry it over as the last visited app.
      migrate: (persisted, version) => {
        const old = (persisted ?? {}) as Record<string, unknown>;
        const str = (v: unknown) => (typeof v === 'string' ? v : null);
        return version === 0
          ? {
              lastVisitedAppSlug: str(old.selectedAppSlug),
              lastVisitedEnvironmentSlug: str(old.selectedEnvironmentSlug),
            }
          : {
              lastVisitedAppSlug: str(old.lastVisitedAppSlug),
              lastVisitedEnvironmentSlug: str(old.lastVisitedEnvironmentSlug),
              recentAppSlugs: toRecentApps(old.recentAppSlugs),
            };
      },
    }
  )
);
