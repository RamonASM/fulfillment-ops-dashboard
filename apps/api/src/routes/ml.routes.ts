// =============================================================================
// ML PREDICTION ROUTES
// API endpoints for machine learning predictions and forecasts
// =============================================================================

import express from "express";
import { MLClientService } from "../services/ml-client.service.js";
import { authenticate } from "../middleware/auth.js";
import { requireClientAccess } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

// =============================================================================
// ML SERVICE STATUS
// =============================================================================

/**
 * GET /api/ml/health
 * Check if ML service is available
 */
router.get("/health", async (_req, res) => {
  try {
    const isHealthy = await MLClientService.healthCheck();
    res.json({
      status: isHealthy ? "healthy" : "offline",
      service: "ml-analytics",
      database: isHealthy ? "connected" : "unknown",
      serviceUrl: process.env.ML_SERVICE_URL || "not configured",
      lastCheck: new Date().toISOString(),
    });
  } catch (error) {
    res.json({
      status: "offline",
      service: "ml-analytics",
      database: "unknown",
      serviceUrl: process.env.ML_SERVICE_URL || "not configured",
      lastCheck: new Date().toISOString(),
    });
  }
});

/**
 * GET /api/ml/readiness
 * Check if ML service is available AND if there's enough data for predictions
 * Returns setup wizard state or "gathering data" state with progress
 */
router.get("/readiness", async (req, res) => {
  try {
    // Check ML service availability
    let mlServiceAvailable = false;
    try {
      mlServiceAvailable = await MLClientService.healthCheck();
    } catch {
      mlServiceAvailable = false;
    }

    // Get client ID from authenticated user
    const user = (req as any).user;
    const clientId = user?.clientId;

    // Get data readiness metrics
    const [ordersStats, productsWithHistory, dateRange] = await Promise.all([
      // Total orders count
      prisma.transaction.count({
        where: clientId ? { product: { clientId } } : undefined,
      }),
      // Products with at least 10 orders (enough for predictions)
      prisma.product.count({
        where: {
          ...(clientId ? { clientId } : {}),
          transactions: { some: {} },
        },
      }),
      // Date range of orders
      prisma.transaction.aggregate({
        where: clientId ? { product: { clientId } } : undefined,
        _min: { dateSubmitted: true },
        _max: { dateSubmitted: true },
      }),
    ]);

    // Calculate data quality metrics
    const ordersCount = ordersStats;
    const oldestOrder = dateRange._min.dateSubmitted;
    const newestOrder = dateRange._max.dateSubmitted;

    // Calculate days of history
    const daysOfHistory = oldestOrder && newestOrder
      ? Math.ceil((newestOrder.getTime() - oldestOrder.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    // Minimum requirements: 100 orders AND 30 days of history
    const MIN_ORDERS = 100;
    const MIN_DAYS = 30;
    const meetsMinimumRequirements = ordersCount >= MIN_ORDERS && daysOfHistory >= MIN_DAYS;

    // Calculate progress (weighted: 60% orders, 40% days)
    const ordersProgress = Math.min(ordersCount / MIN_ORDERS, 1);
    const daysProgress = Math.min(daysOfHistory / MIN_DAYS, 1);
    const progressPercent = Math.round((ordersProgress * 0.6 + daysProgress * 0.4) * 100);

    // Witty messages based on progress
    const wittyMessages = [
      "Teaching our AI the ways of your inventory...",
      "Crunching numbers so you don't have to...",
      "Our crystal ball is charging...",
      "Gathering intelligence on your products...",
      "Building your prediction engine...",
      "Training the forecasting hamsters...",
      "Brewing data into insights...",
      "Good things come to those who import...",
    ];
    const wittyMessage = wittyMessages[Math.floor(Math.random() * wittyMessages.length)];

    // Determine overall state
    let state: "not_deployed" | "gathering_data" | "ready";
    if (!mlServiceAvailable && !process.env.DS_ANALYTICS_URL && !process.env.ML_SERVICE_URL) {
      state = "not_deployed";
    } else if (!meetsMinimumRequirements) {
      state = "gathering_data";
    } else {
      state = "ready";
    }

    res.json({
      state,
      mlServiceAvailable,
      mlServiceUrl: process.env.DS_ANALYTICS_URL || process.env.ML_SERVICE_URL || null,
      dataReadiness: {
        ordersCount,
        productsWithHistory,
        oldestOrder,
        newestOrder,
        daysOfHistory,
        meetsMinimumRequirements,
        progressPercent,
        requirements: {
          minOrders: MIN_ORDERS,
          minDays: MIN_DAYS,
        },
      },
      wittyMessage,
      tips: meetsMinimumRequirements
        ? ["Your data is ready for ML predictions!", "Try forecasting demand for your top products."]
        : [
            `Import ${Math.max(0, MIN_ORDERS - ordersCount)} more orders to unlock predictions`,
            "Import 3+ months of order history for accurate forecasting",
            "The more data you import, the smarter our predictions become",
          ],
    });
  } catch (err) {
    logger.error("ML readiness check failed", { error: err });
    res.status(500).json({
      state: "error",
      message: "Failed to check ML readiness",
      mlServiceAvailable: false,
    });
  }
});

// =============================================================================
// DEMAND FORECASTING
// =============================================================================

/**
 * GET /api/ml/forecast/:productId
 * Get demand forecast for a product
 */
router.get("/forecast/:productId", async (req, res) => {
  try {
    const { productId } = req.params;
    const { horizonDays = 30 } = req.query;

    // Verify product exists and user has access
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { clientId: true, name: true, productId: true },
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        error: "Product not found",
      });
    }

    // Check client access
    if (req.user?.role !== "admin" && req.user?.role !== "operations_manager") {
      const access = await prisma.userClient.findUnique({
        where: {
          userId_clientId: {
            userId: req.user!.userId,
            clientId: product.clientId,
          },
        },
      });

      if (!access) {
        return res.status(403).json({
          success: false,
          error: "Access denied",
        });
      }
    }

    // Get forecast
    const forecast = await MLClientService.getDemandForecast(
      productId,
      Number(horizonDays),
    );

    res.json({
      success: true,
      data: forecast,
      meta: {
        productName: product.name,
        productCode: product.productId,
      },
    });
  } catch (error) {
    const errorDetails = {
      timestamp: new Date().toISOString(),
      endpoint: "forecast",
      productId: req.params.productId,
      error: (error as Error).message,
      stack: (error as Error).stack,
    };

    // Log detailed error
    logger.error("ML Forecast Error", error as Error, errorDetails);

    const message = (error as Error).message;
    res.status(500).json({
      success: false,
      error:
        message.includes("No transaction data") ||
        message.includes("Insufficient data")
          ? message
          : "Failed to generate forecast",
      diagnostics: {
        message: (error as Error).message,
        serviceAvailable: await MLClientService.healthCheck().catch(
          () => false,
        ),
      },
    });
  }
});

