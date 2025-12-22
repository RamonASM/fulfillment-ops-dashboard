/**
 * Admin Dashboard Auth Store
 */

import { createAuthStore } from '@inventory/shared/stores';

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'operations_manager' | 'account_manager';
}

export const useAuthStore = createAuthStore<User>({
  storageName: 'auth-storage',
});
