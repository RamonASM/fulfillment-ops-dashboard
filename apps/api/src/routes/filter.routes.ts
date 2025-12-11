import { Router } from 'express';
import { z } from 'zod';
import { prisma, Prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { NotFoundError } from '../middleware/error-handler.js';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const filterTypeEnum = z.enum(['products', 'alerts', 'transactions', 'orders']);

const createFilterSchema = z.object({
  name: z.string().min(1).max(100),
  filterType: filterTypeEnum,
  filters: z.record(z.unknown()),
  isDefault: z.boolean().optional().default(false),
  isShared: z.boolean().optional().default(false),
});

const updateFilterSchema = createFilterSchema.partial();

// =============================================================================
// ROUTES
// =============================================================================

/**
 * GET /api/filters
 * List user's saved filters
 */
router.get('/', async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const { type } = req.query;

    const where: Prisma.SavedFilterWhereInput = {
      OR: [
        { userId },
        { isShared: true },
      ],
    };

    if (type && filterTypeEnum.safeParse(type).success) {
      where.filterType = type as string;
    }

    const filters = await prisma.savedFilter.findMany({
      where,
      orderBy: [
        { isDefault: 'desc' },
        { name: 'asc' },
      ],
    });

    res.json({ data: filters });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/filters/:filterId
 * Get a specific filter
 */
router.get('/:filterId', async (req, res, next) => {
  try {
    const { filterId } = req.params;
    const userId = req.user!.userId;

    const filter = await prisma.savedFilter.findFirst({
      where: {
        id: filterId,
        OR: [
          { userId },
          { isShared: true },
        ],
      },
    });

    if (!filter) {
      throw new NotFoundError('Filter');
    }

    res.json(filter);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/filters
 * Create a new saved filter
 */
router.post('/', async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const data = createFilterSchema.parse(req.body);

    // If this is set as default, unset other defaults for this type
    if (data.isDefault) {
      await prisma.savedFilter.updateMany({
        where: {
          userId,
          filterType: data.filterType,
          isDefault: true,
        },
        data: { isDefault: false },
      });
    }

    const filter = await prisma.savedFilter.create({
      data: {
        userId,
        name: data.name,
        filterType: data.filterType,
        filters: data.filters as Prisma.InputJsonValue,
        isDefault: data.isDefault,
        isShared: data.isShared,
      },
    });

    res.status(201).json(filter);
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/filters/:filterId
 * Update a saved filter
 */
router.patch('/:filterId', async (req, res, next) => {
  try {
    const { filterId } = req.params;
    const userId = req.user!.userId;
    const data = updateFilterSchema.parse(req.body);

    // Check ownership
    const existing = await prisma.savedFilter.findFirst({
      where: { id: filterId, userId },
    });

    if (!existing) {
      throw new NotFoundError('Filter');
    }

    // If setting as default, unset other defaults
    if (data.isDefault) {
      await prisma.savedFilter.updateMany({
        where: {
          userId,
          filterType: existing.filterType,
          isDefault: true,
          id: { not: filterId },
        },
        data: { isDefault: false },
      });
    }

    const filter = await prisma.savedFilter.update({
      where: { id: filterId },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.filters && { filters: data.filters as Prisma.InputJsonValue }),
        ...(data.isDefault !== undefined && { isDefault: data.isDefault }),
        ...(data.isShared !== undefined && { isShared: data.isShared }),
      },
    });

    res.json(filter);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/filters/:filterId
 * Delete a saved filter
 */
router.delete('/:filterId', async (req, res, next) => {
  try {
    const { filterId } = req.params;
    const userId = req.user!.userId;

    // Check ownership
    const existing = await prisma.savedFilter.findFirst({
      where: { id: filterId, userId },
    });

    if (!existing) {
      throw new NotFoundError('Filter');
    }

    await prisma.savedFilter.delete({
      where: { id: filterId },
    });

    res.json({ message: 'Filter deleted successfully' });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/filters/:filterId/set-default
 * Set a filter as the default for its type
 */
router.post('/:filterId/set-default', async (req, res, next) => {
  try {
    const { filterId } = req.params;
    const userId = req.user!.userId;

    const existing = await prisma.savedFilter.findFirst({
      where: { id: filterId, userId },
    });

    if (!existing) {
      throw new NotFoundError('Filter');
    }

    // Unset other defaults for this type
    await prisma.savedFilter.updateMany({
      where: {
        userId,
        filterType: existing.filterType,
        isDefault: true,
      },
      data: { isDefault: false },
    });

    // Set this one as default
    const filter = await prisma.savedFilter.update({
      where: { id: filterId },
      data: { isDefault: true },
    });

    res.json(filter);
  } catch (error) {
    next(error);
  }
});

export default router;
