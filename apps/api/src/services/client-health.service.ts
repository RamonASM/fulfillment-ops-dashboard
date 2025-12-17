// =============================================================================
// CLIENT HEALTH SCORING SERVICE
// Comprehensive health scoring system for client management
// =============================================================================

import { prisma } from "../lib/prisma.js";
import { subDays } from "date-fns";

export interface ClientHealthScore {
  clientId: string;
  clientName: string;
  overallScore: number; // 0-100
  scoreBreakdown: {
    stockHealth: number; // 0-100
    alertHealth: number; // 0-100
    orderHealth: number; // 0-100
    engagementHealth: number; // 0-100
    financialHealth: number; // 0-100
  };
  riskLevel: "low" | "medium" | "high" | "critical";
  trend: "improving" | "stable" | "declining";
  recommendations: string[];
  lastCalculated: Date;
}

export interface ClientHealthSnapshot {
  id: string;
  clientId: string;
  snapshotDate: Date;
  overallScore: number;
  stockHealth: number;
  alertHealth: number;
  orderHealth: number;
  engagementHealth: number;
  financialHealth: number;
  riskLevel: string;
}

/**
 * Calculate comprehensive health score for a client
 */
export async function calculateClientHealthScore(
  clientId: string,
): Promise<ClientHealthScore> {
  const now = new Date();
  const thirtyDaysAgo = subDays(now, 30);
  const sixtyDaysAgo = subDays(now, 60);

  // Get client with related data
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: {
      products: {
        where: { isActive: true },
      },
      alerts: {
        where: {
          createdAt: { gte: thirtyDaysAgo },
        },
      },
      orderRequests: {
        where: {
          createdAt: { gte: thirtyDaysAgo },
        },
      },
    },
  });

  if (!client) {
    throw new Error(`Client not found: ${clientId}`);
  }

  // ===================================================================
  // 1. STOCK HEALTH (30% weight)
  // ===================================================================
  const totalProducts = client.products.length;
  let stockHealth = 100;

  if (totalProducts > 0) {
    const healthyProducts = client.products.filter(
      (p) => p.stockStatus === "healthy",
    ).length;
    const watchProducts = client.products.filter(
      (p) => p.stockStatus === "watch",
    ).length;
    const lowProducts = client.products.filter(
      (p) => p.stockStatus === "low",
    ).length;
    const criticalProducts = client.products.filter(
      (p) => p.stockStatus === "critical",
    ).length;

    // Weighted scoring
    stockHealth =
      (healthyProducts * 100 +
        watchProducts * 70 +
        lowProducts * 40 +
        criticalProducts * 0) /
      totalProducts;
  }

  // ===================================================================
  // 2. ALERT HEALTH (25% weight)
  // ===================================================================
  const totalAlerts = client.alerts.length;
  let alertHealth = 100;

  if (totalAlerts > 0) {
    const resolvedAlerts = client.alerts.filter((a) => a.isDismissed).length;
    const activeAlerts = totalAlerts - resolvedAlerts;

    // Penalty for active alerts
    alertHealth = Math.max(0, 100 - activeAlerts * 5); // -5 points per active alert
  }

  // ===================================================================
  // 3. ORDER HEALTH (20% weight) - SLA compliance
  // ===================================================================
  const totalOrders = client.orderRequests.length;
  let orderHealth = 100;

  if (totalOrders > 0) {
    const completedOrders = client.orderRequests.filter(
      (o) => o.status === "completed",
    ).length;
    const pendingOrders = client.orderRequests.filter(
      (o) => o.status === "pending",
    ).length;
    const overdueOrders = client.orderRequests.filter(
      (o) => o.slaBreached === true,
    ).length;

    // SLA compliance scoring
    const completionRate = completedOrders / totalOrders;
    const overdueRate = overdueOrders / totalOrders;

    orderHealth = Math.round(
      completionRate * 100 - overdueRate * 50, // Penalty for overdue
    );
    orderHealth = Math.max(0, Math.min(100, orderHealth));
  }

  // ===================================================================
  // 4. ENGAGEMENT HEALTH (15% weight)
  // ===================================================================
  // Count active portal users for this client
  const activePortalUsers = await prisma.portalUser.count({
    where: {
      clientId,
      isActive: true,
    },
  });

  // 5+ active portal users = 100%, scales linearly
  const engagementHealth = Math.min((activePortalUsers / 5) * 100, 100);

  // ===================================================================
  // 5. FINANCIAL HEALTH (10% weight)
  // ===================================================================
  // For now, use order activity as proxy for financial health
  // Can be enhanced with actual budget/spend tracking later
  const recentOrderCount = client.orderRequests.filter(
    (o) => o.createdAt >= thirtyDaysAgo,
  ).length;
  const previousOrderCount = await prisma.orderRequest.count({
    where: {
      clientId,
      createdAt: {
        gte: sixtyDaysAgo,
        lt: thirtyDaysAgo,
      },
    },
  });

  let financialHealth = 100;
  if (previousOrderCount > 0) {
    const orderGrowth = (recentOrderCount / previousOrderCount - 1) * 100;
    // Positive growth = good, negative = concerning
    financialHealth = Math.max(0, Math.min(100, 100 + orderGrowth));
  } else if (recentOrderCount > 0) {
    financialHealth = 100; // New activity is good
  } else {
    financialHealth = 50; // No activity is concerning
  }

  // ===================================================================
  // CALCULATE OVERALL SCORE (weighted average)
  // ===================================================================
  const overallScore = Math.round(
    stockHealth * 0.3 +
      alertHealth * 0.25 +
      orderHealth * 0.2 +
      engagementHealth * 0.15 +
      financialHealth * 0.1,
  );

  // ===================================================================
  // DETERMINE RISK LEVEL
  // ===================================================================
  let riskLevel: "low" | "medium" | "high" | "critical";
  if (overallScore >= 80) riskLevel = "low";
  else if (overallScore >= 60) riskLevel = "medium";
  else if (overallScore >= 40) riskLevel = "high";
  else riskLevel = "critical";

  // ===================================================================
  // CALCULATE TREND (compare to previous snapshot if exists)
  // ===================================================================
  const previousSnapshot = await prisma.$queryRaw<ClientHealthSnapshot[]>`
    SELECT * FROM client_health_snapshots
    WHERE client_id = ${clientId}::uuid
    ORDER BY snapshot_date DESC
    LIMIT 1
  `;

  let trend: "improving" | "stable" | "declining" = "stable";
  if (previousSnapshot.length > 0) {
    const scoreDiff = overallScore - previousSnapshot[0].overallScore;
    if (scoreDiff > 5) trend = "improving";
    else if (scoreDiff < -5) trend = "declining";
  }

  // ===================================================================
  // GENERATE RECOMMENDATIONS
  // ===================================================================
  const recommendations: string[] = [];

  if (stockHealth < 70) {
    const criticalCount = client.products.filter(
      (p) => p.stockStatus === "critical",
    ).length;
    recommendations.push(
      `${criticalCount} product${criticalCount !== 1 ? "s" : ""} at critical stock levels - immediate reorder needed`,
    );
  }

  if (alertHealth < 70) {
    const activeAlerts = client.alerts.filter((a) => !a.isDismissed).length;
    recommendations.push(
      `${activeAlerts} active alert${activeAlerts !== 1 ? "s" : ""} require attention`,
    );
  }

  if (orderHealth < 70) {
    recommendations.push("Review order workflow to improve SLA compliance");
  }

  if (engagementHealth < 50) {
    recommendations.push(
      "Low portal engagement - consider training or outreach",
    );
  }

  if (financialHealth < 60) {
    recommendations.push("Order volume declining - check in with client");
  }

  if (recommendations.length === 0) {
    recommendations.push(
      "Client health is excellent - maintain current practices",
    );
  }

  return {
    clientId,
    clientName: client.name,
    overallScore,
    scoreBreakdown: {
      stockHealth: Math.round(stockHealth),
      alertHealth: Math.round(alertHealth),
      orderHealth: Math.round(orderHealth),
      engagementHealth: Math.round(engagementHealth),
      financialHealth: Math.round(financialHealth),
    },
    riskLevel,
    trend,
    recommendations,
    lastCalculated: now,
  };
}

