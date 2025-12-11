// =============================================================================
// ANALYTICS ROUTES (Phase 11)
// Pre-aggregated analytics and trend endpoints
// =============================================================================

import { Router, Request, Response } from 'express';
import { authenticate, requireClientAccess } from '../middleware/auth.js';
import { logger } from '../lib/logger.js';
import * as analyticsService from '../services/analytics.service.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// =============================================================================
// Daily Summary
// =============================================================================

/**
 * GET /api/analytics/daily-summary/:clientId
 * Get daily summary metrics for a client
 */
router.get('/daily-summary/:clientId', requireClientAccess, async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params as { clientId: string };
    const days = parseInt(req.query.days as string) || 30;

    const summary = await analyticsService.getDailySummary(clientId, days);
    res.json({ data: summary });
  } catch (error) {
    logger.error('Error fetching daily summary', error as Error);
    res.status(500).json({ error: 'Failed to fetch daily summary' });
  }
});

// =============================================================================
// Inventory Health
// =============================================================================

/**
 * GET /api/analytics/inventory-health
 * Get overall inventory health metrics across all clients
 */
router.get('/inventory-health', async (req: Request, res: Response) => {
  try {
    const health = await analyticsService.getInventoryHealth();
    res.json({ data: health });
  } catch (error) {
    logger.error('Error fetching inventory health', error as Error);
    res.status(500).json({ error: 'Failed to fetch inventory health' });
  }
});

// =============================================================================
// Alert Trends
// =============================================================================

/**
 * GET /api/analytics/alert-trends/:clientId
 * Get alert trends for a client
 */
router.get('/alert-trends/:clientId', requireClientAccess, async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params as { clientId: string };
    const days = parseInt(req.query.days as string) || 30;

    const trends = await analyticsService.getAlertTrends(clientId, days);
    res.json({ data: trends });
  } catch (error) {
    logger.error('Error fetching alert trends', error as Error);
    res.status(500).json({ error: 'Failed to fetch alert trends' });
  }
});

// =============================================================================
// Portfolio Risk
// =============================================================================

/**
 * GET /api/analytics/portfolio-risk
 * Get portfolio risk analysis across all clients
 */
router.get('/portfolio-risk', async (req: Request, res: Response) => {
  try {
    const risk = await analyticsService.getPortfolioRisk();
    res.json({ data: risk });
  } catch (error) {
    logger.error('Error fetching portfolio risk', error as Error);
    res.status(500).json({ error: 'Failed to fetch portfolio risk' });
  }
});

// =============================================================================
// Inventory Turnover
// =============================================================================

/**
 * GET /api/analytics/inventory-turnover/:clientId
 * Get inventory turnover metrics for a client
 */
router.get('/inventory-turnover/:clientId', requireClientAccess, async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params as { clientId: string };
    const months = parseInt(req.query.months as string) || 12;

    const turnover = await analyticsService.getInventoryTurnover(clientId, months);
    res.json({ data: turnover });
  } catch (error) {
    logger.error('Error fetching inventory turnover', error as Error);
    res.status(500).json({ error: 'Failed to fetch inventory turnover' });
  }
});

// =============================================================================
// Forecast Accuracy
// =============================================================================

/**
 * GET /api/analytics/forecast-accuracy/:clientId
 * Get forecast accuracy metrics for a client
 */
router.get('/forecast-accuracy/:clientId', requireClientAccess, async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params as { clientId: string };
    const days = parseInt(req.query.days as string) || 30;

    const accuracy = await analyticsService.getForecastAccuracy(clientId, days);
    res.json({ data: accuracy });
  } catch (error) {
    logger.error('Error fetching forecast accuracy', error as Error);
    res.status(500).json({ error: 'Failed to fetch forecast accuracy' });
  }
});

export default router;
