import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface CachedClient {
  id: string;
  name: string;
  code: string;
  healthPercent: number;
  updatedAt: string;
}

interface CachedAlert {
  id: string;
  clientId: string;
  title: string;
  severity: string;
  alertType: string;
  createdAt: string;
}

interface OfflineState {
  isOnline: boolean;
  lastSyncAt: string | null;
  clients: CachedClient[];
  alerts: CachedAlert[];
  pendingActions: Array<{
    id: string;
    type: string;
    payload: unknown;
    createdAt: string;
  }>;

  // Actions
  setOnlineStatus: (status: boolean) => void;
  cacheClients: (clients: CachedClient[]) => void;
  cacheAlerts: (alerts: CachedAlert[]) => void;
  addPendingAction: (type: string, payload: unknown) => void;
  removePendingAction: (id: string) => void;
  clearPendingActions: () => void;
  updateLastSync: () => void;
}

export const useOfflineStore = create<OfflineState>()(
  persist(
    (set) => ({
      isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
      lastSyncAt: null,
      clients: [],
      alerts: [],
      pendingActions: [],

      setOnlineStatus: (status) => set({ isOnline: status }),

      cacheClients: (clients) =>
        set({
          clients,
          lastSyncAt: new Date().toISOString(),
        }),

      cacheAlerts: (alerts) =>
        set({
          alerts,
          lastSyncAt: new Date().toISOString(),
        }),

      addPendingAction: (type, payload) =>
        set((state) => ({
          pendingActions: [
            ...state.pendingActions,
            {
              id: crypto.randomUUID(),
              type,
              payload,
              createdAt: new Date().toISOString(),
            },
          ],
        })),

      removePendingAction: (id) =>
        set((state) => ({
          pendingActions: state.pendingActions.filter((a) => a.id !== id),
        })),

      clearPendingActions: () => set({ pendingActions: [] }),

      updateLastSync: () => set({ lastSyncAt: new Date().toISOString() }),
    }),
    {
      name: 'inventory-offline-storage',
      partialize: (state) => ({
        clients: state.clients,
        alerts: state.alerts,
        pendingActions: state.pendingActions,
        lastSyncAt: state.lastSyncAt,
      }),
    }
  )
);

// Hook to sync online status
export function useOnlineStatus() {
  const { isOnline, setOnlineStatus } = useOfflineStore();

  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => setOnlineStatus(true));
    window.addEventListener('offline', () => setOnlineStatus(false));
  }

  return isOnline;
}
