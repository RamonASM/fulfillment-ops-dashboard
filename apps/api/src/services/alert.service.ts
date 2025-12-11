import { prisma } from '../lib/prisma.js';
import type { StockStatus, AlertType, AlertSeverity } from '@inventory/shared';

// =============================================================================
// TYPES
// =============================================================================

interface AlertInput {
  clientId: string;
  productId?: string;
  alertType: AlertType;
  severity: AlertSeverity;
  title: string;
  message?: string;
  thresholdValue?: number;
  currentValue?: number;
}

interface StockStatusResult {
  status: StockStatus;
  weeksRemaining: number;
  percentOfReorderPoint: number;
}

// =============================================================================
// STOCK STATUS CLASSIFICATION
// =============================================================================

/**
 * Calculate stock status for a product
 */
export function getStockStatus(
  currentStockUnits: number,
  reorderPointUnits: number,
  avgDailyUsage: number
): StockStatusResult {
  if (currentStockUnits === 0) {
    return {
      status: 'stockout',
      weeksRemaining: 0,
      percentOfReorderPoint: 0,
    };
  }

  const daysRemaining =
    avgDailyUsage > 0 ? currentStockUnits / avgDailyUsage : Infinity;
  const weeksRemaining = daysRemaining / 7;

  const percentOfReorderPoint =
    reorderPointUnits > 0 ? (currentStockUnits / reorderPointUnits) * 100 : 100;

  let status: StockStatus;

  // Critical: Below 50% of reorder point OR less than 2 weeks
  if (percentOfReorderPoint <= 50 || weeksRemaining < 2) {
    status = 'critical';
  }
  // Low: At or below reorder point OR less than 4 weeks
  else if (percentOfReorderPoint <= 100 || weeksRemaining < 4) {
    status = 'low';
  }
  // Watch: Within 150% of reorder point OR less than 6 weeks
  else if (percentOfReorderPoint <= 150 || weeksRemaining < 6) {
    status = 'watch';
  }
  // Healthy: Above all thresholds
  else {
    status = 'healthy';
  }

  return {
    status,
    weeksRemaining: weeksRemaining === Infinity ? 999 : Math.round(weeksRemaining * 10) / 10,
    percentOfReorderPoint: Math.round(percentOfReorderPoint),
  };
}

// =============================================================================
// ALERT GENERATION
// =============================================================================

/**
 * Generate alerts for all products of a client
 */
