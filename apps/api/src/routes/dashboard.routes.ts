// =============================================================================
// DASHBOARD ROUTES (Phase 11)
// Dashboard preferences and widget data endpoints
// =============================================================================

import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import * as dashboardService from '../services/dashboard.service.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// =============================================================================
// Preferences
// =============================================================================

/**
 * GET /api/dashboard/preferences
 * Get user's dashboard preferences
 */
router.get('/preferences', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const preferences = await dashboardService.getDashboardPreferences(user.id);
    res.json({ data: preferences });
  } catch (error) {
    logger.error('Error fetching dashboard preferences', error as Error);
    res.status(500).json({ error: 'Failed to fetch dashboard preferences' });
  }
});

/**
 * PATCH /api/dashboard/preferences
 * Update user's dashboard preferences
 */
router.patch('/preferences', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const updates = req.body;

    const preferences = await dashboardService.updateDashboardPreferences(user.id, updates);
    res.json({ data: preferences });
  } catch (error) {
    logger.error('Error updating dashboard preferences', error as Error);
    res.status(500).json({ error: 'Failed to update dashboard preferences' });
  }
});

// =============================================================================
// Widget Data
// =============================================================================

/**
 * GET /api/dashboard/widgets/kpi
 * Get KPI widget data
 */
router.get('/widgets/kpi', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;

    // Get user's client IDs
    const userClients = await prisma.userClient.findMany({
      where: { userId: user.id },
      select: { clientId: true },
    });

    const clientIds = userClients.map(uc => uc.clientId);

    if (clientIds.length === 0) {
      return res.json({ data: {} });
    }

    const kpiData = await dashboardService.getKPIWidgetData(user.id, clientIds);
    res.json({ data: kpiData });
  } catch (error) {
    logger.error('Error fetching KPI widget data', error as Error);
    res.status(500).json({ error: 'Failed to fetch KPI widget data' });
  }
});

/**
 * GET /api/dashboard/widgets/health-heatmap
 * Get health heatmap widget data
 */
router.get('/widgets/health-heatmap', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;

    // Get user's client IDs
    const userClients = await prisma.userClient.findMany({
      where: { userId: user.id },
      select: { clientId: true },
    });

    const clientIds = userClients.map(uc => uc.clientId);

    if (clientIds.length === 0) {
      return res.json({ data: { clients: [] } });
    }

    const heatmapData = await dashboardService.getHealthHeatmapData(clientIds);
    res.json({ data: heatmapData });
  } catch (error) {
    logger.error('Error fetching health heatmap data', error as Error);
    res.status(500).json({ error: 'Failed to fetch health heatmap data' });
  }
});

/**
 * GET /api/dashboard/widgets/alert-burndown
 * Get alert burndown widget data
 */
router.get('/widgets/alert-burndown', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const days = parseInt(req.query.days as string) || 30;

    // Get user's client IDs
    const userClients = await prisma.userClient.findMany({
      where: { userId: user.id },
      select: { clientId: true },
    });

    const clientIds = userClients.map(uc => uc.clientId);

    if (clientIds.length === 0) {
      return res.json({ data: { dates: [], created: [], resolved: [], cumulative: [] } });
    }

    const burndownData = await dashboardService.getAlertBurndownData(clientIds, days);
    res.json({ data: burndownData });
  } catch (error) {
    logger.error('Error fetching alert burndown data', error as Error);
    res.status(500).json({ error: 'Failed to fetch alert burndown data' });
  }
});

/**
 * GET /api/dashboard/widgets/all
 * Get all widget data in one request
 */
router.get('/widgets/all', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;

    // Get user's client IDs
    const userClients = await prisma.userClient.findMany({
      where: { userId: user.id },
      select: { clientId: true },
    });

    const clientIds = userClients.map(uc => uc.clientId);

    if (clientIds.length === 0) {
      return res.json({
        data: {
          kpi: {},
          healthHeatmap: { clients: [] },
          alertBurndown: { dates: [], created: [], resolved: [], cumulative: [] },
        },
      });
    }

    const [kpi, healthHeatmap, alertBurndown] = await Promise.all([
      dashboardService.getKPIWidgetData(user.id, clientIds),
      dashboardService.getHealthHeatmapData(clientIds),
      dashboardService.getAlertBurndownData(clientIds, 30),
    ]);

    res.json({
      data: {
        kpi,
        healthHeatmap,
        alertBurndown,
      },
    });
  } catch (error) {
    logger.error('Error fetching all widget data', error as Error);
    res.status(500).json({ error: 'Failed to fetch widget data' });
  }
});

export default router;
