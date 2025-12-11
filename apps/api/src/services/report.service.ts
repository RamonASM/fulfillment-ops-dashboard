import { prisma } from '../lib/prisma.js';
import { subDays, subMonths, format, startOfMonth, endOfMonth } from 'date-fns';

// =============================================================================
// TYPES
// =============================================================================

export type ReportType =
  | 'client_review'
  | 'sales_proposal'
  | 'location_performance'
  | 'executive_summary';

export interface ReportGenerationResult {
  success: boolean;
  reportId?: string;
  report?: any;
  error?: string;
}

export interface ClientReviewData {
  clientId: string;
  clientName: string;
  clientCode: string;
  period: {
    start: Date;
    end: Date;
    label: string;
  };
  inventoryHealth: {
    totalProducts: number;
    healthyCount: number;
    watchCount: number;
    lowCount: number;
    criticalCount: number;
    stockoutCount: number;
    healthScore: number;
  };
  usageAnalytics: {
    totalUsageUnits: number;
    avgMonthlyUsage: number;
    topProducts: Array<{
      id: string;
      name: string;
      monthlyUsage: number;
      stockWeeks: number | null;
    }>;
    usageTrend: Array<{
      month: string;
      units: number;
    }>;
  };
  orderMetrics: {
    totalOrders: number;
    fulfilledOrders: number;
    pendingOrders: number;
    avgResponseHours: number | null;
    slaComplianceRate: number;
  };
  alertSummary: {
    totalAlerts: number;
    resolvedAlerts: number;
    activeAlerts: number;
    bySeverity: Record<string, number>;
    byType: Record<string, number>;
  };
  recommendations: string[];
}

export interface LocationPerformanceData {
  clientId: string;
  clientName: string;
  locationId: string;
  locationName: string;
  locationCode: string;
  period: {
    start: Date;
    end: Date;
    label: string;
  };
  orderMetrics: {
    totalOrders: number;
    totalPacks: number;
    totalUnits: number;
    avgOrderSize: number;
    ordersByStatus: Record<string, number>;
  };
  productPopularity: Array<{
    productId: string;
    productName: string;
    orderCount: number;
    totalPacks: number;
  }>;
  monthlyTrend: Array<{
    month: string;
    orders: number;
    packs: number;
  }>;
  comparisonToAverage: {
    percentAboveAvg: number;
    rank: number;
    totalLocations: number;
  };
}

export interface ExecutiveSummaryData {
  period: {
    start: Date;
    end: Date;
    label: string;
  };
  portfolioOverview: {
    totalClients: number;
    activeClients: number;
    totalProducts: number;
    totalLocations: number;
  };
  healthMetrics: {
    overallHealthScore: number;
    clientsAtRisk: number;
    productsAtRisk: number;
    stockoutCount: number;
  };
  orderMetrics: {
    totalOrders: number;
    totalValue: number;
    avgOrdersPerClient: number;
    slaComplianceRate: number;
  };
  alertTrends: {
    totalAlerts: number;
    resolvedRate: number;
    avgResolutionHours: number | null;
    criticalAlertsActive: number;
  };
  clientPerformance: Array<{
    clientId: string;
    clientName: string;
    healthScore: number;
    orderCount: number;
    alertCount: number;
  }>;
}

// =============================================================================
// REPORT GENERATION
// =============================================================================

/**
 * Generate a client review report
 */
export async function generateClientReviewReport(
  clientId: string,
  periodDays: number = 30,
  generatedBy: string
): Promise<ReportGenerationResult> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
  });

  if (!client) {
    return { success: false, error: 'Client not found' };
  }

  const periodEnd = new Date();
  const periodStart = subDays(periodEnd, periodDays);

  // Gather report data
  const data = await gatherClientReviewData(clientId, periodStart, periodEnd);

  // Create report record
  const report = await prisma.report.create({
    data: {
      type: 'client_review',
      clientId,
      title: `${client.name} - Monthly Review Report`,
      periodStart,
      periodEnd,
      generatedBy,
      status: 'ready',
      dataSnapshot: data as any,
    },
  });

  return { success: true, reportId: report.id, report: { ...report, data } };
}

/**
 * Generate a location performance report
 */
