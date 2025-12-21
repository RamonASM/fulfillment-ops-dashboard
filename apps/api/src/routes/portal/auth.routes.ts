import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const router = Router();

// JWT secret validation - fail fast if not set
// Environment validation at startup ensures this is set before the app starts
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error(
    'FATAL: JWT_SECRET environment variable is required. ' +
    'Please set a strong, unique secret (at least 32 characters) in your .env file.'
  );
}
const JWT_EXPIRY = '7d';

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const portalLoginSchema = z.object({
  email: z.string().email('Invalid email address').max(255, 'Email too long'),
  password: z.string().min(1, 'Password is required').max(128, 'Password too long'),
});

// Portal user login
router.post('/login', async (req: Request, res: Response) => {
  try {
    // Validate input with Zod
    const { email, password } = portalLoginSchema.parse(req.body);

    const portalUser = await prisma.portalUser.findUnique({
      where: { email },
      include: {
        client: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!portalUser) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isValidPassword = await bcrypt.compare(password, portalUser.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      {
        userId: portalUser.id,
        clientId: portalUser.clientId,
        role: portalUser.role,
        isPortalUser: true,
      },
      JWT_SECRET!,
      { expiresIn: JWT_EXPIRY }
    );

    // Set httpOnly cookie
    res.cookie('portal_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.json({
      user: {
        id: portalUser.id,
        email: portalUser.email,
        name: portalUser.name,
        clientId: portalUser.clientId,
        clientName: portalUser.client.name,
        role: portalUser.role,
      },
      accessToken: token,
    });
  } catch (error) {
    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: 'Invalid request data',
        errors: error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      });
    }

    logger.error('Portal login error', error as Error);
    res.status(500).json({ message: 'Login failed' });
  }
});

// Logout
router.post('/logout', (req: Request, res: Response) => {
  res.clearCookie('portal_token');
  res.json({ message: 'Logged out successfully' });
});

// Get current user
router.get('/me', async (req: Request, res: Response) => {
  try {
    const token = req.cookies.portal_token || req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const decoded = jwt.verify(token, JWT_SECRET!) as unknown as {
      userId: string;
      clientId: string;
      role: string;
    };

    const portalUser = await prisma.portalUser.findUnique({
      where: { id: decoded.userId },
      include: {
        client: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!portalUser) {
      return res.status(401).json({ message: 'User not found' });
    }

    res.json({
      id: portalUser.id,
      email: portalUser.email,
      name: portalUser.name,
      clientId: portalUser.clientId,
      clientName: portalUser.client.name,
      role: portalUser.role,
    });
  } catch (error) {
    res.status(401).json({ message: 'Invalid token' });
  }
});

export default router;
