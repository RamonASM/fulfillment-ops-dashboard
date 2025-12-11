import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { logger } from './logger.js';

const JWT_SECRET = process.env.JWT_SECRET || 'development-secret-change-in-production';

interface SocketAuthPayload {
  id: string;
  email: string;
  role: string;
  clientIds?: string[];
  isPortalUser?: boolean;
}

// Store connected users by userId
const connectedUsers = new Map<string, Set<string>>(); // userId -> Set of socketIds
const socketToUser = new Map<string, string>(); // socketId -> userId

let io: Server | null = null;

export function initializeWebSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: [
        process.env.WEB_URL || 'http://localhost:5173',
        process.env.PORTAL_URL || 'http://localhost:5174',
      ],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.query.token;

    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const decoded = jwt.verify(token as string, JWT_SECRET) as SocketAuthPayload;
      socket.data.user = decoded;
      next();
    } catch (error) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = socket.data.user as SocketAuthPayload;
    logger.debug('Socket user connected', { userId: user.id, email: user.email, socketId: socket.id });

    // Track connected user
    if (!connectedUsers.has(user.id)) {
      connectedUsers.set(user.id, new Set());
    }
    connectedUsers.get(user.id)!.add(socket.id);
    socketToUser.set(socket.id, user.id);

    // Join user's personal room
    socket.join(`user:${user.id}`);

    // Join client rooms for account managers
    if (user.clientIds && user.clientIds.length > 0) {
      user.clientIds.forEach((clientId) => {
        socket.join(`client:${clientId}`);
      });
    }

    // Handle subscribing to specific client updates
    socket.on('subscribe:client', (clientId: string) => {
      if (user.clientIds?.includes(clientId) || user.role === 'admin') {
        socket.join(`client:${clientId}`);
        logger.debug('Socket subscribed to client', { userId: user.id, clientId });
      }
    });

    // Handle unsubscribing from client updates
    socket.on('unsubscribe:client', (clientId: string) => {
      socket.leave(`client:${clientId}`);
      logger.debug('Socket unsubscribed from client', { userId: user.id, clientId });
    });

    // Ping/pong for connection health
    socket.on('ping', () => {
      socket.emit('pong');
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      logger.debug('Socket user disconnected', { userId: user.id, email: user.email, reason });

      const userSockets = connectedUsers.get(user.id);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          connectedUsers.delete(user.id);
        }
      }
      socketToUser.delete(socket.id);
    });
  });

  logger.info('WebSocket server initialized');
  return io;
}

export function getIO(): Server | null {
  return io;
}

// =============================================================================
// EMIT HELPERS
// =============================================================================

/**
 * Emit event to a specific user (all their connected devices)
 */
export function emitToUser(userId: string, event: string, data: unknown): void {
  if (!io) return;
  io.to(`user:${userId}`).emit(event, data);
}

/**
 * Emit event to all users watching a specific client
 */
export function emitToClient(clientId: string, event: string, data: unknown): void {
  if (!io) return;
  io.to(`client:${clientId}`).emit(event, data);
}

/**
 * Emit event to all connected users
 */
export function emitToAll(event: string, data: unknown): void {
  if (!io) return;
  io.emit(event, data);
}

/**
 * Check if a user is currently connected
 */
export function isUserOnline(userId: string): boolean {
  return connectedUsers.has(userId) && connectedUsers.get(userId)!.size > 0;
}

/**
 * Get count of online users
 */
export function getOnlineUsersCount(): number {
  return connectedUsers.size;
}

// =============================================================================
// EVENT TYPES
// =============================================================================

export const SocketEvents = {
  // Alerts
  ALERT_CREATED: 'alert:created',
  ALERT_UPDATED: 'alert:updated',
  ALERT_DISMISSED: 'alert:dismissed',

  // Products
  PRODUCT_UPDATED: 'product:updated',
  STOCK_UPDATED: 'stock:updated',
  STOCK_LOW: 'stock:low',
  STOCK_CRITICAL: 'stock:critical',
  STOCKOUT: 'stock:out',

  // Orders (Portal)
  ORDER_CREATED: 'order:created',
  ORDER_APPROVED: 'order:approved',
  ORDER_REJECTED: 'order:rejected',
  ORDER_FULFILLED: 'order:fulfilled',

  // Imports
  IMPORT_STARTED: 'import:started',
  IMPORT_PROGRESS: 'import:progress',
  IMPORT_COMPLETED: 'import:completed',
  IMPORT_FAILED: 'import:failed',

  // System
  NOTIFICATION: 'notification',
  CONNECTION_STATUS: 'connection:status',
} as const;

export type SocketEvent = typeof SocketEvents[keyof typeof SocketEvents];
