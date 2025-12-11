import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { usePortalAuthStore } from '../stores/auth.store';

const SOCKET_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001';

export const SocketEvents = {
  ORDER_CREATED: 'order:created',
  ORDER_APPROVED: 'order:approved',
  ORDER_REJECTED: 'order:rejected',
  ORDER_FULFILLED: 'order:fulfilled',
  STOCK_LOW: 'stock:low',
  STOCK_CRITICAL: 'stock:critical',
  STOCKOUT: 'stock:out',
  NOTIFICATION: 'notification',
} as const;

type SocketEventHandler = (data: unknown) => void;

export function usePortalSocket() {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const { accessToken, user } = usePortalAuthStore();
  const handlersRef = useRef<Map<string, Set<SocketEventHandler>>>(new Map());

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
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      if ((import.meta as any).env?.DEV) console.debug('[Portal Socket] Connected');
      setIsConnected(true);

      // Subscribe to client updates
      if (user.clientId) {
        socket.emit('subscribe:client', user.clientId);
      }
    });

    socket.on('disconnect', (reason) => {
      if ((import.meta as any).env?.DEV) console.debug('[Portal Socket] Disconnected:', reason);
      setIsConnected(false);
    });

    socket.on('connect_error', (error) => {
      if ((import.meta as any).env?.DEV) console.debug('[Portal Socket] Error:', error.message);
      setIsConnected(false);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [accessToken, user]);

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

  return {
    isConnected,
    on,
  };
}

/**
 * Hook for order status updates
 */
export function useOrderSocket(onStatusChange?: (data: unknown) => void) {
  const { on, isConnected } = usePortalSocket();

  useEffect(() => {
    if (!onStatusChange) return;

    const unsubs = [
      on(SocketEvents.ORDER_APPROVED, onStatusChange),
      on(SocketEvents.ORDER_REJECTED, onStatusChange),
      on(SocketEvents.ORDER_FULFILLED, onStatusChange),
    ];

    return () => unsubs.forEach((unsub) => unsub());
  }, [on, onStatusChange]);

  return { isConnected };
}

/**
 * Hook for stock alerts in portal
 */
export function useStockAlertSocket(onAlert?: (data: unknown) => void) {
  const { on, isConnected } = usePortalSocket();

  useEffect(() => {
    if (!onAlert) return;

    const unsubs = [
      on(SocketEvents.STOCK_LOW, onAlert),
      on(SocketEvents.STOCK_CRITICAL, onAlert),
      on(SocketEvents.STOCKOUT, onAlert),
    ];

    return () => unsubs.forEach((unsub) => unsub());
  }, [on, onAlert]);

  return { isConnected };
}
