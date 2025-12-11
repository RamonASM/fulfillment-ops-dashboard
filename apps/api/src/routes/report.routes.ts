import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticate, requireClientAccess, requireRole } from '../middleware/auth.js';
import { NotFoundError } from '../middleware/error-handler.js';
import type { StockStatus } from '@inventory/shared';
import { STATUS_COLORS } from '@inventory/shared';
import {
  generateClientReviewReport,
  generateLocationPerformanceReport,
  generateExecutiveSummaryReport,
  getReportById,
  getReports,
  getClientReports,
} from '../services/report.service.js';

const router = Router();

// Apply authentication
router.use(authenticate);

// =============================================================================
// ROUTES
// =============================================================================

/**
 * GET /api/reports/inventory-snapshot/:clientId
 * Get current inventory snapshot for a client
 */
router.get('/inventory-snapshot/:clientId', requireClientAccess, async (req, res, next) => {
  try {
    const { clientId } = req.params;

    const products = await prisma.product.findMany({
      where: {
        clientId,
        isActive: true,
      },
      orderBy: { name: 'asc' },
    });

    const statusBreakdown: Record<StockStatus, number> = {
      healthy: 0,
      watch: 0,
      low: 0,
      critical: 0,
      stockout: 0,
    };

    const enrichedProducts = products.map((product) => {
      const status = calculateStockStatus(
        product.currentStockPacks,
        product.reorderPointPacks || 0
      );
      statusBreakdown[status]++;

      return {
        ...product,
        currentStockUnits: product.currentStockPacks * product.packSize,
        reorderPointUnits: (product.reorderPointPacks || 0) * product.packSize,
        status: {
          level: status,
          color: STATUS_COLORS[status],
        },
      };
    });

    res.json({
      clientId,
      generatedAt: new Date(),
      totalProducts: products.length,
      statusBreakdown,
      products: enrichedProducts,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/reports/usage-trends/:clientId
 * Get usage trend report for a client
 */
router.get('/usage-trends/:clientId', requireClientAccess, async (req, res, next) => {
  try {
    const { clientId } = req.params;
    const { period = 'monthly', months = '6' } = req.query;

    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - parseInt(months as string));

    // Get all products for the client
    const products = await prisma.product.findMany({
      where: { clientId, isActive: true },
      select: { id: true },
    });

    const productIds = products.map((p) => p.id);

    // Get transactions
    const transactions = await prisma.transaction.findMany({
      where: {
        productId: { in: productIds },
        dateSubmitted: { gte: startDate },
        orderStatus: 'completed',
      },
      orderBy: { dateSubmitted: 'asc' },
    });

    // Group by period
    const dataPoints = groupTransactionsByPeriod(
      transactions,
      period as 'weekly' | 'monthly' | 'quarterly'
    );

    res.json({
      clientId,
      period,
      startDate,
      endDate: new Date(),
      dataPoints,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/reports/reorder-schedule/:clientId
 * Get upcoming reorder schedule for a client
 */
router.get('/reorder-schedule/:clientId', requireClientAccess, async (req, res, next) => {
  try {
    const { clientId } = req.params;

    const client = await prisma.client.findUnique({
      where: { id: clientId },
    });

    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const settings = client.settings as { reorderLeadDays?: number } || {};
    const leadDays = settings.reorderLeadDays || 14;

    // Get products that need reordering
    const products = await prisma.product.findMany({
      where: {
        clientId,
        isActive: true,
        isOrphan: false,
      },
    });

    // Get usage metrics for these products
    const productIds = products.map((p) => p.id);
    const usageMetrics = await prisma.usageMetric.findMany({
      where: {
        productId: { in: productIds },
      },
      orderBy: { calculatedAt: 'desc' },
    });

    // Create usage lookup
    const usageLookup = new Map(
      usageMetrics.map((m) => [m.productId, Number(m.avgDailyUnits || 0)])
    );

    // Calculate reorder dates
    const reorderSchedule = products
      .map((product) => {
        const avgDailyUnits = usageLookup.get(product.id) || 0;
        const currentUnits = product.currentStockPacks * product.packSize;
        const reorderUnits = (product.reorderPointPacks || 0) * product.packSize;

        if (avgDailyUnits === 0 || currentUnits > reorderUnits * 2) {
          return null; // No urgency
        }

        const daysUntilReorderPoint =
          avgDailyUnits > 0
            ? Math.max(0, (currentUnits - reorderUnits) / avgDailyUnits)
            : 999;

        const recommendedOrderDate = new Date();
        recommendedOrderDate.setDate(
          recommendedOrderDate.getDate() + Math.max(0, daysUntilReorderPoint - leadDays)
        );

        return {
          product: {
            id: product.id,
            productId: product.productId,
            name: product.name,
          },
          currentUnits,
          reorderUnits,
          avgDailyUsage: avgDailyUnits,
          daysUntilReorderPoint: Math.round(daysUntilReorderPoint),
          recommendedOrderDate,
          urgency:
            daysUntilReorderPoint <= 0
              ? 'immediate'
              : daysUntilReorderPoint <= 7
                ? 'urgent'
                : daysUntilReorderPoint <= 14
                  ? 'soon'
                  : 'planned',
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => a.daysUntilReorderPoint - b.daysUntilReorderPoint);

    res.json({
      clientId,
      generatedAt: new Date(),
      leadDays,
      items: reorderSchedule,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/reports/custom
 * Generate a custom report
 */
router.post('/custom', async (req, res, next) => {
  try {
    const { clientId, reportType, filters, dateRange } = req.body;

    // TODO: Implement custom report generation
    // This would support various report types:
    // - Inventory by category
    // - Usage by location
    // - Top movers
    // - Dead stock
    // - etc.

    res.json({
      message: 'Custom report generation not yet implemented',
      requestedReport: { clientId, reportType, filters, dateRange },
    });
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// PHASE 13: ENTERPRISE REPORTS
// =============================================================================

const generateReportSchema = z.object({
  periodDays: z.number().int().min(7).max(365).optional().default(30),
});

/**
 * GET /api/reports
 * List all generated reports
 */
router.get('/', async (req, res, next) => {
  try {
    const { type, clientId, limit } = req.query;

    const reports = await getReports({
      type: type as any,
      clientId: clientId as string,
      limit: limit ? parseInt(limit as string) : undefined,
    });

    res.json({
      data: reports,
      meta: {
        total: reports.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/reports/:reportId
 * Get a specific report with data
 */
router.get('/:reportId', async (req, res, next) => {
  try {
    const { reportId } = req.params;

    const report = await getReportById(reportId);

    if (!report) {
      throw new NotFoundError('Report');
    }

    res.json(report);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/reports/generate/client-review/:clientId
 * Generate a client review report
 */
router.post('/generate/client-review/:clientId', requireClientAccess, async (req, res, next) => {
  try {
    const { clientId } = req.params;
    const userId = req.user!.userId;
    const data = generateReportSchema.parse(req.body);

    const result = await generateClientReviewReport(clientId, data.periodDays, userId);

    if (!result.success) {
      return res.status(400).json({ message: result.error });
    }

    res.status(201).json({
      message: 'Client review report generated',
      reportId: result.reportId,
      report: result.report,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/reports/generate/location-performance/:clientId/:locationId
 * Generate a location performance report
 */
router.post(
  '/generate/location-performance/:clientId/:locationId',
  requireClientAccess,
  async (req, res, next) => {
    try {
      const { clientId, locationId } = req.params;
      const userId = req.user!.userId;
      const data = generateReportSchema.parse(req.body);

      const result = await generateLocationPerformanceReport(
        clientId,
        locationId,
        data.periodDays,
        userId
      );

      if (!result.success) {
        return res.status(400).json({ message: result.error });
      }

      res.status(201).json({
        message: 'Location performance report generated',
        reportId: result.reportId,
        report: result.report,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/reports/generate/executive-summary
 * Generate an executive summary report (admin only)
 */
router.post(
  '/generate/executive-summary',
  requireRole('admin', 'operations_manager'),
  async (req, res, next) => {
    try {
      const userId = req.user!.userId;
      const data = generateReportSchema.parse(req.body);

      const result = await generateExecutiveSummaryReport(data.periodDays, userId);

      if (!result.success) {
        return res.status(400).json({ message: result.error });
      }

      res.status(201).json({
        message: 'Executive summary report generated',
        reportId: result.reportId,
        report: result.report,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/reports/client/:clientId
 * Get reports for a specific client
 */
router.get('/client/:clientId', requireClientAccess, async (req, res, next) => {
  try {
    const { clientId } = req.params;
    const { type, limit } = req.query;

    const reports = await getClientReports(clientId, {
      type: type as any,
      limit: limit ? parseInt(limit as string) : undefined,
    });

    res.json({
      data: reports,
      meta: {
        total: reports.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/reports/:reportId
 * Delete a report
 */
router.delete('/:reportId', async (req, res, next) => {
  try {
    const { reportId } = req.params;

    const report = await prisma.report.findUnique({
      where: { id: reportId },
    });

    if (!report) {
      throw new NotFoundError('Report');
    }

    await prisma.report.delete({
      where: { id: reportId },
    });

    res.json({ message: 'Report deleted' });
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

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

function groupTransactionsByPeriod(
  transactions: { dateSubmitted: Date; quantityUnits: number }[],
  period: 'weekly' | 'monthly' | 'quarterly'
) {
  const groups = new Map<string, { date: Date; totalConsumed: number; productCount: number }>();

  for (const txn of transactions) {
    const key = getPeriodKey(txn.dateSubmitted, period);
    const existing = groups.get(key);

    if (existing) {
      existing.totalConsumed += txn.quantityUnits;
      existing.productCount++;
    } else {
      groups.set(key, {
        date: getPeriodStartDate(txn.dateSubmitted, period),
        totalConsumed: txn.quantityUnits,
        productCount: 1,
      });
    }
  }

  return Array.from(groups.values()).sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );
}

function getPeriodKey(date: Date, period: 'weekly' | 'monthly' | 'quarterly'): string {
  const year = date.getFullYear();
  const month = date.getMonth();

  switch (period) {
    case 'weekly': {
      const weekNumber = Math.ceil(
        (date.getDate() + new Date(year, month, 1).getDay()) / 7
      );
      return `${year}-${month}-W${weekNumber}`;
    }
    case 'monthly':
      return `${year}-${month}`;
    case 'quarterly':
      return `${year}-Q${Math.floor(month / 3) + 1}`;
    default:
      return `${year}-${month}`;
  }
}

function getPeriodStartDate(date: Date, period: 'weekly' | 'monthly' | 'quarterly'): Date {
  const year = date.getFullYear();
  const month = date.getMonth();

  switch (period) {
    case 'weekly': {
      const day = date.getDay();
      const diff = date.getDate() - day;
      return new Date(year, month, diff);
    }
    case 'monthly':
      return new Date(year, month, 1);
    case 'quarterly': {
      const quarterStart = Math.floor(month / 3) * 3;
      return new Date(year, quarterStart, 1);
    }
    default:
      return new Date(year, month, 1);
  }
}

export default router;
