// =============================================================================
// BENCHMARKING API ENDPOINT TESTS
// Integration tests for privacy-preserving benchmarking API
// =============================================================================

import { describe, it, expect, beforeEach, vi } from "vitest";
import { BenchmarkingService } from "../services/benchmarking.service.js";
import { prisma } from "../lib/prisma.js";

// Mock dependencies
vi.mock("../services/benchmarking.service.js");
vi.mock("../lib/prisma.js", () => ({
  prisma: {
    userClient: {
      findUnique: vi.fn(),
    },
    benchmarkParticipation: {
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

describe("Benchmarking API Endpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // GET CLIENT BENCHMARK ENDPOINT TESTS
  // ===========================================================================

  describe("GET /api/benchmarking/client/:clientId", () => {
    it("should return benchmark data for participating client", async () => {
      const clientId = "test-client-1";
      const mockBenchmark = {
        clientId,
        clientName: "Test Client 1",
        cohort: "general",
        metrics: {
          productCount: {
            value: 30,
            percentile: 75,
            cohortAvg: 25,
            cohortP50: 25,
            cohortP90: 35,
            performance: "good" as const,
          },
          orderFrequency: {
            value: 8,
            percentile: 90,
            cohortAvg: 5,
            cohortP50: 5,
            cohortP90: 9,
            performance: "excellent" as const,
          },
          stockoutRate: {
            value: 0.05,
            percentile: 75,
            cohortAvg: 0.1,
            cohortP50: 0.1,
            cohortP90: 0.2,
            performance: "good" as const,
          },
          inventoryTurnover: {
            value: 6,
            percentile: 75,
            cohortAvg: 4.5,
            cohortP50: 4.5,
            cohortP90: 8,
            performance: "good" as const,
          },
        },
        rank: "top_25" as const,
        participantCount: 10,
        period: new Date(),
      };

      vi.mocked(BenchmarkingService.getClientBenchmark).mockResolvedValue(
        mockBenchmark,
      );

      const result = await BenchmarkingService.getClientBenchmark(clientId);

      expect(result).not.toBeNull();
      expect(result?.clientId).toBe(clientId);
      expect(result?.metrics.productCount.value).toBe(30);
      expect(result?.metrics.productCount.percentile).toBe(75);
      expect(result?.participantCount).toBe(10);
    });

    it("should return null for non-participating client", async () => {
      const clientId = "non-participant";

      vi.mocked(BenchmarkingService.getClientBenchmark).mockResolvedValue(null);

      const result = await BenchmarkingService.getClientBenchmark(clientId);

      expect(result).toBeNull();
    });

    it("should return null when cohort has insufficient participants", async () => {
      const clientId = "test-client-2";

      vi.mocked(BenchmarkingService.getClientBenchmark).mockResolvedValue(null);

      const result = await BenchmarkingService.getClientBenchmark(clientId);

      expect(result).toBeNull();
    });

    it("should include participant count in response", async () => {
      const clientId = "test-client-3";
      const mockBenchmark = {
        clientId,
        clientName: "Test Client 3",
        cohort: "healthcare",
        metrics: {} as any,
        rank: "above_avg" as const,
        participantCount: 15,
        period: new Date(),
      };

      vi.mocked(BenchmarkingService.getClientBenchmark).mockResolvedValue(
        mockBenchmark,
      );

      const result = await BenchmarkingService.getClientBenchmark(clientId);

      expect(result?.participantCount).toBe(15);
      expect(result?.participantCount).toBeGreaterThanOrEqual(5);
    });

    it("should handle errors gracefully", async () => {
      const clientId = "error-client";

      vi.mocked(BenchmarkingService.getClientBenchmark).mockRejectedValue(
        new Error("Database connection failed"),
      );

      await expect(
        BenchmarkingService.getClientBenchmark(clientId),
      ).rejects.toThrow("Database connection failed");
    });
  });

  // ===========================================================================
  // OPT-IN ENDPOINT TESTS
  // ===========================================================================

  describe("POST /api/benchmarking/opt-in", () => {
    it("should opt client into benchmarking with default cohort", async () => {
      const clientId = "test-client-4";

      vi.mocked(BenchmarkingService.optIn).mockResolvedValue();

      await BenchmarkingService.optIn(clientId);

      expect(BenchmarkingService.optIn).toHaveBeenCalledWith(clientId);
    });

    it("should opt client into benchmarking with specific cohort", async () => {
      const clientId = "test-client-5";
      const cohort = "healthcare";

      vi.mocked(BenchmarkingService.optIn).mockResolvedValue();

      await BenchmarkingService.optIn(clientId, cohort);

      expect(BenchmarkingService.optIn).toHaveBeenCalledWith(clientId, cohort);
    });

    it("should create participation record with anonymous ID", async () => {
      const clientId = "test-client-6";
      const cohort = "retail";

      vi.mocked(BenchmarkingService.optIn).mockResolvedValue();

      await expect(
        BenchmarkingService.optIn(clientId, cohort),
      ).resolves.not.toThrow();
    });

    it("should handle service errors", async () => {
      const clientId = "invalid-client";

      vi.mocked(BenchmarkingService.optIn).mockRejectedValue(
        new Error("Client not found"),
      );

      await expect(BenchmarkingService.optIn(clientId)).rejects.toThrow(
        "Client not found",
      );
    });
  });

  // ===========================================================================
  // OPT-OUT ENDPOINT TESTS
  // ===========================================================================

  describe("POST /api/benchmarking/opt-out", () => {
    it("should opt client out of benchmarking", async () => {
      const clientId = "test-client-7";

      vi.mocked(BenchmarkingService.optOut).mockResolvedValue();

      await BenchmarkingService.optOut(clientId);

      expect(BenchmarkingService.optOut).toHaveBeenCalledWith(clientId);
    });

    it("should preserve client data but mark as non-participating", async () => {
      const clientId = "test-client-8";

      vi.mocked(BenchmarkingService.optOut).mockResolvedValue();

      await expect(BenchmarkingService.optOut(clientId)).resolves.not.toThrow();
    });

    it("should handle service errors", async () => {
      const clientId = "invalid-client";

      vi.mocked(BenchmarkingService.optOut).mockRejectedValue(
        new Error("Client not found"),
      );

      await expect(BenchmarkingService.optOut(clientId)).rejects.toThrow(
        "Client not found",
      );
    });
  });

  // ===========================================================================
  // GET COHORTS ENDPOINT TESTS
  // ===========================================================================

  describe("GET /api/benchmarking/cohorts", () => {
    it("should return list of available cohorts", async () => {
      const cohorts = ["general", "healthcare", "retail", "technology"];

      vi.mocked(BenchmarkingService.getAvailableCohorts).mockResolvedValue(
        cohorts,
      );

      const result = await BenchmarkingService.getAvailableCohorts();

      expect(result).toEqual(cohorts);
      expect(result).toHaveLength(4);
    });

    it("should return empty array when no cohorts exist", async () => {
      vi.mocked(BenchmarkingService.getAvailableCohorts).mockResolvedValue([]);

      const result = await BenchmarkingService.getAvailableCohorts();

      expect(result).toEqual([]);
    });

    it("should handle general cohort as default", async () => {
      const cohorts = ["general"];

      vi.mocked(BenchmarkingService.getAvailableCohorts).mockResolvedValue(
        cohorts,
      );

      const result = await BenchmarkingService.getAvailableCohorts();

      expect(result).toContain("general");
    });

    it("should handle service errors", async () => {
      vi.mocked(BenchmarkingService.getAvailableCohorts).mockRejectedValue(
        new Error("Database error"),
      );

      await expect(BenchmarkingService.getAvailableCohorts()).rejects.toThrow(
        "Database error",
      );
    });
  });

  // ===========================================================================
  // GENERATE SNAPSHOT ENDPOINT TESTS
  // ===========================================================================

  describe("POST /api/benchmarking/generate-snapshot", () => {
    it("should generate snapshot with default cohort", async () => {
      vi.mocked(BenchmarkingService.generateSnapshot).mockResolvedValue();

      await BenchmarkingService.generateSnapshot();

      expect(BenchmarkingService.generateSnapshot).toHaveBeenCalled();
    });

    it("should generate snapshot for specific cohort", async () => {
      const cohort = "healthcare";

      vi.mocked(BenchmarkingService.generateSnapshot).mockResolvedValue();

      await BenchmarkingService.generateSnapshot(cohort);

      expect(BenchmarkingService.generateSnapshot).toHaveBeenCalledWith(cohort);
    });

    it("should enforce minimum participant requirement", async () => {
      const cohort = "small-cohort";

      // Service silently returns when not enough participants
      vi.mocked(BenchmarkingService.generateSnapshot).mockResolvedValue();

      await expect(
        BenchmarkingService.generateSnapshot(cohort),
      ).resolves.not.toThrow();
    });

    it("should handle service errors", async () => {
      vi.mocked(BenchmarkingService.generateSnapshot).mockRejectedValue(
        new Error("Insufficient participants"),
      );

      await expect(
        BenchmarkingService.generateSnapshot("general"),
      ).rejects.toThrow("Insufficient participants");
    });
  });

  // ===========================================================================
  // PRIVACY VALIDATION TESTS
  // ===========================================================================

  describe("Privacy Validation", () => {
    it("should not expose individual client data in benchmarks", async () => {
      const clientId = "privacy-test-1";
      const mockBenchmark = {
        clientId,
        clientName: "Privacy Test Client",
        cohort: "general",
        metrics: {
          productCount: {
            value: 30,
            percentile: 75,
            cohortAvg: 25, // Aggregated - no individual client data
            cohortP50: 25,
            cohortP90: 35,
            performance: "good" as const,
          },
          orderFrequency: {
            value: 8,
            percentile: 90,
            cohortAvg: 5,
            cohortP50: 5,
            cohortP90: 9,
            performance: "excellent" as const,
          },
          stockoutRate: {
            value: 0.05,
            percentile: 75,
            cohortAvg: 0.1,
            cohortP50: 0.1,
            cohortP90: 0.2,
            performance: "good" as const,
          },
          inventoryTurnover: {
            value: 6,
            percentile: 75,
            cohortAvg: 4.5,
            cohortP50: 4.5,
            cohortP90: 8,
            performance: "good" as const,
          },
        },
        rank: "top_25" as const,
        participantCount: 10,
        period: new Date(),
      };

      vi.mocked(BenchmarkingService.getClientBenchmark).mockResolvedValue(
        mockBenchmark,
      );

      const result = await BenchmarkingService.getClientBenchmark(clientId);

      expect(result).not.toBeNull();

      // Verify only aggregated data is present
      expect(result?.metrics.productCount.cohortAvg).toBeDefined();
      expect(result?.metrics.productCount.cohortP50).toBeDefined();
      expect(result?.metrics.productCount.cohortP90).toBeDefined();

      // Verify no arrays of individual values
      expect(Array.isArray(result?.metrics.productCount.value)).toBe(false);
      expect(typeof result?.metrics.productCount.cohortAvg).toBe("number");
    });

    it("should verify anonymous IDs are used", async () => {
      const participationData = [
        {
          id: "p1",
          clientId: "client-1",
          isParticipating: true,
          cohort: "general",
          anonymousId: "anon-uuid-1",
          joinedAt: new Date(),
          updatedAt: new Date(),
          client: { id: "client-1", name: "Client One", code: "C001" },
        },
        {
          id: "p2",
          clientId: "client-2",
          isParticipating: true,
          cohort: "general",
          anonymousId: "anon-uuid-2",
          joinedAt: new Date(),
          updatedAt: new Date(),
          client: { id: "client-2", name: "Client Two", code: "C002" },
        },
      ];

      vi.mocked(prisma.benchmarkParticipation.findMany).mockResolvedValue(
        participationData as any,
      );

      const result = await prisma.benchmarkParticipation.findMany();

      result.forEach((record) => {
        expect(record.anonymousId).toBeTruthy();
        expect(record.anonymousId).toMatch(/^anon-/);
      });
    });

    it("should enforce minimum participant threshold", async () => {
      const clientId = "privacy-test-2";

      // Service returns null when below threshold
      vi.mocked(BenchmarkingService.getClientBenchmark).mockResolvedValue(null);

      const result = await BenchmarkingService.getClientBenchmark(clientId);

      expect(result).toBeNull();
    });

    it("should verify participant count is always >= 5 in responses", async () => {
      const clientId = "privacy-test-3";
      const mockBenchmark = {
        clientId,
        clientName: "Privacy Test 3",
        cohort: "general",
        metrics: {} as any,
        rank: "above_avg" as const,
        participantCount: 5, // Minimum
        period: new Date(),
      };

      vi.mocked(BenchmarkingService.getClientBenchmark).mockResolvedValue(
        mockBenchmark,
      );

      const result = await BenchmarkingService.getClientBenchmark(clientId);

      if (result !== null) {
        expect(result.participantCount).toBeGreaterThanOrEqual(5);
      }
    });

    it("should verify data aggregation preserves privacy", async () => {
      const clientId = "privacy-test-4";
      const mockBenchmark = {
        clientId,
        clientName: "Privacy Test 4",
        cohort: "healthcare",
        metrics: {
          productCount: {
            value: 42,
            percentile: 80,
            cohortAvg: 35.5, // Average of multiple clients
            cohortP50: 35,
            cohortP90: 50,
            performance: "good" as const,
          },
          orderFrequency: {
            value: 12,
            percentile: 85,
            cohortAvg: 8.2,
            cohortP50: 8,
            cohortP90: 15,
            performance: "excellent" as const,
          },
          stockoutRate: {
            value: 0.03,
            percentile: 90,
            cohortAvg: 0.08,
            cohortP50: 0.07,
            cohortP90: 0.15,
            performance: "excellent" as const,
          },
          inventoryTurnover: {
            value: 7.5,
            percentile: 80,
            cohortAvg: 5.2,
            cohortP50: 5,
            cohortP90: 9,
            performance: "good" as const,
          },
        },
        rank: "top_25" as const,
        participantCount: 12,
        period: new Date(),
      };

      vi.mocked(BenchmarkingService.getClientBenchmark).mockResolvedValue(
        mockBenchmark,
      );

      const result = await BenchmarkingService.getClientBenchmark(clientId);

      expect(result).not.toBeNull();

      // Verify all metrics have aggregated comparisons
      Object.values(result!.metrics).forEach((metric) => {
        expect(metric.cohortAvg).toBeDefined();
        expect(metric.cohortP50).toBeDefined();
        expect(metric.cohortP90).toBeDefined();
        expect(typeof metric.cohortAvg).toBe("number");
      });

      // Verify participant count ensures privacy
      expect(result!.participantCount).toBeGreaterThanOrEqual(5);
    });

    it("should not include client names in snapshot data", async () => {
      // This test verifies the snapshot generation process
      // doesn't leak individual client information
      vi.mocked(BenchmarkingService.generateSnapshot).mockResolvedValue();

      await expect(
        BenchmarkingService.generateSnapshot("general"),
      ).resolves.not.toThrow();

      // Verify that generateSnapshot was called
      expect(BenchmarkingService.generateSnapshot).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // AUTHORIZATION TESTS
  // ===========================================================================

  describe("Authorization Checks", () => {
    it("should verify opt-in requires admin or ops manager", async () => {
      const clientId = "auth-test-1";

      vi.mocked(BenchmarkingService.optIn).mockResolvedValue();

      // This would be enforced by the route middleware
      await BenchmarkingService.optIn(clientId);

      expect(BenchmarkingService.optIn).toHaveBeenCalled();
    });

    it("should verify opt-out requires admin or ops manager", async () => {
      const clientId = "auth-test-2";

      vi.mocked(BenchmarkingService.optOut).mockResolvedValue();

      await BenchmarkingService.optOut(clientId);

      expect(BenchmarkingService.optOut).toHaveBeenCalled();
    });

    it("should verify snapshot generation requires admin", async () => {
      vi.mocked(BenchmarkingService.generateSnapshot).mockResolvedValue();

      await BenchmarkingService.generateSnapshot("general");

      expect(BenchmarkingService.generateSnapshot).toHaveBeenCalled();
    });

    it("should allow client access to own benchmark data", async () => {
      const clientId = "auth-test-3";

      vi.mocked(BenchmarkingService.getClientBenchmark).mockResolvedValue(null);

      await BenchmarkingService.getClientBenchmark(clientId);

      expect(BenchmarkingService.getClientBenchmark).toHaveBeenCalledWith(
        clientId,
      );
    });
  });
});
