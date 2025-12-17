import { emitToClient, emitToUser, SocketEvents } from "../lib/socket.js";
import { prisma } from "../lib/prisma.js";
import * as emailService from "./email.service.js";
import * as notificationPrefService from "./notification-preference.service.js";

interface NotificationPayload {
  id: string;
  type: string;
  title: string;
  message: string;
  severity: "info" | "warning" | "error" | "success";
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
    type: "ALERT",
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
  },
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
  if (
    product.stockStatus === "CRITICAL" ||
    product.stockStatus === "STOCKOUT"
  ) {
    const notification: NotificationPayload = {
      id: `stock-${product.id}-${Date.now()}`,
      type: "STOCK_ALERT",
      title:
        product.stockStatus === "STOCKOUT"
          ? "Stockout Alert"
          : "Critical Stock Alert",
      message: `${product.name} is ${product.stockStatus === "STOCKOUT" ? "out of stock" : "critically low"}`,
      severity: "error",
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
    type: "ORDER_REQUEST",
    title: "New Order Request",
    message: `${client.name} submitted a new order request`,
    severity: "info",
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
  const event =
    order.status === "APPROVED"
      ? SocketEvents.ORDER_APPROVED
      : order.status === "REJECTED"
        ? SocketEvents.ORDER_REJECTED
        : SocketEvents.ORDER_FULFILLED;

  emitToClient(order.clientId, event, {
    orderId: order.id,
    status: order.status,
  });

  // Notify the requester
  const notification: NotificationPayload = {
    id: `order-${order.id}-${order.status}`,
    type: "ORDER_STATUS",
    title: `Order ${order.status.charAt(0) + order.status.slice(1).toLowerCase()}`,
    message: `Your order request has been ${order.status.toLowerCase()}`,
    severity:
      order.status === "APPROVED"
        ? "success"
        : order.status === "REJECTED"
          ? "error"
          : "info",
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
    stage: "analyzing" | "processing" | "completed" | "failed";
    percent: number;
    message: string;
    details?: Record<string, unknown>;
  },
): void {
  const event =
    progress.stage === "completed"
      ? SocketEvents.IMPORT_COMPLETED
      : progress.stage === "failed"
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
    STOCKOUT: "Stockout Alert",
    CRITICAL_STOCK: "Critical Stock Alert",
    LOW_STOCK: "Low Stock Warning",
    REORDER_DUE: "Reorder Reminder",
    USAGE_SPIKE: "Usage Spike Detected",
    USAGE_DROP: "Usage Drop Detected",
    DEMAND_ANOMALY: "Demand Anomaly",
  };
  return titles[type] || "Alert";
}

function mapAlertSeverity(
  severity: string,
): "info" | "warning" | "error" | "success" {
  const map: Record<string, "info" | "warning" | "error" | "success"> = {
    INFO: "info",
    WARNING: "warning",
    CRITICAL: "error",
    URGENT: "error",
  };
  return map[severity] || "info";
}

function getStockStatusEvent(status: string): string {
  switch (status) {
    case "STOCKOUT":
      return SocketEvents.STOCKOUT;
    case "CRITICAL":
      return SocketEvents.STOCK_CRITICAL;
    case "LOW":
      return SocketEvents.STOCK_LOW;
    default:
      return SocketEvents.STOCK_UPDATED;
  }
}

// =============================================================================
// ORDER DEADLINE NOTIFICATIONS
// =============================================================================

/**
 * Emit order deadline approaching alert
 */
