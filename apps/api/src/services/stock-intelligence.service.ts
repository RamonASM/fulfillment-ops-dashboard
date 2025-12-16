// =============================================================================
// STOCK INTELLIGENCE SERVICE
// Configurable stock health thresholds and intelligent categorization
// =============================================================================

import { prisma } from "../lib/prisma.js";

// =============================================================================
// TYPES
// =============================================================================

export interface StockHealthConfig {
  criticalWeeks: number; // default: 2
  lowWeeks: number; // default: 4
  watchWeeks: number; // default: 8
  overstockMonths: number; // default: 6
}

export interface ProductStockHealth {
  productId: string;
  productName: string;
  currentUnits: number;
  monthlyUsage: number;
  weeksRemaining: number | null;
  status: "stockout" | "critical" | "low" | "watch" | "healthy" | "overstock";
  statusReason: string;
  recommendedAction: string | null;
}

export interface ClientStockIntelligence {
  clientId: string;
  config: StockHealthConfig;
  summary: {
    stockout: number;
    critical: number;
    low: number;
    watch: number;
    healthy: number;
    overstock: number;
    total: number;
    lowestWeeksRemaining: number | null;
    highestRiskProducts: ProductStockHealth[];
  };
  insights: string[];
}

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

export const DEFAULT_STOCK_CONFIG: StockHealthConfig = {
  criticalWeeks: 2,
  lowWeeks: 4,
  watchWeeks: 8,
  overstockMonths: 6,
};

// =============================================================================
// FUNCTIONS
// =============================================================================

/**
 * Get stock health configuration for a client
 * Returns client-specific settings if configured, otherwise defaults
 */
export async function getClientStockHealthConfig(
  clientId: string,
): Promise<StockHealthConfig> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { settings: true },
  });

  const settings = client?.settings as Record<string, unknown> | null;

  return {
    criticalWeeks:
      (settings?.criticalWeeks as number) ?? DEFAULT_STOCK_CONFIG.criticalWeeks,
    lowWeeks: (settings?.lowWeeks as number) ?? DEFAULT_STOCK_CONFIG.lowWeeks,
    watchWeeks:
      (settings?.watchWeeks as number) ?? DEFAULT_STOCK_CONFIG.watchWeeks,
    overstockMonths:
      (settings?.overstockMonths as number) ??
      DEFAULT_STOCK_CONFIG.overstockMonths,
  };
}

/**
 * Update stock health configuration for a client
 */
export async function updateClientStockHealthConfig(
  clientId: string,
  config: Partial<StockHealthConfig>,
): Promise<StockHealthConfig> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { settings: true },
  });

  const currentSettings = (client?.settings as Record<string, unknown>) || {};
  const updatedSettings = {
    ...currentSettings,
    ...(config.criticalWeeks !== undefined && {
      criticalWeeks: config.criticalWeeks,
    }),
    ...(config.lowWeeks !== undefined && { lowWeeks: config.lowWeeks }),
    ...(config.watchWeeks !== undefined && { watchWeeks: config.watchWeeks }),
    ...(config.overstockMonths !== undefined && {
      overstockMonths: config.overstockMonths,
    }),
  };

  await prisma.client.update({
    where: { id: clientId },
    data: { settings: updatedSettings },
  });

  return getClientStockHealthConfig(clientId);
}

/**
 * Calculate stock health status for a single product
 */
