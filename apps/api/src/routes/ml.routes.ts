// =============================================================================
// ML PREDICTION ROUTES
// API endpoints for machine learning predictions and forecasts
// =============================================================================

import express from "express";
import { MLClientService } from "../services/ml-client.service.js";
import { authenticate } from "../middleware/auth.js";
import { requireClientAccess } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";

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
      success: true,
      data: {
        available: isHealthy,
        service: "ml-analytics",
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to check ML service health",
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
    const message = (error as Error).message;
    res.status(500).json({
      success: false,
      error:
        message.includes("No transaction data") ||
        message.includes("Insufficient data")
          ? message
          : "Failed to generate forecast",
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
    res.status(500).json({
      success: false,
      error: "Failed to generate batch forecasts",
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
  try {
    const { productId } = req.params;
    const { horizonDays = 90 } = req.query;

    // Get product with current stock
    const product = await prisma.product.findUnique({
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
    const message = (error as Error).message;
    res.status(500).json({
      success: false,
      error:
        message.includes("No transaction data") ||
        message.includes("Insufficient data")
          ? message
          : "Failed to predict stockout",
    });
  }
});

export default router;
