import { prisma } from '../lib/prisma.js';
import { subMonths, subWeeks, differenceInMonths, differenceInWeeks, format, startOfMonth, endOfMonth } from 'date-fns';

// =============================================================================
// TYPES
// =============================================================================

interface UsageCalculation {
  productId: string;
  calculationBasis: '12-mo' | '3-mo' | 'weekly';
  avgMonthlyUnits: number;
  avgDailyUnits: number;
  avgWeeklyUnits: number;
  dataPointCount: number;
  confidenceLevel: 'high' | 'medium' | 'low';
  calculatedAt: Date;
}

// Phase 13: Enhanced Monthly Usage Types
export type UsageCalculationTier = '12_month' | '6_month' | '3_month' | 'weekly';
export type UsageConfidence = 'high' | 'medium' | 'low';

export interface MonthlyUsageResult {
  productId: string;
  monthlyUsageUnits: number;
  monthlyUsagePacks: number;
  calculationTier: UsageCalculationTier;
  confidence: UsageConfidence;
  dataMonths: number;
  monthlyBreakdown: Array<{
    month: string;
    units: number;
    packs: number;
    transactionCount: number;
  }>;
  calculatedAt: Date;
}

export interface ProductMonthlyUsage {
  id: string;
  productId: string;
  name: string;
  monthlyUsageUnits: number | null;
  monthlyUsagePacks: number | null;
  usageCalculationTier: UsageCalculationTier | null;
  usageConfidence: UsageConfidence | null;
  usageDataMonths: number | null;
  currentStockPacks: number;
  currentStockUnits: number;
  weeksRemaining: number | null;
  packSize: number;
}

interface ReorderPointConfig {
  leadTimeDays: number;
  safetyStockWeeks: number;
  serviceLevelTarget: number;
}

interface Transaction {
  id: string;
  quantityUnits: number;
  dateSubmitted: Date;
  orderStatus: string;
}

// =============================================================================
// USAGE CALCULATION ENGINE
// =============================================================================

/**
 * Calculate usage metrics for a product based on transaction history.
 * Uses tiered approach:
 * - 12+ months of data → 12-month weighted average
 * - 3-12 months → 3-month average
 * - < 3 months → weekly rate
 */
export async function calculateUsage(productId: string): Promise<UsageCalculation> {
  const now = new Date();
  const twelveMonthsAgo = subMonths(now, 12);
  const threeMonthsAgo = subMonths(now, 3);

  // Get all completed transactions for this product
  const transactions = await prisma.transaction.findMany({
    where: {
      productId,
      orderStatus: 'completed',
    },
    orderBy: { dateSubmitted: 'asc' },
  });

  if (transactions.length === 0) {
    return {
      productId,
      calculationBasis: 'weekly',
      avgMonthlyUnits: 0,
      avgDailyUnits: 0,
      avgWeeklyUnits: 0,
      dataPointCount: 0,
      confidenceLevel: 'low',
      calculatedAt: now,
    };
  }

  // Determine data age
  const oldestTransaction = transactions[0];
  const dataAgeMonths = differenceInMonths(now, oldestTransaction.dateSubmitted);

  if (dataAgeMonths >= 12) {
    return calculate12MonthAverage(productId, transactions, twelveMonthsAgo);
  } else if (dataAgeMonths >= 3) {
    return calculate3MonthAverage(productId, transactions, threeMonthsAgo);
  } else {
    return calculateWeeklyRate(productId, transactions);
  }
}

/**
 * 12-month weighted average - recent months get 50% more weight
 */
