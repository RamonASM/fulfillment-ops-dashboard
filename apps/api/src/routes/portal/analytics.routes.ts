// =============================================================================
// PORTAL ANALYTICS ROUTES (Phase 11)
// Analytics endpoints for portal users
// =============================================================================

import { Router, Request, Response } from "express";
import { portalAuth } from "../../middleware/portal-auth.js";
import { prisma } from "../../lib/prisma.js";
import { logger } from "../../lib/logger.js";
import { subDays, format } from "date-fns";

const router = Router();

// All routes require portal authentication
router.use(portalAuth);

/**
 * GET /api/portal/analytics/stock-velocity
 * Get stock velocity for all products
 */
router.get("/stock-velocity", async (req: Request, res: Response) => {
  try {
    const { clientId } = (req as any).portalUser;

    const products = await prisma.product.findMany({
      where: { clientId, isActive: true },
      select: {
        id: true,
        productId: true,
        name: true,
        avgDailyUsage: true,
        stockStatus: true,
        usageMetrics: {
          where: { periodType: "monthly" },
          orderBy: { periodStart: "desc" },
          take: 2,
        },
      },
    });

    const velocityData = products.map((product) => {
      // Calculate trend from last 2 months
      let trend: "increasing" | "decreasing" | "stable" = "stable";
      let changePercent = 0;

      if (product.usageMetrics.length >= 2) {
        const current = Number(product.usageMetrics[0].avgDailyUnits) || 0;
        const previous = Number(product.usageMetrics[1].avgDailyUnits) || 0;

        if (previous > 0) {
          changePercent = ((current - previous) / previous) * 100;
          trend =
            changePercent > 5
              ? "increasing"
              : changePercent < -5
                ? "decreasing"
                : "stable";
        }
      }

      return {
        productId: product.id,
        productName: product.name,
        avgDailyUsage: product.avgDailyUsage || 0,
        trend,
        changePercent: Math.abs(changePercent),
      };
    });

    res.json({ data: velocityData });
  } catch (error) {
    logger.error("Error fetching stock velocity", error as Error);
    res.status(500).json({ error: "Failed to fetch stock velocity" });
  }
});

/**
 * GET /api/portal/analytics/usage-trends
 * Get daily usage trends for the last 30 days
 */
router.get("/usage-trends", async (req: Request, res: Response) => {
  try {
    const { clientId } = (req as any).portalUser;
    const days = parseInt(req.query.days as string) || 30;
    const startDate = subDays(new Date(), days);

    const transactions = await prisma.transaction.findMany({
      where: {
        product: { clientId },
        dateSubmitted: { gte: startDate },
      },
      select: {
        dateSubmitted: true,
        quantityUnits: true,
        quantityPacks: true,
      },
      orderBy: { dateSubmitted: "asc" },
    });

    // Group by date
    const dateMap = new Map<string, { units: number; packs: number }>();

    for (const txn of transactions) {
      const dateKey = format(txn.dateSubmitted, "yyyy-MM-dd");
      const existing = dateMap.get(dateKey) || { units: 0, packs: 0 };
      existing.units += txn.quantityUnits;
      existing.packs += txn.quantityPacks;
      dateMap.set(dateKey, existing);
    }

    const trends = Array.from(dateMap.entries()).map(([date, data]) => ({
      date,
      ...data,
    }));

    res.json({ data: trends });
  } catch (error) {
    logger.error("Error fetching usage trends", error as Error);
    res.status(500).json({ error: "Failed to fetch usage trends" });
  }
});

/**
 * GET /api/portal/analytics/risk-products
 * Get products at risk for this client
 */
router.get("/risk-products", async (req: Request, res: Response) => {
  try {
    const { clientId } = (req as any).portalUser;

    const products = await prisma.product.findMany({
      where: {
        clientId,
        isActive: true,
        stockStatus: { in: ["LOW", "CRITICAL", "STOCKOUT"] },
      },
      include: {
        riskScoreCache: true,
      },
      orderBy: { stockStatus: "asc" },
    });

    const riskProducts = products.map((product) => ({
      productId: product.id,
      productName: product.name,
      riskScore: product.riskScoreCache?.score || 50,
      riskLevel: product.riskScoreCache?.riskLevel || "medium",
      stockStatus: product.stockStatus,
      weeksRemaining: product.weeksRemaining,
      currentStock: product.currentStockPacks,
    }));

    res.json({ data: riskProducts });
  } catch (error) {
    logger.error("Error fetching risk products", error as Error);
    res.status(500).json({ error: "Failed to fetch risk products" });
  }
});

/**
 * GET /api/portal/analytics/summary
 * Get intelligent dashboard summary for the client
 */
