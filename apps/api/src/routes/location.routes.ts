import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticate, requireClientAccess } from '../middleware/auth.js';
import { NotFoundError, ValidationError } from '../middleware/error-handler.js';

const router = Router({ mergeParams: true });

// Apply authentication to all routes
router.use(authenticate);
router.use(requireClientAccess);

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const createLocationSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  code: z.string().min(1, 'Code is required').max(50).regex(/^[A-Z0-9-_]+$/i, 'Code must be alphanumeric with dashes/underscores'),
  address: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  zipCode: z.string().max(20).optional(),
  country: z.string().max(50).optional().default('US'),
  contactName: z.string().max(255).optional(),
  contactEmail: z.string().email().max(255).optional(),
  contactPhone: z.string().max(50).optional(),
  locationType: z.enum(['headquarters', 'branch', 'warehouse', 'store']).optional().default('branch'),
  metadata: z.record(z.unknown()).optional(),
});

const updateLocationSchema = createLocationSchema.partial().omit({ code: true });

const locationQuerySchema = z.object({
  includeInactive: z.enum(['true', 'false']).optional(),
  type: z.enum(['headquarters', 'branch', 'warehouse', 'store']).optional(),
  search: z.string().optional(),
});

// =============================================================================
// ROUTES
// =============================================================================

/**
 * GET /api/clients/:clientId/locations
 * List all locations for a client
 */