function calculate12MonthAverage(
  productId: string,
  transactions: Transaction[],
  startDate: Date
): UsageCalculation {
  const now = new Date();
  const relevantTransactions = transactions.filter(
    (t) => t.dateSubmitted >= startDate
  );

  // Group by month
  const monthlyTotals = new Map<string, number>();
  for (const txn of relevantTransactions) {
    const monthKey = format(txn.dateSubmitted, 'yyyy-MM');
    const current = monthlyTotals.get(monthKey) || 0;
    monthlyTotals.set(monthKey, current + txn.quantityUnits);
  }

  const monthlyValues = Array.from(monthlyTotals.values());
  const monthCount = monthlyValues.length;

  if (monthCount === 0) {
    return {
      productId,
      calculationBasis: '12-mo',
      avgMonthlyUnits: 0,
      avgDailyUnits: 0,
      avgWeeklyUnits: 0,
      dataPointCount: 0,
      confidenceLevel: 'low',
      calculatedAt: now,
    };
  }

  // Weighted average: last 3 months get 1.5x weight
  const weights = monthlyValues.map((_, i) =>
    i >= monthCount - 3 ? 1.5 : 1.0
  );

  const weightedSum = monthlyValues.reduce(
    (sum, val, i) => sum + val * weights[i],
    0
  );
  const weightTotal = weights.reduce((sum, w) => sum + w, 0);
  const avgMonthlyUnits = weightedSum / weightTotal;

  const avgDailyUnits = avgMonthlyUnits / 30.44; // Average days per month
  const avgWeeklyUnits = avgDailyUnits * 7;

  return {
    productId,
    calculationBasis: '12-mo',
    avgMonthlyUnits,
    avgDailyUnits,
    avgWeeklyUnits,
    dataPointCount: relevantTransactions.length,
    confidenceLevel: 'high',
    calculatedAt: now,
  };
}

/**
 * 3-month simple average
 */
function calculate3MonthAverage(
  productId: string,
  transactions: Transaction[],
  startDate: Date
): UsageCalculation {
  const now = new Date();
  const relevantTransactions = transactions.filter(
    (t) => t.dateSubmitted >= startDate
  );

  const totalUnits = relevantTransactions.reduce(
    (sum, t) => sum + t.quantityUnits,
    0
  );
  const avgMonthlyUnits = totalUnits / 3;
  const avgDailyUnits = avgMonthlyUnits / 30.44;
  const avgWeeklyUnits = avgDailyUnits * 7;

  return {
    productId,
    calculationBasis: '3-mo',
    avgMonthlyUnits,
    avgDailyUnits,
    avgWeeklyUnits,
    dataPointCount: relevantTransactions.length,
    confidenceLevel: 'medium',
    calculatedAt: now,
  };
}

/**
 * Weekly rate for products with less than 3 months of data
 */
function calculateWeeklyRate(
  productId: string,
  transactions: Transaction[]
): UsageCalculation {
  const now = new Date();

  if (transactions.length === 0) {
    return {
      productId,
      calculationBasis: 'weekly',
      avgMonthlyUnits: 0,
      avgDailyUnits: 0,
      avgWeeklyUnits: 0,
      dataPointCount: 0,
      confidenceLevel: 'low',
      calculatedAt: now,
    };
  }

  const oldest = transactions[0];
  const newest = transactions[transactions.length - 1];
  const weeksOfData = Math.max(
    1,
    differenceInWeeks(newest.dateSubmitted, oldest.dateSubmitted)
  );

  const totalUnits = transactions.reduce((sum, t) => sum + t.quantityUnits, 0);
  const avgWeeklyUnits = totalUnits / weeksOfData;
  const avgDailyUnits = avgWeeklyUnits / 7;
  const avgMonthlyUnits = avgWeeklyUnits * 4.33; // Average weeks per month

  return {
    productId,
    calculationBasis: 'weekly',
    avgMonthlyUnits,
    avgDailyUnits,
    avgWeeklyUnits,
    dataPointCount: transactions.length,
    confidenceLevel: 'low',
    calculatedAt: now,
  };
}

// =============================================================================
// REORDER POINT CALCULATION
// =============================================================================

/**
 * Z-score lookup for service level targets
 */
const Z_SCORES: Record<number, number> = {
  0.90: 1.28,
  0.95: 1.65,
  0.975: 1.96,
  0.99: 2.33,
  0.999: 3.09,
};

/**
 * Calculate reorder point based on usage and configuration
 */
