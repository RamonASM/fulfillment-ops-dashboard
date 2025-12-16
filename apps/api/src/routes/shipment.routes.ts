// =============================================================================
// SHIPMENT ROUTES (Admin)
// CRUD operations for shipment management
// =============================================================================

import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/auth.js";
import * as ShipmentService from "../services/shipment.service.js";

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

// =============================================================================
// GET ROUTES
// =============================================================================

/**
 * GET /api/shipments
 * List shipments with optional filters
 */
router.get("/", async (req: Request, res) => {
  try {
    const { clientId, status, limit = "50", offset = "0" } = req.query;

    if (!clientId || typeof clientId !== "string") {
      return res.status(400).json({
        success: false,
        error: "clientId query parameter is required",
      });
    }

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
    console.error("Error fetching shipments:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch shipments",
    });
  }
});

/**
 * GET /api/shipments/active/:clientId
 * Get active (in-transit) shipments for a client
 */
router.get("/active/:clientId", async (req: Request, res) => {
  try {
    const { clientId } = req.params;
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
 * GET /api/shipments/stats/:clientId
 * Get shipment statistics for a client
 */
router.get("/stats/:clientId", async (req: Request, res) => {
  try {
    const { clientId } = req.params;
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
 * GET /api/shipments/:id
 * Get shipment details by ID
 */
router.get("/:id", async (req: Request, res) => {
  try {
    const { id } = req.params;
    const shipment = await ShipmentService.getShipmentById(id);

    if (!shipment) {
      return res.status(404).json({
        success: false,
        error: "Shipment not found",
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
 * GET /api/shipments/order/:orderRequestId
 * Get shipments for an order
 */
router.get("/order/:orderRequestId", async (req: Request, res) => {
  try {
    const { orderRequestId } = req.params;
    const shipments = await ShipmentService.getShipmentsByOrder(orderRequestId);

    res.json({
      success: true,
      data: shipments,
    });
  } catch (error) {
    console.error("Error fetching order shipments:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch order shipments",
    });
  }
});

/**
 * GET /api/shipments/:id/events
 * Get tracking events for a shipment
 */
router.get("/:id/events", async (req: Request, res) => {
  try {
    const { id } = req.params;
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
// POST ROUTES
// =============================================================================

/**
 * POST /api/shipments
 * Create a new shipment
 */
router.post("/", async (req: Request, res) => {
  try {
    const {
      orderRequestId,
      clientId,
      carrier,
      carrierName,
      trackingNumber,
      status,
      shippedAt,
      estimatedDelivery,
      destinationCity,
      destinationState,
      packageCount,
      serviceLevel,
      items,
    } = req.body;

    if (!orderRequestId || !clientId || !carrier || !trackingNumber) {
      return res.status(400).json({
        success: false,
        error:
          "orderRequestId, clientId, carrier, and trackingNumber are required",
      });
    }

    const shipment = await ShipmentService.createShipment({
      orderRequestId,
      clientId,
      carrier,
      carrierName,
      trackingNumber,
      status,
      shippedAt: shippedAt ? new Date(shippedAt) : undefined,
      estimatedDelivery: estimatedDelivery
        ? new Date(estimatedDelivery)
        : undefined,
      destinationCity,
      destinationState,
      packageCount,
      serviceLevel,
      createdBy: req.user?.userId,
      items,
    });

    res.status(201).json({
      success: true,
      data: shipment,
    });
  } catch (error) {
    console.error("Error creating shipment:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create shipment",
    });
  }
});

/**
 * POST /api/shipments/:id/status
 * Update shipment status with tracking event
 */
router.post("/:id/status", async (req: Request, res) => {
  try {
    const { id } = req.params;
    const { status, description, location, eventTime } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        error: "status is required",
      });
    }

    const shipment = await ShipmentService.updateShipmentStatus(
      id,
      status as ShipmentService.ShipmentStatus,
      {
        status,
        description: description || undefined,
        location: location || undefined,
        eventTime: eventTime ? new Date(eventTime) : undefined,
      },
    );

    res.json({
      success: true,
      data: shipment,
    });
  } catch (error) {
    console.error("Error updating shipment status:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update shipment status",
    });
  }
});

/**
 * POST /api/shipments/:id/events
 * Add a tracking event to a shipment
 */
router.post("/:id/events", async (req: Request, res) => {
  try {
    const { id } = req.params;
    const { status, description, location, eventTime } = req.body;

    if (!status || !description) {
      return res.status(400).json({
        success: false,
        error: "status and description are required",
      });
    }

    const event = await ShipmentService.addTrackingEvent(id, {
      status,
      description,
      location,
      eventTime: eventTime ? new Date(eventTime) : undefined,
    });

    res.status(201).json({
      success: true,
      data: event,
    });
  } catch (error) {
    console.error("Error adding tracking event:", error);
    res.status(500).json({
      success: false,
      error: "Failed to add tracking event",
    });
  }
});

/**
 * POST /api/shipments/:id/items
 * Add items to a shipment
 */
router.post("/:id/items", async (req: Request, res) => {
  try {
    const { id } = req.params;
    const { items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: "items array is required",
      });
    }

    const shipmentItems = await ShipmentService.addShipmentItems(id, items);

    res.status(201).json({
      success: true,
      data: shipmentItems,
    });
  } catch (error) {
    console.error("Error adding shipment items:", error);
    res.status(500).json({
      success: false,
      error: "Failed to add shipment items",
    });
  }
});

// =============================================================================
// PUT ROUTES
// =============================================================================

/**
 * PUT /api/shipments/:id
 * Update shipment details
 */
router.put("/:id", async (req: Request, res) => {
  try {
    const { id } = req.params;
    const {
      carrier,
      carrierName,
      trackingNumber,
      status,
      shippedAt,
      estimatedDelivery,
      deliveredAt,
      destinationCity,
      destinationState,
      packageCount,
      serviceLevel,
      exceptionReason,
    } = req.body;

    const shipment = await ShipmentService.updateShipment(id, {
      carrier,
      carrierName,
      trackingNumber,
      status,
      shippedAt: shippedAt ? new Date(shippedAt) : undefined,
      estimatedDelivery: estimatedDelivery
        ? new Date(estimatedDelivery)
        : undefined,
      deliveredAt: deliveredAt ? new Date(deliveredAt) : undefined,
      destinationCity,
      destinationState,
      packageCount,
      serviceLevel,
      exceptionReason,
    });

    res.json({
      success: true,
      data: shipment,
    });
  } catch (error) {
    console.error("Error updating shipment:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update shipment",
    });
  }
});

// =============================================================================
// DELETE ROUTES
// =============================================================================

/**
 * DELETE /api/shipments/:id
 * Delete a shipment
 */
router.delete("/:id", async (req: Request, res) => {
  try {
    const { id } = req.params;
    await ShipmentService.deleteShipment(id);

    res.json({
      success: true,
      message: "Shipment deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting shipment:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete shipment",
    });
  }
});

// =============================================================================
// UTILITY ROUTES
// =============================================================================

/**
 * GET /api/shipments/tracking-url
 * Generate tracking URL for carrier/tracking number
 */
router.get("/tracking-url", async (req: Request, res) => {
  try {
    const { carrier, trackingNumber } = req.query;

    if (!carrier || !trackingNumber) {
      return res.status(400).json({
        success: false,
        error: "carrier and trackingNumber are required",
      });
    }

    const url = ShipmentService.generateTrackingUrl(
      carrier as ShipmentService.CarrierType,
      trackingNumber as string,
    );

    res.json({
      success: true,
      data: { trackingUrl: url },
    });
  } catch (error) {
    console.error("Error generating tracking URL:", error);
    res.status(500).json({
      success: false,
      error: "Failed to generate tracking URL",
    });
  }
});

export default router;
