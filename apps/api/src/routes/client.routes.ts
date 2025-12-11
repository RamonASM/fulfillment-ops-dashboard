import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticate, requireRole, requireClientAccess } from '../middleware/auth.js';
import { NotFoundError, ValidationError } from '../middleware/error-handler.js';
import { getBatchClientStats, getDefaultClientStats } from '../lib/batch-loader.js';
import { recalculateClientMonthlyUsage } from '../services/usage.service.js';
import { cache, CacheTTL, CacheKeys } from '../lib/cache.js';
import type { ClientStats, StockStatus } from '@inventory/shared';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const createClientSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  code: z.string().min(2, 'Code must be at least 2 characters').max(50),
  settings: z.object({
    reorderLeadDays: z.number().int().positive().optional(),
    safetyStockWeeks: z.number().int().positive().optional(),
    serviceLevelTarget: z.number().min(0).max(1).optional(),
    showOrphanProducts: z.boolean().optional(),
  }).optional(),
});

const updateClientSchema = createClientSchema.partial();

// =============================================================================
// ROUTES
// =============================================================================

/**
 * GET /api/clients
 * List all clients the user has access to
 */
router.get('/', async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const role = req.user!.role;

    let clients;

    if (role === 'admin' || role === 'operations_manager') {
      // Admins and ops managers see all clients
      clients = await prisma.client.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
      });
    } else {
      // Account managers only see assigned clients
      clients = await prisma.client.findMany({
        where: {
          isActive: true,
          users: {
            some: { userId },
          },
        },
        orderBy: { name: 'asc' },
      });
    }

    // Batch load stats for all clients (3 queries instead of N*3)
    const clientIds = clients.map(c => c.id);
    const statsMap = await getBatchClientStats(clientIds);

    const clientsWithStats = clients.map(client => ({
      ...client,
      stats: statsMap.get(client.id) || getDefaultClientStats(),
    }));

    res.json({ data: clientsWithStats });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/clients/:clientId
 * Get a specific client
 */
router.get('/:clientId', requireClientAccess, async (req, res, next) => {
  try {
    const { clientId } = req.params;

    const client = await prisma.client.findUnique({
      where: { id: clientId },
    });

    if (!client || !client.isActive) {
      throw new NotFoundError('Client');
    }

    const stats = await getClientStats(clientId);

    res.json({ ...client, stats });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/clients
 * Create a new client
 */
router.post('/', requireRole('admin', 'operations_manager', 'account_manager'), async (req, res, next) => {
  try {
    const data = createClientSchema.parse(req.body);

    // Check if code is unique
    const existing = await prisma.client.findUnique({
      where: { code: data.code.toUpperCase() },
    });

    if (existing) {
      throw new ValidationError('Client code already exists');
    }

    const client = await prisma.client.create({
      data: {
        name: data.name,
        code: data.code.toUpperCase(),
        settings: data.settings || {},
      },
    });

    res.status(201).json(client);
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/clients/:clientId
 * Update a client
 */
router.patch('/:clientId', requireClientAccess, async (req, res, next) => {
  try {
    const { clientId } = req.params;
    const data = updateClientSchema.parse(req.body);

    const client = await prisma.client.update({
      where: { id: clientId },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.settings && { settings: data.settings }),
      },
    });

    res.json(client);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/clients/:clientId
 * Soft delete a client
 */
router.delete('/:clientId', requireRole('admin'), async (req, res, next) => {
  try {
    const { clientId } = req.params;

    await prisma.client.update({
      where: { id: clientId },
      data: { isActive: false },
    });

    res.json({ message: 'Client deleted successfully' });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/clients/:clientId/stats
 * Get client inventory statistics
 */
router.get('/:clientId/stats', requireClientAccess, async (req, res, next) => {
  try {
    const { clientId } = req.params;
    const stats = await getClientStats(clientId);
    res.json(stats);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/clients/:clientId/alerts
 * Get client alerts
 */
router.get('/:clientId/alerts', requireClientAccess, async (req, res, next) => {
  try {
    const { clientId } = req.params;
    const { unreadOnly } = req.query;

    const alerts = await prisma.alert.findMany({
      where: {
        clientId,
        isDismissed: false,
        ...(unreadOnly === 'true' && { isRead: false }),
      },
      include: {
        product: {
          select: { productId: true, name: true },
        },
      },
      orderBy: [
        { severity: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    res.json({ data: alerts });
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// PHASE 13: MONTHLY USAGE INTELLIGENCE
// =============================================================================

/**
 * POST /api/clients/:clientId/recalculate-monthly-usage
 * Recalculate monthly usage for all products in a client
 * Updates all products with calculation tier transparency
 */
router.post('/:clientId/recalculate-monthly-usage', requireClientAccess, async (req, res, next) => {
  try {
    const { clientId } = req.params;

    // Verify client exists
    const client = await prisma.client.findUnique({
      where: { id: clientId },
    });

    if (!client || !client.isActive) {
      throw new NotFoundError('Client');
    }

    // Recalculate all products
    const result = await recalculateClientMonthlyUsage(clientId);

    res.json({
      message: `Monthly usage recalculated for ${result.processed} products`,
      clientId,
      clientName: client.name,
      processed: result.processed,
      errors: result.errors,
    });
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

async function getClientStats(clientId: string): Promise<ClientStats> {
  const cacheKey = CacheKeys.clientAggregates(clientId);
  const cached = cache.get<ClientStats>(cacheKey);
  if (cached) return cached;

  const products = await prisma.product.findMany({
    where: {
      clientId,
      isActive: true,
    },
    select: {
      currentStockPacks: true,
      packSize: true,
      reorderPointPacks: true,
    },
  });

  const statusCounts: Record<StockStatus, number> = {
    healthy: 0,
    watch: 0,
    low: 0,
    critical: 0,
    stockout: 0,
  };

  for (const product of products) {
    const status = calculateStockStatus(
      product.currentStockPacks,
      product.reorderPointPacks || 0
    );
    statusCounts[status]++;
  }

  const alertCount = await prisma.alert.count({
    where: {
      clientId,
      isDismissed: false,
      isRead: false,
    },
  });

  const stats: ClientStats = {
    totalProducts: products.length,
    healthyCount: statusCounts.healthy,
    watchCount: statusCounts.watch,
    lowCount: statusCounts.low,
    criticalCount: statusCounts.critical,
    stockoutCount: statusCounts.stockout,
    alertCount,
  };

  cache.set(cacheKey, stats, CacheTTL.CLIENT_AGGREGATES);
  return stats;
}

function calculateStockStatus(
  currentStock: number,
  reorderPoint: number
): StockStatus {
  if (currentStock === 0) {
    return 'stockout';
  }

  if (reorderPoint === 0) {
    return 'healthy';
  }

  const ratio = currentStock / reorderPoint;

  if (ratio <= 0.5) {
    return 'critical';
  }
  if (ratio <= 1) {
    return 'low';
  }
  if (ratio <= 1.5) {
    return 'watch';
  }

  return 'healthy';
}

export default router;
