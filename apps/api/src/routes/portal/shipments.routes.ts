// =============================================================================
// PORTAL SHIPMENT ROUTES
// Client-facing shipment tracking endpoints
// =============================================================================

import { Router, Request, Response } from "express";
import { portalAuth } from "../../middleware/portal-auth.js";
import * as ShipmentService from "../../services/shipment.service.js";
import * as OrderTimingService from "../../services/order-timing.service.js";

const router = Router();

// =============================================================================
// SHIPMENT TRACKING
// =============================================================================

/**
 * GET /api/portal/shipments
 * List all shipments for the client
 */
router.get("/", portalAuth, async (req: Request, res: Response) => {
  try {
    const clientId = req.portalUser!.clientId;
    const { status, limit = "20", offset = "0" } = req.query;

    const statusFilter = status
      ? (Array.isArray(status) ? status : [status]).map(
          (s) => s as ShipmentService.ShipmentStatus,
        )
      : undefined;

    const result = await ShipmentService.getShipmentsByClient(clientId, {
      status: statusFilter,
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10),
    });

    res.json({
      success: true,
      data: result.shipments,
      pagination: {
        total: result.total,
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10),
      },
    });
  } catch (error) {
    console.error("Error fetching portal shipments:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch shipments",
    });
  }
});

/**
 * GET /api/portal/shipments/active
 * Get active (in-transit) shipments for the client
 */
router.get("/active", portalAuth, async (req: Request, res: Response) => {
  try {
    const clientId = req.portalUser!.clientId;
    const shipments = await ShipmentService.getActiveShipments(clientId);

    res.json({
      success: true,
      data: shipments,
    });
  } catch (error) {
    console.error("Error fetching active shipments:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch active shipments",
    });
  }
});

/**
 * GET /api/portal/shipments/stats
 * Get shipment statistics for the client
 */
router.get("/stats", portalAuth, async (req: Request, res: Response) => {
  try {
    const clientId = req.portalUser!.clientId;
    const stats = await ShipmentService.getShipmentStats(clientId);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error("Error fetching shipment stats:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch shipment statistics",
    });
  }
});

/**
 * GET /api/portal/shipments/:id
 * Get shipment details by ID (with client validation)
 */
router.get("/:id", portalAuth, async (req: Request, res: Response) => {
  try {
    const clientId = req.portalUser!.clientId;
    const { id } = req.params;

    const shipment = await ShipmentService.getShipmentById(id);

    if (!shipment) {
      return res.status(404).json({
        success: false,
        error: "Shipment not found",
      });
    }

    // Verify client ownership
    if (shipment.clientId !== clientId) {
      return res.status(403).json({
        success: false,
        error: "Access denied",
      });
    }

    res.json({
      success: true,
      data: shipment,
    });
  } catch (error) {
    console.error("Error fetching shipment:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch shipment",
    });
  }
});

/**
 * GET /api/portal/shipments/order/:orderRequestId
 * Get shipments for a specific order (with client validation)
 */
router.get(
  "/order/:orderRequestId",
  portalAuth,
  async (req: Request, res: Response) => {
    try {
      const clientId = req.portalUser!.clientId;
      const { orderRequestId } = req.params;

      const shipments =
        await ShipmentService.getShipmentsByOrder(orderRequestId);

      // Filter to only shipments belonging to this client
      const clientShipments = shipments.filter((s) => s.clientId === clientId);

      res.json({
        success: true,
        data: clientShipments,
      });
    } catch (error) {
      console.error("Error fetching order shipments:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch order shipments",
      });
    }
  },
);

/**
 * GET /api/portal/shipments/:id/events
 * Get tracking events for a shipment (with client validation)
 */
router.get("/:id/events", portalAuth, async (req: Request, res: Response) => {
  try {
    const clientId = req.portalUser!.clientId;
    const { id } = req.params;

    // Verify ownership first
    const shipment = await ShipmentService.getShipmentById(id);
    if (!shipment || shipment.clientId !== clientId) {
      return res.status(404).json({
        success: false,
        error: "Shipment not found",
      });
    }

    const events = await ShipmentService.getTrackingEvents(id);

    res.json({
      success: true,
      data: events,
    });
  } catch (error) {
    console.error("Error fetching tracking events:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch tracking events",
    });
  }
});

// =============================================================================
// ORDER TIMING & DEADLINES
// =============================================================================

/**
 * GET /api/portal/shipments/timing/summary
 * Get order timing summary for the client
 */
router.get(
  "/timing/summary",
  portalAuth,
  async (req: Request, res: Response) => {
    try {
      const clientId = req.portalUser!.clientId;
      const summary = await OrderTimingService.getTimingSummary(clientId);

      res.json({
        success: true,
        data: summary,
      });
    } catch (error) {
      console.error("Error fetching timing summary:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch timing summary",
      });
    }
  },
);

/**
 * GET /api/portal/shipments/timing/deadlines
 * Get upcoming order deadlines
 */
router.get(
  "/timing/deadlines",
  portalAuth,
  async (req: Request, res: Response) => {
    try {
      const clientId = req.portalUser!.clientId;
      const { daysAhead = "30", urgency, itemType, limit = "50" } = req.query;

      const urgencyLevels = urgency
        ? (Array.isArray(urgency) ? urgency : [urgency]).map(
            (u) => u as OrderTimingService.UrgencyLevel,
          )
        : undefined;

      const deadlines = await OrderTimingService.getUpcomingDeadlines(
        clientId,
        {
          daysAhead: parseInt(daysAhead as string, 10),
          urgencyLevels,
          itemType: itemType as string | undefined,
          limit: parseInt(limit as string, 10),
        },
      );

      res.json({
        success: true,
        data: deadlines,
      });
    } catch (error) {
      console.error("Error fetching deadlines:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch order deadlines",
      });
    }
  },
);

/**
 * GET /api/portal/shipments/timing/product/:productId
 * Get order timing for a specific product
 */
router.get(
  "/timing/product/:productId",
  portalAuth,
  async (req: Request, res: Response) => {
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
      console.error("Error fetching product timing:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch product timing",
      });
    }
  },
);

export default router;
