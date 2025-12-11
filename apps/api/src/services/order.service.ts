import { prisma } from '../lib/prisma.js';
import { transitionOrderStatus, getSlaStatus, type RequestStatus, type SlaStatus } from './workflow.service.js';
import { addHours } from 'date-fns';

// =============================================================================
// TYPES
// =============================================================================

export interface OrderItemInput {
  productId: string;
  quantityPacks: number;
  notes?: string;
}

export interface CreateOrderResult {
  success: boolean;
  orderRequest?: any;
  error?: string;
}

export interface OrderWithDetails {
  id: string;
  status: string;
  totalPacks: number | null;
  totalUnits: number | null;
  estimatedValue: number | null;
  notes: string | null;
  reviewNotes: string | null;
  slaStatus: SlaStatus;
  createdAt: Date;
  updatedAt: Date;
  submittedAt: Date | null;
  acknowledgedAt: Date | null;
  fulfilledAt: Date | null;
  externalOrderRef: string | null;
  location: {
    id: string;
    name: string;
    code: string;
  } | null;
  requestedBy: {
    id: string;
    name: string;
    email: string;
  };
  items: OrderItemWithProduct[];
  statusHistory: Array<{
    fromStatus: string;
    toStatus: string;
    changedByType: string;
    reason: string | null;
    createdAt: Date;
  }>;
}

export interface OrderItemWithProduct {
  id: string;
  quantityPacks: number;
  quantityUnits: number;
  snapshotMonthlyUsage: number | null;
  snapshotCalculationTier: string | null;
  snapshotStockLevel: number | null;
  snapshotWeeksRemaining: number | null;
  snapshotReorderPoint: number | null;
  snapshotSuggestedQty: number | null;
  notes: string | null;
  product: {
    id: string;
    productId: string;
    name: string;
    packSize: number;
    itemType: string;
    currentStockPacks: number;
    currentStockUnits: number;
    monthlyUsagePacks: number | null;
    usageCalculationTier: string | null;
    weeksRemaining: number | null;
    reorderPointPacks: number | null;
  };
}

// =============================================================================
// ORDER CREATION
// =============================================================================

/**
 * Create a new order request as a draft with proper OrderRequestItem relations
 * and snapshot data captured at time of order.
 */
