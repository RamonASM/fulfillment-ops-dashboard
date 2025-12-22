import { prisma } from "./prisma.js";
import { cache, CacheTTL, CacheKeys } from "./cache.js";

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
  overstockCount: number;
  alertCount: number;
  lowestWeeksRemaining: number | null;
}

export interface UsageMetrics {
  calculationBasis: "12-mo" | "3-mo" | "weekly" | "none";
  avgMonthlyUnits: number;
  avgDailyUnits: number;
  avgWeeklyUnits: number;
  confidence: "high" | "medium" | "low";
  dataPointCount: number;
  calculatedAt: Date | null;
}

type StockStatus = "HEALTHY" | "WATCH" | "LOW" | "CRITICAL" | "STOCKOUT";

// =============================================================================
// CLIENT STATS BATCH LOADER
// =============================================================================

/**
 * Batch load stats for multiple clients in 3 queries instead of N*3
 */
export async function getBatchClientStats(
  clientIds: string[],
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
      overstockCount: 0,
      alertCount: 0,
      lowestWeeksRemaining: null,
    });
  }

  // Query 1: Get product counts by status per client
  const productStats = await prisma.product.groupBy({
    by: ["clientId", "stockStatus"],
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
    by: ["clientId"],
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
    by: ["clientId"],
    where: {
      clientId: { in: clientIds },
      isDismissed: false,
    },
    _count: {
      id: true,
    },
  });

  // Query 4: Get products with usage data to calculate weeks remaining
  const productsWithUsage = await prisma.product.findMany({
    where: {
      clientId: { in: clientIds },
      isActive: true,
    },
    select: {
      clientId: true,
      currentStockPacks: true,
      packSize: true,
      monthlyUsageUnits: true,
      stockStatus: true,
    },
  });

  // Process product status counts
  for (const stat of productStats) {
    const clientStats = statsMap.get(stat.clientId);
    if (clientStats) {
      const status = (
        stat.stockStatus || "HEALTHY"
      ).toUpperCase() as StockStatus;
      switch (status) {
        case "HEALTHY":
          clientStats.healthyCount = stat._count.id;
          break;
        case "WATCH":
          clientStats.watchCount = stat._count.id;
          break;
        case "LOW":
          clientStats.lowCount = stat._count.id;
          break;
        case "CRITICAL":
          clientStats.criticalCount = stat._count.id;
          break;
        case "STOCKOUT":
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
      clientStats.alertCount = count._count.id;
    }
  }

  // Process products to calculate weeks remaining and overstock per client
  for (const product of productsWithUsage) {
    const clientStats = statsMap.get(product.clientId);
    if (clientStats) {
      const currentUnits = product.currentStockPacks * product.packSize;
      const monthlyUsage = product.monthlyUsageUnits || 0;

      // Count overstock products (more than 6 months supply)
      if (monthlyUsage > 0 && currentUnits > monthlyUsage * 6) {
        clientStats.overstockCount++;
      }

      // Calculate weeks remaining
      if (monthlyUsage > 0 && currentUnits > 0) {
        const weeksRemaining = (currentUnits / monthlyUsage) * 4.33;
        // Track the lowest weeks remaining
        if (
          clientStats.lowestWeeksRemaining === null ||
          weeksRemaining < clientStats.lowestWeeksRemaining
        ) {
          clientStats.lowestWeeksRemaining =
            Math.round(weeksRemaining * 10) / 10;
        }
      }
    }
  }

  return statsMap;
}

// =============================================================================
// USAGE METRICS BATCH LOADER
// =============================================================================

/**
 * Batch load usage metrics for multiple products
 * Now reads from Product table directly (populated by DS Analytics)
 * instead of the legacy usageMetric table
 */
export async function getBatchUsageMetrics(
  productIds: string[],
): Promise<Map<string, UsageMetrics | null>> {
  const metricsMap = new Map<string, UsageMetrics | null>();

  if (productIds.length === 0) {
    return metricsMap;
  }

  // Fetch usage data directly from Product table (populated by DS Analytics)
  const products = await prisma.product.findMany({
    where: {
      id: { in: productIds },
    },
    select: {
      id: true,
      monthlyUsageUnits: true,
      monthlyUsagePacks: true,
      usageDataMonths: true,
      usageCalculationTier: true,
      usageConfidence: true,
      usageLastCalculated: true,
    },
  });

  for (const product of products) {
    // Map calculation tier to basis format
    let calculationBasis: UsageMetrics["calculationBasis"] = "none";
    if (product.usageCalculationTier) {
      const tier = product.usageCalculationTier.toLowerCase();
      if (tier.includes("12") || tier === "12_month") {
        calculationBasis = "12-mo";
      } else if (
        tier.includes("3") ||
        tier === "3_month" ||
        tier === "6_month"
      ) {
        calculationBasis = "3-mo";
      } else if (tier === "weekly") {
        calculationBasis = "weekly";
      }
    }

    // Calculate daily/weekly from monthly
    const monthlyUnits = product.monthlyUsageUnits || 0;
    const avgDailyUnits = monthlyUnits / 30.44;

    const usage: UsageMetrics = {
      calculationBasis,
      avgMonthlyUnits: monthlyUnits,
      avgDailyUnits,
      avgWeeklyUnits: avgDailyUnits * 7,
      confidence:
        (product.usageConfidence as UsageMetrics["confidence"]) || "low",
      dataPointCount: product.usageDataMonths || 0,
      calculatedAt: product.usageLastCalculated,
    };

    metricsMap.set(product.id, usage);
  }

  // Initialize any missing products with null
  for (const productId of productIds) {
    if (!metricsMap.has(productId)) {
      metricsMap.set(productId, null);
    }
  }

  return metricsMap;
}

/**
 * Batch load product names for order items
 */
export async function getBatchProductNames(
  productIds: string[],
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

function getConfidenceLevel(dataPointCount: number): "high" | "medium" | "low" {
  if (dataPointCount >= 12) return "high";
  if (dataPointCount >= 6) return "medium";
  return "low";
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
    overstockCount: 0,
    alertCount: 0,
    lowestWeeksRemaining: null,
  };
}

/**
 * Get default usage metrics for products without data
 */
export function getDefaultUsageMetrics(): UsageMetrics {
  return {
    calculationBasis: "none",
    avgMonthlyUnits: 0,
    avgDailyUnits: 0,
    avgWeeklyUnits: 0,
    confidence: "low",
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
  clientId?: string,
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
  const pendingStatuses = [
    "pending",
    "approved",
    "submitted",
    "acknowledged",
    "on_hold",
  ];

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
      createdAt: "desc",
    },
  });

  // Aggregate on-order quantities per product
  for (const item of orderItems) {
    const info = onOrderMap.get(item.productId);
    if (info) {
      const packSize = item.product?.packSize || 1;
      info.totalOnOrderPacks += item.quantityPacks;
      info.totalOnOrderUnits +=
        item.quantityUnits || item.quantityPacks * packSize;
      info.orders.push({
        orderId: item.id,
        orderRequestId: item.orderRequest.id,
        status: item.orderRequest.status,
        quantityPacks: item.quantityPacks,
        quantityUnits: item.quantityUnits || item.quantityPacks * packSize,
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