export async function generateLocationPerformanceReport(
  clientId: string,
  locationId: string,
  periodDays: number = 30,
  generatedBy: string
): Promise<ReportGenerationResult> {
  const location = await prisma.location.findFirst({
    where: { id: locationId, clientId },
    include: { client: true },
  });

  if (!location) {
    return { success: false, error: 'Location not found' };
  }

  const periodEnd = new Date();
  const periodStart = subDays(periodEnd, periodDays);

  // Gather report data
  const data = await gatherLocationPerformanceData(
    clientId,
    locationId,
    periodStart,
    periodEnd
  );

  // Create report record
  const report = await prisma.report.create({
    data: {
      type: 'location_performance',
      clientId,
      locationId,
      title: `${location.name} - Performance Report`,
      periodStart,
      periodEnd,
      generatedBy,
      status: 'ready',
      dataSnapshot: data as any,
    },
  });

  return { success: true, reportId: report.id, report: { ...report, data } };
}

/**
 * Generate an executive summary report
 */
export async function generateExecutiveSummaryReport(
  periodDays: number = 30,
  generatedBy: string
): Promise<ReportGenerationResult> {
  const periodEnd = new Date();
  const periodStart = subDays(periodEnd, periodDays);

  // Gather report data
  const data = await gatherExecutiveSummaryData(periodStart, periodEnd);

  // Create report record
  const report = await prisma.report.create({
    data: {
      type: 'executive_summary',
      title: `Executive Summary - ${format(periodStart, 'MMM d')} to ${format(periodEnd, 'MMM d, yyyy')}`,
      periodStart,
      periodEnd,
      generatedBy,
      status: 'ready',
      dataSnapshot: data as any,
    },
  });

  return { success: true, reportId: report.id, report: { ...report, data } };
}

// =============================================================================
// DATA GATHERING
// =============================================================================

/**
 * Gather client review report data
 */
