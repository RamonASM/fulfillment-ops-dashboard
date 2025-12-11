import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// =============================================================================
// CSRF PROTECTION MIDDLEWARE
// =============================================================================

// CSRF token storage (in production, consider using Redis for distributed systems)
const csrfTokens = new Map<string, { token: string; expiresAt: number }>();

const CSRF_TOKEN_EXPIRY = 60 * 60 * 1000; // 1 hour
const CSRF_HEADER = 'x-csrf-token';
const CSRF_COOKIE = 'csrf_token';

// Safe methods that don't require CSRF protection
const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

// Paths exempt from CSRF (webhooks, health checks, public endpoints)
const EXEMPT_PATHS = [
  '/health',
  '/api/webhooks/',
  '/api/auth/login',
  '/api/auth/portal/login',
  '/api/auth/refresh',
];

/**
 * Generate a new CSRF token
 */
export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * CSRF protection middleware using double-submit cookie pattern
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  // Skip safe methods
  if (SAFE_METHODS.includes(req.method)) {
    return next();
  }

  // Skip exempt paths
  if (EXEMPT_PATHS.some(path => req.path.startsWith(path))) {
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
export function issueCsrfToken(req: Request, res: Response, next: NextFunction) {
  const userId = req.user?.userId || req.portalUser?.id || 'anonymous';

  // Generate new token
  const token = generateCsrfToken();
  const expiresAt = Date.now() + CSRF_TOKEN_EXPIRY;

  // Store token
  csrfTokens.set(userId, { token, expiresAt });

  // Set cookie with token (readable by JavaScript for double-submit)
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false, // Must be readable by JavaScript
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: CSRF_TOKEN_EXPIRY,
  });

  // Also send in response header for convenience
  res.setHeader(CSRF_HEADER, token);

  next();
}

/**
 * Get CSRF token endpoint handler
 */
export function getCsrfToken(req: Request, res: Response) {
  const token = generateCsrfToken();

  // Set cookie
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: CSRF_TOKEN_EXPIRY,
  });

  res.json({ token });
}

/**
 * Cleanup expired tokens (call periodically)
 */
export function cleanupCsrfTokens(): void {
  const now = Date.now();
  for (const [key, value] of csrfTokens.entries()) {
    if (now > value.expiresAt) {
      csrfTokens.delete(key);
    }
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupCsrfTokens, 5 * 60 * 1000);
