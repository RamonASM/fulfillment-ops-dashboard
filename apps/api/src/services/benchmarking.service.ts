// =============================================================================
// BENCHMARKING SERVICE
// Privacy-preserving cross-client performance comparison
// =============================================================================

import { prisma } from "../lib/prisma.js";
import { Decimal } from "@prisma/client/runtime/library";
import { logger } from "../lib/logger.js";

// =============================================================================
// CONSTANTS
// =============================================================================

const MINIMUM_PARTICIPANTS = 5; // Privacy threshold

// =============================================================================
// TYPES
// =============================================================================

export interface BenchmarkComparison {
  clientId: string;
  clientName: string;
  cohort: string;
  metrics: {
    productCount: MetricComparison;
    orderFrequency: MetricComparison;
    stockoutRate: MetricComparison;
    inventoryTurnover: MetricComparison;
  };
  rank: "top_10" | "top_25" | "above_avg" | "below_avg" | "bottom_25";
  participantCount: number;
  period: Date;
}

export interface MetricComparison {
  value: number;
  percentile: number;
  cohortAvg: number;
  cohortP50: number;
  cohortP90: number;
  performance: "excellent" | "good" | "average" | "below_average" | "poor";
}

export interface ClientMetrics {
  productCount: number;
  orderFrequency: number; // Orders per month
  stockoutRate: number; // 0.0 to 1.0
  inventoryTurnover: number;
}

// =============================================================================
// BENCHMARKING SERVICE
// =============================================================================

export class BenchmarkingService {
  /**
   * Get client's benchmark comparison (privacy-preserving)
   */
  static async getClientBenchmark(
    clientId: string,
  ): Promise<BenchmarkComparison | null> {
    const participation = await prisma.benchmarkParticipation.findUnique({
      where: { clientId },
      include: { client: { select: { name: true } } },
    });

    if (!participation || !participation.isParticipating) {
      logger.info("Client not participating in benchmarking", { clientId });
      return null;
    }

    const cohort = participation.cohort || "general";
    const latestSnapshot = await prisma.benchmarkSnapshot.findFirst({
      where: { cohort },
      orderBy: { period: "desc" },
    });

    if (!latestSnapshot) {
      logger.warn("No benchmark snapshot found", { cohort });
      return null;
    }

    if (latestSnapshot.participantCount < MINIMUM_PARTICIPANTS) {
      logger.warn("Insufficient participants for privacy", {
        cohort,
        participantCount: latestSnapshot.participantCount,
      });
      return null; // Not enough participants for privacy
    }

    // Calculate client's actual metrics
    const clientMetrics = await this.calculateClientMetrics(clientId);

    // Compare each metric
    const productCount = this.compareMetric(
      clientMetrics.productCount,
      Number(latestSnapshot.p25ProductCount),
      Number(latestSnapshot.p50ProductCount),
      Number(latestSnapshot.p75ProductCount),
      Number(latestSnapshot.p90ProductCount),
      Number(latestSnapshot.avgProductCount),
    );

    const orderFrequency = this.compareMetric(
      clientMetrics.orderFrequency,
      Number(latestSnapshot.p25OrderFrequency),
      Number(latestSnapshot.p50OrderFrequency),
      Number(latestSnapshot.p75OrderFrequency),
      Number(latestSnapshot.p90OrderFrequency),
      Number(latestSnapshot.avgOrderFrequency),
    );

    const stockoutRate = this.compareMetric(
      clientMetrics.stockoutRate,
      Number(latestSnapshot.p25StockoutRate),
      Number(latestSnapshot.p50StockoutRate),
      Number(latestSnapshot.p75StockoutRate),
      Number(latestSnapshot.p90StockoutRate),
      Number(latestSnapshot.avgStockoutRate),
      true, // Lower is better for stockout rate
    );

    const inventoryTurnover = this.compareMetric(
      clientMetrics.inventoryTurnover,
      Number(latestSnapshot.p25InventoryTurnover),
      Number(latestSnapshot.p50InventoryTurnover),
      Number(latestSnapshot.p75InventoryTurnover),
      Number(latestSnapshot.p90InventoryTurnover),
      Number(latestSnapshot.avgInventoryTurnover),
    );

    // Overall rank based on average percentile
    const avgPercentile =
      (productCount.percentile +
        orderFrequency.percentile +
        (100 - stockoutRate.percentile) + // Invert stockout rate
        inventoryTurnover.percentile) /
      4;

    return {
      clientId,
      clientName: participation.client.name,
      cohort,
      metrics: {
        productCount,
        orderFrequency,
        stockoutRate,
        inventoryTurnover,
      },
      rank: this.determineRank(avgPercentile),
      participantCount: latestSnapshot.participantCount,
      period: latestSnapshot.period,
    };
  }

  /**
   * Calculate client-specific metrics
   */
  static async calculateClientMetrics(
    clientId: string,
  ): Promise<ClientMetrics> {
    const now = new Date();
    const oneMonthAgo = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);