async function gatherClientReviewData(
  clientId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<ClientReviewData> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
  });

  // Get product inventory health
  const products = await prisma.product.findMany({
    where: { clientId, isActive: true },
    select: {
      id: true,
      name: true,
      stockStatus: true,
      monthlyUsageUnits: true,
      weeksRemaining: true,
    },
  });

  const stockStatusCounts = products.reduce(
    (acc, p) => {
      const status = p.stockStatus || 'healthy';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  // Calculate health score (0-100)
  const healthScore = calculateHealthScore(stockStatusCounts, products.length);

  // Get top products by usage
  const topProducts = products
    .filter((p) => p.monthlyUsageUnits && p.monthlyUsageUnits > 0)
    .sort((a, b) => (b.monthlyUsageUnits || 0) - (a.monthlyUsageUnits || 0))
    .slice(0, 10)
    .map((p) => ({
      id: p.id,
      name: p.name,
      monthlyUsage: p.monthlyUsageUnits || 0,
      stockWeeks: p.weeksRemaining,
    }));

  // Get usage trend (last 3 months)
  const threeMonthsAgo = subMonths(periodEnd, 3);
  const usageSnapshots = await prisma.monthlyUsageSnapshot.groupBy({
    by: ['yearMonth'],
    where: {
      product: { clientId },
      createdAt: { gte: threeMonthsAgo },
    },
    _sum: { consumedUnits: true },
  });

  // Get order metrics
  const orders = await prisma.orderRequest.findMany({
    where: {
      clientId,
      submittedAt: { gte: periodStart, lte: periodEnd },
      status: { not: 'draft' },
    },
    select: {
      status: true,
      slaBreached: true,
      submittedAt: true,
      acknowledgedAt: true,
    },
  });

  const fulfilledOrders = orders.filter((o) => o.status === 'fulfilled').length;
  const pendingOrders = orders.filter((o) =>
    ['submitted', 'acknowledged'].includes(o.status)
  ).length;
  const onTimeOrders = orders.filter((o) => !o.slaBreached).length;

  // Calculate average response time
  const ordersWithResponse = orders.filter((o) => o.acknowledgedAt && o.submittedAt);
  const avgResponseHours =
    ordersWithResponse.length > 0
      ? ordersWithResponse.reduce((sum, o) => {
          const diff = o.acknowledgedAt!.getTime() - o.submittedAt!.getTime();
          return sum + diff / (1000 * 60 * 60);
        }, 0) / ordersWithResponse.length
      : null;

  // Get alert summary
  const alerts = await prisma.alert.findMany({
    where: {
      clientId,
      createdAt: { gte: periodStart, lte: periodEnd },
    },
    select: {
      severity: true,
      alertType: true,
      isDismissed: true,
    },
  });

  const activeAlerts = alerts.filter((a) => !a.isDismissed).length;
  const resolvedAlerts = alerts.filter((a) => a.isDismissed).length;

  const alertsBySeverity = alerts.reduce((acc, a) => {
    acc[a.severity] = (acc[a.severity] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const alertsByType = alerts.reduce((acc, a) => {
    acc[a.alertType] = (acc[a.alertType] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Generate recommendations
  const recommendations = generateRecommendations({
    stockStatusCounts,
    healthScore,
    slaComplianceRate: orders.length > 0 ? (onTimeOrders / orders.length) * 100 : 100,
    activeAlerts,
  });

  return {
    clientId,
    clientName: client!.name,
    clientCode: client!.code,
    period: {
      start: periodStart,
      end: periodEnd,
      label: `${format(periodStart, 'MMM d')} - ${format(periodEnd, 'MMM d, yyyy')}`,
    },
    inventoryHealth: {
      totalProducts: products.length,
      healthyCount: stockStatusCounts.healthy || 0,
      watchCount: stockStatusCounts.watch || 0,
      lowCount: stockStatusCounts.low || 0,
      criticalCount: stockStatusCounts.critical || 0,
      stockoutCount: stockStatusCounts.stockout || 0,
      healthScore,
    },
    usageAnalytics: {
      totalUsageUnits: products.reduce((sum, p) => sum + (p.monthlyUsageUnits || 0), 0),
      avgMonthlyUsage:
        products.length > 0
          ? products.reduce((sum, p) => sum + (p.monthlyUsageUnits || 0), 0) / products.length
          : 0,
      topProducts,
      usageTrend: usageSnapshots
        .sort((a, b) => a.yearMonth.localeCompare(b.yearMonth))
        .map((s) => ({
          month: s.yearMonth,
          units: s._sum.consumedUnits || 0,
        })),
    },
    orderMetrics: {
      totalOrders: orders.length,
      fulfilledOrders,
      pendingOrders,
      avgResponseHours,
      slaComplianceRate: orders.length > 0 ? (onTimeOrders / orders.length) * 100 : 100,
    },
    alertSummary: {
      totalAlerts: alerts.length,
      resolvedAlerts,
      activeAlerts,
      bySeverity: alertsBySeverity,
      byType: alertsByType,
    },
    recommendations,
  };
}

/**
 * Gather location performance data
 */
async function gatherLocationPerformanceData(
  clientId: string,
  locationId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<LocationPerformanceData> {
  const location = await prisma.location.findFirst({
    where: { id: locationId, clientId },
    include: { client: true },
  });

  // Get orders for this location
  const orders = await prisma.orderRequest.findMany({
    where: {
      locationId,
      submittedAt: { gte: periodStart, lte: periodEnd },
      status: { not: 'draft' },
    },
    include: {
      orderRequestItems: {
        include: {
          product: { select: { id: true, name: true } },
        },
      },
    },
  });

  // Calculate order metrics
  const totalPacks = orders.reduce((sum, o) => sum + (o.totalPacks || 0), 0);
  const totalUnits = orders.reduce((sum, o) => sum + (o.totalUnits || 0), 0);

  const ordersByStatus = orders.reduce((acc, o) => {
    acc[o.status] = (acc[o.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Product popularity
  const productCounts = new Map<string, { name: string; orderCount: number; totalPacks: number }>();
  for (const order of orders) {
    for (const item of order.orderRequestItems) {
      const existing = productCounts.get(item.productId) || {
        name: item.product.name,
        orderCount: 0,
        totalPacks: 0,
      };
      existing.orderCount++;
      existing.totalPacks += item.quantityPacks;
      productCounts.set(item.productId, existing);
    }
  }

  const productPopularity = Array.from(productCounts.entries())
    .map(([productId, data]) => ({
      productId,
      productName: data.name,
      orderCount: data.orderCount,
      totalPacks: data.totalPacks,
    }))
    .sort((a, b) => b.orderCount - a.orderCount)
    .slice(0, 10);

  // Monthly trend
  const monthlyTrend = orders.reduce((acc, order) => {
    const month = format(order.submittedAt || order.createdAt, 'yyyy-MM');
    const existing = acc.find((m) => m.month === month);
    if (existing) {
      existing.orders++;
      existing.packs += order.totalPacks || 0;
    } else {
      acc.push({ month, orders: 1, packs: order.totalPacks || 0 });
    }
    return acc;
  }, [] as Array<{ month: string; orders: number; packs: number }>);

  // Compare to other locations
  const allLocations = await prisma.location.findMany({
    where: { clientId, isActive: true },
    include: {
      _count: {
        select: { orderRequests: { where: { submittedAt: { gte: periodStart } } } },
      },
    },
  });

  const locationOrderCounts = allLocations.map((l) => ({
    id: l.id,
    count: l._count.orderRequests,
  }));
  locationOrderCounts.sort((a, b) => b.count - a.count);

  const thisLocationOrders = orders.length;
  const avgOrders =
    locationOrderCounts.reduce((sum, l) => sum + l.count, 0) / locationOrderCounts.length || 0;
  const rank = locationOrderCounts.findIndex((l) => l.id === locationId) + 1;

  return {
    clientId,
    clientName: location!.client.name,
    locationId,
    locationName: location!.name,
    locationCode: location!.code,
    period: {
      start: periodStart,
      end: periodEnd,
      label: `${format(periodStart, 'MMM d')} - ${format(periodEnd, 'MMM d, yyyy')}`,
    },
    orderMetrics: {
      totalOrders: orders.length,
      totalPacks,
      totalUnits,
      avgOrderSize: orders.length > 0 ? totalPacks / orders.length : 0,
      ordersByStatus,
    },
    productPopularity,
    monthlyTrend: monthlyTrend.sort((a, b) => a.month.localeCompare(b.month)),
    comparisonToAverage: {
      percentAboveAvg: avgOrders > 0 ? ((thisLocationOrders - avgOrders) / avgOrders) * 100 : 0,
      rank,
      totalLocations: allLocations.length,
    },
  };
}

/**
 * Gather executive summary data
 */
async function gatherExecutiveSummaryData(
  periodStart: Date,
  periodEnd: Date
): Promise<ExecutiveSummaryData> {
  // Portfolio overview
  const [totalClients, totalProducts, totalLocations] = await Promise.all([
    prisma.client.count({ where: { isActive: true } }),
    prisma.product.count({ where: { isActive: true } }),
    prisma.location.count({ where: { isActive: true } }),
  ]);

  // Get clients with orders in period
  const clientsWithOrders = await prisma.orderRequest.groupBy({
    by: ['clientId'],
    where: {
      submittedAt: { gte: periodStart, lte: periodEnd },
      status: { not: 'draft' },
    },
  });

  // Health metrics
  const products = await prisma.product.findMany({
    where: { isActive: true },
    select: { stockStatus: true },
  });

  const stockoutCount = products.filter((p) => p.stockStatus === 'stockout').length;
  const criticalCount = products.filter((p) => p.stockStatus === 'critical').length;
  const productsAtRisk = stockoutCount + criticalCount;

  // Overall health score
  const statusCounts = products.reduce(
    (acc, p) => {
      const status = p.stockStatus || 'healthy';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );
  const overallHealthScore = calculateHealthScore(statusCounts, products.length);

  // Order metrics
  const orders = await prisma.orderRequest.findMany({
    where: {
      submittedAt: { gte: periodStart, lte: periodEnd },
      status: { not: 'draft' },
    },
    select: {
      estimatedValue: true,
      slaBreached: true,
    },
  });

  const totalValue = orders.reduce((sum, o) => sum + Number(o.estimatedValue || 0), 0);
  const onTimeOrders = orders.filter((o) => !o.slaBreached).length;

  // Alert trends
  const alerts = await prisma.alert.findMany({
    where: {
      createdAt: { gte: periodStart, lte: periodEnd },
    },
    select: {
      severity: true,
      isDismissed: true,
    },
  });

  const resolvedAlerts = alerts.filter((a) => a.isDismissed).length;
  const criticalAlertsActive = alerts.filter(
    (a) => a.severity === 'critical' && !a.isDismissed
  ).length;

  // Client performance
  const clients = await prisma.client.findMany({
    where: { isActive: true },
    include: {
      products: {
        where: { isActive: true },
        select: { stockStatus: true },
      },
      orderRequests: {
        where: {
          submittedAt: { gte: periodStart },
          status: { not: 'draft' },
        },
      },
      alerts: {
        where: {
          createdAt: { gte: periodStart },
          isDismissed: false,
        },
      },
    },
  });

  const clientPerformance = clients
    .map((c) => {
      const clientStatusCounts = c.products.reduce(
        (acc, p) => {
          const status = p.stockStatus || 'healthy';
          acc[status] = (acc[status] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );

      return {
        clientId: c.id,
        clientName: c.name,
        healthScore: calculateHealthScore(clientStatusCounts, c.products.length),
        orderCount: c.orderRequests.length,
        alertCount: c.alerts.length,
      };
    })
    .sort((a, b) => a.healthScore - b.healthScore) // Lower health = needs attention
    .slice(0, 10);

  // Count clients at risk (health score < 70)
  const clientsAtRisk = clientPerformance.filter((c) => c.healthScore < 70).length;

  return {
    period: {
      start: periodStart,
      end: periodEnd,
      label: `${format(periodStart, 'MMM d')} - ${format(periodEnd, 'MMM d, yyyy')}`,
    },
    portfolioOverview: {
      totalClients,
      activeClients: clientsWithOrders.length,
      totalProducts,
      totalLocations,
    },
    healthMetrics: {
      overallHealthScore,
      clientsAtRisk,
      productsAtRisk,
      stockoutCount,
    },
    orderMetrics: {
      totalOrders: orders.length,
      totalValue,
      avgOrdersPerClient: totalClients > 0 ? orders.length / totalClients : 0,
      slaComplianceRate: orders.length > 0 ? (onTimeOrders / orders.length) * 100 : 100,
    },
    alertTrends: {
      totalAlerts: alerts.length,
      resolvedRate: alerts.length > 0 ? (resolvedAlerts / alerts.length) * 100 : 100,
      avgResolutionHours: null, // Would need resolution timestamps
      criticalAlertsActive,
    },
    clientPerformance,
  };
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Calculate health score (0-100) based on stock status distribution
 */
function calculateHealthScore(
  statusCounts: Record<string, number>,
  totalProducts: number
): number {
  if (totalProducts === 0) return 100;

  const weights = {
    healthy: 100,
    watch: 80,
    low: 50,
    critical: 20,
    stockout: 0,
  };

  let weightedSum = 0;
  for (const [status, count] of Object.entries(statusCounts)) {
    const weight = weights[status as keyof typeof weights] ?? 80;
    weightedSum += weight * count;
  }

  return Math.round(weightedSum / totalProducts);
}

/**
 * Generate recommendations based on metrics
 */
function generateRecommendations(metrics: {
  stockStatusCounts: Record<string, number>;
  healthScore: number;
  slaComplianceRate: number;
  activeAlerts: number;
}): string[] {
  const recommendations: string[] = [];

  if (metrics.stockStatusCounts.stockout > 0) {
    recommendations.push(
      `Address ${metrics.stockStatusCounts.stockout} stockout(s) immediately to prevent service disruption.`
    );
  }

  if (metrics.stockStatusCounts.critical > 0) {
    recommendations.push(
      `Review ${metrics.stockStatusCounts.critical} critical stock item(s) and initiate reorders.`
    );
  }

  if (metrics.healthScore < 70) {
    recommendations.push(
      'Overall inventory health is below target. Consider reviewing reorder points and lead times.'
    );
  }

  if (metrics.slaComplianceRate < 95) {
    recommendations.push(
      `SLA compliance at ${metrics.slaComplianceRate.toFixed(1)}%. Review order processing workflow to improve response times.`
    );
  }

  if (metrics.activeAlerts > 10) {
    recommendations.push(
      `${metrics.activeAlerts} active alerts require attention. Prioritize critical and warning alerts.`
    );
  }

  if (recommendations.length === 0) {
    recommendations.push(
      'Inventory health is excellent. Continue monitoring for seasonal variations.'
    );
  }

  return recommendations;
}

// =============================================================================
// REPORT RETRIEVAL
// =============================================================================

/**
 * Get report by ID with data
 */
export async function getReportById(reportId: string) {
  return prisma.report.findUnique({
    where: { id: reportId },
    include: {
      client: { select: { name: true, code: true } },
      location: { select: { name: true, code: true } },
    },
  });
}

/**
 * Get reports for a client
 */
export async function getClientReports(
  clientId: string,
  options?: { type?: ReportType; limit?: number }
) {
  return prisma.report.findMany({
    where: {
      clientId,
      ...(options?.type && { type: options.type }),
    },
    orderBy: { generatedAt: 'desc' },
    take: options?.limit || 20,
  });
}

/**
 * Get all reports (admin)
 */
export async function getReports(options?: {
  type?: ReportType;
  clientId?: string;
  limit?: number;
}) {
  return prisma.report.findMany({
    where: {
      ...(options?.type && { type: options.type }),
      ...(options?.clientId && { clientId: options.clientId }),
    },
    orderBy: { generatedAt: 'desc' },
    take: options?.limit || 50,
    include: {
      client: { select: { name: true, code: true } },
      location: { select: { name: true, code: true } },
    },
  });
}
