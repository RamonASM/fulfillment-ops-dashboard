import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { portalAuth } from '../../middleware/portal-auth.js';
import { logger } from '../../lib/logger.js';
import {
  createOrderRequest,
  submitOrder,
  addItemToOrder,
  updateOrderItem,
  removeOrderItem,
  getOrderWithDetails,
  getActiveCart,
  getOrCreateCart,
  getSuggestedOrderQuantities,
} from '../../services/order.service.js';
import {
  getStatusDisplay,
  getSlaStatus,
  getStatusHistory,
} from '../../services/workflow.service.js';
import { sendOrderRequestNotification } from '../../services/email.service.js';

const router = Router();

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const createOrderSchema = z.object({
  items: z.array(
    z.object({
      productId: z.string().uuid(),
      quantityPacks: z.number().int().positive(),
      notes: z.string().optional(),
    })
  ).min(1, 'At least one item is required'),
  notes: z.string().optional(),
  locationId: z.string().uuid().optional(),
  shippingAddress: z.string().optional(),
});

const addItemSchema = z.object({
  productId: z.string().uuid(),
  quantityPacks: z.number().int().positive(),
  notes: z.string().optional(),
});

const updateItemSchema = z.object({
  quantityPacks: z.number().int().min(0),
  notes: z.string().optional(),
});

// =============================================================================
// ORDER LISTING
// =============================================================================

/**
 * GET /api/portal/orders
 * List all order requests for the portal user's client
 */
router.get('/', portalAuth, async (req: Request, res: Response) => {
  try {
    const clientId = req.portalUser!.clientId;
    const { status, limit = '20', page = '1' } = req.query;

    const where: any = { clientId };

    // Filter out drafts by default (show only submitted orders)
    if (status) {
      where.status = status;
    } else {
      where.status = { not: 'draft' };
    }

    const take = Math.min(parseInt(limit as string) || 20, 100);
    const skip = (parseInt(page as string) - 1) * take;

    const [orders, total] = await Promise.all([
      prisma.orderRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
        include: {
          requestedBy: {
            select: {
              name: true,
              email: true,
            },
          },
          location: {
            select: {
              id: true,
              name: true,
              code: true,
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
                },
              },
            },
          },
        },
      }),
      prisma.orderRequest.count({ where }),
    ]);

    // Calculate status counts
    const statusCountsResult = await prisma.orderRequest.groupBy({
      by: ['status'],
      where: { clientId, status: { not: 'draft' } },
      _count: true,
    });

    const statusCounts = statusCountsResult.reduce((acc, item) => {
      acc[item.status] = item._count;
      return acc;
    }, {} as Record<string, number>);

    // Transform orders with SLA status and display info
    const ordersWithDetails = orders.map((order) => {
      const slaStatus = getSlaStatus({
        slaDeadline: order.slaDeadline,
        slaBreached: order.slaBreached,
        status: order.status,
      });

      const statusDisplay = getStatusDisplay(order.status as any);

      return {
        id: order.id,
        status: order.status,
        statusDisplay,
        slaStatus,
        totalPacks: order.totalPacks,
        totalUnits: order.totalUnits,
        itemCount: order.orderRequestItems.length,
        items: order.orderRequestItems.map((item) => ({
          id: item.id,
          productId: item.product.id,
          productName: item.product.name,
          productCode: item.product.productId,
          quantityPacks: item.quantityPacks,
          quantityUnits: item.quantityUnits,
        })),
        location: order.location,
        notes: order.notes,
        externalOrderRef: order.externalOrderRef,
        createdAt: order.createdAt,
        submittedAt: order.submittedAt,
        acknowledgedAt: order.acknowledgedAt,
        fulfilledAt: order.fulfilledAt,
        requestedBy: order.requestedBy?.name,
      };
    });

    res.json({
      data: ordersWithDetails,
      meta: {
        total,
        page: parseInt(page as string),
        limit: take,
        totalPages: Math.ceil(total / take),
        statusCounts,
      },
    });
  } catch (error) {
    logger.error('Portal orders list error', error instanceof Error ? error : null);
    res.status(500).json({ message: 'Failed to load orders' });
  }
});

