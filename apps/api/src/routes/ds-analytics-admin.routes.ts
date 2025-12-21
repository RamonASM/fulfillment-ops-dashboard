/**
 * DS Analytics Admin Routes
 * Admin API for managing the DS Analytics rollout
 *
 * Provides endpoints to:
 * - View DS Analytics service status
 * - Enable/disable DS Analytics per client
 * - Compare DS vs TypeScript calculation results
 * - Monitor the rollout progress
 */

import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { NotFoundError, ValidationError } from "../middleware/error-handler.js";
import {
  isDsAnalyticsHealthy,
  shouldUseDsAnalytics,
  getAllClientsAnalyticsStatus,
  enableDsAnalyticsForClient,
  disableDsAnalyticsForClient,
  getDsAnalyticsStats,
  recalculateClientUsage,
} from "../services/analytics-facade.service.js";
import { dsAnalyticsService } from "../services/ds-analytics.service.js";
import {
  recalculateProductUsage,
  getProductWithMonthlyUsage,
} from "../services/usage.service.js";

const router = Router();

// All routes require authentication and admin role
router.use(authenticate);
router.use(requireRole("admin", "operations_manager"));

// =============================================================================
// SERVICE STATUS
// =============================================================================

/**
 * GET /api/admin/ds-analytics/status
 * Get DS Analytics service health and statistics
 */
