import { Router, Request, Response } from 'express';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { portalAuth } from '../../middleware/portal-auth.js';

const router = Router();

// Get portal dashboard stats
router.get('/', portalAuth, async (req: Request, res: Response) => {
  try {
    const clientId = req.portalUser!.clientId;

    // Get product counts by status
    const products = await prisma.product.findMany({
      where: { clientId },
      select: {
        id: true,
        productId: true,
        name: true,
        currentStockPacks: true,
        stockStatus: true,
        weeksRemaining: true,
      },
    });

    const totalProducts = products.length;
    const lowStockCount = products.filter(p =>
      ['low', 'critical', 'stockout'].includes(p.stockStatus || '')
    ).length;
    const criticalCount = products.filter(p =>
      ['critical', 'stockout'].includes(p.stockStatus || '')
    ).length;

    // Get pending orders count (submitted or acknowledged but not yet fulfilled)
    const pendingOrders = await prisma.orderRequest.count({
      where: {
        clientId,
        status: { in: ['submitted', 'acknowledged'] },
      },
    });

    // Get recent alerts (active = not dismissed)
    const recentAlerts = await prisma.alert.findMany({
      where: {
        clientId,
        isDismissed: false,
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        alertType: true,
        severity: true,
        title: true,
        createdAt: true,
      },
    });

    // Get low stock products
    const lowStockProducts = products
      .filter(p => ['low', 'critical', 'stockout'].includes(p.stockStatus || ''))
      .sort((a, b) => (a.weeksRemaining || 999) - (b.weeksRemaining || 999))
      .slice(0, 5)
      .map(p => ({
        id: p.id,
        productId: p.productId,
        name: p.name,
        currentStock: p.currentStockPacks,
        status: p.stockStatus,
        weeksRemaining: p.weeksRemaining || 0,
      }));

    res.json({
      totalProducts,
      lowStockCount,
      criticalCount,
      pendingOrders,
      recentAlerts,
      lowStockProducts,
    });
  } catch (error) {
    logger.error('Portal dashboard error', error as Error);
    res.status(500).json({ message: 'Failed to load dashboard' });
  }
});

export default router;