/**
 * Calculate health scores for all active clients
 */
export async function calculateAllClientHealthScores(): Promise<
  ClientHealthScore[]
> {
  const clients = await prisma.client.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  });

  const scores: ClientHealthScore[] = [];

  for (const client of clients) {
    try {
      const score = await calculateClientHealthScore(client.id);
      scores.push(score);
    } catch (error) {
      console.error(
        `Failed to calculate health score for client ${client.name}:`,
        error,
      );
    }
  }

  return scores;
}

/**
 * Save health score snapshot for historical tracking
 */
export async function saveHealthScoreSnapshot(
  score: ClientHealthScore,
): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO client_health_snapshots (
      client_id,
      snapshot_date,
      overall_score,
      stock_health,
      alert_health,
      order_health,
      engagement_health,
      financial_health,
      risk_level
    ) VALUES (
      ${score.clientId}::uuid,
      ${score.lastCalculated}::timestamptz,
      ${score.overallScore}::int,
      ${score.scoreBreakdown.stockHealth}::int,
      ${score.scoreBreakdown.alertHealth}::int,
      ${score.scoreBreakdown.orderHealth}::int,
      ${score.scoreBreakdown.engagementHealth}::int,
      ${score.scoreBreakdown.financialHealth}::int,
      ${score.riskLevel}::varchar
    )
  `;
}
