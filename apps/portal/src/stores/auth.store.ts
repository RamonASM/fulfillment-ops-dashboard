/**
 * Client Portal Auth Store
 */

import { createAuthStore } from '@inventory/shared/stores';

export interface PortalUser {
  id: string;
  email: string;
  name: string;
  clientId: string;
  clientName: string;
  role: 'viewer' | 'requester' | 'admin';
}

export const usePortalAuthStore = createAuthStore<PortalUser>({
  storageName: 'portal-auth-storage',
});
