// =============================================================================
// ANALYTICS SERVICE (Phase 11)
// Pre-aggregated analytics and trend calculations
// =============================================================================

import { prisma, Prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { cache, CacheTTL, CacheKeys } from '../lib/cache.js';
import { subDays, startOfDay, endOfDay, format, differenceInHours } from 'date-fns';

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
    direction: 'improving' | 'declining' | 'stable';
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
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
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
  days: number = 30
): Promise<DailySummary[]> {
  const startDate = subDays(new Date(), days);

  // Get daily snapshots
  const snapshots = await prisma.dailySnapshot.findMany({
    where: {
      product: { clientId },
      snapshotDate: { gte: startDate },
    },
    orderBy: { snapshotDate: 'asc' },
  });

  // Get daily alert metrics
  const alertMetrics = await prisma.dailyAlertMetrics.findMany({
    where: {
      clientId,
      metricDate: { gte: startDate },
    },
    orderBy: { metricDate: 'asc' },
  });

  // Group by date
  const summaryMap = new Map<string, DailySummary>();

  for (const snapshot of snapshots) {
    const dateKey = format(snapshot.snapshotDate, 'yyyy-MM-dd');
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
      case 'HEALTHY': existing.healthyCount++; break;
      case 'WATCH': existing.watchCount++; break;
      case 'LOW': existing.lowCount++; break;
      case 'CRITICAL': existing.criticalCount++; break;
      case 'STOCKOUT': existing.stockoutCount++; break;
    }

    summaryMap.set(dateKey, existing);
  }

  // Add alert resolution data
  for (const metric of alertMetrics) {
    const dateKey = format(metric.metricDate, 'yyyy-MM-dd');
    const existing = summaryMap.get(dateKey);
    if (existing) {
      existing.alertsCreated = metric.createdCount;
      existing.alertsResolved = metric.resolvedCount;
    }
  }

  return Array.from(summaryMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
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

  const clientMap = new Map<string, {
    clientId: string;
    clientName: string;
    total: number;
    healthy: number;
    critical: number;
    weeksSum: number;
  }>();

  let totalWeeksRemaining = 0;
  let productsWithWeeks = 0;

  for (const product of products) {
    const status = product.stockStatus || 'HEALTHY';
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
    if (status === 'HEALTHY') clientData.healthy++;
    if (status === 'CRITICAL' || status === 'STOCKOUT') clientData.critical++;
    if (product.weeksRemaining !== null) clientData.weeksSum += product.weeksRemaining;

    clientMap.set(product.clientId, clientData);
  }

  const total = products.length;
  const atRisk = byStatus.LOW + byStatus.CRITICAL + byStatus.STOCKOUT;

  // Calculate trend from last 7 days of snapshots
  const lastWeekSnapshots = await prisma.dailySnapshot.findMany({
    where: {
      snapshotDate: { gte: subDays(new Date(), 7) },
    },
    orderBy: { snapshotDate: 'desc' },
  });

  const recentHealthy = lastWeekSnapshots.filter(s => s.stockStatus === 'HEALTHY').length;
  const totalSnapshots = lastWeekSnapshots.length;
  const recentHealthyPercent = totalSnapshots > 0 ? (recentHealthy / totalSnapshots) * 100 : 0;
  const currentHealthyPercent = total > 0 ? (byStatus.HEALTHY / total) * 100 : 0;
  const changePercent = currentHealthyPercent - recentHealthyPercent;

  const result: InventoryHealthMetrics = {
    overall: {
      totalProducts: total,
      healthyPercent: total > 0 ? (byStatus.HEALTHY / total) * 100 : 0,
      atRiskPercent: total > 0 ? (atRisk / total) * 100 : 0,
      avgWeeksRemaining: productsWithWeeks > 0 ? totalWeeksRemaining / productsWithWeeks : 0,
    },
    byStatus,
    byClient: Array.from(clientMap.values()).map(c => ({
      clientId: c.clientId,
      clientName: c.clientName,
      totalProducts: c.total,
      healthyPercent: c.total > 0 ? (c.healthy / c.total) * 100 : 0,
      criticalCount: c.critical,
    })),
    trend: {
      direction: changePercent > 2 ? 'improving' : changePercent < -2 ? 'declining' : 'stable',
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
  days: number = 30
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
    orderBy: { metricDate: 'asc' },
  });

  const result = metrics.map(m => ({
    date: format(m.metricDate, 'yyyy-MM-dd'),
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

  return clients.map(client => {
    const riskScores = client.products
      .filter(p => p.riskScoreCache)
      .map(p => ({
        score: p.riskScoreCache!.score,
        factors: p.riskScoreCache!.factors as Array<{ factor: string; value: number }>,
      }));

    const avgScore = riskScores.length > 0
      ? riskScores.reduce((sum, r) => sum + r.score, 0) / riskScores.length
      : 0;

    const highRiskProducts = riskScores.filter(r => r.score >= 70).length;

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
      riskLevel: avgScore >= 80 ? 'critical' : avgScore >= 60 ? 'high' : avgScore >= 40 ? 'medium' : 'low',
      topRiskFactors,
    };
  });
}

// =============================================================================
// INVENTORY TURNOVER
// =============================================================================

export async function getInventoryTurnover(
  clientId: string,
  months: number = 12
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
        orderBy: { recordedAt: 'asc' },
      },
    },
  });

  return products.map(product => {
    // Calculate total consumed
    const totalConsumed = product.transactions.reduce(
      (sum, t) => sum + t.quantityUnits, 0
    );

    // Calculate average inventory from stock history
    const stockLevels = product.stockHistory.map(s => s.totalUnits);
    const avgInventory = stockLevels.length > 0
      ? stockLevels.reduce((sum, s) => sum + s, 0) / stockLevels.length
      : product.currentStockUnits;

    // Calculate turnover ratio (annual)
    const turnoverRatio = avgInventory > 0
      ? (totalConsumed / avgInventory) * (365 / (months * 30))
      : 0;

    // Calculate average days on hand
    const avgDaysOnHand = turnoverRatio > 0
      ? 365 / turnoverRatio
      : 0;

    return {
      clientId: product.clientId,
      productId: product.id,
      productName: product.name,
      turnoverRatio: Math.round(turnoverRatio * 100) / 100,
      avgDaysOnHand: Math.round(avgDaysOnHand),
      totalConsumed,
      avgInventory: Math.round(avgInventory),
    };
  }).sort((a, b) => b.turnoverRatio - a.turnoverRatio);
}

