import { prisma } from '../../lib/prisma.js';
import { subDays, subMonths, startOfMonth, endOfMonth, format } from 'date-fns';

// =============================================================================
// ANOMALY DETECTION SERVICE
// Uses statistical methods to detect unusual patterns in inventory data
// =============================================================================

interface AnomalyResult {
  id: string;
  productId: string;
  productName: string;
  clientId: string;
  anomalyType: 'usage_spike' | 'usage_drop' | 'stock_anomaly' | 'order_pattern';
  severity: 'low' | 'medium' | 'high';
  description: string;
  currentValue: number;
  expectedValue: number;
  deviation: number;
  detectedAt: Date;
  metadata: Record<string, unknown>;
}

interface MonthlyUsage {
  month: string;
  totalUnits: number;
  transactionCount: number;
}

// =============================================================================
// ISOLATION FOREST-INSPIRED ANOMALY SCORING
// =============================================================================

function calculateAnomalyScore(value: number, mean: number, stdDev: number): number {
  if (stdDev === 0) return 0;
  const zScore = Math.abs((value - mean) / stdDev);
  // Convert Z-score to 0-1 probability of being anomalous
  // Z > 3 is very likely anomalous, Z < 1 is normal
  return Math.min(1, Math.max(0, (zScore - 1) / 2));
}

function getSeverity(score: number): 'low' | 'medium' | 'high' {
  if (score >= 0.7) return 'high';
  if (score >= 0.4) return 'medium';
  return 'low';
}

// =============================================================================
// DETECT USAGE ANOMALIES
// =============================================================================

async function detectUsageAnomalies(productId: string): Promise<AnomalyResult[]> {
  const anomalies: AnomalyResult[] = [];

  // Get product info
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { client: true },
  });

  if (!product) return anomalies;

  // Get 12 months of transaction data
  const startDate = subMonths(new Date(), 12);
  const transactions = await prisma.transaction.findMany({
    where: {
      productId,
      dateSubmitted: { gte: startDate },
    },
    orderBy: { dateSubmitted: 'asc' },
  });

  if (transactions.length < 10) return anomalies; // Need enough data

  // Aggregate by month
  const monthlyData: Map<string, MonthlyUsage> = new Map();
  transactions.forEach((tx) => {
    const month = format(tx.dateSubmitted, 'yyyy-MM');
    const existing = monthlyData.get(month) || { month, totalUnits: 0, transactionCount: 0 };
    existing.totalUnits += tx.quantityUnits;
    existing.transactionCount += 1;
    monthlyData.set(month, existing);
  });

  const monthlyValues = Array.from(monthlyData.values());

  if (monthlyValues.length < 3) return anomalies; // Need at least 3 months

  // Calculate statistics
  const usageValues = monthlyValues.map((m) => m.totalUnits);
  const mean = usageValues.reduce((a, b) => a + b, 0) / usageValues.length;
  const variance =
    usageValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / usageValues.length;
  const stdDev = Math.sqrt(variance);

  // Check most recent month for anomalies
  const recentMonth = monthlyValues[monthlyValues.length - 1];
  const score = calculateAnomalyScore(recentMonth.totalUnits, mean, stdDev);

  if (score >= 0.3) {
    const isSpike = recentMonth.totalUnits > mean;
    anomalies.push({
      id: `usage-${productId}-${recentMonth.month}`,
      productId,
      productName: product.name,
      clientId: product.clientId,
      anomalyType: isSpike ? 'usage_spike' : 'usage_drop',
      severity: getSeverity(score),
      description: isSpike
        ? `Usage ${Math.round(((recentMonth.totalUnits - mean) / mean) * 100)}% above normal for ${product.name}`
        : `Usage ${Math.round(((mean - recentMonth.totalUnits) / mean) * 100)}% below normal for ${product.name}`,
      currentValue: recentMonth.totalUnits,
      expectedValue: mean,
      deviation: (recentMonth.totalUnits - mean) / (stdDev || 1),
      detectedAt: new Date(),
      metadata: {
        month: recentMonth.month,
        historicalMean: mean,
        historicalStdDev: stdDev,
        transactionCount: recentMonth.transactionCount,
      },
    });
  }

  return anomalies;
}

// =============================================================================
// DETECT STOCK LEVEL ANOMALIES
// =============================================================================

async function detectStockAnomalies(productId: string): Promise<AnomalyResult[]> {
  const anomalies: AnomalyResult[] = [];

  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { client: true },
  });

  if (!product) return anomalies;

  // Get stock history
  const stockHistory = await prisma.stockHistory.findMany({
    where: { productId },
    orderBy: { recordedAt: 'desc' },
    take: 30, // Last 30 records
  });

  if (stockHistory.length < 5) return anomalies;

  const stockValues = stockHistory.map((h) => h.packsAvailable);
  const mean = stockValues.reduce((a, b) => a + b, 0) / stockValues.length;
  const variance =
    stockValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / stockValues.length;
  const stdDev = Math.sqrt(variance);

  // Check current stock vs historical pattern
  const currentStock = product.currentStockPacks;
  const score = calculateAnomalyScore(currentStock, mean, stdDev);

  if (score >= 0.4) {
    anomalies.push({
      id: `stock-${productId}-${Date.now()}`,
      productId,
      productName: product.name,
      clientId: product.clientId,
      anomalyType: 'stock_anomaly',
      severity: getSeverity(score),
      description:
        currentStock > mean
          ? `Stock level unusually high for ${product.name}`
          : `Stock level unusually low for ${product.name}`,
      currentValue: currentStock,
      expectedValue: mean,
      deviation: (currentStock - mean) / (stdDev || 1),
      detectedAt: new Date(),
      metadata: {
        historicalMean: mean,
        historicalStdDev: stdDev,
        recordCount: stockHistory.length,
      },
    });
  }

  return anomalies;
}

