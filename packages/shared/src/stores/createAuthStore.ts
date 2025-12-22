/**
 * Auth Store Factory
 *
 * Creates a Zustand auth store with persistence for any user type.
 * Used by both admin dashboard and client portal.
 */

import { create, StateCreator } from 'zustand';
import { persist, PersistOptions } from 'zustand/middleware';

/**
 * Base auth state interface
 */
export interface AuthState<TUser> {
  user: TUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  setAuth: (user: TUser, accessToken: string) => void;
  logout: () => void;
}

/**
 * Configuration for creating an auth store
 */
export interface AuthStoreConfig {
  /** Storage key name for persistence */
  storageName: string;
}

/**
 * Create an auth store with the specified user type
 *
 * @example
 * ```ts
 * interface AdminUser {
 *   id: string;
 *   email: string;
 *   role: 'admin' | 'manager';
 * }
 *
 * export const useAuthStore = createAuthStore<AdminUser>({
 *   storageName: 'auth-storage'
 * });
 * ```
 */
export function createAuthStore<TUser>(config: AuthStoreConfig) {
  type State = AuthState<TUser>;

  const stateCreator: StateCreator<State> = (set) => ({
    user: null,
    accessToken: null,
    isAuthenticated: false,

    setAuth: (user, accessToken) =>
      set({
        user,
        accessToken,
        isAuthenticated: true,
      }),

    logout: () =>
      set({
        user: null,
        accessToken: null,
        isAuthenticated: false,
      }),
  });

  const persistOptions: PersistOptions<State, Pick<State, 'user' | 'accessToken' | 'isAuthenticated'>> = {
    name: config.storageName,
    partialize: (state) => ({
      user: state.user,
      accessToken: state.accessToken,
      isAuthenticated: state.isAuthenticated,
    }),
  };

  return create<State>()(persist(stateCreator, persistOptions));
}
