import rateLimit from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import type { Request } from "express";
import { redis } from "./redis.js";
import { logger } from "./logger.js";

// =============================================================================
// REDIS-BACKED RATE LIMITERS WITH ROLE-BASED TIERS
// =============================================================================
// Uses Redis for distributed rate limiting across multiple server instances.
// Falls back to in-memory store if Redis is unavailable.
// Rate limits are enforced consistently across all environments.
// =============================================================================

/**
 * Tiered rate limits by user role
 * Lower max = stricter limit, higher max = more permissive
 */
const RATE_LIMITS = {
  anonymous: { windowMs: 60000, max: 20 }, // 20 req/min for unauthenticated
  user: { windowMs: 60000, max: 100 }, // 100 req/min for authenticated users
  account_manager: { windowMs: 60000, max: 200 }, // 200 req/min for account managers
  operations_manager: { windowMs: 60000, max: 300 }, // 300 req/min for ops managers
  admin: { windowMs: 60000, max: 500 }, // 500 req/min for admins
} as const;

/**
 * Get user role from request (set by auth middleware)
 */
const getUserRole = (
  req: Request,
): keyof typeof RATE_LIMITS => {
  if (req.user?.role) {
    return req.user.role as keyof typeof RATE_LIMITS;
  }
  if (req.portalUser?.role) {
    // Portal users get 'user' tier limits
    return 'user';
  }
  return 'anonymous';
};

/**
 * Create Redis store for distributed rate limiting
 *
 * Uses the correct sendCommand signature for ioredis v5 + rate-limit-redis v4+.
 * Falls back to in-memory if Redis is unavailable.
 *
 * @param prefix - Redis key prefix for this limiter (default: 'rl:')
 */
const createStore = (prefix: string = 'rl:') => {
  if (redis && process.env.USE_REDIS_RATE_LIMIT === 'true') {
    // Capture redis in a const to help TypeScript with type narrowing
    const redisClient = redis;
    try {
      logger.info("Redis-backed rate limiting initialized", { prefix });
      return new RedisStore({
        // Correct signature for ioredis v5 + rate-limit-redis v4
        // The command is the first param, args are spread separately
        sendCommand: (command: string, ...args: string[]) =>
          redisClient.call(command, ...args) as Promise<number>,
        prefix,
      });
    } catch (err) {
      logger.warn("Redis rate limiter init failed, using in-memory", { error: String(err) });
      return undefined;
    }
  }

  // Warn in production - in-memory doesn't work with clustering
  if (process.env.NODE_ENV === 'production') {
    logger.warn("In-memory rate limiting in production - set USE_REDIS_RATE_LIMIT=true for clustering");
  }

  return undefined;
};

/**
 * Default limiter with role-based tiers
 * Uses Redis for distributed rate limiting
 */
export const createDefaultLimiter = () =>
  rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: (req) => {
      const role = getUserRole(req);
      return RATE_LIMITS[role].max;
    },
    store: createStore(),
    message: { error: "Too many requests, please try again later." },
    standardHeaders: true,
    legacyHeaders: false,
    // Use user ID for key if authenticated, otherwise IP
    keyGenerator: (req) => {
      return req.user?.userId || req.portalUser?.id || req.ip || 'unknown';
    },
  });

/**
 * Auth limiter - prevents brute force attacks
 * Strict limit: 10 attempts/15 minutes (all users)
 */
export const createAuthLimiter = () =>
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Strict limit for all users
    store: createStore(),
    message: {
      error:
        "Too many authentication attempts. Please try again in 15 minutes.",
    },
    standardHeaders: true,
    legacyHeaders: false,
    // Use email from body or IP for key
    keyGenerator: (req) => {
      const email = req.body?.email;
      return email ? `auth:${email}` : `auth:${req.ip || 'unknown'}`;
    },
  });

/**
 * Upload limiter - expensive operations
 * Role-based: 20-100 uploads/hour depending on role
 */
export const createUploadLimiter = () =>
  rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: (req) => {
      const role = getUserRole(req);
      // Scale upload limits: 20 for anonymous, up to 100 for admins
      const baseLimits = {
        anonymous: 20,
        user: 40,
        account_manager: 60,
        operations_manager: 80,
        admin: 100,
      };
      return baseLimits[role] || 20;
    },
    store: createStore(),
    message: { error: "Upload limit exceeded. Please try again later." },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      return req.user?.userId || req.portalUser?.id || req.ip || 'unknown';
    },
  });

/**
 * AI/Analytics limiter - CPU-intensive operations
 * Role-based: 10-60 requests/minute depending on role
 */
export const createAiLimiter = () =>
  rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: (req) => {
      const role = getUserRole(req);
      // AI operations are expensive - keep limits lower
      const aiLimits = {
        anonymous: 10,
        user: 20,
        account_manager: 30,
        operations_manager: 45,
        admin: 60,
      };
      return aiLimits[role] || 10;
    },
    store: createStore('rl:ai:'),
    message: { error: "AI request limit exceeded. Please slow down." },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      return req.user?.userId || req.portalUser?.id || req.ip || 'unknown';
    },
  });