router.get("/status", async (req, res, next) => {
  try {
    const [health, stats] = await Promise.all([
      isDsAnalyticsHealthy(),
      getDsAnalyticsStats(),
    ]);

    // Get client rollout stats
    const clientStats = await prisma.clientConfiguration.groupBy({
      by: ["dsAnalyticsEnabled"],
      _count: { id: true },
    });

    const enabledCount =
      clientStats.find((s) => s.dsAnalyticsEnabled)?._count.id ?? 0;
    const disabledCount =
      clientStats.find((s) => !s.dsAnalyticsEnabled)?._count.id ?? 0;

    // Get total active clients (some may not have configuration records)
    const totalClients = await prisma.client.count({
      where: { isActive: true },
    });

    res.json({
      service: {
        healthy: health,
        url: process.env.DS_ANALYTICS_URL || "http://localhost:8000",
        stats: stats.stats,
      },
      rollout: {
        totalClients,
        enabled: enabledCount,
        disabled: disabledCount,
        notConfigured: totalClients - enabledCount - disabledCount,
        percentEnabled:
          totalClients > 0
            ? Math.round((enabledCount / totalClients) * 100)
            : 0,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/ds-analytics/health
 * Simple health check for DS Analytics service
 */
router.get("/health", async (req, res, next) => {
  try {
    const healthy = await isDsAnalyticsHealthy();
    res.json({
      healthy,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// CLIENT MANAGEMENT
// =============================================================================

/**
 * GET /api/admin/ds-analytics/clients
 * List all clients with their DS Analytics status
 */
router.get("/clients", async (req, res, next) => {
  try {
    const clients = await getAllClientsAnalyticsStatus();
    res.json({ data: clients });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/ds-analytics/clients/:clientId
 * Get DS Analytics status for a specific client
 */
router.get("/clients/:clientId", async (req, res, next) => {
  try {
    const { clientId } = req.params;

    const client = await prisma.client.findUnique({
      where: { id: clientId },
      include: {
        configuration: {
          select: { dsAnalyticsEnabled: true },
        },
      },
    });

    if (!client) {
      throw new NotFoundError("Client");
    }

    const { enabled, healthy, shouldUse } = await shouldUseDsAnalytics(clientId);

    res.json({
      clientId: client.id,
      clientName: client.name,
      dsAnalyticsEnabled: enabled,
      dsAnalyticsHealthy: healthy,
      willUseDsAnalytics: shouldUse,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/admin/ds-analytics/clients/:clientId/enable
 * Enable DS Analytics for a specific client
 */
router.patch("/clients/:clientId/enable", async (req, res, next) => {
  try {
    const { clientId } = req.params;

    const client = await prisma.client.findUnique({
      where: { id: clientId },
    });

    if (!client) {
      throw new NotFoundError("Client");
    }

    // Check if DS Analytics is healthy before enabling
    const healthy = await isDsAnalyticsHealthy();
    if (!healthy) {
      throw new ValidationError(
        "Cannot enable DS Analytics: service is not healthy",
      );
    }

    await enableDsAnalyticsForClient(clientId);

    res.json({
      message: `DS Analytics enabled for ${client.name}`,
      clientId,
      dsAnalyticsEnabled: true,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/admin/ds-analytics/clients/:clientId/disable
 * Disable DS Analytics for a specific client (fall back to TypeScript)
 */
router.patch("/clients/:clientId/disable", async (req, res, next) => {
  try {
    const { clientId } = req.params;

    const client = await prisma.client.findUnique({
      where: { id: clientId },
    });

    if (!client) {
      throw new NotFoundError("Client");
    }

    await disableDsAnalyticsForClient(clientId);

    res.json({
      message: `DS Analytics disabled for ${client.name}. Will use TypeScript calculations.`,
      clientId,
      dsAnalyticsEnabled: false,
    });
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// BATCH OPERATIONS
// =============================================================================

/**
 * POST /api/admin/ds-analytics/enable-all
 * Enable DS Analytics for all clients
 */
router.post("/enable-all", async (req, res, next) => {
  try {
    // Check health first
    const healthy = await isDsAnalyticsHealthy();
    if (!healthy) {
      throw new ValidationError(
        "Cannot enable DS Analytics: service is not healthy",
      );
    }

    const clients = await prisma.client.findMany({
      where: { isActive: true },
      select: { id: true },
    });

    for (const client of clients) {
      await enableDsAnalyticsForClient(client.id);
    }

    res.json({
      message: `DS Analytics enabled for ${clients.length} clients`,
      clientsEnabled: clients.length,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/admin/ds-analytics/disable-all
 * Disable DS Analytics for all clients (emergency rollback)
 */
router.post("/disable-all", async (req, res, next) => {
  try {
    const clients = await prisma.client.findMany({
      where: { isActive: true },
      select: { id: true },
    });

    for (const client of clients) {
      await disableDsAnalyticsForClient(client.id);
    }

    res.json({
      message: `DS Analytics disabled for ${clients.length} clients. All clients will use TypeScript calculations.`,
      clientsDisabled: clients.length,
    });
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// TESTING & COMPARISON
// =============================================================================

/**
 * POST /api/admin/ds-analytics/compare/:productId
 * Compare DS Analytics vs TypeScript calculation results for a product
 * Useful for validating the DS Analytics service before rollout
 */
router.post("/compare/:productId", async (req, res, next) => {
  try {
    const { productId } = req.params;

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        client: { select: { id: true, name: true } },
      },
    });

    if (!product) {
      throw new NotFoundError("Product");
    }

    const results: any = {
      productId,
      productName: product.name,
      clientName: product.client.name,
    };

    // Get TypeScript calculation
    try {
      await recalculateProductUsage(productId);
      const tsResult = await getProductWithMonthlyUsage(productId);
      results.typescript = {
        monthlyUsageUnits: tsResult?.monthlyUsageUnits,
        monthlyUsagePacks: tsResult?.monthlyUsagePacks,
        usageConfidence: tsResult?.usageConfidence,
        calculationTier: tsResult?.usageCalculationTier,
      };
    } catch (error) {
      results.typescript = { error: (error as Error).message };
    }

    // Get DS Analytics calculation (if available)
    const dsHealthy = await isDsAnalyticsHealthy();
    if (dsHealthy) {
      try {
        const dsResults = await dsAnalyticsService.calculateUsage(
          [productId],
          product.clientId,
          true, // Force recalculate
        );
        if (dsResults.length > 0) {
          const dsResult = dsResults[0];
          results.dsAnalytics = {
            monthlyUsageUnits: dsResult.monthly_usage_units,
            monthlyUsagePacks: dsResult.monthly_usage_packs,
            usageConfidence: dsResult.confidence_level,
            calculationMethod: dsResult.calculation_method,
            calculationTier: dsResult.calculation_tier,
            trend: dsResult.trend,
            confidenceScore: dsResult.confidence_score,
            seasonalityDetected: dsResult.seasonality_detected,
            outliersDetected: dsResult.outliers_detected,
          };
        }
      } catch (error) {
        results.dsAnalytics = { error: (error as Error).message };
      }
    } else {
      results.dsAnalytics = { error: "Service not available" };
    }

    // Calculate difference if both succeeded
    if (results.typescript?.monthlyUsageUnits && results.dsAnalytics?.monthlyUsageUnits) {
      const tsMU = results.typescript.monthlyUsageUnits;
      const dsMU = results.dsAnalytics.monthlyUsageUnits;
      const diff = Math.abs(tsMU - dsMU);
      const percentDiff = tsMU > 0 ? (diff / tsMU) * 100 : 0;

      results.comparison = {
        difference: diff,
        percentDifference: percentDiff.toFixed(2) + "%",
        match: percentDiff < 5, // Within 5% is considered a match
      };
    }

    res.json(results);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/admin/ds-analytics/test-client/:clientId
 * Trigger a test recalculation for a client and return the results
 */
router.post("/test-client/:clientId", async (req, res, next) => {
  try {
    const { clientId } = req.params;

    const client = await prisma.client.findUnique({
      where: { id: clientId },
    });

    if (!client) {
      throw new NotFoundError("Client");
    }

    // Run the recalculation through the facade
    const result = await recalculateClientUsage(clientId);

    res.json({
      clientId,
      clientName: client.name,
      result,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
