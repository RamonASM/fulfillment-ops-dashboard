// =============================================================================
// ANALYTICS SERVICE (Phase 11)
// Pre-aggregated analytics and trend calculations
// =============================================================================

import { prisma, Prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { cache, CacheTTL, CacheKeys } from "../lib/cache.js";
import {
  subDays,
  startOfDay,
  endOfDay,
  format,
  differenceInHours,
} from "date-fns";

// Types
interface DailySummary {
  date: string;
  totalProducts: number;
  healthyCount: number;
  watchCount: number;
  lowCount: number;
  criticalCount: number;
  stockoutCount: number;
  alertsCreated: number;
  alertsResolved: number;
}

interface InventoryHealthMetrics {
  overall: {
    totalProducts: number;
    healthyPercent: number;
    atRiskPercent: number;
    avgWeeksRemaining: number;
  };
  byStatus: Record<string, number>;
  byClient: Array<{
    clientId: string;
    clientName: string;
    totalProducts: number;
    healthyPercent: number;
    criticalCount: number;
  }>;
  trend: {
    direction: "improving" | "declining" | "stable";
    changePercent: number;
  };
}

interface AlertTrend {
  date: string;
  created: number;
  resolved: number;
  net: number;
}

interface PortfolioRisk {
  clientId: string;
  clientName: string;
  avgRiskScore: number;
  highRiskProducts: number;
  totalProducts: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  topRiskFactors: Array<{ factor: string; count: number }>;
}

interface InventoryTurnover {
  clientId: string;
  productId: string;
  productName: string;
  turnoverRatio: number;
  avgDaysOnHand: number;
  totalConsumed: number;
  avgInventory: number;
}

interface ForecastAccuracy {
  productId: string;
  productName: string;
  predictedUsage: number;
  actualUsage: number;
  accuracy: number;
  mape: number;
}

// =============================================================================
// DAILY SUMMARY
// =============================================================================

export async function getDailySummary(
  clientId: string,
  days: number = 30,
): Promise<DailySummary[]> {
  const startDate = subDays(new Date(), days);

  // Get daily snapshots
  const snapshots = await prisma.dailySnapshot.findMany({
    where: {
      product: { clientId },
      snapshotDate: { gte: startDate },
    },
    orderBy: { snapshotDate: "asc" },
  });

  // Get daily alert metrics
  const alertMetrics = await prisma.dailyAlertMetrics.findMany({
    where: {
      clientId,
      metricDate: { gte: startDate },
    },
    orderBy: { metricDate: "asc" },
  });

  // Group by date
  const summaryMap = new Map<string, DailySummary>();

  for (const snapshot of snapshots) {
    const dateKey = format(snapshot.snapshotDate, "yyyy-MM-dd");
    const existing = summaryMap.get(dateKey) || {
      date: dateKey,
      totalProducts: 0,
      healthyCount: 0,
      watchCount: 0,
      lowCount: 0,
      criticalCount: 0,
      stockoutCount: 0,
      alertsCreated: 0,
      alertsResolved: 0,
    };

    existing.totalProducts++;
    existing.alertsCreated += snapshot.alertsCreated;

    switch (snapshot.stockStatus) {
      case "HEALTHY":
        existing.healthyCount++;
        break;
      case "WATCH":
        existing.watchCount++;
        break;
      case "LOW":
        existing.lowCount++;
        break;
      case "CRITICAL":
        existing.criticalCount++;
        break;
      case "STOCKOUT":
        existing.stockoutCount++;
        break;
    }

    summaryMap.set(dateKey, existing);
  }

  // Add alert resolution data
  for (const metric of alertMetrics) {
    const dateKey = format(metric.metricDate, "yyyy-MM-dd");
    const existing = summaryMap.get(dateKey);
    if (existing) {
      existing.alertsCreated = metric.createdCount;
      existing.alertsResolved = metric.resolvedCount;
    }
  }

  return Array.from(summaryMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date),
  );
}

// =============================================================================
// INVENTORY HEALTH
// =============================================================================

export async function getInventoryHealth(): Promise<InventoryHealthMetrics> {
  const cacheKey = CacheKeys.inventoryHealth();
  const cached = cache.get<InventoryHealthMetrics>(cacheKey);
  if (cached) return cached;

  const products = await prisma.product.findMany({
    where: { isActive: true },
    include: { client: { select: { id: true, name: true } } },
  });

  const byStatus: Record<string, number> = {
    HEALTHY: 0,
    WATCH: 0,
    LOW: 0,
    CRITICAL: 0,
    STOCKOUT: 0,
  };

  const clientMap = new Map<
    string,
    {
      clientId: string;
      clientName: string;
      total: number;
      healthy: number;
      critical: number;
      weeksSum: number;
    }
  >();

  let totalWeeksRemaining = 0;
  let productsWithWeeks = 0;

  for (const product of products) {
    const status = product.stockStatus || "HEALTHY";
    byStatus[status] = (byStatus[status] || 0) + 1;

    if (product.weeksRemaining !== null) {
      totalWeeksRemaining += product.weeksRemaining;
      productsWithWeeks++;
    }

    // Client aggregation
    const clientData = clientMap.get(product.clientId) || {
      clientId: product.clientId,
      clientName: product.client.name,
      total: 0,
      healthy: 0,
      critical: 0,
      weeksSum: 0,
    };

    clientData.total++;
    if (status === "HEALTHY") clientData.healthy++;
    if (status === "CRITICAL" || status === "STOCKOUT") clientData.critical++;
    if (product.weeksRemaining !== null)
      clientData.weeksSum += product.weeksRemaining;

    clientMap.set(product.clientId, clientData);
  }

  const total = products.length;
  const atRisk = byStatus.LOW + byStatus.CRITICAL + byStatus.STOCKOUT;

  // Calculate trend from last 7 days of snapshots
  const lastWeekSnapshots = await prisma.dailySnapshot.findMany({
    where: {
      snapshotDate: { gte: subDays(new Date(), 7) },
    },
    orderBy: { snapshotDate: "desc" },
  });

  const recentHealthy = lastWeekSnapshots.filter(
    (s) => s.stockStatus === "HEALTHY",
  ).length;
  const totalSnapshots = lastWeekSnapshots.length;
  const recentHealthyPercent =
    totalSnapshots > 0 ? (recentHealthy / totalSnapshots) * 100 : 0;
  const currentHealthyPercent =
    total > 0 ? (byStatus.HEALTHY / total) * 100 : 0;
  const changePercent = currentHealthyPercent - recentHealthyPercent;

  const result: InventoryHealthMetrics = {
    overall: {
      totalProducts: total,
      healthyPercent: total > 0 ? (byStatus.HEALTHY / total) * 100 : 0,
      atRiskPercent: total > 0 ? (atRisk / total) * 100 : 0,
      avgWeeksRemaining:
        productsWithWeeks > 0 ? totalWeeksRemaining / productsWithWeeks : 0,
    },
    byStatus,
    byClient: Array.from(clientMap.values()).map((c) => ({
      clientId: c.clientId,
      clientName: c.clientName,
      totalProducts: c.total,
      healthyPercent: c.total > 0 ? (c.healthy / c.total) * 100 : 0,
      criticalCount: c.critical,
    })),
    trend: {
      direction:
        changePercent > 2
          ? "improving"
          : changePercent < -2
            ? "declining"
            : "stable",
      changePercent: Math.abs(changePercent),
    },
  };

  cache.set(cacheKey, result, CacheTTL.CLIENT_AGGREGATES);
  return result;
}

