import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { NotFoundError, ValidationError, ForbiddenError } from '../middleware/error-handler.js';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const createUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  role: z.enum(['admin', 'operations_manager', 'account_manager']).default('account_manager'),
});

const createPortalUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  clientId: z.string().uuid('Invalid client ID'),
  role: z.enum(['admin', 'manager', 'viewer']).default('viewer'),
});

const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  role: z.enum(['admin', 'operations_manager', 'account_manager']).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(8).optional(),
});

// =============================================================================
// ADMIN USER ROUTES
// =============================================================================

/**
 * GET /api/users
 * List all admin users (admin only)
 */
router.get('/', requireRole('admin'), async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        lastLoginAt: true,
        clients: {
          select: {
            client: {
              select: { id: true, name: true, code: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      data: users.map((u) => ({
        ...u,
        clients: u.clients.map((c) => c.client),
      })),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/users
 * Create a new admin user (admin only)
 */
router.post('/', requireRole('admin'), async (req, res, next) => {
  try {
    const data = createUserSchema.parse(req.body);

    // Check if email already exists
    const existing = await prisma.user.findUnique({
      where: { email: data.email.toLowerCase() },
    });

    if (existing) {
      throw new ValidationError('Email already in use');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(data.password, 12);

    // Create user
    const user = await prisma.user.create({
      data: {
        email: data.email.toLowerCase(),
        passwordHash,
        name: data.name,
        role: data.role,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    res.status(201).json({ data: user, message: 'User created successfully' });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/users/:id
 * Update an admin user (admin only)
 */
router.put('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = updateUserSchema.parse(req.body);

    // Find user
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError('User');
    }

    // Prepare update data
    const updateData: Record<string, unknown> = {};
    if (data.name) updateData.name = data.name;
    if (data.role) updateData.role = data.role;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.password) {
      updateData.passwordHash = await bcrypt.hash(data.password, 12);
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        updatedAt: true,
      },
    });

    res.json({ data: user, message: 'User updated successfully' });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/users/:id/clients
 * Assign clients to a user (admin only)
 */
router.post('/:id/clients', requireRole('admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { clientIds } = req.body as { clientIds: string[] };

    if (!clientIds || !Array.isArray(clientIds)) {
      throw new ValidationError('clientIds array is required');
    }

    // Verify user exists
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundError('User');
    }

    // Remove existing and add new
    await prisma.userClient.deleteMany({ where: { userId: id } });

    if (clientIds.length > 0) {
      await prisma.userClient.createMany({
        data: clientIds.map((clientId) => ({
          userId: id,
          clientId,
          role: 'manager',
        })),
      });
    }

    res.json({ message: 'Client assignments updated' });
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// PORTAL USER ROUTES
// =============================================================================

/**
 * GET /api/users/portal
 * List all portal users (admin & account_manager)
 */
router.get('/portal', requireRole('admin', 'account_manager'), async (req, res, next) => {
  try {
    const { clientId } = req.query;

    const where = clientId ? { clientId: clientId as string } : {};

    const users = await prisma.portalUser.findMany({
      where,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        client: {
          select: { id: true, name: true, code: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ data: users });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/users/portal
 * Create a new portal user (admin & account_manager)
 */
router.post('/portal', requireRole('admin', 'account_manager'), async (req, res, next) => {
  try {
    const data = createPortalUserSchema.parse(req.body);

    // Check if email already exists
    const existing = await prisma.portalUser.findUnique({
      where: { email: data.email.toLowerCase() },
    });

    if (existing) {
      throw new ValidationError('Email already in use');
    }

    // Verify client exists
    const client = await prisma.client.findUnique({ where: { id: data.clientId } });
    if (!client) {
      throw new NotFoundError('Client');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(data.password, 12);

    // Create portal user
    const user = await prisma.portalUser.create({
      data: {
        email: data.email.toLowerCase(),
        passwordHash,
        name: data.name,
        clientId: data.clientId,
        role: data.role,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        client: {
          select: { id: true, name: true },
        },
      },
    });

    res.status(201).json({ data: user, message: 'Portal user created successfully' });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/users/portal/:id
 * Update a portal user (admin & account_manager)
 */
router.put('/portal/:id', requireRole('admin', 'account_manager'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = updateUserSchema.parse(req.body);

    // Find user
    const existing = await prisma.portalUser.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError('Portal user');
    }

    // Prepare update data
    const updateData: Record<string, unknown> = {};
    if (data.name) updateData.name = data.name;
    if (data.role) updateData.role = data.role;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.password) {
      updateData.passwordHash = await bcrypt.hash(data.password, 12);
    }

    const user = await prisma.portalUser.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        updatedAt: true,
      },
    });

    res.json({ data: user, message: 'Portal user updated successfully' });
  } catch (error) {
    next(error);
  }
});

export default router;
