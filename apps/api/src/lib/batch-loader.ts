import { prisma } from './prisma.js';
import { cache, CacheTTL, CacheKeys } from './cache.js';

// =============================================================================
// TYPES
// =============================================================================

export interface ClientStats {
  totalProducts: number;
  healthyCount: number;
  watchCount: number;
  lowCount: number;
  criticalCount: number;
  stockoutCount: number;
  activeAlertCount: number;
}

export interface UsageMetrics {
  calculationBasis: '12-mo' | '3-mo' | 'weekly' | 'none';
  avgMonthlyUnits: number;
  avgDailyUnits: number;
  avgWeeklyUnits: number;
  confidence: 'high' | 'medium' | 'low';
  dataPointCount: number;
  calculatedAt: Date | null;
}

type StockStatus = 'HEALTHY' | 'WATCH' | 'LOW' | 'CRITICAL' | 'STOCKOUT';

// =============================================================================
// CLIENT STATS BATCH LOADER
// =============================================================================

/**
 * Batch load stats for multiple clients in 3 queries instead of N*3
 */
export async function getBatchClientStats(
  clientIds: string[]
): Promise<Map<string, ClientStats>> {
  const statsMap = new Map<string, ClientStats>();

  if (clientIds.length === 0) {
    return statsMap;
  }

  // Initialize stats for all clients
  for (const clientId of clientIds) {
    statsMap.set(clientId, {
      totalProducts: 0,
      healthyCount: 0,
      watchCount: 0,
      lowCount: 0,
      criticalCount: 0,
      stockoutCount: 0,
      activeAlertCount: 0,
    });
  }

  // Query 1: Get product counts by status per client
  const productStats = await prisma.product.groupBy({
    by: ['clientId', 'stockStatus'],
    where: {
      clientId: { in: clientIds },
      isActive: true,
    },
    _count: {
      id: true,
    },
  });

  // Query 2: Get total products per client
  const productCounts = await prisma.product.groupBy({
    by: ['clientId'],
    where: {
      clientId: { in: clientIds },
      isActive: true,
    },
    _count: {
      id: true,
    },
  });

  // Query 3: Get active alert counts per client
  const alertCounts = await prisma.alert.groupBy({
    by: ['clientId'],
    where: {
      clientId: { in: clientIds },
      isDismissed: false,
    },
    _count: {
      id: true,
    },
  });

  // Process product status counts
  for (const stat of productStats) {
    const clientStats = statsMap.get(stat.clientId);
    if (clientStats) {
      const status = (stat.stockStatus || 'HEALTHY').toUpperCase() as StockStatus;
      switch (status) {
        case 'HEALTHY':
          clientStats.healthyCount = stat._count.id;
          break;
        case 'WATCH':
          clientStats.watchCount = stat._count.id;
          break;
        case 'LOW':
          clientStats.lowCount = stat._count.id;
          break;
        case 'CRITICAL':
          clientStats.criticalCount = stat._count.id;
          break;
        case 'STOCKOUT':
          clientStats.stockoutCount = stat._count.id;
          break;
      }
    }
  }

  // Process total product counts
  for (const count of productCounts) {
    const clientStats = statsMap.get(count.clientId);
    if (clientStats) {
      clientStats.totalProducts = count._count.id;
    }
  }

  // Process alert counts
  for (const count of alertCounts) {
    const clientStats = statsMap.get(count.clientId);
    if (clientStats) {
      clientStats.activeAlertCount = count._count.id;
    }
  }

  return statsMap;
}

// =============================================================================
// USAGE METRICS BATCH LOADER
// =============================================================================

/**
 * Batch load usage metrics for multiple products
 */
export async function getBatchUsageMetrics(
  productIds: string[]
): Promise<Map<string, UsageMetrics | null>> {
  const metricsMap = new Map<string, UsageMetrics | null>();
  const uncachedIds: string[] = [];

  if (productIds.length === 0) {
    return metricsMap;
  }

  // Check cache first
  for (const productId of productIds) {
    const cacheKey = CacheKeys.usageMetrics(productId, 'latest');
    const cached = cache.get<UsageMetrics>(cacheKey);
    if (cached !== null) {
      metricsMap.set(productId, cached);
    } else {
      uncachedIds.push(productId);
      metricsMap.set(productId, null); // Initialize as null
    }
  }

  // Fetch uncached metrics from database
  if (uncachedIds.length > 0) {
    // Get latest metric for each product
    const latestMetrics = await prisma.usageMetric.findMany({
      where: {
        productId: { in: uncachedIds },
      },
      orderBy: {
        calculatedAt: 'desc',
      },
      distinct: ['productId'],
    });

    for (const metric of latestMetrics) {
      const usage: UsageMetrics = {
        calculationBasis: metric.periodType as UsageMetrics['calculationBasis'],
        avgMonthlyUnits: Number(metric.avgDailyUnits || 0) * 30.44,
        avgDailyUnits: Number(metric.avgDailyUnits || 0),
        avgWeeklyUnits: Number(metric.avgDailyUnits || 0) * 7,
        confidence: getConfidenceLevel(metric.transactionCount || 0),
        dataPointCount: metric.transactionCount || 0,
        calculatedAt: metric.calculatedAt,
      };

      metricsMap.set(metric.productId, usage);

      // Cache the result
      const cacheKey = CacheKeys.usageMetrics(metric.productId, 'latest');
      cache.set(cacheKey, usage, CacheTTL.USAGE_METRICS);
    }
  }

  return metricsMap;
}

