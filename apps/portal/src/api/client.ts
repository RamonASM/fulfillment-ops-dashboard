/**
 * Client Portal API Client
 *
 * Thin wrapper around the shared API client configured for the portal app.
 */

import { createApiClient } from '@inventory/shared/api';
import { usePortalAuthStore } from '@/stores/auth.store';

const PORTAL_API_BASE = '/api/portal';
const DIRECT_API_BASE = '/api';

/**
 * Configured API client for portal-specific endpoints (/api/portal/*)
 */
export const portalApi = createApiClient({
  baseUrl: PORTAL_API_BASE,
  getToken: () => usePortalAuthStore.getState().accessToken,
  onUnauthorized: () => {
    usePortalAuthStore.getState().logout();
    window.location.href = '/login';
  },
  enableCsrf: true,
});

/**
 * Direct API client for non-portal endpoints (e.g., /api/feedback)
 */
export const directApi = createApiClient({
  baseUrl: DIRECT_API_BASE,
  getToken: () => usePortalAuthStore.getState().accessToken,
  onUnauthorized: () => {
    usePortalAuthStore.getState().logout();
    window.location.href = '/login';
  },
  enableCsrf: true,
});

// Default export for documentation and other non-portal endpoints
export const api = directApi;

// Re-export types for convenience
export type { RequestOptions, ApiClientConfig, ApiErrorResponse } from '@inventory/shared/api';