export async function generateClientAlerts(clientId: string): Promise<number> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
  });

  if (!client) {
    throw new Error('Client not found');
  }

  const settings = client.settings as { showOrphanProducts?: boolean };

  // Get all active products with their usage metrics
  const products = await prisma.product.findMany({
    where: {
      clientId,
      isActive: true,
    },
    include: {
      alerts: {
        where: {
          isDismissed: false,
        },
      },
    },
  });

  // Get latest usage metrics for products
  const productIds = products.map((p) => p.id);
  const usageMetrics = await prisma.usageMetric.findMany({
    where: {
      productId: { in: productIds },
    },
    orderBy: { calculatedAt: 'desc' },
    distinct: ['productId'],
  });

  const usageLookup = new Map(usageMetrics.map((m) => [m.productId, m]));

  const newAlerts: AlertInput[] = [];

  for (const product of products) {
    // Skip orphan products if setting says to hide
    if (product.isOrphan && !settings.showOrphanProducts) {
      continue;
    }

    const currentStockUnits = product.currentStockPacks * product.packSize;
    const reorderPointUnits = (product.reorderPointPacks || 0) * product.packSize;

    const usage = usageLookup.get(product.id);
    const avgDailyUsage = usage ? Number(usage.avgDailyUnits || 0) : 0;

    const stockStatus = getStockStatus(
      currentStockUnits,
      reorderPointUnits,
      avgDailyUsage
    );

    // Check if alert already exists for this product/status
    const existingAlert = product.alerts.find(
      (a) => a.alertType === statusToAlertType(stockStatus.status)
    );

    if (existingAlert) {
      continue; // Don't duplicate
    }

    // Generate alert based on status
    if (stockStatus.status === 'stockout' && product.itemType !== 'event') {
      newAlerts.push({
        clientId,
        productId: product.id,
        alertType: 'stockout',
        severity: 'critical',
        title: `STOCKOUT: ${product.name}`,
        message: `${product.productId} has zero inventory. Immediate action required.`,
        thresholdValue: 0,
        currentValue: 0,
      });
    } else if (stockStatus.status === 'critical') {
      newAlerts.push({
        clientId,
        productId: product.id,
        alertType: 'critical_stock',
        severity: 'critical',
        title: `CRITICAL: ${product.name} critically low`,
        message: `${product.productId} at ${currentStockUnits} units (${stockStatus.percentOfReorderPoint}% of reorder point). ~${stockStatus.weeksRemaining} weeks remaining.`,
        thresholdValue: reorderPointUnits * 0.5,
        currentValue: currentStockUnits,
      });
    } else if (stockStatus.status === 'low') {
      newAlerts.push({
        clientId,
        productId: product.id,
        alertType: 'low_stock',
        severity: 'warning',
        title: `Low Stock: ${product.name}`,
        message: `${product.productId} at ${currentStockUnits} units. Reorder point: ${reorderPointUnits}. ~${stockStatus.weeksRemaining} weeks remaining.`,
        thresholdValue: reorderPointUnits,
        currentValue: currentStockUnits,
      });
    }
  }

  // Batch insert new alerts
  if (newAlerts.length > 0) {
    await prisma.alert.createMany({
      data: newAlerts,
    });
  }

  return newAlerts.length;
}

/**
 * Map stock status to alert type
 */
function statusToAlertType(status: StockStatus): AlertType | null {
  switch (status) {
    case 'stockout':
      return 'stockout';
    case 'critical':
      return 'critical_stock';
    case 'low':
      return 'low_stock';
    default:
      return null;
  }
}

// =============================================================================
// USAGE SPIKE DETECTION
// =============================================================================

/**
 * Detect unusual usage spikes for products
 */
export async function detectUsageSpikes(clientId: string): Promise<number> {
  const products = await prisma.product.findMany({
    where: {
      clientId,
      isActive: true,
      isOrphan: false,
    },
  });

  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const twoWeeksAgo = new Date();
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

  let spikeCount = 0;

  for (const product of products) {
    // Get recent transactions
    const recentTransactions = await prisma.transaction.findMany({
      where: {
        productId: product.id,
        dateSubmitted: { gte: oneWeekAgo },
        orderStatus: 'completed',
      },
    });

    const previousTransactions = await prisma.transaction.findMany({
      where: {
        productId: product.id,
        dateSubmitted: {
          gte: twoWeeksAgo,
          lt: oneWeekAgo,
        },
        orderStatus: 'completed',
      },
    });

    const recentUsage = recentTransactions.reduce(
      (sum, t) => sum + t.quantityUnits,
      0
    );
    const previousUsage = previousTransactions.reduce(
      (sum, t) => sum + t.quantityUnits,
      0
    );

    // Spike if current week is 2x the previous week (and previous wasn't zero)
    if (previousUsage > 0 && recentUsage >= previousUsage * 2) {
      // Check if alert already exists
      const existingAlert = await prisma.alert.findFirst({
        where: {
          productId: product.id,
          alertType: 'usage_spike',
          isDismissed: false,
          createdAt: { gte: oneWeekAgo },
        },
      });

      if (!existingAlert) {
        await prisma.alert.create({
          data: {
            clientId,
            productId: product.id,
            alertType: 'usage_spike',
            severity: 'info',
            title: `Usage Spike: ${product.name}`,
            message: `${product.productId} usage increased ${Math.round((recentUsage / previousUsage) * 100)}% this week (${recentUsage} units vs ${previousUsage} units last week).`,
            thresholdValue: previousUsage * 2,
            currentValue: recentUsage,
          },
        });
        spikeCount++;
      }
    }
  }

  return spikeCount;
}

