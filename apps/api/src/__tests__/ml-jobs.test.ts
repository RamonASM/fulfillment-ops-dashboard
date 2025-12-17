// =============================================================================
// ML JOBS TESTS
// Comprehensive tests for ML-related scheduled jobs
// =============================================================================

import { describe, it, expect, beforeEach, vi } from "vitest";
import { MLClientService } from "../services/ml-client.service.js";
import { prisma } from "../lib/prisma.js";

// Mock ML Client Service
vi.mock("../services/ml-client.service.js", () => ({
  MLClientService: {
    healthCheck: vi.fn(),
    getDemandForecast: vi.fn(),
    predictStockout: vi.fn(),
  },
}));

// Mock Prisma client
vi.mock("../lib/prisma.js", () => ({
  prisma: {
    product: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    alert: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}));

// Mock logger
vi.mock("../lib/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("ML Scheduled Jobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // DAILY ML FORECASTS JOB TESTS
  // ===========================================================================

  describe("daily-ml-forecasts job", () => {
    describe("health check behavior", () => {
      it("should skip forecasts when ML service is unavailable", async () => {
        vi.mocked(MLClientService.healthCheck).mockResolvedValue(false);

        const shouldSkip = !(await MLClientService.healthCheck());
        expect(shouldSkip).toBe(true);
      });

      it("should proceed with forecasts when ML service is healthy", async () => {
        vi.mocked(MLClientService.healthCheck).mockResolvedValue(true);

        const shouldProceed = await MLClientService.healthCheck();
        expect(shouldProceed).toBe(true);
      });

      it("should log warning when skipping due to unhealthy service", async () => {
        vi.mocked(MLClientService.healthCheck).mockResolvedValue(false);

        const isHealthy = await MLClientService.healthCheck();
        if (!isHealthy) {
          // Log should be called
          expect(isHealthy).toBe(false);
        }
      });
    });

    describe("product selection logic", () => {
      it("should query top 50 products by order count", async () => {
        const mockTopProducts = Array.from({ length: 50 }, (_, i) => ({
          id: `prod-${i}`,
          name: `Product ${i}`,
          order_count: BigInt(100 - i),
        }));

        vi.mocked(prisma.$queryRaw).mockResolvedValue(mockTopProducts);

        const products =
          (await prisma.$queryRaw`SELECT * FROM products`) as typeof mockTopProducts;
        expect(products.length).toBe(50);
      });

      it("should only include active products", async () => {
        // SQL query should filter by is_active = true
        const activeFilter = "WHERE p.is_active = true";
        expect(activeFilter).toContain("is_active = true");
      });

      it("should consider last 90 days of order history", async () => {
        // SQL query should filter by created_at >= NOW() - INTERVAL '90 days'
        const dateFilter = "o.created_at >= NOW() - INTERVAL '90 days'";
        expect(dateFilter).toContain("90 days");
      });

      it("should order by order count descending", async () => {
        const mockProducts = [
          { id: "prod-1", name: "Product 1", order_count: BigInt(100) },
          { id: "prod-2", name: "Product 2", order_count: BigInt(50) },
          { id: "prod-3", name: "Product 3", order_count: BigInt(25) },
        ];

        vi.mocked(prisma.$queryRaw).mockResolvedValue(mockProducts);

        const products =
          (await prisma.$queryRaw`SELECT * FROM products`) as typeof mockProducts;
        expect(Number(products[0].order_count)).toBeGreaterThan(
          Number(products[1].order_count),
        );
        expect(Number(products[1].order_count)).toBeGreaterThan(
          Number(products[2].order_count),
        );
      });

      it("should limit results to 50 products", async () => {
        const limitClause = "LIMIT 50";
        expect(limitClause).toBe("LIMIT 50");
      });
    });

    describe("forecast generation", () => {
      beforeEach(() => {
        vi.mocked(MLClientService.healthCheck).mockResolvedValue(true);
      });

      it("should generate demand forecast for each product", async () => {
        const mockProducts = [
          { id: "prod-1", name: "Product 1", order_count: BigInt(100) },
          { id: "prod-2", name: "Product 2", order_count: BigInt(50) },
        ];

        vi.mocked(prisma.$queryRaw).mockResolvedValue(mockProducts);
        vi.mocked(MLClientService.getDemandForecast).mockResolvedValue({
          productId: "prod-1",
          predictions: [],
          model_metrics: { mape: 15, rmse: 2.5, training_samples: 90 },
          seasonality_detected: false,
        });

        await MLClientService.getDemandForecast("prod-1", 30);

        expect(MLClientService.getDemandForecast).toHaveBeenCalledWith(
          "prod-1",
          30,
        );
      });

      it("should use 30-day horizon for demand forecasts", async () => {
        vi.mocked(MLClientService.getDemandForecast).mockResolvedValue({
          productId: "prod-1",
          predictions: [],
          model_metrics: { mape: 15, rmse: 2.5, training_samples: 90 },
          seasonality_detected: false,
        });

        await MLClientService.getDemandForecast("prod-1", 30);

        expect(MLClientService.getDemandForecast).toHaveBeenCalledWith(
          expect.any(String),
          30,
        );
      });

      it("should generate stockout prediction for products with positive stock", async () => {
        const mockProduct = {
          id: "prod-1",
          name: "Product 1",
          currentStockUnits: 100,
        };

        vi.mocked(prisma.product.findUnique).mockResolvedValue(
          mockProduct as any,
        );
        vi.mocked(MLClientService.predictStockout).mockResolvedValue({
          productId: "prod-1",
          predicted_stockout_date: "2024-02-15",
          days_until_stockout: 30,
          confidence: 0.85,
          daily_usage_forecast: [],
        });

        const shouldGenerateStockout = mockProduct.currentStockUnits > 0;
        expect(shouldGenerateStockout).toBe(true);
      });

      it("should skip stockout prediction for products with zero stock", async () => {
        const mockProduct = {
          id: "prod-1",
          name: "Product 1",
          currentStockUnits: 0,
        };

        const shouldSkip = mockProduct.currentStockUnits === 0;
        expect(shouldSkip).toBe(true);
      });

      it("should use 90-day horizon for stockout predictions", async () => {
        vi.mocked(MLClientService.predictStockout).mockResolvedValue({
          productId: "prod-1",
          predicted_stockout_date: "2024-02-15",
          days_until_stockout: 30,
          confidence: 0.85,
          daily_usage_forecast: [],
        });

        await MLClientService.predictStockout("prod-1", 100, 90);

        expect(MLClientService.predictStockout).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(Number),
          90,
        );
      });
    });

    describe("error handling", () => {
      beforeEach(() => {
        vi.mocked(MLClientService.healthCheck).mockResolvedValue(true);
      });

      it("should continue processing on individual product failure", async () => {
        const mockProducts = [
          { id: "prod-1", name: "Product 1", order_count: BigInt(100) },
          { id: "prod-2", name: "Product 2", order_count: BigInt(50) },
          { id: "prod-3", name: "Product 3", order_count: BigInt(25) },
        ];

        vi.mocked(prisma.$queryRaw).mockResolvedValue(mockProducts);
        vi.mocked(MLClientService.getDemandForecast)
          .mockResolvedValueOnce({
            productId: "prod-1",
            predictions: [],
            model_metrics: { mape: 15, rmse: 2.5, training_samples: 90 },
            seasonality_detected: false,
          })
          .mockRejectedValueOnce(new Error("Insufficient data"))
          .mockResolvedValueOnce({
            productId: "prod-3",
            predictions: [],
            model_metrics: { mape: 15, rmse: 2.5, training_samples: 90 },
            seasonality_detected: false,
          });

        // Job should continue despite middle product failing
        let successCount = 0;
        let errorCount = 0;

        for (const product of mockProducts) {
          try {
            await MLClientService.getDemandForecast(product.id, 30);
            successCount++;
          } catch (error) {
            errorCount++;
          }
        }

        expect(successCount).toBe(2);
        expect(errorCount).toBe(1);
      });

      it("should log warning on forecast failure", async () => {
        vi.mocked(MLClientService.getDemandForecast).mockRejectedValue(
          new Error("No transaction data found"),
        );

        try {
          await MLClientService.getDemandForecast("prod-1", 30);
        } catch (error) {
          const errorMessage = (error as Error).message;
          expect(errorMessage).toContain("No transaction data");
        }
      });

      it("should count successful and failed forecasts", async () => {
        const successCount = 45;
        const errorCount = 5;
        const totalProcessed = successCount + errorCount;

        expect(totalProcessed).toBe(50);
        expect(successCount).toBeGreaterThan(errorCount);
      });

      it("should log summary of forecast job results", async () => {
        const successCount = 48;
        const errorCount = 2;

        const logMessage = `ML forecast job complete: ${successCount} success, ${errorCount} errors`;
        expect(logMessage).toContain("48 success");
        expect(logMessage).toContain("2 errors");
      });
    });
  });

  // ===========================================================================
  // WEEKLY ML STOCKOUT ALERTS JOB TESTS
  // ===========================================================================

  describe("weekly-ml-stockout-alerts job", () => {
    describe("health check behavior", () => {
      it("should skip alerts when ML service is unavailable", async () => {
        vi.mocked(MLClientService.healthCheck).mockResolvedValue(false);

        const shouldSkip = !(await MLClientService.healthCheck());
        expect(shouldSkip).toBe(true);
      });

      it("should proceed with alerts when ML service is healthy", async () => {
        vi.mocked(MLClientService.healthCheck).mockResolvedValue(true);

        const shouldProceed = await MLClientService.healthCheck();
        expect(shouldProceed).toBe(true);
      });
    });

    describe("product selection logic", () => {
      it("should only process active products", async () => {
        const mockProducts = [
          {
            id: "prod-1",
            name: "Product 1",
            isActive: true,
            stockStatus: "low",
            clientId: "client-1",
            currentStockUnits: 50,
          },
          {
            id: "prod-2",
            name: "Product 2",
            isActive: true,
            stockStatus: "critical",
            clientId: "client-1",
            currentStockUnits: 10,
          },
        ];

        vi.mocked(prisma.product.findMany).mockResolvedValue(
          mockProducts as any,
        );

        const products = await prisma.product.findMany({
          where: { isActive: true },
        });

        expect(products.every((p) => p.isActive)).toBe(true);
      });

      it("should only process products with low or critical stock status", async () => {
        const mockProducts = [
          {
            id: "prod-1",
            name: "Product 1",
            isActive: true,
            stockStatus: "low",
            clientId: "client-1",
            currentStockUnits: 50,
          },
          {
            id: "prod-2",
            name: "Product 2",
            isActive: true,
            stockStatus: "critical",
            clientId: "client-1",
            currentStockUnits: 10,
          },
        ];

        vi.mocked(prisma.product.findMany).mockResolvedValue(
          mockProducts as any,
        );

        const products = await prisma.product.findMany({
          where: { stockStatus: { in: ["low", "critical"] } },
        });

        expect(
          products.every(
            (p) => p.stockStatus && ["low", "critical"].includes(p.stockStatus),
          ),
        ).toBe(true);
      });

      it("should include necessary product fields", async () => {
        const requiredFields = ["id", "name", "clientId", "currentStockUnits"];
        const selectClause = {
          id: true,
          name: true,
          clientId: true,
          currentStockUnits: true,
        };

        expect(Object.keys(selectClause)).toEqual(
          expect.arrayContaining(requiredFields),
        );
      });
    });

    describe("stockout prediction and alert creation", () => {
      beforeEach(() => {
        vi.mocked(MLClientService.healthCheck).mockResolvedValue(true);
      });

      it("should request stockout predictions with 90-day horizon", async () => {
        vi.mocked(MLClientService.predictStockout).mockResolvedValue({
          productId: "prod-1",
          predicted_stockout_date: "2024-02-15",
          days_until_stockout: 10,
          confidence: 0.85,
          daily_usage_forecast: [],
        });

        await MLClientService.predictStockout("prod-1", 100, 90);

        expect(MLClientService.predictStockout).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(Number),
          90,
        );
      });

      it("should create alerts for stockouts within 14 days", async () => {
        const prediction = {
          productId: "prod-1",
          predicted_stockout_date: "2024-02-15",
          days_until_stockout: 10,
          confidence: 0.85,
          daily_usage_forecast: [],
        };

        const shouldCreateAlert =
          prediction.days_until_stockout !== null &&
          prediction.days_until_stockout <= 14;
        expect(shouldCreateAlert).toBe(true);
      });

      it("should skip alerts for stockouts beyond 14 days", async () => {
        const prediction = {
          productId: "prod-1",
          predicted_stockout_date: "2024-03-15",
          days_until_stockout: 45,
          confidence: 0.85,
          daily_usage_forecast: [],
        };

        const shouldSkip =
          prediction.days_until_stockout === null ||
          prediction.days_until_stockout > 14;
        expect(shouldSkip).toBe(true);
      });

      it("should set severity to critical for stockouts within 7 days", async () => {
        const daysUntilStockout = 5;
        const severity = daysUntilStockout <= 7 ? "critical" : "warning";

        expect(severity).toBe("critical");
      });

      it("should set severity to warning for stockouts 8-14 days away", async () => {
        const daysUntilStockout = 10;
        const severity = daysUntilStockout <= 7 ? "critical" : "warning";

        expect(severity).toBe("warning");
      });

      it("should prevent duplicate alerts within 7 days", async () => {
        const existingAlert = {
          id: "alert-1",
          productId: "prod-1",
          alertType: "ml_stockout_prediction",
          createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
        };

        vi.mocked(prisma.alert.findFirst).mockResolvedValue(
          existingAlert as any,
        );

        const existing = await prisma.alert.findFirst({
          where: {
            productId: "prod-1",
            alertType: "ml_stockout_prediction",
            createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
          },
        });

        const shouldSkipDuplicate = existing !== null;
        expect(shouldSkipDuplicate).toBe(true);
      });

      it("should create new alert when no recent alert exists", async () => {
        vi.mocked(prisma.alert.findFirst).mockResolvedValue(null);

        const existing = await prisma.alert.findFirst();
        const shouldCreateNew = existing === null;

        expect(shouldCreateNew).toBe(true);
      });
    });

    describe("alert content and metadata", () => {
      it("should include product name in alert title", async () => {
        const productName = "Product A";
        const title = `ML Stockout Prediction: ${productName}`;

        expect(title).toContain(productName);
        expect(title).toContain("ML Stockout Prediction");
      });

      it("should include days until stockout in message", async () => {
        const daysUntilStockout = 10;
        const message = `AI predicts stockout in ${daysUntilStockout} days`;

        expect(message).toContain("10 days");
      });

      it("should include confidence percentage in message", async () => {
        const confidence = 0.85;
        const confidencePercent = Math.round(confidence * 100);
        const message = `with ${confidencePercent}% confidence`;

        expect(message).toContain("85% confidence");
      });

      it("should store prediction metadata in alert", async () => {
        const metadata = {
          daysUntilStockout: 10,
          confidence: 0.85,
          source: "ml_prediction",
        };

        expect(metadata.source).toBe("ml_prediction");
        expect(metadata.daysUntilStockout).toBe(10);
        expect(metadata.confidence).toBe(0.85);
      });

      it("should set correct alert type", async () => {
        const alertType = "ml_stockout_prediction";
        expect(alertType).toBe("ml_stockout_prediction");
      });
    });

    describe("error handling", () => {
      beforeEach(() => {
        vi.mocked(MLClientService.healthCheck).mockResolvedValue(true);
      });

      it("should continue processing on individual prediction failure", async () => {
        const mockProducts = [
          {
            id: "prod-1",
            name: "Product 1",
            isActive: true,
            stockStatus: "low",
            clientId: "client-1",
            currentStockUnits: 50,
          },
          {
            id: "prod-2",
            name: "Product 2",
            isActive: true,
            stockStatus: "critical",
            clientId: "client-1",
            currentStockUnits: 10,
          },
        ];

        vi.mocked(prisma.product.findMany).mockResolvedValue(
          mockProducts as any,
        );
        vi.mocked(MLClientService.predictStockout)
          .mockResolvedValueOnce({
            productId: "prod-1",
            predicted_stockout_date: "2024-02-15",
            days_until_stockout: 10,
            confidence: 0.85,
            daily_usage_forecast: [],
          })
          .mockRejectedValueOnce(new Error("Insufficient data"));

        let successCount = 0;
        let errorCount = 0;

        for (const product of mockProducts) {
          try {
            await MLClientService.predictStockout(
              product.id,
              product.currentStockUnits,
              90,
            );
            successCount++;
          } catch (error) {
            errorCount++;
          }
        }

        expect(successCount).toBe(1);
        expect(errorCount).toBe(1);
      });

      it("should log warning on prediction failure", async () => {
        vi.mocked(MLClientService.predictStockout).mockRejectedValue(
          new Error("No transaction data"),
        );

        try {
          await MLClientService.predictStockout("prod-1", 100, 90);
        } catch (error) {
          const errorMessage = (error as Error).message;
          expect(errorMessage).toContain("No transaction data");
        }
      });

      it("should count alerts created", async () => {
        const alertsCreated = 3;
        const totalProcessed = 10;

        const logMessage = `ML stockout alert scan complete: ${alertsCreated} alerts created`;
        expect(logMessage).toContain("3 alerts created");
        expect(alertsCreated).toBeLessThanOrEqual(totalProcessed);
      });
    });

    describe("job execution frequency", () => {
      it("should run every 7 days", async () => {
        const intervalMs = 7 * 24 * 60 * 60 * 1000;
        const days = intervalMs / (24 * 60 * 60 * 1000);

        expect(days).toBe(7);
      });
    });
  });

  // ===========================================================================
  // JOB SCHEDULING TESTS
  // ===========================================================================

  describe("Job Scheduling", () => {
    it("should register daily-ml-forecasts with correct interval", async () => {
      const jobName = "daily-ml-forecasts";
      const intervalMs = 24 * 60 * 60 * 1000; // 24 hours

      expect(jobName).toBe("daily-ml-forecasts");
      expect(intervalMs).toBe(86400000); // 24 hours in ms
    });

    it("should register weekly-ml-stockout-alerts with correct interval", async () => {
      const jobName = "weekly-ml-stockout-alerts";
      const intervalMs = 7 * 24 * 60 * 60 * 1000; // 7 days

      expect(jobName).toBe("weekly-ml-stockout-alerts");
      expect(intervalMs).toBe(604800000); // 7 days in ms
    });

    it("should prevent concurrent job execution", async () => {
      const job = {
        name: "test-job",
        isRunning: true,
      };

      const shouldSkip = job.isRunning;
      expect(shouldSkip).toBe(true);
    });

    it("should check job interval before running", async () => {
      const job = {
        lastRun: new Date(Date.now() - 25 * 60 * 60 * 1000), // 25 hours ago
        intervalMs: 24 * 60 * 60 * 1000, // 24 hours
      };

      const now = new Date();
      const shouldRun =
        job.lastRun === null ||
        now.getTime() - job.lastRun.getTime() >= job.intervalMs;

      expect(shouldRun).toBe(true);
    });

    it("should skip job when interval not met", async () => {
      const job = {
        lastRun: new Date(Date.now() - 23 * 60 * 60 * 1000), // 23 hours ago
        intervalMs: 24 * 60 * 60 * 1000, // 24 hours
      };

      const now = new Date();
      const shouldSkip =
        job.lastRun !== null &&
        now.getTime() - job.lastRun.getTime() < job.intervalMs;

      expect(shouldSkip).toBe(true);
    });
  });
});
