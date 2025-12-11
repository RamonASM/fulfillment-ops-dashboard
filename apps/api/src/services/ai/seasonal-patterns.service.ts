import { prisma } from '../../lib/prisma.js';
import { subMonths, format, getMonth, getQuarter } from 'date-fns';

// =============================================================================
// SEASONAL PATTERN DETECTION SERVICE
// Identifies cyclical patterns in usage data for better forecasting
// =============================================================================

interface SeasonalPattern {
  productId: string;
  productName: string;
  patternType: 'monthly' | 'quarterly' | 'annual';
  confidence: number; // 0-1
  seasonalFactors: SeasonalFactor[];
  peakPeriod: string;
  troughPeriod: string;
  averageAmplitude: number; // How much usage varies seasonally
  detectedAt: Date;
}

interface SeasonalFactor {
  period: string; // "January", "Q1", "Week 1", etc.
  factor: number; // Multiplier vs average (1.0 = average, 1.2 = 20% above)
  confidence: number;
}

interface MonthlyAggregate {
  month: number; // 0-11
  year: number;
  totalUnits: number;
  transactionCount: number;
}

// =============================================================================
// STATISTICAL HELPERS
// =============================================================================

function calculateMean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function calculateStdDev(values: number[], mean: number): number {
  if (values.length === 0) return 0;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

function calculateCorrelation(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length < 2) return 0;

  const n = x.length;
  const meanX = calculateMean(x);
  const meanY = calculateMean(y);

  let numerator = 0;
  let denomX = 0;
  let denomY = 0;

  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    numerator += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }

  const denominator = Math.sqrt(denomX * denomY);
  if (denominator === 0) return 0;

  return numerator / denominator;
}

// =============================================================================
// MONTHLY PATTERN DETECTION
// =============================================================================

async function detectMonthlyPattern(productId: string): Promise<SeasonalPattern | null> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
  });

  if (!product) return null;

  // Get 18+ months of data for reliable patterns
  const startDate = subMonths(new Date(), 24);
  const transactions = await prisma.transaction.findMany({
    where: {
      productId,
      dateSubmitted: { gte: startDate },
    },
    orderBy: { dateSubmitted: 'asc' },
  });

  if (transactions.length < 50) return null; // Need sufficient data

  // Aggregate by month
  const monthlyData: Map<string, MonthlyAggregate> = new Map();
  transactions.forEach((tx) => {
    const month = tx.dateSubmitted.getMonth();
    const year = tx.dateSubmitted.getFullYear();
    const key = `${year}-${month}`;

    const existing = monthlyData.get(key) || { month, year, totalUnits: 0, transactionCount: 0 };
    existing.totalUnits += tx.quantityUnits;
    existing.transactionCount += 1;
    monthlyData.set(key, existing);
  });

  const aggregates = Array.from(monthlyData.values());

  if (aggregates.length < 12) return null; // Need at least a year

  // Calculate overall average
  const overallMean = calculateMean(aggregates.map((a) => a.totalUnits));

  if (overallMean === 0) return null;

  // Group by month-of-year (0-11)
  const monthGroups: Map<number, number[]> = new Map();
  aggregates.forEach((agg) => {
    const values = monthGroups.get(agg.month) || [];
    values.push(agg.totalUnits);
    monthGroups.set(agg.month, values);
  });

  // Calculate seasonal factors for each month
  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  const seasonalFactors: SeasonalFactor[] = [];
  let peakMonth = 0;
  let troughMonth = 0;
  let peakFactor = 0;
  let troughFactor = Infinity;

  for (let month = 0; month < 12; month++) {
    const values = monthGroups.get(month) || [];
    if (values.length === 0) {
      seasonalFactors.push({
        period: monthNames[month],
        factor: 1.0,
        confidence: 0,
      });
      continue;
    }

    const monthMean = calculateMean(values);
    const factor = monthMean / overallMean;
    const stdDev = calculateStdDev(values, monthMean);
    const cv = stdDev / monthMean; // Coefficient of variation

    // Confidence is higher when CV is low (consistent pattern)
    const confidence = Math.max(0, 1 - cv);

    seasonalFactors.push({
      period: monthNames[month],
      factor,
      confidence,
    });

    if (factor > peakFactor) {
      peakFactor = factor;
      peakMonth = month;
    }
    if (factor < troughFactor) {
      troughFactor = factor;
      troughMonth = month;
    }
  }

  // Calculate pattern strength (amplitude)
  const amplitude = (peakFactor - troughFactor) / 2;

  // Calculate overall pattern confidence
  // Higher when there's clear variation between months
  const factors = seasonalFactors.map((sf) => sf.factor);
  const factorStdDev = calculateStdDev(factors, 1.0);
  const patternConfidence = Math.min(1, factorStdDev * 2);

  // Only return if pattern is significant
  if (patternConfidence < 0.2) return null;

  return {
    productId,
    productName: product.name,
    patternType: 'monthly',
    confidence: patternConfidence,
    seasonalFactors,
    peakPeriod: monthNames[peakMonth],
    troughPeriod: monthNames[troughMonth],
    averageAmplitude: amplitude,
    detectedAt: new Date(),
  };
}

// =============================================================================
// QUARTERLY PATTERN DETECTION
// =============================================================================

