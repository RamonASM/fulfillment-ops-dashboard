import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { AuthPayload, UserRole } from '@inventory/shared';
import { UnauthorizedError, ForbiddenError } from './error-handler.js';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

// JWT_SECRET validation - fail fast if not set
// Environment validation at startup ensures this is set before the app starts
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error(
    'FATAL: JWT_SECRET environment variable is required. ' +
    'Please set a strong, unique secret (at least 32 characters) in your .env file.'
  );
}

export function generateAccessToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET!, {
    expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m',
  } as jwt.SignOptions);
}

export function generateRefreshToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET!, {
    expiresIn: process.env.JWT_REFRESH_EXPIRY || '7d',
  } as jwt.SignOptions);
}

export function verifyToken(token: string): AuthPayload {
  return jwt.verify(token, JWT_SECRET!) as AuthPayload;
}

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    // Get token from cookie or Authorization header
    const token = req.cookies?.accessToken ||
                  req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      throw new UnauthorizedError('No authentication token provided');
    }

    const payload = verifyToken(token);
    req.user = payload;
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      next(new UnauthorizedError('Invalid or expired token'));
    } else {
      next(error);
    }
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    if (!roles.includes(req.user.role as UserRole)) {
      return next(new ForbiddenError(`Required role: ${roles.join(' or ')}`));
    }

    next();
  };
}

export async function requireClientAccess(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }

    // Check for clientId in params or query
    const clientId = req.params.clientId || (req.query.clientId as string);
    if (!clientId) {
      return next();
    }

    // Admins and operations managers have access to all clients
    if (req.user.role === 'admin' || req.user.role === 'operations_manager') {
      return next();
    }

    // Check if user has access to this client
    const access = await prisma.userClient.findUnique({
      where: {
        userId_clientId: {
          userId: req.user.userId,
          clientId,
        },
      },
    });

    if (!access) {
      throw new ForbiddenError('Access denied to this client');
    }

    next();
  } catch (error) {
    next(error);
  }
}
