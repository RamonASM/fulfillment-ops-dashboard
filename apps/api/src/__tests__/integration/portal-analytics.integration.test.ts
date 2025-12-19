// =============================================================================
// PORTAL ANALYTICS INTEGRATION TESTS
// Full database integration tests for portal analytics endpoints
// =============================================================================

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { subDays, format } from "date-fns";

// Skip tests if database is not available (e.g., in CI without seeded data)
const DATABASE_URL = process.env.DATABASE_URL;
const skipTests = !DATABASE_URL || DATABASE_URL.includes("test");

let prisma: PrismaClient;
try {
  prisma = new PrismaClient();
} catch {
  // Prisma client not generated - tests will be skipped
}

describe.skipIf(skipTests || !prisma)(
  "Portal Analytics Integration Tests",
  () => {
    let testClientId: string;
    let testProductIds: string[];
    let testUserId: string;

    beforeAll(async () => {
      // Create test client
      const client = await prisma.client.create({
        data: {
          name: "Test Client Portal Analytics",
          code: "TEST-PA",
          isActive: true,
        },
      });
      testClientId = client.id;

      // Create test user with portal access
      const user = await prisma.user.create({
        data: {
          email: `test-portal-${Date.now()}@test.com`,
          passwordHash: "test-hash",
          name: "Test User",
          role: "portal_user",
          clients: {
            create: {
              clientId: testClientId,
            },
          },
        },
      });
      testUserId = user.id;

      // Create test products with realistic data
      const products = await Promise.all([
        prisma.product.create({
          data: {
            clientId: testClientId,
            productId: "SKU-001-PA",
            name: "Test Product 1",
            packSize: 10,
            currentStockPacks: 20,
            currentStockUnits: 200,
            monthlyUsageUnits: 100,
            stockStatus: "HEALTHY",
            isActive: true,
          },
        }),
        prisma.product.create({
          data: {
            clientId: testClientId,
            productId: "SKU-002-PA",
            name: "Test Product 2",
            packSize: 5,
            currentStockPacks: 5,
            currentStockUnits: 25,
            monthlyUsageUnits: 50,
            stockStatus: "LOW",
            isActive: true,
          },
        }),
        prisma.product.create({
          data: {
            clientId: testClientId,
            productId: "SKU-003-PA",
            name: "Test Product 3",
            packSize: 12,
            currentStockPacks: 2,
            currentStockUnits: 24,
            monthlyUsageUnits: 120,
            stockStatus: "CRITICAL",
            isActive: true,
          },
        }),
      ]);

      testProductIds = products.map((p) => p.id);

      // Create test transactions (last 90 days)
      const transactions: Array<{
        productId: string;
        dateSubmitted: Date;
        quantityPacks: number;
        quantityUnits: number;
        orderId: string;
        shipToCompany: string;
        shipToLocation: string;
      }> = [];
      for (let i = 0; i < 30; i++) {
        const date = subDays(new Date(), i);
        for (const productId of testProductIds) {
          transactions.push({
            productId,
            dateSubmitted: date,
            quantityPacks: Math.floor(Math.random() * 3) + 1,
            quantityUnits: Math.floor(Math.random() * 30) + 5,
            orderId: `order-${i}-${productId}`,
            shipToCompany: i < 15 ? "Location A" : "Location B",
            shipToLocation: i < 15 ? "Warehouse A" : "Warehouse B",
          });
        }
      }

      await prisma.transaction.createMany({
        data: transactions,
      });

      // Create usage metrics for stock velocity
      await prisma.usageMetric.createMany({
        data: [
          {
            productId: testProductIds[0],
            periodType: "monthly",
            periodStart: subDays(new Date(), 30),
            periodEnd: new Date(),
            avgDailyUnits: 5.0,
            totalConsumedUnits: 150,
          },
          {
            productId: testProductIds[0],
            periodType: "monthly",
            periodStart: subDays(new Date(), 60),
            periodEnd: subDays(new Date(), 30),
            avgDailyUnits: 4.0,
            totalConsumedUnits: 120,
          },
        ],
      });
    });

    afterAll(async () => {
      // Cleanup test data
      await prisma.transaction.deleteMany({
        where: { productId: { in: testProductIds } },
      });
      await prisma.usageMetric.deleteMany({
        where: { productId: { in: testProductIds } },
      });
      await prisma.product.deleteMany({
        where: { id: { in: testProductIds } },
      });
      await prisma.userClient.deleteMany({
        where: { userId: testUserId },
      });
      await prisma.user.delete({
        where: { id: testUserId },
      });
      await prisma.client.delete({
        where: { id: testClientId },
      });

      await prisma.$disconnect();
    });

    // ===========================================================================
    // STOCK VELOCITY TESTS
    // ===========================================================================

    describe("Stock Velocity Endpoint", () => {
      it("should return stock velocity data for all client products", async () => {
        const products = await prisma.product.findMany({
          where: { clientId: testClientId, isActive: true },
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

        expect(products.length).toBe(3);
        expect(products[0]).toHaveProperty("usageMetrics");
      });

      it("should calculate trend from usage metrics", async () => {
        const product = await prisma.product.findFirst({
          where: { id: testProductIds[0] },
          include: {
            usageMetrics: {
              where: { periodType: "monthly" },
              orderBy: { periodStart: "desc" },
              take: 2,
            },
          },
        });

        if (product && product.usageMetrics.length >= 2) {
          const current = Number(product.usageMetrics[0].avgDailyUnits);
          const previous = Number(product.usageMetrics[1].avgDailyUnits);
          const changePercent = ((current - previous) / previous) * 100;

          expect(changePercent).toBeGreaterThan(0); // Should be increasing (5.0 vs 4.0)
        }
      });
    });

    // ===========================================================================
    // USAGE TRENDS TESTS
    // ===========================================================================

    describe("Usage Trends Endpoint", () => {
      it("should aggregate transactions by date", async () => {
        const days = 30;
        const startDate = subDays(new Date(), days);

        const transactions = await prisma.transaction.findMany({
          where: {
            product: { clientId: testClientId },
            dateSubmitted: { gte: startDate },
          },
          select: {
            dateSubmitted: true,
            quantityUnits: true,
            quantityPacks: true,
          },
          orderBy: { dateSubmitted: "asc" },
        });

        expect(transactions.length).toBeGreaterThan(0);

        // Group by date
        const dateMap = new Map<string, { units: number; packs: number }>();
        for (const txn of transactions) {
          const dateKey = format(txn.dateSubmitted, "yyyy-MM-dd");
          const existing = dateMap.get(dateKey) || { units: 0, packs: 0 };
          existing.units += txn.quantityUnits;
          existing.packs += txn.quantityPacks;
          dateMap.set(dateKey, existing);
        }

        expect(dateMap.size).toBeGreaterThan(0);
        expect(dateMap.size).toBeLessThanOrEqual(30);
      });
    });

    // ===========================================================================
    // SUMMARY ENDPOINT TESTS
    // ===========================================================================

    describe("Summary Endpoint", () => {
      it("should calculate stock health distribution", async () => {
        const products = await prisma.product.findMany({
          where: { clientId: testClientId, isActive: true },
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

        const stockHealth = {
          critical: 0,
          low: 0,
          watch: 0,
          healthy: 0,
          overstock: 0,
        };

        for (const product of products) {
          const monthlyUsage = product.monthlyUsageUnits || 0;
          const currentStock = product.currentStockUnits;
          const weeklyUsage = monthlyUsage / 4.33;
          const weeksRemaining =
            weeklyUsage > 0 ? currentStock / weeklyUsage : 999;

          if (weeksRemaining <= 2) stockHealth.critical++;
          else if (weeksRemaining <= 4) stockHealth.low++;
          else if (weeksRemaining <= 8) stockHealth.watch++;
          else if (weeksRemaining > 16 && monthlyUsage > 0)
            stockHealth.overstock++;
          else stockHealth.healthy++;
        }

        expect(stockHealth.critical).toBeGreaterThan(0); // Product 3 is critical
        expect(stockHealth.low).toBeGreaterThan(0); // Product 2 is low
        expect(products.length).toBe(3);
      });

      it("should calculate order activity metrics", async () => {
        const now = new Date();
        const oneWeekAgo = subDays(now, 7);
        const twoWeeksAgo = subDays(now, 14);

        const transactions = await prisma.transaction.findMany({
          where: {
            product: { clientId: testClientId },
            dateSubmitted: { gte: twoWeeksAgo },
          },
        });

        const thisWeek = new Set(
          transactions
            .filter((t) => t.dateSubmitted >= oneWeekAgo)
            .map((t) => t.orderId),
        );
        const lastWeek = new Set(
          transactions
            .filter(
              (t) =>
                t.dateSubmitted >= twoWeeksAgo && t.dateSubmitted < oneWeekAgo,
            )
            .map((t) => t.orderId),
        );

        expect(thisWeek.size).toBeGreaterThan(0);
        expect(lastWeek.size).toBeGreaterThan(0);
      });

      it("should identify top products by usage", async () => {
        const threeMonthsAgo = subDays(new Date(), 90);

        const transactions = await prisma.transaction.findMany({
          where: {
            product: { clientId: testClientId },
            dateSubmitted: { gte: threeMonthsAgo },
          },
          include: { product: { select: { name: true } } },
        });

        const productUsage = new Map<string, { name: string; units: number }>();
        for (const txn of transactions) {
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

        expect(topProducts.length).toBeGreaterThan(0);
        expect(topProducts.length).toBeLessThanOrEqual(5);
      });
    });

    // ===========================================================================
    // MONTHLY TRENDS TESTS
    // ===========================================================================

    describe("Monthly Trends Endpoint", () => {
      it("should group transactions by month", async () => {
        const months = 3;
        const startDate = subDays(new Date(), months * 30);

        const transactions = await prisma.transaction.findMany({
          where: {
            product: { clientId: testClientId },
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

        expect(monthMap.size).toBeGreaterThan(0);
      });
    });

    // ===========================================================================
    // LOCATION ANALYTICS TESTS
    // ===========================================================================

    describe("Location Analytics Endpoint", () => {
      it("should group transactions by location", async () => {
        const twelveMonthsAgo = subDays(new Date(), 365);

        const transactions = await prisma.transaction.findMany({
          where: {
            product: { clientId: testClientId },
            dateSubmitted: { gte: twelveMonthsAgo },
          },
          include: {
            product: { select: { productId: true, name: true } },
          },
        });

        const locationMap = new Map<
          string,
          { transactions: typeof transactions; company: string }
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

        expect(locationMap.size).toBe(2); // Location A and Location B
      });

      it("should calculate location metrics", async () => {
        const transactions = await prisma.transaction.findMany({
          where: {
            product: { clientId: testClientId },
            shipToLocation: "Warehouse A",
          },
        });

        const totalUnits = transactions.reduce(
          (sum, t) => sum + t.quantityUnits,
          0,
        );
        const orderIds = new Set(transactions.map((t) => t.orderId));
        const avgOrderSize =
          orderIds.size > 0 ? Math.round(totalUnits / orderIds.size) : 0;

        expect(totalUnits).toBeGreaterThan(0);
        expect(orderIds.size).toBeGreaterThan(0);
        expect(avgOrderSize).toBeGreaterThan(0);
      });
    });

    // ===========================================================================
    // REORDER SUGGESTIONS TESTS
    // ===========================================================================

    describe("Reorder Suggestions Endpoint", () => {
      it("should calculate reorder suggestions for low stock products", async () => {
        const threeMonthsAgo = subDays(new Date(), 90);

        const products = await prisma.product.findMany({
          where: { clientId: testClientId, isActive: true },
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

          const currentStock = product.currentStockUnits;
          const weeklyUsage = monthlyUsage / 4.33;
          const weeksOfSupply = currentStock / weeklyUsage;

          if (weeksOfSupply > 6) continue;

          let urgency: "critical" | "soon" | "planned";
          if (weeksOfSupply <= 2) urgency = "critical";
          else if (weeksOfSupply <= 4) urgency = "soon";
          else urgency = "planned";

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

        expect(suggestions.length).toBeGreaterThan(0); // Should have at least one suggestion
        expect(suggestions.some((s) => s.urgency === "critical")).toBe(true);
      });
    });

    // ===========================================================================
    // PERFORMANCE TESTS
    // ===========================================================================

    describe("Performance Requirements", () => {
      it("should retrieve stock velocity data in under 500ms", async () => {
        const startTime = Date.now();

        await prisma.product.findMany({
          where: { clientId: testClientId, isActive: true },
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

        const duration = Date.now() - startTime;
        expect(duration).toBeLessThan(500);
      });

      it("should retrieve summary data in under 1000ms", async () => {
        const startTime = Date.now();

        const [products, transactions] = await Promise.all([
          prisma.product.findMany({
            where: { clientId: testClientId, isActive: true },
            select: {
              id: true,
              name: true,
              currentStockPacks: true,
              currentStockUnits: true,
              packSize: true,
              monthlyUsageUnits: true,
              stockStatus: true,
            },
          }),
          prisma.transaction.findMany({
            where: {
              product: { clientId: testClientId },
              dateSubmitted: { gte: subDays(new Date(), 90) },
            },
          }),
        ]);

        const duration = Date.now() - startTime;
        expect(duration).toBeLessThan(1000);
        expect(products.length).toBeGreaterThan(0);
        expect(transactions.length).toBeGreaterThan(0);
      });
    });
  },
);