// =============================================================================
// ALERT TRENDS
// =============================================================================

export async function getAlertTrends(
  clientId: string,
  days: number = 30,
): Promise<AlertTrend[]> {
  const cacheKey = CacheKeys.alertTrends(clientId);
  const cached = cache.get<AlertTrend[]>(cacheKey);
  if (cached) return cached;

  const startDate = subDays(new Date(), days);

  const metrics = await prisma.dailyAlertMetrics.findMany({
    where: {
      clientId,
      metricDate: { gte: startDate },
    },
    orderBy: { metricDate: "asc" },
  });

  const result = metrics.map((m) => ({
    date: format(m.metricDate, "yyyy-MM-dd"),
    created: m.createdCount,
    resolved: m.resolvedCount,
    net: m.createdCount - m.resolvedCount,
  }));

  cache.set(cacheKey, result, CacheTTL.ALERT_TRENDS);
  return result;
}

// =============================================================================
// PORTFOLIO RISK
// =============================================================================

export async function getPortfolioRisk(): Promise<PortfolioRisk[]> {
  const clients = await prisma.client.findMany({
    where: { isActive: true },
    include: {
      products: {
        where: { isActive: true },
        include: { riskScoreCache: true },
      },
    },
  });

  return clients.map((client) => {
    const riskScores = client.products
      .filter((p) => p.riskScoreCache)
      .map((p) => ({
        score: p.riskScoreCache!.score,
        factors: p.riskScoreCache!.factors as Array<{
          factor: string;
          value: number;
        }>,
      }));

    const avgScore =
      riskScores.length > 0
        ? riskScores.reduce((sum, r) => sum + r.score, 0) / riskScores.length
        : 0;

    const highRiskProducts = riskScores.filter((r) => r.score >= 70).length;

    // Aggregate risk factors
    const factorCounts = new Map<string, number>();
    for (const r of riskScores) {
      for (const f of r.factors) {
        if (f.value >= 50) {
          factorCounts.set(f.factor, (factorCounts.get(f.factor) || 0) + 1);
        }
      }
    }

    const topRiskFactors = Array.from(factorCounts.entries())
      .map(([factor, count]) => ({ factor, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    return {
      clientId: client.id,
      clientName: client.name,
      avgRiskScore: Math.round(avgScore),
      highRiskProducts,
      totalProducts: client.products.length,
      riskLevel:
        avgScore >= 80
          ? "critical"
          : avgScore >= 60
            ? "high"
            : avgScore >= 40
              ? "medium"
              : "low",
      topRiskFactors,
    };
  });
}

// =============================================================================
// INVENTORY TURNOVER
// =============================================================================

export async function getInventoryTurnover(
  clientId: string,
  months: number = 12,
): Promise<InventoryTurnover[]> {
  const startDate = subDays(new Date(), months * 30);

  const products = await prisma.product.findMany({
    where: { clientId, isActive: true },
    include: {
      transactions: {
        where: { dateSubmitted: { gte: startDate } },
      },
      stockHistory: {
        where: { recordedAt: { gte: startDate } },
        orderBy: { recordedAt: "asc" },
      },
    },
  });

  return products
    .map((product) => {
      // Calculate total consumed
      const totalConsumed = product.transactions.reduce(
        (sum, t) => sum + t.quantityUnits,
        0,
      );

      // Calculate average inventory from stock history
      const stockLevels = product.stockHistory.map((s) => s.totalUnits);
      const avgInventory =
        stockLevels.length > 0
          ? stockLevels.reduce((sum, s) => sum + s, 0) / stockLevels.length
          : product.currentStockUnits;

      // Calculate turnover ratio (annual)
      const turnoverRatio =
        avgInventory > 0
          ? (totalConsumed / avgInventory) * (365 / (months * 30))
          : 0;

      // Calculate average days on hand
      const avgDaysOnHand = turnoverRatio > 0 ? 365 / turnoverRatio : 0;

      return {
        clientId: product.clientId,
        productId: product.id,
        productName: product.name,
        turnoverRatio: Math.round(turnoverRatio * 100) / 100,
        avgDaysOnHand: Math.round(avgDaysOnHand),
        totalConsumed,
        avgInventory: Math.round(avgInventory),
      };
    })
    .sort((a, b) => b.turnoverRatio - a.turnoverRatio);
}

// =============================================================================
// FORECAST ACCURACY
// =============================================================================

export async function getForecastAccuracy(
  clientId: string,
  days: number = 30,
): Promise<ForecastAccuracy[]> {
  const startDate = subDays(new Date(), days);

  const products = await prisma.product.findMany({
    where: { clientId, isActive: true },
    include: {
      usageMetrics: {
        where: {
          periodType: "monthly",
          periodStart: { gte: subDays(new Date(), 90) },
        },
        orderBy: { periodStart: "desc" },
        take: 3,
      },
      transactions: {
        where: { dateSubmitted: { gte: startDate } },
      },
    },
  });

  return products
    .filter((p) => p.usageMetrics.length >= 2)
    .map((product) => {
      // Predicted usage (avg of last 3 months, adjusted for days)
      const avgMonthlyUsage =
        product.usageMetrics.reduce((sum, m) => sum + m.totalConsumedUnits, 0) /
        product.usageMetrics.length;
      const predictedUsage = Math.round((avgMonthlyUsage / 30) * days);

      // Actual usage in period
      const actualUsage = product.transactions.reduce(
        (sum, t) => sum + t.quantityUnits,
        0,
      );

      // Calculate accuracy and MAPE
      const error = Math.abs(predictedUsage - actualUsage);
      const accuracy =
        actualUsage > 0
          ? Math.max(0, 100 - (error / actualUsage) * 100)
          : predictedUsage === 0
            ? 100
            : 0;
      const mape = actualUsage > 0 ? (error / actualUsage) * 100 : 0;

      return {
        productId: product.id,
        productName: product.name,
        predictedUsage,
        actualUsage,
        accuracy: Math.round(accuracy),
        mape: Math.round(mape * 10) / 10,
      };
    })
    .sort((a, b) => b.accuracy - a.accuracy);
}

// =============================================================================
// AGGREGATION JOBS (called by scheduler)
// =============================================================================

export async function createDailySnapshot(): Promise<void> {
  logger.info("Creating daily snapshots");

  const today = startOfDay(new Date());
  const products = await prisma.product.findMany({
    where: { isActive: true },
    select: {
      id: true,
      currentStockPacks: true,
      currentStockUnits: true,
      stockStatus: true,
    },
  });

  // Get alerts created today per product
  const alertCounts = await prisma.alert.groupBy({
    by: ["productId"],
    where: {
      createdAt: {
        gte: today,
        lt: endOfDay(today),
      },
      productId: { not: null },
    },
    _count: { id: true },
  });

  const alertCountMap = new Map(
    alertCounts.map((a) => [a.productId, a._count.id]),
  );

  // Upsert snapshots
  for (const product of products) {
    await prisma.dailySnapshot.upsert({
      where: {
        productId_snapshotDate: {
          productId: product.id,
          snapshotDate: today,
        },
      },
      create: {
        productId: product.id,
        snapshotDate: today,
        packsAvailable: product.currentStockPacks,
        unitsAvailable: product.currentStockUnits,
        stockStatus: product.stockStatus || "HEALTHY",
        alertsCreated: alertCountMap.get(product.id) || 0,
      },
      update: {
        packsAvailable: product.currentStockPacks,
        unitsAvailable: product.currentStockUnits,
        stockStatus: product.stockStatus || "HEALTHY",
        alertsCreated: alertCountMap.get(product.id) || 0,
      },
    });
  }

  logger.info("Created daily snapshots", { count: products.length });
}

export async function aggregateDailyAlertMetrics(): Promise<void> {
  logger.info("Aggregating daily alert metrics");

  const today = startOfDay(new Date());
  const clients = await prisma.client.findMany({
    where: { isActive: true },
    select: { id: true },
  });

  for (const client of clients) {
    // Get alerts created today
    const createdAlerts = await prisma.alert.findMany({
      where: {
        clientId: client.id,
        createdAt: { gte: today, lt: endOfDay(today) },
      },
    });

    // Get alerts resolved today
    const resolvedAlerts = await prisma.alert.findMany({
      where: {
        clientId: client.id,
        isDismissed: true,
        dismissedAt: { gte: today, lt: endOfDay(today) },
      },
    });

    // Group by type and severity
    const byType: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};

    for (const alert of createdAlerts) {
      byType[alert.alertType] = (byType[alert.alertType] || 0) + 1;
      bySeverity[alert.severity] = (bySeverity[alert.severity] || 0) + 1;
    }

    // Calculate average resolution time
    let totalResolutionHours = 0;
    for (const alert of resolvedAlerts) {
      if (alert.dismissedAt) {
        totalResolutionHours += differenceInHours(
          alert.dismissedAt,
          alert.createdAt,
        );
      }
    }
    const avgResolutionHours =
      resolvedAlerts.length > 0
        ? totalResolutionHours / resolvedAlerts.length
        : null;

    await prisma.dailyAlertMetrics.upsert({
      where: {
        clientId_metricDate: {
          clientId: client.id,
          metricDate: today,
        },
      },
      create: {
        clientId: client.id,
        metricDate: today,
        createdCount: createdAlerts.length,
        resolvedCount: resolvedAlerts.length,
        byType,
        bySeverity,
        avgResolutionHours,
      },
      update: {
        createdCount: createdAlerts.length,
        resolvedCount: resolvedAlerts.length,
        byType,
        bySeverity,
        avgResolutionHours,
      },
    });
  }

  logger.info("Aggregated alert metrics", { clientCount: clients.length });
}

export async function refreshRiskScoreCache(): Promise<void> {
  logger.info("Refreshing risk score cache");

  // Import risk scoring service dynamically to avoid circular deps
  const { calculateProductRisk } = await import("./ai/risk-scoring.service.js");

  const products = await prisma.product.findMany({
    where: { isActive: true },
    select: { id: true },
  });

  const expiresAt = new Date(Date.now() + CacheTTL.RISK_SCORES);
  let updated = 0;

  for (const product of products) {
    try {
      const risk = await calculateProductRisk(product.id);

      await prisma.riskScoreCache.upsert({
        where: { productId: product.id },
        create: {
          productId: product.id,
          score: risk.score,
          riskLevel: risk.riskLevel,
          factors: risk.factors as unknown as Prisma.InputJsonValue,
          calculatedAt: new Date(),
          expiresAt,
        },
        update: {
          score: risk.score,
          riskLevel: risk.riskLevel,
          factors: risk.factors as unknown as Prisma.InputJsonValue,
          calculatedAt: new Date(),
          expiresAt,
        },
      });
      updated++;
    } catch (error) {
      logger.error(`Failed to cache risk score`, error as Error, {
        productId: product.id,
      });
    }
  }

  logger.info("Refreshed risk score cache", {
    updatedCount: updated,
    totalProducts: products.length,
  });
}

// =============================================================================
// EXTENDED ANALYTICS - PRODUCT, LOCATION, USER, FINANCIAL
// =============================================================================

export interface ProductAnalytics {
  id: string;
  productId: string;
  name: string;
  totalOrders: number;
  totalUnits: number;
  avgOrderSize: number;
  orderFrequency: number;
  velocity: "fast" | "medium" | "slow" | "dead";
  abcClass: "A" | "B" | "C";
  trend: "growing" | "stable" | "declining";
  lastOrderDate: Date | null;
  daysSinceLastOrder: number | null;
  currentStock: number;
  monthlyUsage: number;
  weeksOfSupply: number | null;
  stockoutDate: Date | null;
  reorderUrgency: "critical" | "soon" | "ok" | "overstock";
}

export interface LocationAnalytics {
  locationId: string;
  locationName: string;
  company: string;
  totalOrders: number;
  totalUnits: number;
  orderFrequency: number;
  topProducts: Array<{ productId: string; name: string; units: number }>;
  lastOrderDate: Date | null;
}

export interface AnomalyAlert {
  type:
    | "demand_spike"
    | "demand_drop"
    | "unusual_order"
    | "dead_stock"
    | "overstock";
  severity: "high" | "medium" | "low";
  productId?: string;
  productName?: string;
  locationId?: string;
  message: string;
  details: string;
  detectedAt: Date;
  value?: number;
  expectedValue?: number;
}

export interface ReorderRecommendation {
  productId: string;
  productName: string;
  currentStock: number;
  currentStockPacks: number;
  monthlyUsage: number;
  monthlyUsagePacks: number;
  weeksRemaining: number;
  stockStatus: string;
  suggestedQty: number;
  suggestedQtyPacks: number;
  urgency: "critical" | "high" | "medium" | "low";
  reason: string;
  stockoutDate: Date | null;
  confidence: string;
  confidenceScore: number;
  trend: string;
  calculationMethod: string;
  seasonalityDetected: boolean;
}

export interface IntelligentDashboardSummary {
  stockHealth: {
    critical: number;
    low: number;
    watch: number;
    healthy: number;
    overstock: number;
  };
  activity: {
    ordersThisWeek: number;
    ordersLastWeek: number;
    unitsThisMonth: number;
    avgDailyOrders: number;
  };
  alerts: {
    critical: number;
    warnings: number;
    info: number;
  };
  topProducts: Array<{
    id: string;
    name: string;
    units: number;
    trend: string;
  }>;
  upcomingStockouts: Array<{
    id: string;
    name: string;
    daysUntil: number;
    currentStock: number;
  }>;
  reorderQueue: ReorderRecommendation[];
}

/**
 * Get comprehensive product analytics with ABC classification, velocity, and trends
 */
export async function getProductAnalytics(
  clientId: string,
): Promise<ProductAnalytics[]> {
  const now = new Date();
  const twelveMonthsAgo = subDays(now, 365);
  const threeMonthsAgo = subDays(now, 90);
  const oneMonthAgo = subDays(now, 30);
  const twoMonthsAgo = subDays(now, 60);

  const products = await prisma.product.findMany({
    where: { clientId, isActive: true },
    include: {
      transactions: {
        where: {
          orderStatus: { in: ["completed", "Completed", "COMPLETED"] },
          dateSubmitted: { gte: twelveMonthsAgo },
        },
        orderBy: { dateSubmitted: "desc" },
      },
    },
  });

  // Calculate totals for ABC classification
  const productTotals = products.map((p) => ({
    id: p.id,
    totalUnits: p.transactions.reduce((sum, t) => sum + t.quantityUnits, 0),
  }));

  const grandTotalUnits = productTotals.reduce(
    (sum, p) => sum + p.totalUnits,
    0,
  );
  productTotals.sort((a, b) => b.totalUnits - a.totalUnits);

  // ABC classification (Pareto principle)
  let cumulative = 0;
  const abcMap = new Map<string, "A" | "B" | "C">();
  for (const p of productTotals) {
    cumulative += p.totalUnits;
    const percentage =
      grandTotalUnits > 0 ? (cumulative / grandTotalUnits) * 100 : 0;
    abcMap.set(p.id, percentage <= 80 ? "A" : percentage <= 95 ? "B" : "C");
  }

  const analytics: ProductAnalytics[] = [];

  for (const product of products) {
    const transactions = product.transactions;
    const totalUnits = transactions.reduce(
      (sum, t) => sum + t.quantityUnits,
      0,
    );
    const totalOrders = transactions.length;

    // Calculate monthly usage from recent data
    const recentTransactions = transactions.filter(
      (t) => t.dateSubmitted >= threeMonthsAgo,
    );
    const monthsOfData = 3;
    const monthlyUsage =
      recentTransactions.reduce((sum, t) => sum + t.quantityUnits, 0) /
      monthsOfData;

    // Velocity classification
    let velocity: "fast" | "medium" | "slow" | "dead";
    if (monthlyUsage >= 100) velocity = "fast";
    else if (monthlyUsage >= 20) velocity = "medium";
    else if (monthlyUsage > 0) velocity = "slow";
    else velocity = "dead";

    // Trend (compare last month vs previous month)
    const lastMonthTxns = transactions.filter(
      (t) => t.dateSubmitted >= oneMonthAgo,
    );
    const prevMonthTxns = transactions.filter(
      (t) => t.dateSubmitted >= twoMonthsAgo && t.dateSubmitted < oneMonthAgo,
    );
    const lastMonthUnits = lastMonthTxns.reduce(
      (sum, t) => sum + t.quantityUnits,
      0,
    );
    const prevMonthUnits = prevMonthTxns.reduce(
      (sum, t) => sum + t.quantityUnits,
      0,
    );

    let trend: "growing" | "stable" | "declining";
    if (prevMonthUnits === 0) {
      trend = lastMonthUnits > 0 ? "growing" : "stable";
    } else {
      const change = ((lastMonthUnits - prevMonthUnits) / prevMonthUnits) * 100;
      trend = change > 15 ? "growing" : change < -15 ? "declining" : "stable";
    }

    const lastOrderDate = transactions[0]?.dateSubmitted || null;
    const daysSinceLastOrder = lastOrderDate
      ? Math.floor(
          (now.getTime() - lastOrderDate.getTime()) / (1000 * 60 * 60 * 24),
        )
      : null;

    const currentStock =
      product.currentStockUnits || product.currentStockPacks * product.packSize;
    const weeklyUsage = monthlyUsage / 4.33;
    const weeksOfSupply = weeklyUsage > 0 ? currentStock / weeklyUsage : null;

    const stockoutDate =
      weeklyUsage > 0 && currentStock > 0
        ? new Date(
            now.getTime() +
              (currentStock / (monthlyUsage / 30)) * 24 * 60 * 60 * 1000,
          )
        : null;

    let reorderUrgency: "critical" | "soon" | "ok" | "overstock";
    if (weeksOfSupply === null || weeksOfSupply > 16) {
      reorderUrgency = monthlyUsage === 0 ? "ok" : "overstock";
    } else if (weeksOfSupply <= 2) {
      reorderUrgency = "critical";
    } else if (weeksOfSupply <= 4) {
      reorderUrgency = "soon";
    } else {
      reorderUrgency = "ok";
    }

    analytics.push({
      id: product.id,
      productId: product.productId,
      name: product.name,
      totalOrders,
      totalUnits,
      avgOrderSize: totalOrders > 0 ? Math.round(totalUnits / totalOrders) : 0,
      orderFrequency: Math.round((totalOrders / 12) * 10) / 10,
      velocity,
      abcClass: abcMap.get(product.id) || "C",
      trend,
      lastOrderDate,
      daysSinceLastOrder,
      currentStock,
      monthlyUsage: Math.round(monthlyUsage),
      weeksOfSupply: weeksOfSupply ? Math.round(weeksOfSupply * 10) / 10 : null,
      stockoutDate,
      reorderUrgency,
    });
  }

  return analytics;
}

/**
 * Get analytics by shipping location
 */
export async function getLocationAnalytics(
  clientId: string,
): Promise<LocationAnalytics[]> {
  const twelveMonthsAgo = subDays(new Date(), 365);

  const transactions = await prisma.transaction.findMany({
    where: {
      product: { clientId },
      orderStatus: { in: ["completed", "Completed", "COMPLETED"] },
      dateSubmitted: { gte: twelveMonthsAgo },
    },
    include: {
      product: { select: { productId: true, name: true } },
    },
  });

  // Group by location
  const locationMap = new Map<
    string,
    {
      transactions: typeof transactions;
      company: string;
    }
  >();

  for (const txn of transactions) {
    const key = txn.shipToLocation || txn.shipToCompany || "Unknown";
    if (!locationMap.has(key)) {
      locationMap.set(key, {
        transactions: [],
        company: txn.shipToCompany || "Unknown",
      });
    }
    locationMap.get(key)!.transactions.push(txn);
  }

  const analytics: LocationAnalytics[] = [];

  for (const [locationId, data] of locationMap.entries()) {
    const txns = data.transactions;
    const totalUnits = txns.reduce((sum, t) => sum + t.quantityUnits, 0);
    const orderIds = new Set(txns.map((t) => t.orderId));

    // Top products
    const productCounts = new Map<string, { name: string; units: number }>();
    for (const txn of txns) {
      const key = txn.product.productId;
      const existing = productCounts.get(key) || {
        name: txn.product.name,
        units: 0,
      };
      existing.units += txn.quantityUnits;
      productCounts.set(key, existing);
    }

    const topProducts = Array.from(productCounts.entries())
      .map(([productId, d]) => ({ productId, ...d }))
      .sort((a, b) => b.units - a.units)
      .slice(0, 5);

    const lastOrderDate =
      txns.length > 0
        ? new Date(Math.max(...txns.map((t) => t.dateSubmitted.getTime())))
        : null;

    analytics.push({
      locationId,
      locationName: locationId,
      company: data.company,
      totalOrders: orderIds.size,
      totalUnits,
      orderFrequency: Math.round((orderIds.size / 12) * 10) / 10,
      topProducts,
      lastOrderDate,
    });
  }

  return analytics.sort((a, b) => b.totalUnits - a.totalUnits);
}

/**
 * Detect anomalies in ordering patterns
 */
export async function detectAnomalies(
  clientId: string,
): Promise<AnomalyAlert[]> {
  const now = new Date();
  const alerts: AnomalyAlert[] = [];
  const oneWeekAgo = subDays(now, 7);
  const twoWeeksAgo = subDays(now, 14);
  const threeMonthsAgo = subDays(now, 90);
  const ninetyDaysAgo = subDays(now, 90);

  const products = await prisma.product.findMany({
    where: { clientId, isActive: true },
    include: {
      transactions: {
        where: { orderStatus: { in: ["completed", "Completed", "COMPLETED"] } },
        orderBy: { dateSubmitted: "desc" },
      },
    },
  });

  for (const product of products) {
    const transactions = product.transactions;
    const currentStock =
      product.currentStockUnits || product.currentStockPacks * product.packSize;

    // Baseline (average weekly units over 3 months, excluding last week)
    const baselineTransactions = transactions.filter(
      (t) => t.dateSubmitted >= threeMonthsAgo && t.dateSubmitted < oneWeekAgo,
    );
    const baselineWeeks = Math.max(
      1,
      Math.floor(
        (now.getTime() - threeMonthsAgo.getTime()) / (7 * 24 * 60 * 60 * 1000),
      ) - 1,
    );
    const avgWeeklyUnits =
      baselineTransactions.reduce((sum, t) => sum + t.quantityUnits, 0) /
      baselineWeeks;

    // Recent week
    const recentTransactions = transactions.filter(
      (t) => t.dateSubmitted >= oneWeekAgo,
    );
    const recentUnits = recentTransactions.reduce(
      (sum, t) => sum + t.quantityUnits,
      0,
    );

    // Demand spike (2x+ normal)
    if (avgWeeklyUnits > 5 && recentUnits > avgWeeklyUnits * 2) {
      alerts.push({
        type: "demand_spike",
        severity: recentUnits > avgWeeklyUnits * 3 ? "high" : "medium",
        productId: product.productId,
        productName: product.name,
        message: `Demand spike: ${product.name}`,
        details: `${recentUnits} units this week vs. avg ${Math.round(avgWeeklyUnits)}/week (${Math.round((recentUnits / avgWeeklyUnits) * 100)}%)`,
        detectedAt: now,
        value: recentUnits,
        expectedValue: avgWeeklyUnits,
      });
    }

    // Demand drop (< 25% of normal for 2 weeks)
    const twoWeekTxns = transactions.filter(
      (t) => t.dateSubmitted >= twoWeeksAgo,
    );
    const twoWeekUnits = twoWeekTxns.reduce(
      (sum, t) => sum + t.quantityUnits,
      0,
    );
    if (avgWeeklyUnits > 10 && twoWeekUnits < avgWeeklyUnits * 0.5) {
      alerts.push({
        type: "demand_drop",
        severity: "medium",
        productId: product.productId,
        productName: product.name,
        message: `Demand drop: ${product.name}`,
        details: `Only ${twoWeekUnits} units in 2 weeks vs. expected ${Math.round(avgWeeklyUnits * 2)}`,
        detectedAt: now,
        value: twoWeekUnits,
        expectedValue: avgWeeklyUnits * 2,
      });
    }

    // Dead stock (no orders in 90 days with inventory)
    const lastOrder = transactions[0]?.dateSubmitted;
    if ((!lastOrder || lastOrder < ninetyDaysAgo) && currentStock > 0) {
      alerts.push({
        type: "dead_stock",
        severity: currentStock > 100 ? "high" : "low",
        productId: product.productId,
        productName: product.name,
        message: `Dead stock: ${product.name}`,
        details: `No orders in 90+ days, ${currentStock} units in stock`,
        detectedAt: now,
        value: currentStock,
      });
    }

    // Overstock (> 6 months supply)
    const monthlyUsage = avgWeeklyUnits * 4.33;
    if (monthlyUsage > 0 && currentStock > monthlyUsage * 6) {
      const monthsOfStock = Math.round(currentStock / monthlyUsage);
      alerts.push({
        type: "overstock",
        severity: monthsOfStock > 12 ? "high" : "medium",
        productId: product.productId,
        productName: product.name,
        message: `Overstock: ${product.name}`,
        details: `${monthsOfStock} months of supply (${currentStock} units)`,
        detectedAt: now,
        value: currentStock,
        expectedValue: monthlyUsage * 3,
      });
    }
  }

  // Sort by severity
  const severityOrder = { high: 0, medium: 1, low: 2 };
  alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return alerts;
}

/**
 * Generate smart reorder recommendations
 */
export async function getReorderRecommendations(
  clientId: string,
): Promise<ReorderRecommendation[]> {
  const now = new Date();

  // Get products with DS Analytics calculations
  const products = await prisma.product.findMany({
    where: {
      clientId,
      isActive: true,
      OR: [
        { stockStatus: { in: ["critical", "low", "watch"] } },
        { weeksRemaining: { lte: 8 } },
      ],
    },
    orderBy: [
      { stockStatus: "asc" }, // critical first
      { weeksRemaining: "asc" },
    ],
    take: 20, // Top 20 products needing attention
  });

  const recommendations: ReorderRecommendation[] = [];

  for (const product of products) {
    // Use DS Analytics calculated values if available
    const monthlyUsage = product.monthlyUsageUnits || 0;
    const weeksRemaining = product.weeksRemaining || 0;
    // Calculate suggested qty based on monthly usage (2 months supply)
    const suggestedQty = monthlyUsage > 0 ? Math.ceil(monthlyUsage * 2) : 0;
    const stockStatus = product.stockStatus || "unknown";
    const confidence = product.usageConfidence || "low";
    // TODO: Add trend analysis if needed
    const trend: "increasing" | "stable" | "decreasing" = "stable";
    const calculationMethod = product.usageCalculationTier || "estimated";

    // Skip products without usage data
    if (monthlyUsage < 1) continue;

    // Determine urgency based on stock status and weeks remaining
    let urgency: "critical" | "high" | "medium" | "low";
    let reason: string;

    if (stockStatus === "critical" || weeksRemaining <= 2) {
      urgency = "critical";
      reason = `${weeksRemaining.toFixed(1)} weeks remaining`;
    } else if (stockStatus === "low" || weeksRemaining <= 4) {
      urgency = "high";
      reason = `${Math.round(weeksRemaining)} weeks of supply left`;
    } else if (stockStatus === "watch" || weeksRemaining <= 6) {
      urgency = "medium";
      reason = "Approaching reorder point";
    } else {
      urgency = "low";
      reason = "Planned reorder";
    }

    // Add trend information to reasoning (currently disabled, would need historical analysis)
    // if (trend === "increasing") {
    //   reason += " (demand trending up)";
    // } else if (trend === "decreasing") {
    //   reason += " (demand trending down)";
    // }

    // Calculate stockout date
    const stockoutDate =
      product.projectedStockoutDate ||
      new Date(now.getTime() + weeksRemaining * 7 * 24 * 60 * 60 * 1000);

    recommendations.push({
      productId: product.id,
      productName: product.name,
      currentStock: product.currentStockUnits || 0,
      currentStockPacks: product.currentStockPacks || 0,
      monthlyUsage: Math.round(monthlyUsage),
      monthlyUsagePacks: product.monthlyUsagePacks || 0,
      weeksRemaining,
      stockStatus,
      suggestedQty:
        suggestedQty || Math.ceil((monthlyUsage * 2) / product.packSize), // 2 months supply as fallback
      suggestedQtyPacks: Math.ceil(suggestedQty / product.packSize),
      urgency,
      reason,
      stockoutDate,
      confidence,
      confidenceScore:
        confidence === "high" ? 0.85 : confidence === "medium" ? 0.65 : 0.35,
      trend,
      calculationMethod,
      // TODO: Add seasonality detection if needed
      seasonalityDetected: false,
    });
  }

  return recommendations;
}

/**
 * Get stockout countdown predictions with urgency levels
 */
export interface StockoutPrediction {
  productId: string;
  productName: string;
  currentStock: number;
  currentStockPacks: number;
  dailyUsage: number;
  weeksRemaining: number;
  daysRemaining: number;
  predictedStockoutDate: Date;
  urgency: "critical" | "high" | "medium" | "low";
  trend: "increasing" | "stable" | "decreasing";
  confidence: number;
}

export async function getStockoutPredictions(
  clientId: string,
): Promise<StockoutPrediction[]> {
  const now = new Date();

  // Get products predicted to stock out in the next 60 days
  const products = await prisma.product.findMany({
    where: {
      clientId,
      isActive: true,
      weeksRemaining: { lte: 8.6 }, // ~60 days
      monthlyUsageUnits: { gt: 0 }, // Must have usage data
    },
    orderBy: [
      { weeksRemaining: "asc" }, // Soonest stockouts first
    ],
    take: 20,
  });

  const predictions: StockoutPrediction[] = [];

  for (const product of products) {
    const monthlyUsage = product.monthlyUsageUnits || 0;
    const weeksRemaining = product.weeksRemaining || 0;
    const daysRemaining = Math.round(weeksRemaining * 7);
    const dailyUsage = monthlyUsage / 30.44; // Average days per month

    // Determine urgency based on days remaining
    let urgency: "critical" | "high" | "medium" | "low";
    if (daysRemaining <= 7) {
      urgency = "critical";
    } else if (daysRemaining <= 14) {
      urgency = "high";
    } else if (daysRemaining <= 30) {
      urgency = "medium";
    } else {
      urgency = "low";
    }

    // Calculate stockout date
    const stockoutDate =
      product.projectedStockoutDate ||
      new Date(now.getTime() + daysRemaining * 24 * 60 * 60 * 1000);

    // TODO: Add trend analysis from historical data
    const trend: "increasing" | "stable" | "decreasing" = "stable";

    // Get confidence
    const confidence =
      product.usageConfidence === "high"
        ? 0.85
        : product.usageConfidence === "medium"
          ? 0.65
          : 0.35;

    predictions.push({
      productId: product.id,
      productName: product.name,
      currentStock: product.currentStockUnits || 0,
      currentStockPacks: product.currentStockPacks || 0,
      dailyUsage,
      weeksRemaining,
      daysRemaining,
      predictedStockoutDate: stockoutDate,
      urgency,
      trend,
      confidence,
    });
  }

  return predictions;
}

/**
 * Get comprehensive intelligent dashboard summary
 */
export async function getIntelligentDashboardSummary(
  clientId: string,
): Promise<IntelligentDashboardSummary> {
  const now = new Date();
  const oneWeekAgo = subDays(now, 7);
  const twoWeeksAgo = subDays(now, 14);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // Products with usage
  const products = await prisma.product.findMany({
    where: { clientId, isActive: true },
    select: {
      id: true,
      productId: true,
      name: true,
      currentStockPacks: true,
      currentStockUnits: true,
      packSize: true,
      monthlyUsageUnits: true,
    },
  });

  // Stock health
  const stockHealth = {
    critical: 0,
    low: 0,
    watch: 0,
    healthy: 0,
    overstock: 0,
  };
  const upcomingStockouts: Array<{
    id: string;
    name: string;
    daysUntil: number;
    currentStock: number;
  }> = [];

  for (const product of products) {
    const monthlyUsage = product.monthlyUsageUnits || 0;
    const currentStock =
      product.currentStockUnits || product.currentStockPacks * product.packSize;
    const weeklyUsage = monthlyUsage / 4.33;
    const weeksRemaining = weeklyUsage > 0 ? currentStock / weeklyUsage : 999;

    if (weeksRemaining <= 2) {
      stockHealth.critical++;
      if (weeksRemaining > 0) {
        upcomingStockouts.push({
          id: product.id,
          name: product.name,
          daysUntil: Math.round(weeksRemaining * 7),
          currentStock,
        });
      }
    } else if (weeksRemaining <= 4) {
      stockHealth.low++;
      upcomingStockouts.push({
        id: product.id,
        name: product.name,
        daysUntil: Math.round(weeksRemaining * 7),
        currentStock,
      });
    } else if (weeksRemaining <= 8) {
      stockHealth.watch++;
    } else if (weeksRemaining > 16 && monthlyUsage > 0) {
      stockHealth.overstock++;
    } else {
      stockHealth.healthy++;
    }
  }

  upcomingStockouts.sort((a, b) => a.daysUntil - b.daysUntil);

  // Activity metrics
  const transactions = await prisma.transaction.findMany({
    where: {
      product: { clientId },
      orderStatus: { in: ["completed", "Completed", "COMPLETED"] },
      dateSubmitted: { gte: twoWeeksAgo },
    },
  });

  const thisWeekOrders = new Set(
    transactions
      .filter((t) => t.dateSubmitted >= oneWeekAgo)
      .map((t) => t.orderId),
  ).size;
  const lastWeekOrders = new Set(
    transactions
      .filter(
        (t) => t.dateSubmitted >= twoWeeksAgo && t.dateSubmitted < oneWeekAgo,
      )
      .map((t) => t.orderId),
  ).size;

  const thisMonthTxns = await prisma.transaction.findMany({
    where: {
      product: { clientId },
      orderStatus: { in: ["completed", "Completed", "COMPLETED"] },
      dateSubmitted: { gte: startOfMonth },
    },
  });
  const unitsThisMonth = thisMonthTxns.reduce(
    (sum, t) => sum + t.quantityUnits,
    0,
  );

  // Alerts
  const anomalies = await detectAnomalies(clientId);
  const alertCounts = {
    critical: anomalies.filter((a) => a.severity === "high").length,
    warnings: anomalies.filter((a) => a.severity === "medium").length,
    info: anomalies.filter((a) => a.severity === "low").length,
  };

  // Top products
  const productAnalytics = await getProductAnalytics(clientId);
  const topProducts = productAnalytics
    .filter((p) => p.totalUnits > 0)
    .sort((a, b) => b.totalUnits - a.totalUnits)
    .slice(0, 5)
    .map((p) => ({
      id: p.id,
      name: p.name,
      units: p.totalUnits,
      trend: p.trend,
    }));

  // Reorder queue
  const reorderQueue = await getReorderRecommendations(clientId);

  return {
    stockHealth,
    activity: {
      ordersThisWeek: thisWeekOrders,
      ordersLastWeek: lastWeekOrders,
      unitsThisMonth,
      avgDailyOrders:
        Math.round(((thisWeekOrders + lastWeekOrders) / 14) * 10) / 10,
    },
    alerts: alertCounts,
    topProducts,
    upcomingStockouts: upcomingStockouts.slice(0, 10),
    reorderQueue: reorderQueue.slice(0, 10),
  };
}

/**
 * Get monthly trend data for charts
 */
export async function getMonthlyTrends(
  clientId: string,
  months: number = 12,
): Promise<{
  labels: string[];
  orders: number[];
  units: number[];
  products: number[];
}> {
  const now = new Date();
  const startDate = subDays(now, months * 30);

  // First, check if there are ANY transactions for this client to determine date range
  const oldestTransaction = await prisma.transaction.findFirst({
    where: { product: { clientId } },
    orderBy: { dateSubmitted: "asc" },
    select: { dateSubmitted: true },
  });

  // Use the older of: startDate or oldest transaction date (to capture imported historical data)
  const effectiveStartDate =
    oldestTransaction?.dateSubmitted &&
    oldestTransaction.dateSubmitted < startDate
      ? oldestTransaction.dateSubmitted
      : startDate;

  const transactions = await prisma.transaction.findMany({
    where: {
      product: { clientId },
      // Include ALL non-cancelled transactions (not just 'completed')
      // This captures imported data with various statuses
      NOT: {
        orderStatus: {
          in: ["cancelled", "Cancelled", "CANCELLED", "void", "Void", "VOID"],
        },
      },
      dateSubmitted: { gte: effectiveStartDate },
    },
    select: {
      orderId: true,
      quantityUnits: true,
      dateSubmitted: true,
      productId: true,
    },
  });

  // Initialize monthly buckets
  const monthlyData = new Map<
    string,
    { orders: Set<string>; units: number; products: Set<string> }
  >();
  for (let i = 0; i < months; i++) {
    const monthDate = subDays(now, (months - 1 - i) * 30);
    const monthKey = format(monthDate, "MMM yyyy");
    monthlyData.set(monthKey, {
      orders: new Set(),
      units: 0,
      products: new Set(),
    });
  }

  for (const txn of transactions) {
    const monthKey = format(txn.dateSubmitted, "MMM yyyy");
    const data = monthlyData.get(monthKey);
    if (data) {
      data.orders.add(txn.orderId);
      data.units += txn.quantityUnits;
      data.products.add(txn.productId);
    }
  }

  const labels: string[] = [];
  const orders: number[] = [];
  const units: number[] = [];
  const products: number[] = [];

  for (const [label, data] of monthlyData.entries()) {
    labels.push(label);
    orders.push(data.orders.size);
    units.push(data.units);
    products.push(data.products.size);
  }

  return { labels, orders, units, products };
}

/**
 * Stock Health Summary - Aggregate product stock health categories
 */
export interface StockHealthSummary {
  critical: number;
  low: number;
  watch: number;
  healthy: number;
  overstock: number;
  stockout: number;
  total: number;
  lowestWeeksRemaining: number;
}

export async function getStockHealthSummary(
  clientId: string,
): Promise<StockHealthSummary> {
  const products = await prisma.product.findMany({
    where: { clientId, isActive: true },
    select: {
      id: true,
      currentStockPacks: true,
      packSize: true,
      notificationPoint: true,
      monthlyUsageUnits: true,
      monthlyUsagePacks: true,
    },
  });

  const summary: StockHealthSummary = {
    critical: 0,
    low: 0,
    watch: 0,
    healthy: 0,
    overstock: 0,
    stockout: 0,
    total: products.length,
    lowestWeeksRemaining: 999,
  };

  for (const product of products) {
    const currentUnits = product.currentStockPacks * product.packSize;
    const monthlyUsage = product.monthlyUsageUnits || 0;

    // Calculate weeks remaining
    const weeksRemaining =
      monthlyUsage > 0
        ? (currentUnits / monthlyUsage) * 4.33 // ~4.33 weeks per month
        : 999;

    // Track lowest weeks remaining
    if (weeksRemaining < summary.lowestWeeksRemaining && weeksRemaining < 999) {
      summary.lowestWeeksRemaining = Math.round(weeksRemaining * 10) / 10;
    }

    // Categorize based on stock health thresholds
    if (currentUnits === 0) {
      summary.stockout++;
    } else if (weeksRemaining < 2) {
      summary.critical++;
    } else if (
      weeksRemaining < 4 ||
      currentUnits <= (product.notificationPoint || 0)
    ) {
      summary.low++;
    } else if (weeksRemaining < 8) {
      summary.watch++;
    } else if (monthlyUsage > 0 && currentUnits > monthlyUsage * 6) {
      // More than 6 months of supply = overstock
      summary.overstock++;
    } else {
      summary.healthy++;
    }
  }

  return summary;
}
