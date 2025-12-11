import { prisma } from '../../lib/prisma.js';
import { subMonths, differenceInDays } from 'date-fns';

// =============================================================================
// TYPES
// =============================================================================

export interface RiskScore {
  productId: string;
  score: number; // 0-100, higher = more risk
  factors: RiskFactor[];
  riskLevel: 'low' | 'moderate' | 'high' | 'critical';
  calculatedAt: Date;
}

export interface RiskFactor {
  name: string;
  weight: number;
  value: number;
  contribution: number;
  description: string;
}

export interface ClientRiskSummary {
  clientId: string;
  overallScore: number;
  riskLevel: 'low' | 'moderate' | 'high' | 'critical';
  totalProducts: number;
  productsAtRisk: number;
  criticalProducts: string[];
  topRiskFactors: string[];
}

// =============================================================================
// RISK FACTORS CONFIGURATION
// =============================================================================

const RISK_WEIGHTS = {
  stockRatio: 0.25, // Current stock vs reorder point
  velocityTrend: 0.20, // Is usage accelerating?
  historyReliability: 0.15, // Do we have good data?
  daysToStockout: 0.25, // How soon will we run out?
  variability: 0.15, // How unpredictable is demand?
};

// =============================================================================
// RISK CALCULATION ENGINE
// =============================================================================

/**
 * Calculate comprehensive risk score for a product
 */
export async function calculateProductRisk(productId: string): Promise<RiskScore> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      client: true,
    },
  });

  if (!product) {
    throw new Error('Product not found');
  }

  // Get usage metrics
  const usageMetric = await prisma.usageMetric.findFirst({
    where: { productId },
    orderBy: { calculatedAt: 'desc' },
  });

  // Get transactions for trend analysis
  const threeMonthsAgo = subMonths(new Date(), 3);
  const sixMonthsAgo = subMonths(new Date(), 6);

  const recentTransactions = await prisma.transaction.findMany({
    where: {
      productId,
      dateSubmitted: { gte: threeMonthsAgo },
      orderStatus: 'completed',
    },
    orderBy: { dateSubmitted: 'desc' },
  });

  const olderTransactions = await prisma.transaction.findMany({
    where: {
      productId,
      dateSubmitted: {
        gte: sixMonthsAgo,
        lt: threeMonthsAgo,
      },
      orderStatus: 'completed',
    },
  });

  // Calculate risk factors
  const factors: RiskFactor[] = [];
  let totalScore = 0;

  // 1. Stock Ratio Factor
  const stockRatioFactor = calculateStockRatioFactor(
    product.currentStockPacks,
    product.reorderPointPacks || 0,
    product.packSize
  );
  factors.push(stockRatioFactor);
  totalScore += stockRatioFactor.contribution;

  // 2. Velocity Trend Factor
  const velocityFactor = calculateVelocityFactor(
    recentTransactions,
    olderTransactions
  );
  factors.push(velocityFactor);
  totalScore += velocityFactor.contribution;

  // 3. History Reliability Factor
  const reliabilityFactor = calculateReliabilityFactor(
    usageMetric?.transactionCount || 0,
    product.calculationBasis
  );
  factors.push(reliabilityFactor);
  totalScore += reliabilityFactor.contribution;

  // 4. Days to Stockout Factor
  const daysToStockoutFactor = calculateDaysToStockoutFactor(
    product.currentStockPacks * product.packSize,
    Number(usageMetric?.avgDailyUnits || 0)
  );
  factors.push(daysToStockoutFactor);
  totalScore += daysToStockoutFactor.contribution;

  // 5. Variability Factor
  const variabilityFactor = calculateVariabilityFactor(recentTransactions);
  factors.push(variabilityFactor);
  totalScore += variabilityFactor.contribution;

  // Normalize to 0-100
  const normalizedScore = Math.min(100, Math.max(0, Math.round(totalScore)));

  return {
    productId,
    score: normalizedScore,
    factors,
    riskLevel: scoreToLevel(normalizedScore),
    calculatedAt: new Date(),
  };
}

// =============================================================================
// INDIVIDUAL RISK FACTORS
// =============================================================================

