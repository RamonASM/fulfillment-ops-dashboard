import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../stores/auth.store';
import { showToast } from '../components/ui/Toast';

const SOCKET_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001';

interface SocketNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'error' | 'success';
  data?: Record<string, unknown>;
  createdAt: Date;
}

export const SocketEvents = {
  ALERT_CREATED: 'alert:created',
  ALERT_UPDATED: 'alert:updated',
  ALERT_DISMISSED: 'alert:dismissed',
  PRODUCT_UPDATED: 'product:updated',
  STOCK_UPDATED: 'stock:updated',
  STOCK_LOW: 'stock:low',
  STOCK_CRITICAL: 'stock:critical',
  STOCKOUT: 'stock:out',
  ORDER_CREATED: 'order:created',
  ORDER_APPROVED: 'order:approved',
  ORDER_REJECTED: 'order:rejected',
  ORDER_FULFILLED: 'order:fulfilled',
  IMPORT_STARTED: 'import:started',
  IMPORT_PROGRESS: 'import:progress',
  IMPORT_COMPLETED: 'import:completed',
  IMPORT_FAILED: 'import:failed',
  NOTIFICATION: 'notification',
  CONNECTION_STATUS: 'connection:status',
} as const;

type SocketEventHandler = (data: unknown) => void;

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const { accessToken, user } = useAuthStore();
  const handlersRef = useRef<Map<string, Set<SocketEventHandler>>>(new Map());

  // Connect to socket
  useEffect(() => {
    if (!accessToken || !user) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setIsConnected(false);
      return;
    }

    const socket = io(SOCKET_URL, {
      auth: { token: accessToken },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      if ((import.meta as any).env?.DEV) console.debug('[Socket] Connected');
      setIsConnected(true);
      setConnectionError(null);
    });

    socket.on('disconnect', (reason) => {
      if ((import.meta as any).env?.DEV) console.debug('[Socket] Disconnected:', reason);
      setIsConnected(false);
    });

    socket.on('connect_error', (error) => {
      if ((import.meta as any).env?.DEV) console.debug('[Socket] Connection error:', error.message);
      setConnectionError(error.message);
      setIsConnected(false);
    });

    // Handle notifications with toast
    socket.on(SocketEvents.NOTIFICATION, (notification: SocketNotification) => {
      const toastMethod = {
        info: showToast.info,
        warning: showToast.warning,
        error: showToast.error,
        success: showToast.success,
      }[notification.severity] || showToast.info;

      toastMethod(notification.message, { duration: 5000 });
    });

    // Handle stock alerts
    socket.on(SocketEvents.STOCK_CRITICAL, (data: { name: string; status: string }) => {
      showToast.error(`Critical: ${data.name} is critically low!`, { duration: 8000 });
    });

    socket.on(SocketEvents.STOCKOUT, (data: { name: string }) => {
      showToast.error(`Stockout: ${data.name} is out of stock!`, { duration: 10000 });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [accessToken, user]);

  // Subscribe to client updates
  const subscribeToClient = useCallback((clientId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('subscribe:client', clientId);
    }
  }, []);

  // Unsubscribe from client updates
  const unsubscribeFromClient = useCallback((clientId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('unsubscribe:client', clientId);
    }
  }, []);

  // Add event listener
  const on = useCallback((event: string, handler: SocketEventHandler) => {
    if (!handlersRef.current.has(event)) {
      handlersRef.current.set(event, new Set());
    }
    handlersRef.current.get(event)!.add(handler);

    socketRef.current?.on(event, handler);

    return () => {
      handlersRef.current.get(event)?.delete(handler);
      socketRef.current?.off(event, handler);
    };
  }, []);

  // Remove event listener
  const off = useCallback((event: string, handler: SocketEventHandler) => {
    handlersRef.current.get(event)?.delete(handler);
    socketRef.current?.off(event, handler);
  }, []);

  return {
    socket: socketRef.current,
    isConnected,
    connectionError,
    subscribeToClient,
    unsubscribeFromClient,
    on,
    off,
  };
}

// =============================================================================
// SPECIALIZED HOOKS
// =============================================================================

/**
 * Hook for listening to alert events
 */
export function useAlertSocket(onNewAlert?: (alert: unknown) => void) {
  const { on, isConnected } = useSocket();

  useEffect(() => {
    if (!onNewAlert) return;

    const unsubscribe = on(SocketEvents.ALERT_CREATED, onNewAlert);
    return unsubscribe;
  }, [on, onNewAlert]);

  return { isConnected };
}

/**
 * Hook for listening to import progress
 */
export function useImportSocket(
  importId: string,
  onProgress?: (progress: { stage: string; percent: number; message: string }) => void
) {
  const { on, isConnected } = useSocket();

  useEffect(() => {
    if (!onProgress || !importId) return;

    const unsubscribe = on(SocketEvents.IMPORT_PROGRESS, (data: unknown) => {
      const progress = data as { importId: string; stage: string; percent: number; message: string };
      if (progress.importId === importId) {
        onProgress(progress);
      }
    });

    return unsubscribe;
  }, [on, importId, onProgress]);

  return { isConnected };
}

/**
 * Hook for product stock updates
 */
export function useProductSocket(
  clientId: string,
  onStockUpdate?: (update: unknown) => void
) {
  const { subscribeToClient, unsubscribeFromClient, on, isConnected } = useSocket();

  useEffect(() => {
    if (!clientId) return;

    subscribeToClient(clientId);
    return () => unsubscribeFromClient(clientId);
  }, [clientId, subscribeToClient, unsubscribeFromClient]);

  useEffect(() => {
    if (!onStockUpdate) return;

    const unsubscribeStock = on(SocketEvents.STOCK_UPDATED, onStockUpdate);
    const unsubscribeLow = on(SocketEvents.STOCK_LOW, onStockUpdate);
    const unsubscribeCritical = on(SocketEvents.STOCK_CRITICAL, onStockUpdate);
    const unsubscribeStockout = on(SocketEvents.STOCKOUT, onStockUpdate);

    return () => {
      unsubscribeStock();
      unsubscribeLow();
      unsubscribeCritical();
      unsubscribeStockout();
    };
  }, [on, onStockUpdate]);

  return { isConnected };
}