    // Product count
    const productCount = await prisma.product.count({
      where: { clientId, isActive: true },
    });

    // Order frequency (orders in last month)
    const orderCount = await prisma.orderRequest.count({
      where: {
        clientId,
        createdAt: { gte: oneMonthAgo },
      },
    });

    // Stockout rate (products currently at 0 stock / total products)
    const stockoutCount = await prisma.product.count({
      where: {
        clientId,
        isActive: true,
        currentStockPacks: 0,
      },
    });

    const stockoutRate = productCount > 0 ? stockoutCount / productCount : 0;

    // Inventory turnover (COGS / Average Inventory) - simplified as orders/stock
    const totalStock = await prisma.product.aggregate({
      where: { clientId, isActive: true },
      _sum: { currentStockPacks: true },
    });

    const inventoryTurnover =
      totalStock._sum.currentStockPacks && totalStock._sum.currentStockPacks > 0
        ? (orderCount * 30) / totalStock._sum.currentStockPacks // Annualized
        : 0;

    return {
      productCount,
      orderFrequency: orderCount,
      stockoutRate,
      inventoryTurnover,
    };
  }

  /**
   * Compare a metric value against percentiles
   */
  private static compareMetric(
    value: number,
    p25: number,
    p50: number,
    p75: number,
    p90: number,
    avg: number,
    lowerIsBetter: boolean = false,
  ): MetricComparison {
    const percentile = this.calculatePercentile(
      value,
      p25,
      p50,
      p75,
      p90,
      lowerIsBetter,
    );
    const performance = this.getPerformanceLevel(percentile, lowerIsBetter);

    return {
      value,
      percentile,
      cohortAvg: avg,
      cohortP50: p50,
      cohortP90: p90,
      performance,
    };
  }

  /**
   * Calculate percentile rank
   */
  private static calculatePercentile(
    value: number,
    p25: number,
    p50: number,
    p75: number,
    p90: number,
    lowerIsBetter: boolean = false,
  ): number {
    if (lowerIsBetter) {
      // For metrics where lower is better (like stockout rate)
      if (value <= p25) return 90;
      if (value <= p50) return 75;
      if (value <= p75) return 50;
      if (value <= p90) return 25;
      return 10;
    } else {
      // For metrics where higher is better
      if (value >= p90) return 90;
      if (value >= p75) return 75;
      if (value >= p50) return 50;
      if (value >= p25) return 25;
      return 10;
    }
  }

  /**
   * Get performance level from percentile
   */
  private static getPerformanceLevel(
    percentile: number,
    lowerIsBetter: boolean = false,
  ): MetricComparison["performance"] {
    if (percentile >= 90) return "excellent";
    if (percentile >= 75) return "good";
    if (percentile >= 50) return "average";
    if (percentile >= 25) return "below_average";
    return "poor";
  }

  /**
   * Determine overall rank from average percentile
   */
  private static determineRank(
    percentile: number,
  ): BenchmarkComparison["rank"] {
    if (percentile >= 90) return "top_10";
    if (percentile >= 75) return "top_25";
    if (percentile >= 50) return "above_avg";
    if (percentile >= 25) return "below_avg";
    return "bottom_25";
  }

  /**
   * Generate benchmark snapshot for a cohort
   * Called by scheduled job
   */
  static async generateSnapshot(cohort: string = "general"): Promise<void> {
    logger.info("Generating benchmark snapshot", { cohort });

    // Get participating clients in cohort
    const participants = await prisma.benchmarkParticipation.findMany({
      where: {
        isParticipating: true,
        ...(cohort === "general"
          ? { OR: [{ cohort: null }, { cohort: "general" }] }
          : { cohort }),
      },
      include: { client: true },
    });

    if (participants.length < MINIMUM_PARTICIPANTS) {
      logger.warn("Insufficient participants for snapshot", {
        cohort,
        count: participants.length,
      });
      return;
    }

    // Calculate metrics for each participant
    const metricsArray = await Promise.all(
      participants.map((p) => this.calculateClientMetrics(p.clientId)),
    );

    // Calculate aggregates
    const productCounts = metricsArray
      .map((m) => m.productCount)
      .sort((a, b) => a - b);
    const orderFrequencies = metricsArray
      .map((m) => m.orderFrequency)
      .sort((a, b) => a - b);
    const stockoutRates = metricsArray
      .map((m) => m.stockoutRate)
      .sort((a, b) => a - b);
    const inventoryTurnovers = metricsArray
      .map((m) => m.inventoryTurnover)
      .sort((a, b) => a - b);

    const avgProductCount =
      productCounts.reduce((a, b) => a + b, 0) / productCounts.length;
    const avgOrderFrequency =
      orderFrequencies.reduce((a, b) => a + b, 0) / orderFrequencies.length;
    const avgStockoutRate =
      stockoutRates.reduce((a, b) => a + b, 0) / stockoutRates.length;
    const avgInventoryTurnover =
      inventoryTurnovers.reduce((a, b) => a + b, 0) / inventoryTurnovers.length;
    const avgForecastAccuracy = 0.85; // Placeholder - would need ML forecast history

    // Calculate percentiles
    const getPercentile = (arr: number[], p: number) => {
      const index = Math.floor((arr.length - 1) * (p / 100));
      return arr[index];
    };

    const period = new Date(new Date().getFullYear(), new Date().getMonth(), 1); // First of current month

    // Create snapshot
    await prisma.benchmarkSnapshot.upsert({
      where: {
        cohort_period: {
          cohort,
          period,
        },
      },
      create: {
        cohort,
        period,
        participantCount: participants.length,
        avgProductCount,
        avgOrderFrequency,
        avgStockoutRate,
        avgForecastAccuracy,
        avgInventoryTurnover,
        // Product count percentiles
        p25ProductCount: getPercentile(productCounts, 25),
        p50ProductCount: getPercentile(productCounts, 50),
        p75ProductCount: getPercentile(productCounts, 75),
        p90ProductCount: getPercentile(productCounts, 90),
        // Order frequency percentiles
        p25OrderFrequency: getPercentile(orderFrequencies, 25),
        p50OrderFrequency: getPercentile(orderFrequencies, 50),
        p75OrderFrequency: getPercentile(orderFrequencies, 75),
        p90OrderFrequency: getPercentile(orderFrequencies, 90),
        // Stockout rate percentiles
        p25StockoutRate: getPercentile(stockoutRates, 25),
        p50StockoutRate: getPercentile(stockoutRates, 50),
        p75StockoutRate: getPercentile(stockoutRates, 75),
        p90StockoutRate: getPercentile(stockoutRates, 90),
        // Inventory turnover percentiles
        p25InventoryTurnover: getPercentile(inventoryTurnovers, 25),
        p50InventoryTurnover: getPercentile(inventoryTurnovers, 50),
        p75InventoryTurnover: getPercentile(inventoryTurnovers, 75),
        p90InventoryTurnover: getPercentile(inventoryTurnovers, 90),
      },
      update: {
        participantCount: participants.length,
        avgProductCount,
        avgOrderFrequency,
        avgStockoutRate,
        avgForecastAccuracy,
        avgInventoryTurnover,
        // Product count percentiles
        p25ProductCount: getPercentile(productCounts, 25),
        p50ProductCount: getPercentile(productCounts, 50),
        p75ProductCount: getPercentile(productCounts, 75),
        p90ProductCount: getPercentile(productCounts, 90),
        // Order frequency percentiles
        p25OrderFrequency: getPercentile(orderFrequencies, 25),
        p50OrderFrequency: getPercentile(orderFrequencies, 50),
        p75OrderFrequency: getPercentile(orderFrequencies, 75),
        p90OrderFrequency: getPercentile(orderFrequencies, 90),
        // Stockout rate percentiles
        p25StockoutRate: getPercentile(stockoutRates, 25),
        p50StockoutRate: getPercentile(stockoutRates, 50),
        p75StockoutRate: getPercentile(stockoutRates, 75),
        p90StockoutRate: getPercentile(stockoutRates, 90),
        // Inventory turnover percentiles
        p25InventoryTurnover: getPercentile(inventoryTurnovers, 25),
        p50InventoryTurnover: getPercentile(inventoryTurnovers, 50),
        p75InventoryTurnover: getPercentile(inventoryTurnovers, 75),
        p90InventoryTurnover: getPercentile(inventoryTurnovers, 90),
      },
    });

    logger.info("Benchmark snapshot generated", {
      cohort,
      period,
      participants: participants.length,
    });
  }

  /**
   * Opt client into benchmarking
   */
  static async optIn(
    clientId: string,
    cohort: string = "general",
  ): Promise<void> {
    await prisma.benchmarkParticipation.upsert({
      where: { clientId },
      create: {
        clientId,
        isParticipating: true,
        cohort,
      },
      update: {
        isParticipating: true,
        cohort,
      },
    });

    logger.info("Client opted into benchmarking", { clientId, cohort });
  }

  /**
   * Opt client out of benchmarking
   */
  static async optOut(clientId: string): Promise<void> {
    await prisma.benchmarkParticipation.update({
      where: { clientId },
      data: { isParticipating: false },
    });

    logger.info("Client opted out of benchmarking", { clientId });
  }

  /**
   * Get available cohorts
   */
  static async getAvailableCohorts(): Promise<string[]> {
    const cohorts = await prisma.benchmarkParticipation.findMany({
      where: { isParticipating: true },
      select: { cohort: true },
      distinct: ["cohort"],
    });

    return cohorts.map((c) => c.cohort || "general");
  }
}