function calculateStockRatioFactor(
  currentPacks: number,
  reorderPacks: number,
  packSize: number
): RiskFactor {
  const currentUnits = currentPacks * packSize;
  const reorderUnits = reorderPacks * packSize;

  let ratio = reorderUnits > 0 ? currentUnits / reorderUnits : 1;
  let value: number;

  // Convert ratio to risk score (0-100)
  if (ratio === 0) {
    value = 100; // Stockout = max risk
  } else if (ratio <= 0.5) {
    value = 80 + (0.5 - ratio) * 40; // 80-100
  } else if (ratio <= 1.0) {
    value = 50 + (1.0 - ratio) * 60; // 50-80
  } else if (ratio <= 1.5) {
    value = 25 + (1.5 - ratio) * 50; // 25-50
  } else {
    value = Math.max(0, 25 - (ratio - 1.5) * 16.67); // 0-25
  }

  const contribution = value * RISK_WEIGHTS.stockRatio;

  return {
    name: 'Stock Level',
    weight: RISK_WEIGHTS.stockRatio,
    value: Math.round(value),
    contribution,
    description: `Stock at ${Math.round(ratio * 100)}% of reorder point`,
  };
}

function calculateVelocityFactor(
  recentTxns: Array<{ quantityUnits: number }>,
  olderTxns: Array<{ quantityUnits: number }>
): RiskFactor {
  const recentTotal = recentTxns.reduce((sum, t) => sum + t.quantityUnits, 0);
  const olderTotal = olderTxns.reduce((sum, t) => sum + t.quantityUnits, 0);

  let value: number;
  let description: string;

  if (olderTotal === 0) {
    value = 50; // Unknown baseline
    description = 'Insufficient historical data for trend';
  } else {
    const velocityChange = recentTotal / olderTotal;

    if (velocityChange >= 2.0) {
      value = 90; // Demand doubled
      description = `Demand increased ${Math.round((velocityChange - 1) * 100)}%`;
    } else if (velocityChange >= 1.5) {
      value = 70;
      description = `Demand increased ${Math.round((velocityChange - 1) * 100)}%`;
    } else if (velocityChange >= 1.2) {
      value = 50;
      description = `Demand increased ${Math.round((velocityChange - 1) * 100)}%`;
    } else if (velocityChange >= 0.8) {
      value = 25;
      description = 'Stable demand';
    } else {
      value = 10;
      description = 'Declining demand';
    }
  }

  return {
    name: 'Velocity Trend',
    weight: RISK_WEIGHTS.velocityTrend,
    value: Math.round(value),
    contribution: value * RISK_WEIGHTS.velocityTrend,
    description,
  };
}

function calculateReliabilityFactor(
  transactionCount: number,
  calculationBasis: string | null
): RiskFactor {
  let value: number;
  let description: string;

  if (transactionCount >= 24) {
    value = 10; // Very reliable
    description = 'High confidence: 24+ transactions';
  } else if (transactionCount >= 12) {
    value = 25;
    description = 'Good confidence: 12+ transactions';
  } else if (transactionCount >= 6) {
    value = 50;
    description = 'Medium confidence: 6+ transactions';
  } else if (transactionCount >= 3) {
    value = 70;
    description = 'Low confidence: few transactions';
  } else {
    value = 90; // Very unreliable
    description = 'Very low confidence: minimal data';
  }

  // Adjust based on calculation basis
  if (calculationBasis === 'weekly') {
    value = Math.min(100, value + 20);
    description += ' (using weekly estimates)';
  }

  return {
    name: 'Data Reliability',
    weight: RISK_WEIGHTS.historyReliability,
    value: Math.round(value),
    contribution: value * RISK_WEIGHTS.historyReliability,
    description,
  };
}

function calculateDaysToStockoutFactor(
  currentUnits: number,
  avgDailyUnits: number
): RiskFactor {
  let daysRemaining: number;
  let value: number;
  let description: string;

  if (avgDailyUnits === 0) {
    daysRemaining = Infinity;
    value = 20;
    description = 'No consumption recorded';
  } else {
    daysRemaining = currentUnits / avgDailyUnits;

    if (daysRemaining <= 0) {
      value = 100;
      description = 'Currently stocked out';
    } else if (daysRemaining <= 7) {
      value = 95;
      description = `${Math.round(daysRemaining)} days until stockout`;
    } else if (daysRemaining <= 14) {
      value = 80;
      description = `${Math.round(daysRemaining)} days until stockout`;
    } else if (daysRemaining <= 30) {
      value = 60;
      description = `${Math.round(daysRemaining)} days until stockout`;
    } else if (daysRemaining <= 60) {
      value = 40;
      description = `${Math.round(daysRemaining)} days until stockout`;
    } else if (daysRemaining <= 90) {
      value = 20;
      description = `${Math.round(daysRemaining)} days until stockout`;
    } else {
      value = 5;
      description = `${Math.round(daysRemaining)}+ days of stock`;
    }
  }

  return {
    name: 'Time to Stockout',
    weight: RISK_WEIGHTS.daysToStockout,
    value: Math.round(value),
    contribution: value * RISK_WEIGHTS.daysToStockout,
    description,
  };
}

