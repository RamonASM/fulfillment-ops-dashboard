import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { NotFoundError } from '../middleware/error-handler.js';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const alertQuerySchema = z.object({
  severity: z.string().optional(),
  type: z.string().optional(),
  unreadOnly: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(50),
  // Date range filters
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  // Snooze/assign filters
  snoozed: z.enum(['true', 'false']).optional(),
  assignedTo: z.string().uuid().optional(),
});

const dismissBulkSchema = z.object({
  alertIds: z.array(z.string().uuid()),
});

const snoozeBulkSchema = z.object({
  alertIds: z.array(z.string().uuid()).min(1).max(100),
  duration: z.enum(['1h', '4h', '8h', '24h', '3d', '7d']),
});

const reassignBulkSchema = z.object({
  alertIds: z.array(z.string().uuid()).min(1).max(100),
  assignedTo: z.string().uuid(),
});

const createBulkSchema = z.object({
  alerts: z.array(z.object({
    clientId: z.string().uuid(),
    productId: z.string().uuid().optional(),
    alertType: z.string(),
    severity: z.enum(['info', 'warning', 'critical']).default('warning'),
    title: z.string().max(255),
    message: z.string().optional(),
  })).min(1).max(50),
});

// Duration mapping for snooze
const SNOOZE_DURATIONS: Record<string, number> = {
  '1h': 60 * 60 * 1000,
  '4h': 4 * 60 * 60 * 1000,
  '8h': 8 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '3d': 3 * 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
};

// =============================================================================
// ROUTES
// =============================================================================

/**
 * GET /api/alerts
 * List all alerts the user has access to
 */