/**
 * Analytics limiter - for expensive analytics/aggregation endpoints
 * Stricter than default to prevent full table scans overwhelming database
 * Role-based: 5-30 requests/minute depending on role
 */
export const createAnalyticsLimiter = () =>
  rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: (req) => {
      const role = getUserRole(req);
      // Analytics operations can trigger full table scans - strict limits
      const analyticsLimits = {
        anonymous: 5,
        user: 10,
        account_manager: 15,
        operations_manager: 20,
        admin: 30,
      };
      return analyticsLimits[role] || 5;
    },
    store: createStore('rl:analytics:'),
    message: { error: "Analytics request limit exceeded. Please slow down." },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `analytics:${req.user?.userId || req.portalUser?.id || req.ip || 'unknown'}`,
  });

/**
 * Report generation limiter
 * Role-based: 5-25 reports/5 minutes depending on role
 */
export const createReportLimiter = () =>
  rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: (req) => {
      const role = getUserRole(req);
      // Reports are expensive - keep limits conservative
      const reportLimits = {
        anonymous: 5,
        user: 10,
        account_manager: 15,
        operations_manager: 20,
        admin: 25,
      };
      return reportLimits[role] || 5;
    },
    store: createStore(),
    message: { error: "Report generation limit exceeded. Please wait." },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      return req.user?.userId || req.portalUser?.id || req.ip || 'unknown';
    },
  });

// =============================================================================
// SENSITIVE ENDPOINT RATE LIMITERS
// =============================================================================

/**
 * Admin limiter - for admin-only endpoints
 * Strictest limits due to sensitive operations
 * Role-based: 0-30 requests/minute
 */
export const createAdminLimiter = () =>
  rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: (req) => {
      const role = getUserRole(req);
      // Admin endpoints have strict limits - block non-privileged users
      const adminLimits = {
        anonymous: 0,
        user: 0,
        account_manager: 10,
        operations_manager: 20,
        admin: 30,
      };
      return adminLimits[role] || 0;
    },
    store: createStore('rl:admin:'),
    message: { error: "Too many admin requests. Please slow down." },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `admin:${req.user?.userId || req.ip || 'unknown'}`,
  });

/**
 * User management limiter - for user/portal user operations
 * Stricter to prevent enumeration attacks
 * Role-based: 0-20 requests/minute
 */
export const createUserManagementLimiter = () =>
  rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: (req) => {
      const role = getUserRole(req);
      const userMgmtLimits = {
        anonymous: 0,
        user: 5,
        account_manager: 10,
        operations_manager: 15,
        admin: 20,
      };
      return userMgmtLimits[role] || 5;
    },
    store: createStore('rl:users:'),
    message: { error: "Too many user management requests." },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `users:${req.user?.userId || req.ip || 'unknown'}`,
  });

/**
 * Financial data limiter - for financial/budget endpoints
 * Sensitive data requires stricter limits
 * Role-based: 0-40 requests/minute
 */
export const createFinancialLimiter = () =>
  rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: (req) => {
      const role = getUserRole(req);
      const financialLimits = {
        anonymous: 0,
        user: 10,
        account_manager: 20,
        operations_manager: 30,
        admin: 40,
      };
      return financialLimits[role] || 10;
    },
    store: createStore('rl:financial:'),
    message: { error: "Too many financial data requests." },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `financial:${req.user?.userId || req.ip || 'unknown'}`,
  });

/**
 * Order limiter - for order workflow operations
 * Moderate limits for business operations
 * Role-based: 0-80 requests/minute
 */
export const createOrderLimiter = () =>
  rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: (req) => {
      const role = getUserRole(req);
      const orderLimits = {
        anonymous: 0,
        user: 20,
        account_manager: 40,
        operations_manager: 60,
        admin: 80,
      };
      return orderLimits[role] || 20;
    },
    store: createStore('rl:orders:'),
    message: { error: "Too many order requests. Please slow down." },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `orders:${req.user?.userId || req.ip || 'unknown'}`,
  });

/**
 * Portal limiter - for all portal-specific endpoints
 * Moderate limits for client portal access
 * Fixed limit: 60 requests/minute per portal user
 */
export const createPortalLimiter = () =>
  rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 60, // Fixed limit for portal users
    store: createStore('rl:portal:'),
    message: { error: "Too many requests. Please slow down." },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `portal:${req.portalUser?.id || req.ip || 'unknown'}`,
  });

// Log Redis connection status at startup
if (redis) {
  logger.info("Redis available for distributed rate limiting");
} else {
  logger.warn("Redis unavailable - using in-memory rate limiting fallback");
}