export async function createOrderRequest(
  clientId: string,
  portalUserId: string,
  items: OrderItemInput[],
  options?: {
    notes?: string;
    locationId?: string;
    shippingAddress?: string;
  }
): Promise<CreateOrderResult> {
  if (!items || items.length === 0) {
    return { success: false, error: 'At least one item is required' };
  }

  // Validate all products belong to this client and get their data
  const productIds = items.map((item) => item.productId);
  const products = await prisma.product.findMany({
    where: {
      id: { in: productIds },
      clientId,
      isActive: true,
    },
    select: {
      id: true,
      productId: true,
      name: true,
      packSize: true,
      currentStockPacks: true,
      currentStockUnits: true,
      monthlyUsagePacks: true,
      monthlyUsageUnits: true,
      usageCalculationTier: true,
      weeksRemaining: true,
      reorderPointPacks: true,
    },
  });

  if (products.length !== productIds.length) {
    const foundIds = new Set(products.map((p) => p.id));
    const missingIds = productIds.filter((id) => !foundIds.has(id));
    return {
      success: false,
      error: `Products not found: ${missingIds.join(', ')}`,
    };
  }

  // Validate location if provided
  if (options?.locationId) {
    const location = await prisma.location.findFirst({
      where: {
        id: options.locationId,
        clientId,
        isActive: true,
      },
    });

    if (!location) {
      return { success: false, error: 'Location not found or inactive' };
    }
  }

  // Build product lookup map
  const productMap = new Map(products.map((p) => [p.id, p]));

  // Calculate totals and prepare order items
  let totalPacks = 0;
  let totalUnits = 0;

  const orderItemsData = items.map((item) => {
    const product = productMap.get(item.productId)!;
    const quantityUnits = item.quantityPacks * product.packSize;
    totalPacks += item.quantityPacks;
    totalUnits += quantityUnits;

    // Calculate suggested quantity based on usage and stock
    const suggestedQty = calculateSuggestedQuantity(product);

    return {
      productId: item.productId,
      quantityPacks: item.quantityPacks,
      quantityUnits,
      // Capture snapshot data at time of order
      snapshotMonthlyUsage: product.monthlyUsagePacks,
      snapshotCalculationTier: product.usageCalculationTier,
      snapshotStockLevel: product.currentStockPacks,
      snapshotWeeksRemaining: product.weeksRemaining,
      snapshotReorderPoint: product.reorderPointPacks,
      snapshotSuggestedQty: suggestedQty,
      notes: item.notes,
    };
  });

  // Create order request with items in a transaction
  const orderRequest = await prisma.$transaction(async (tx) => {
    const order = await tx.orderRequest.create({
      data: {
        clientId,
        requestedById: portalUserId,
        status: 'draft',
        locationId: options?.locationId,
        shippingAddress: options?.shippingAddress,
        notes: options?.notes,
        totalPacks,
        totalUnits,
        // Legacy items field for backwards compatibility
        items: items.map((item) => ({
          productId: item.productId,
          quantity: item.quantityPacks,
        })),
        // Create the proper OrderRequestItem relations
        orderRequestItems: {
          create: orderItemsData,
        },
      },
      include: {
        orderRequestItems: {
          include: {
            product: {
              select: {
                id: true,
                productId: true,
                name: true,
                packSize: true,
              },
            },
          },
        },
        location: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        requestedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return order;
  });

  return { success: true, orderRequest };
}

/**
 * Submit a draft order (changes status from draft to submitted)
 */
export async function submitOrder(
  orderRequestId: string,
  portalUserId: string
): Promise<CreateOrderResult> {
  // Verify the order exists and belongs to this user or their client
  const order = await prisma.orderRequest.findUnique({
    where: { id: orderRequestId },
    include: {
      requestedBy: true,
      orderRequestItems: true,
    },
  });

  if (!order) {
    return { success: false, error: 'Order not found' };
  }

  if (order.status !== 'draft') {
    return { success: false, error: 'Only draft orders can be submitted' };
  }

  if (order.orderRequestItems.length === 0) {
    return { success: false, error: 'Cannot submit an order with no items' };
  }

  // Use workflow service to transition status
  const result = await transitionOrderStatus(
    orderRequestId,
    'submitted',
    portalUserId,
    'portal_user'
  );

  return result;
}

/**
 * Add item to existing draft order
 */
export async function addItemToOrder(
  orderRequestId: string,
  clientId: string,
  item: OrderItemInput
): Promise<CreateOrderResult> {
  const order = await prisma.orderRequest.findFirst({
    where: { id: orderRequestId, clientId, status: 'draft' },
  });

  if (!order) {
    return { success: false, error: 'Order not found or not in draft status' };
  }

  // Get product data
  const product = await prisma.product.findFirst({
    where: { id: item.productId, clientId, isActive: true },
  });

  if (!product) {
    return { success: false, error: 'Product not found' };
  }

  // Check if item already exists in order
  const existingItem = await prisma.orderRequestItem.findFirst({
    where: { orderRequestId, productId: item.productId },
  });

  if (existingItem) {
    // Update existing item quantity
    const newQuantityPacks = existingItem.quantityPacks + item.quantityPacks;
    const newQuantityUnits = newQuantityPacks * product.packSize;

    await prisma.orderRequestItem.update({
      where: { id: existingItem.id },
      data: {
        quantityPacks: newQuantityPacks,
        quantityUnits: newQuantityUnits,
        notes: item.notes || existingItem.notes,
      },
    });
  } else {
    // Create new item
    const suggestedQty = calculateSuggestedQuantity(product);

    await prisma.orderRequestItem.create({
      data: {
        orderRequestId,
        productId: item.productId,
        quantityPacks: item.quantityPacks,
        quantityUnits: item.quantityPacks * product.packSize,
        snapshotMonthlyUsage: product.monthlyUsagePacks,
        snapshotCalculationTier: product.usageCalculationTier,
        snapshotStockLevel: product.currentStockPacks,
        snapshotWeeksRemaining: product.weeksRemaining,
        snapshotReorderPoint: product.reorderPointPacks,
        snapshotSuggestedQty: suggestedQty,
        notes: item.notes,
      },
    });
  }

  // Recalculate totals
  await recalculateOrderTotals(orderRequestId);

  // Get updated order
  const updatedOrder = await prisma.orderRequest.findUnique({
    where: { id: orderRequestId },
    include: {
      orderRequestItems: {
        include: {
          product: {
            select: {
              id: true,
              productId: true,
              name: true,
              packSize: true,
            },
          },
        },
      },
    },
  });

  return { success: true, orderRequest: updatedOrder };
}

/**
 * Update item quantity in draft order
 */
export async function updateOrderItem(
  orderRequestId: string,
  itemId: string,
  quantityPacks: number,
  notes?: string
): Promise<CreateOrderResult> {
  const item = await prisma.orderRequestItem.findFirst({
    where: { id: itemId, orderRequestId },
    include: { product: true, orderRequest: true },
  });

  if (!item) {
    return { success: false, error: 'Item not found' };
  }

  if (item.orderRequest.status !== 'draft') {
    return { success: false, error: 'Can only update items in draft orders' };
  }

  if (quantityPacks <= 0) {
    // Remove item if quantity is zero or negative
    await prisma.orderRequestItem.delete({ where: { id: itemId } });
  } else {
    await prisma.orderRequestItem.update({
      where: { id: itemId },
      data: {
        quantityPacks,
        quantityUnits: quantityPacks * item.product.packSize,
        ...(notes !== undefined && { notes }),
      },
    });
  }

  // Recalculate totals
  await recalculateOrderTotals(orderRequestId);

  const updatedOrder = await prisma.orderRequest.findUnique({
    where: { id: orderRequestId },
    include: {
      orderRequestItems: {
        include: {
          product: {
            select: {
              id: true,
              productId: true,
              name: true,
              packSize: true,
            },
          },
        },
      },
    },
  });

  return { success: true, orderRequest: updatedOrder };
}

/**
 * Remove item from draft order
 */
export async function removeOrderItem(
  orderRequestId: string,
  itemId: string
): Promise<CreateOrderResult> {
  const item = await prisma.orderRequestItem.findFirst({
    where: { id: itemId, orderRequestId },
    include: { orderRequest: true },
  });

  if (!item) {
    return { success: false, error: 'Item not found' };
  }

  if (item.orderRequest.status !== 'draft') {
    return { success: false, error: 'Can only remove items from draft orders' };
  }

  await prisma.orderRequestItem.delete({ where: { id: itemId } });

  // Recalculate totals
  await recalculateOrderTotals(orderRequestId);

  const updatedOrder = await prisma.orderRequest.findUnique({
    where: { id: orderRequestId },
    include: {
      orderRequestItems: {
        include: {
          product: {
            select: {
              id: true,
              productId: true,
              name: true,
              packSize: true,
            },
          },
        },
      },
    },
  });

  return { success: true, orderRequest: updatedOrder };
}

// =============================================================================
// ORDER RETRIEVAL
// =============================================================================

/**
 * Get order with full details including items, SLA status, and history
 */
export async function getOrderWithDetails(
  orderRequestId: string,
  clientId?: string
): Promise<OrderWithDetails | null> {
  const where: any = { id: orderRequestId };
  if (clientId) {
    where.clientId = clientId;
  }

  const order = await prisma.orderRequest.findFirst({
    where,
    include: {
      location: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      requestedBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      orderRequestItems: {
        include: {
          product: {
            select: {
              id: true,
              productId: true,
              name: true,
              packSize: true,
              itemType: true,
              currentStockPacks: true,
              currentStockUnits: true,
              monthlyUsagePacks: true,
              usageCalculationTier: true,
              weeksRemaining: true,
              reorderPointPacks: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
      statusHistory: {
        select: {
          fromStatus: true,
          toStatus: true,
          changedByType: true,
          reason: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      },
    },
  });

  if (!order) {
    return null;
  }

  // Calculate SLA status
  const slaStatus = getSlaStatus({
    slaDeadline: order.slaDeadline,
    slaBreached: order.slaBreached,
    status: order.status,
  });

  return {
    id: order.id,
    status: order.status,
    totalPacks: order.totalPacks,
    totalUnits: order.totalUnits,
    estimatedValue: order.estimatedValue ? Number(order.estimatedValue) : null,
    notes: order.notes,
    reviewNotes: order.reviewNotes,
    slaStatus,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    submittedAt: order.submittedAt,
    acknowledgedAt: order.acknowledgedAt,
    fulfilledAt: order.fulfilledAt,
    externalOrderRef: order.externalOrderRef,
    location: order.location,
    requestedBy: order.requestedBy,
    items: order.orderRequestItems.map((item) => ({
      id: item.id,
      quantityPacks: item.quantityPacks,
      quantityUnits: item.quantityUnits,
      snapshotMonthlyUsage: item.snapshotMonthlyUsage,
      snapshotCalculationTier: item.snapshotCalculationTier,
      snapshotStockLevel: item.snapshotStockLevel,
      snapshotWeeksRemaining: item.snapshotWeeksRemaining,
      snapshotReorderPoint: item.snapshotReorderPoint,
      snapshotSuggestedQty: item.snapshotSuggestedQty,
      notes: item.notes,
      product: item.product,
    })),
    statusHistory: order.statusHistory,
  };
}

/**
 * Get active/draft order for a portal user (cart)
 */
export async function getActiveCart(
  clientId: string,
  portalUserId: string
): Promise<any | null> {
  const cart = await prisma.orderRequest.findFirst({
    where: {
      clientId,
      requestedById: portalUserId,
      status: 'draft',
    },
    include: {
      orderRequestItems: {
        include: {
          product: {
            select: {
              id: true,
              productId: true,
              name: true,
              packSize: true,
              itemType: true,
              currentStockPacks: true,
              monthlyUsagePacks: true,
              usageCalculationTier: true,
              weeksRemaining: true,
              reorderPointPacks: true,
            },
          },
        },
      },
      location: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return cart;
}

/**
 * Get or create active cart for portal user
 */
export async function getOrCreateCart(
  clientId: string,
  portalUserId: string,
  locationId?: string
): Promise<any> {
  const existingCart = await getActiveCart(clientId, portalUserId);

  if (existingCart) {
    return existingCart;
  }

  // Create new cart
  const cart = await prisma.orderRequest.create({
    data: {
      clientId,
      requestedById: portalUserId,
      status: 'draft',
      locationId,
      items: [],
    },
    include: {
      orderRequestItems: {
        include: {
          product: true,
        },
      },
      location: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
    },
  });

  return cart;
}

// =============================================================================
// SUGGESTED QUANTITIES
// =============================================================================

/**
 * Get suggested order quantities for products based on usage and stock
 */
export async function getSuggestedOrderQuantities(
  clientId: string,
  productIds?: string[]
): Promise<
  Array<{
    productId: string;
    productName: string;
    suggestedPacks: number;
    currentStock: number;
    monthlyUsage: number | null;
    weeksRemaining: number | null;
    urgency: 'critical' | 'high' | 'medium' | 'low';
  }>
> {
  const where: any = {
    clientId,
    isActive: true,
  };

  if (productIds && productIds.length > 0) {
    where.id = { in: productIds };
  } else {
    // Only get products that need reordering
    where.OR = [
      { stockStatus: { in: ['critical', 'stockout', 'low'] } },
      {
        weeksRemaining: { lt: 4 },
      },
    ];
  }

  const products = await prisma.product.findMany({
    where,
    select: {
      id: true,
      name: true,
      packSize: true,
      currentStockPacks: true,
      currentStockUnits: true,
      monthlyUsagePacks: true,
      monthlyUsageUnits: true,
      usageCalculationTier: true,
      weeksRemaining: true,
      reorderPointPacks: true,
      stockStatus: true,
    },
    orderBy: [{ stockStatus: 'asc' }, { weeksRemaining: 'asc' }],
  });

  return products.map((product) => {
    const suggestedPacks = calculateSuggestedQuantity(product);
    const urgency = getUrgencyLevel(product);

    return {
      productId: product.id,
      productName: product.name,
      suggestedPacks,
      currentStock: product.currentStockPacks,
      monthlyUsage: product.monthlyUsagePacks,
      weeksRemaining: product.weeksRemaining,
      urgency,
    };
  });
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Calculate suggested order quantity based on usage data
 */
function calculateSuggestedQuantity(product: {
  monthlyUsagePacks?: number | null;
  monthlyUsageUnits?: number | null;
  currentStockPacks?: number;
  reorderPointPacks?: number | null;
  weeksRemaining?: number | null;
  packSize?: number;
}): number {
  // If no usage data, suggest minimum order
  if (!product.monthlyUsagePacks || product.monthlyUsagePacks <= 0) {
    return 1;
  }

  // Target: 8 weeks of stock (2 months)
  const targetWeeks = 8;
  const weeklyUsage = product.monthlyUsagePacks / 4;
  const targetStock = weeklyUsage * targetWeeks;

  const currentStock = product.currentStockPacks || 0;
  const neededPacks = Math.ceil(targetStock - currentStock);

  // Minimum 1 pack, maximum reasonable order
  return Math.max(1, Math.min(neededPacks, 100));
}

/**
 * Determine urgency level based on stock status
 */
function getUrgencyLevel(product: {
  stockStatus?: string | null;
  weeksRemaining?: number | null;
}): 'critical' | 'high' | 'medium' | 'low' {
  if (product.stockStatus === 'stockout' || product.stockStatus === 'critical') {
    return 'critical';
  }

  if (product.stockStatus === 'low' || (product.weeksRemaining && product.weeksRemaining <= 2)) {
    return 'high';
  }

  if (product.weeksRemaining && product.weeksRemaining <= 4) {
    return 'medium';
  }

  return 'low';
}

/**
 * Recalculate order totals from items
 */
async function recalculateOrderTotals(orderRequestId: string): Promise<void> {
  const items = await prisma.orderRequestItem.findMany({
    where: { orderRequestId },
    select: {
      quantityPacks: true,
      quantityUnits: true,
    },
  });

  const totalPacks = items.reduce((sum, item) => sum + item.quantityPacks, 0);
  const totalUnits = items.reduce((sum, item) => sum + item.quantityUnits, 0);

  // Update legacy items field as well for backwards compatibility
  const itemsJson = await prisma.orderRequestItem.findMany({
    where: { orderRequestId },
    select: {
      productId: true,
      quantityPacks: true,
    },
  });

  await prisma.orderRequest.update({
    where: { id: orderRequestId },
    data: {
      totalPacks,
      totalUnits,
      items: itemsJson.map((i) => ({
        productId: i.productId,
        quantity: i.quantityPacks,
      })),
    },
  });
}