router.get("/summary", async (req: Request, res: Response) => {
  try {
    const { clientId } = (req as any).portalUser;
    const now = new Date();
    const oneWeekAgo = subDays(now, 7);
    const twoWeeksAgo = subDays(now, 14);
    const threeMonthsAgo = subDays(now, 90);

    // Products
    const products = await prisma.product.findMany({
      where: { clientId, isActive: true },
      select: {
        id: true,
        name: true,
        currentStockPacks: true,
        currentStockUnits: true,
        packSize: true,
        monthlyUsageUnits: true,
        stockStatus: true,
      },
    });

    // Stock health counts
    const stockHealth = {
      critical: 0,
      low: 0,
      watch: 0,
      healthy: 0,
      overstock: 0,
    };
    const upcomingStockouts: Array<{
      name: string;
      daysUntil: number;
      currentStock: number;
    }> = [];

    for (const product of products) {
      const monthlyUsage = product.monthlyUsageUnits || 0;
      const currentStock =
        product.currentStockUnits ||
        product.currentStockPacks * product.packSize;
      const weeklyUsage = monthlyUsage / 4.33;
      const weeksRemaining = weeklyUsage > 0 ? currentStock / weeklyUsage : 999;

      if (weeksRemaining <= 2) {
        stockHealth.critical++;
        if (weeksRemaining > 0) {
          upcomingStockouts.push({
            name: product.name,
            daysUntil: Math.round(weeksRemaining * 7),
            currentStock,
          });
        }
      } else if (weeksRemaining <= 4) {
        stockHealth.low++;
        upcomingStockouts.push({
          name: product.name,
          daysUntil: Math.round(weeksRemaining * 7),
          currentStock,
        });
      } else if (weeksRemaining <= 8) {
        stockHealth.watch++;
      } else if (weeksRemaining > 16 && monthlyUsage > 0) {
        stockHealth.overstock++;
      } else {
        stockHealth.healthy++;
      }
    }

    upcomingStockouts.sort((a, b) => a.daysUntil - b.daysUntil);

    // Activity metrics
    const transactions = await prisma.transaction.findMany({
      where: {
        product: { clientId },
        dateSubmitted: { gte: twoWeeksAgo },
      },
    });

    const thisWeekOrders = new Set(
      transactions
        .filter((t) => t.dateSubmitted >= oneWeekAgo)
        .map((t) => t.orderId),
    ).size;
    const lastWeekOrders = new Set(
      transactions
        .filter(
          (t) => t.dateSubmitted >= twoWeeksAgo && t.dateSubmitted < oneWeekAgo,
        )
        .map((t) => t.orderId),
    ).size;

    // Top products (last 3 months)
    const recentTransactions = await prisma.transaction.findMany({
      where: {
        product: { clientId },
        dateSubmitted: { gte: threeMonthsAgo },
      },
      include: { product: { select: { name: true } } },
    });

    const productUsage = new Map<string, { name: string; units: number }>();
    for (const txn of recentTransactions) {
      const existing = productUsage.get(txn.productId) || {
        name: txn.product.name,
        units: 0,
      };
      existing.units += txn.quantityUnits;
      productUsage.set(txn.productId, existing);
    }

    const topProducts = Array.from(productUsage.entries())
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.units - a.units)
      .slice(0, 5);

    res.json({
      data: {
        stockHealth,
        activity: {
          ordersThisWeek: thisWeekOrders,
          ordersLastWeek: lastWeekOrders,
          trend:
            thisWeekOrders > lastWeekOrders
              ? "up"
              : thisWeekOrders < lastWeekOrders
                ? "down"
                : "stable",
        },
        topProducts,
        upcomingStockouts: upcomingStockouts.slice(0, 5),
        totalProducts: products.length,
      },
    });
  } catch (error) {
    logger.error("Error fetching portal summary", error as Error);
    res.status(500).json({ error: "Failed to fetch summary" });
  }
});

/**
 * GET /api/portal/analytics/monthly-trends
 * Get monthly trends for orders, units, and products
 */
router.get("/monthly-trends", async (req: Request, res: Response) => {
  try {
    const { clientId } = (req as any).portalUser;
    const months = parseInt(req.query.months as string) || 12;
    const startDate = subDays(new Date(), months * 30);

    // Get transactions grouped by month
    const transactions = await prisma.transaction.findMany({
      where: {
        product: { clientId },
        dateSubmitted: { gte: startDate },
      },
      select: {
        dateSubmitted: true,
        quantityUnits: true,
        orderId: true,
        productId: true,
      },
      orderBy: { dateSubmitted: "asc" },
    });

    // Group by month
    const monthMap = new Map<
      string,
      { units: number; orderIds: Set<string>; productIds: Set<string> }
    >();

    for (const txn of transactions) {
      const monthKey = format(txn.dateSubmitted, "MMM yyyy");
      if (!monthMap.has(monthKey)) {
        monthMap.set(monthKey, {
          units: 0,
          orderIds: new Set(),
          productIds: new Set(),
        });
      }
      const monthData = monthMap.get(monthKey)!;
      monthData.units += txn.quantityUnits;
      monthData.orderIds.add(txn.orderId);
      monthData.productIds.add(txn.productId);
    }

    // Convert to arrays
    const labels: string[] = [];
    const orders: number[] = [];
    const units: number[] = [];

    // Generate all months in range
    for (let i = months - 1; i >= 0; i--) {
      const date = subDays(new Date(), i * 30);
      const monthKey = format(date, "MMM yyyy");
      labels.push(monthKey);

      const data = monthMap.get(monthKey);
      orders.push(data ? data.orderIds.size : 0);
      units.push(data ? data.units : 0);
    }

    res.json({
      data: {
        labels,
        orders,
        units,
      },
    });
  } catch (error) {
    logger.error("Error fetching monthly trends", error as Error);
    res.status(500).json({ error: "Failed to fetch monthly trends" });
  }
});