export async function emitOrderDeadlineAlert(
  clientId: string,
  product: {
    id: string;
    name: string;
    productId: string;
    daysUntilDeadline: number;
    orderByDate: Date;
    stockoutDate: Date | null;
    currentStockUnits: number;
  },
): Promise<void> {
  const isOverdue = product.daysUntilDeadline < 0;
  const urgency = isOverdue
    ? "overdue"
    : product.daysUntilDeadline <= 3
      ? "critical"
      : product.daysUntilDeadline <= 7
        ? "soon"
        : "upcoming";

  const notification: NotificationPayload = {
    id: `deadline-${product.id}-${Date.now()}`,
    type: "ORDER_DEADLINE",
    title: isOverdue
      ? "Order Deadline Overdue!"
      : `Order Deadline ${urgency === "critical" ? "Critical" : "Approaching"}`,
    message: isOverdue
      ? `${product.name} order deadline was ${Math.abs(product.daysUntilDeadline)} days ago!`
      : `${product.name} needs to be ordered within ${product.daysUntilDeadline} days`,
    severity:
      isOverdue || urgency === "critical"
        ? "error"
        : urgency === "soon"
          ? "warning"
          : "info",
    data: {
      productId: product.id,
      productCode: product.productId,
      clientId,
      daysUntilDeadline: product.daysUntilDeadline,
      orderByDate: product.orderByDate.toISOString(),
      stockoutDate: product.stockoutDate?.toISOString(),
      currentStockUnits: product.currentStockUnits,
      urgency,
    },
    createdAt: new Date(),
  };

  // Emit to client watchers
  emitToClient(clientId, SocketEvents.NOTIFICATION, notification);

  // Get users assigned to this client and notify them
  const userClients = await prisma.userClient.findMany({
    where: { clientId },
    include: { user: true },
  });

  for (const userClient of userClients) {
    emitToUser(userClient.userId, SocketEvents.NOTIFICATION, notification);
  }

  // Send email notifications for overdue or critical deadlines
  if (urgency === "overdue" || urgency === "critical") {
    // Get client name for email
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { name: true },
    });

    if (!client) return;

    const productData = {
      name: product.name,
      currentStock: product.currentStockUnits,
      daysUntilDeadline: product.daysUntilDeadline,
      orderByDate: product.orderByDate.toLocaleDateString(),
    };

    // Email account managers
    for (const uc of userClients) {
      const shouldSend = await notificationPrefService.shouldSendNotification(
        uc.user.id,
        "User",
        "order_deadline",
        "email",
      );

      if (shouldSend) {
        try {
          await emailService.sendOrderDeadlineAlert(
            uc.user.email,
            client.name,
            [productData],
          );
        } catch (error) {
          console.error(
            `Failed to send order deadline email to ${uc.user.email}:`,
            error,
          );
        }
      }
    }

    // Email portal users
    const portalUsers = await prisma.portalUser.findMany({
      where: { clientId, isActive: true },
      select: { id: true, email: true },
    });

    for (const pu of portalUsers) {
      const shouldSend = await notificationPrefService.shouldSendNotification(
        pu.id,
        "PortalUser",
        "order_deadline",
        "email",
      );

      if (shouldSend) {
        try {
          await emailService.sendOrderDeadlineAlert(pu.email, client.name, [
            productData,
          ]);
        } catch (error) {
          console.error(
            `Failed to send order deadline email to ${pu.email}:`,
            error,
          );
        }
      }
    }
  }
}

/**
 * Emit shipment status change notification
 */
export async function emitShipmentStatusChange(
  clientId: string,
  shipment: {
    id: string;
    trackingNumber: string;
    carrier: string;
    status: string;
    estimatedDelivery: Date | null;
  },
): Promise<void> {
  const statusMessages: Record<string, string> = {
    label_created: "Shipping label has been created",
    in_transit: "is now in transit",
    out_for_delivery: "is out for delivery",
    delivered: "has been delivered",
    exception: "has a delivery exception",
  };

  const notification: NotificationPayload = {
    id: `shipment-${shipment.id}-${Date.now()}`,
    type: "SHIPMENT_STATUS",
    title:
      shipment.status === "delivered"
        ? "Package Delivered!"
        : "Shipment Update",
    message: `${shipment.carrier.toUpperCase()} ${shipment.trackingNumber} ${statusMessages[shipment.status] || "status updated"}`,
    severity:
      shipment.status === "delivered"
        ? "success"
        : shipment.status === "exception"
          ? "error"
          : "info",
    data: {
      shipmentId: shipment.id,
      clientId,
      trackingNumber: shipment.trackingNumber,
      carrier: shipment.carrier,
      status: shipment.status,
      estimatedDelivery: shipment.estimatedDelivery?.toISOString(),
    },
    createdAt: new Date(),
  };

  // Emit to client
  emitToClient(clientId, SocketEvents.NOTIFICATION, notification);
}
