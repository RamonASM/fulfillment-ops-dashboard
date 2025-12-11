import { Router, Request, Response } from 'express';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const router = Router();

// JWT secret with production validation
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET must be set in production');
}
if (!JWT_SECRET) {
  logger.warn('JWT_SECRET not set for portal auth, using dev default');
}
const EFFECTIVE_SECRET = JWT_SECRET || 'dev-portal-secret-change-in-production';
const JWT_EXPIRY = '7d';

// Portal user login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

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
      EFFECTIVE_SECRET,
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

    const decoded = jwt.verify(token, EFFECTIVE_SECRET) as unknown as {
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
