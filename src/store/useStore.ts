import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { clearDetectedApiVersion } from '@/lib/api';

export type SelectedView = 'global' | 'app';

interface AppState {
  selectedView: SelectedView;
  selectedAppSlug: string | null;
  selectedEnvironmentSlug: string | null;
  isAdminAuthenticated: boolean;
  globalTargetTab: 'config' | 'secrets' | null;
  globalHighlightedKey: string | null;

  setSelectedView: (view: SelectedView) => void;
  setSelectedAppSlug: (slug: string | null) => void;
  setSelectedEnvironmentSlug: (slug: string | null) => void;
  setAdminAuthenticated: (auth: boolean) => void;
  openGlobalEntry: (tab: 'config' | 'secrets', keyOrName?: string | null) => void;
  clearGlobalHighlight: () => void;
  disconnect: () => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      selectedView: 'app',
      selectedAppSlug: null,
      selectedEnvironmentSlug: null,
      isAdminAuthenticated: !!(localStorage.getItem('grimoire_api_url') && localStorage.getItem('grimoire_api_key')),
      globalTargetTab: null,
      globalHighlightedKey: null,

      setSelectedView: (view) => set({ selectedView: view }),
      setSelectedAppSlug: (slug) => set({ selectedAppSlug: slug, selectedView: 'app' }),
      setSelectedEnvironmentSlug: (slug) => set({ selectedEnvironmentSlug: slug }),
      setAdminAuthenticated: (auth) => set({ isAdminAuthenticated: auth }),
      openGlobalEntry: (tab, keyOrName = null) =>
        set({
          selectedView: 'global',
          globalTargetTab: tab,
          globalHighlightedKey: keyOrName,
        }),
      clearGlobalHighlight: () => set({ globalTargetTab: null, globalHighlightedKey: null }),
      disconnect: () => {
        localStorage.removeItem('grimoire_api_url');
        localStorage.removeItem('grimoire_api_key');
        clearDetectedApiVersion();
        set({
          selectedView: 'app',
          selectedAppSlug: null,
          selectedEnvironmentSlug: null,
          isAdminAuthenticated: false,
          globalTargetTab: null,
          globalHighlightedKey: null,
        });
      },
    }),
    {
      name: 'grimoire-storage',
      partialize: (state) => ({
        selectedView: state.selectedView,
        selectedAppSlug: state.selectedAppSlug,
        selectedEnvironmentSlug: state.selectedEnvironmentSlug,
      }),
    }
  )
);
