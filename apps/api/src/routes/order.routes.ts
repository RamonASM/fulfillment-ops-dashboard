import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { authenticate, requireRole, requireClientAccess } from '../middleware/auth.js';
import { NotFoundError, ValidationError } from '../middleware/error-handler.js';
import { getOrderWithDetails } from '../services/order.service.js';
import { sendOrderStatusUpdate } from '../services/email.service.js';
import {
  transitionOrderStatus,
  acknowledgeOrderRequest,
  requestChanges,
  putOnHold,
  fulfillOrder,
  cancelOrder,
  getStatusDisplay,
  getSlaStatus,
  getStatusHistory,
  getActiveOrderRequests,
  getOrdersApproachingSla,
  checkSlaBreaches,
  type RequestStatus,
} from '../services/workflow.service.js';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const acknowledgeSchema = z.object({
  notes: z.string().optional(),
});

const changesRequestedSchema = z.object({
  reason: z.string().min(1, 'Reason is required'),
});

const onHoldSchema = z.object({
  reason: z.string().min(1, 'Reason is required'),
});

const fulfillSchema = z.object({
  externalOrderRef: z.string().min(1, 'External order reference is required'),
  notes: z.string().optional(),
});

const cancelSchema = z.object({
  reason: z.string().min(1, 'Reason is required'),
});

const orderQuerySchema = z.object({
  clientId: z.string().uuid().optional(),
  status: z.string().optional(),
  slaBreached: z.enum(['true', 'false']).optional(),
  limit: z.string().optional(),
  page: z.string().optional(),
});

// =============================================================================
// ORDER LISTING (ADMIN)
// =============================================================================

/**
 * GET /api/orders
 * List all order requests with filtering (admin view)
 */