/**
 * Batch load product names for order items
 */
export async function getBatchProductNames(
  productIds: string[]
): Promise<Map<string, string>> {
  const namesMap = new Map<string, string>();

  if (productIds.length === 0) {
    return namesMap;
  }

  const products = await prisma.product.findMany({
    where: {
      id: { in: productIds },
    },
    select: {
      id: true,
      name: true,
    },
  });

  for (const product of products) {
    namesMap.set(product.id, product.name);
  }

  return namesMap;
}

// =============================================================================
// HELPERS
// =============================================================================

function getConfidenceLevel(dataPointCount: number): 'high' | 'medium' | 'low' {
  if (dataPointCount >= 12) return 'high';
  if (dataPointCount >= 6) return 'medium';
  return 'low';
}

/**
 * Get default stats for clients without any data
 */
export function getDefaultClientStats(): ClientStats {
  return {
    totalProducts: 0,
    healthyCount: 0,
    watchCount: 0,
    lowCount: 0,
    criticalCount: 0,
    stockoutCount: 0,
    activeAlertCount: 0,
  };
}

/**
 * Get default usage metrics for products without data
 */
export function getDefaultUsageMetrics(): UsageMetrics {
  return {
    calculationBasis: 'none',
    avgMonthlyUnits: 0,
    avgDailyUnits: 0,
    avgWeeklyUnits: 0,
    confidence: 'low',
    dataPointCount: 0,
    calculatedAt: null,
  };
}

// =============================================================================
// ON-ORDER QUANTITY LOADER
// =============================================================================

export interface OnOrderInfo {
  totalOnOrderPacks: number;
  totalOnOrderUnits: number;
  orders: Array<{
    orderId: string;
    orderRequestId: string;
    status: string;
    quantityPacks: number;
    quantityUnits: number;
    createdAt: Date;
    requestedBy?: string;
  }>;
}

/**
 * Batch load on-order quantities for products based on pending OrderRequestItems
 * Considers orders in these statuses as "on order": pending, approved, submitted, acknowledged, on_hold
 * (excludes completed, rejected, cancelled, fulfilled, draft)
 */
export async function getBatchOnOrderQuantities(
  productIds: string[],
  clientId?: string
): Promise<Map<string, OnOrderInfo>> {
  const onOrderMap = new Map<string, OnOrderInfo>();

  if (productIds.length === 0) {
    return onOrderMap;
  }

  // Initialize all products with zero on-order
  for (const productId of productIds) {
    onOrderMap.set(productId, {
      totalOnOrderPacks: 0,
      totalOnOrderUnits: 0,
      orders: [],
    });
  }

  // Statuses that count as "on order" (not fulfilled, not rejected, not draft)
  const pendingStatuses = ['pending', 'approved', 'submitted', 'acknowledged', 'on_hold'];

  // Query OrderRequestItems for products that are in pending orders
  const orderItems = await prisma.orderRequestItem.findMany({
    where: {
      productId: { in: productIds },
      orderRequest: {
        status: { in: pendingStatuses },
        ...(clientId ? { clientId } : {}),
      },
    },
    include: {
      orderRequest: {
        select: {
          id: true,
          status: true,
          createdAt: true,
          requestedBy: {
            select: {
              name: true,
            },
          },
        },
      },
      product: {
        select: {
          packSize: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  // Aggregate on-order quantities per product
  for (const item of orderItems) {
    const info = onOrderMap.get(item.productId);
    if (info) {
      const packSize = item.product?.packSize || 1;
      info.totalOnOrderPacks += item.quantityPacks;
      info.totalOnOrderUnits += item.quantityUnits || (item.quantityPacks * packSize);
      info.orders.push({
        orderId: item.id,
        orderRequestId: item.orderRequest.id,
        status: item.orderRequest.status,
        quantityPacks: item.quantityPacks,
        quantityUnits: item.quantityUnits || (item.quantityPacks * packSize),
        createdAt: item.createdAt,
        requestedBy: item.orderRequest.requestedBy?.name,
      });
    }
  }

  return onOrderMap;
}

/**
 * Get default on-order info for products without pending orders
 */
export function getDefaultOnOrderInfo(): OnOrderInfo {
  return {
    totalOnOrderPacks: 0,
    totalOnOrderUnits: 0,
    orders: [],
  };
}