// =============================================================================
// NO MOVEMENT DETECTION
// =============================================================================

/**
 * Detect products with no transactions in 60+ days
 */
export async function detectNoMovement(clientId: string): Promise<number> {
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const products = await prisma.product.findMany({
    where: {
      clientId,
      isActive: true,
      isOrphan: false,
      itemType: 'evergreen', // Only for evergreen products
    },
    include: {
      transactions: {
        where: {
          dateSubmitted: { gte: sixtyDaysAgo },
        },
        take: 1,
      },
      alerts: {
        where: {
          alertType: 'no_movement',
          isDismissed: false,
        },
        take: 1,
      },
    },
  });

  let alertCount = 0;

  for (const product of products) {
    // If no recent transactions and no existing alert
    if (product.transactions.length === 0 && product.alerts.length === 0) {
      // Get last transaction date
      const lastTransaction = await prisma.transaction.findFirst({
        where: {
          productId: product.id,
          orderStatus: 'completed',
        },
        orderBy: { dateSubmitted: 'desc' },
      });

      const lastDate = lastTransaction?.dateSubmitted || product.createdAt;
      const daysSinceMovement = Math.floor(
        (Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      await prisma.alert.create({
        data: {
          clientId,
          productId: product.id,
          alertType: 'no_movement',
          severity: 'info',
          title: `No Movement: ${product.name}`,
          message: `${product.productId} has had no transactions in ${daysSinceMovement} days. Consider reviewing if still needed.`,
        },
      });
      alertCount++;
    }
  }

  return alertCount;
}

// =============================================================================
// ALERT CLEANUP
// =============================================================================

/**
 * Resolve alerts that are no longer applicable
 */
export async function resolveOutdatedAlerts(clientId: string): Promise<number> {
  // Get all active alerts
  const alerts = await prisma.alert.findMany({
    where: {
      clientId,
      isDismissed: false,
      productId: { not: null },
    },
    include: {
      product: true,
    },
  });

  let resolvedCount = 0;

  for (const alert of alerts) {
    if (!alert.product) continue;

    const currentStockUnits =
      alert.product.currentStockPacks * alert.product.packSize;
    const reorderPointUnits =
      (alert.product.reorderPointPacks || 0) * alert.product.packSize;

    let shouldResolve = false;

    // Check if condition is no longer true
    switch (alert.alertType) {
      case 'stockout':
        shouldResolve = currentStockUnits > 0;
        break;
      case 'critical_stock':
        shouldResolve = currentStockUnits > reorderPointUnits * 0.5;
        break;
      case 'low_stock':
        shouldResolve = currentStockUnits > reorderPointUnits;
        break;
      default:
        break;
    }

    if (shouldResolve) {
      await prisma.alert.update({
        where: { id: alert.id },
        data: {
          isDismissed: true,
          dismissedAt: new Date(),
        },
      });
      resolvedCount++;
    }
  }

  return resolvedCount;
}

// =============================================================================
// FULL ALERT GENERATION
// =============================================================================

/**
 * Run full alert generation for a client
 */
export async function runAlertGeneration(clientId: string): Promise<{
  created: number;
  resolved: number;
  spikes: number;
  noMovement: number;
}> {
  // Resolve outdated alerts first
  const resolved = await resolveOutdatedAlerts(clientId);

  // Generate new alerts
  const created = await generateClientAlerts(clientId);

  // Detect usage spikes
  const spikes = await detectUsageSpikes(clientId);

  // Detect no movement
  const noMovement = await detectNoMovement(clientId);

  return {
    created,
    resolved,
    spikes,
    noMovement,
  };
}