// =============================================================================
// DETECT ORDER PATTERN ANOMALIES
// =============================================================================

async function detectOrderPatternAnomalies(productId: string): Promise<AnomalyResult[]> {
  const anomalies: AnomalyResult[] = [];

  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { client: true },
  });

  if (!product) return anomalies;

  // Get transactions grouped by week
  const startDate = subDays(new Date(), 90); // Last 90 days
  const transactions = await prisma.transaction.findMany({
    where: {
      productId,
      dateSubmitted: { gte: startDate },
    },
    orderBy: { dateSubmitted: 'asc' },
  });

  if (transactions.length < 10) return anomalies;

  // Check for irregular ordering patterns
  const orderDates = transactions.map((t) => t.dateSubmitted.getTime());
  const intervals: number[] = [];

  for (let i = 1; i < orderDates.length; i++) {
    intervals.push((orderDates[i] - orderDates[i - 1]) / (1000 * 60 * 60 * 24)); // Days
  }

  if (intervals.length < 3) return anomalies;

  const meanInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const variance =
    intervals.reduce((sum, val) => sum + Math.pow(val - meanInterval, 2), 0) / intervals.length;
  const stdDevInterval = Math.sqrt(variance);

  // Check most recent interval
  const lastInterval = intervals[intervals.length - 1];
  const score = calculateAnomalyScore(lastInterval, meanInterval, stdDevInterval);

  if (score >= 0.4) {
    anomalies.push({
      id: `pattern-${productId}-${Date.now()}`,
      productId,
      productName: product.name,
      clientId: product.clientId,
      anomalyType: 'order_pattern',
      severity: getSeverity(score),
      description:
        lastInterval > meanInterval
          ? `Ordering frequency dropped significantly for ${product.name}`
          : `Ordering frequency increased significantly for ${product.name}`,
      currentValue: lastInterval,
      expectedValue: meanInterval,
      deviation: (lastInterval - meanInterval) / (stdDevInterval || 1),
      detectedAt: new Date(),
      metadata: {
        daysInterval: lastInterval,
        expectedInterval: meanInterval,
        intervalStdDev: stdDevInterval,
      },
    });
  }

  return anomalies;
}

// =============================================================================
// MAIN DETECTION FUNCTIONS
// =============================================================================

export async function detectProductAnomalies(productId: string): Promise<AnomalyResult[]> {
  const [usageAnomalies, stockAnomalies, patternAnomalies] = await Promise.all([
    detectUsageAnomalies(productId),
    detectStockAnomalies(productId),
    detectOrderPatternAnomalies(productId),
  ]);

  return [...usageAnomalies, ...stockAnomalies, ...patternAnomalies];
}

export async function detectClientAnomalies(clientId: string): Promise<AnomalyResult[]> {
  const products = await prisma.product.findMany({
    where: { clientId, isActive: true },
    select: { id: true },
  });

  const allAnomalies: AnomalyResult[] = [];

  // Process in batches to avoid overwhelming the database
  const batchSize = 10;
  for (let i = 0; i < products.length; i += batchSize) {
    const batch = products.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((product) => detectProductAnomalies(product.id))
    );
    allAnomalies.push(...batchResults.flat());
  }

  // Sort by severity and deviation
  allAnomalies.sort((a, b) => {
    const severityOrder = { high: 0, medium: 1, low: 2 };
    if (severityOrder[a.severity] !== severityOrder[b.severity]) {
      return severityOrder[a.severity] - severityOrder[b.severity];
    }
    return Math.abs(b.deviation) - Math.abs(a.deviation);
  });

  return allAnomalies;
}

export async function getTopAnomalies(
  userId: string,
  limit: number = 10
): Promise<AnomalyResult[]> {
  // Get user's clients
  const userClients = await prisma.userClient.findMany({
    where: { userId },
    select: { clientId: true },
  });

  const clientIds = userClients.map((uc) => uc.clientId);
  const allAnomalies: AnomalyResult[] = [];

  for (const clientId of clientIds) {
    const clientAnomalies = await detectClientAnomalies(clientId);
    allAnomalies.push(...clientAnomalies);
  }

  // Return top anomalies by severity
  return allAnomalies.slice(0, limit);
}

// =============================================================================
// CREATE ALERTS FROM ANOMALIES
// =============================================================================

export async function createAlertsFromAnomalies(
  clientId: string,
  anomalies: AnomalyResult[]
): Promise<number> {
  let createdCount = 0;

  for (const anomaly of anomalies) {
    // Only create alerts for medium and high severity
    if (anomaly.severity === 'low') continue;

    // Check if similar alert already exists (within last 24 hours)
    const existingAlert = await prisma.alert.findFirst({
      where: {
        clientId,
        productId: anomaly.productId,
        alertType: anomaly.anomalyType,
        createdAt: { gte: subDays(new Date(), 1) },
      },
    });

    if (existingAlert) continue;

    // Create new alert
    await prisma.alert.create({
      data: {
        clientId,
        productId: anomaly.productId,
        alertType: anomaly.anomalyType,
        severity: anomaly.severity === 'high' ? 'critical' : 'warning',
        status: 'active',
        title: anomaly.description,
        message: `Detected ${anomaly.anomalyType.replace('_', ' ')} anomaly. Current: ${anomaly.currentValue.toFixed(1)}, Expected: ${anomaly.expectedValue.toFixed(1)}, Deviation: ${anomaly.deviation.toFixed(2)} standard deviations.`,
        currentValue: anomaly.currentValue,
        thresholdValue: anomaly.expectedValue,
      },
    });

    createdCount++;
  }

  return createdCount;
}
