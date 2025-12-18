// =============================================================================
// ML CLIENT SERVICE
// Client for communicating with the ML Analytics Python service
// =============================================================================

import axios from "axios";
import { logger } from "../lib/logger.js";
import { cache, CacheTTL, CacheKeys } from "../lib/cache.js";
import { prisma } from "../lib/prisma.js";

// =============================================================================
// TYPES
// =============================================================================

export interface DemandForecast {
  productId: string;
  predictions: Array<{
    ds: string; // date
    yhat: number; // predicted value
    yhat_lower: number; // lower confidence bound
    yhat_upper: number; // upper confidence bound
  }>;
  model_metrics: {
    mape: number; // Mean Absolute Percentage Error
    rmse: number; // Root Mean Squared Error
    training_samples: number;
  };
  seasonality_detected: boolean;
}

export interface StockoutPrediction {
  productId: string;
  predicted_stockout_date: string | null;
  days_until_stockout: number | null;
  confidence: number; // 0-1
  daily_usage_forecast: Array<{
    date: string;
    predicted_usage: number;
    remaining_stock: number;
  }>;
}

// =============================================================================
// ML SERVICE CLIENT
// =============================================================================

export class MLClientService {
  // UNIFIED: Use DS_ANALYTICS_URL (same as ds-analytics.service.ts)
  // ML_SERVICE_URL kept for backwards compatibility
  private static baseURL =
    process.env.DS_ANALYTICS_URL ||
    process.env.ML_SERVICE_URL ||
    "http://localhost:8000";
  private static timeout = 30000; // 30 seconds

  /**
   * Check if ML service is available
   */
  static async healthCheck(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.baseURL}/health`, {
        timeout: 5000,
      });
      return response.data.status === "healthy";
    } catch (error) {
      logger.warn("ML service health check failed", {
        error: (error as Error).message,
      });
      return false;
    }
  }

  /**
   * Get demand forecast for a product (with caching)
   */
  static async getDemandForecast(
    productId: string,
    horizonDays: number = 30,
  ): Promise<DemandForecast> {
    const cacheKey = CacheKeys.mlForecast(productId, horizonDays);

    return cache.getOrSet(
      cacheKey,
      async () => {
        // Check DB cache first
        const dbCached = await prisma.mLPrediction.findFirst({
          where: {
            productId,
            predictionType: "demand_forecast",
            horizonDays,
            expiresAt: { gte: new Date() },
          },
          orderBy: { createdAt: "desc" },
        });

        if (dbCached) {
          logger.info("Returning cached demand forecast from DB", {
            productId,
            horizonDays,
          });
          return {
            productId,
            predictions: dbCached.predictions as any,
            model_metrics: (dbCached.metrics as any) || {},
            seasonality_detected: false,
          };
        }

        // Call ML service
        try {
          logger.info("Requesting demand forecast from ML service", {
            productId,
            horizonDays,
          });

          const response = await axios.post(
            `${this.baseURL}/forecast/demand`,
            {
              product_id: productId,
              horizon_days: horizonDays,
            },
            {
              timeout: this.timeout,
            },
          );

          const forecast: DemandForecast = {
            productId: response.data.product_id,
            predictions: response.data.predictions,
            model_metrics: response.data.model_metrics,
            seasonality_detected: response.data.seasonality_detected,
          };

          // Cache in DB
          await prisma.mLPrediction.create({
            data: {
              productId,
              predictionType: "demand_forecast",
              horizonDays,
              predictions: forecast.predictions as any,
              metrics: forecast.model_metrics as any,
              confidence: forecast.model_metrics.mape
                ? (100 - forecast.model_metrics.mape) / 100
                : null,
              expiresAt: new Date(Date.now() + CacheTTL.ML_FORECAST),
            },
          });

          return forecast;
        } catch (error) {
          if (axios.isAxiosError(error)) {
            if (error.response?.status === 404) {
              throw new Error("No transaction data found for this product");
            }
            if (error.response?.status === 400) {
              throw new Error(
                error.response.data.detail ||
                  "Insufficient data for forecasting",
              );
            }
          }

          logger.error("Demand forecast failed", error as Error, { productId });
          throw new Error(
            "Failed to generate demand forecast. Please try again later.",
          );
        }
      },
      CacheTTL.ML_FORECAST,
    );
  }

  /**
   * Predict when a product will stock out (with caching)
   */
  static async predictStockout(
    productId: string,
    currentStock: number,
    horizonDays: number = 90,
  ): Promise<StockoutPrediction> {
    const cacheKey = CacheKeys.mlStockout(productId, horizonDays);

    return cache.getOrSet(
      cacheKey,
      async () => {
        // Check DB cache first
        const dbCached = await prisma.mLPrediction.findFirst({
          where: {
            productId,
            predictionType: "stockout",
            horizonDays,
            expiresAt: { gte: new Date() },
          },
          orderBy: { createdAt: "desc" },
        });

        if (dbCached) {
          logger.info("Returning cached stockout prediction from DB", {
            productId,
            horizonDays,
          });
          const predictions = dbCached.predictions as any;
          return {
            productId,
            predicted_stockout_date:
              predictions.predicted_stockout_date || null,
            days_until_stockout: predictions.days_until_stockout || null,
            confidence: dbCached.confidence || 0,
            daily_usage_forecast: predictions.daily_usage_forecast || [],
          };
        }

        // Call ML service
        try {
          logger.info("Requesting stockout prediction from ML service", {
            productId,
            currentStock,
            horizonDays,
          });

          const response = await axios.post(
            `${this.baseURL}/predict/stockout`,
            {
              product_id: productId,
              current_stock: currentStock,
              horizon_days: horizonDays,
            },
            {
              timeout: this.timeout,
            },
          );

          const prediction: StockoutPrediction = {
            productId: response.data.product_id,
            predicted_stockout_date: response.data.predicted_stockout_date,
            days_until_stockout: response.data.days_until_stockout,
            confidence: response.data.confidence,
            daily_usage_forecast: response.data.daily_usage_forecast,
          };

          // Cache in DB
          await prisma.mLPrediction.create({
            data: {
              productId,
              predictionType: "stockout",
              horizonDays,
              predictions: {
                predicted_stockout_date: prediction.predicted_stockout_date,
                days_until_stockout: prediction.days_until_stockout,
                daily_usage_forecast: prediction.daily_usage_forecast,
              } as any,
              metrics: {} as any,
              confidence: prediction.confidence,
              expiresAt: new Date(Date.now() + CacheTTL.ML_STOCKOUT),
            },
          });

          return prediction;
        } catch (error) {
          if (axios.isAxiosError(error)) {
            if (error.response?.status === 404) {
              throw new Error("No transaction data found for this product");
            }
            if (error.response?.status === 400) {
              throw new Error(
                error.response.data.detail ||
                  "Insufficient data for prediction",
              );
            }
          }

          logger.error("Stockout prediction failed", error as Error, {
            productId,
          });
          throw new Error(
            "Failed to predict stockout. Please try again later.",
          );
        }
      },
      CacheTTL.ML_STOCKOUT,
    );
  }
}

export default MLClientService;
