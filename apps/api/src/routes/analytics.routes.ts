// =============================================================================
// ANALYTICS ROUTES (Phase 11)
// Pre-aggregated analytics and trend endpoints
// =============================================================================

import { Router, Request, Response } from "express";
import { authenticate, requireClientAccess } from "../middleware/auth.js";
import { logger } from "../lib/logger.js";
import { createAnalyticsLimiter } from "../lib/rate-limiters.js";
import * as analyticsService from "../services/analytics.service.js";

const router = Router();

// All routes require authentication
router.use(authenticate);

// Apply rate limiting to all analytics endpoints - these can be expensive
const analyticsLimiter = createAnalyticsLimiter();
router.use(analyticsLimiter);

// =============================================================================
// Daily Summary
// =============================================================================

/**
 * GET /api/analytics/daily-summary/:clientId
 * Get daily summary metrics for a client
 */
router.get(
  "/daily-summary/:clientId",
  requireClientAccess,
  async (req: Request, res: Response) => {
    try {
      const { clientId } = req.params as { clientId: string };
      const days = parseInt(req.query.days as string) || 30;

      const summary = await analyticsService.getDailySummary(clientId, days);
      res.json({ data: summary });
    } catch (error) {
      logger.error("Error fetching daily summary", error as Error);
      res.status(500).json({ error: "Failed to fetch daily summary" });
    }
  },
);

// =============================================================================
// Inventory Health
// =============================================================================

/**
 * GET /api/analytics/inventory-health
 * Get overall inventory health metrics across all clients
 */
router.get("/inventory-health", async (req: Request, res: Response) => {
  try {
    const health = await analyticsService.getInventoryHealth();
    res.json({ data: health });
  } catch (error) {
    logger.error("Error fetching inventory health", error as Error);
    res.status(500).json({ error: "Failed to fetch inventory health" });
  }
});

// =============================================================================
// Alert Trends
// =============================================================================

/**
 * GET /api/analytics/alert-trends/:clientId
 * Get alert trends for a client
 */
router.get(
  "/alert-trends/:clientId",
  requireClientAccess,
  async (req: Request, res: Response) => {
    try {
      const { clientId } = req.params as { clientId: string };
      const days = parseInt(req.query.days as string) || 30;

      const trends = await analyticsService.getAlertTrends(clientId, days);
      res.json({ data: trends });
    } catch (error) {
      logger.error("Error fetching alert trends", error as Error);
      res.status(500).json({ error: "Failed to fetch alert trends" });
    }
  },
);

// =============================================================================
// Portfolio Risk
// =============================================================================

/**
 * GET /api/analytics/portfolio-risk
 * Get portfolio risk analysis across all clients
 */
router.get("/portfolio-risk", async (req: Request, res: Response) => {
  try {
    const risk = await analyticsService.getPortfolioRisk();
    res.json({ data: risk });
  } catch (error) {
    logger.error("Error fetching portfolio risk", error as Error);
    res.status(500).json({ error: "Failed to fetch portfolio risk" });
  }
});

// =============================================================================
// Inventory Turnover
// =============================================================================

/**
 * GET /api/analytics/inventory-turnover/:clientId
 * Get inventory turnover metrics for a client
 */
router.get(
  "/inventory-turnover/:clientId",
  requireClientAccess,
  async (req: Request, res: Response) => {
    try {
      const { clientId } = req.params as { clientId: string };
      const months = parseInt(req.query.months as string) || 12;

      const turnover = await analyticsService.getInventoryTurnover(
        clientId,
        months,
      );
      res.json({ data: turnover });
    } catch (error) {
      logger.error("Error fetching inventory turnover", error as Error);
      res.status(500).json({ error: "Failed to fetch inventory turnover" });
    }
  },
);

// =============================================================================
// Forecast Accuracy
// =============================================================================

/**
 * GET /api/analytics/forecast-accuracy/:clientId
 * Get forecast accuracy metrics for a client
 */
router.get(
  "/forecast-accuracy/:clientId",
  requireClientAccess,
  async (req: Request, res: Response) => {
    try {
      const { clientId } = req.params as { clientId: string };
      const days = parseInt(req.query.days as string) || 30;

      const accuracy = await analyticsService.getForecastAccuracy(
        clientId,
        days,
      );
      res.json({ data: accuracy });
    } catch (error) {
      logger.error("Error fetching forecast accuracy", error as Error);
      res.status(500).json({ error: "Failed to fetch forecast accuracy" });
    }
  },
);

// =============================================================================
// EXTENDED ANALYTICS - Product, Location, Anomalies, Recommendations
// =============================================================================

/**
 * GET /api/analytics/products/:clientId
 * Get comprehensive product analytics with ABC classification, velocity, trends
 */
router.get(
  "/products/:clientId",
  requireClientAccess,
  async (req: Request, res: Response) => {
    try {
      const { clientId } = req.params as { clientId: string };
      const analytics = await analyticsService.getProductAnalytics(clientId);
      res.json({ data: analytics });
    } catch (error) {
      logger.error("Error fetching product analytics", error as Error);
      res.status(500).json({ error: "Failed to fetch product analytics" });
    }
  },
);

/**
 * GET /api/analytics/locations/:clientId
 * Get analytics by shipping location
 */
router.get(
  "/locations/:clientId",
  requireClientAccess,
  async (req: Request, res: Response) => {
    try {
      const { clientId } = req.params as { clientId: string };
      const analytics = await analyticsService.getLocationAnalytics(clientId);
      res.json({ data: analytics });
    } catch (error) {
      logger.error("Error fetching location analytics", error as Error);
      res.status(500).json({ error: "Failed to fetch location analytics" });
    }
  },
);

