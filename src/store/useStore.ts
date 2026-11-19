import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { clearDetectedApiVersion } from '@/lib/api';

/**
 * Navigation (view, application, environment, tab, highlighted key) lives in
 * the URL — see `src/lib/routes.ts`. The store only keeps auth state and the
 * last visited application/environment for the dashboard's "Continue to …".
 */
interface AppState {
  isAdminAuthenticated: boolean;
  lastVisitedAppSlug: string | null;
  lastVisitedEnvironmentSlug: string | null;

  setAdminAuthenticated: (auth: boolean) => void;
  setLastVisited: (appSlug: string | null, environmentSlug?: string | null) => void;
  /** Forget the last visited app if it matches `appSlug` (e.g. after deleting it). */
  forgetLastVisited: (appSlug: string) => void;
  disconnect: () => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      isAdminAuthenticated: !!(localStorage.getItem('grimoire_api_url') && localStorage.getItem('grimoire_api_key')),
      lastVisitedAppSlug: null,
      lastVisitedEnvironmentSlug: null,

      setAdminAuthenticated: (auth) => set({ isAdminAuthenticated: auth }),
      setLastVisited: (appSlug, environmentSlug = null) =>
        set({ lastVisitedAppSlug: appSlug, lastVisitedEnvironmentSlug: appSlug ? environmentSlug : null }),
      forgetLastVisited: (appSlug) =>
        set((state) =>
          state.lastVisitedAppSlug === appSlug
            ? { lastVisitedAppSlug: null, lastVisitedEnvironmentSlug: null }
            : {}
        ),
      disconnect: () => {
        localStorage.removeItem('grimoire_api_url');
        localStorage.removeItem('grimoire_api_key');
        clearDetectedApiVersion();
        set({
          isAdminAuthenticated: false,
          lastVisitedAppSlug: null,
          lastVisitedEnvironmentSlug: null,
        });
      },
    }),
    {
      name: 'grimoire-storage',
      version: 1,
      partialize: (state) => ({
        lastVisitedAppSlug: state.lastVisitedAppSlug,
        lastVisitedEnvironmentSlug: state.lastVisitedEnvironmentSlug,
      }),
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
            };
      },
    }
  )
);
