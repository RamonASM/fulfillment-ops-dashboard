import { emitToClient, emitToUser, SocketEvents } from '../lib/socket.js';
import { prisma } from '../lib/prisma.js';

interface NotificationPayload {
  id: string;
  type: string;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'error' | 'success';
  data?: Record<string, unknown>;
  createdAt: Date;
}

// =============================================================================
// ALERT NOTIFICATIONS
// =============================================================================

/**
 * Emit new alert to relevant users
 */
export async function emitAlertCreated(alert: {
  id: string;
  clientId: string;
  productId: string | null;
  type: string;
  severity: string;
  message: string;
}): Promise<void> {
  const notification: NotificationPayload = {
    id: alert.id,
    type: 'ALERT',
    title: getAlertTitle(alert.type),
    message: alert.message,
    severity: mapAlertSeverity(alert.severity),
    data: {
      alertId: alert.id,
      clientId: alert.clientId,
      productId: alert.productId,
      alertType: alert.type,
    },
    createdAt: new Date(),
  };

  // Emit to all users watching this client
  emitToClient(alert.clientId, SocketEvents.ALERT_CREATED, notification);
  emitToClient(alert.clientId, SocketEvents.NOTIFICATION, notification);
}

/**
 * Emit stock status change
 */
export async function emitStockStatusChange(
  clientId: string,
  product: {
    id: string;
    name: string;
    productId: string;
    stockStatus: string;
    currentStockUnits: number;
    weeksRemaining: number | null;
  }
): Promise<void> {
  const event = getStockStatusEvent(product.stockStatus);

  emitToClient(clientId, event, {
    productId: product.id,
    productCode: product.productId,
    name: product.name,
    status: product.stockStatus,
    currentStock: product.currentStockUnits,
    weeksRemaining: product.weeksRemaining,
  });

  // Also send as notification for critical statuses
  if (product.stockStatus === 'CRITICAL' || product.stockStatus === 'STOCKOUT') {
    const notification: NotificationPayload = {
      id: `stock-${product.id}-${Date.now()}`,
      type: 'STOCK_ALERT',
      title: product.stockStatus === 'STOCKOUT' ? 'Stockout Alert' : 'Critical Stock Alert',
      message: `${product.name} is ${product.stockStatus === 'STOCKOUT' ? 'out of stock' : 'critically low'}`,
      severity: 'error',
      data: {
        productId: product.id,
        clientId,
        stockStatus: product.stockStatus,
      },
      createdAt: new Date(),
    };
    emitToClient(clientId, SocketEvents.NOTIFICATION, notification);
  }
}

// =============================================================================
// ORDER NOTIFICATIONS (Portal)
// =============================================================================

/**
 * Emit order request created
 */
export async function emitOrderCreated(order: {
  id: string;
  clientId: string;
  requestedById: string;
  status: string;
}): Promise<void> {
  // Get client info
  const client = await prisma.client.findUnique({
    where: { id: order.clientId },
  });

  if (!client) return;

  // Get users assigned to this client
  const userClients = await prisma.userClient.findMany({
    where: { clientId: order.clientId },
    select: { userId: true },
  });

  const notification: NotificationPayload = {
    id: order.id,
    type: 'ORDER_REQUEST',
    title: 'New Order Request',
    message: `${client.name} submitted a new order request`,
    severity: 'info',
    data: {
      orderId: order.id,
      clientId: order.clientId,
      clientName: client.name,
    },
    createdAt: new Date(),
  };

  // Emit to client watchers
  emitToClient(order.clientId, SocketEvents.ORDER_CREATED, {
    orderId: order.id,
    clientId: order.clientId,
    status: order.status,
  });

  // Notify assigned account managers
  for (const userClient of userClients) {
    emitToUser(userClient.userId, SocketEvents.NOTIFICATION, notification);
  }
}

/**
 * Emit order status change
 */
export async function emitOrderStatusChange(order: {
  id: string;
  clientId: string;
  requestedById: string;
  status: string;
  reviewedById?: string | null;
}): Promise<void> {
  const event = order.status === 'APPROVED'
    ? SocketEvents.ORDER_APPROVED
    : order.status === 'REJECTED'
      ? SocketEvents.ORDER_REJECTED
      : SocketEvents.ORDER_FULFILLED;

  emitToClient(order.clientId, event, {
    orderId: order.id,
    status: order.status,
  });

  // Notify the requester
  const notification: NotificationPayload = {
    id: `order-${order.id}-${order.status}`,
    type: 'ORDER_STATUS',
    title: `Order ${order.status.charAt(0) + order.status.slice(1).toLowerCase()}`,
    message: `Your order request has been ${order.status.toLowerCase()}`,
    severity: order.status === 'APPROVED' ? 'success' : order.status === 'REJECTED' ? 'error' : 'info',
    data: {
      orderId: order.id,
      status: order.status,
    },
    createdAt: new Date(),
  };

  emitToUser(order.requestedById, SocketEvents.NOTIFICATION, notification);
}

// =============================================================================
// IMPORT NOTIFICATIONS
// =============================================================================

/**
 * Emit import progress
 */
export function emitImportProgress(
  userId: string,
  importId: string,
  progress: {
    stage: 'analyzing' | 'processing' | 'completed' | 'failed';
    percent: number;
    message: string;
    details?: Record<string, unknown>;
  }
): void {
  const event = progress.stage === 'completed'
    ? SocketEvents.IMPORT_COMPLETED
    : progress.stage === 'failed'
      ? SocketEvents.IMPORT_FAILED
      : SocketEvents.IMPORT_PROGRESS;

  emitToUser(userId, event, {
    importId,
    ...progress,
  });
}

// =============================================================================
// HELPERS
// =============================================================================

function getAlertTitle(type: string): string {
  const titles: Record<string, string> = {
    STOCKOUT: 'Stockout Alert',
    CRITICAL_STOCK: 'Critical Stock Alert',
    LOW_STOCK: 'Low Stock Warning',
    REORDER_DUE: 'Reorder Reminder',
    USAGE_SPIKE: 'Usage Spike Detected',
    USAGE_DROP: 'Usage Drop Detected',
    DEMAND_ANOMALY: 'Demand Anomaly',
  };
  return titles[type] || 'Alert';
}

function mapAlertSeverity(severity: string): 'info' | 'warning' | 'error' | 'success' {
  const map: Record<string, 'info' | 'warning' | 'error' | 'success'> = {
    INFO: 'info',
    WARNING: 'warning',
    CRITICAL: 'error',
    URGENT: 'error',
  };
  return map[severity] || 'info';
}

function getStockStatusEvent(status: string): string {
  switch (status) {
    case 'STOCKOUT':
      return SocketEvents.STOCKOUT;
    case 'CRITICAL':
      return SocketEvents.STOCK_CRITICAL;
    case 'LOW':
      return SocketEvents.STOCK_LOW;
    default:
      return SocketEvents.STOCK_UPDATED;
  }
}
