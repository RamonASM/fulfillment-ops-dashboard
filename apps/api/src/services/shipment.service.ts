// =============================================================================
// SHIPMENT SERVICE
// CRUD operations, status management, and tracking URL generation
// =============================================================================

import { prisma } from "../lib/prisma.js";
import type {
  Shipment,
  ShipmentEvent,
  ShipmentItem,
  Prisma,
} from "@prisma/client";

// =============================================================================
// TYPES
// =============================================================================

export type ShipmentStatus =
  | "pending"
  | "label_created"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "exception";

export type CarrierType = "ups" | "fedex" | "usps" | "dhl" | "other";

export interface CreateShipmentInput {
  orderRequestId: string;
  clientId: string;
  carrier: CarrierType;
  carrierName?: string;
  trackingNumber: string;
  status?: ShipmentStatus;
  shippedAt?: Date;
  estimatedDelivery?: Date;
  destinationCity?: string;
  destinationState?: string;
  packageCount?: number;
  serviceLevel?: string;
  createdBy?: string;
  items?: CreateShipmentItemInput[];
}

export interface CreateShipmentItemInput {
  productId: string;
  orderItemId?: string;
  quantityPacks: number;
  quantityUnits: number;
}

export interface UpdateShipmentInput {
  carrier?: CarrierType;
  carrierName?: string;
  trackingNumber?: string;
  status?: ShipmentStatus;
  shippedAt?: Date;
  estimatedDelivery?: Date;
  deliveredAt?: Date;
  destinationCity?: string;
  destinationState?: string;
  packageCount?: number;
  serviceLevel?: string;
  exceptionReason?: string;
}

export interface ShipmentEventInput {
  status: string;
  description: string;
  location?: string;
  eventTime?: Date;
}

export interface ShipmentWithDetails extends Shipment {
  trackingEvents?: ShipmentEvent[];
  shipmentItems?: (ShipmentItem & {
    product?: { name: string; productId: string };
  })[];
  orderRequest?: { id: string; status: string };
}

// =============================================================================
// CARRIER TRACKING URLs
// =============================================================================

const CARRIER_TRACKING_URLS: Record<
  CarrierType,
  (trackingNumber: string) => string
> = {
  ups: (tn) => `https://www.ups.com/track?tracknum=${tn}`,
  fedex: (tn) => `https://www.fedex.com/fedextrack/?trknbr=${tn}`,
  usps: (tn) => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${tn}`,
  dhl: (tn) => `https://www.dhl.com/en/express/tracking.html?AWB=${tn}`,
  other: () => "",
};

/**
 * Generate tracking URL for a carrier
 */
export function generateTrackingUrl(
  carrier: CarrierType,
  trackingNumber: string,
): string {
  const generator = CARRIER_TRACKING_URLS[carrier];
  return generator ? generator(trackingNumber) : "";
}

// =============================================================================
// SHIPMENT CRUD OPERATIONS
// =============================================================================

/**
 * Create a new shipment
 */
export async function createShipment(
  data: CreateShipmentInput,
): Promise<ShipmentWithDetails> {
  const trackingUrl = generateTrackingUrl(
    data.carrier as CarrierType,
    data.trackingNumber,
  );

  const shipment = await prisma.shipment.create({
    data: {
      orderRequestId: data.orderRequestId,
      clientId: data.clientId,
      carrier: data.carrier,
      carrierName: data.carrierName,
      trackingNumber: data.trackingNumber,
      trackingUrl: trackingUrl || data.carrierName ? undefined : trackingUrl,
      status: data.status || "pending",
      shippedAt: data.shippedAt,
      estimatedDelivery: data.estimatedDelivery,
      destinationCity: data.destinationCity,
      destinationState: data.destinationState,
      packageCount: data.packageCount || 1,
      serviceLevel: data.serviceLevel,
      createdBy: data.createdBy,
      shipmentItems: data.items
        ? {
            create: data.items.map((item) => ({
              productId: item.productId,
              orderItemId: item.orderItemId,
              quantityPacks: item.quantityPacks,
              quantityUnits: item.quantityUnits,
            })),
          }
        : undefined,
      trackingEvents: {
        create: {
          status: data.status || "pending",
          description: "Shipment created",
          eventTime: new Date(),
        },
      },
    },
    include: {
      trackingEvents: {
        orderBy: { eventTime: "desc" },
      },
      shipmentItems: {
        include: {
          product: {
            select: { name: true, productId: true },
          },
        },
      },
    },
  });

  // Recalculate tracking URL if not set
  if (!shipment.trackingUrl && trackingUrl) {
    await prisma.shipment.update({
      where: { id: shipment.id },
      data: { trackingUrl },
    });
    shipment.trackingUrl = trackingUrl;
  }

  return shipment;
}

/**
 * Update shipment details
 */
