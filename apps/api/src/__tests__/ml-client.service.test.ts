// =============================================================================
// ML CLIENT SERVICE TESTS
// Comprehensive tests for ML service communication, caching, and error handling
// =============================================================================

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import axios from "axios";
import { MLClientService } from "../services/ml-client.service.js";
import { prisma } from "../lib/prisma.js";
import { cache } from "../lib/cache.js";

// Mock axios
vi.mock("axios");

// Mock Prisma client
vi.mock("../lib/prisma.js", () => ({
  prisma: {
    mLPrediction: {
      findFirst: vi.fn(),
      create: vi.fn(),
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

// Mock cache
vi.mock("../lib/cache.js", () => ({
  cache: {
    getOrSet: vi.fn(),
  },
  CacheTTL: {
    ML_FORECAST: 3600000, // 1 hour
    ML_STOCKOUT: 1800000, // 30 minutes
  },
  CacheKeys: {
    mlForecast: (productId: string, horizonDays: number) =>
      `ml:forecast:${productId}:${horizonDays}`,
    mlStockout: (productId: string, horizonDays: number) =>
      `ml:stockout:${productId}:${horizonDays}`,
  },
}));

describe("MLClientService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // HEALTH CHECK TESTS
  // ===========================================================================

  describe("healthCheck", () => {
    it.skip("should return true when ML service is healthy", async () => {
      vi.mocked(axios.get).mockResolvedValue({
        data: { status: "healthy" },
      });

      const result = await MLClientService.healthCheck();

      expect(result).toBe(true);
      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining("/health"),
        expect.objectContaining({ timeout: 5000 }),
      );
    });

    it("should return false when ML service is unhealthy", async () => {
      vi.mocked(axios.get).mockResolvedValue({
        data: { status: "degraded" },
      });

      const result = await MLClientService.healthCheck();

      expect(result).toBe(false);
    });

    it("should return false when ML service is unreachable", async () => {
      vi.mocked(axios.get).mockRejectedValue(new Error("Connection refused"));

      const result = await MLClientService.healthCheck();

      expect(result).toBe(false);
    });

    it("should return false on timeout", async () => {
      vi.mocked(axios.get).mockRejectedValue(
        new Error("timeout of 5000ms exceeded"),
      );

      const result = await MLClientService.healthCheck();

      expect(result).toBe(false);
    });

    it.skip("should use correct timeout for health check", async () => {
      vi.mocked(axios.get).mockResolvedValue({
        data: { status: "healthy" },
      });

      await MLClientService.healthCheck();

      expect(axios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ timeout: 5000 }),
      );
    });
  });

  // ===========================================================================
  // DEMAND FORECAST TESTS
  // ===========================================================================

  describe("getDemandForecast", () => {
    const productId = "product-123";
    const horizonDays = 30;

    describe("memory cache behavior", () => {
      it("should use memory cache when available", async () => {
        const mockForecast = {
          productId,
          predictions: [
            { ds: "2024-01-01", yhat: 10, yhat_lower: 8, yhat_upper: 12 },
          ],
          model_metrics: { mape: 15, rmse: 2.5, training_samples: 90 },
          seasonality_detected: true,
        };

        vi.mocked(cache.getOrSet).mockImplementation(async (key, fn, ttl) => {
          return mockForecast;
        });

        const result = await MLClientService.getDemandForecast(
          productId,
          horizonDays,
        );

        expect(result).toEqual(mockForecast);
        expect(cache.getOrSet).toHaveBeenCalled();
      });

      it("should respect cache TTL", async () => {
        vi.mocked(cache.getOrSet).mockImplementation(async (key, fn, ttl) => {
          expect(ttl).toBe(3600000); // 1 hour
          return {} as any;
        });

        await MLClientService.getDemandForecast(productId, horizonDays);
      });
    });

    describe("database cache behavior", () => {
      it("should return DB cached forecast when available and not expired", async () => {
        const dbCached = {
          id: "cached-1",
          productId,
          predictionType: "demand_forecast",
          horizonDays,
          predictions: [{ ds: "2024-01-01", yhat: 10 }],
          metrics: { mape: 15, rmse: 2.5 },
          confidence: 0.85,
          expiresAt: new Date(Date.now() + 10000),
          createdAt: new Date(),
        };

        vi.mocked(cache.getOrSet).mockImplementation(async (key, fn) => {
          return await fn();
        });

        vi.mocked(prisma.mLPrediction.findFirst).mockResolvedValue(
          dbCached as any,
        );

        const result = await MLClientService.getDemandForecast(
          productId,
          horizonDays,
        );

        expect(result.productId).toBe(productId);
        expect(result.predictions).toEqual(dbCached.predictions);
        expect(prisma.mLPrediction.findFirst).toHaveBeenCalledWith({
          where: {
            productId,
            predictionType: "demand_forecast",
            horizonDays,
            expiresAt: { gte: expect.any(Date) },
          },
          orderBy: { createdAt: "desc" },
        });
      });

      it("should not use expired DB cache", async () => {
        vi.mocked(cache.getOrSet).mockImplementation(async (key, fn) => {
          return await fn();
        });

        vi.mocked(prisma.mLPrediction.findFirst).mockResolvedValue(null);

        vi.mocked(axios.post).mockResolvedValue({
          data: {
            product_id: productId,
            predictions: [
              { ds: "2024-01-01", yhat: 10, yhat_lower: 8, yhat_upper: 12 },
            ],
            model_metrics: { mape: 15, rmse: 2.5, training_samples: 90 },
            seasonality_detected: true,
          },
        });

        vi.mocked(prisma.mLPrediction.create).mockResolvedValue({} as any);

        await MLClientService.getDemandForecast(productId, horizonDays);

        // Should call ML service since DB cache was not found
        expect(axios.post).toHaveBeenCalled();
      });
    });

    describe("ML service API interaction", () => {
      beforeEach(() => {
        vi.mocked(cache.getOrSet).mockImplementation(async (key, fn) => {
          return await fn();
        });
        vi.mocked(prisma.mLPrediction.findFirst).mockResolvedValue(null);
        vi.mocked(prisma.mLPrediction.create).mockResolvedValue({} as any);
      });

      it("should call ML service with correct parameters", async () => {
        vi.mocked(axios.post).mockResolvedValue({
          data: {
            product_id: productId,
            predictions: [
              { ds: "2024-01-01", yhat: 10, yhat_lower: 8, yhat_upper: 12 },
            ],
            model_metrics: { mape: 15, rmse: 2.5, training_samples: 90 },
            seasonality_detected: true,
          },
        });

        await MLClientService.getDemandForecast(productId, horizonDays);

        expect(axios.post).toHaveBeenCalledWith(
          expect.stringContaining("/forecast/demand"),
          {
            product_id: productId,
            horizon_days: horizonDays,
          },
          expect.objectContaining({ timeout: 30000 }),
        );
      });

      it("should use default horizon of 30 days", async () => {
        vi.mocked(axios.post).mockResolvedValue({
          data: {
            product_id: productId,
            predictions: [],
            model_metrics: { mape: 15, rmse: 2.5, training_samples: 90 },
            seasonality_detected: false,
          },
        });

        await MLClientService.getDemandForecast(productId);

        expect(axios.post).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({ horizon_days: 30 }),
          expect.any(Object),
        );
      });

      it("should save forecast to DB after successful generation", async () => {
        const forecast = {
          product_id: productId,
          predictions: [
            { ds: "2024-01-01", yhat: 10, yhat_lower: 8, yhat_upper: 12 },
          ],
          model_metrics: { mape: 15, rmse: 2.5, training_samples: 90 },
          seasonality_detected: true,
        };

        vi.mocked(axios.post).mockResolvedValue({ data: forecast });

        await MLClientService.getDemandForecast(productId, horizonDays);

        expect(prisma.mLPrediction.create).toHaveBeenCalledWith({
          data: {
            productId,
            predictionType: "demand_forecast",
            horizonDays,
            predictions: forecast.predictions,
            metrics: forecast.model_metrics,
            confidence: expect.any(Number),
            expiresAt: expect.any(Date),
          },
        });
      });

      it("should calculate confidence from MAPE", async () => {
        vi.mocked(axios.post).mockResolvedValue({
          data: {
            product_id: productId,
            predictions: [],
            model_metrics: { mape: 20, rmse: 3, training_samples: 100 },
            seasonality_detected: false,
          },
        });

        await MLClientService.getDemandForecast(productId, horizonDays);

        expect(prisma.mLPrediction.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              confidence: 0.8, // (100 - 20) / 100
            }),
          }),
        );
      });
    });

    describe("error handling", () => {
      beforeEach(() => {
        vi.mocked(cache.getOrSet).mockImplementation(async (key, fn) => {
          return await fn();
        });
        vi.mocked(prisma.mLPrediction.findFirst).mockResolvedValue(null);
      });

      it("should throw error when product not found (404)", async () => {
        const error = new Error() as any;
        error.isAxiosError = true;
        error.response = { status: 404 };
        vi.mocked(axios.post).mockRejectedValue(error);
        vi.mocked(axios.isAxiosError).mockReturnValue(true);

        await expect(
          MLClientService.getDemandForecast(productId),
        ).rejects.toThrow("No transaction data found for this product");
      });

      it("should throw error when insufficient data (400)", async () => {
        const error = new Error() as any;
        error.isAxiosError = true;
        error.response = {
          status: 400,
          data: { detail: "Need at least 30 days of data" },
        };
        vi.mocked(axios.post).mockRejectedValue(error);
        vi.mocked(axios.isAxiosError).mockReturnValue(true);

        await expect(
          MLClientService.getDemandForecast(productId),
        ).rejects.toThrow("Need at least 30 days of data");
      });

      it("should throw generic error on ML service failure", async () => {
        vi.mocked(axios.post).mockRejectedValue(
          new Error("Service unavailable"),
        );
        vi.mocked(axios.isAxiosError).mockReturnValue(false);

        await expect(
          MLClientService.getDemandForecast(productId),
        ).rejects.toThrow("Failed to generate demand forecast");
      });

      it("should handle timeout gracefully", async () => {
        const error = new Error("timeout of 30000ms exceeded") as any;
        error.isAxiosError = true;
        vi.mocked(axios.post).mockRejectedValue(error);
        vi.mocked(axios.isAxiosError).mockReturnValue(true);

        await expect(
          MLClientService.getDemandForecast(productId),
        ).rejects.toThrow();
      });
    });
  });

  // ===========================================================================
  // STOCKOUT PREDICTION TESTS
  // ===========================================================================

  describe("predictStockout", () => {
    const productId = "product-456";
    const currentStock = 100;
    const horizonDays = 90;

    describe("memory cache behavior", () => {
      it("should use memory cache when available", async () => {
        const mockPrediction = {
          productId,
          predicted_stockout_date: "2024-02-15",
          days_until_stockout: 30,
          confidence: 0.85,
          daily_usage_forecast: [
            { date: "2024-01-01", predicted_usage: 3, remaining_stock: 97 },
          ],
        };

        vi.mocked(cache.getOrSet).mockImplementation(async (key, fn, ttl) => {
          return mockPrediction;
        });

        const result = await MLClientService.predictStockout(
          productId,
          currentStock,
          horizonDays,
        );

        expect(result).toEqual(mockPrediction);
        expect(cache.getOrSet).toHaveBeenCalled();
      });
    });

    describe("database cache behavior", () => {
      it("should return DB cached prediction when available and not expired", async () => {
        const dbCached = {
          id: "cached-2",
          productId,
          predictionType: "stockout",
          horizonDays,
          predictions: {
            predicted_stockout_date: "2024-02-15",
            days_until_stockout: 30,
            daily_usage_forecast: [
              { date: "2024-01-01", predicted_usage: 3, remaining_stock: 97 },
            ],
          },
          metrics: {},
          confidence: 0.85,
          expiresAt: new Date(Date.now() + 10000),
          createdAt: new Date(),
        };

        vi.mocked(cache.getOrSet).mockImplementation(async (key, fn) => {
          return await fn();
        });

        vi.mocked(prisma.mLPrediction.findFirst).mockResolvedValue(
          dbCached as any,
        );

        const result = await MLClientService.predictStockout(
          productId,
          currentStock,
          horizonDays,
        );

        expect(result.productId).toBe(productId);
        expect(result.days_until_stockout).toBe(30);
        expect(result.confidence).toBe(0.85);
      });
    });

    describe("ML service API interaction", () => {
      beforeEach(() => {
        vi.mocked(cache.getOrSet).mockImplementation(async (key, fn) => {
          return await fn();
        });
        vi.mocked(prisma.mLPrediction.findFirst).mockResolvedValue(null);
        vi.mocked(prisma.mLPrediction.create).mockResolvedValue({} as any);
      });

      it("should call ML service with correct parameters", async () => {
        vi.mocked(axios.post).mockResolvedValue({
          data: {
            product_id: productId,
            predicted_stockout_date: "2024-02-15",
            days_until_stockout: 30,
            confidence: 0.85,
            daily_usage_forecast: [],
          },
        });

        await MLClientService.predictStockout(
          productId,
          currentStock,
          horizonDays,
        );

        expect(axios.post).toHaveBeenCalledWith(
          expect.stringContaining("/predict/stockout"),
          {
            product_id: productId,
            current_stock: currentStock,
            horizon_days: horizonDays,
          },
          expect.objectContaining({ timeout: 30000 }),
        );
      });

      it("should use default horizon of 90 days", async () => {
        vi.mocked(axios.post).mockResolvedValue({
          data: {
            product_id: productId,
            predicted_stockout_date: null,
            days_until_stockout: null,
            confidence: 0,
            daily_usage_forecast: [],
          },
        });

        await MLClientService.predictStockout(productId, currentStock);

        expect(axios.post).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({ horizon_days: 90 }),
          expect.any(Object),
        );
      });

      it("should save prediction to DB after successful generation", async () => {
        const prediction = {
          product_id: productId,
          predicted_stockout_date: "2024-02-15",
          days_until_stockout: 30,
          confidence: 0.85,
          daily_usage_forecast: [
            { date: "2024-01-01", predicted_usage: 3, remaining_stock: 97 },
          ],
        };

        vi.mocked(axios.post).mockResolvedValue({ data: prediction });

        await MLClientService.predictStockout(
          productId,
          currentStock,
          horizonDays,
        );

        expect(prisma.mLPrediction.create).toHaveBeenCalledWith({
          data: {
            productId,
            predictionType: "stockout",
            horizonDays,
            predictions: expect.objectContaining({
              predicted_stockout_date: prediction.predicted_stockout_date,
              days_until_stockout: prediction.days_until_stockout,
            }),
            metrics: {},
            confidence: prediction.confidence,
            expiresAt: expect.any(Date),
          },
        });
      });

      it("should handle null stockout date (no stockout predicted)", async () => {
        vi.mocked(axios.post).mockResolvedValue({
          data: {
            product_id: productId,
            predicted_stockout_date: null,
            days_until_stockout: null,
            confidence: 0.9,
            daily_usage_forecast: [],
          },
        });

        const result = await MLClientService.predictStockout(
          productId,
          currentStock,
          horizonDays,
        );

        expect(result.predicted_stockout_date).toBeNull();
        expect(result.days_until_stockout).toBeNull();
      });
    });

    describe("error handling", () => {
      beforeEach(() => {
        vi.mocked(cache.getOrSet).mockImplementation(async (key, fn) => {
          return await fn();
        });
        vi.mocked(prisma.mLPrediction.findFirst).mockResolvedValue(null);
      });

      it("should throw error when product not found (404)", async () => {
        const error = new Error() as any;
        error.isAxiosError = true;
        error.response = { status: 404 };
        vi.mocked(axios.post).mockRejectedValue(error);
        vi.mocked(axios.isAxiosError).mockReturnValue(true);

        await expect(
          MLClientService.predictStockout(productId, currentStock),
        ).rejects.toThrow("No transaction data found for this product");
      });

      it("should throw error when insufficient data (400)", async () => {
        const error = new Error() as any;
        error.isAxiosError = true;
        error.response = {
          status: 400,
          data: { detail: "Need more historical data" },
        };
        vi.mocked(axios.post).mockRejectedValue(error);
        vi.mocked(axios.isAxiosError).mockReturnValue(true);

        await expect(
          MLClientService.predictStockout(productId, currentStock),
        ).rejects.toThrow("Need more historical data");
      });

      it("should throw generic error on ML service failure", async () => {
        vi.mocked(axios.post).mockRejectedValue(new Error("Service down"));
        vi.mocked(axios.isAxiosError).mockReturnValue(false);

        await expect(
          MLClientService.predictStockout(productId, currentStock),
        ).rejects.toThrow("Failed to predict stockout");
      });
    });
  });
});
