/**
 * Admin Dashboard API Client
 *
 * Thin wrapper around the shared API client configured for the admin app.
 */

import { createApiClient } from '@inventory/shared/api';
import { useAuthStore } from '@/stores/auth.store';

const API_BASE = '/api';

/**
 * Configured API client for the admin dashboard
 */
export const api = createApiClient({
  baseUrl: API_BASE,
  getToken: () => useAuthStore.getState().accessToken,
  onUnauthorized: () => {
    useAuthStore.getState().logout();
    window.location.href = '/login';
  },
  onTokenRefreshed: (newToken) => {
    // Update the stored access token after automatic refresh
    const { user } = useAuthStore.getState();
    if (user) {
      useAuthStore.getState().setAuth(user, newToken);
    }
  },
  enableCsrf: true,
});

// Re-export types for convenience
export type { RequestOptions, ApiClientConfig, ApiErrorResponse } from '@inventory/shared/api';
