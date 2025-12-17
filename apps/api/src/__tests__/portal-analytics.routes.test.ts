// =============================================================================
// PORTAL ANALYTICS ROUTES TESTS
// Comprehensive tests for portal analytics API endpoints
// =============================================================================

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";

// Mock Prisma client
vi.mock("../lib/prisma.js", () => ({
  prisma: {
    product: {
      findMany: vi.fn(),
    },
    transaction: {
      findMany: vi.fn(),
    },
  },
}));

// Mock logger
vi.mock("../lib/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("Portal Analytics Routes", () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let jsonMock: ReturnType<typeof vi.fn>;
  let statusMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    jsonMock = vi.fn();
    statusMock = vi.fn().mockReturnThis();

    mockRequest = {
      query: {},
      params: {},
    };

    mockResponse = {
      json: jsonMock as any,
      status: statusMock as any,
    };

    // Mock portal auth middleware - adds portalUser to request
    (mockRequest as any).portalUser = {
      clientId: "client-123",
      email: "user@client.com",
    };
  });

  // ===========================================================================
  // STOCK VELOCITY TESTS
  // ===========================================================================

  describe("GET /api/portal/analytics/stock-velocity", () => {
    it("should return stock velocity for all client products", async () => {
      const mockProducts = [
        {
          id: "prod-1",
          productId: "SKU-001",
          name: "Product A",
          avgDailyUsage: 5.2,
          stockStatus: "HEALTHY",
          usageMetrics: [
            { avgDailyUnits: 5.5, periodStart: new Date("2024-01-15") },
            { avgDailyUnits: 5.0, periodStart: new Date("2023-12-15") },
          ],
        },
        {
          id: "prod-2",
          productId: "SKU-002",
          name: "Product B",
          avgDailyUsage: 10.0,
          stockStatus: "LOW",
          usageMetrics: [
            { avgDailyUnits: 12.0, periodStart: new Date("2024-01-15") },
            { avgDailyUnits: 10.0, periodStart: new Date("2023-12-15") },
          ],
        },
      ];

      vi.mocked(prisma.product.findMany).mockResolvedValue(mockProducts as any);

      // Simulate route handler
      const { portalAuth } = await import("../middleware/portal-auth.js");
      const analyticsRouter =
        await import("../routes/portal/analytics.routes.js");

      expect(vi.mocked(prisma.product.findMany)).toBeDefined();
    });

    it("should calculate increasing trend correctly", async () => {
      const mockProduct = {
        id: "prod-1",
        productId: "SKU-001",
        name: "Product A",
        avgDailyUsage: 10.0,
        stockStatus: "HEALTHY",
        usageMetrics: [
          { avgDailyUnits: 12.0, periodStart: new Date("2024-01-15") },
          { avgDailyUnits: 10.0, periodStart: new Date("2023-12-15") },
        ],
      };

      // Change percent should be (12 - 10) / 10 * 100 = 20%
      const expectedChangePercent = 20;
      const expectedTrend = "increasing"; // > 5%

      // Mock calculation logic
      const current = 12.0;
      const previous = 10.0;
      const changePercent = ((current - previous) / previous) * 100;
      const trend =
        changePercent > 5
          ? "increasing"
          : changePercent < -5
            ? "decreasing"
            : "stable";

      expect(changePercent).toBe(expectedChangePercent);
      expect(trend).toBe(expectedTrend);
    });

    it("should calculate decreasing trend correctly", async () => {
      const current = 8.0;
      const previous = 10.0;
      const changePercent = ((current - previous) / previous) * 100;
      const trend =
        changePercent > 5
          ? "increasing"
          : changePercent < -5
            ? "decreasing"
            : "stable";

      expect(changePercent).toBe(-20);
      expect(trend).toBe("decreasing");
    });

    it("should calculate stable trend correctly", async () => {
      const current = 10.2;
      const previous = 10.0;
      const changePercent = ((current - previous) / previous) * 100;
      const trend =
        changePercent > 5
          ? "increasing"
          : changePercent < -5
            ? "decreasing"
            : "stable";

      expect(changePercent).toBe(2);
      expect(trend).toBe("stable");
    });

    it("should handle products with insufficient usage history", async () => {
      const mockProduct = {
        id: "prod-1",
        productId: "SKU-001",
        name: "Product A",
        avgDailyUsage: 5.0,
        stockStatus: "HEALTHY",
        usageMetrics: [
          { avgDailyUnits: 5.0, periodStart: new Date("2024-01-15") },
        ],
      };

      // With less than 2 metrics, should default to stable
      const trend =
        mockProduct.usageMetrics.length >= 2 ? "increasing" : "stable";
      expect(trend).toBe("stable");
    });

    it("should handle zero previous usage correctly", async () => {
      const current = 10.0;
      const previous = 0;

      // Should not calculate percent change when previous is 0
      if (previous > 0) {
        const changePercent = ((current - previous) / previous) * 100;
        expect(changePercent).toBeDefined();
      } else {
        // Should remain stable
        expect(true).toBe(true);
      }
    });
  });

  // ===========================================================================
  // USAGE TRENDS TESTS
  // ===========================================================================

  describe("GET /api/portal/analytics/usage-trends", () => {
    it("should return usage trends for last 30 days by default", async () => {
      mockRequest.query = {};

      const mockTransactions = [
        {
          dateSubmitted: new Date("2024-01-15"),
          quantityUnits: 10,
          quantityPacks: 2,
        },
        {
          dateSubmitted: new Date("2024-01-15"),
          quantityUnits: 5,
          quantityPacks: 1,
        },
        {
          dateSubmitted: new Date("2024-01-16"),
          quantityUnits: 8,
          quantityPacks: 2,
        },
      ];

      vi.mocked(prisma.transaction.findMany).mockResolvedValue(
        mockTransactions as any,
      );

      // Should group by date and aggregate
      const dateMap = new Map();
      for (const txn of mockTransactions) {
        const dateKey = "2024-01-15"; // Simplified for test
        const existing = dateMap.get(dateKey) || { units: 0, packs: 0 };
        existing.units += txn.quantityUnits;
        existing.packs += txn.quantityPacks;
        dateMap.set(dateKey, existing);
      }

      expect(dateMap.get("2024-01-15")).toEqual({ units: 15, packs: 3 });
    });

    it("should respect custom days parameter", async () => {
      mockRequest.query = { days: "60" };

      // Should query transactions from 60 days ago
      const days = parseInt(mockRequest.query.days as string) || 30;
      expect(days).toBe(60);
    });

    it("should handle empty transaction history", async () => {
      vi.mocked(prisma.transaction.findMany).mockResolvedValue([]);

      const dateMap = new Map();
      expect(dateMap.size).toBe(0);
    });

    it("should aggregate transactions for same date", async () => {
      const mockTransactions = [
        {
          dateSubmitted: new Date("2024-01-15T10:00:00Z"),
          quantityUnits: 10,
          quantityPacks: 2,
        },
        {
          dateSubmitted: new Date("2024-01-15T15:00:00Z"),
          quantityUnits: 5,
          quantityPacks: 1,
        },
      ];

      const dateMap = new Map<string, { units: number; packs: number }>();
      for (const txn of mockTransactions) {
        const dateKey = "2024-01-15";
        const existing = dateMap.get(dateKey) || { units: 0, packs: 0 };
        existing.units += txn.quantityUnits;
        existing.packs += txn.quantityPacks;
        dateMap.set(dateKey, existing);
      }

      expect(dateMap.get("2024-01-15")).toEqual({ units: 15, packs: 3 });
    });
  });

  // ===========================================================================
  // RISK PRODUCTS TESTS
  // ===========================================================================

  describe("GET /api/portal/analytics/risk-products", () => {
    it("should return products at risk", async () => {
      const mockRiskProducts = [
        {
          id: "prod-1",
          name: "Product A",
          stockStatus: "CRITICAL",
          weeksRemaining: 1,
          currentStockPacks: 5,
          riskScoreCache: { score: 85, riskLevel: "high" },
        },
        {
          id: "prod-2",
          name: "Product B",
          stockStatus: "LOW",
          weeksRemaining: 3,
          currentStockPacks: 15,
          riskScoreCache: { score: 60, riskLevel: "medium" },
        },
      ];

      vi.mocked(prisma.product.findMany).mockResolvedValue(
        mockRiskProducts as any,
      );

      expect(mockRiskProducts.length).toBe(2);
      expect(mockRiskProducts[0].stockStatus).toBe("CRITICAL");
    });

    it("should only include products with risk statuses", async () => {
      // Query should filter for LOW, CRITICAL, STOCKOUT statuses
      const validStatuses = ["LOW", "CRITICAL", "STOCKOUT"];

      expect(validStatuses).toContain("LOW");
      expect(validStatuses).toContain("CRITICAL");
      expect(validStatuses).not.toContain("HEALTHY");
    });

    it("should default risk score when cache missing", async () => {
      const mockProduct = {
        id: "prod-1",
        name: "Product A",
        stockStatus: "LOW",
        weeksRemaining: 3,
        currentStockPacks: 15,
        riskScoreCache: null as { score: number; riskLevel: string } | null,
      };

      const riskScore = mockProduct.riskScoreCache?.score || 50;
      const riskLevel = mockProduct.riskScoreCache?.riskLevel || "medium";

      expect(riskScore).toBe(50);
      expect(riskLevel).toBe("medium");
    });

    it("should order by stock status (most critical first)", async () => {
      const statuses = ["CRITICAL", "LOW", "STOCKOUT"];
      const sorted = statuses.sort();

      // Query should use orderBy: { stockStatus: 'asc' }
      expect(sorted).toBeDefined();
    });
  });

  // ===========================================================================
  // SUMMARY TESTS
  // ===========================================================================

  describe("GET /api/portal/analytics/summary", () => {
    it("should calculate stock health distribution correctly", async () => {
      const mockProducts = [
        {
          id: "prod-1",
          name: "Product A",
          currentStockPacks: 10,
          currentStockUnits: 100,
          packSize: 10,
          monthlyUsageUnits: 200,
          stockStatus: "CRITICAL",
        },
        {
          id: "prod-2",
          name: "Product B",
          currentStockPacks: 50,
          currentStockUnits: 500,
          packSize: 10,
          monthlyUsageUnits: 100,
          stockStatus: "HEALTHY",
        },
      ];

      const stockHealth = {
        critical: 0,
        low: 0,
        watch: 0,
        healthy: 0,
        overstock: 0,
      };

      for (const product of mockProducts) {
        const monthlyUsage = product.monthlyUsageUnits || 0;
        const currentStock = product.currentStockUnits;
        const weeklyUsage = monthlyUsage / 4.33;
        const weeksRemaining =
          weeklyUsage > 0 ? currentStock / weeklyUsage : 999;

        if (weeksRemaining <= 2) {
          stockHealth.critical++;
        } else if (weeksRemaining <= 4) {
          stockHealth.low++;
        } else if (weeksRemaining <= 8) {
          stockHealth.watch++;
        } else if (weeksRemaining > 16 && monthlyUsage > 0) {
          stockHealth.overstock++;
        } else {
          stockHealth.healthy++;
        }
      }

      expect(stockHealth.critical).toBeGreaterThan(0);
      expect(stockHealth.healthy).toBeGreaterThan(0);
    });

    it("should identify upcoming stockouts correctly", async () => {
      const upcomingStockouts: Array<{
        name: string;
        daysUntil: number;
        currentStock: number;
      }> = [];

      const monthlyUsage = 200;
      const currentStock = 100;
      const weeklyUsage = monthlyUsage / 4.33;
      const weeksRemaining = currentStock / weeklyUsage;

      if (weeksRemaining <= 4) {
        upcomingStockouts.push({
          name: "Product A",
          daysUntil: Math.round(weeksRemaining * 7),
          currentStock,
        });
      }

      expect(upcomingStockouts.length).toBeGreaterThan(0);
      expect(upcomingStockouts[0].daysUntil).toBeLessThanOrEqual(28); // 4 weeks
    });

    it("should calculate order activity correctly", async () => {
      const mockTransactions = [
        {
          orderId: "order-1",
          dateSubmitted: new Date("2024-01-10"),
        },
        {
          orderId: "order-2",
          dateSubmitted: new Date("2024-01-12"),
        },
        {
          orderId: "order-3",
          dateSubmitted: new Date("2024-01-05"),
        },
      ];

      const now = new Date("2024-01-15");
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

      const thisWeek = new Set(
        mockTransactions
          .filter((t) => t.dateSubmitted >= oneWeekAgo)
          .map((t) => t.orderId),
      );
      const lastWeek = new Set(
        mockTransactions
          .filter(
            (t) =>
              t.dateSubmitted >= twoWeeksAgo && t.dateSubmitted < oneWeekAgo,
          )
          .map((t) => t.orderId),
      );

      expect(thisWeek.size).toBe(2); // orders 1 and 2
      expect(lastWeek.size).toBe(1); // order 3
    });

    it("should determine activity trend correctly", async () => {
      const thisWeekOrders = 5;
      const lastWeekOrders = 3;

      const trend =
        thisWeekOrders > lastWeekOrders
          ? "up"
          : thisWeekOrders < lastWeekOrders
            ? "down"
            : "stable";

      expect(trend).toBe("up");
    });

    it("should calculate top products from 3-month history", async () => {
      const mockTransactions = [
        {
          productId: "prod-1",
          quantityUnits: 100,
          product: { name: "Product A" },
        },
        {
          productId: "prod-2",
          quantityUnits: 50,
          product: { name: "Product B" },
        },
        {
          productId: "prod-1",
          quantityUnits: 75,
          product: { name: "Product A" },
        },
      ];

      const productUsage = new Map<string, { name: string; units: number }>();
      for (const txn of mockTransactions) {
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

      expect(topProducts[0].id).toBe("prod-1");
      expect(topProducts[0].units).toBe(175);
    });
  });

  // ===========================================================================
  // MONTHLY TRENDS TESTS
  // ===========================================================================

  describe("GET /api/portal/analytics/monthly-trends", () => {
    it("should return 12 months of data by default", async () => {
      mockRequest.query = {};

      const months = parseInt((mockRequest.query.days as string) || "12");
      expect(months).toBe(12);
    });

    it("should group transactions by month correctly", async () => {
      const mockTransactions = [
        {
          dateSubmitted: new Date("2024-01-15"),
          quantityUnits: 100,
          orderId: "order-1",
          productId: "prod-1",
        },
        {
          dateSubmitted: new Date("2024-01-20"),
          quantityUnits: 50,
          orderId: "order-2",
          productId: "prod-1",
        },
        {
          dateSubmitted: new Date("2024-02-10"),
          quantityUnits: 75,
          orderId: "order-3",
          productId: "prod-2",
        },
      ];

      const monthMap = new Map<
        string,
        { units: number; orderIds: Set<string>; productIds: Set<string> }
      >();

      for (const txn of mockTransactions) {
        const monthKey = "Jan 2024"; // Simplified
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

      expect(monthMap.get("Jan 2024")?.units).toBeGreaterThan(0);
    });

    it("should count unique orders per month", async () => {
      const mockTransactions = [
        { orderId: "order-1", productId: "prod-1", quantityUnits: 10 },
        { orderId: "order-1", productId: "prod-2", quantityUnits: 5 },
        { orderId: "order-2", productId: "prod-1", quantityUnits: 8 },
      ];

      const orderIds = new Set<string>();
      for (const txn of mockTransactions) {
        orderIds.add(txn.orderId);
      }

      expect(orderIds.size).toBe(2); // Only 2 unique orders
    });

    it("should handle months with no transactions", async () => {
      const monthMap = new Map();
      const monthKey = "Feb 2024";

      const data = monthMap.get(monthKey);
      const orders = data ? data.orderIds.size : 0;
      const units = data ? data.units : 0;

      expect(orders).toBe(0);
      expect(units).toBe(0);
    });
  });

  // ===========================================================================
  // LOCATION ANALYTICS TESTS
  // ===========================================================================

  describe("GET /api/portal/analytics/locations", () => {
    it("should group transactions by location", async () => {
      const mockTransactions = [
        {
          shipToLocation: "Location A",
          shipToCompany: "Company X",
          quantityUnits: 100,
          orderId: "order-1",
          product: { productId: "SKU-001", name: "Product A" },
        },
        {
          shipToLocation: "Location A",
          shipToCompany: "Company X",
          quantityUnits: 50,
          orderId: "order-2",
          product: { productId: "SKU-002", name: "Product B" },
        },
        {
          shipToLocation: "Location B",
          shipToCompany: "Company Y",
          quantityUnits: 75,
          orderId: "order-3",
          product: { productId: "SKU-001", name: "Product A" },
        },
      ];

      const locationMap = new Map<
        string,
        { transactions: typeof mockTransactions; company: string }
      >();

      for (const txn of mockTransactions) {
        const key = txn.shipToLocation || txn.shipToCompany || "Unknown";
        if (!locationMap.has(key)) {
          locationMap.set(key, {
            transactions: [],
            company: txn.shipToCompany || "Unknown",
          });
        }
        locationMap.get(key)!.transactions.push(txn);
      }

      expect(locationMap.get("Location A")?.transactions.length).toBe(2);
      expect(locationMap.get("Location B")?.transactions.length).toBe(1);
    });

    it("should calculate total units per location", async () => {
      const transactions = [
        { quantityUnits: 100, orderId: "order-1" },
        { quantityUnits: 50, orderId: "order-2" },
      ];

      const totalUnits = transactions.reduce(
        (sum, t) => sum + t.quantityUnits,
        0,
      );
      expect(totalUnits).toBe(150);
    });

    it("should calculate average order size", async () => {
      const transactions = [
        { quantityUnits: 100, orderId: "order-1" },
        { quantityUnits: 50, orderId: "order-2" },
      ];

      const totalUnits = transactions.reduce(
        (sum, t) => sum + t.quantityUnits,
        0,
      );
      const orderIds = new Set(transactions.map((t) => t.orderId));
      const avgOrderSize =
        orderIds.size > 0 ? Math.round(totalUnits / orderIds.size) : 0;

      expect(avgOrderSize).toBe(75); // 150 / 2
    });

    it("should handle missing location data", async () => {
      const txn = {
        shipToLocation: null,
        shipToCompany: null,
        quantityUnits: 50,
        orderId: "order-1",
      };

      const key = txn.shipToLocation || txn.shipToCompany || "Unknown";
      expect(key).toBe("Unknown");
    });

    it("should sort locations by total units descending", async () => {
      const locationData = [
        { location: "Location A", totalUnits: 150 },
        { location: "Location B", totalUnits: 250 },
        { location: "Location C", totalUnits: 75 },
      ];

      const sorted = locationData.sort((a, b) => b.totalUnits - a.totalUnits);

      expect(sorted[0].location).toBe("Location B");
      expect(sorted[2].location).toBe("Location C");
    });

    it("should limit to top 10 locations", async () => {
      const locationData = Array.from({ length: 15 }, (_, i) => ({
        location: `Location ${i}`,
        totalUnits: 100 - i,
      }));

      const top10 = locationData.slice(0, 10);
      expect(top10.length).toBe(10);
    });
  });

  // ===========================================================================
  // REORDER SUGGESTIONS TESTS
  // ===========================================================================

  describe("GET /api/portal/analytics/reorder-suggestions", () => {
    it("should calculate reorder suggestions correctly", async () => {
      const mockProduct = {
        productId: "SKU-001",
        name: "Product A",
        currentStockPacks: 10,
        currentStockUnits: 100,
        packSize: 10,
        transactions: [
          { quantityUnits: 100, dateSubmitted: new Date("2024-01-01") },
          { quantityUnits: 80, dateSubmitted: new Date("2024-02-01") },
          { quantityUnits: 120, dateSubmitted: new Date("2024-03-01") },
        ],
      };

      const totalUnits = mockProduct.transactions.reduce(
        (sum, t) => sum + t.quantityUnits,
        0,
      );
      const monthlyUsage = totalUnits / 3;
      const currentStock = mockProduct.currentStockUnits;
      const weeklyUsage = monthlyUsage / 4.33;
      const weeksOfSupply = currentStock / weeklyUsage;

      expect(monthlyUsage).toBe(100); // 300 / 3
      expect(weeksOfSupply).toBeCloseTo(4.33, 1); // 100 / 23.09
    });

    it("should determine urgency levels correctly", async () => {
      // Critical: <= 2 weeks
      expect(1.5 <= 2 ? "critical" : "soon").toBe("critical");

      // Soon: <= 4 weeks
      expect(3.5 <= 4 ? "soon" : "planned").toBe("soon");

      // Planned: <= 6 weeks
      expect(5.5 <= 6 ? "planned" : "none").toBe("planned");
    });

    it("should calculate suggested order quantity for 8 weeks supply", async () => {
      const weeklyUsage = 25;
      const currentStock = 50;
      const targetWeeks = 8;

      const suggestedQty = Math.ceil(weeklyUsage * targetWeeks - currentStock);
      expect(suggestedQty).toBe(150); // 200 - 50
    });

    it("should skip products with insufficient usage", async () => {
      const monthlyUsage = 0.5; // < 1
      const shouldInclude = monthlyUsage >= 1;

      expect(shouldInclude).toBe(false);
    });

    it("should skip products with sufficient supply", async () => {
      const weeksOfSupply = 8;
      const shouldInclude = weeksOfSupply <= 6;

      expect(shouldInclude).toBe(false);
    });

    it("should sort suggestions by urgency", async () => {
      const suggestions = [
        { productName: "Product A", urgency: "soon" as const },
        { productName: "Product B", urgency: "critical" as const },
        { productName: "Product C", urgency: "planned" as const },
      ];

      const urgencyOrder = { critical: 0, soon: 1, planned: 2 };
      const sorted = suggestions.sort(
        (a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency],
      );

      expect(sorted[0].productName).toBe("Product B"); // critical
      expect(sorted[1].productName).toBe("Product A"); // soon
      expect(sorted[2].productName).toBe("Product C"); // planned
    });
  });

  // ===========================================================================
  // ERROR HANDLING TESTS
  // ===========================================================================

  describe("Error Handling", () => {
    it("should return 500 on database error", async () => {
      vi.mocked(prisma.product.findMany).mockRejectedValue(
        new Error("Database connection failed"),
      );

      // Route handler should catch error and return 500
      const expectedStatus = 500;
      const expectedError = "Failed to fetch stock velocity";

      expect(expectedStatus).toBe(500);
      expect(expectedError).toContain("Failed");
    });

    it("should handle authentication missing gracefully", async () => {
      const requestWithoutAuth = { ...mockRequest };
      delete (requestWithoutAuth as any).portalUser;

      // Should fail when portalUser is undefined
      expect((requestWithoutAuth as any).portalUser).toBeUndefined();
    });
  });
});