/**
 * GET /api/portal/analytics/locations
 * Get analytics by shipping location for the client
 */
router.get("/locations", async (req: Request, res: Response) => {
  try {
    const { clientId } = (req as any).portalUser;
    const twelveMonthsAgo = subDays(new Date(), 365);

    const transactions = await prisma.transaction.findMany({
      where: {
        product: { clientId },
        dateSubmitted: { gte: twelveMonthsAgo },
      },
      include: {
        product: { select: { productId: true, name: true } },
      },
    });

    // Group by location
    const locationMap = new Map<
      string,
      {
        transactions: typeof transactions;
        company: string;
      }
    >();

    for (const txn of transactions) {
      const key = txn.shipToLocation || txn.shipToCompany || "Unknown";
      if (!locationMap.has(key)) {
        locationMap.set(key, {
          transactions: [],
          company: txn.shipToCompany || "Unknown",
        });
      }
      locationMap.get(key)!.transactions.push(txn);
    }

    const locationData = Array.from(locationMap.entries()).map(
      ([location, data]) => {
        const totalUnits = data.transactions.reduce(
          (sum, t) => sum + t.quantityUnits,
          0,
        );
        const orderIds = new Set(data.transactions.map((t) => t.orderId));

        return {
          location,
          company: data.company,
          totalOrders: orderIds.size,
          totalUnits,
          avgOrderSize:
            orderIds.size > 0 ? Math.round(totalUnits / orderIds.size) : 0,
        };
      },
    );

    res.json({
      data: locationData
        .sort((a, b) => b.totalUnits - a.totalUnits)
        .slice(0, 10),
    });
  } catch (error) {
    logger.error("Error fetching location analytics", error as Error);
    res.status(500).json({ error: "Failed to fetch location analytics" });
  }
});

/**
 * GET /api/portal/analytics/reorder-suggestions
 * Get reorder suggestions for products running low
 */
router.get("/reorder-suggestions", async (req: Request, res: Response) => {
  try {
    const { clientId } = (req as any).portalUser;
    const threeMonthsAgo = subDays(new Date(), 90);

    const products = await prisma.product.findMany({
      where: { clientId, isActive: true },
      include: {
        transactions: {
          where: { dateSubmitted: { gte: threeMonthsAgo } },
        },
      },
    });

    const suggestions: Array<{
      productId: string;
      productName: string;
      currentStock: number;
      monthlyUsage: number;
      weeksOfSupply: number;
      suggestedOrderQty: number;
      urgency: "critical" | "soon" | "planned";
    }> = [];

    for (const product of products) {
      const totalUnits = product.transactions.reduce(
        (sum, t) => sum + t.quantityUnits,
        0,
      );
      const monthlyUsage = totalUnits / 3;

      if (monthlyUsage < 1) continue;

      const currentStock =
        product.currentStockUnits ||
        product.currentStockPacks * product.packSize;
      const weeklyUsage = monthlyUsage / 4.33;
      const weeksOfSupply = currentStock / weeklyUsage;

      if (weeksOfSupply > 6) continue;

      let urgency: "critical" | "soon" | "planned";
      if (weeksOfSupply <= 2) urgency = "critical";
      else if (weeksOfSupply <= 4) urgency = "soon";
      else urgency = "planned";

      // Suggest 8 weeks of supply
      const suggestedQty = Math.ceil(weeklyUsage * 8 - currentStock);

      suggestions.push({
        productId: product.productId,
        productName: product.name,
        currentStock: Math.round(currentStock),
        monthlyUsage: Math.round(monthlyUsage),
        weeksOfSupply: Math.round(weeksOfSupply * 10) / 10,
        suggestedOrderQty: suggestedQty,
        urgency,
      });
    }

    const urgencyOrder = { critical: 0, soon: 1, planned: 2 };
    suggestions.sort(
      (a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency],
    );

    res.json({ data: suggestions });
  } catch (error) {
    logger.error("Error fetching reorder suggestions", error as Error);
    res.status(500).json({ error: "Failed to fetch reorder suggestions" });
  }
});

export default router;
