import "dotenv/config";
import express from "express";
import { createServer } from "http";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import {
  createDefaultLimiter,
  createAuthLimiter,
  createUploadLimiter,
  createAiLimiter,
  createReportLimiter,
  createAdminLimiter,
  createUserManagementLimiter,
  createFinancialLimiter,
  createOrderLimiter,
  createPortalLimiter,
} from "./lib/rate-limiters.js";

import { errorHandler } from "./middleware/error-handler.js";
import { requestLogger } from "./middleware/request-logger.js";
import { requestIdMiddleware } from "./middleware/request-id.js";
import { csrfProtection, getCsrfTokenHandler } from "./middleware/csrf.js";
import { logger } from "./lib/logger.js";
import { metricsMiddleware, metricsHandler } from "./lib/metrics.js";
import {
  validateEnvironment,
  printEnvironmentWarnings,
} from "./config/env-validation.js";
import { initializeWebSocket, getOnlineUsersCount } from "./lib/socket.js";
import { setupSwagger } from "./lib/swagger.js";
import { initializeEmailService } from "./services/email.service.js";
import authRoutes from "./routes/auth.routes.js";
import clientRoutes from "./routes/client.routes.js";
import productRoutes from "./routes/product.routes.js";
import locationRoutes from "./routes/location.routes.js";
import alertRoutes from "./routes/alert.routes.js";
import importRoutes from "./routes/import.routes.js";
import reportRoutes from "./routes/report.routes.js";
import aiRoutes from "./routes/ai.routes.js";
import portalRoutes from "./routes/portal/index.js";
import exportRoutes from "./routes/export.routes.js";
import auditRoutes from "./routes/audit.routes.js";
import analyticsRoutes from "./routes/analytics.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import filterRoutes from "./routes/filter.routes.js";
import searchRoutes from "./routes/search.routes.js";
import orderRoutes from "./routes/order.routes.js";
import collaborationRoutes from "./routes/collaboration.routes.js";
import feedbackRoutes from "./routes/feedback.routes.js";
import userRoutes from "./routes/user.routes.js";
import artworkRoutes from "./routes/artwork.routes.js";
import passwordResetRoutes from "./routes/password-reset.routes.js";
import financialRoutes from "./routes/financial.routes.js";
import shipmentRoutes from "./routes/shipment.routes.js";
import orderTimingRoutes from "./routes/order-timing.routes.js";
import locationAnalyticsRoutes from "./routes/location-analytics.routes.js";
import mlRoutes from "./routes/ml.routes.js";
import benchmarkingRoutes from "./routes/benchmarking.routes.js";
import preferencesRoutes from "./routes/preferences.routes.js";
import documentationRoutes from "./routes/documentation.routes.js";
import clientHealthRoutes from "./routes/client-health.routes.js";
import notificationPreferencesRoutes from "./routes/notification-preferences.routes.js";
import dsAnalyticsAdminRoutes from "./routes/ds-analytics-admin.routes.js";
import orphanReconciliationRoutes from "./routes/orphan-reconciliation.routes.js";
import healthRoutes from "./routes/health.routes.js";
import diagnosticRoutes from "./routes/diagnostic.routes.js";
import { prisma } from "./lib/prisma.js";

// =============================================================================
// ENVIRONMENT VALIDATION
// =============================================================================
// Validate required environment variables before starting the server
// This ensures the application fails fast if critical configuration is missing

const envValidation = validateEnvironment();
if (envValidation.warnings.length > 0) {
  printEnvironmentWarnings(envValidation.warnings);
}

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 3001;

// Trust proxy - required for rate limiting and secure cookies behind nginx/load balancer
app.set("trust proxy", 1);

// Initialize WebSocket
initializeWebSocket(httpServer);

// Initialize Email Service (async, non-blocking)
initializeEmailService().catch((err) => {
  logger.warn("Email service initialization failed, emails will be logged instead", { error: err.message });
});

// =============================================================================
// MIDDLEWARE
// =============================================================================

// Security headers
app.use(helmet());

// CORS configuration with strict production validation
const getAllowedOrigins = (): string[] => {
  const corsOrigins =
    process.env.CORS_ORIGINS?.split(",").map((o) => o.trim()) || [];

  if (process.env.NODE_ENV === "production" && corsOrigins.length === 0) {
    throw new Error(
      "CRITICAL: CORS_ORIGINS must be set in production environment",
    );
  }

  return corsOrigins.length > 0
    ? corsOrigins
    : ["http://localhost:5173", "http://localhost:5174"];
};

app.use(
  cors({
    origin: getAllowedOrigins(),
    credentials: true,
  }),
);

// =============================================================================
// RATE LIMITERS (Tiered by endpoint sensitivity)
// Environment-aware: relaxed in dev/test, strict in production
// =============================================================================

const defaultLimiter = createDefaultLimiter();
const authLimiter = createAuthLimiter();
const uploadLimiter = createUploadLimiter();
const aiLimiter = createAiLimiter();
const reportLimiter = createReportLimiter();
const adminLimiter = createAdminLimiter();
const userManagementLimiter = createUserManagementLimiter();
const financialLimiter = createFinancialLimiter();
const orderLimiter = createOrderLimiter();
const portalLimiter = createPortalLimiter();

// Apply default limiter globally
app.use(defaultLimiter);

// Body parsing - 50MB limit to match multer file upload limits
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(cookieParser());

// Request ID middleware (must be before request logger)
app.use(requestIdMiddleware);

// Request logging
app.use(requestLogger);

// Metrics collection
app.use(metricsMiddleware);

// CSRF protection (after cookie parser, before routes)
// Uses double-submit cookie pattern, safe methods (GET, HEAD, OPTIONS) and exempt paths are skipped
app.use(csrfProtection);