export function calculateReorderPoint(
  avgDailyUnits: number,
  config: ReorderPointConfig,
  demandStdDev?: number
): number {
  // Base demand during lead time
  const leadTimeDemand = avgDailyUnits * config.leadTimeDays;

  let safetyStock: number;

  if (demandStdDev !== undefined && demandStdDev > 0) {
    // Statistical safety stock using service level
    const zScore = Z_SCORES[config.serviceLevelTarget] || 1.65;
    safetyStock = zScore * demandStdDev * Math.sqrt(config.leadTimeDays);
  } else {
    // Simple safety stock based on weeks of coverage
    safetyStock = avgDailyUnits * 7 * config.safetyStockWeeks;
  }

  return Math.ceil(leadTimeDemand + safetyStock);
}

/**
 * Calculate demand standard deviation from transactions
 */
export function calculateDemandStdDev(transactions: Transaction[]): number {
  if (transactions.length < 2) {
    return 0;
  }

  // Group by month
  const monthlyTotals = new Map<string, number>();
  for (const txn of transactions) {
    const monthKey = format(txn.dateSubmitted, 'yyyy-MM');
    const current = monthlyTotals.get(monthKey) || 0;
    monthlyTotals.set(monthKey, current + txn.quantityUnits);
  }

  const values = Array.from(monthlyTotals.values());
  if (values.length < 2) {
    return 0;
  }

  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
  const variance = squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length;

  return Math.sqrt(variance);
}

// =============================================================================
// BATCH RECALCULATION
// =============================================================================

/**
 * Recalculate usage metrics for all products of a client
 */
export async function recalculateClientUsage(clientId: string): Promise<void> {
  // Get client settings
  const client = await prisma.client.findUnique({
    where: { id: clientId },
  });

  if (!client) {
    throw new Error('Client not found');
  }

  const settings = client.settings as {
    reorderLeadDays?: number;
    safetyStockWeeks?: number;
    serviceLevelTarget?: number;
  };

  const config: ReorderPointConfig = {
    leadTimeDays: settings.reorderLeadDays || 14,
    safetyStockWeeks: settings.safetyStockWeeks || 2,
    serviceLevelTarget: settings.serviceLevelTarget || 0.95,
  };

  // Get all active products
  const products = await prisma.product.findMany({
    where: {
      clientId,
      isActive: true,
    },
  });

  // Recalculate for each product
  for (const product of products) {
    const usage = await calculateUsage(product.id);

    // Get transactions for std dev calculation
    const transactions = await prisma.transaction.findMany({
      where: {
        productId: product.id,
        orderStatus: 'completed',
      },
    });

    const demandStdDev =
      usage.calculationBasis === '12-mo'
        ? calculateDemandStdDev(transactions)
        : undefined;

    // Calculate reorder point
    const reorderPointUnits = calculateReorderPoint(
      usage.avgDailyUnits,
      config,
      demandStdDev
    );
    const reorderPointPacks = Math.ceil(reorderPointUnits / product.packSize);

    // Update product with new metrics
    await prisma.product.update({
      where: { id: product.id },
      data: {
        reorderPointPacks,
        calculationBasis: usage.calculationBasis,
      },
    });

    // Store usage metrics history
    const now = new Date();
    const periodStart = subMonths(now, usage.calculationBasis === '12-mo' ? 12 : 3);

    await prisma.usageMetric.upsert({
      where: {
        productId_periodType_periodStart: {
          productId: product.id,
          periodType: usage.calculationBasis,
          periodStart,
        },
      },
      update: {
        periodEnd: now,
        totalConsumedUnits: Math.round(usage.avgMonthlyUnits * 12),
        avgDailyUnits: usage.avgDailyUnits,
        avgDailyPacks: usage.avgDailyUnits / product.packSize,
        transactionCount: usage.dataPointCount,
        calculatedAt: now,
      },
      create: {
        productId: product.id,
        periodType: usage.calculationBasis,
        periodStart,
        periodEnd: now,
        totalConsumedUnits: Math.round(usage.avgMonthlyUnits * 12),
        avgDailyUnits: usage.avgDailyUnits,
        avgDailyPacks: usage.avgDailyUnits / product.packSize,
        transactionCount: usage.dataPointCount,
        calculatedAt: now,
      },
    });
  }
}

/**
 * Recalculate usage for a single product
 */