router.get('/', async (req, res, next) => {
  try {
    const { clientId } = req.params as { clientId: string };
    const query = locationQuerySchema.parse(req.query);

    const where: any = { clientId };

    if (query.includeInactive !== 'true') {
      where.isActive = true;
    }

    if (query.type) {
      where.locationType = query.type;
    }

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { code: { contains: query.search, mode: 'insensitive' } },
        { city: { contains: query.search, mode: 'insensitive' } },
        { state: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const locations = await prisma.location.findMany({
      where,
      orderBy: [
        { locationType: 'asc' },
        { name: 'asc' },
      ],
      include: {
        _count: {
          select: {
            orderRequests: true,
            portalUsers: true,
          },
        },
      },
    });

    // Get order counts by location
    const locationStats = await Promise.all(
      locations.map(async (location) => {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const [recentOrders, totalOrders] = await Promise.all([
          prisma.orderRequest.count({
            where: {
              locationId: location.id,
              createdAt: { gte: thirtyDaysAgo },
            },
          }),
          prisma.orderRequest.count({
            where: { locationId: location.id },
          }),
        ]);

        return {
          ...location,
          stats: {
            totalOrders,
            recentOrders,
            portalUserCount: location._count.portalUsers,
          },
        };
      })
    );

    // Get type counts
    const typeCounts = locations.reduce((acc, loc) => {
      acc[loc.locationType] = (acc[loc.locationType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    res.json({
      data: locationStats,
      meta: {
        total: locations.length,
        typeCounts,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/clients/:clientId/locations/:locationId
 * Get a specific location
 */
router.get('/:locationId', async (req, res, next) => {
  try {
    const { clientId, locationId } = req.params as { clientId: string; locationId: string };

    const location = await prisma.location.findFirst({
      where: {
        id: locationId,
        clientId,
      },
      include: {
        portalUsers: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
        _count: {
          select: {
            orderRequests: true,
          },
        },
      },
    });

    if (!location) {
      throw new NotFoundError('Location');
    }

    res.json(location);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/clients/:clientId/locations
 * Create a new location
 */
router.post('/', async (req, res, next) => {
  try {
    const { clientId } = req.params as { clientId: string };
    const data = createLocationSchema.parse(req.body);

    // Check for duplicate code
    const existing = await prisma.location.findFirst({
      where: {
        clientId,
        code: data.code.toUpperCase(),
      },
    });

    if (existing) {
      throw new ValidationError('A location with this code already exists');
    }

    const location = await prisma.location.create({
      data: {
        clientId,
        name: data.name,
        code: data.code.toUpperCase(),
        address: data.address,
        city: data.city,
        state: data.state,
        zipCode: data.zipCode,
        country: data.country,
        contactName: data.contactName,
        contactEmail: data.contactEmail,
        contactPhone: data.contactPhone,
        locationType: data.locationType || 'branch',
        metadata: (data.metadata || {}) as any,
      },
    });

    res.status(201).json(location);
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/clients/:clientId/locations/:locationId
 * Update a location
 */
router.patch('/:locationId', async (req, res, next) => {
  try {
    const { clientId, locationId } = req.params as { clientId: string; locationId: string };
    const data = updateLocationSchema.parse(req.body);

    // Verify location exists and belongs to client
    const existing = await prisma.location.findFirst({
      where: { id: locationId, clientId },
    });

    if (!existing) {
      throw new NotFoundError('Location');
    }

    const location = await prisma.location.update({
      where: { id: locationId },
      data: data as any,
    });

    res.json(location);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/clients/:clientId/locations/:locationId
 * Soft delete a location
 */
router.delete('/:locationId', async (req, res, next) => {
  try {
    const { clientId, locationId } = req.params as { clientId: string; locationId: string };

    // Verify location exists and belongs to client
    const existing = await prisma.location.findFirst({
      where: { id: locationId, clientId },
    });

    if (!existing) {
      throw new NotFoundError('Location');
    }

    // Check if location has active orders
    const activeOrders = await prisma.orderRequest.count({
      where: {
        locationId,
        status: { in: ['draft', 'submitted', 'acknowledged', 'on_hold'] },
      },
    });

    if (activeOrders > 0) {
      throw new ValidationError(`Cannot delete location with ${activeOrders} active order(s)`);
    }

    await prisma.location.update({
      where: { id: locationId },
      data: { isActive: false },
    });

    res.json({ message: 'Location deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// LOCATION ANALYTICS
// =============================================================================

/**
 * GET /api/clients/:clientId/locations/:locationId/stats
 * Get detailed statistics for a location
 */
router.get('/:locationId/stats', async (req, res, next) => {
  try {
    const { clientId, locationId } = req.params as { clientId: string; locationId: string };

    // Verify location exists
    const location = await prisma.location.findFirst({
      where: { id: locationId, clientId },
    });

    if (!location) {
      throw new NotFoundError('Location');
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    // Get order statistics
    const [
      totalOrders,
      recentOrders,
      ordersByStatus,
      ordersByMonth,
    ] = await Promise.all([
      // Total orders
      prisma.orderRequest.count({
        where: { locationId },
      }),

      // Last 30 days
      prisma.orderRequest.count({
        where: {
          locationId,
          createdAt: { gte: thirtyDaysAgo },
        },
      }),

      // By status
      prisma.orderRequest.groupBy({
        by: ['status'],
        where: { locationId },
        _count: true,
      }),

      // Last 3 months by month
      prisma.orderRequest.findMany({
        where: {
          locationId,
          createdAt: { gte: ninetyDaysAgo },
        },
        select: {
          createdAt: true,
          status: true,
        },
      }),
    ]);

    // Group orders by month
    const monthlyData = ordersByMonth.reduce((acc, order) => {
      const month = order.createdAt.toISOString().slice(0, 7); // YYYY-MM
      acc[month] = (acc[month] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    res.json({
      locationId,
      locationName: location.name,
      locationCode: location.code,
      stats: {
        totalOrders,
        recentOrders,
        ordersByStatus: ordersByStatus.reduce((acc, item) => {
          acc[item.status] = item._count;
          return acc;
        }, {} as Record<string, number>),
        monthlyOrderTrend: Object.entries(monthlyData)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([month, count]) => ({ month, count })),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/clients/:clientId/locations/top-performers
 * Get top performing locations by order volume
 */
router.get('/analytics/top-performers', async (req, res, next) => {
  try {
    const { clientId } = req.params as { clientId: string };
    const { period = '30' } = req.query;

    const daysAgo = parseInt(period as string) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysAgo);

    // Get locations with order counts
    const locations = await prisma.location.findMany({
      where: {
        clientId,
        isActive: true,
      },
      include: {
        orderRequests: {
          where: {
            createdAt: { gte: startDate },
          },
          select: {
            id: true,
            status: true,
            totalUnits: true,
            estimatedValue: true,
          },
        },
      },
    });

    // Calculate metrics for each location
    const locationMetrics = locations.map((location) => {
      const orders = location.orderRequests;
      const completedOrders = orders.filter((o) => o.status === 'fulfilled');

      return {
        id: location.id,
        name: location.name,
        code: location.code,
        locationType: location.locationType,
        metrics: {
          totalOrders: orders.length,
          completedOrders: completedOrders.length,
          totalUnits: orders.reduce((sum, o) => sum + (o.totalUnits || 0), 0),
          estimatedValue: orders.reduce(
            (sum, o) => sum + Number(o.estimatedValue || 0),
            0
          ),
        },
      };
    });

    // Sort by total orders
    const sorted = locationMetrics.sort(
      (a, b) => b.metrics.totalOrders - a.metrics.totalOrders
    );

    res.json({
      data: sorted.slice(0, 10), // Top 10
      period: `${daysAgo} days`,
      total: sorted.length,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/clients/:clientId/locations/:locationId/orders
 * Get orders for a specific location
 */
router.get('/:locationId/orders', async (req, res, next) => {
  try {
    const { clientId, locationId } = req.params as { clientId: string; locationId: string };
    const { status, limit = '20', page = '1' } = req.query;

    // Verify location exists
    const location = await prisma.location.findFirst({
      where: { id: locationId, clientId },
    });

    if (!location) {
      throw new NotFoundError('Location');
    }

    const where: any = { locationId };
    if (status) {
      where.status = status;
    }

    const take = parseInt(limit as string) || 20;
    const skip = (parseInt(page as string) - 1) * take;

    const [orders, total] = await Promise.all([
      prisma.orderRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
        include: {
          requestedBy: {
            select: { name: true, email: true },
          },
        },
      }),
      prisma.orderRequest.count({ where }),
    ]);

    res.json({
      data: orders,
      pagination: {
        page: parseInt(page as string),
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