/**
 * POST /api/ml/forecast/batch
 * Get forecasts for multiple products
 */
router.post("/forecast/batch", async (req, res) => {
  try {
    const { productIds, horizonDays = 30 } = req.body;

    if (!Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: "productIds must be a non-empty array",
      });
    }

    // Limit batch size
    if (productIds.length > 10) {
      return res.status(400).json({
        success: false,
        error: "Maximum 10 products per batch request",
      });
    }

    // Verify products exist and user has access
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, clientId: true, name: true, productId: true },
    });

    // Check access to all products
    if (req.user?.role !== "admin" && req.user?.role !== "operations_manager") {
      const clientIds = [...new Set(products.map((p) => p.clientId))];
      const userClients = await prisma.userClient.findMany({
        where: {
          userId: req.user!.userId,
          clientId: { in: clientIds },
        },
      });

      if (userClients.length !== clientIds.length) {
        return res.status(403).json({
          success: false,
          error: "Access denied to one or more products",
        });
      }
    }

    // Get forecasts for all products
    const forecasts = await Promise.allSettled(
      products.map((p) =>
        MLClientService.getDemandForecast(p.id, Number(horizonDays)).then(
          (forecast) => ({
            ...forecast,
            productName: p.name,
            productCode: p.productId,
          }),
        ),
      ),
    );

    const successful = forecasts
      .filter((r) => r.status === "fulfilled")
      .map((r: any) => r.value);

    const failed = forecasts
      .filter((r) => r.status === "rejected")
      .map((r: any, i) => ({
        productId: products[i].id,
        error: r.reason?.message || "Failed to generate forecast",
      }));

    res.json({
      success: true,
      data: successful,
      meta: {
        total: productIds.length,
        successful: successful.length,
        failed: failed.length,
        failures: failed,
      },
    });
  } catch (error) {
    const errorDetails = {
      timestamp: new Date().toISOString(),
      endpoint: "forecast/batch",
      productIds: req.body.productIds,
      error: (error as Error).message,
      stack: (error as Error).stack,
    };

    // Log detailed error
    logger.error("ML Batch Forecast Error", error as Error, errorDetails);

    res.status(500).json({
      success: false,
      error: "Failed to generate batch forecasts",
      diagnostics: {
        message: (error as Error).message,
        serviceAvailable: await MLClientService.healthCheck().catch(
          () => false,
        ),
      },
    });
  }
});

// =============================================================================
// STOCKOUT PREDICTION
// =============================================================================

/**
 * GET /api/ml/stockout/:productId
 * Predict when a product will stock out
 */
router.get("/stockout/:productId", async (req, res) => {
  let product: any = null; // Declare outside try block for error handler access
  try {
    const { productId } = req.params;
    const { horizonDays = 90 } = req.query;

    // Get product with current stock
    product = await prisma.product.findUnique({
      where: { id: productId },
      select: {
        clientId: true,
        name: true,
        productId: true,
        currentStockPacks: true,
        packSize: true,
      },
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        error: "Product not found",
      });
    }

    // Check client access
    if (req.user?.role !== "admin" && req.user?.role !== "operations_manager") {
      const access = await prisma.userClient.findUnique({
        where: {
          userId_clientId: {
            userId: req.user!.userId,
            clientId: product.clientId,
          },
        },
      });

      if (!access) {
        return res.status(403).json({
          success: false,
          error: "Access denied",
        });
      }
    }

    const currentStock = product.currentStockPacks * product.packSize;

    // Get stockout prediction
    const prediction = await MLClientService.predictStockout(
      productId,
      currentStock,
      Number(horizonDays),
    );

    res.json({
      success: true,
      data: prediction,
      meta: {
        productName: product.name,
        productCode: product.productId,
        currentStock,
      },
    });
  } catch (error) {
    const errorDetails = {
      timestamp: new Date().toISOString(),
      endpoint: "stockout",
      productId: req.params.productId,
      currentStock: product?.currentStockPacks
        ? product.currentStockPacks * product.packSize
        : 0,
      error: (error as Error).message,
      stack: (error as Error).stack,
    };

    // Log detailed error
    logger.error("ML Stockout Error", error as Error, errorDetails);

    const message = (error as Error).message;
    res.status(500).json({
      success: false,
      error:
        message.includes("No transaction data") ||
        message.includes("Insufficient data")
          ? message
          : "Failed to predict stockout",
      diagnostics: {
        message: (error as Error).message,
        serviceAvailable: await MLClientService.healthCheck().catch(
          () => false,
        ),
      },
    });
  }
});

export default router;
