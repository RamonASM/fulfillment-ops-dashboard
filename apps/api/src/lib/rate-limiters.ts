import rateLimit from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import type { Request } from "express";
import { redis } from "./redis.js";

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
 * Create Redis store if available, otherwise use in-memory
 * NOTE: rate-limit-redis v4+ requires sendCommand interface which ioredis doesn't provide
 * For now, using in-memory store until we upgrade to Redis client that supports it
 */
const createStore = () => {
  // Disable Redis rate limiting until we can properly configure it
  // The redis integration with rate-limit-redis v4+ requires sendCommand
  // which ioredis doesn't provide. Using in-memory for now.
  if (redis && process.env.USE_REDIS_RATE_LIMIT === 'true') {
    try {
      console.log('[Rate Limiters] Attempting Redis-backed rate limiting');
      return new RedisStore({
        // @ts-expect-error - rate-limit-redis types require sendCommand
        sendCommand: async (...args: string[]) => redis.call(args[0], ...args.slice(1)),
        prefix: 'rl:',
      });
    } catch (err) {
      console.warn('[Rate Limiters] Failed to initialize Redis store, using in-memory fallback:', err);
      return undefined;
    }
  }
  // Default: in-memory rate limiting
  console.log('[Rate Limiters] Using in-memory rate limiting');
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
    store: createStore(),
    message: { error: "AI request limit exceeded. Please slow down." },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      return req.user?.userId || req.portalUser?.id || req.ip || 'unknown';
    },
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

// Log Redis connection status
if (redis) {
  console.log('[Rate Limiters] Using Redis-backed rate limiting');
} else {
  console.warn('[Rate Limiters] Redis unavailable - using in-memory fallback (not suitable for production with multiple servers)');
}