// =============================================================================
// API DOCUMENTATION
// =============================================================================
// Phase 4.1: Swagger/OpenAPI documentation at /api/docs
setupSwagger(app);

// =============================================================================
// ROUTES
// =============================================================================

// Health check
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    websocket: {
      enabled: true,
      onlineUsers: getOnlineUsersCount(),
    },
  });
});

// Metrics endpoint (JSON or Prometheus format)
app.get("/metrics", metricsHandler);

// CSRF token endpoint
app.get("/api/csrf-token", getCsrfTokenHandler);

// Health check routes (public, no auth/rate limiting)
app.use("/health", healthRoutes);
app.use("/api/health", healthRoutes);

// API routes with specific rate limiters
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/auth", authLimiter, passwordResetRoutes); // Password reset routes
app.use("/api/clients", defaultLimiter, clientRoutes);
app.use("/api/clients/:clientId/products", productRoutes);
app.use("/api/clients/:clientId/orphans", orphanReconciliationRoutes);
app.use("/api/clients/:clientId/locations", locationRoutes);
app.use("/api/alerts", alertRoutes);
app.use("/api/imports", uploadLimiter, importRoutes);
app.use("/api/reports", reportLimiter, reportRoutes);
app.use("/api/ai", aiLimiter, aiRoutes);
app.use("/api/portal", portalLimiter, portalRoutes);
app.use("/api/exports", reportLimiter, exportRoutes);
app.use("/api/audit", adminLimiter, auditRoutes);
app.use("/api/analytics", aiLimiter, analyticsRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/filters", filterRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/orders", orderLimiter, orderRoutes);
app.use("/api/collaboration", collaborationRoutes);
app.use("/api/feedback", feedbackRoutes);
app.use("/api/users", userManagementLimiter, userRoutes);
app.use("/api/artworks", uploadLimiter, artworkRoutes);
app.use("/api/financial", financialLimiter, financialRoutes);
app.use("/api/shipments", shipmentRoutes);
app.use("/api/order-timing", orderTimingRoutes);
app.use("/api/location-analytics", locationAnalyticsRoutes);
app.use("/api/ml", aiLimiter, mlRoutes);
app.use("/api/benchmarking", benchmarkingRoutes);
app.use("/api/preferences", preferencesRoutes);
app.use("/api/documentation", documentationRoutes);
app.use("/api/client-health", clientHealthRoutes);
app.use("/api/notification-preferences", notificationPreferencesRoutes);
app.use("/api/admin/ds-analytics", adminLimiter, dsAnalyticsAdminRoutes);
app.use("/api/diagnostics", adminLimiter, diagnosticRoutes);

// Serve uploaded artwork files
app.use("/uploads/artworks", express.static("./uploads/artworks"));

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Error handler
app.use(errorHandler);

// =============================================================================
// START SERVER
// =============================================================================

httpServer.listen(PORT, () => {
  logger.info("Server started", {
    port: PORT,
    environment: process.env.NODE_ENV || "development",
    websocket: true,
  });
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   🚀 Inventory Intelligence Platform API                      ║
║                                                               ║
║   HTTP Server:     http://localhost:${PORT}                    ║
║   WebSocket:       ws://localhost:${PORT}                      ║
║   Environment:     ${process.env.NODE_ENV || "development"}                              ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
  `);
});

// =============================================================================
// GRACEFUL SHUTDOWN HANDLER
// =============================================================================
// Ensures imports are properly marked as failed and advisory locks are released
// when the server shuts down (PM2 restart, deploy, etc.)

let isShuttingDown = false;

const gracefulShutdown = async (signal: string) => {
  if (isShuttingDown) {
    logger.warn("Shutdown already in progress, ignoring signal", { signal });
    return;
  }
  isShuttingDown = true;

  logger.info(`Received ${signal}, starting graceful shutdown...`);

  try {
    // 1. Mark any processing imports as failed so they don't block new imports
    const stuckImports = await prisma.importBatch.updateMany({
      where: { status: { in: ["processing", "pending"] } },
      data: {
        status: "failed",
        completedAt: new Date(),
        errors: [{
          message: "Import interrupted by server shutdown",
          details: `Server received ${signal} signal and began graceful shutdown.`,
        }],
      },
    });

    if (stuckImports.count > 0) {
      logger.info("Marked in-progress imports as failed", {
        count: stuckImports.count,
        reason: "server_shutdown",
      });
    }

    // 2. Release all advisory locks held by this session
    // This prevents orphaned locks from blocking new imports after restart
    try {
      await prisma.$executeRaw`SELECT pg_advisory_unlock_all()`;
      logger.info("Released all advisory locks");
    } catch (lockError) {
      logger.warn("Failed to release advisory locks on shutdown", {
        error: lockError instanceof Error ? lockError.message : String(lockError),
      });
    }

    // 3. Close database connections cleanly
    await prisma.$disconnect();
    logger.info("Database connections closed");

    // 4. Close HTTP server to stop accepting new connections
    httpServer.close(() => {
      logger.info("HTTP server closed");
      process.exit(0);
    });

    // Force exit after 10 seconds if graceful shutdown hangs
    setTimeout(() => {
      logger.error("Graceful shutdown timed out, forcing exit", new Error("Shutdown timeout"));
      process.exit(1);
    }, 10000);

  } catch (error) {
    logger.error("Error during graceful shutdown", error instanceof Error ? error : new Error(String(error)));
    process.exit(1);
  }
};

// Handle shutdown signals
process.on("SIGTERM", () => gracefulShutdown("SIGTERM")); // PM2 sends this
process.on("SIGINT", () => gracefulShutdown("SIGINT"));   // Ctrl+C sends this

export default app;