export async function recalculateProductUsage(productId: string): Promise<UsageCalculation> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { client: true },
  });

  if (!product) {
    throw new Error('Product not found');
  }

  const usage = await calculateUsage(productId);

  const settings = product.client.settings as {
    reorderLeadDays?: number;
    safetyStockWeeks?: number;
    serviceLevelTarget?: number;
  };

  const config: ReorderPointConfig = {
    leadTimeDays: settings.reorderLeadDays || 14,
    safetyStockWeeks: settings.safetyStockWeeks || 2,
    serviceLevelTarget: settings.serviceLevelTarget || 0.95,
  };

  // Get transactions for std dev
  const transactions = await prisma.transaction.findMany({
    where: {
      productId,
      orderStatus: 'completed',
    },
  });

  const demandStdDev =
    usage.calculationBasis === '12-mo'
      ? calculateDemandStdDev(transactions)
      : undefined;

  const reorderPointUnits = calculateReorderPoint(
    usage.avgDailyUnits,
    config,
    demandStdDev
  );
  const reorderPointPacks = Math.ceil(reorderPointUnits / product.packSize);

  // Update product
  await prisma.product.update({
    where: { id: productId },
    data: {
      reorderPointPacks,
      calculationBasis: usage.calculationBasis,
    },
  });

  return usage;
}

// =============================================================================
// PHASE 13: MONTHLY USAGE INTELLIGENCE
// =============================================================================

/**
 * Calculate monthly usage for a product with tier transparency.
 * Shows which calculation tier was used (12-month, 6-month, 3-month, or <3 months).
 * Both admin and portal dashboards display this for transparency.
 *
 * Tiers:
 * - 12_month: 12+ months of data → HIGH confidence
 * - 6_month: 6-11 months of data → MEDIUM confidence
 * - 3_month: 3-5 months of data → MEDIUM confidence
 * - weekly: <3 months of data → LOW confidence (extrapolated from weekly rate)
 */
