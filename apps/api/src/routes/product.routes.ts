import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticate, requireClientAccess } from "../middleware/auth.js";
import { NotFoundError } from "../middleware/error-handler.js";
import { paginationSchema, searchSchema } from "../lib/validation-schemas.js";
import {
  getBatchUsageMetrics,
  getDefaultUsageMetrics,
  getBatchOnOrderQuantities,
  getDefaultOnOrderInfo,
} from "../lib/batch-loader.js";
import { searchClientProducts } from "../services/search.service.js";
import {
  calculateMonthlyUsage,
  updateProductMonthlyUsage,
  recalculateClientMonthlyUsage,
  getMonthlyUsageBreakdown,
  getUsageTierDisplay,
  calculateSuggestedReorderQuantity,
} from "../services/usage.service.js";
import type {
  StockStatus,
  ProductWithMetrics,
  UsageMetrics,
  StockStatusInfo,
} from "@inventory/shared";
import { STATUS_COLORS } from "@inventory/shared";

const router = Router({ mergeParams: true });

// Apply authentication to all routes
router.use(authenticate);
router.use(requireClientAccess);

// =============================================================================
// VALIDATION SCHEMAS
// Phase 4.2: Using shared validation schemas
// =============================================================================

const productQuerySchema = paginationSchema
  .merge(searchSchema)
  .extend({
    type: z.enum(["evergreen", "event", "completed"]).optional(),
    status: z.string().optional(), // comma-separated status values
    includeOrphans: z.enum(["true", "false"]).optional(),
    sort: z.string().optional().default("-updatedAt"),
    // Date range filters
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional(),
  });

