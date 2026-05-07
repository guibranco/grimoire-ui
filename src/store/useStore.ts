import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AppState {
  selectedAppSlug: string | null;
  selectedEnvironmentSlug: string | null;
  isAdminAuthenticated: boolean;
  
  setSelectedAppSlug: (slug: string | null) => void;
  setSelectedEnvironmentSlug: (slug: string | null) => void;
  setAdminAuthenticated: (auth: boolean) => void;
  disconnect: () => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      selectedAppSlug: null,
      selectedEnvironmentSlug: null,
      isAdminAuthenticated: !!(localStorage.getItem('grimoire_api_url') && localStorage.getItem('grimoire_api_key')),
      
      setSelectedAppSlug: (slug) => set({ selectedAppSlug: slug }),
      setSelectedEnvironmentSlug: (slug) => set({ selectedEnvironmentSlug: slug }),
      setAdminAuthenticated: (auth) => set({ isAdminAuthenticated: auth }),
      disconnect: () => {
        localStorage.removeItem('grimoire_api_url');
        localStorage.removeItem('grimoire_api_key');
        set({ 
          selectedAppSlug: null, 
          selectedEnvironmentSlug: null, 
          isAdminAuthenticated: false 
        });
      },
    }),
    {
      name: 'grimoire-storage',
      partialize: (state) => ({ 
        selectedAppSlug: state.selectedAppSlug, 
        selectedEnvironmentSlug: state.selectedEnvironmentSlug 
      }),
    }
  )
);
