import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { redis } from '../lib/redis';

// =============================================================================
// CSRF PROTECTION MIDDLEWARE
// =============================================================================
// Uses Redis for token storage to support distributed systems.
// Falls back to in-memory Map if Redis is unavailable (dev/test only).

// In-memory fallback for development/testing when Redis is not available
const csrfTokensFallback = new Map<string, { token: string; expiresAt: number }>();

const CSRF_TOKEN_EXPIRY = 24 * 60 * 60; // 24 hours (in seconds for Redis TTL)
const CSRF_TOKEN_EXPIRY_MS = CSRF_TOKEN_EXPIRY * 1000; // Milliseconds for cookie
const CSRF_HEADER = 'x-csrf-token';
const CSRF_COOKIE = 'csrf_token';
const REDIS_PREFIX = 'csrf:';

// Safe methods that don't require CSRF protection
const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

// Paths exempt from CSRF (only authentication endpoints and health checks)
// All other routes should be protected by CSRF + JWT authentication
const EXEMPT_PATHS = [
  '/health',
  '/api/webhooks/', // Webhooks protected by signature verification
  '/api/auth/', // Authentication endpoints (login, register, password reset)
  '/api/portal/auth/', // Portal authentication endpoints
  '/api/csrf-token', // Endpoint to obtain CSRF token
];

/**
 * Generate a new CSRF token
 */
export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Store CSRF token (Redis or fallback to in-memory)
 */
async function storeCsrfToken(sessionId: string, token: string): Promise<void> {
  if (redis) {
    // Store in Redis with TTL
    await redis.setex(`${REDIS_PREFIX}${sessionId}`, CSRF_TOKEN_EXPIRY, token);
  } else {
    // Fallback to in-memory storage
    csrfTokensFallback.set(sessionId, {
      token,
      expiresAt: Date.now() + CSRF_TOKEN_EXPIRY_MS,
    });
  }
}

/**
 * Retrieve CSRF token (Redis or fallback to in-memory)
 */
async function getCsrfToken(sessionId: string): Promise<string | null> {
  if (redis) {
    // Get from Redis
    return await redis.get(`${REDIS_PREFIX}${sessionId}`);
  } else {
    // Get from in-memory storage
    const stored = csrfTokensFallback.get(sessionId);
    if (stored && Date.now() < stored.expiresAt) {
      return stored.token;
    }
    return null;
  }
}

/**
 * CSRF protection middleware using double-submit cookie pattern
 */
export async function csrfProtection(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Skip safe methods
  if (SAFE_METHODS.includes(req.method)) {
    return next();
  }

  // Skip exempt paths
  if (EXEMPT_PATHS.some((path) => req.path.startsWith(path))) {
    return next();
  }

  // Get tokens from request
  const headerToken = req.headers[CSRF_HEADER] as string;
  const cookieToken = req.cookies?.[CSRF_COOKIE];

  // Validate CSRF tokens exist
  if (!headerToken || !cookieToken) {
    return res.status(403).json({
      code: 'CSRF_ERROR',
      message: 'CSRF token missing. Include token in both header and cookie.',
    });
  }

  // Validate CSRF tokens match (double-submit pattern)
  if (headerToken !== cookieToken) {
    return res.status(403).json({
      code: 'CSRF_ERROR',
      message: 'CSRF token mismatch. Request may have been tampered with.',
    });
  }

  next();
}

/**
 * Middleware to issue CSRF token after authentication
 */
export async function issueCsrfToken(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const userId = req.user?.userId || req.portalUser?.id || 'anonymous';

  // Generate new token
  const token = generateCsrfToken();

  // Store token in Redis/fallback
  await storeCsrfToken(userId, token);

  // Set cookie with token (readable by JavaScript for double-submit)
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false, // Must be readable by JavaScript
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: CSRF_TOKEN_EXPIRY_MS,
  });

  // Also send in response header for convenience
  res.setHeader(CSRF_HEADER, token);

  next();
}

/**
 * Get CSRF token endpoint handler
 */
export async function getCsrfTokenHandler(req: Request, res: Response) {
  const token = generateCsrfToken();

  // Set cookie
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: CSRF_TOKEN_EXPIRY_MS,
  });

  res.json({ token });
}

/**
 * Cleanup expired tokens from in-memory fallback
 * (Redis handles TTL automatically)
 */
export function cleanupCsrfTokens(): void {
  if (!redis) {
    // Only clean up in-memory fallback
    const now = Date.now();
    for (const [key, value] of csrfTokensFallback.entries()) {
      if (now > value.expiresAt) {
        csrfTokensFallback.delete(key);
      }
    }
  }
}

// Run cleanup every 5 minutes (only for in-memory fallback)
setInterval(cleanupCsrfTokens, 5 * 60 * 1000);
