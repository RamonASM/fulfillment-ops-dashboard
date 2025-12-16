import rateLimit from "express-rate-limit";
import type { Request } from "express";

// =============================================================================
// ENVIRONMENT-AWARE RATE LIMITERS
// =============================================================================
// Rate limits are relaxed in development/test environments to allow E2E tests
// and rapid development without hitting artificial limits.
// Production deployments MUST set NODE_ENV=production for security.
// =============================================================================

const isTestOrDev = ["development", "test"].includes(
  process.env.NODE_ENV || "",
);

/**
 * Check if request is from localhost/Docker network (safe to skip in dev/test)
 */
const isLocalRequest = (req: Request): boolean => {
  const ip = req.ip || req.socket?.remoteAddress || "";
  return (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip === "::ffff:127.0.0.1" ||
    ip.startsWith("172.") || // Docker bridge network
    ip.startsWith("192.168.") // Local network
  );
};

/**
 * Default limiter for general API endpoints
 * Production: 100 requests/minute
 * Dev/Test: 10,000 requests/minute (effectively disabled)
 */
export const createDefaultLimiter = () =>
  rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: isTestOrDev ? 10000 : 100,
    skip: (req) => isTestOrDev && (req.method === "GET" || isLocalRequest(req)),
    message: { error: "Too many requests, please try again later." },
    standardHeaders: true,
    legacyHeaders: false,
  });

/**
 * Auth limiter - prevents brute force attacks
 * Production: 10 attempts/15 minutes (strict)
 * Dev/Test: 1000 attempts/minute (allows E2E tests with 6+ workers)
 */
export const createAuthLimiter = () =>
  rateLimit({
    windowMs: isTestOrDev ? 60 * 1000 : 15 * 60 * 1000,
    max: isTestOrDev ? 1000 : 10,
    skip: (req) => isTestOrDev && isLocalRequest(req),
    message: {
      error:
        "Too many authentication attempts. Please try again in 15 minutes.",
    },
    standardHeaders: true,
    legacyHeaders: false,
  });

/**
 * Upload limiter - expensive operations
 * Production: 20 uploads/hour
 * Dev/Test: 500 uploads/hour (allows bulk testing)
 */
export const createUploadLimiter = () =>
  rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: isTestOrDev ? 500 : 20,
    skip: (req) => isTestOrDev && isLocalRequest(req),
    message: { error: "Upload limit exceeded. Please try again later." },
    standardHeaders: true,
    legacyHeaders: false,
  });

/**
 * AI/Analytics limiter - CPU-intensive operations
 * Production: 30 requests/minute
 * Dev/Test: 500 requests/minute
 */
export const createAiLimiter = () =>
  rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: isTestOrDev ? 500 : 30,
    skip: (req) => isTestOrDev && isLocalRequest(req),
    message: { error: "AI request limit exceeded. Please slow down." },
    standardHeaders: true,
    legacyHeaders: false,
  });

/**
 * Report generation limiter
 * Production: 10 reports/5 minutes
 * Dev/Test: 100 reports/5 minutes
 */
export const createReportLimiter = () =>
  rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: isTestOrDev ? 100 : 10,
    skip: (req) => isTestOrDev && isLocalRequest(req),
    message: { error: "Report generation limit exceeded. Please wait." },
    standardHeaders: true,
    legacyHeaders: false,
  });

// Log environment on module load for debugging
if (isTestOrDev) {
  console.log(
    `[Rate Limiters] Running in ${process.env.NODE_ENV || "development"} mode - limits relaxed`,
  );
}
