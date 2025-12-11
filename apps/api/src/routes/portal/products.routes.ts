import { Router, Request, Response } from 'express';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { portalAuth } from '../../middleware/portal-auth.js';
import { getBatchOnOrderQuantities, getDefaultOnOrderInfo } from '../../lib/batch-loader.js';

const router = Router();

// Get client's products
router.get('/', portalAuth, async (req: Request, res: Response) => {
  try {
    const clientId = req.portalUser!.clientId;
    const { search, status } = req.query;

    const where: any = { clientId };

    if (search && typeof search === 'string') {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { productId: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (status && typeof status === 'string') {
      where.stockStatus = status;
    }

    const products = await prisma.product.findMany({
      where,
      orderBy: [
        { stockStatus: 'asc' },
        { weeksRemaining: 'asc' },
      ],
      select: {
        id: true,
        productId: true,
        name: true,
        itemType: true,
        packSize: true,
        currentStockPacks: true,
        currentStockUnits: true,
        stockStatus: true,
        weeksRemaining: true,
        reorderPointPacks: true,
        avgDailyUsage: true,
        // Phase 13 usage tier fields
        usageCalculationTier: true,
        usageConfidence: true,
        monthlyUsageUnits: true,
        monthlyUsagePacks: true,
      },
    });

    // Calculate status counts
    const statusCounts = products.reduce((acc, p) => {
      const status = p.stockStatus || 'unknown';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Get on-order quantities for all products
    const productIds = products.map(p => p.id);
    const onOrderMap = await getBatchOnOrderQuantities(productIds, clientId);

    // Map products with suggested order quantities and on-order info
    const productsWithSuggestions = products.map(p => {
      const onOrderInfo = onOrderMap.get(p.id) || getDefaultOnOrderInfo();
      return {
        ...p,
        currentStockUnits: p.currentStockUnits || p.currentStockPacks * (p.packSize || 1),
        status: p.stockStatus || 'unknown',
        suggestedOrderQty: calculateSuggestedOrder(p),
        // On-order tracking
        onOrderPacks: onOrderInfo.totalOnOrderPacks,
        onOrderUnits: onOrderInfo.totalOnOrderUnits,
        pendingOrders: onOrderInfo.orders,
        hasOnOrder: onOrderInfo.totalOnOrderPacks > 0,
      };
    });

    res.json({
      data: productsWithSuggestions,
      meta: {
        total: products.length,
        statusCounts,
      },
    });
  } catch (error) {
    logger.error('Portal products error', error as Error);
    res.status(500).json({ message: 'Failed to load products' });
  }
});

// Get single product details
router.get('/:id', portalAuth, async (req: Request, res: Response) => {
  try {
    const clientId = req.portalUser!.clientId;
    const { id } = req.params;

    const product = await prisma.product.findFirst({
      where: { id, clientId },
      include: {
        stockHistory: {
          orderBy: { recordedAt: 'desc' },
          take: 30,
        },
        transactions: {
          orderBy: { dateSubmitted: 'desc' },
          take: 50,
        },
      },
    });

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    res.json(product);
  } catch (error) {
    logger.error('Portal product detail error', error as Error);
    res.status(500).json({ message: 'Failed to load product' });
  }
});

function calculateSuggestedOrder(product: any): number {
  if (!product.avgDailyUsage || product.avgDailyUsage === 0) {
    return 0;
  }

  const targetWeeks = 8; // Target 8 weeks of stock
  const targetStock = product.avgDailyUsage * 7 * targetWeeks;
  const currentStock = product.currentStockPacks * (product.packSize || 1);
  const deficit = targetStock - currentStock;

  if (deficit <= 0) return 0;

  // Convert to packs
  const packsNeeded = Math.ceil(deficit / (product.packSize || 1));
  return packsNeeded;
}

export default router;