async function detectQuarterlyPattern(productId: string): Promise<SeasonalPattern | null> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
  });

  if (!product) return null;

  const startDate = subMonths(new Date(), 24);
  const transactions = await prisma.transaction.findMany({
    where: {
      productId,
      dateSubmitted: { gte: startDate },
    },
  });

  if (transactions.length < 30) return null;

  // Group by quarter
  const quarterData: Map<string, { quarter: number; year: number; totalUnits: number }> = new Map();
  transactions.forEach((tx) => {
    const quarter = getQuarter(tx.dateSubmitted);
    const year = tx.dateSubmitted.getFullYear();
    const key = `${year}-Q${quarter}`;

    const existing = quarterData.get(key) || { quarter, year, totalUnits: 0 };
    existing.totalUnits += tx.quantityUnits;
    quarterData.set(key, existing);
  });

  const aggregates = Array.from(quarterData.values());

  if (aggregates.length < 4) return null;

  const overallMean = calculateMean(aggregates.map((a) => a.totalUnits));
  if (overallMean === 0) return null;

  // Group by quarter number
  const quarterGroups: Map<number, number[]> = new Map();
  aggregates.forEach((agg) => {
    const values = quarterGroups.get(agg.quarter) || [];
    values.push(agg.totalUnits);
    quarterGroups.set(agg.quarter, values);
  });

  const quarterNames = ['Q1', 'Q2', 'Q3', 'Q4'];
  const seasonalFactors: SeasonalFactor[] = [];
  let peakQuarter = 1;
  let troughQuarter = 1;
  let peakFactor = 0;
  let troughFactor = Infinity;

  for (let q = 1; q <= 4; q++) {
    const values = quarterGroups.get(q) || [];
    if (values.length === 0) {
      seasonalFactors.push({ period: quarterNames[q - 1], factor: 1.0, confidence: 0 });
      continue;
    }

    const qMean = calculateMean(values);
    const factor = qMean / overallMean;
    const stdDev = calculateStdDev(values, qMean);
    const confidence = Math.max(0, 1 - (stdDev / qMean));

    seasonalFactors.push({ period: quarterNames[q - 1], factor, confidence });

    if (factor > peakFactor) {
      peakFactor = factor;
      peakQuarter = q;
    }
    if (factor < troughFactor) {
      troughFactor = factor;
      troughQuarter = q;
    }
  }

  const amplitude = (peakFactor - troughFactor) / 2;
  const factors = seasonalFactors.map((sf) => sf.factor);
  const patternConfidence = Math.min(1, calculateStdDev(factors, 1.0) * 2);

  if (patternConfidence < 0.15) return null;

  return {
    productId,
    productName: product.name,
    patternType: 'quarterly',
    confidence: patternConfidence,
    seasonalFactors,
    peakPeriod: quarterNames[peakQuarter - 1],
    troughPeriod: quarterNames[troughQuarter - 1],
    averageAmplitude: amplitude,
    detectedAt: new Date(),
  };
}

// =============================================================================
// MAIN DETECTION FUNCTIONS
// =============================================================================

export async function detectSeasonalPatterns(productId: string): Promise<SeasonalPattern[]> {
  const patterns: SeasonalPattern[] = [];

  const [monthlyPattern, quarterlyPattern] = await Promise.all([
    detectMonthlyPattern(productId),
    detectQuarterlyPattern(productId),
  ]);

  if (monthlyPattern) patterns.push(monthlyPattern);
  if (quarterlyPattern) patterns.push(quarterlyPattern);

  return patterns;
}

export async function detectClientSeasonalPatterns(clientId: string): Promise<SeasonalPattern[]> {
  const products = await prisma.product.findMany({
    where: { clientId, isActive: true },
    select: { id: true },
  });

  const allPatterns: SeasonalPattern[] = [];

  // Process in batches
  const batchSize = 5;
  for (let i = 0; i < products.length; i += batchSize) {
    const batch = products.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((product) => detectSeasonalPatterns(product.id))
    );
    allPatterns.push(...batchResults.flat());
  }

  // Sort by confidence
  allPatterns.sort((a, b) => b.confidence - a.confidence);

  return allPatterns;
}

// =============================================================================
// SEASONAL FORECAST ADJUSTMENT
// =============================================================================

export function applySeasonalAdjustment(
  baselineValue: number,
  pattern: SeasonalPattern,
  targetPeriod: string
): number {
  const factor = pattern.seasonalFactors.find((sf) => sf.period === targetPeriod);
  if (!factor) return baselineValue;

  return baselineValue * factor.factor;
}

export async function getSeasonalForecast(
  productId: string,
  monthsAhead: number
): Promise<Array<{ period: string; forecast: number; confidence: number }>> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
  });

  if (!product || !product.avgDailyUsage) return [];

  const patterns = await detectSeasonalPatterns(productId);
  const monthlyPattern = patterns.find((p) => p.patternType === 'monthly');

  const forecasts: Array<{ period: string; forecast: number; confidence: number }> = [];
  const baselineMonthly = (product.avgDailyUsage || 0) * 30;

  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  const currentMonth = new Date().getMonth();

  for (let i = 1; i <= monthsAhead; i++) {
    const targetMonth = (currentMonth + i) % 12;
    const monthName = monthNames[targetMonth];

    let forecast = baselineMonthly;
    let confidence = 0.5; // Baseline confidence

    if (monthlyPattern) {
      forecast = applySeasonalAdjustment(baselineMonthly, monthlyPattern, monthName);
      const factor = monthlyPattern.seasonalFactors.find((sf) => sf.period === monthName);
      confidence = factor
        ? (factor.confidence + monthlyPattern.confidence) / 2
        : monthlyPattern.confidence * 0.5;
    }

    forecasts.push({
      period: monthName,
      forecast: Math.round(forecast),
      confidence: Math.round(confidence * 100) / 100,
    });
  }

  return forecasts;
}