export async function calculateMonthlyUsage(productId: string): Promise<MonthlyUsageResult> {
  const now = new Date();

  // Get product with pack size
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { packSize: true },
  });

  if (!product) {
    throw new Error('Product not found');
  }

  // Get all completed transactions for this product
  const transactions = await prisma.transaction.findMany({
    where: {
      productId,
      orderStatus: 'completed',
    },
    orderBy: { dateSubmitted: 'asc' },
  });

  // Group transactions by month
  const monthlyData = new Map<string, { units: number; transactionCount: number }>();

  for (const txn of transactions) {
    const monthKey = format(txn.dateSubmitted, 'yyyy-MM');
    const existing = monthlyData.get(monthKey) || { units: 0, transactionCount: 0 };
    monthlyData.set(monthKey, {
      units: existing.units + txn.quantityUnits,
      transactionCount: existing.transactionCount + 1,
    });
  }

  const monthlyBreakdown = Array.from(monthlyData.entries())
    .map(([month, data]) => ({
      month,
      units: data.units,
      packs: data.units / product.packSize,
      transactionCount: data.transactionCount,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const dataMonths = monthlyBreakdown.length;

  // No data case
  if (dataMonths === 0) {
    return {
      productId,
      monthlyUsageUnits: 0,
      monthlyUsagePacks: 0,
      calculationTier: 'weekly',
      confidence: 'low',
      dataMonths: 0,
      monthlyBreakdown: [],
      calculatedAt: now,
    };
  }

  // Determine calculation tier and calculate monthly average
  let calculationTier: UsageCalculationTier;
  let confidence: UsageConfidence;
  let monthlyUsageUnits: number;

  if (dataMonths >= 12) {
    // Use 12-month weighted average (recent months get more weight)
    calculationTier = '12_month';
    confidence = 'high';
    const recentMonths = monthlyBreakdown.slice(-12);

    // Weight: last 3 months get 1.5x weight
    const weights = recentMonths.map((_, i) => i >= recentMonths.length - 3 ? 1.5 : 1.0);
    const weightedSum = recentMonths.reduce((sum, m, i) => sum + m.units * weights[i], 0);
    const weightTotal = weights.reduce((sum, w) => sum + w, 0);
    monthlyUsageUnits = weightedSum / weightTotal;
  } else if (dataMonths >= 6) {
    // Use 6-month average
    calculationTier = '6_month';
    confidence = 'medium';
    const recentMonths = monthlyBreakdown.slice(-6);
    const totalUnits = recentMonths.reduce((sum, m) => sum + m.units, 0);
    monthlyUsageUnits = totalUnits / 6;
  } else if (dataMonths >= 3) {
    // Use 3-month average
    calculationTier = '3_month';
    confidence = 'medium';
    const recentMonths = monthlyBreakdown.slice(-3);
    const totalUnits = recentMonths.reduce((sum, m) => sum + m.units, 0);
    monthlyUsageUnits = totalUnits / 3;
  } else {
    // Less than 3 months - extrapolate from weekly rate
    calculationTier = 'weekly';
    confidence = 'low';

    if (transactions.length === 0) {
      monthlyUsageUnits = 0;
    } else {
      const oldest = transactions[0];
      const newest = transactions[transactions.length - 1];
      const weeksOfData = Math.max(1, differenceInWeeks(newest.dateSubmitted, oldest.dateSubmitted));
      const totalUnits = transactions.reduce((sum, t) => sum + t.quantityUnits, 0);
      const weeklyRate = totalUnits / weeksOfData;
      monthlyUsageUnits = weeklyRate * 4.33; // Average weeks per month
    }
  }

  const monthlyUsagePacks = monthlyUsageUnits / product.packSize;

  return {
    productId,
    monthlyUsageUnits,
    monthlyUsagePacks,
    calculationTier,
    confidence,
    dataMonths,
    monthlyBreakdown,
    calculatedAt: now,
  };
}

/**
 * Store monthly usage snapshots for historical tracking.
 * Creates/updates MonthlyUsageSnapshot records for each month with data.
 */
export async function storeMonthlyUsageSnapshots(productId: string): Promise<void> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { packSize: true },
  });

  if (!product) {
    throw new Error('Product not found');
  }

  // Get all completed transactions grouped by month
  const transactions = await prisma.transaction.findMany({
    where: {
      productId,
      orderStatus: 'completed',
    },
    orderBy: { dateSubmitted: 'asc' },
  });

  // Group by month
  const monthlyData = new Map<string, { units: number; transactionCount: number }>();

  for (const txn of transactions) {
    const monthKey = format(txn.dateSubmitted, 'yyyy-MM');
    const existing = monthlyData.get(monthKey) || { units: 0, transactionCount: 0 };
    monthlyData.set(monthKey, {
      units: existing.units + txn.quantityUnits,
      transactionCount: existing.transactionCount + 1,
    });
  }

  // Upsert snapshots for each month
  for (const [yearMonth, data] of monthlyData.entries()) {
    await prisma.monthlyUsageSnapshot.upsert({
      where: {
        productId_yearMonth: {
          productId,
          yearMonth,
        },
      },
      update: {
        consumedUnits: data.units,
        consumedPacks: data.units / product.packSize,
        transactionCount: data.transactionCount,
      },
      create: {
        productId,
        yearMonth,
        consumedUnits: data.units,
        consumedPacks: data.units / product.packSize,
        transactionCount: data.transactionCount,
      },
    });
  }
}

/**
 * Update product with calculated monthly usage fields.
 * This should be called after calculateMonthlyUsage.
 */
export async function updateProductMonthlyUsage(productId: string): Promise<void> {
  const usageResult = await calculateMonthlyUsage(productId);

  await prisma.product.update({
    where: { id: productId },
    data: {
      monthlyUsageUnits: usageResult.monthlyUsageUnits,
      monthlyUsagePacks: usageResult.monthlyUsagePacks,
      usageDataMonths: usageResult.dataMonths,
      usageCalculationTier: usageResult.calculationTier,
      usageConfidence: usageResult.confidence,
      usageLastCalculated: usageResult.calculatedAt,
    },
  });

  // Also store monthly snapshots
  await storeMonthlyUsageSnapshots(productId);
}

/**
 * Recalculate monthly usage for all products of a client.
 * Updates all products with new Phase 13 monthly usage fields.
 */
