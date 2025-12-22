// =============================================================================
// SHIPMENT ROUTES (Admin)
// CRUD operations for shipment management
// =============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { authenticate, requireClientAccess } from "../middleware/auth.js";
import * as ShipmentService from "../services/shipment.service.js";
import { logger } from "../lib/logger.js";

const router = Router();

// =============================================================================
// ZOD VALIDATION SCHEMAS
// =============================================================================

// Enum types matching ShipmentService types exactly
const shipmentStatusEnum = z.enum([
  "pending",
  "label_created",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "exception",
]);

const carrierEnum = z.enum([
  "ups",
  "fedex",
  "usps",
  "dhl",
  "other",
]);

// Query schemas
const listShipmentsQuerySchema = z.object({
  clientId: z.string().uuid("Invalid clientId format"),
  status: z.union([
    shipmentStatusEnum,
    z.array(shipmentStatusEnum),
  ]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const clientIdParamSchema = z.object({
  clientId: z.string().uuid("Invalid clientId format"),
});

const shipmentIdParamSchema = z.object({
  id: z.string().uuid("Invalid shipment ID format"),
});

const orderRequestIdParamSchema = z.object({
  orderRequestId: z.string().uuid("Invalid orderRequestId format"),
});

const trackingUrlQuerySchema = z.object({
  carrier: carrierEnum,
  trackingNumber: z.string().min(1).max(100),
});

// Body schemas - matching CreateShipmentItemInput interface
const shipmentItemSchema = z.object({
  productId: z.string().uuid(),
  orderItemId: z.string().uuid().optional(),
  quantityPacks: z.number().int().min(0),
  quantityUnits: z.number().int().min(0),
});

const createShipmentSchema = z.object({
  orderRequestId: z.string().uuid(),
  clientId: z.string().uuid(),
  carrier: carrierEnum,
  carrierName: z.string().min(1).max(100).optional(),
  trackingNumber: z.string().min(1).max(100),
  status: shipmentStatusEnum.optional().default("pending"),
  shippedAt: z.string().datetime().optional(),
  estimatedDelivery: z.string().datetime().optional(),
  destinationCity: z.string().min(1).max(100).optional(),
  destinationState: z.string().min(2).max(50).optional(),
  packageCount: z.number().int().positive().optional(),
  serviceLevel: z.string().max(100).optional(),
  items: z.array(shipmentItemSchema).optional(),
});

const updateShipmentSchema = z.object({
  carrier: carrierEnum.optional(),
  carrierName: z.string().min(1).max(100).optional(),
  trackingNumber: z.string().min(1).max(100).optional(),
  status: shipmentStatusEnum.optional(),
  shippedAt: z.string().datetime().optional().nullable(),
  estimatedDelivery: z.string().datetime().optional().nullable(),
  deliveredAt: z.string().datetime().optional().nullable(),
  destinationCity: z.string().min(1).max(100).optional(),
  destinationState: z.string().min(2).max(50).optional(),
  packageCount: z.number().int().positive().optional(),
  serviceLevel: z.string().max(100).optional(),
  exceptionReason: z.string().max(500).optional(),
});

const updateStatusSchema = z.object({
  status: shipmentStatusEnum,
  description: z.string().max(500).optional(),
  location: z.string().max(200).optional(),
  eventTime: z.string().datetime().optional(),
});

const addEventSchema = z.object({
  status: z.string().min(1).max(50),
  description: z.string().min(1).max(500),
  location: z.string().max(200).optional(),
  eventTime: z.string().datetime().optional(),
});

const addItemsSchema = z.object({
  items: z.array(shipmentItemSchema).min(1),
});

// =============================================================================
// VALIDATION MIDDLEWARE
// =============================================================================

type ValidationTarget = "body" | "query" | "params";

function validate<T extends z.ZodTypeAny>(
  schema: T,
  target: ValidationTarget = "body"
) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[target]);
    if (!result.success) {
      const errors = result.error.errors.map((e) => ({
        field: e.path.join("."),
        message: e.message,
      }));
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: errors,
      });
    }
    req[target] = result.data;
    next();
  };
}

// Apply authentication and client access control to all routes
router.use(authenticate);
router.use(requireClientAccess);

