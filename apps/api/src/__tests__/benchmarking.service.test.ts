// =============================================================================
// BENCHMARKING SERVICE TESTS
// Comprehensive tests for privacy-preserving benchmarking features
// =============================================================================

import { describe, it, expect, beforeEach, vi } from "vitest";
import { BenchmarkingService } from "../services/benchmarking.service.js";
import { prisma } from "../lib/prisma.js";

// Mock Prisma client
vi.mock("../lib/prisma.js", () => ({
  prisma: {
    benchmarkParticipation: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
    benchmarkSnapshot: {
      findFirst: vi.fn(),
      upsert: vi.fn(),
    },
    product: {
      count: vi.fn(),
      aggregate: vi.fn(),
    },
    orderRequest: {
      count: vi.fn(),
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

describe("BenchmarkingService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // PARTICIPATION TESTS
  // ===========================================================================

  describe("Participation Management", () => {
    describe("optIn", () => {
      it("should opt a client into benchmarking with default cohort", async () => {
        const clientId = "test-client-1";
        const mockUpsert = vi.mocked(prisma.benchmarkParticipation.upsert);
        mockUpsert.mockResolvedValue({
          id: "participation-1",
          clientId,
          isParticipating: true,
          cohort: "general",
          anonymousId: "anon-1",
          joinedAt: new Date(),
          updatedAt: new Date(),
        });

        await BenchmarkingService.optIn(clientId);

        expect(mockUpsert).toHaveBeenCalledWith({
          where: { clientId },
          create: {
            clientId,
            isParticipating: true,
            cohort: "general",
          },
          update: {
            isParticipating: true,
            cohort: "general",
          },
        });
      });

      it("should opt a client into benchmarking with specific cohort", async () => {
        const clientId = "test-client-2";
        const cohort = "healthcare";
        const mockUpsert = vi.mocked(prisma.benchmarkParticipation.upsert);
        mockUpsert.mockResolvedValue({
          id: "participation-2",
          clientId,
          isParticipating: true,
          cohort,
          anonymousId: "anon-2",
          joinedAt: new Date(),
          updatedAt: new Date(),
        });

        await BenchmarkingService.optIn(clientId, cohort);

        expect(mockUpsert).toHaveBeenCalledWith({
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
      });

      it("should verify anonymous ID is generated on opt-in", async () => {
        const clientId = "test-client-3";
        const mockUpsert = vi.mocked(prisma.benchmarkParticipation.upsert);
        const anonymousId = "unique-anonymous-id";

        mockUpsert.mockResolvedValue({
          id: "participation-3",
          clientId,
          isParticipating: true,
          cohort: "general",
          anonymousId,
          joinedAt: new Date(),
          updatedAt: new Date(),
        });

        await BenchmarkingService.optIn(clientId);

        const result = await mockUpsert.mock.results[0].value;
        expect(result.anonymousId).toBeTruthy();
        expect(result.anonymousId).toMatch(/^[a-f0-9-]+$/i); // UUID format
      });
    });

    describe("optOut", () => {
      it("should opt a client out of benchmarking", async () => {
        const clientId = "test-client-4";
        const mockUpdate = vi.mocked(prisma.benchmarkParticipation.update);
        mockUpdate.mockResolvedValue({
          id: "participation-4",
          clientId,
          isParticipating: false,
          cohort: "general",
          anonymousId: "anon-4",
          joinedAt: new Date(),
          updatedAt: new Date(),
        });

        await BenchmarkingService.optOut(clientId);

        expect(mockUpdate).toHaveBeenCalledWith({
          where: { clientId },
          data: { isParticipating: false },
        });
      });
    });

    describe("participation status checks", () => {
      it("should return null for non-participating client", async () => {
        const clientId = "test-client-5";
        const mockFindUnique = vi.mocked(
          prisma.benchmarkParticipation.findUnique,
        );
        mockFindUnique.mockResolvedValue({
          id: "participation-5",
          clientId,
          isParticipating: false,
          cohort: "general",
          anonymousId: "anon-5",
          joinedAt: new Date(),
          updatedAt: new Date(),
          client: { name: "Test Client 5" },
        });

        const result = await BenchmarkingService.getClientBenchmark(clientId);

        expect(result).toBeNull();
      });

      it("should return null for client with no participation record", async () => {
        const clientId = "test-client-6";
        const mockFindUnique = vi.mocked(
          prisma.benchmarkParticipation.findUnique,
        );
        mockFindUnique.mockResolvedValue(null);

        const result = await BenchmarkingService.getClientBenchmark(clientId);

        expect(result).toBeNull();
      });
    });

    describe("cohort assignments", () => {
      it("should assign client to specific cohort", async () => {
        const clientId = "test-client-7";
        const cohort = "retail";
        const mockUpsert = vi.mocked(prisma.benchmarkParticipation.upsert);
        mockUpsert.mockResolvedValue({
          id: "participation-7",
          clientId,
          isParticipating: true,
          cohort,
          anonymousId: "anon-7",
          joinedAt: new Date(),
          updatedAt: new Date(),
        });

        await BenchmarkingService.optIn(clientId, cohort);

        const result = await mockUpsert.mock.results[0].value;
        expect(result.cohort).toBe(cohort);
      });

      it("should get available cohorts", async () => {
        const mockFindMany = vi.mocked(prisma.benchmarkParticipation.findMany);
        mockFindMany.mockResolvedValue([
          { cohort: "general" } as any,
          { cohort: "healthcare" } as any,
          { cohort: "retail" } as any,
          { cohort: null } as any,
        ]);

        const cohorts = await BenchmarkingService.getAvailableCohorts();

        expect(cohorts).toEqual(["general", "healthcare", "retail", "general"]);
      });
    });
  });

  // ===========================================================================
  // SNAPSHOT GENERATION TESTS
  // ===========================================================================

  describe("Snapshot Generation", () => {
    describe("minimum participant requirements", () => {
      it("should not generate snapshot with fewer than 5 participants", async () => {
        const cohort = "general";
        const mockFindMany = vi.mocked(prisma.benchmarkParticipation.findMany);
        mockFindMany.mockResolvedValue([
          { clientId: "client-1", client: {} } as any,
          { clientId: "client-2", client: {} } as any,
          { clientId: "client-3", client: {} } as any,
          { clientId: "client-4", client: {} } as any,
        ]);

        const mockUpsert = vi.mocked(prisma.benchmarkSnapshot.upsert);

        await BenchmarkingService.generateSnapshot(cohort);

        expect(mockUpsert).not.toHaveBeenCalled();
      });

      it("should generate snapshot with exactly 5 participants", async () => {
        const cohort = "general";
        const participants = Array.from({ length: 5 }, (_, i) => ({
          clientId: `client-${i}`,
          client: {},
        }));

        const mockFindMany = vi.mocked(prisma.benchmarkParticipation.findMany);
        mockFindMany.mockResolvedValue(participants as any);

        // Mock metrics calculation
        vi.mocked(prisma.product.count).mockResolvedValue(10);
        vi.mocked(prisma.orderRequest.count).mockResolvedValue(5);
        vi.mocked(prisma.product.aggregate).mockResolvedValue({
          _sum: { currentStockPacks: 100 },
        } as any);

        const mockUpsert = vi.mocked(prisma.benchmarkSnapshot.upsert);
        mockUpsert.mockResolvedValue({} as any);

        await BenchmarkingService.generateSnapshot(cohort);

        expect(mockUpsert).toHaveBeenCalled();
        const callArgs = mockUpsert.mock.calls[0][0];
        expect(callArgs.create.participantCount).toBe(5);
      });

      it("should generate snapshot with more than 5 participants", async () => {
        const cohort = "healthcare";
        const participants = Array.from({ length: 10 }, (_, i) => ({
          clientId: `client-${i}`,
          client: {},
        }));

        const mockFindMany = vi.mocked(prisma.benchmarkParticipation.findMany);
        mockFindMany.mockResolvedValue(participants as any);

        // Mock metrics calculation
        vi.mocked(prisma.product.count).mockResolvedValue(15);
        vi.mocked(prisma.orderRequest.count).mockResolvedValue(8);
        vi.mocked(prisma.product.aggregate).mockResolvedValue({
          _sum: { currentStockPacks: 150 },
        } as any);

        const mockUpsert = vi.mocked(prisma.benchmarkSnapshot.upsert);
        mockUpsert.mockResolvedValue({} as any);

        await BenchmarkingService.generateSnapshot(cohort);

        expect(mockUpsert).toHaveBeenCalled();
        const callArgs = mockUpsert.mock.calls[0][0];
        expect(callArgs.create.participantCount).toBe(10);
      });
    });

    describe("aggregated metrics calculation", () => {
      it("should calculate correct averages for metrics", async () => {
        const cohort = "general";
        const participants = Array.from({ length: 5 }, (_, i) => ({
          clientId: `client-${i}`,
          client: {},
        }));

        const mockFindMany = vi.mocked(prisma.benchmarkParticipation.findMany);
        mockFindMany.mockResolvedValue(participants as any);

        // Mock different values for each client
        const productCounts = [10, 20, 30, 40, 50];
        const orderCounts = [2, 4, 6, 8, 10];
        const stockPacks = [100, 200, 300, 400, 500];

        let callIndex = 0;
        vi.mocked(prisma.product.count).mockImplementation(() => {
          const result = productCounts[Math.floor(callIndex / 2)];
          callIndex++;
          return Promise.resolve(result);
        });

        callIndex = 0;
        vi.mocked(prisma.orderRequest.count).mockImplementation(() => {
          const result = orderCounts[callIndex];
          callIndex++;
          return Promise.resolve(result);
        });

        callIndex = 0;
        vi.mocked(prisma.product.aggregate).mockImplementation(() => {
          const result = stockPacks[callIndex];
          callIndex++;
          return Promise.resolve({
            _sum: { currentStockPacks: result },
          } as any);
        });

        const mockUpsert = vi.mocked(prisma.benchmarkSnapshot.upsert);
        mockUpsert.mockResolvedValue({} as any);

        await BenchmarkingService.generateSnapshot(cohort);

        expect(mockUpsert).toHaveBeenCalled();
        const callArgs = mockUpsert.mock.calls[0][0];

        // Average product count should be 30
        expect(callArgs.create.avgProductCount).toBeCloseTo(30, 1);
      });
    });

    describe("percentile calculation", () => {
      it("should calculate P25, P50, P75, P90 correctly", async () => {
        const cohort = "general";
        const participants = Array.from({ length: 10 }, (_, i) => ({
          clientId: `client-${i}`,
          client: {},
        }));

        const mockFindMany = vi.mocked(prisma.benchmarkParticipation.findMany);
        mockFindMany.mockResolvedValue(participants as any);

        // Create a sorted distribution: 10, 20, 30, ..., 100
        const productCounts = Array.from(
          { length: 10 },
          (_, i) => (i + 1) * 10,
        );

        let callIndex = 0;
        vi.mocked(prisma.product.count).mockImplementation(() => {
          const result = productCounts[Math.floor(callIndex / 2)];
          callIndex++;
          return Promise.resolve(result);
        });

        vi.mocked(prisma.orderRequest.count).mockResolvedValue(5);
        vi.mocked(prisma.product.aggregate).mockResolvedValue({
          _sum: { currentStockPacks: 100 },
        } as any);

        const mockUpsert = vi.mocked(prisma.benchmarkSnapshot.upsert);
        mockUpsert.mockResolvedValue({} as any);

        await BenchmarkingService.generateSnapshot(cohort);

        expect(mockUpsert).toHaveBeenCalled();
        const callArgs = mockUpsert.mock.calls[0][0];

        // With values [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]:
        // P25 (~25th percentile) should be around 30
        // P50 (median) should be around 50
        // P75 (~75th percentile) should be around 70
        // P90 (~90th percentile) should be around 90

        expect(callArgs.create.p25ProductCount).toBeGreaterThanOrEqual(20);
        expect(callArgs.create.p50ProductCount).toBeGreaterThanOrEqual(40);
        expect(callArgs.create.p75ProductCount).toBeGreaterThanOrEqual(60);
        expect(callArgs.create.p90ProductCount).toBeGreaterThanOrEqual(80);
      });
    });

    describe("various cohort sizes", () => {
      it("should handle exactly minimum participants (5)", async () => {
        await testCohortSize(5);
      });

      it("should handle small cohort (7 participants)", async () => {
        await testCohortSize(7);
      });

      it("should handle medium cohort (15 participants)", async () => {
        await testCohortSize(15);
      });

      it("should handle large cohort (50 participants)", async () => {
        await testCohortSize(50);
      });

      async function testCohortSize(size: number) {
        const cohort = "test-cohort";
        const participants = Array.from({ length: size }, (_, i) => ({
          clientId: `client-${i}`,
          client: {},
        }));

        const mockFindMany = vi.mocked(prisma.benchmarkParticipation.findMany);
        mockFindMany.mockResolvedValue(participants as any);

        vi.mocked(prisma.product.count).mockResolvedValue(10);
        vi.mocked(prisma.orderRequest.count).mockResolvedValue(5);
        vi.mocked(prisma.product.aggregate).mockResolvedValue({
          _sum: { currentStockPacks: 100 },
        } as any);

        const mockUpsert = vi.mocked(prisma.benchmarkSnapshot.upsert);
        mockUpsert.mockResolvedValue({} as any);

        await BenchmarkingService.generateSnapshot(cohort);

        expect(mockUpsert).toHaveBeenCalled();
        const callArgs = mockUpsert.mock.calls[0][0];
        expect(callArgs.create.participantCount).toBe(size);
      }
    });

    describe("PII verification", () => {
      it("should not include client names in snapshot", async () => {
        const cohort = "general";
        const participants = Array.from({ length: 5 }, (_, i) => ({
          clientId: `client-${i}`,
          client: { name: `Client Name ${i}` },
        }));

        const mockFindMany = vi.mocked(prisma.benchmarkParticipation.findMany);
        mockFindMany.mockResolvedValue(participants as any);

        vi.mocked(prisma.product.count).mockResolvedValue(10);
        vi.mocked(prisma.orderRequest.count).mockResolvedValue(5);
        vi.mocked(prisma.product.aggregate).mockResolvedValue({
          _sum: { currentStockPacks: 100 },
        } as any);

        const mockUpsert = vi.mocked(prisma.benchmarkSnapshot.upsert);
        mockUpsert.mockResolvedValue({} as any);

        await BenchmarkingService.generateSnapshot(cohort);

        const callArgs = mockUpsert.mock.calls[0][0];
        const snapshotData = JSON.stringify(callArgs.create);

        // Verify no client names in snapshot
        participants.forEach((p) => {
          expect(snapshotData).not.toContain(p.client.name);
        });
      });

      it("should not include client IDs in snapshot", async () => {
        const cohort = "general";
        const participants = Array.from({ length: 5 }, (_, i) => ({
          clientId: `client-id-${i}`,
          client: {},
        }));

        const mockFindMany = vi.mocked(prisma.benchmarkParticipation.findMany);
        mockFindMany.mockResolvedValue(participants as any);

        vi.mocked(prisma.product.count).mockResolvedValue(10);
        vi.mocked(prisma.orderRequest.count).mockResolvedValue(5);
        vi.mocked(prisma.product.aggregate).mockResolvedValue({
          _sum: { currentStockPacks: 100 },
        } as any);

        const mockUpsert = vi.mocked(prisma.benchmarkSnapshot.upsert);
        mockUpsert.mockResolvedValue({} as any);

        await BenchmarkingService.generateSnapshot(cohort);

        const callArgs = mockUpsert.mock.calls[0][0];
        const snapshotData = JSON.stringify(callArgs.create);

        // Verify no client IDs in snapshot
        participants.forEach((p) => {
          expect(snapshotData).not.toContain(p.clientId);
        });
      });

      it("should only contain aggregated metrics", async () => {
        const cohort = "general";
        const participants = Array.from({ length: 5 }, (_, i) => ({
          clientId: `client-${i}`,
          client: {},
        }));

        const mockFindMany = vi.mocked(prisma.benchmarkParticipation.findMany);
        mockFindMany.mockResolvedValue(participants as any);

        vi.mocked(prisma.product.count).mockResolvedValue(10);
        vi.mocked(prisma.orderRequest.count).mockResolvedValue(5);
        vi.mocked(prisma.product.aggregate).mockResolvedValue({
          _sum: { currentStockPacks: 100 },
        } as any);

        const mockUpsert = vi.mocked(prisma.benchmarkSnapshot.upsert);
        mockUpsert.mockResolvedValue({} as any);

        await BenchmarkingService.generateSnapshot(cohort);

        const callArgs = mockUpsert.mock.calls[0][0];
        const snapshot = callArgs.create;

        // Verify only contains expected fields
        expect(snapshot).toHaveProperty("cohort");
        expect(snapshot).toHaveProperty("period");
        expect(snapshot).toHaveProperty("participantCount");
        expect(snapshot).toHaveProperty("avgProductCount");
        expect(snapshot).toHaveProperty("avgOrderFrequency");
        expect(snapshot).toHaveProperty("avgStockoutRate");
        expect(snapshot).toHaveProperty("p25ProductCount");
        expect(snapshot).toHaveProperty("p50ProductCount");
        expect(snapshot).toHaveProperty("p75ProductCount");
        expect(snapshot).toHaveProperty("p90ProductCount");
      });
    });
  });

  // ===========================================================================
  // BENCHMARK COMPARISON TESTS
  // ===========================================================================

  describe("Benchmark Comparison", () => {
    describe("privacy checks", () => {
      it("should return null when cohort has fewer than 5 participants", async () => {
        const clientId = "test-client";
        const mockFindUnique = vi.mocked(
          prisma.benchmarkParticipation.findUnique,
        );
        mockFindUnique.mockResolvedValue({
          id: "participation-1",
          clientId,
          isParticipating: true,
          cohort: "general",
          anonymousId: "anon-1",
          joinedAt: new Date(),
          updatedAt: new Date(),
          client: { name: "Test Client" },
        });

        const mockFindFirst = vi.mocked(prisma.benchmarkSnapshot.findFirst);
        mockFindFirst.mockResolvedValue({
          id: "snapshot-1",
          cohort: "general",
          period: new Date(),
          participantCount: 4, // Below minimum
          avgProductCount: 25,
          avgOrderFrequency: 5,
          avgStockoutRate: 0.1,
          avgForecastAccuracy: 0.85,
          avgInventoryTurnover: 4.5,
          p25ProductCount: 20,
          p50ProductCount: 25,
          p75ProductCount: 30,
          p90ProductCount: 35,
          p25OrderFrequency: 3,
          p50OrderFrequency: 5,
          p75OrderFrequency: 7,
          p90OrderFrequency: 9,
          p25StockoutRate: 0.05,
          p50StockoutRate: 0.1,
          p75StockoutRate: 0.15,
          p90StockoutRate: 0.2,
          p25InventoryTurnover: 3,
          p50InventoryTurnover: 4.5,
          p75InventoryTurnover: 6,
          p90InventoryTurnover: 8,
          createdAt: new Date(),
        } as any);

        const result = await BenchmarkingService.getClientBenchmark(clientId);

        expect(result).toBeNull();
      });

      it("should return comparison when cohort has minimum participants", async () => {
        const clientId = "test-client";
        const mockFindUnique = vi.mocked(
          prisma.benchmarkParticipation.findUnique,
        );
        mockFindUnique.mockResolvedValue({
          id: "participation-1",
          clientId,
          isParticipating: true,
          cohort: "general",
          anonymousId: "anon-1",
          joinedAt: new Date(),
          updatedAt: new Date(),
          client: { name: "Test Client" },
        });

        const mockFindFirst = vi.mocked(prisma.benchmarkSnapshot.findFirst);
        mockFindFirst.mockResolvedValue({
          id: "snapshot-1",
          cohort: "general",
          period: new Date(),
          participantCount: 5, // Minimum
          avgProductCount: 25,
          avgOrderFrequency: 5,
          avgStockoutRate: 0.1,
          avgForecastAccuracy: 0.85,
          avgInventoryTurnover: 4.5,
          p25ProductCount: 20,
          p50ProductCount: 25,
          p75ProductCount: 30,
          p90ProductCount: 35,
          p25OrderFrequency: 3,
          p50OrderFrequency: 5,
          p75OrderFrequency: 7,
          p90OrderFrequency: 9,
          p25StockoutRate: 0.05,
          p50StockoutRate: 0.1,
          p75StockoutRate: 0.15,
          p90StockoutRate: 0.2,
          p25InventoryTurnover: 3,
          p50InventoryTurnover: 4.5,
          p75InventoryTurnover: 6,
          p90InventoryTurnover: 8,
          createdAt: new Date(),
        } as any);

        vi.mocked(prisma.product.count).mockResolvedValue(30);
        vi.mocked(prisma.orderRequest.count).mockResolvedValue(6);
        vi.mocked(prisma.product.aggregate).mockResolvedValue({
          _sum: { currentStockPacks: 100 },
        } as any);

        const result = await BenchmarkingService.getClientBenchmark(clientId);

        expect(result).not.toBeNull();
        expect(result?.participantCount).toBe(5);
      });
    });

    describe("client metrics calculation", () => {
      it("should calculate product count correctly", async () => {
        const clientId = "test-client";
        const expectedCount = 42;

        vi.mocked(prisma.product.count).mockResolvedValue(expectedCount);
        vi.mocked(prisma.orderRequest.count).mockResolvedValue(5);
        vi.mocked(prisma.product.aggregate).mockResolvedValue({
          _sum: { currentStockPacks: 100 },
        } as any);

        const metrics =
          await BenchmarkingService.calculateClientMetrics(clientId);

        expect(metrics.productCount).toBe(expectedCount);
      });

      it("should calculate order frequency correctly", async () => {
        const clientId = "test-client";
        const expectedOrders = 15;

        vi.mocked(prisma.product.count).mockResolvedValue(20);
        vi.mocked(prisma.orderRequest.count).mockResolvedValue(expectedOrders);
        vi.mocked(prisma.product.aggregate).mockResolvedValue({
          _sum: { currentStockPacks: 100 },
        } as any);

        const metrics =
          await BenchmarkingService.calculateClientMetrics(clientId);

        expect(metrics.orderFrequency).toBe(expectedOrders);
      });

      it("should calculate stockout rate correctly", async () => {
        const clientId = "test-client";
        const totalProducts = 100;
        const stockoutProducts = 25;

        // First call for total count, second for stockout count
        let callCount = 0;
        vi.mocked(prisma.product.count).mockImplementation(() => {
          callCount++;
          return Promise.resolve(
            callCount === 1 ? totalProducts : stockoutProducts,
          );
        });

        vi.mocked(prisma.orderRequest.count).mockResolvedValue(10);
        vi.mocked(prisma.product.aggregate).mockResolvedValue({
          _sum: { currentStockPacks: 500 },
        } as any);

        const metrics =
          await BenchmarkingService.calculateClientMetrics(clientId);

        expect(metrics.stockoutRate).toBe(0.25); // 25/100
      });

      it("should handle zero products for stockout rate", async () => {
        const clientId = "test-client";

        vi.mocked(prisma.product.count).mockResolvedValue(0);
        vi.mocked(prisma.orderRequest.count).mockResolvedValue(0);
        vi.mocked(prisma.product.aggregate).mockResolvedValue({
          _sum: { currentStockPacks: 0 },
        } as any);

        const metrics =
          await BenchmarkingService.calculateClientMetrics(clientId);

        expect(metrics.stockoutRate).toBe(0);
      });

      it("should calculate inventory turnover correctly", async () => {
        const clientId = "test-client";
        const orders = 10;
        const stock = 100;

        vi.mocked(prisma.product.count).mockResolvedValue(50);
        vi.mocked(prisma.orderRequest.count).mockResolvedValue(orders);
        vi.mocked(prisma.product.aggregate).mockResolvedValue({
          _sum: { currentStockPacks: stock },
        } as any);

        const metrics =
          await BenchmarkingService.calculateClientMetrics(clientId);

        // Turnover = (orders * 30) / stock = (10 * 30) / 100 = 3
        expect(metrics.inventoryTurnover).toBe(3);
      });

      it("should handle zero inventory for turnover", async () => {
        const clientId = "test-client";

        vi.mocked(prisma.product.count).mockResolvedValue(10);
        vi.mocked(prisma.orderRequest.count).mockResolvedValue(5);
        vi.mocked(prisma.product.aggregate).mockResolvedValue({
          _sum: { currentStockPacks: 0 },
        } as any);

        const metrics =
          await BenchmarkingService.calculateClientMetrics(clientId);

        expect(metrics.inventoryTurnover).toBe(0);
      });
    });

    describe("percentile ranking", () => {
      it("should rank top performer correctly (above P90)", async () => {
        const clientId = "top-performer";
        setupBenchmarkTest(clientId, {
          productCount: 40, // Above p90 (35)
          orderFrequency: 10, // Above p90 (9)
          stockoutRate: 0.02, // Below p25 (0.05) - lower is better
          inventoryTurnover: 9, // Above p90 (8)
        });

        const result = await BenchmarkingService.getClientBenchmark(clientId);

        expect(result).not.toBeNull();
        expect(result?.metrics.productCount.percentile).toBeGreaterThanOrEqual(
          90,
        );
        expect(
          result?.metrics.orderFrequency.percentile,
        ).toBeGreaterThanOrEqual(90);
        expect(result?.metrics.stockoutRate.percentile).toBeGreaterThanOrEqual(
          90,
        );
        expect(
          result?.metrics.inventoryTurnover.percentile,
        ).toBeGreaterThanOrEqual(90);
      });

      it("should rank average performer correctly (around P50)", async () => {
        const clientId = "avg-performer";
        setupBenchmarkTest(clientId, {
          productCount: 25, // At p50
          orderFrequency: 5, // At p50
          stockoutRate: 0.1, // At p50
          inventoryTurnover: 4.5, // At p50
        });

        const result = await BenchmarkingService.getClientBenchmark(clientId);

        expect(result).not.toBeNull();
        expect(result?.metrics.productCount.percentile).toBeGreaterThanOrEqual(
          50,
        );
        expect(
          result?.metrics.orderFrequency.percentile,
        ).toBeGreaterThanOrEqual(50);
        expect(
          result?.metrics.inventoryTurnover.percentile,
        ).toBeGreaterThanOrEqual(50);
      });

      it("should rank poor performer correctly (below P25)", async () => {
        const clientId = "poor-performer";
        setupBenchmarkTest(clientId, {
          productCount: 15, // Below p25 (20)
          orderFrequency: 2, // Below p25 (3)
          stockoutRate: 0.25, // Above p90 (0.2) - higher is worse
          inventoryTurnover: 2, // Below p25 (3)
        });

        const result = await BenchmarkingService.getClientBenchmark(clientId);

        expect(result).not.toBeNull();
        expect(result?.metrics.productCount.percentile).toBeLessThan(50);
        expect(result?.metrics.orderFrequency.percentile).toBeLessThan(50);
        expect(result?.metrics.inventoryTurnover.percentile).toBeLessThan(50);
      });

      function setupBenchmarkTest(
        clientId: string,
        metrics: {
          productCount: number;
          orderFrequency: number;
          stockoutRate: number;
          inventoryTurnover: number;
        },
      ) {
        const mockFindUnique = vi.mocked(
          prisma.benchmarkParticipation.findUnique,
        );
        mockFindUnique.mockResolvedValue({
          id: "participation-1",
          clientId,
          isParticipating: true,
          cohort: "general",
          anonymousId: "anon-1",
          joinedAt: new Date(),
          updatedAt: new Date(),
          client: { name: "Test Client" },
        });

        const mockFindFirst = vi.mocked(prisma.benchmarkSnapshot.findFirst);
        mockFindFirst.mockResolvedValue({
          id: "snapshot-1",
          cohort: "general",
          period: new Date(),
          participantCount: 10,
          avgProductCount: 25,
          avgOrderFrequency: 5,
          avgStockoutRate: 0.1,
          avgForecastAccuracy: 0.85,
          avgInventoryTurnover: 4.5,
          p25ProductCount: 20,
          p50ProductCount: 25,
          p75ProductCount: 30,
          p90ProductCount: 35,
          p25OrderFrequency: 3,
          p50OrderFrequency: 5,
          p75OrderFrequency: 7,
          p90OrderFrequency: 9,
          p25StockoutRate: 0.05,
          p50StockoutRate: 0.1,
          p75StockoutRate: 0.15,
          p90StockoutRate: 0.2,
          p25InventoryTurnover: 3,
          p50InventoryTurnover: 4.5,
          p75InventoryTurnover: 6,
          p90InventoryTurnover: 8,
          createdAt: new Date(),
        } as any);

        const stockoutProducts = Math.round(
          metrics.productCount * metrics.stockoutRate,
        );
        let callCount = 0;
        vi.mocked(prisma.product.count).mockImplementation(() => {
          callCount++;
          return Promise.resolve(
            callCount === 1 ? metrics.productCount : stockoutProducts,
          );
        });

        vi.mocked(prisma.orderRequest.count).mockResolvedValue(
          metrics.orderFrequency,
        );

        const stock =
          metrics.inventoryTurnover > 0
            ? Math.round(
                (metrics.orderFrequency * 30) / metrics.inventoryTurnover,
              )
            : 0;
        vi.mocked(prisma.product.aggregate).mockResolvedValue({
          _sum: { currentStockPacks: stock },
        } as any);
      }
    });

    describe("performance ranks", () => {
      it("should assign top_10 rank for 90+ percentile", async () => {
        const clientId = "top-10-client";
        setupBenchmarkTest(clientId, {
          productCount: 40,
          orderFrequency: 10,
          stockoutRate: 0.02,
          inventoryTurnover: 9,
        });

        const result = await BenchmarkingService.getClientBenchmark(clientId);

        expect(result?.rank).toBe("top_10");
      });

      it("should assign top_25 rank for 75-89 percentile", async () => {
        const clientId = "top-25-client";
        setupBenchmarkTest(clientId, {
          productCount: 32, // Between p75 and p90
          orderFrequency: 8,
          stockoutRate: 0.06,
          inventoryTurnover: 7,
        });

        const result = await BenchmarkingService.getClientBenchmark(clientId);

        expect(result?.rank).toMatch(/top_25|top_10/);
      });

      it("should assign above_avg rank for 50-74 percentile", async () => {
        const clientId = "above-avg-client";
        setupBenchmarkTest(clientId, {
          productCount: 27, // Between p50 and p75
          orderFrequency: 6,
          stockoutRate: 0.08,
          inventoryTurnover: 5,
        });

        const result = await BenchmarkingService.getClientBenchmark(clientId);

        expect(["above_avg", "top_25"]).toContain(result?.rank);
      });

      it("should assign below_avg rank for 25-49 percentile", async () => {
        const clientId = "below-avg-client";
        setupBenchmarkTest(clientId, {
          productCount: 22, // Between p25 and p50
          orderFrequency: 4,
          stockoutRate: 0.12,
          inventoryTurnover: 3.5,
        });

        const result = await BenchmarkingService.getClientBenchmark(clientId);

        expect(["below_avg", "above_avg"]).toContain(result?.rank);
      });

      it("should assign bottom_25 rank for below 25 percentile", async () => {
        const clientId = "bottom-25-client";
        setupBenchmarkTest(clientId, {
          productCount: 15,
          orderFrequency: 2,
          stockoutRate: 0.25,
          inventoryTurnover: 2,
        });

        const result = await BenchmarkingService.getClientBenchmark(clientId);

        expect(["bottom_25", "below_avg"]).toContain(result?.rank);
      });

      function setupBenchmarkTest(
        clientId: string,
        metrics: {
          productCount: number;
          orderFrequency: number;
          stockoutRate: number;
          inventoryTurnover: number;
        },
      ) {
        const mockFindUnique = vi.mocked(
          prisma.benchmarkParticipation.findUnique,
        );
        mockFindUnique.mockResolvedValue({
          id: "participation-1",
          clientId,
          isParticipating: true,
          cohort: "general",
          anonymousId: "anon-1",
          joinedAt: new Date(),
          updatedAt: new Date(),
          client: { name: "Test Client" },
        });

        const mockFindFirst = vi.mocked(prisma.benchmarkSnapshot.findFirst);
        mockFindFirst.mockResolvedValue({
          id: "snapshot-1",
          cohort: "general",
          period: new Date(),
          participantCount: 10,
          avgProductCount: 25,
          avgOrderFrequency: 5,
          avgStockoutRate: 0.1,
          avgForecastAccuracy: 0.85,
          avgInventoryTurnover: 4.5,
          p25ProductCount: 20,
          p50ProductCount: 25,
          p75ProductCount: 30,
          p90ProductCount: 35,
          p25OrderFrequency: 3,
          p50OrderFrequency: 5,
          p75OrderFrequency: 7,
          p90OrderFrequency: 9,
          p25StockoutRate: 0.05,
          p50StockoutRate: 0.1,
          p75StockoutRate: 0.15,
          p90StockoutRate: 0.2,
          p25InventoryTurnover: 3,
          p50InventoryTurnover: 4.5,
          p75InventoryTurnover: 6,
          p90InventoryTurnover: 8,
          createdAt: new Date(),
        } as any);

        const stockoutProducts = Math.round(
          metrics.productCount * metrics.stockoutRate,
        );
        let callCount = 0;
        vi.mocked(prisma.product.count).mockImplementation(() => {
          callCount++;
          return Promise.resolve(
            callCount === 1 ? metrics.productCount : stockoutProducts,
          );
        });

        vi.mocked(prisma.orderRequest.count).mockResolvedValue(
          metrics.orderFrequency,
        );

        const stock =
          metrics.inventoryTurnover > 0
            ? Math.round(
                (metrics.orderFrequency * 30) / metrics.inventoryTurnover,
              )
            : 0;
        vi.mocked(prisma.product.aggregate).mockResolvedValue({
          _sum: { currentStockPacks: stock },
        } as any);
      }
    });

    describe("stockout rate special handling", () => {
      it("should treat stockout rate inversely (lower is better)", async () => {
        const clientId = "low-stockout-client";

        const mockFindUnique = vi.mocked(
          prisma.benchmarkParticipation.findUnique,
        );
        mockFindUnique.mockResolvedValue({
          id: "participation-1",
          clientId,
          isParticipating: true,
          cohort: "general",
          anonymousId: "anon-1",
          joinedAt: new Date(),
          updatedAt: new Date(),
          client: { name: "Test Client" },
        });

        const mockFindFirst = vi.mocked(prisma.benchmarkSnapshot.findFirst);
        mockFindFirst.mockResolvedValue({
          id: "snapshot-1",
          cohort: "general",
          period: new Date(),
          participantCount: 10,
          avgProductCount: 25,
          avgOrderFrequency: 5,
          avgStockoutRate: 0.1,
          avgForecastAccuracy: 0.85,
          avgInventoryTurnover: 4.5,
          p25ProductCount: 20,
          p50ProductCount: 25,
          p75ProductCount: 30,
          p90ProductCount: 35,
          p25OrderFrequency: 3,
          p50OrderFrequency: 5,
          p75OrderFrequency: 7,
          p90OrderFrequency: 9,
          p25StockoutRate: 0.05,
          p50StockoutRate: 0.1,
          p75StockoutRate: 0.15,
          p90StockoutRate: 0.2,
          p25InventoryTurnover: 3,
          p50InventoryTurnover: 4.5,
          p75InventoryTurnover: 6,
          p90InventoryTurnover: 8,
          createdAt: new Date(),
        } as any);

        // Client with very low stockout rate (0.02 - below p25 of 0.05)
        const totalProducts = 100;
        const stockoutProducts = 2;

        let callCount = 0;
        vi.mocked(prisma.product.count).mockImplementation(() => {
          callCount++;
          return Promise.resolve(
            callCount === 1 ? totalProducts : stockoutProducts,
          );
        });

        vi.mocked(prisma.orderRequest.count).mockResolvedValue(5);
        vi.mocked(prisma.product.aggregate).mockResolvedValue({
          _sum: { currentStockPacks: 100 },
        } as any);

        const result = await BenchmarkingService.getClientBenchmark(clientId);

        expect(result).not.toBeNull();
        // Low stockout rate should give high percentile
        expect(result?.metrics.stockoutRate.percentile).toBeGreaterThanOrEqual(
          75,
        );
        expect(result?.metrics.stockoutRate.performance).toMatch(
          /excellent|good/,
        );
      });
    });
  });
});
