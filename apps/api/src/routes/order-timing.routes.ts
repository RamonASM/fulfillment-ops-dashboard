// =============================================================================
// ORDER TIMING ROUTES (Admin)
// Lead time management and order deadline calculations
// =============================================================================

import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/auth.js";
import * as OrderTimingService from "../services/order-timing.service.js";
import { logger } from "../lib/logger.js";

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

// =============================================================================
// TIMING SUMMARY & DEADLINES
// =============================================================================

/**
 * GET /api/order-timing/:clientId
 * Get timing summary for a client
 */
router.get("/:clientId", async (req: Request, res) => {
  try {
    const { clientId } = req.params;
    const summary = await OrderTimingService.getTimingSummary(clientId);

    res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    logger.error("Error fetching timing summary:", error instanceof Error ? error : null);
    res.status(500).json({
      success: false,
      error: "Failed to fetch timing summary",
    });
  }
});

/**
 * GET /api/order-timing/:clientId/deadlines
 * Get upcoming order deadlines for a client
 */
router.get("/:clientId/deadlines", async (req: Request, res) => {
  try {
    const { clientId } = req.params;
    const { daysAhead = "30", urgency, itemType, limit = "50" } = req.query;

    const urgencyLevels = urgency
      ? (Array.isArray(urgency) ? urgency : [urgency]).map(
          (u) => u as OrderTimingService.UrgencyLevel,
        )
      : undefined;

    // Normalize itemType to lowercase for case-insensitive filtering
    const normalizedItemType = itemType
      ? String(itemType).toLowerCase()
      : undefined;

    const deadlines = await OrderTimingService.getUpcomingDeadlines(clientId, {
      daysAhead: parseInt(daysAhead as string, 10),
      urgencyLevels,
      itemType: normalizedItemType,
      limit: parseInt(limit as string, 10),
    });

    res.json({
      success: true,
      data: deadlines,
    });
  } catch (error) {
    logger.error("Error fetching deadlines:", error instanceof Error ? error : null);
    res.status(500).json({
      success: false,
      error: "Failed to fetch order deadlines",
    });
  }
});

/**
 * GET /api/order-timing/product/:productId
 * Get order timing for a specific product
 */
router.get("/product/:productId", async (req: Request, res) => {
  try {
    const { productId } = req.params;
    const timing =
      await OrderTimingService.calculateProductOrderTiming(productId);

    if (!timing) {
      return res.status(404).json({
        success: false,
        error: "Product not found",
      });
    }

    res.json({
      success: true,
      data: timing,
    });
  } catch (error) {
    logger.error("Error fetching product timing:", error instanceof Error ? error : null);
    res.status(500).json({
      success: false,
      error: "Failed to fetch product timing",
    });
  }
});

// =============================================================================
// CLIENT TIMING DEFAULTS
// =============================================================================

/**
 * GET /api/order-timing/:clientId/defaults
 * Get timing defaults for a client
 */
router.get("/:clientId/defaults", async (req: Request, res) => {
  try {
    const { clientId } = req.params;
    const defaults = await OrderTimingService.getClientTimingDefaults(clientId);

    res.json({
      success: true,
      data: defaults,
    });
  } catch (error) {
    logger.error("Error fetching timing defaults:", error instanceof Error ? error : null);
    res.status(500).json({
      success: false,
      error: "Failed to fetch timing defaults",
    });
  }
});

/**
 * PUT /api/order-timing/:clientId/defaults
 * Update timing defaults for a client
 */
router.put("/:clientId/defaults", async (req: Request, res) => {
  try {
    const { clientId } = req.params;
    const {
      defaultSupplierLeadDays,
      defaultShippingDays,
      defaultProcessingDays,
      defaultSafetyBufferDays,
      alertDaysBeforeDeadline,
    } = req.body;

    await OrderTimingService.updateClientTimingDefaults(clientId, {
      defaultSupplierLeadDays,
      defaultShippingDays,
      defaultProcessingDays,
      defaultSafetyBufferDays,
      alertDaysBeforeDeadline,
    });

    const updated = await OrderTimingService.getClientTimingDefaults(clientId);

    res.json({
      success: true,
      data: updated,
      message: "Timing defaults updated successfully",
    });
  } catch (error) {
    logger.error("Error updating timing defaults:", error instanceof Error ? error : null);
    res.status(500).json({
      success: false,
      error: "Failed to update timing defaults",
    });
  }
});

// =============================================================================
// PRODUCT LEAD TIME MANAGEMENT
// =============================================================================

/**
 * PATCH /api/order-timing/product/:productId/lead-time
 * Update lead time for a specific product
 */
router.patch("/product/:productId/lead-time", async (req: Request, res) => {
  try {
    const { productId } = req.params;
    const {
      supplierLeadDays,
      shippingLeadDays,
      processingLeadDays,
      safetyBufferDays,
    } = req.body;

    await OrderTimingService.updateProductLeadTime(productId, {
      supplierLeadDays,
      shippingLeadDays,
      processingLeadDays,
      safetyBufferDays,
    });

    // Return updated timing
    const timing =
      await OrderTimingService.calculateProductOrderTiming(productId);

    res.json({
      success: true,
      data: timing,
      message: "Product lead time updated successfully",
    });
  } catch (error) {
    logger.error("Error updating product lead time:", error instanceof Error ? error : null);
    res.status(500).json({
      success: false,
      error: "Failed to update product lead time",
    });
  }
});

/**
 * POST /api/order-timing/:clientId/bulk-lead-times
 * Bulk update lead times from CSV data
 */
router.post("/:clientId/bulk-lead-times", async (req: Request, res) => {
  try {
    const { clientId } = req.params;
    const { updates } = req.body;

    if (!updates || !Array.isArray(updates)) {
      return res.status(400).json({
        success: false,
        error: "updates array is required",
      });
    }

    const result = await OrderTimingService.bulkUpdateLeadTimes(
      clientId,
      updates,
    );

    res.json({
      success: true,
      data: result,
      message: `Updated ${result.updated} products, ${result.notFound.length} not found`,
    });
  } catch (error) {
    logger.error("Error bulk updating lead times:", error instanceof Error ? error : null);
    res.status(500).json({
      success: false,
      error: "Failed to bulk update lead times",
    });
  }
});

// =============================================================================
// CACHE MANAGEMENT
// =============================================================================

/**
 * POST /api/order-timing/:clientId/recalculate
 * Force recalculation of timing cache for a client
 */
router.post("/:clientId/recalculate", async (req: Request, res) => {
  try {
    const { clientId } = req.params;
    const result = await OrderTimingService.updateClientTimingCache(clientId);

    res.json({
      success: true,
      data: result,
      message: `Recalculated timing for ${result.updated} products`,
    });
  } catch (error) {
    logger.error("Error recalculating timing:", error instanceof Error ? error : null);
    res.status(500).json({
      success: false,
      error: "Failed to recalculate timing",
    });
  }
});

/**
 * POST /api/order-timing/recalculate-stale
 * Recalculate stale timing caches across all clients
 */
router.post("/recalculate-stale", async (req: Request, res) => {
  try {
    const { maxAgeHours = 24 } = req.body;
    const result =
      await OrderTimingService.updateStaleTimingCaches(maxAgeHours);

    res.json({
      success: true,
      data: result,
      message: `Updated ${result.productsUpdated} products across ${result.clientsUpdated} clients`,
    });
  } catch (error) {
    logger.error("Error recalculating stale caches:", error instanceof Error ? error : null);
    res.status(500).json({
      success: false,
      error: "Failed to recalculate stale caches",
    });
  }
});

export default router;