export async function updateShipment(
  shipmentId: string,
  data: UpdateShipmentInput,
): Promise<ShipmentWithDetails> {
  // Regenerate tracking URL if carrier or tracking number changes
  let trackingUrl: string | undefined;
  if (data.carrier || data.trackingNumber) {
    const existing = await prisma.shipment.findUnique({
      where: { id: shipmentId },
      select: { carrier: true, trackingNumber: true },
    });
    if (existing) {
      const carrier = (data.carrier || existing.carrier) as CarrierType;
      const trackingNumber = data.trackingNumber || existing.trackingNumber;
      trackingUrl = generateTrackingUrl(carrier, trackingNumber);
    }
  }

  const shipment = await prisma.shipment.update({
    where: { id: shipmentId },
    data: {
      ...data,
      trackingUrl: trackingUrl || undefined,
    },
    include: {
      trackingEvents: {
        orderBy: { eventTime: "desc" },
      },
      shipmentItems: {
        include: {
          product: {
            select: { name: true, productId: true },
          },
        },
      },
    },
  });

  return shipment;
}

/**
 * Update shipment status with event tracking
 */
export async function updateShipmentStatus(
  shipmentId: string,
  status: ShipmentStatus,
  event?: ShipmentEventInput,
): Promise<ShipmentWithDetails> {
  const updateData: Prisma.ShipmentUpdateInput = { status };

  // Set delivered timestamp if status is delivered
  if (status === "delivered") {
    updateData.deliveredAt = new Date();
  }

  // Add tracking event
  const eventData: Prisma.ShipmentEventCreateWithoutShipmentInput = {
    status: event?.status || status,
    description: event?.description || getDefaultStatusDescription(status),
    location: event?.location,
    eventTime: event?.eventTime || new Date(),
  };

  const shipment = await prisma.shipment.update({
    where: { id: shipmentId },
    data: {
      ...updateData,
      trackingEvents: {
        create: eventData,
      },
    },
    include: {
      trackingEvents: {
        orderBy: { eventTime: "desc" },
      },
      shipmentItems: {
        include: {
          product: {
            select: { name: true, productId: true },
          },
        },
      },
    },
  });

  // Check if order should be marked as delivery breached
  if (status === "delivered") {
    await checkDeliveryDeadline(shipmentId);
  }

  return shipment;
}

/**
 * Get default description for a status
 */
function getDefaultStatusDescription(status: ShipmentStatus): string {
  const descriptions: Record<ShipmentStatus, string> = {
    pending: "Shipment created, awaiting pickup",
    label_created: "Shipping label has been created",
    in_transit: "Package is in transit",
    out_for_delivery: "Package is out for delivery",
    delivered: "Package has been delivered",
    exception: "Delivery exception occurred",
  };
  return descriptions[status] || "Status updated";
}

/**
 * Check if delivery was breached when shipment is delivered
 */
async function checkDeliveryDeadline(shipmentId: string): Promise<void> {
  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    select: {
      deliveredAt: true,
      orderRequest: {
        select: {
          id: true,
          deliveryDeadline: true,
        },
      },
    },
  });

  if (shipment?.orderRequest?.deliveryDeadline && shipment.deliveredAt) {
    const deadline = new Date(shipment.orderRequest.deliveryDeadline);
    const delivered = new Date(shipment.deliveredAt);

    if (delivered > deadline) {
      await prisma.orderRequest.update({
        where: { id: shipment.orderRequest.id },
        data: { deliveryBreached: true },
      });
    }
  }
}

/**
 * Delete a shipment
 */
export async function deleteShipment(shipmentId: string): Promise<void> {
  await prisma.shipment.delete({
    where: { id: shipmentId },
  });
}

/**
 * Get shipment by ID with all details
 */
export async function getShipmentById(
  shipmentId: string,
): Promise<ShipmentWithDetails | null> {
  return prisma.shipment.findUnique({
    where: { id: shipmentId },
    include: {
      trackingEvents: {
        orderBy: { eventTime: "desc" },
      },
      shipmentItems: {
        include: {
          product: {
            select: { name: true, productId: true },
          },
        },
      },
      orderRequest: {
        select: { id: true, status: true },
      },
    },
  });
}

/**
 * Get shipments for an order
 */