// =============================================================================
// GET ROUTES
// =============================================================================

/**
 * GET /api/shipments
 * List shipments with optional filters
 */
router.get("/", validate(listShipmentsQuerySchema, "query"), async (req: Request, res: Response) => {
  try {
    const { clientId, status, limit, offset } = req.query as unknown as z.infer<typeof listShipmentsQuerySchema>;

    const statusFilter = status
      ? (Array.isArray(status) ? status : [status]) as ShipmentService.ShipmentStatus[]
      : undefined;

    const result = await ShipmentService.getShipmentsByClient(clientId, {
      status: statusFilter,
      limit,
      offset,
    });

    res.json({
      success: true,
      data: result.shipments,
      pagination: {
        total: result.total,
        limit,
        offset,
      },
    });
  } catch (error) {
    logger.error("Error fetching shipments", error as Error);
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
router.get("/active/:clientId", validate(clientIdParamSchema, "params"), async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params as z.infer<typeof clientIdParamSchema>;
    const shipments = await ShipmentService.getActiveShipments(clientId);

    res.json({
      success: true,
      data: shipments,
    });
  } catch (error) {
    logger.error("Error fetching active shipments", error as Error);
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
router.get("/stats/:clientId", validate(clientIdParamSchema, "params"), async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params as z.infer<typeof clientIdParamSchema>;
    const stats = await ShipmentService.getShipmentStats(clientId);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error("Error fetching shipment stats", error as Error);
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
router.get("/:id", validate(shipmentIdParamSchema, "params"), async (req: Request, res: Response) => {
  try {
    const { id } = req.params as z.infer<typeof shipmentIdParamSchema>;
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
    logger.error("Error fetching shipment", error as Error);
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
router.get("/order/:orderRequestId", validate(orderRequestIdParamSchema, "params"), async (req: Request, res: Response) => {
  try {
    const { orderRequestId } = req.params as z.infer<typeof orderRequestIdParamSchema>;
    const shipments = await ShipmentService.getShipmentsByOrder(orderRequestId);

    res.json({
      success: true,
      data: shipments,
    });
  } catch (error) {
    logger.error("Error fetching order shipments", error as Error);
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
router.get("/:id/events", validate(shipmentIdParamSchema, "params"), async (req: Request, res: Response) => {
  try {
    const { id } = req.params as z.infer<typeof shipmentIdParamSchema>;
    const events = await ShipmentService.getTrackingEvents(id);

    res.json({
      success: true,
      data: events,
    });
  } catch (error) {
    logger.error("Error fetching tracking events", error as Error);
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
router.post("/", validate(createShipmentSchema, "body"), async (req: Request, res: Response) => {
  try {
    const data = req.body as z.infer<typeof createShipmentSchema>;

    const shipment = await ShipmentService.createShipment({
      orderRequestId: data.orderRequestId,
      clientId: data.clientId,
      carrier: data.carrier,
      carrierName: data.carrierName,
      trackingNumber: data.trackingNumber,
      status: data.status,
      shippedAt: data.shippedAt ? new Date(data.shippedAt) : undefined,
      estimatedDelivery: data.estimatedDelivery ? new Date(data.estimatedDelivery) : undefined,
      destinationCity: data.destinationCity,
      destinationState: data.destinationState,
      packageCount: data.packageCount,
      serviceLevel: data.serviceLevel,
      createdBy: req.user?.userId,
      items: data.items,
    });

    res.status(201).json({
      success: true,
      data: shipment,
    });
  } catch (error) {
    logger.error("Error creating shipment", error as Error);
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
router.post(
  "/:id/status",
  validate(shipmentIdParamSchema, "params"),
  validate(updateStatusSchema, "body"),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params as z.infer<typeof shipmentIdParamSchema>;
      const data = req.body as z.infer<typeof updateStatusSchema>;

      // Zod validation guarantees status is defined - create typed variable
      const validatedStatus = data.status as ShipmentService.ShipmentStatus;

      const shipment = await ShipmentService.updateShipmentStatus(
        id,
        validatedStatus,
        {
          status: validatedStatus,
          // Fallback to empty string triggers service's default description
          description: data.description ?? "",
          location: data.location,
          eventTime: data.eventTime ? new Date(data.eventTime) : undefined,
        },
      );

      res.json({
        success: true,
        data: shipment,
      });
    } catch (error) {
      logger.error("Error updating shipment status", error as Error);
      res.status(500).json({
        success: false,
        error: "Failed to update shipment status",
      });
    }
  }
);

/**
 * POST /api/shipments/:id/events
 * Add a tracking event to a shipment
 */
router.post(
  "/:id/events",
  validate(shipmentIdParamSchema, "params"),
  validate(addEventSchema, "body"),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params as z.infer<typeof shipmentIdParamSchema>;
      const data = req.body as z.infer<typeof addEventSchema>;

      const event = await ShipmentService.addTrackingEvent(id, {
        status: data.status,
        description: data.description,
        location: data.location,
        eventTime: data.eventTime ? new Date(data.eventTime) : undefined,
      });

      res.status(201).json({
        success: true,
        data: event,
      });
    } catch (error) {
      logger.error("Error adding tracking event", error as Error);
      res.status(500).json({
        success: false,
        error: "Failed to add tracking event",
      });
    }
  }
);

/**
 * POST /api/shipments/:id/items
 * Add items to a shipment
 */
router.post(
  "/:id/items",
  validate(shipmentIdParamSchema, "params"),
  validate(addItemsSchema, "body"),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params as z.infer<typeof shipmentIdParamSchema>;
      const { items } = req.body as z.infer<typeof addItemsSchema>;

      const shipmentItems = await ShipmentService.addShipmentItems(id, items);

      res.status(201).json({
        success: true,
        data: shipmentItems,
      });
    } catch (error) {
      logger.error("Error adding shipment items", error as Error);
      res.status(500).json({
        success: false,
        error: "Failed to add shipment items",
      });
    }
  }
);

// =============================================================================
// PUT ROUTES
// =============================================================================

/**
 * PUT /api/shipments/:id
 * Update shipment details
 */
router.put(
  "/:id",
  validate(shipmentIdParamSchema, "params"),
  validate(updateShipmentSchema, "body"),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params as z.infer<typeof shipmentIdParamSchema>;
      const data = req.body as z.infer<typeof updateShipmentSchema>;

      const shipment = await ShipmentService.updateShipment(id, {
        carrier: data.carrier,
        carrierName: data.carrierName,
        trackingNumber: data.trackingNumber,
        status: data.status,
        shippedAt: data.shippedAt ? new Date(data.shippedAt) : undefined,
        estimatedDelivery: data.estimatedDelivery ? new Date(data.estimatedDelivery) : undefined,
        deliveredAt: data.deliveredAt ? new Date(data.deliveredAt) : undefined,
        destinationCity: data.destinationCity,
        destinationState: data.destinationState,
        packageCount: data.packageCount,
        serviceLevel: data.serviceLevel,
        exceptionReason: data.exceptionReason,
      });

      res.json({
        success: true,
        data: shipment,
      });
    } catch (error) {
      logger.error("Error updating shipment", error as Error);
      res.status(500).json({
        success: false,
        error: "Failed to update shipment",
      });
    }
  }
);

// =============================================================================
// DELETE ROUTES
// =============================================================================

/**
 * DELETE /api/shipments/:id
 * Delete a shipment
 */
router.delete("/:id", validate(shipmentIdParamSchema, "params"), async (req: Request, res: Response) => {
  try {
    const { id } = req.params as z.infer<typeof shipmentIdParamSchema>;
    await ShipmentService.deleteShipment(id);

    res.json({
      success: true,
      message: "Shipment deleted successfully",
    });
  } catch (error) {
    logger.error("Error deleting shipment", error as Error);
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
router.get("/tracking-url", validate(trackingUrlQuerySchema, "query"), async (req: Request, res: Response) => {
  try {
    const { carrier, trackingNumber } = req.query as z.infer<typeof trackingUrlQuerySchema>;

    const url = ShipmentService.generateTrackingUrl(
      carrier as ShipmentService.CarrierType,
      trackingNumber,
    );

    res.json({
      success: true,
      data: { trackingUrl: url },
    });
  } catch (error) {
    logger.error("Error generating tracking URL", error as Error);
    res.status(500).json({
      success: false,
      error: "Failed to generate tracking URL",
    });
  }
});

export default router;