export function calculateProductStockHealth(
  product: {
    id: string;
    name: string;
    currentStockPacks: number;
    packSize: number;
    monthlyUsageUnits: number | null;
    notificationPoint: number | null;
  },
  config: StockHealthConfig,
): ProductStockHealth {
  const currentUnits = product.currentStockPacks * product.packSize;
  const monthlyUsage = product.monthlyUsageUnits || 0;

  // Calculate weeks remaining
  let weeksRemaining: number | null = null;
  if (monthlyUsage > 0) {
    weeksRemaining = (currentUnits / monthlyUsage) * 4.33;
    weeksRemaining = Math.round(weeksRemaining * 10) / 10;
  }

  // Determine status
  let status: ProductStockHealth["status"];
  let statusReason: string;
  let recommendedAction: string | null = null;

  if (currentUnits === 0) {
    status = "stockout";
    statusReason = "Product is out of stock";
    recommendedAction = "Urgent: Place immediate reorder";
  } else if (weeksRemaining !== null) {
    if (weeksRemaining < config.criticalWeeks) {
      status = "critical";
      statusReason = `Only ${weeksRemaining} weeks of stock remaining (threshold: ${config.criticalWeeks} weeks)`;
      recommendedAction = "High priority: Place reorder immediately";
    } else if (weeksRemaining < config.lowWeeks) {
      status = "low";
      statusReason = `${weeksRemaining} weeks of stock remaining (threshold: ${config.lowWeeks} weeks)`;
      recommendedAction = "Schedule reorder within this week";
    } else if (weeksRemaining < config.watchWeeks) {
      status = "watch";
      statusReason = `${weeksRemaining} weeks of stock remaining (threshold: ${config.watchWeeks} weeks)`;
      recommendedAction = "Monitor closely, plan reorder";
    } else if (currentUnits > monthlyUsage * config.overstockMonths) {
      status = "overstock";
      const monthsOfSupply =
        Math.round((currentUnits / monthlyUsage) * 10) / 10;
      statusReason = `${monthsOfSupply} months of supply (overstock threshold: ${config.overstockMonths} months)`;
      recommendedAction = "Consider promotions or reducing next order";
    } else {
      status = "healthy";
      statusReason = `${weeksRemaining} weeks of stock remaining`;
      recommendedAction = null;
    }
  } else if (
    product.notificationPoint &&
    currentUnits <= product.notificationPoint
  ) {
    // Fallback to notification point if no usage data
    status = "low";
    statusReason = `Stock at or below notification point (${product.notificationPoint} units)`;
    recommendedAction = "Consider placing reorder";
  } else {
    status = "healthy";
    statusReason = "No usage data available for weeks calculation";
    recommendedAction = null;
  }

  return {
    productId: product.id,
    productName: product.name,
    currentUnits,
    monthlyUsage,
    weeksRemaining,
    status,
    statusReason,
    recommendedAction,
  };
}

/**
 * Get comprehensive stock intelligence for a client
 */
export async function getClientStockIntelligence(
  clientId: string,
): Promise<ClientStockIntelligence> {
  const config = await getClientStockHealthConfig(clientId);

  const products = await prisma.product.findMany({
    where: { clientId, isActive: true },
    select: {
      id: true,
      name: true,
      currentStockPacks: true,
      packSize: true,
      monthlyUsageUnits: true,
      notificationPoint: true,
    },
  });

  // Calculate health for each product
  const productHealthList: ProductStockHealth[] = products.map((p) =>
    calculateProductStockHealth(p, config),
  );

  // Aggregate summary
  const summary = {
    stockout: 0,
    critical: 0,
    low: 0,
    watch: 0,
    healthy: 0,
    overstock: 0,
    total: products.length,
    lowestWeeksRemaining: null as number | null,
    highestRiskProducts: [] as ProductStockHealth[],
  };

  for (const health of productHealthList) {
    summary[health.status]++;

    if (health.weeksRemaining !== null) {
      if (
        summary.lowestWeeksRemaining === null ||
        health.weeksRemaining < summary.lowestWeeksRemaining
      ) {
        summary.lowestWeeksRemaining = health.weeksRemaining;
      }
    }
  }

  // Get highest risk products (stockout, critical, low)
  summary.highestRiskProducts = productHealthList
    .filter((p) => ["stockout", "critical", "low"].includes(p.status))
    .sort((a, b) => {
      const statusPriority = {
        stockout: 0,
        critical: 1,
        low: 2,
        watch: 3,
        healthy: 4,
        overstock: 5,
      };
      if (statusPriority[a.status] !== statusPriority[b.status]) {
        return statusPriority[a.status] - statusPriority[b.status];
      }
      // Secondary sort by weeks remaining
      return (a.weeksRemaining ?? 999) - (b.weeksRemaining ?? 999);
    })
    .slice(0, 10);

  // Generate insights
  const insights: string[] = [];

  if (summary.stockout > 0) {
    insights.push(
      `${summary.stockout} product${summary.stockout > 1 ? "s are" : " is"} currently out of stock and need immediate attention.`,
    );
  }

  if (summary.critical > 0) {
    insights.push(
      `${summary.critical} product${summary.critical > 1 ? "s have" : " has"} less than ${config.criticalWeeks} weeks of supply remaining.`,
    );
  }

  if (summary.low > 0) {
    insights.push(
      `${summary.low} product${summary.low > 1 ? "s are" : " is"} running low (under ${config.lowWeeks} weeks supply).`,
    );
  }

  if (summary.overstock > 0) {
    insights.push(
      `${summary.overstock} product${summary.overstock > 1 ? "s have" : " has"} excess inventory (over ${config.overstockMonths} months supply).`,
    );
  }

  const atRiskCount = summary.stockout + summary.critical + summary.low;
  if (atRiskCount === 0) {
    insights.push("All products have healthy stock levels.");
  } else {
    const riskPercent = Math.round((atRiskCount / summary.total) * 100);
    insights.push(`${riskPercent}% of your inventory requires attention.`);
  }

  return {
    clientId,
    config,
    summary,
    insights,
  };
}