router.get('/', async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const userRole = req.user!.role;
    const query = orderQuerySchema.parse(req.query);

    const take = Math.min(parseInt(query.limit || '50'), 100);
    const skip = (parseInt(query.page || '1') - 1) * take;

    const where: any = {
      status: { not: 'draft' }, // Don't show drafts to admins
    };

    // Filter by client if specified or if user has limited access
    if (query.clientId) {
      where.clientId = query.clientId;
    } else if (userRole === 'account_manager') {
      // Account managers only see their assigned clients
      const userClients = await prisma.userClient.findMany({
        where: { userId },
        select: { clientId: true },
      });
      where.clientId = { in: userClients.map((uc) => uc.clientId) };
    }

    // Filter by status
    if (query.status) {
      where.status = query.status;
    }

    // Filter by SLA breach
    if (query.slaBreached === 'true') {
      where.slaBreached = true;
    }

    const [orders, total] = await Promise.all([
      prisma.orderRequest.findMany({
        where,
        orderBy: [
          { slaBreached: 'desc' },
          { slaDeadline: 'asc' },
          { createdAt: 'desc' },
        ],
        take,
        skip,
        include: {
          client: {
            select: { id: true, name: true, code: true },
          },
          location: {
            select: { id: true, name: true, code: true },
          },
          requestedBy: {
            select: { id: true, name: true, email: true },
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

    // Get status counts
    const statusCounts = await prisma.orderRequest.groupBy({
      by: ['status'],
      where: { ...where, status: undefined },
      _count: true,
    });

    // Transform orders with SLA and display info
    const ordersWithDetails = orders.map((order) => {
      const slaStatus = getSlaStatus({
        slaDeadline: order.slaDeadline,
        slaBreached: order.slaBreached,
        status: order.status,
      });

      const statusDisplay = getStatusDisplay(order.status as RequestStatus);

      return {
        id: order.id,
        status: order.status,
        statusDisplay,
        slaStatus,
        client: order.client,
        location: order.location,
        requestedBy: order.requestedBy,
        itemCount: order.orderRequestItems.length,
        totalPacks: order.totalPacks,
        totalUnits: order.totalUnits,
        estimatedValue: order.estimatedValue ? Number(order.estimatedValue) : null,
        notes: order.notes,
        reviewNotes: order.reviewNotes,
        externalOrderRef: order.externalOrderRef,
        createdAt: order.createdAt,
        submittedAt: order.submittedAt,
        acknowledgedAt: order.acknowledgedAt,
        fulfilledAt: order.fulfilledAt,
        items: order.orderRequestItems.map((item) => ({
          id: item.id,
          productId: item.product.id,
          productCode: item.product.productId,
          productName: item.product.name,
          packSize: item.product.packSize,
          quantityPacks: item.quantityPacks,
          quantityUnits: item.quantityUnits,
          snapshotMonthlyUsage: item.snapshotMonthlyUsage,
          snapshotCalculationTier: item.snapshotCalculationTier,
          snapshotStockLevel: item.snapshotStockLevel,
          snapshotWeeksRemaining: item.snapshotWeeksRemaining,
        })),
      };
    });

    res.json({
      data: ordersWithDetails,
      meta: {
        total,
        page: parseInt(query.page || '1'),
        limit: take,
        totalPages: Math.ceil(total / take),
        statusCounts: statusCounts.reduce((acc, item) => {
          acc[item.status] = item._count;
          return acc;
        }, {} as Record<string, number>),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/orders/queue
 * Get orders requiring immediate attention (submitted, approaching SLA)
 */
router.get('/queue', async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const userRole = req.user!.role;

    // Get client IDs user has access to
    let clientFilter: string[] | undefined;
    if (userRole === 'account_manager') {
      const userClients = await prisma.userClient.findMany({
        where: { userId },
        select: { clientId: true },
      });
      clientFilter = userClients.map((uc) => uc.clientId);
    }

    // Get orders needing attention (submitted status)
    const pendingOrders = await getActiveOrderRequests({
      clientId: clientFilter?.[0], // TODO: Support multiple clients
      status: ['submitted'],
      limit: 20,
    });

    // Get orders approaching SLA deadline
    const approachingSla = await getOrdersApproachingSla(4);

    // Get breached orders
    const breachedOrders = await getActiveOrderRequests({
      breachedOnly: true,
      limit: 10,
    });

    res.json({
      pending: {
        count: pendingOrders.length,
        orders: pendingOrders.map((order) => ({
          id: order.id,
          client: order.client,
          location: order.location,
          requestedBy: order.requestedBy,
          totalPacks: order.totalPacks,
          submittedAt: order.submittedAt,
          slaDeadline: order.slaDeadline,
        })),
      },
      approachingSla: {
        count: approachingSla.length,
        orders: approachingSla,
      },
      breached: {
        count: breachedOrders.length,
        orders: breachedOrders.map((order) => ({
          id: order.id,
          client: order.client,
          status: order.status,
          slaDeadline: order.slaDeadline,
          submittedAt: order.submittedAt,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/orders/:orderId
 * Get detailed order information (admin view)
 */
router.get('/:orderId', async (req, res, next) => {
  try {
    const { orderId } = req.params;

    const order = await getOrderWithDetails(orderId);

    if (!order) {
      throw new NotFoundError('Order');
    }

    const statusDisplay = getStatusDisplay(order.status as RequestStatus);

    res.json({
      ...order,
      statusDisplay,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/orders/:orderId/history
 * Get order status history
 */
router.get('/:orderId/history', async (req, res, next) => {
  try {
    const { orderId } = req.params;

    const order = await prisma.orderRequest.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundError('Order');
    }

    const history = await getStatusHistory(orderId);

    res.json({
      orderId,
      currentStatus: order.status,
      history: history.map((entry) => ({
        fromStatus: entry.fromStatus,
        toStatus: entry.toStatus,
        changedBy: entry.changedBy,
        changedByType: entry.changedByType,
        reason: entry.reason,
        timestamp: entry.createdAt,
        statusDisplay: getStatusDisplay(entry.toStatus as RequestStatus),
      })),
    });
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// ORDER WORKFLOW ACTIONS
// =============================================================================

/**
 * POST /api/orders/:orderId/acknowledge
 * Acknowledge an order request (admin received, will process)
 */
router.post('/:orderId/acknowledge', async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const userId = req.user!.userId;

    const result = await acknowledgeOrderRequest(orderId, userId);

    if (!result.success) {
      return res.status(400).json({ message: result.error });
    }

    res.json({
      message: 'Order acknowledged successfully',
      order: {
        id: result.orderRequest.id,
        status: result.orderRequest.status,
        acknowledgedAt: result.orderRequest.acknowledgedAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/orders/:orderId/request-changes
 * Request changes from client (needs revision)
 */
router.post('/:orderId/request-changes', async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const userId = req.user!.userId;
    const data = changesRequestedSchema.parse(req.body);

    const result = await requestChanges(orderId, userId, data.reason);

    if (!result.success) {
      return res.status(400).json({ message: result.error });
    }

    // Send email notification to client about changes requested
    try {
      const order = await prisma.orderRequest.findUnique({
        where: { id: orderId },
        include: { requestedBy: true },
      });
      if (order?.requestedBy?.email) {
        await sendOrderStatusUpdate(order.requestedBy.email, {
          id: result.orderRequest.id,
          status: 'CHANGES_REQUESTED',
          reviewNotes: data.reason,
        });
      }
    } catch (emailError) {
      logger.error('Failed to send changes requested email', emailError as Error, { orderId });
    }

    res.json({
      message: 'Changes requested',
      order: {
        id: result.orderRequest.id,
        status: result.orderRequest.status,
        reviewNotes: result.orderRequest.reviewNotes,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/orders/:orderId/hold
 * Put order on hold (waiting for additional info)
 */
router.post('/:orderId/hold', async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const userId = req.user!.userId;
    const data = onHoldSchema.parse(req.body);

    const result = await putOnHold(orderId, userId, data.reason);

    if (!result.success) {
      return res.status(400).json({ message: result.error });
    }

    res.json({
      message: 'Order placed on hold',
      order: {
        id: result.orderRequest.id,
        status: result.orderRequest.status,
        reviewNotes: result.orderRequest.reviewNotes,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/orders/:orderId/fulfill
 * Mark order as fulfilled (external order created)
 */
router.post('/:orderId/fulfill', async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const userId = req.user!.userId;
    const data = fulfillSchema.parse(req.body);

    const result = await fulfillOrder(
      orderId,
      userId,
      data.externalOrderRef,
      data.notes
    );

    if (!result.success) {
      return res.status(400).json({ message: result.error });
    }

    // Send email notification to client about fulfillment
    try {
      const order = await prisma.orderRequest.findUnique({
        where: { id: orderId },
        include: { requestedBy: true },
      });
      if (order?.requestedBy?.email) {
        await sendOrderStatusUpdate(order.requestedBy.email, {
          id: result.orderRequest.id,
          status: 'FULFILLED',
          reviewNotes: `Reference: ${data.externalOrderRef}${data.notes ? `\n${data.notes}` : ''}`,
        });
      }
    } catch (emailError) {
      logger.error('Failed to send fulfillment email', emailError as Error, { orderId });
    }

    res.json({
      message: 'Order marked as fulfilled',
      order: {
        id: result.orderRequest.id,
        status: result.orderRequest.status,
        externalOrderRef: result.orderRequest.externalOrderRef,
        fulfilledAt: result.orderRequest.fulfilledAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/orders/:orderId/cancel
 * Cancel an order request
 */
router.post('/:orderId/cancel', async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const userId = req.user!.userId;
    const data = cancelSchema.parse(req.body);

    const result = await cancelOrder(orderId, userId, 'user', data.reason);

    if (!result.success) {
      return res.status(400).json({ message: result.error });
    }

    res.json({
      message: 'Order cancelled',
      order: {
        id: result.orderRequest.id,
        status: result.orderRequest.status,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/orders/:orderId/resume
 * Resume a held order back to acknowledged
 */
router.post('/:orderId/resume', async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const userId = req.user!.userId;

    const result = await transitionOrderStatus(
      orderId,
      'acknowledged',
      userId,
      'user',
      { reason: 'Resumed from hold' }
    );

    if (!result.success) {
      return res.status(400).json({ message: result.error });
    }

    res.json({
      message: 'Order resumed',
      order: {
        id: result.orderRequest.id,
        status: result.orderRequest.status,
      },
    });
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// SLA MANAGEMENT
// =============================================================================

/**
 * POST /api/orders/check-sla-breaches
 * Manually trigger SLA breach check (also runs on schedule)
 */
router.post('/check-sla-breaches', requireRole('admin', 'operations_manager'), async (req, res, next) => {
  try {
    const result = await checkSlaBreaches();

    res.json({
      message: `SLA check complete`,
      checked: result.checked,
      breached: result.breached,
      breachedOrders: result.breachedOrders,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/orders/sla-dashboard
 * Get SLA performance metrics
 */
router.get('/sla-dashboard', async (req, res, next) => {
  try {
    const { days = '30' } = req.query;
    const daysAgo = parseInt(days as string) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysAgo);

    // Get orders in the time period
    const orders = await prisma.orderRequest.findMany({
      where: {
        submittedAt: { gte: startDate },
        status: { not: 'draft' },
      },
      select: {
        id: true,
        status: true,
        slaBreached: true,
        submittedAt: true,
        acknowledgedAt: true,
        slaDeadline: true,
      },
    });

    const totalOrders = orders.length;
    const breachedOrders = orders.filter((o) => o.slaBreached).length;
    const onTimeOrders = totalOrders - breachedOrders;

    // Calculate average response time
    const ordersWithResponse = orders.filter((o) => o.acknowledgedAt && o.submittedAt);
    const avgResponseHours =
      ordersWithResponse.length > 0
        ? ordersWithResponse.reduce((sum, o) => {
            const diff = o.acknowledgedAt!.getTime() - o.submittedAt!.getTime();
            return sum + diff / (1000 * 60 * 60);
          }, 0) / ordersWithResponse.length
        : null;

    res.json({
      period: `${daysAgo} days`,
      metrics: {
        totalOrders,
        breachedOrders,
        onTimeOrders,
        slaComplianceRate: totalOrders > 0 ? ((onTimeOrders / totalOrders) * 100).toFixed(1) : null,
        avgResponseHours: avgResponseHours ? avgResponseHours.toFixed(1) : null,
      },
      byStatus: orders.reduce((acc, o) => {
        acc[o.status] = (acc[o.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