function calculateVariabilityFactor(
  transactions: Array<{ quantityUnits: number; dateSubmitted: Date }>
): RiskFactor {
  if (transactions.length < 3) {
    return {
      name: 'Demand Variability',
      weight: RISK_WEIGHTS.variability,
      value: 50,
      contribution: 50 * RISK_WEIGHTS.variability,
      description: 'Insufficient data for variability analysis',
    };
  }

  // Calculate coefficient of variation
  const quantities = transactions.map((t) => t.quantityUnits);
  const mean = quantities.reduce((a, b) => a + b, 0) / quantities.length;
  const variance =
    quantities.reduce((sum, q) => sum + Math.pow(q - mean, 2), 0) /
    quantities.length;
  const stdDev = Math.sqrt(variance);
  const cv = mean > 0 ? stdDev / mean : 0;

  let value: number;
  let description: string;

  if (cv >= 1.0) {
    value = 80;
    description = 'Highly variable demand';
  } else if (cv >= 0.5) {
    value = 60;
    description = 'Moderately variable demand';
  } else if (cv >= 0.25) {
    value = 40;
    description = 'Somewhat variable demand';
  } else {
    value = 20;
    description = 'Stable, predictable demand';
  }

  return {
    name: 'Demand Variability',
    weight: RISK_WEIGHTS.variability,
    value: Math.round(value),
    contribution: value * RISK_WEIGHTS.variability,
    description,
  };
}

// =============================================================================
// HELPERS
// =============================================================================

function scoreToLevel(score: number): 'low' | 'moderate' | 'high' | 'critical' {
  if (score >= 75) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 25) return 'moderate';
  return 'low';
}

// =============================================================================
// CLIENT-LEVEL RISK
// =============================================================================

/**
 * Calculate risk summary for an entire client
 */
export async function calculateClientRisk(clientId: string): Promise<ClientRiskSummary> {
  const products = await prisma.product.findMany({
    where: {
      clientId,
      isActive: true,
      isOrphan: false,
      itemType: { in: ['evergreen'] }, // Only evergreen for risk scoring
    },
  });

  if (products.length === 0) {
    return {
      clientId,
      overallScore: 0,
      riskLevel: 'low',
      totalProducts: 0,
      productsAtRisk: 0,
      criticalProducts: [],
      topRiskFactors: [],
    };
  }

  const riskScores: RiskScore[] = [];
  const criticalProducts: string[] = [];
  const factorCounts = new Map<string, number>();

  for (const product of products) {
    const risk = await calculateProductRisk(product.id);
    riskScores.push(risk);

    if (risk.riskLevel === 'critical' || risk.riskLevel === 'high') {
      criticalProducts.push(product.productId);

      // Count contributing factors
      for (const factor of risk.factors) {
        if (factor.value >= 60) {
          const count = factorCounts.get(factor.name) || 0;
          factorCounts.set(factor.name, count + 1);
        }
      }
    }
  }

  // Calculate weighted average score
  const totalScore = riskScores.reduce((sum, r) => sum + r.score, 0);
  const avgScore = totalScore / riskScores.length;

  // Find top risk factors
  const sortedFactors = Array.from(factorCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name]) => name);

  return {
    clientId,
    overallScore: Math.round(avgScore),
    riskLevel: scoreToLevel(avgScore),
    totalProducts: products.length,
    productsAtRisk: criticalProducts.length,
    criticalProducts: criticalProducts.slice(0, 10),
    topRiskFactors: sortedFactors,
  };
}

/**
 * Get top risky products across all clients for an account manager
 */
export async function getTopRiskyProducts(
  userId: string,
  limit: number = 10
): Promise<Array<RiskScore & { productName: string; clientName: string }>> {
  // Get user's clients
  const userClients = await prisma.userClient.findMany({
    where: { userId },
    include: {
      client: {
        include: {
          products: {
            where: {
              isActive: true,
              isOrphan: false,
              itemType: 'evergreen',
            },
          },
        },
      },
    },
  });

  const allRisks: Array<
    RiskScore & { productName: string; clientName: string }
  > = [];

  for (const uc of userClients) {
    for (const product of uc.client.products) {
      const risk = await calculateProductRisk(product.id);
      allRisks.push({
        ...risk,
        productName: product.name,
        clientName: uc.client.name,
      });
    }
  }

  // Sort by score descending and return top N
  return allRisks.sort((a, b) => b.score - a.score).slice(0, limit);
}
