// =============================================================================
// LOCATION ANALYTICS ROUTES
// API endpoints for geographic performance visualization
// =============================================================================

import express from "express";
import {
  getLocationPerformance,
  getRegionalAnalytics,
  getEnhancedLocationPerformance,
  getRegionalPerformanceSummary,
} from "../services/location-analytics.service.js";
import { authenticate } from "../middleware/auth.js";
import { requireClientAccess } from "../middleware/auth.js";

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

// =============================================================================
// LOCATION PERFORMANCE
// =============================================================================

/**
 * GET /api/location-analytics/:clientId/performance
 * Get performance metrics for all client locations (for map visualization)
 */
router.get("/:clientId/performance", requireClientAccess, async (req, res) => {
  try {
    const { clientId } = req.params;

    const locations = await getLocationPerformance(clientId);

    res.json({
      success: true,
      data: locations,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch location performance",
    });
  }
});

/**
 * GET /api/location-analytics/:clientId/regional
 * Get aggregated regional analytics
 */
router.get("/:clientId/regional", requireClientAccess, async (req, res) => {
  try {
    const { clientId } = req.params;

    const analytics = await getRegionalAnalytics(clientId);

    res.json({
      success: true,
      data: analytics,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch regional analytics",
    });
  }
});

// =============================================================================
// ENHANCED PERFORMANCE (Combined Scoring)
// =============================================================================

/**
 * GET /api/location-analytics/:clientId/enhanced-performance
 * Get enhanced location performance with combined scoring (volume + frequency + health)
 */
router.get(
  "/:clientId/enhanced-performance",
  requireClientAccess,
  async (req, res) => {
    try {
      const { clientId } = req.params;

      const locations = await getEnhancedLocationPerformance(clientId);

      res.json({
        success: true,
        data: locations,
      });
    } catch (error) {
      console.error("Error fetching enhanced location performance:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch enhanced location performance",
      });
    }
  },
);

/**
 * GET /api/location-analytics/:clientId/regional-summary
 * Get regional performance summary aggregated by state
 */
router.get(
  "/:clientId/regional-summary",
  requireClientAccess,
  async (req, res) => {
    try {
      const { clientId } = req.params;

      const summary = await getRegionalPerformanceSummary(clientId);

      res.json({
        success: true,
        data: summary,
      });
    } catch (error) {
      console.error("Error fetching regional performance summary:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch regional performance summary",
      });
    }
  },
);

export default router;