// =============================================================================
// FORECAST ACCURACY
// =============================================================================

export async function getForecastAccuracy(
  clientId: string,
  days: number = 30
): Promise<ForecastAccuracy[]> {
  const startDate = subDays(new Date(), days);

  const products = await prisma.product.findMany({
    where: { clientId, isActive: true },
    include: {
      usageMetrics: {
        where: {
          periodType: 'monthly',
          periodStart: { gte: subDays(new Date(), 90) },
        },
        orderBy: { periodStart: 'desc' },
        take: 3,
      },
      transactions: {
        where: { dateSubmitted: { gte: startDate } },
      },
    },
  });

  return products
    .filter(p => p.usageMetrics.length >= 2)
    .map(product => {
      // Predicted usage (avg of last 3 months, adjusted for days)
      const avgMonthlyUsage = product.usageMetrics.reduce(
        (sum, m) => sum + m.totalConsumedUnits, 0
      ) / product.usageMetrics.length;
      const predictedUsage = Math.round((avgMonthlyUsage / 30) * days);

      // Actual usage in period
      const actualUsage = product.transactions.reduce(
        (sum, t) => sum + t.quantityUnits, 0
      );

      // Calculate accuracy and MAPE
      const error = Math.abs(predictedUsage - actualUsage);
      const accuracy = actualUsage > 0
        ? Math.max(0, 100 - (error / actualUsage) * 100)
        : predictedUsage === 0 ? 100 : 0;
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
  logger.info('Creating daily snapshots');

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
    by: ['productId'],
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
    alertCounts.map(a => [a.productId, a._count.id])
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
        stockStatus: product.stockStatus || 'HEALTHY',
        alertsCreated: alertCountMap.get(product.id) || 0,
      },
      update: {
        packsAvailable: product.currentStockPacks,
        unitsAvailable: product.currentStockUnits,
        stockStatus: product.stockStatus || 'HEALTHY',
        alertsCreated: alertCountMap.get(product.id) || 0,
      },
    });
  }

  logger.info('Created daily snapshots', { count: products.length });
}

export async function aggregateDailyAlertMetrics(): Promise<void> {
  logger.info('Aggregating daily alert metrics');

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
        totalResolutionHours += differenceInHours(alert.dismissedAt, alert.createdAt);
      }
    }
    const avgResolutionHours = resolvedAlerts.length > 0
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

  logger.info('Aggregated alert metrics', { clientCount: clients.length });
}

export async function refreshRiskScoreCache(): Promise<void> {
  logger.info('Refreshing risk score cache');

  // Import risk scoring service dynamically to avoid circular deps
  const { calculateProductRisk } = await import('./ai/risk-scoring.service.js');

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
      logger.error(`Failed to cache risk score`, error as Error, { productId: product.id });
    }
  }

  logger.info('Refreshed risk score cache', { updatedCount: updated, totalProducts: products.length });
}
