// =============================================================================
// CLIENT HEALTH ROUTES
// Endpoints for client health scoring and monitoring
// =============================================================================

import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/auth.js";
import { logger } from "../lib/logger.js";
import * as clientHealthService from "../services/client-health.service.js";

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/client-health/:clientId
 * Get health score for a specific client
 */
router.get("/:clientId", async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params as { clientId: string };
    logger.info(`Calculating health score for client: ${clientId}`);
    const healthScore =
      await clientHealthService.calculateClientHealthScore(clientId);
    logger.info(`Health score calculated successfully for client: ${clientId}`);
    res.json({ data: healthScore });
  } catch (error) {
    const err = error as Error;
    logger.error("Error calculating client health score", err);
    logger.error("Error details:", {
      name: err.name,
      message: err.message,
      stack: err.stack,
    });
    res.status(500).json({
      error: "Failed to calculate client health score",
      details: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
});

/**
 * GET /api/client-health
 * Get health scores for all active clients
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const healthScores =
      await clientHealthService.calculateAllClientHealthScores();
    res.json({ data: healthScores });
  } catch (error) {
    logger.error("Error calculating all client health scores", error as Error);
    res
      .status(500)
      .json({ error: "Failed to calculate all client health scores" });
  }
});

export default router;
