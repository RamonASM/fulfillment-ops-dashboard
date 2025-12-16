import { prisma } from "../lib/prisma.js";
import { Decimal } from "@prisma/client/runtime/library";

export interface BudgetSummary {
  clientId: string;
  totalAllocated: number;
  totalSpent: number;
  totalForecast: number;
  variance: number;
  variancePercent: number;
  status: "under" | "on_track" | "over" | "critical";
  productsOverBudget: number;
  productsUnderBudget: number;
}

export interface EOQAnalysis {
  productId: string;
  productName: string;
  currentOrderQuantity: number;
  optimalOrderQuantity: number;
  annualDemand: number;
  orderingCost: number;
  holdingCost: number;
  currentTotalCost: number;
  optimalTotalCost: number;
  potentialSavings: number;
  recommendation: string;
}

export class FinancialService {
  /**
   * Calculate Economic Order Quantity (EOQ) for cost optimization
   * EOQ = sqrt((2 * D * S) / H)
   * D = Annual demand, S = Ordering cost, H = Holding cost per unit per year
   */
  static calculateEOQ(
    annualDemand: number,
    orderingCost: number,
    holdingCostPerUnit: number,
  ): number {
    if (holdingCostPerUnit === 0) return annualDemand;
    return Math.sqrt((2 * annualDemand * orderingCost) / holdingCostPerUnit);
  }

  /**
   * Get budget summary for a client
   */
  static async getBudgetSummary(
    clientId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<BudgetSummary> {
    const budgets = await prisma.budget.findMany({
      where: {
        clientId,
        periodStart: { gte: periodStart },
        periodEnd: { lte: periodEnd },
      },
    });

    const totalAllocated = budgets.reduce(
      (sum, b) => sum + Number(b.allocatedAmount),
      0,
    );
    const totalSpent = budgets.reduce(
      (sum, b) => sum + Number(b.spentAmount),
      0,
    );
    const totalForecast = budgets.reduce(
      (sum, b) => sum + Number(b.forecastAmount || 0),
      0,
    );
    const variance = totalAllocated - totalSpent;
    const variancePercent =
      totalAllocated > 0 ? (variance / totalAllocated) * 100 : 0;

    let status: BudgetSummary["status"];
    if (variancePercent < -20) status = "critical";
    else if (variancePercent < 0) status = "over";
    else if (variancePercent < 10) status = "on_track";
    else status = "under";

    return {
      clientId,
      totalAllocated,
      totalSpent,
      totalForecast,
      variance,
      variancePercent,
      status,
      productsOverBudget: budgets.filter((b) => b.status === "over").length,
      productsUnderBudget: budgets.filter((b) => b.status === "under").length,
    };
  }

  /**
   * Analyze EOQ opportunities for cost optimization
   */
  static async analyzeEOQOpportunities(
    clientId: string,
  ): Promise<EOQAnalysis[]> {
    // Get products with cost data and usage history
    const products = await prisma.product.findMany({
      where: {
        clientId,
        unitCost: { not: null },
        reorderCost: { not: null },
        holdingCostRate: { not: null },
      },
      include: {
        usageMetrics: {
          orderBy: { calculatedAt: "desc" },
          take: 1,
        },
        transactions: {
          where: {
            dateSubmitted: {
              gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
            },
          },
        },
      },
    });

    const analyses: EOQAnalysis[] = [];

    for (const product of products) {
      const annualDemand = product.usageMetrics[0]?.avgDailyUnits
        ? Number(product.usageMetrics[0].avgDailyUnits) * 365
        : 0;
      const orderingCost = Number(product.reorderCost);
      const unitCost = Number(product.unitCost);
      const holdingCostRate = Number(product.holdingCostRate);
      const holdingCostPerUnit = unitCost * holdingCostRate;

      if (annualDemand === 0) continue;

      const eoq = this.calculateEOQ(
        annualDemand,
        orderingCost,
        holdingCostPerUnit,
      );

      // Calculate current total cost
      const avgOrderQty = product.reorderPointPacks || Math.round(eoq);
      const ordersPerYear = annualDemand / avgOrderQty;
      const currentTotalCost =
        annualDemand * unitCost +
        ordersPerYear * orderingCost +
        (avgOrderQty / 2) * holdingCostPerUnit;

      // Calculate optimal total cost
      const optimalOrdersPerYear = annualDemand / eoq;
      const optimalTotalCost =
        annualDemand * unitCost +
        optimalOrdersPerYear * orderingCost +
        (eoq / 2) * holdingCostPerUnit;

      const potentialSavings = currentTotalCost - optimalTotalCost;

      if (Math.abs(potentialSavings) > 100) {
        analyses.push({
          productId: product.id,
          productName: product.name,
          currentOrderQuantity: avgOrderQty,
          optimalOrderQuantity: Math.round(eoq),
          annualDemand,
          orderingCost,
          holdingCost: holdingCostPerUnit,
          currentTotalCost,
          optimalTotalCost,
          potentialSavings,
          recommendation:
            potentialSavings > 0
              ? `Order ${Math.round(eoq)} packs instead of ${avgOrderQty} to save $${potentialSavings.toFixed(2)}/year`
              : "Current order quantity is near optimal",
        });
      }
    }

    return analyses.sort((a, b) => b.potentialSavings - a.potentialSavings);
  }
}