// =============================================================================
// CART (DRAFT ORDER) MANAGEMENT
// =============================================================================

/**
 * GET /api/portal/orders/cart
 * Get or create the active cart (draft order) for the portal user
 */
router.get('/cart', portalAuth, async (req: Request, res: Response) => {
  try {
    const clientId = req.portalUser!.clientId;
    const portalUserId = req.portalUser!.id;

    let cart = await getActiveCart(clientId, portalUserId);

    if (!cart) {
      // Return empty cart structure
      return res.json({
        id: null,
        items: [],
        itemCount: 0,
        totalPacks: 0,
        totalUnits: 0,
        location: null,
      });
    }

    res.json({
      id: cart.id,
      items: cart.orderRequestItems.map((item: any) => ({
        id: item.id,
        productId: item.product.id,
        productCode: item.product.productId,
        productName: item.product.name,
        packSize: item.product.packSize,
        itemType: item.product.itemType,
        quantityPacks: item.quantityPacks,
        quantityUnits: item.quantityUnits,
        currentStock: item.product.currentStockPacks,
        monthlyUsage: item.product.monthlyUsagePacks,
        usageTier: item.product.usageCalculationTier,
        weeksRemaining: item.product.weeksRemaining,
        snapshotSuggestedQty: item.snapshotSuggestedQty,
        notes: item.notes,
      })),
      itemCount: cart.orderRequestItems.length,
      totalPacks: cart.totalPacks || 0,
      totalUnits: cart.totalUnits || 0,
      location: cart.location,
      notes: cart.notes,
    });
  } catch (error) {
    logger.error('Portal cart error', error instanceof Error ? error : null);
    res.status(500).json({ message: 'Failed to load cart' });
  }
});

/**
 * POST /api/portal/orders/cart/items
 * Add item to cart (creates cart if needed)
 */