/**
 * GET /api/analytics/anomalies/:clientId
 * Detect anomalies in ordering patterns
 */
router.get(
  "/anomalies/:clientId",
  requireClientAccess,
  async (req: Request, res: Response) => {
    try {
      const { clientId } = req.params as { clientId: string };
      const anomalies = await analyticsService.detectAnomalies(clientId);
      res.json({ data: anomalies });
    } catch (error) {
      logger.error("Error detecting anomalies", error as Error);
      res.status(500).json({ error: "Failed to detect anomalies" });
    }
  },
);

/**
 * GET /api/analytics/reorder-recommendations/:clientId
 * Get smart reorder recommendations
 */
router.get(
  "/reorder-recommendations/:clientId",
  requireClientAccess,
  async (req: Request, res: Response) => {
    try {
      const { clientId } = req.params as { clientId: string };
      const recommendations =
        await analyticsService.getReorderRecommendations(clientId);
      res.json({ data: recommendations });
    } catch (error) {
      logger.error("Error fetching reorder recommendations", error as Error);
      res
        .status(500)
        .json({ error: "Failed to fetch reorder recommendations" });
    }
  },
);

/**
 * GET /api/analytics/stockout-predictions/:clientId
 * Get stockout countdown predictions with urgency levels
 */
router.get(
  "/stockout-predictions/:clientId",
  requireClientAccess,
  async (req: Request, res: Response) => {
    try {
      const { clientId } = req.params as { clientId: string };
      const predictions =
        await analyticsService.getStockoutPredictions(clientId);
      res.json({ data: predictions });
    } catch (error) {
      logger.error("Error fetching stockout predictions", error as Error);
      res.status(500).json({ error: "Failed to fetch stockout predictions" });
    }
  },
);

/**
 * GET /api/analytics/intelligent-summary/:clientId
 * Get comprehensive intelligent dashboard summary
 */
router.get(
  "/intelligent-summary/:clientId",
  requireClientAccess,
  async (req: Request, res: Response) => {
    try {
      const { clientId } = req.params as { clientId: string };
      const summary =
        await analyticsService.getIntelligentDashboardSummary(clientId);
      res.json({ data: summary });
    } catch (error) {
      logger.error("Error fetching intelligent summary", error as Error);
      res.status(500).json({ error: "Failed to fetch intelligent summary" });
    }
  },
);

/**
 * GET /api/analytics/monthly-trends/:clientId
 * Get monthly trend data for charts
 */
router.get(
  "/monthly-trends/:clientId",
  requireClientAccess,
  async (req: Request, res: Response) => {
    try {
      const { clientId } = req.params as { clientId: string };
      const months = parseInt(req.query.months as string) || 12;
      const trends = await analyticsService.getMonthlyTrends(clientId, months);
      res.json({ data: trends });
    } catch (error) {
      logger.error("Error fetching monthly trends", error as Error);
      res.status(500).json({ error: "Failed to fetch monthly trends" });
    }
  },
);

// =============================================================================
// Stock Health Summary
// =============================================================================

/**
 * GET /api/analytics/stock-health/:clientId
 * Get stock health summary with category counts
 */
router.get(
  "/stock-health/:clientId",
  requireClientAccess,
  async (req: Request, res: Response) => {
    try {
      const { clientId } = req.params as { clientId: string };
      const summary = await analyticsService.getStockHealthSummary(clientId);
      res.json({ data: summary });
    } catch (error) {
      logger.error("Error fetching stock health summary", error as Error);
      res.status(500).json({ error: "Failed to fetch stock health summary" });
    }
  },
);

// =============================================================================
// Stock Intelligence - Configurable thresholds and detailed analysis
// =============================================================================

import * as stockIntelligenceService from "../services/stock-intelligence.service.js";

/**
 * GET /api/analytics/stock-intelligence/:clientId
 * Get comprehensive stock intelligence with configurable thresholds
 */
router.get(
  "/stock-intelligence/:clientId",
  requireClientAccess,
  async (req: Request, res: Response) => {
    try {
      const { clientId } = req.params as { clientId: string };
      const intelligence =
        await stockIntelligenceService.getClientStockIntelligence(clientId);
      res.json({ data: intelligence });
    } catch (error) {
      logger.error("Error fetching stock intelligence", error as Error);
      res.status(500).json({ error: "Failed to fetch stock intelligence" });
    }
  },
);

/**
 * GET /api/analytics/stock-config/:clientId
 * Get stock health configuration for a client
 */
router.get(
  "/stock-config/:clientId",
  requireClientAccess,
  async (req: Request, res: Response) => {
    try {
      const { clientId } = req.params as { clientId: string };
      const config =
        await stockIntelligenceService.getClientStockHealthConfig(clientId);
      res.json({ data: config });
    } catch (error) {
      logger.error("Error fetching stock config", error as Error);
      res.status(500).json({ error: "Failed to fetch stock config" });
    }
  },
);

/**
 * PATCH /api/analytics/stock-config/:clientId
 * Update stock health configuration for a client
 */
router.patch(
  "/stock-config/:clientId",
  requireClientAccess,
  async (req: Request, res: Response) => {
    try {
      const { clientId } = req.params as { clientId: string };
      const { criticalWeeks, lowWeeks, watchWeeks, overstockMonths } = req.body;

      const config =
        await stockIntelligenceService.updateClientStockHealthConfig(clientId, {
          criticalWeeks,
          lowWeeks,
          watchWeeks,
          overstockMonths,
        });

      res.json({ data: config });
    } catch (error) {
      logger.error("Error updating stock config", error as Error);
      res.status(500).json({ error: "Failed to update stock config" });
    }
  },
);

export default router;
