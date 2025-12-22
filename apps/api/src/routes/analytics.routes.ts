// =============================================================================
// ANALYTICS ROUTES (Phase 11)
// Pre-aggregated analytics and trend endpoints
// Uses asyncHandler for standardized error handling via global error handler
// =============================================================================

import { Router, Request, Response } from "express";
import { authenticate, requireClientAccess } from "../middleware/auth.js";
import { createAnalyticsLimiter } from "../lib/rate-limiters.js";
import { asyncHandler, successResponse } from "../lib/api-response.js";
import * as analyticsService from "../services/analytics.service.js";
import * as stockIntelligenceService from "../services/stock-intelligence.service.js";

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
  asyncHandler(async (req: Request, res: Response) => {
    const { clientId } = req.params as { clientId: string };
    const days = parseInt(req.query.days as string) || 30;

    const summary = await analyticsService.getDailySummary(clientId, days);
    res.json(successResponse(summary));
  })
);

// =============================================================================
// Inventory Health
// =============================================================================

/**
 * GET /api/analytics/inventory-health
 * Get overall inventory health metrics across all clients
 */
router.get(
  "/inventory-health",
  asyncHandler(async (_req: Request, res: Response) => {
    const health = await analyticsService.getInventoryHealth();
    res.json(successResponse(health));
  })
);

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
  asyncHandler(async (req: Request, res: Response) => {
    const { clientId } = req.params as { clientId: string };
    const days = parseInt(req.query.days as string) || 30;

    const trends = await analyticsService.getAlertTrends(clientId, days);
    res.json(successResponse(trends));
  })
);

// =============================================================================
// Portfolio Risk
// =============================================================================

/**
 * GET /api/analytics/portfolio-risk
 * Get portfolio risk analysis across all clients
 */
router.get(
  "/portfolio-risk",
  asyncHandler(async (_req: Request, res: Response) => {
    const risk = await analyticsService.getPortfolioRisk();
    res.json(successResponse(risk));
  })
);

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
  asyncHandler(async (req: Request, res: Response) => {
    const { clientId } = req.params as { clientId: string };
    const months = parseInt(req.query.months as string) || 12;

    const turnover = await analyticsService.getInventoryTurnover(clientId, months);
    res.json(successResponse(turnover));
  })
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
  asyncHandler(async (req: Request, res: Response) => {
    const { clientId } = req.params as { clientId: string };
    const days = parseInt(req.query.days as string) || 30;

    const accuracy = await analyticsService.getForecastAccuracy(clientId, days);
    res.json(successResponse(accuracy));
  })
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
  asyncHandler(async (req: Request, res: Response) => {
    const { clientId } = req.params as { clientId: string };
    const analytics = await analyticsService.getProductAnalytics(clientId);
    res.json(successResponse(analytics));
  })
);

/**
 * GET /api/analytics/locations/:clientId
 * Get analytics by shipping location
 */
router.get(
  "/locations/:clientId",
  requireClientAccess,
  asyncHandler(async (req: Request, res: Response) => {
    const { clientId } = req.params as { clientId: string };
    const analytics = await analyticsService.getLocationAnalytics(clientId);
    res.json(successResponse(analytics));
  })
);

/**
 * GET /api/analytics/anomalies/:clientId
 * Detect anomalies in ordering patterns
 */
router.get(
  "/anomalies/:clientId",
  requireClientAccess,
  asyncHandler(async (req: Request, res: Response) => {
    const { clientId } = req.params as { clientId: string };
    const anomalies = await analyticsService.detectAnomalies(clientId);
    res.json(successResponse(anomalies));
  })
);

/**
 * GET /api/analytics/reorder-recommendations/:clientId
 * Get smart reorder recommendations
 */
router.get(
  "/reorder-recommendations/:clientId",
  requireClientAccess,
  asyncHandler(async (req: Request, res: Response) => {
    const { clientId } = req.params as { clientId: string };
    const recommendations = await analyticsService.getReorderRecommendations(clientId);
    res.json(successResponse(recommendations));
  })
);

/**
 * GET /api/analytics/stockout-predictions/:clientId
 * Get stockout countdown predictions with urgency levels
 */
router.get(
  "/stockout-predictions/:clientId",
  requireClientAccess,
  asyncHandler(async (req: Request, res: Response) => {
    const { clientId } = req.params as { clientId: string };
    const predictions = await analyticsService.getStockoutPredictions(clientId);
    res.json(successResponse(predictions));
  })
);

/**
 * GET /api/analytics/intelligent-summary/:clientId
 * Get comprehensive intelligent dashboard summary
 */
router.get(
  "/intelligent-summary/:clientId",
  requireClientAccess,
  asyncHandler(async (req: Request, res: Response) => {
    const { clientId } = req.params as { clientId: string };
    const summary = await analyticsService.getIntelligentDashboardSummary(clientId);
    res.json(successResponse(summary));
  })
);

/**
 * GET /api/analytics/monthly-trends/:clientId
 * Get monthly trend data for charts
 */
router.get(
  "/monthly-trends/:clientId",
  requireClientAccess,
  asyncHandler(async (req: Request, res: Response) => {
    const { clientId } = req.params as { clientId: string };
    const months = parseInt(req.query.months as string) || 12;
    const trends = await analyticsService.getMonthlyTrends(clientId, months);
    res.json(successResponse(trends));
  })
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
  asyncHandler(async (req: Request, res: Response) => {
    const { clientId } = req.params as { clientId: string };
    const summary = await analyticsService.getStockHealthSummary(clientId);
    res.json(successResponse(summary));
  })
);

// =============================================================================
// Stock Intelligence - Configurable thresholds and detailed analysis
// =============================================================================

/**
 * GET /api/analytics/stock-intelligence/:clientId
 * Get comprehensive stock intelligence with configurable thresholds
 */
router.get(
  "/stock-intelligence/:clientId",
  requireClientAccess,
  asyncHandler(async (req: Request, res: Response) => {
    const { clientId } = req.params as { clientId: string };
    const intelligence = await stockIntelligenceService.getClientStockIntelligence(clientId);
    res.json(successResponse(intelligence));
  })
);

/**
 * GET /api/analytics/stock-config/:clientId
 * Get stock health configuration for a client
 */
router.get(
  "/stock-config/:clientId",
  requireClientAccess,
  asyncHandler(async (req: Request, res: Response) => {
    const { clientId } = req.params as { clientId: string };
    const config = await stockIntelligenceService.getClientStockHealthConfig(clientId);
    res.json(successResponse(config));
  })
);

/**
 * PATCH /api/analytics/stock-config/:clientId
 * Update stock health configuration for a client
 */
router.patch(
  "/stock-config/:clientId",
  requireClientAccess,
  asyncHandler(async (req: Request, res: Response) => {
    const { clientId } = req.params as { clientId: string };
    const { criticalWeeks, lowWeeks, watchWeeks, overstockMonths } = req.body;

    const config = await stockIntelligenceService.updateClientStockHealthConfig(clientId, {
      criticalWeeks,
      lowWeeks,
      watchWeeks,
      overstockMonths,
    });

    res.json(successResponse(config));
  })
);

export default router;