router.post('/cart/items', portalAuth, async (req: Request, res: Response) => {
  try {
    const clientId = req.portalUser!.clientId;
    const portalUserId = req.portalUser!.id;
    const userRole = req.portalUser!.role;

    // Check permission
    if (userRole === 'viewer') {
      return res.status(403).json({ message: 'You do not have permission to add items to cart' });
    }

    const data = addItemSchema.parse(req.body);

    // Get or create cart
    let cart = await getActiveCart(clientId, portalUserId);

    if (!cart) {
      // Create new cart with item
      const result = await createOrderRequest(clientId, portalUserId, [data]);

      if (!result.success) {
        return res.status(400).json({ message: result.error });
      }

      return res.status(201).json({
        message: 'Item added to cart',
        cartId: result.orderRequest.id,
        item: result.orderRequest.orderRequestItems[0],
      });
    }

    // Add item to existing cart
    const result = await addItemToOrder(cart.id, clientId, data);

    if (!result.success) {
      return res.status(400).json({ message: result.error });
    }

    res.json({
      message: 'Item added to cart',
      cartId: cart.id,
      totalItems: result.orderRequest.orderRequestItems.length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Invalid request data', errors: error.errors });
    }
    logger.error('Portal add to cart error', error instanceof Error ? error : null);
    res.status(500).json({ message: 'Failed to add item to cart' });
  }
});

/**
 * PATCH /api/portal/orders/cart/items/:itemId
 * Update item quantity in cart
 */
router.patch('/cart/items/:itemId', portalAuth, async (req: Request, res: Response) => {
  try {
    const clientId = req.portalUser!.clientId;
    const portalUserId = req.portalUser!.id;
    const { itemId } = req.params;

    const data = updateItemSchema.parse(req.body);

    // Get cart
    const cart = await getActiveCart(clientId, portalUserId);

    if (!cart) {
      return res.status(404).json({ message: 'Cart not found' });
    }

    const result = await updateOrderItem(cart.id, itemId, data.quantityPacks, data.notes);

    if (!result.success) {
      return res.status(400).json({ message: result.error });
    }

    res.json({
      message: data.quantityPacks === 0 ? 'Item removed from cart' : 'Item updated',
      totalItems: result.orderRequest.orderRequestItems.length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Invalid request data', errors: error.errors });
    }
    logger.error('Portal update cart item error', error instanceof Error ? error : null);
    res.status(500).json({ message: 'Failed to update cart item' });
  }
});

/**
 * DELETE /api/portal/orders/cart/items/:itemId
 * Remove item from cart
 */
router.delete('/cart/items/:itemId', portalAuth, async (req: Request, res: Response) => {
  try {
    const clientId = req.portalUser!.clientId;
    const portalUserId = req.portalUser!.id;
    const { itemId } = req.params;

    const cart = await getActiveCart(clientId, portalUserId);

    if (!cart) {
      return res.status(404).json({ message: 'Cart not found' });
    }

    const result = await removeOrderItem(cart.id, itemId);

    if (!result.success) {
      return res.status(400).json({ message: result.error });
    }

    res.json({
      message: 'Item removed from cart',
      totalItems: result.orderRequest.orderRequestItems.length,
    });
  } catch (error) {
    logger.error('Portal remove cart item error', error instanceof Error ? error : null);
    res.status(500).json({ message: 'Failed to remove item from cart' });
  }
});

/**
 * DELETE /api/portal/orders/cart
 * Clear entire cart
 */
router.delete('/cart', portalAuth, async (req: Request, res: Response) => {
  try {
    const clientId = req.portalUser!.clientId;
    const portalUserId = req.portalUser!.id;

    const cart = await getActiveCart(clientId, portalUserId);

    if (!cart) {
      return res.json({ message: 'Cart already empty' });
    }

    // Delete the draft order entirely
    await prisma.orderRequest.delete({
      where: { id: cart.id },
    });

    res.json({ message: 'Cart cleared' });
  } catch (error) {
    logger.error('Portal clear cart error', error instanceof Error ? error : null);
    res.status(500).json({ message: 'Failed to clear cart' });
  }
});

// =============================================================================
// ORDER CREATION & SUBMISSION
// =============================================================================

/**
 * POST /api/portal/orders/request
 * Create and immediately submit a new order request
 */
router.post('/request', portalAuth, async (req: Request, res: Response) => {
  try {
    const clientId = req.portalUser!.clientId;
    const portalUserId = req.portalUser!.id;
    const userRole = req.portalUser!.role;

    // Check permission
    if (userRole === 'viewer') {
      return res.status(403).json({ message: 'You do not have permission to create orders' });
    }

    const data = createOrderSchema.parse(req.body);

    // Create order
    const createResult = await createOrderRequest(clientId, portalUserId, data.items, {
      notes: data.notes,
      locationId: data.locationId,
      shippingAddress: data.shippingAddress,
    });

    if (!createResult.success) {
      return res.status(400).json({ message: createResult.error });
    }

    // Immediately submit the order
    const submitResult = await submitOrder(createResult.orderRequest.id, portalUserId);

    if (!submitResult.success) {
      return res.status(400).json({ message: submitResult.error });
    }

    // Send email notification to account managers
    try {
      const orderWithDetails = await prisma.orderRequest.findUnique({
        where: { id: submitResult.orderRequest.id },
        include: {
          client: {
            select: {
              name: true,
              users: {
                include: { user: { select: { email: true } } },
                where: { role: 'account_manager' },
                take: 1,
              },
            },
          },
          requestedBy: { select: { name: true } },
          orderRequestItems: true,
        },
      });

      const accountManagerEmail = orderWithDetails?.client?.users?.[0]?.user?.email;
      if (accountManagerEmail) {
        await sendOrderRequestNotification(accountManagerEmail, {
          id: orderWithDetails.id,
          clientName: orderWithDetails.client.name,
          requestedBy: orderWithDetails.requestedBy?.name || 'Portal User',
          itemCount: orderWithDetails.orderRequestItems.length,
          totalItems: orderWithDetails.orderRequestItems.reduce((sum: number, item) => sum + item.quantityUnits, 0),
        });
      }
    } catch (emailError) {
      logger.error('Failed to send order notification email', emailError as Error);
    }

    res.status(201).json({
      id: submitResult.orderRequest.id,
      status: submitResult.orderRequest.status,
      message: 'Order request submitted successfully',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Invalid request data', errors: error.errors });
    }
    logger.error('Portal create order error', error instanceof Error ? error : null);
    res.status(500).json({ message: 'Failed to create order request' });
  }
});

/**
 * POST /api/portal/orders/cart/submit
 * Submit the current cart as an order request
 */
router.post('/cart/submit', portalAuth, async (req: Request, res: Response) => {
  try {
    const clientId = req.portalUser!.clientId;
    const portalUserId = req.portalUser!.id;
    const userRole = req.portalUser!.role;
    const { notes, locationId, shippingAddress } = req.body;

    // Check permission
    if (userRole === 'viewer') {
      return res.status(403).json({ message: 'You do not have permission to submit orders' });
    }

    // Get cart
    const cart = await getActiveCart(clientId, portalUserId);

    if (!cart || cart.orderRequestItems.length === 0) {
      return res.status(400).json({ message: 'Cart is empty' });
    }

    // Update cart with final notes/location if provided
    if (notes || locationId || shippingAddress) {
      await prisma.orderRequest.update({
        where: { id: cart.id },
        data: {
          ...(notes && { notes }),
          ...(locationId && { locationId }),
          ...(shippingAddress && { shippingAddress }),
        },
      });
    }

    // Submit the order
    const result = await submitOrder(cart.id, portalUserId);

    if (!result.success) {
      return res.status(400).json({ message: result.error });
    }

    // Send email notification to account managers
    try {
      const orderWithDetails = await prisma.orderRequest.findUnique({
        where: { id: result.orderRequest.id },
        include: {
          client: {
            select: {
              name: true,
              users: {
                include: { user: { select: { email: true } } },
                where: { role: 'account_manager' },
                take: 1,
              },
            },
          },
          requestedBy: { select: { name: true } },
          orderRequestItems: true,
        },
      });

      const accountManagerEmail = orderWithDetails?.client?.users?.[0]?.user?.email;
      if (accountManagerEmail) {
        await sendOrderRequestNotification(accountManagerEmail, {
          id: orderWithDetails.id,
          clientName: orderWithDetails.client.name,
          requestedBy: orderWithDetails.requestedBy?.name || 'Portal User',
          itemCount: orderWithDetails.orderRequestItems.length,
          totalItems: orderWithDetails.orderRequestItems.reduce((sum: number, item) => sum + item.quantityUnits, 0),
        });
      }
    } catch (emailError) {
      logger.error('Failed to send order notification email', emailError as Error);
    }

    res.json({
      id: result.orderRequest.id,
      status: result.orderRequest.status,
      message: 'Order request submitted successfully',
    });
  } catch (error) {
    logger.error('Portal submit cart error', error instanceof Error ? error : null);
    res.status(500).json({ message: 'Failed to submit order' });
  }
});

// =============================================================================
// ORDER DETAILS
// =============================================================================

/**
 * GET /api/portal/orders/:id
 * Get detailed order information with expandable items
 */
router.get('/:id', portalAuth, async (req: Request, res: Response) => {
  try {
    const clientId = req.portalUser!.clientId;
    const { id } = req.params;

    const order = await getOrderWithDetails(id, clientId);

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const statusDisplay = getStatusDisplay(order.status as any);

    res.json({
      ...order,
      statusDisplay,
    });
  } catch (error) {
    logger.error('Portal order detail error', error instanceof Error ? error : null);
    res.status(500).json({ message: 'Failed to load order' });
  }
});

/**
 * GET /api/portal/orders/:id/history
 * Get order status history timeline
 */
router.get('/:id/history', portalAuth, async (req: Request, res: Response) => {
  try {
    const clientId = req.portalUser!.clientId;
    const { id } = req.params;

    // Verify order belongs to client
    const order = await prisma.orderRequest.findFirst({
      where: { id, clientId },
    });

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const history = await getStatusHistory(id);

    res.json({
      orderId: id,
      currentStatus: order.status,
      history: history.map((entry) => ({
        fromStatus: entry.fromStatus,
        toStatus: entry.toStatus,
        changedByType: entry.changedByType,
        reason: entry.reason,
        timestamp: entry.createdAt,
        statusDisplay: getStatusDisplay(entry.toStatus as any),
      })),
    });
  } catch (error) {
    logger.error('Portal order history error', error instanceof Error ? error : null);
    res.status(500).json({ message: 'Failed to load order history' });
  }
});

// =============================================================================
// REORDER SUGGESTIONS
// =============================================================================

/**
 * GET /api/portal/orders/suggestions
 * Get suggested products for reordering based on stock levels and usage
 */
router.get('/suggestions/products', portalAuth, async (req: Request, res: Response) => {
  try {
    const clientId = req.portalUser!.clientId;
    const { urgency } = req.query;

    const suggestions = await getSuggestedOrderQuantities(clientId);

    // Filter by urgency if specified
    let filtered = suggestions;
    if (urgency) {
      filtered = suggestions.filter((s) => s.urgency === urgency);
    }

    res.json({
      data: filtered,
      meta: {
        total: filtered.length,
        byCritical: suggestions.filter((s) => s.urgency === 'critical').length,
        byHigh: suggestions.filter((s) => s.urgency === 'high').length,
        byMedium: suggestions.filter((s) => s.urgency === 'medium').length,
        byLow: suggestions.filter((s) => s.urgency === 'low').length,
      },
    });
  } catch (error) {
    logger.error('Portal order suggestions error', error instanceof Error ? error : null);
    res.status(500).json({ message: 'Failed to load suggestions' });
  }
});

/**
 * POST /api/portal/orders/quick-add
 * Quick add suggested items to cart
 */
router.post('/quick-add', portalAuth, async (req: Request, res: Response) => {
  try {
    const clientId = req.portalUser!.clientId;
    const portalUserId = req.portalUser!.id;
    const userRole = req.portalUser!.role;
    const { productIds, useSuggested = true } = req.body;

    // Check permission
    if (userRole === 'viewer') {
      return res.status(403).json({ message: 'You do not have permission to add items' });
    }

    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({ message: 'Product IDs required' });
    }

    // Get suggested quantities
    const suggestions = await getSuggestedOrderQuantities(clientId, productIds);

    if (suggestions.length === 0) {
      return res.status(404).json({ message: 'No valid products found' });
    }

    // Build items with suggested or default quantities
    const items = suggestions.map((s) => ({
      productId: s.productId,
      quantityPacks: useSuggested ? s.suggestedPacks : 1,
    }));

    // Get or create cart and add items
    let cart = await getActiveCart(clientId, portalUserId);

    if (!cart) {
      const result = await createOrderRequest(clientId, portalUserId, items);

      if (!result.success) {
        return res.status(400).json({ message: result.error });
      }

      return res.status(201).json({
        message: `Added ${items.length} items to cart`,
        cartId: result.orderRequest.id,
        itemsAdded: items.length,
      });
    }

    // Add items to existing cart
    let itemsAdded = 0;
    for (const item of items) {
      const result = await addItemToOrder(cart.id, clientId, item);
      if (result.success) itemsAdded++;
    }

    res.json({
      message: `Added ${itemsAdded} items to cart`,
      cartId: cart.id,
      itemsAdded,
    });
  } catch (error) {
    logger.error('Portal quick-add error', error instanceof Error ? error : null);
    res.status(500).json({ message: 'Failed to add items' });
  }
});

export default router;