router.get('/', async (req, res, next) => {
  try {
    const query = alertQuerySchema.parse(req.query);
    const userId = req.user!.userId;
    const role = req.user!.role;

    // Get client IDs user has access to
    let clientIds: string[] = [];

    if (role === 'admin' || role === 'operations_manager') {
      const clients = await prisma.client.findMany({
        where: { isActive: true },
        select: { id: true },
      });
      clientIds = clients.map((c) => c.id);
    } else {
      const userClients = await prisma.userClient.findMany({
        where: { userId },
        select: { clientId: true },
      });
      clientIds = userClients.map((uc) => uc.clientId);
    }

    // Build where clause
    const where: Record<string, unknown> = {
      clientId: { in: clientIds },
      isDismissed: false,
    };

    if (query.unreadOnly === 'true') {
      where.isRead = false;
    }

    if (query.severity) {
      where.severity = { in: query.severity.split(',') };
    }

    if (query.type) {
      where.alertType = { in: query.type.split(',') };
    }

    // Date range filter
    if (query.dateFrom || query.dateTo) {
      const createdAtFilter: { gte?: Date; lte?: Date } = {};
      if (query.dateFrom) {
        createdAtFilter.gte = new Date(query.dateFrom);
      }
      if (query.dateTo) {
        createdAtFilter.lte = new Date(query.dateTo);
      }
      where.createdAt = createdAtFilter;
    }

    // Snooze filter
    if (query.snoozed === 'true') {
      where.snoozedUntil = { not: null };
    } else if (query.snoozed === 'false') {
      where.snoozedUntil = null;
    }

    // Assignment filter
    if (query.assignedTo) {
      where.assignedTo = query.assignedTo;
    }

    // Get total count
    const total = await prisma.alert.count({ where });

    // Get alerts
    const alerts = await prisma.alert.findMany({
      where,
      include: {
        product: {
          select: { productId: true, name: true },
        },
        client: {
          select: { name: true, code: true },
        },
      },
      orderBy: [
        { severity: 'desc' },
        { createdAt: 'desc' },
      ],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });

    // Get severity counts
    const severityCounts = await prisma.alert.groupBy({
      by: ['severity'],
      where: {
        clientId: { in: clientIds },
        isDismissed: false,
      },
      _count: true,
    });

    res.json({
      data: alerts,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
      meta: {
        severityCounts: severityCounts.reduce(
          (acc, { severity, _count }) => ({
            ...acc,
            [severity]: _count,
          }),
          {}
        ),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/alerts/:alertId
 * Get a specific alert
 */
router.get('/:alertId', async (req, res, next) => {
  try {
    const { alertId } = req.params;

    const alert = await prisma.alert.findUnique({
      where: { id: alertId },
      include: {
        product: {
          select: { productId: true, name: true },
        },
        client: {
          select: { name: true, code: true },
        },
      },
    });

    if (!alert) {
      throw new NotFoundError('Alert');
    }

    res.json(alert);
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/alerts/:alertId/read
 * Mark an alert as read
 */
router.patch('/:alertId/read', async (req, res, next) => {
  try {
    const { alertId } = req.params;

    const alert = await prisma.alert.update({
      where: { id: alertId },
      data: { isRead: true },
    });

    res.json(alert);
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/alerts/:alertId/dismiss
 * Dismiss an alert
 */
router.patch('/:alertId/dismiss', async (req, res, next) => {
  try {
    const { alertId } = req.params;
    const userId = req.user!.userId;

    const alert = await prisma.alert.update({
      where: { id: alertId },
      data: {
        isDismissed: true,
        dismissedBy: userId,
        dismissedAt: new Date(),
      },
    });

    res.json(alert);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/alerts/dismiss-bulk
 * Dismiss multiple alerts
 */
router.post('/dismiss-bulk', async (req, res, next) => {
  try {
    const { alertIds } = dismissBulkSchema.parse(req.body);
    const userId = req.user!.userId;

    const result = await prisma.alert.updateMany({
      where: { id: { in: alertIds } },
      data: {
        isDismissed: true,
        dismissedBy: userId,
        dismissedAt: new Date(),
      },
    });

    res.json({
      message: `${result.count} alerts dismissed`,
      count: result.count,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/alerts/mark-all-read
 * Mark all alerts as read for user's clients
 */
router.post('/mark-all-read', async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const role = req.user!.role;

    // Get client IDs user has access to
    let clientIds: string[] = [];

    if (role === 'admin' || role === 'operations_manager') {
      const clients = await prisma.client.findMany({
        where: { isActive: true },
        select: { id: true },
      });
      clientIds = clients.map((c) => c.id);
    } else {
      const userClients = await prisma.userClient.findMany({
        where: { userId },
        select: { clientId: true },
      });
      clientIds = userClients.map((uc) => uc.clientId);
    }

    const result = await prisma.alert.updateMany({
      where: {
        clientId: { in: clientIds },
        isRead: false,
      },
      data: { isRead: true },
    });

    res.json({
      message: `${result.count} alerts marked as read`,
      count: result.count,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/alerts/snooze-bulk
 * Snooze multiple alerts for a specified duration
 */
router.post('/snooze-bulk', async (req, res, next) => {
  try {
    const { alertIds, duration } = snoozeBulkSchema.parse(req.body);
    const userId = req.user!.userId;

    const snoozedUntil = new Date(Date.now() + SNOOZE_DURATIONS[duration]);

    const result = await prisma.alert.updateMany({
      where: { id: { in: alertIds } },
      data: {
        snoozedUntil,
        snoozedBy: userId,
        status: 'snoozed',
      },
    });

    res.json({
      message: `${result.count} alerts snoozed until ${snoozedUntil.toISOString()}`,
      count: result.count,
      snoozedUntil,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/alerts/reassign-bulk
 * Reassign multiple alerts to a user
 */
router.post('/reassign-bulk', async (req, res, next) => {
  try {
    const { alertIds, assignedTo } = reassignBulkSchema.parse(req.body);

    // Verify target user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: assignedTo },
      select: { id: true, name: true },
    });

    if (!targetUser) {
      return res.status(400).json({
        code: 'USER_NOT_FOUND',
        message: 'Target user not found',
      });
    }

    const result = await prisma.alert.updateMany({
      where: { id: { in: alertIds } },
      data: { assignedTo },
    });

    res.json({
      message: `${result.count} alerts reassigned to ${targetUser.name}`,
      count: result.count,
      assignedTo: targetUser,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/alerts/create-bulk
 * Create multiple alerts at once
 */
router.post('/create-bulk', async (req, res, next) => {
  try {
    const { alerts } = createBulkSchema.parse(req.body);

    // Create alerts in a transaction
    const createdAlerts = await prisma.$transaction(
      alerts.map(alert =>
        prisma.alert.create({
          data: {
            clientId: alert.clientId,
            productId: alert.productId,
            alertType: alert.alertType,
            severity: alert.severity,
            title: alert.title,
            message: alert.message,
            status: 'active',
          },
        })
      )
    );

    res.status(201).json({
      message: `${createdAlerts.length} alerts created`,
      count: createdAlerts.length,
      alerts: createdAlerts,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/alerts/unsnooze-bulk
 * Remove snooze from multiple alerts
 */
router.post('/unsnooze-bulk', async (req, res, next) => {
  try {
    const { alertIds } = dismissBulkSchema.parse(req.body);

    const result = await prisma.alert.updateMany({
      where: { id: { in: alertIds } },
      data: {
        snoozedUntil: null,
        snoozedBy: null,
        status: 'active',
      },
    });

    res.json({
      message: `${result.count} alerts unsnoozed`,
      count: result.count,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