export async function getShipmentsByOrder(
  orderRequestId: string,
): Promise<ShipmentWithDetails[]> {
  return prisma.shipment.findMany({
    where: { orderRequestId },
    include: {
      trackingEvents: {
        orderBy: { eventTime: "desc" },
      },
      shipmentItems: {
        include: {
          product: {
            select: { name: true, productId: true },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Get shipments for a client
 */
export async function getShipmentsByClient(
  clientId: string,
  options?: {
    status?: ShipmentStatus | ShipmentStatus[];
    limit?: number;
    offset?: number;
  },
): Promise<{ shipments: ShipmentWithDetails[]; total: number }> {
  const where: Prisma.ShipmentWhereInput = { clientId };

  if (options?.status) {
    where.status = Array.isArray(options.status)
      ? { in: options.status }
      : options.status;
  }

  const [shipments, total] = await Promise.all([
    prisma.shipment.findMany({
      where,
      include: {
        trackingEvents: {
          orderBy: { eventTime: "desc" },
          take: 5, // Limit events for list view
        },
        shipmentItems: {
          include: {
            product: {
              select: { name: true, productId: true },
            },
          },
        },
        orderRequest: {
          select: { id: true, status: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: options?.limit,
      skip: options?.offset,
    }),
    prisma.shipment.count({ where }),
  ]);

  return { shipments, total };
}

/**
 * Get active (in-transit) shipments for a client
 */
export async function getActiveShipments(
  clientId: string,
): Promise<ShipmentWithDetails[]> {
  return prisma.shipment.findMany({
    where: {
      clientId,
      status: {
        in: ["pending", "label_created", "in_transit", "out_for_delivery"],
      },
    },
    include: {
      trackingEvents: {
        orderBy: { eventTime: "desc" },
        take: 1,
      },
      shipmentItems: {
        include: {
          product: {
            select: { name: true, productId: true },
          },
        },
      },
    },
    orderBy: [{ estimatedDelivery: "asc" }, { createdAt: "desc" }],
  });
}

/**
 * Add items to an existing shipment
 */
export async function addShipmentItems(
  shipmentId: string,
  items: CreateShipmentItemInput[],
): Promise<ShipmentItem[]> {
  const created = await prisma.shipmentItem.createMany({
    data: items.map((item) => ({
      shipmentId,
      productId: item.productId,
      orderItemId: item.orderItemId,
      quantityPacks: item.quantityPacks,
      quantityUnits: item.quantityUnits,
    })),
  });

  return prisma.shipmentItem.findMany({
    where: { shipmentId },
    include: {
      product: {
        select: { name: true, productId: true },
      },
    },
  });
}

/**
 * Add a tracking event to a shipment
 */
export async function addTrackingEvent(
  shipmentId: string,
  event: ShipmentEventInput,
): Promise<ShipmentEvent> {
  return prisma.shipmentEvent.create({
    data: {
      shipmentId,
      status: event.status,
      description: event.description,
      location: event.location,
      eventTime: event.eventTime || new Date(),
    },
  });
}

/**
 * Get tracking events for a shipment
 */
export async function getTrackingEvents(
  shipmentId: string,
): Promise<ShipmentEvent[]> {
  return prisma.shipmentEvent.findMany({
    where: { shipmentId },
    orderBy: { eventTime: "desc" },
  });
}

// =============================================================================
// STATISTICS & ANALYTICS
// =============================================================================

/**
 * Get shipment statistics for a client
 */
export async function getShipmentStats(clientId: string): Promise<{
  total: number;
  pending: number;
  inTransit: number;
  delivered: number;
  exceptions: number;
  avgDeliveryDays: number | null;
}> {
  const [counts, deliveryTimes] = await Promise.all([
    prisma.shipment.groupBy({
      by: ["status"],
      where: { clientId },
      _count: true,
    }),
    prisma.shipment.findMany({
      where: {
        clientId,
        status: "delivered",
        shippedAt: { not: null },
        deliveredAt: { not: null },
      },
      select: {
        shippedAt: true,
        deliveredAt: true,
      },
      take: 100, // Sample recent deliveries
      orderBy: { deliveredAt: "desc" },
    }),
  ]);

  const statusCounts = counts.reduce(
    (acc, c) => ({ ...acc, [c.status]: c._count }),
    {} as Record<string, number>,
  );

  // Calculate average delivery time
  let avgDeliveryDays: number | null = null;
  if (deliveryTimes.length > 0) {
    const totalDays = deliveryTimes.reduce((sum, s) => {
      if (s.shippedAt && s.deliveredAt) {
        const days =
          (s.deliveredAt.getTime() - s.shippedAt.getTime()) /
          (1000 * 60 * 60 * 24);
        return sum + days;
      }
      return sum;
    }, 0);
    avgDeliveryDays = Math.round((totalDays / deliveryTimes.length) * 10) / 10;
  }

  return {
    total: Object.values(statusCounts).reduce((sum, count) => sum + count, 0),
    pending:
      (statusCounts["pending"] || 0) + (statusCounts["label_created"] || 0),
    inTransit:
      (statusCounts["in_transit"] || 0) +
      (statusCounts["out_for_delivery"] || 0),
    delivered: statusCounts["delivered"] || 0,
    exceptions: statusCounts["exception"] || 0,
    avgDeliveryDays,
  };
}

export default {
  createShipment,
  updateShipment,
  updateShipmentStatus,
  deleteShipment,
  getShipmentById,
  getShipmentsByOrder,
  getShipmentsByClient,
  getActiveShipments,
  addShipmentItems,
  addTrackingEvent,
  getTrackingEvents,
  getShipmentStats,
  generateTrackingUrl,
};