export async function recalculateClientMonthlyUsage(clientId: string): Promise<{
  processed: number;
  errors: string[];
}> {
  const products = await prisma.product.findMany({
    where: {
      clientId,
      isActive: true,
    },
    select: { id: true, productId: true },
  });

  let processed = 0;
  const errors: string[] = [];

  for (const product of products) {
    try {
      await updateProductMonthlyUsage(product.id);
      processed++;
    } catch (error) {
      errors.push(`${product.productId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  return { processed, errors };
}

/**
 * Get monthly usage data for display in both admin and portal dashboards.
 * Returns product with usage tier badge information.
 */
export async function getProductWithMonthlyUsage(productId: string): Promise<ProductMonthlyUsage | null> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      productId: true,
      name: true,
      monthlyUsageUnits: true,
      monthlyUsagePacks: true,
      usageCalculationTier: true,
      usageConfidence: true,
      usageDataMonths: true,
      currentStockPacks: true,
      currentStockUnits: true,
      weeksRemaining: true,
      packSize: true,
    },
  });

  if (!product) {
    return null;
  }

  return {
    ...product,
    usageCalculationTier: product.usageCalculationTier as UsageCalculationTier | null,
    usageConfidence: product.usageConfidence as UsageConfidence | null,
  };
}

/**
 * Get monthly breakdown for a product (for detailed view/charts).
 */
export async function getMonthlyUsageBreakdown(
  productId: string,
  months: number = 12
): Promise<Array<{ month: string; units: number; packs: number; transactionCount: number }>> {
  const snapshots = await prisma.monthlyUsageSnapshot.findMany({
    where: { productId },
    orderBy: { yearMonth: 'desc' },
    take: months,
  });

  return snapshots.map((s) => ({
    month: s.yearMonth,
    units: s.consumedUnits,
    packs: s.consumedPacks,
    transactionCount: s.transactionCount,
  })).reverse();
}

/**
 * Get usage tier display information for UI badges.
 */
export function getUsageTierDisplay(tier: UsageCalculationTier | null): {
  label: string;
  shortLabel: string;
  color: 'green' | 'blue' | 'amber' | 'gray';
  tooltip: string;
} {
  switch (tier) {
    case '12_month':
      return {
        label: '12-month average',
        shortLabel: '12-mo avg',
        color: 'green',
        tooltip: 'Calculated from 12+ months of transaction data. High confidence.',
      };
    case '6_month':
      return {
        label: '6-month average',
        shortLabel: '6-mo avg',
        color: 'blue',
        tooltip: 'Calculated from 6-11 months of transaction data. Medium confidence.',
      };
    case '3_month':
      return {
        label: '3-month average',
        shortLabel: '3-mo avg',
        color: 'amber',
        tooltip: 'Calculated from 3-5 months of transaction data. Medium confidence.',
      };
    case 'weekly':
    default:
      return {
        label: 'Less than 3 months',
        shortLabel: '< 3 mo',
        color: 'gray',
        tooltip: 'Less than 3 months of data. Extrapolated from weekly rate. Low confidence.',
      };
  }
}

/**
 * Calculate suggested reorder quantity based on monthly usage and runway.
 */
export function calculateSuggestedReorderQuantity(
  monthlyUsageUnits: number,
  currentStockUnits: number,
  packSize: number,
  targetWeeksOfStock: number = 8, // Default 2 months
  leadTimeWeeks: number = 2
): { suggestedPacks: number; suggestedUnits: number; weeksRemaining: number } {
  if (monthlyUsageUnits <= 0) {
    return {
      suggestedPacks: 0,
      suggestedUnits: 0,
      weeksRemaining: currentStockUnits > 0 ? 999 : 0,
    };
  }

  const weeklyUsage = monthlyUsageUnits / 4.33;
  const weeksRemaining = weeklyUsage > 0 ? currentStockUnits / weeklyUsage : 999;

  // Calculate how much we need to reach target weeks of stock
  const targetUnits = weeklyUsage * (targetWeeksOfStock + leadTimeWeeks);
  const unitsNeeded = Math.max(0, targetUnits - currentStockUnits);

  // Round up to nearest pack
  const suggestedPacks = Math.ceil(unitsNeeded / packSize);
  const suggestedUnits = suggestedPacks * packSize;

  return {
    suggestedPacks,
    suggestedUnits,
    weeksRemaining: Math.round(weeksRemaining * 10) / 10, // Round to 1 decimal
  };
}
