// =============================================================================
// PORTAL ANALYTICS ROUTES (Phase 11)
// Analytics endpoints for portal users
// =============================================================================

import { Router, Request, Response } from 'express';
import { portalAuth } from '../../middleware/portal-auth.js';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { subDays, format } from 'date-fns';

const router = Router();

// All routes require portal authentication
router.use(portalAuth);

/**
 * GET /api/portal/analytics/stock-velocity
 * Get stock velocity for all products
 */
router.get('/stock-velocity', async (req: Request, res: Response) => {
  try {
    const { clientId } = (req as any).portalUser;

    const products = await prisma.product.findMany({
      where: { clientId, isActive: true },
      select: {
        id: true,
        productId: true,
        name: true,
        avgDailyUsage: true,
        stockStatus: true,
        usageMetrics: {
          where: { periodType: 'monthly' },
          orderBy: { periodStart: 'desc' },
          take: 2,
        },
      },
    });

    const velocityData = products.map((product) => {
      // Calculate trend from last 2 months
      let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
      let changePercent = 0;

      if (product.usageMetrics.length >= 2) {
        const current = Number(product.usageMetrics[0].avgDailyUnits) || 0;
        const previous = Number(product.usageMetrics[1].avgDailyUnits) || 0;

        if (previous > 0) {
          changePercent = ((current - previous) / previous) * 100;
          trend = changePercent > 5 ? 'increasing' : changePercent < -5 ? 'decreasing' : 'stable';
        }
      }

      return {
        productId: product.id,
        productName: product.name,
        avgDailyUsage: product.avgDailyUsage || 0,
        trend,
        changePercent: Math.abs(changePercent),
      };
    });

    res.json({ data: velocityData });
  } catch (error) {
    logger.error('Error fetching stock velocity', error as Error);
    res.status(500).json({ error: 'Failed to fetch stock velocity' });
  }
});

/**
 * GET /api/portal/analytics/usage-trends
 * Get daily usage trends for the last 30 days
 */
router.get('/usage-trends', async (req: Request, res: Response) => {
  try {
    const { clientId } = (req as any).portalUser;
    const days = parseInt(req.query.days as string) || 30;
    const startDate = subDays(new Date(), days);

    const transactions = await prisma.transaction.findMany({
      where: {
        product: { clientId },
        dateSubmitted: { gte: startDate },
      },
      select: {
        dateSubmitted: true,
        quantityUnits: true,
        quantityPacks: true,
      },
      orderBy: { dateSubmitted: 'asc' },
    });

    // Group by date
    const dateMap = new Map<string, { units: number; packs: number }>();

    for (const txn of transactions) {
      const dateKey = format(txn.dateSubmitted, 'yyyy-MM-dd');
      const existing = dateMap.get(dateKey) || { units: 0, packs: 0 };
      existing.units += txn.quantityUnits;
      existing.packs += txn.quantityPacks;
      dateMap.set(dateKey, existing);
    }

    const trends = Array.from(dateMap.entries()).map(([date, data]) => ({
      date,
      ...data,
    }));

    res.json({ data: trends });
  } catch (error) {
    logger.error('Error fetching usage trends', error as Error);
    res.status(500).json({ error: 'Failed to fetch usage trends' });
  }
});

/**
 * GET /api/portal/analytics/risk-products
 * Get products at risk for this client
 */
router.get('/risk-products', async (req: Request, res: Response) => {
  try {
    const { clientId } = (req as any).portalUser;

    const products = await prisma.product.findMany({
      where: {
        clientId,
        isActive: true,
        stockStatus: { in: ['LOW', 'CRITICAL', 'STOCKOUT'] },
      },
      include: {
        riskScoreCache: true,
      },
      orderBy: { stockStatus: 'asc' },
    });

    const riskProducts = products.map((product) => ({
      productId: product.id,
      productName: product.name,
      riskScore: product.riskScoreCache?.score || 50,
      riskLevel: product.riskScoreCache?.riskLevel || 'medium',
      stockStatus: product.stockStatus,
      weeksRemaining: product.weeksRemaining,
      currentStock: product.currentStockPacks,
    }));

    res.json({ data: riskProducts });
  } catch (error) {
    logger.error('Error fetching risk products', error as Error);
    res.status(500).json({ error: 'Failed to fetch risk products' });
  }
});

export default router;