const createProductSchema = z.object({
  productId: z.string().min(1, "Product ID is required"),
  name: z.string().min(1, "Name is required"),
  itemType: z.enum(["evergreen", "event", "completed"]).optional(),
  packSize: z.number().int().positive().optional(),
  notificationPoint: z.number().int().positive().optional(),
  currentStockPacks: z.number().int().min(0).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const updateProductSchema = createProductSchema.partial();

const bulkUpdateSchema = z.object({
  productIds: z.array(z.string().uuid()).min(1).max(500),
  updates: z
    .object({
      itemType: z.enum(["evergreen", "event", "completed"]).optional(),
      notificationPoint: z.number().int().positive().nullable().optional(),
      packSize: z.number().int().positive().optional(),
      isActive: z.boolean().optional(),
      metadata: z.record(z.unknown()).optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: "At least one update field is required",
    }),
});

const mergeProductsSchema = z.object({
  targetProductId: z.string().uuid("Target product ID must be a valid UUID"),
  sourceProductIds: z
    .array(z.string().uuid())
    .min(1, "At least one source product is required")
    .max(10),
  mergeOptions: z
    .object({
      combineStock: z.boolean().default(true),
      transferTransactions: z.boolean().default(true),
      transferAlerts: z.boolean().default(true),
      deleteSourceProducts: z.boolean().default(true),
    })
    .optional(),
});

// =============================================================================
// ROUTES
// =============================================================================

/**
 * @openapi
 * /clients/{clientId}/products:
 *   get:
 *     summary: List products for a client
 *     description: Retrieve paginated list of products with filtering, search, and sorting
 *     tags:
 *       - Products
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/ClientId'
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Limit'
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by product ID or name
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [evergreen, event, completed]
 *         description: Filter by product type
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by stock status (comma-separated)
 *       - in: query
 *         name: includeOrphans
 *         schema:
 *           type: string
 *           enum: ['true', 'false']
 *         description: Include orphaned products
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           default: '-updatedAt'
 *         description: Sort field (prefix with - for descending)
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter by updated after this date
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter by updated before this date
 *     responses:
 *       200:
 *         description: Successfully retrieved products
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         format: uuid
 *                       productId:
 *                         type: string
 *                       name:
 *                         type: string
 *                       itemType:
 *                         type: string
 *                         enum: [evergreen, event, completed]
 *                       stockStatus:
 *                         type: string
 *                       currentStockPacks:
 *                         type: integer
 *                       currentStockUnits:
 *                         type: integer
 *                       weeksRemaining:
 *                         type: number
 *                         nullable: true
 *                 pagination:
 *                   $ref: '#/components/schemas/PaginationMeta'
 *       400:
 *         description: Invalid request parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Client not found
 *       500:
 *         description: Server error
 */
router.get("/", async (req, res, next) => {
  try {
    const { clientId } = req.params as { clientId: string };
    const query = productQuerySchema.parse(req.query);

    // Parse status filter
    const statusFilter = query.status?.split(",") as StockStatus[] | undefined;

    // Build where clause
    const where: any = {
      clientId,
      isActive: true,
    };

    if (query.type) {
      where.itemType = { equals: query.type, mode: "insensitive" };
    }

    if (query.includeOrphans !== "true") {
      where.isOrphan = false;
    }

    if (query.search) {
      where.OR = [
        { productId: { contains: query.search, mode: "insensitive" } },
        { name: { contains: query.search, mode: "insensitive" } },
      ];
    }

    // Date range filter (by updatedAt)
    if (query.dateFrom || query.dateTo) {
      where.updatedAt = {};
      if (query.dateFrom) {
        where.updatedAt.gte = new Date(query.dateFrom);
      }
      if (query.dateTo) {
        where.updatedAt.lte = new Date(query.dateTo);
      }
    }

    // Get total count
    const total = await prisma.product.count({ where });

    // Parse sort with whitelist validation
    const ALLOWED_SORT_FIELDS = [
      "name",
      "productId",
      "createdAt",
      "updatedAt",
      "currentStockPacks",
      "currentStockUnits",
      "reorderPointPacks",
    ];
    const rawSortField = query.sort.startsWith("-")
      ? query.sort.slice(1)
      : query.sort;
    const sortField = ALLOWED_SORT_FIELDS.includes(rawSortField)
      ? rawSortField
      : "name";
    const sortOrder = query.sort.startsWith("-") ? "desc" : "asc";

    // Get products
    const products = await prisma.product.findMany({
      where,
      orderBy: { [sortField]: sortOrder },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });

    // Diagnostic logging when no products found
    if (products.length === 0 && total > 0) {
      // Products exist but none returned - likely filtering issue
      const diagnostics = {
        clientId,
        requestedType: query.type,
        includeOrphans: query.includeOrphans,
        searchTerm: query.search,
        totalProductsForClient: total,
        filters: {
          itemType: where.itemType,
          isOrphan: where.isOrphan,
          isActive: where.isActive,
        },
      };

      // Get counts by type and orphan status to help diagnose
      const [orphanCount, typeBreakdown] = await Promise.all([
        prisma.product.count({
          where: { clientId, isOrphan: true, isActive: true },
        }),
        prisma.product.groupBy({
          by: ["itemType", "isOrphan"],
          where: { clientId, isActive: true },
          _count: true,
        }),
      ]);

      console.warn("[Products API] Query returned 0 products but total > 0", {
        ...diagnostics,
        orphanCount,
        typeBreakdown: typeBreakdown.map((t) => ({
          itemType: t.itemType,
          isOrphan: t.isOrphan,
          count: t._count,
        })),
        hint:
          orphanCount > 0 && query.includeOrphans !== "true"
            ? `Found ${orphanCount} orphan products - consider includeOrphans=true`
            : "Check itemType filter and search terms",
      });
    } else if (products.length === 0 && total === 0) {
      // No products at all for this client
      console.info("[Products API] No products found for client", {
        clientId,
        hint: "Client has no products - consider importing data",
      });
    }

    // Batch load usage metrics and on-order data for all products (2 queries instead of N*2)
    const productIds = products.map((p) => p.id);
    const [usageMap, onOrderMap] = await Promise.all([
      getBatchUsageMetrics(productIds),
      getBatchOnOrderQuantities(productIds, clientId),
    ]);

    // Enrich products with metrics, status, and on-order data (no additional queries)
    const enrichedProducts: ProductWithMetrics[] = products.map((product) => {
      const usage = usageMap.get(product.id) || getDefaultUsageMetrics();
      const onOrderInfo = onOrderMap.get(product.id) || getDefaultOnOrderInfo();
      const status = getStockStatusInfo(
        product.currentStockPacks,
        product.reorderPointPacks || 0,
        product.packSize,
        usage?.avgDailyUnits || 0,
      );

      return {
        ...product,
        currentStockUnits: product.currentStockPacks * product.packSize,
        reorderPointUnits: (product.reorderPointPacks || 0) * product.packSize,
        usage,
        status,
        // On-order tracking
        onOrderPacks: onOrderInfo.totalOnOrderPacks,
        onOrderUnits: onOrderInfo.totalOnOrderUnits,
        pendingOrders: onOrderInfo.orders,
        hasOnOrder: onOrderInfo.totalOnOrderPacks > 0,
      } as ProductWithMetrics;
    });

    // Filter by status if needed
    let filteredProducts = enrichedProducts;
    if (statusFilter && statusFilter.length > 0) {
      filteredProducts = enrichedProducts.filter((p) =>
        statusFilter.includes(p.status.level),
      );
    }

    // Calculate status counts
    const statusCounts = {
      healthy: enrichedProducts.filter((p) => p.status.level === "healthy")
        .length,
      watch: enrichedProducts.filter((p) => p.status.level === "watch").length,
      low: enrichedProducts.filter((p) => p.status.level === "low").length,
      critical: enrichedProducts.filter((p) => p.status.level === "critical")
        .length,
      stockout: enrichedProducts.filter((p) => p.status.level === "stockout")
        .length,
    };

    // Get item type counts for smart tab switching (efficient groupBy query)
    const itemTypeGrouped = await prisma.product.groupBy({
      by: ["itemType"],
      where: {
        clientId,
        isActive: true,
        ...(query.includeOrphans !== "true" ? { isOrphan: false } : {}),
      },
      _count: true,
    });

    const itemTypeCounts: Record<string, number> = {
      evergreen: 0,
      event: 0,
      completed: 0,
    };
    itemTypeGrouped.forEach((group) => {
      const type = group.itemType?.toLowerCase();
      if (type && type in itemTypeCounts) {
        itemTypeCounts[type] = group._count;
      }
    });

    res.json({
      data: filteredProducts,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
      meta: {
        statusCounts,
        itemTypeCounts,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/clients/:clientId/products/:productId
 * Get a specific product
 */
router.get("/:productId", async (req, res, next) => {
  try {
    const { clientId, productId } = req.params as {
      clientId: string;
      productId: string;
    };

    const product = await prisma.product.findFirst({
      where: {
        id: productId,
        clientId,
      },
    });

    if (!product) {
      throw new NotFoundError("Product");
    }

    // Batch load with single ID (still uses cache)
    const [usageMap, onOrderMap] = await Promise.all([
      getBatchUsageMetrics([product.id]),
      getBatchOnOrderQuantities([product.id], clientId),
    ]);
    const usage = usageMap.get(product.id) || getDefaultUsageMetrics();
    const onOrderInfo = onOrderMap.get(product.id) || getDefaultOnOrderInfo();
    const status = getStockStatusInfo(
      product.currentStockPacks,
      product.reorderPointPacks || 0,
      product.packSize,
      usage?.avgDailyUnits || 0,
    );

    res.json({
      ...product,
      currentStockUnits: product.currentStockPacks * product.packSize,
      reorderPointUnits: (product.reorderPointPacks || 0) * product.packSize,
      usage,
      status,
      // On-order tracking
      onOrderPacks: onOrderInfo.totalOnOrderPacks,
      onOrderUnits: onOrderInfo.totalOnOrderUnits,
      pendingOrders: onOrderInfo.orders,
      hasOnOrder: onOrderInfo.totalOnOrderPacks > 0,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /clients/{clientId}/products:
 *   post:
 *     summary: Create a new product
 *     description: Create a new product for a client
 *     tags:
 *       - Products
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/ClientId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - productId
 *               - name
 *             properties:
 *               productId:
 *                 type: string
 *                 description: Unique product identifier
 *                 example: 'WIDGET-001'
 *               name:
 *                 type: string
 *                 description: Product name
 *                 example: 'Blue Widget'
 *               itemType:
 *                 type: string
 *                 enum: [evergreen, event, completed]
 *                 default: evergreen
 *                 description: Product type
 *               packSize:
 *                 type: integer
 *                 minimum: 1
 *                 description: Units per pack
 *                 example: 12
 *               notificationPoint:
 *                 type: integer
 *                 minimum: 1
 *                 description: Reorder point in packs
 *                 example: 10
 *               currentStockPacks:
 *                 type: integer
 *                 minimum: 0
 *                 description: Current stock in packs
 *                 example: 25
 *               metadata:
 *                 type: object
 *                 description: Additional product metadata
 *                 additionalProperties: true
 *     responses:
 *       201:
 *         description: Product created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *                 productId:
 *                   type: string
 *                 name:
 *                   type: string
 *                 itemType:
 *                   type: string
 *                 packSize:
 *                   type: integer
 *                 currentStockPacks:
 *                   type: integer
 *       400:
 *         description: Invalid request body
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Client not found
 *       500:
 *         description: Server error
 */
router.post("/", async (req, res, next) => {
  try {
    const { clientId } = req.params as { clientId: string };
    const data = createProductSchema.parse(req.body);

    const product = await prisma.product.create({
      data: {
        clientId,
        productId: data.productId,
        name: data.name,
        itemType: data.itemType || "evergreen",
        packSize: data.packSize || 1,
        notificationPoint: data.notificationPoint,
        currentStockPacks: data.currentStockPacks || 0,
        metadata: (data.metadata || {}) as any,
      },
    });

    res.status(201).json(product);
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/clients/:clientId/products/:productId
 * Update a product
 */
router.patch("/:productId", async (req, res, next) => {
  try {
    const { productId } = req.params;
    const data = updateProductSchema.parse(req.body);

    const product = await prisma.product.update({
      where: { id: productId },
      data: data as any,
    });

    res.json(product);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/clients/:clientId/products/:productId
 * Soft delete a product
 */
router.delete("/:productId", async (req, res, next) => {
  try {
    const { productId } = req.params;

    await prisma.product.update({
      where: { id: productId },
      data: { isActive: false },
    });

    res.json({ message: "Product deleted successfully" });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/clients/:clientId/products/search
 * Search products within a client
 */
router.get("/search", async (req, res, next) => {
  try {
    const { clientId } = req.params as { clientId: string };
    const { q, limit, includeInactive } = req.query;

    if (!q || typeof q !== "string") {
      return res.status(400).json({
        code: "MISSING_QUERY",
        message: "Search query (q) is required",
      });
    }

    const results = await searchClientProducts(clientId, q, {
      limit: limit ? parseInt(limit as string) : 50,
      includeInactive: includeInactive === "true",
    });

    res.json({ data: results });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/clients/:clientId/products/bulk
 * Bulk update multiple products
 */
router.patch("/bulk", async (req, res, next) => {
  try {
    const { clientId } = req.params as { clientId: string };
    const { productIds, updates } = bulkUpdateSchema.parse(req.body);

    // Verify all products belong to this client
    const existingProducts = await prisma.product.findMany({
      where: {
        id: { in: productIds },
        clientId,
      },
      select: { id: true },
    });

    const existingIds = new Set(existingProducts.map((p) => p.id));
    const invalidIds = productIds.filter((id) => !existingIds.has(id));

    if (invalidIds.length > 0) {
      return res.status(400).json({
        code: "INVALID_PRODUCTS",
        message: `${invalidIds.length} product(s) not found or do not belong to this client`,
        invalidIds,
      });
    }

    // Build update data
    const updateData: Record<string, unknown> = {};
    if (updates.itemType !== undefined) updateData.itemType = updates.itemType;
    if (updates.notificationPoint !== undefined)
      updateData.notificationPoint = updates.notificationPoint;
    if (updates.packSize !== undefined) updateData.packSize = updates.packSize;
    if (updates.isActive !== undefined) updateData.isActive = updates.isActive;
    if (updates.metadata !== undefined) updateData.metadata = updates.metadata;

    // Perform bulk update
    const result = await prisma.product.updateMany({
      where: {
        id: { in: productIds },
        clientId,
      },
      data: updateData,
    });

    res.json({
      message: `${result.count} products updated successfully`,
      count: result.count,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/clients/:clientId/products/merge
 * Merge duplicate products into a single product
 */
router.post("/merge", async (req, res, next) => {
  try {
    const { clientId } = req.params as { clientId: string };
    const {
      targetProductId,
      sourceProductIds,
      mergeOptions = {},
    } = mergeProductsSchema.parse(req.body);

    const options = {
      combineStock: true,
      transferTransactions: true,
      transferAlerts: true,
      deleteSourceProducts: true,
      ...mergeOptions,
    };

    // Verify target product exists and belongs to client
    const targetProduct = await prisma.product.findFirst({
      where: { id: targetProductId, clientId },
    });

    if (!targetProduct) {
      throw new NotFoundError(
        "Target product not found or does not belong to this client",
      );
    }

    // Verify all source products exist and belong to client
    const sourceProducts = await prisma.product.findMany({
      where: { id: { in: sourceProductIds }, clientId },
    });

    if (sourceProducts.length !== sourceProductIds.length) {
      return res.status(400).json({
        code: "INVALID_SOURCE_PRODUCTS",
        message:
          "One or more source products not found or do not belong to this client",
      });
    }

    // Ensure target is not in source list
    if (sourceProductIds.includes(targetProductId)) {
      return res.status(400).json({
        code: "INVALID_MERGE",
        message: "Target product cannot be in the source products list",
      });
    }

    // Perform merge in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const mergeStats = {
        transactionsTransferred: 0,
        alertsTransferred: 0,
        stockHistoryTransferred: 0,
        usageMetricsMerged: 0,
        stockAdded: 0,
        productsDeleted: 0,
      };

      // 1. Combine stock if enabled
      if (options.combineStock) {
        const totalStockPacks = sourceProducts.reduce(
          (sum, p) => sum + (p.currentStockPacks || 0),
          0,
        );
        const totalStockUnits = sourceProducts.reduce(
          (sum, p) => sum + (p.currentStockUnits || 0),
          0,
        );

        await tx.product.update({
          where: { id: targetProductId },
          data: {
            currentStockPacks:
              (targetProduct.currentStockPacks || 0) + totalStockPacks,
            currentStockUnits:
              (targetProduct.currentStockUnits || 0) + totalStockUnits,
          },
        });
        mergeStats.stockAdded = totalStockUnits;
      }

      // 2. Transfer transactions if enabled
      if (options.transferTransactions) {
        const txResult = await tx.transaction.updateMany({
          where: { productId: { in: sourceProductIds } },
          data: { productId: targetProductId },
        });
        mergeStats.transactionsTransferred = txResult.count;
      }

      // 3. Transfer alerts if enabled
      if (options.transferAlerts) {
        const alertResult = await tx.alert.updateMany({
          where: { productId: { in: sourceProductIds } },
          data: { productId: targetProductId },
        });
        mergeStats.alertsTransferred = alertResult.count;
      }

      // 4. Transfer stock history
      const historyResult = await tx.stockHistory.updateMany({
        where: { productId: { in: sourceProductIds } },
        data: { productId: targetProductId },
      });
      mergeStats.stockHistoryTransferred = historyResult.count;

      // 5. Delete old usage metrics and recalculate
      await tx.usageMetric.deleteMany({
        where: { productId: { in: sourceProductIds } },
      });

      // 6. Delete source products if enabled
      if (options.deleteSourceProducts) {
        await tx.product.deleteMany({
          where: { id: { in: sourceProductIds } },
        });
        mergeStats.productsDeleted = sourceProductIds.length;
      } else {
        // Mark as inactive and orphan
        await tx.product.updateMany({
          where: { id: { in: sourceProductIds } },
          data: { isActive: false, isOrphan: true },
        });
      }

      return mergeStats;
    });

    res.json({
      message: `Successfully merged ${sourceProductIds.length} products into ${targetProduct.name}`,
      targetProductId,
      mergeStats: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/clients/:clientId/products/:productId/regenerate-usage
 * Regenerate usage metrics for a product based on transaction history
 */
router.post("/:productId/regenerate-usage", async (req, res, next) => {
  try {
    const { clientId, productId } = req.params as {
      clientId: string;
      productId: string;
    };

    // Verify product exists
    const product = await prisma.product.findFirst({
      where: { id: productId, clientId },
    });

    if (!product) {
      throw new NotFoundError("Product");
    }

    // Get all transactions for this product
    const transactions = await prisma.transaction.findMany({
      where: { productId },
      orderBy: { dateSubmitted: "asc" },
    });

    // Delete existing usage metrics
    await prisma.usageMetric.deleteMany({
      where: { productId },
    });

    if (transactions.length === 0) {
      return res.json({
        message: "No transactions found for this product",
        metrics: [],
      });
    }

    const now = new Date();
    const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const twelveMonthsAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Calculate metrics for each period
    const threeMonthTxs = transactions.filter(
      (t) => t.dateSubmitted >= threeMonthsAgo,
    );
    const twelveMonthTxs = transactions.filter(
      (t) => t.dateSubmitted >= twelveMonthsAgo,
    );
    const weeklyTxs = transactions.filter((t) => t.dateSubmitted >= oneWeekAgo);

    const usage3mo = threeMonthTxs.reduce(
      (sum, t) => sum + (t.quantityUnits || 0),
      0,
    );
    const usage12mo = twelveMonthTxs.reduce(
      (sum, t) => sum + (t.quantityUnits || 0),
      0,
    );
    const usageWeekly = weeklyTxs.reduce(
      (sum, t) => sum + (t.quantityUnits || 0),
      0,
    );

    const packSize = product.packSize || 1;
    const createdMetrics: any[] = [];

    // 3-month metric
    if (usage3mo > 0) {
      const metric = await prisma.usageMetric.create({
        data: {
          productId,
          periodType: "3_month",
          periodStart: threeMonthsAgo,
          periodEnd: now,
          totalConsumedUnits: usage3mo,
          totalConsumedPacks: Math.ceil(usage3mo / packSize),
          avgDailyUnits: Math.round((usage3mo / 90) * 100) / 100,
          avgDailyPacks: Math.round((usage3mo / 90 / packSize) * 10000) / 10000,
          transactionCount: threeMonthTxs.length,
          calculatedAt: now,
        },
      });
      createdMetrics.push(metric);
    }

    // 12-month metric
    if (usage12mo > 0) {
      const metric = await prisma.usageMetric.create({
        data: {
          productId,
          periodType: "12_month",
          periodStart: twelveMonthsAgo,
          periodEnd: now,
          totalConsumedUnits: usage12mo,
          totalConsumedPacks: Math.ceil(usage12mo / packSize),
          avgDailyUnits: Math.round((usage12mo / 365) * 100) / 100,
          avgDailyPacks:
            Math.round((usage12mo / 365 / packSize) * 10000) / 10000,
          transactionCount: twelveMonthTxs.length,
          calculatedAt: now,
        },
      });
      createdMetrics.push(metric);
    }

    // Weekly metric
    const weeklyMetric = await prisma.usageMetric.create({
      data: {
        productId,
        periodType: "weekly",
        periodStart: oneWeekAgo,
        periodEnd: now,
        totalConsumedUnits: usageWeekly,
        totalConsumedPacks: Math.ceil(usageWeekly / packSize),
        avgDailyUnits: Math.round((usageWeekly / 7) * 100) / 100,
        avgDailyPacks: Math.round((usageWeekly / 7 / packSize) * 10000) / 10000,
        transactionCount: weeklyTxs.length,
        calculatedAt: now,
      },
    });
    createdMetrics.push(weeklyMetric);

    // Determine calculation tier and update product
    let usageCalculationTier = "none";
    let avgDailyUsage = 0;

    if (usage12mo > 0 && transactions.length > 0) {
      const daysDiff = Math.ceil(
        (now.getTime() - transactions[0].dateSubmitted.getTime()) /
          (1000 * 60 * 60 * 24),
      );
      if (daysDiff >= 365) {
        avgDailyUsage = Math.round((usage12mo / 365) * 100) / 100;
        usageCalculationTier = "12_month";
      } else if (daysDiff >= 90 && usage3mo > 0) {
        avgDailyUsage = Math.round((usage3mo / 90) * 100) / 100;
        usageCalculationTier = "3_month";
      } else if (usageWeekly > 0) {
        avgDailyUsage = Math.round((usageWeekly / 7) * 100) / 100;
        usageCalculationTier = "weekly";
      }
    }

    // Update product with new usage data
    await prisma.product.update({
      where: { id: productId },
      data: {
        avgDailyUsage,
        metadata: {
          ...((product.metadata as Record<string, unknown>) || {}),
          usageCalculationTier,
          usage3MonthUnits: usage3mo,
          usage12MonthUnits: usage12mo,
          usageWeeklyUnits: usageWeekly,
          monthlyUsage3mo: Math.round(usage3mo / 3),
          monthlyUsage12mo: Math.round(usage12mo / 12),
          usageRegeneratedAt: now.toISOString(),
        },
      },
    });

    res.json({
      message: `Usage metrics regenerated for ${product.name}`,
      productId,
      usageCalculationTier,
      avgDailyUsage,
      monthlyUsage3mo: Math.round(usage3mo / 3),
      monthlyUsage12mo: Math.round(usage12mo / 12),
      metricsCreated: createdMetrics.length,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/clients/:clientId/products/:productId/usage
 * Get product usage metrics
 */
router.get("/:productId/usage", async (req, res, next) => {
  try {
    const { productId } = req.params;

    const metrics = await prisma.usageMetric.findMany({
      where: { productId },
      orderBy: { periodStart: "desc" },
      take: 12,
    });

    res.json({ data: metrics });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/clients/:clientId/products/:productId/history
 * Get product stock history
 */
router.get("/:productId/history", async (req, res, next) => {
  try {
    const { productId } = req.params;

    const history = await prisma.stockHistory.findMany({
      where: { productId },
      orderBy: { recordedAt: "desc" },
      take: 30,
    });

    res.json({ data: history });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/clients/:clientId/products/:productId/transactions
 * Get product transactions
 */
router.get("/:productId/transactions", async (req, res, next) => {
  try {
    const { productId } = req.params;
    const { limit = "20" } = req.query;

    const transactions = await prisma.transaction.findMany({
      where: { productId },
      orderBy: { dateSubmitted: "desc" },
      take: parseInt(limit as string),
    });

    res.json({ data: transactions });
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// PHASE 13: MONTHLY USAGE INTELLIGENCE ENDPOINTS
// =============================================================================

/**
 * GET /api/clients/:clientId/products/:productId/monthly-usage
 * Get monthly usage with tier transparency
 * Returns calculation tier (12-mo, 6-mo, 3-mo, <3mo), confidence level,
 * monthly breakdown, and suggested reorder quantity.
 */
router.get("/:productId/monthly-usage", async (req, res, next) => {
  try {
    const { clientId, productId } = req.params as {
      clientId: string;
      productId: string;
    };

    // Verify product belongs to client
    const product = await prisma.product.findFirst({
      where: { id: productId, clientId },
    });

    if (!product) {
      throw new NotFoundError("Product");
    }

    // Calculate monthly usage with tier transparency
    const usageResult = await calculateMonthlyUsage(productId);

    // Get monthly breakdown (last 12 months)
    const monthlyBreakdown = await getMonthlyUsageBreakdown(productId, 12);

    // Get tier display info for UI
    const tierDisplay = getUsageTierDisplay(usageResult.calculationTier);

    // Calculate suggested reorder quantity
    const suggestion = calculateSuggestedReorderQuantity(
      usageResult.monthlyUsageUnits,
      product.currentStockUnits,
      product.packSize,
    );

    res.json({
      productId: product.id,
      productName: product.name,
      sku: product.productId,
      packSize: product.packSize,
      currentStock: {
        packs: product.currentStockPacks,
        units: product.currentStockUnits,
      },
      monthlyUsage: {
        units: Math.round(usageResult.monthlyUsageUnits * 10) / 10,
        packs: Math.round(usageResult.monthlyUsagePacks * 10) / 10,
      },
      calculation: {
        tier: usageResult.calculationTier,
        tierDisplay,
        confidence: usageResult.confidence,
        dataMonths: usageResult.dataMonths,
        calculatedAt: usageResult.calculatedAt,
      },
      runway: {
        weeksRemaining: suggestion.weeksRemaining,
      },
      suggestion: {
        suggestedPacks: suggestion.suggestedPacks,
        suggestedUnits: suggestion.suggestedUnits,
      },
      monthlyBreakdown,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/clients/:clientId/products/:productId/recalculate-monthly-usage
 * Recalculate and store monthly usage for a single product
 */
router.post("/:productId/recalculate-monthly-usage", async (req, res, next) => {
  try {
    const { clientId, productId } = req.params as {
      clientId: string;
      productId: string;
    };

    // Verify product belongs to client
    const product = await prisma.product.findFirst({
      where: { id: productId, clientId },
    });

    if (!product) {
      throw new NotFoundError("Product");
    }

    // Recalculate and update
    await updateProductMonthlyUsage(productId);

    // Fetch updated product
    const updatedProduct = await prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        productId: true,
        name: true,
        monthlyUsageUnits: true,
        monthlyUsagePacks: true,
        usageCalculationTier: true,
        usageConfidence: true,
        usageDataMonths: true,
        usageLastCalculated: true,
      },
    });

    res.json({
      message: `Monthly usage recalculated for ${product.name}`,
      product: updatedProduct,
    });
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function getStockStatusInfo(
  currentStockPacks: number,
  reorderPointPacks: number,
  packSize: number,
  avgDailyUnits: number,
): StockStatusInfo {
  const currentUnits = currentStockPacks * packSize;
  const reorderUnits = reorderPointPacks * packSize;

  if (currentUnits === 0) {
    return {
      level: "stockout",
      weeksRemaining: 0,
      color: STATUS_COLORS.stockout,
      percentOfReorderPoint: 0,
    };
  }

  const weeksRemaining =
    avgDailyUnits > 0 ? currentUnits / avgDailyUnits / 7 : Infinity;

  const percentOfReorderPoint =
    reorderUnits > 0 ? (currentUnits / reorderUnits) * 100 : 100;

  let level: StockStatus;
  if (percentOfReorderPoint <= 50 || weeksRemaining < 2) {
    level = "critical";
  } else if (percentOfReorderPoint <= 100 || weeksRemaining < 4) {
    level = "low";
  } else if (percentOfReorderPoint <= 150 || weeksRemaining < 6) {
    level = "watch";
  } else {
    level = "healthy";
  }

  return {
    level,
    weeksRemaining:
      weeksRemaining === Infinity ? 999 : Number(weeksRemaining.toFixed(1)),
    color: STATUS_COLORS[level],
    percentOfReorderPoint: Math.round(percentOfReorderPoint),
  };
}

export default router;
