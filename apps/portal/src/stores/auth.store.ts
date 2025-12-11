import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface PortalUser {
  id: string;
  email: string;
  name: string;
  clientId: string;
  clientName: string;
  role: 'viewer' | 'requester' | 'admin';
}

interface PortalAuthState {
  user: PortalUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  setAuth: (user: PortalUser, token: string) => void;
  logout: () => void;
}

export const usePortalAuthStore = create<PortalAuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,

      setAuth: (user, token) =>
        set({
          user,
          accessToken: token,
          isAuthenticated: true,
        }),

      logout: () =>
        set({
          user: null,
          accessToken: null,
          isAuthenticated: false,
        }),
    }),
    {
      name: 'portal-auth-storage',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
