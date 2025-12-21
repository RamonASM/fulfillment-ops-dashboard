import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { logger } from '../lib/logger.js';

// JWT_SECRET validation - fail fast if not set
// Environment validation at startup ensures this is set before the app starts
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error(
    'FATAL: JWT_SECRET environment variable is required. ' +
    'Please set a strong, unique secret (at least 32 characters) in your .env file.'
  );
}

interface PortalUserPayload {
  userId: string;
  clientId: string;
  role: 'viewer' | 'requester' | 'admin';
  isPortalUser: boolean;
}

declare global {
  namespace Express {
    interface Request {
      portalUser?: {
        id: string;
        clientId: string;
        role: 'viewer' | 'requester' | 'admin';
      };
    }
  }
}

export async function portalAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies.portal_token || req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const decoded = jwt.verify(token, JWT_SECRET!) as PortalUserPayload;

    if (!decoded.isPortalUser) {
      return res.status(401).json({ message: 'Invalid portal token' });
    }

    req.portalUser = {
      id: decoded.userId,
      clientId: decoded.clientId,
      role: decoded.role,
    };

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ message: 'Token expired' });
    }
    return res.status(401).json({ message: 'Invalid token' });
  }
}

// Middleware to check specific roles
export function requireRole(...roles: Array<'viewer' | 'requester' | 'admin'>) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.portalUser) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (!roles.includes(req.portalUser.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    next();
  };
}
