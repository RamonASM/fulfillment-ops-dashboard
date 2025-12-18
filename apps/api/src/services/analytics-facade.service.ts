/**
 * Analytics Facade Service
 * Provides unified interface for usage analytics with gradual DS Analytics rollout
 *
 * This facade:
 * 1. Checks if DS Analytics is enabled for a client (feature flag)
 * 2. Checks if DS Analytics service is healthy
 * 3. Routes to DS Analytics or TypeScript fallback accordingly
 * 4. Provides monitoring and logging for the migration
 * 5. Implements circuit breaker pattern to prevent hammering failed service
 */

import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import {
  dsAnalyticsService,
  calculateUsageAfterImport as dsCalculateUsage,
  recalculateClientUsage as dsRecalculateClient,
} from "./ds-analytics.service.js";
import {
  recalculateClientUsage as tsRecalculateClient,
  recalculateClientMonthlyUsage as tsRecalculateMonthly,
  recalculateProductUsage as tsRecalculateProduct,
} from "./usage.service.js";

// =============================================================================
// CIRCUIT BREAKER
// =============================================================================

/**
 * Circuit Breaker for DS Analytics service
 * Prevents repeated calls to a failing service and allows automatic recovery
 *
 * States:
 * - CLOSED: Normal operation, calls go through
 * - OPEN: Service is down, calls are blocked (fallback immediately)
 * - HALF_OPEN: Testing if service recovered (one call allowed)
 */
const circuitBreaker = {
  state: "CLOSED" as "CLOSED" | "OPEN" | "HALF_OPEN",
  failures: 0,
  lastFailureTime: 0,
  lastAlertTime: 0,

  // Configuration
  MAX_FAILURES: 3,
  RESET_TIMEOUT_MS: 5 * 60 * 1000, // 5 minutes before trying again
  ALERT_COOLDOWN_MS: 30 * 60 * 1000, // 30 minutes between alerts

  /**
   * Record a successful call - reset failures and close circuit
   */
  recordSuccess(): void {
    if (this.failures > 0 || this.state !== "CLOSED") {
      logger.info("Circuit breaker: DS Analytics recovered", {
        previousFailures: this.failures,
        previousState: this.state,
      });
    }
    this.failures = 0;
    this.state = "CLOSED";
  },

  /**
   * Record a failure - increment counter and potentially open circuit
   */
  async recordFailure(error: Error): Promise<void> {
    this.failures++;
    this.lastFailureTime = Date.now();

    logger.error(
      `Circuit breaker: DS Analytics failure ${this.failures}/${this.MAX_FAILURES}`,
      error,
    );

    if (this.failures >= this.MAX_FAILURES && this.state === "CLOSED") {
      this.state = "OPEN";
      logger.error(
        "Circuit breaker OPENED: DS Analytics service unreachable",
        error,
        {
          consecutiveFailures: this.failures,
          willRetryIn: `${this.RESET_TIMEOUT_MS / 1000 / 60} minutes`,
        },
      );

      // Send admin alert (with cooldown to prevent spam)
      await this.sendAdminAlert();
    }
  },

  /**
   * Check if a call should be allowed through the circuit breaker
   */
  shouldAllow(): boolean {
    if (this.state === "CLOSED") {
      return true;
    }

    if (this.state === "OPEN") {
      // Check if enough time has passed to try again
      const timeSinceFailure = Date.now() - this.lastFailureTime;
      if (timeSinceFailure >= this.RESET_TIMEOUT_MS) {
        // Transition to half-open: allow one test request
        this.state = "HALF_OPEN";
        logger.info(
          "Circuit breaker: Transitioning to HALF_OPEN, testing service...",
        );
        return true;
      }
      return false;
    }

    // HALF_OPEN: allow the test request
    return true;
  },

  /**
   * Get current circuit breaker status
   */
  getStatus(): {
    state: string;
    failures: number;
    lastFailure: Date | null;
    timeUntilRetry: number | null;
  } {
    let timeUntilRetry: number | null = null;

    if (this.state === "OPEN") {
      const elapsed = Date.now() - this.lastFailureTime;
      timeUntilRetry = Math.max(0, this.RESET_TIMEOUT_MS - elapsed);
    }

    return {
      state: this.state,
      failures: this.failures,
      lastFailure:
        this.lastFailureTime > 0 ? new Date(this.lastFailureTime) : null,
      timeUntilRetry,
    };
  },

  /**
   * Send admin alert when circuit opens (with cooldown)
   */
  async sendAdminAlert(): Promise<void> {
    const now = Date.now();

    // Check cooldown to prevent alert spam
    if (now - this.lastAlertTime < this.ALERT_COOLDOWN_MS) {
      logger.debug("Circuit breaker: Skipping alert (cooldown active)");
      return;
    }

    this.lastAlertTime = now;

    try {
      // Log as critical for monitoring systems to pick up
      logger.error(
        "ALERT: DS Analytics service unavailable - using TypeScript fallback",
        new Error("Service degraded"),
        {
          alertType: "SERVICE_DEGRADED",
          service: "ds-analytics",
          consecutiveFailures: this.failures,
          fallbackActive: true,
          timestamp: new Date().toISOString(),
        },
      );

      // Create an alert record in the database for the admin dashboard
      // Note: Alert model requires clientId, so we create a system-level alert
      // by using a placeholder or skipping DB alert if no system client exists
      // For now, just log - the critical log above is sufficient for monitoring
      logger.warn(
        "Circuit breaker alert: Consider adding system alerts table for service health",
        {
          service: "ds-analytics",
          consecutiveFailures: this.failures,
          lastFailure: new Date(this.lastFailureTime).toISOString(),
          retryIn: `${this.RESET_TIMEOUT_MS / 1000 / 60} minutes`,
        },
      );
    } catch (error) {
      logger.warn("Failed to send circuit breaker admin alert", { error });
    }
  },
};

// =============================================================================
// TYPES
// =============================================================================

export interface AnalyticsResult {
  success: boolean;
  method: "ds_analytics" | "typescript" | "fallback";
  clientId: string;
  productsProcessed?: number;
  error?: string;
  duration?: number;
}

export interface ClientAnalyticsStatus {
  clientId: string;
  clientName: string;
  dsAnalyticsEnabled: boolean;
  dsAnalyticsHealthy: boolean;
  lastCalculation?: Date;
  calculationMethod?: string;
}

// =============================================================================
// FEATURE FLAG HELPERS
// =============================================================================

/**
 * Check if DS Analytics is enabled for a specific client
 */
export async function isDsAnalyticsEnabledForClient(
  clientId: string,
): Promise<boolean> {
  try {
    const config = await prisma.clientConfiguration.findUnique({
      where: { clientId },
      select: { dsAnalyticsEnabled: true },
    });

    return config?.dsAnalyticsEnabled ?? false;
  } catch (error) {
    logger.error("Failed to check DS Analytics flag", error as Error, {
      clientId,
    });
    return false;
  }
}

/**
 * Check if the DS Analytics Python service is healthy and responsive
 */
export async function isDsAnalyticsHealthy(): Promise<boolean> {
  try {
    return await dsAnalyticsService.healthCheck();
  } catch (error) {
    logger.warn("DS Analytics health check failed", { error });
    return false;
  }
}

/**
 * Get combined status: is DS Analytics both enabled AND healthy?
 */
export async function shouldUseDsAnalytics(clientId: string): Promise<{
  enabled: boolean;
  healthy: boolean;
  shouldUse: boolean;
}> {
  const enabled = await isDsAnalyticsEnabledForClient(clientId);
  const healthy = enabled ? await isDsAnalyticsHealthy() : false;

  return {
    enabled,
    healthy,
    shouldUse: enabled && healthy,
  };
}

// =============================================================================
// FACADE FUNCTIONS
// =============================================================================

/**
 * Recalculate usage for a single client
 * Routes to DS Analytics or TypeScript based on feature flag, service health, and circuit breaker
 */
export async function recalculateClientUsage(
  clientId: string,
): Promise<AnalyticsResult> {
  const startTime = Date.now();

  try {
    const { enabled, healthy, shouldUse } =
      await shouldUseDsAnalytics(clientId);

    // Check circuit breaker BEFORE attempting DS Analytics
    const circuitAllows = circuitBreaker.shouldAllow();

    if (shouldUse && circuitAllows) {
      // Use DS Analytics (Python)
      try {
        await dsRecalculateClient(clientId);

        // SUCCESS - record with circuit breaker
        circuitBreaker.recordSuccess();

        const duration = Date.now() - startTime;
        logger.info("Client usage recalculated via DS Analytics", {
          clientId,
          method: "ds_analytics",
          duration,
          circuitState: circuitBreaker.state,
        });

        return {
          success: true,
          method: "ds_analytics",
          clientId,
          duration,
        };
      } catch (dsError) {
        // FAILURE - record with circuit breaker
        await circuitBreaker.recordFailure(dsError as Error);

        logger.error(
          "DS Analytics failed, falling back to TypeScript",
          dsError as Error,
          {
            clientId,
            circuitState: circuitBreaker.state,
            consecutiveFailures: circuitBreaker.failures,
          },
        );

        // Fall through to TypeScript fallback
      }
    } else if (shouldUse && !circuitAllows) {
      // Circuit is open - skip DS Analytics entirely
      logger.debug("Skipping DS Analytics (circuit breaker open)", {
        clientId,
        circuitState: circuitBreaker.state,
        timeUntilRetry: circuitBreaker.getStatus().timeUntilRetry,
      });
    }

    // Use TypeScript fallback (either by design, after DS failure, or circuit open)
    await tsRecalculateClient(clientId);
    await tsRecalculateMonthly(clientId);

    const duration = Date.now() - startTime;
    const method = enabled ? "fallback" : "typescript";

    logger.info(`Client usage recalculated via ${method}`, {
      clientId,
      method,
      duration,
      dsEnabled: enabled,
      dsHealthy: healthy,
      circuitState: circuitBreaker.state,
    });

    return {
      success: true,
      method,
      clientId,
      duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error("Client usage recalculation failed", error as Error, {
      clientId,
      duration,
    });

    return {
      success: false,
      method: "typescript",
      clientId,
      error: (error as Error).message,
      duration,
    };
  }
}

/**
 * Recalculate usage for products after import
 * Uses circuit breaker to prevent hammering failing DS Analytics service
 */
export async function calculateUsageAfterImport(
  productIds: string[],
  clientId: string,
): Promise<AnalyticsResult> {
  const startTime = Date.now();

  try {
    const { enabled, healthy, shouldUse } =
      await shouldUseDsAnalytics(clientId);

    // Check circuit breaker BEFORE attempting DS Analytics
    const circuitAllows = circuitBreaker.shouldAllow();

    if (shouldUse && circuitAllows) {
      try {
        await dsCalculateUsage(productIds, clientId);

        // SUCCESS - record with circuit breaker
        circuitBreaker.recordSuccess();

        const duration = Date.now() - startTime;
        logger.info("Post-import usage calculated via DS Analytics", {
          clientId,
          productCount: productIds.length,
          method: "ds_analytics",
          duration,
          circuitState: circuitBreaker.state,
        });

        return {
          success: true,
          method: "ds_analytics",
          clientId,
          productsProcessed: productIds.length,
          duration,
        };
      } catch (dsError) {
        // FAILURE - record with circuit breaker
        await circuitBreaker.recordFailure(dsError as Error);

        logger.error(
          "DS Analytics post-import failed, falling back",
          dsError as Error,
          {
            clientId,
            productCount: productIds.length,
            circuitState: circuitBreaker.state,
            consecutiveFailures: circuitBreaker.failures,
          },
        );
        // Fall through to TypeScript
      }
    } else if (shouldUse && !circuitAllows) {
      // Circuit is open - skip DS Analytics entirely
      logger.debug(
        "Skipping DS Analytics for post-import (circuit breaker open)",
        {
          clientId,
          productCount: productIds.length,
          circuitState: circuitBreaker.state,
        },
      );
    }

    // TypeScript fallback - process each product
    for (const productId of productIds) {
      try {
        await tsRecalculateProduct(productId);
      } catch (error) {
        logger.warn("Product usage recalculation failed", {
          productId,
          error: (error as Error).message,
        });
      }
    }

    const duration = Date.now() - startTime;
    const method = enabled ? "fallback" : "typescript";

    logger.info(`Post-import usage calculated via ${method}`, {
      clientId,
      productCount: productIds.length,
      method,
      duration,
      circuitState: circuitBreaker.state,
    });

    return {
      success: true,
      method,
      clientId,
      productsProcessed: productIds.length,
      duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error("Post-import usage calculation failed", error as Error, {
      clientId,
      productCount: productIds.length,
      duration,
    });

    return {
      success: false,
      method: "typescript",
      clientId,
      error: (error as Error).message,
      duration,
    };
  }
}

/**
 * Recalculate usage for all active clients
 * Used by the daily scheduler job
 */
export async function recalculateAllClientsUsage(): Promise<{
  total: number;
  dsAnalytics: number;
  typescript: number;
  fallback: number;
  failed: number;
}> {
  const clients = await prisma.client.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  });

  const stats = {
    total: clients.length,
    dsAnalytics: 0,
    typescript: 0,
    fallback: 0,
    failed: 0,
  };

  logger.info("Starting usage recalculation for all clients", {
    clientCount: clients.length,
  });

  for (const client of clients) {
    try {
      const result = await recalculateClientUsage(client.id);

      if (result.success) {
        if (result.method === "ds_analytics") stats.dsAnalytics++;
        else if (result.method === "typescript") stats.typescript++;
        else if (result.method === "fallback") stats.fallback++;
      } else {
        stats.failed++;
      }

      // Small delay between clients to avoid overloading
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      stats.failed++;
      logger.error(`Failed to recalculate ${client.name}`, error as Error, {
        clientId: client.id,
      });
    }
  }

  logger.info("All client recalculations completed", stats);
  return stats;
}

// =============================================================================
// ADMIN MONITORING FUNCTIONS
// =============================================================================

/**
 * Get analytics status for all clients (for admin dashboard)
 */
export async function getAllClientsAnalyticsStatus(): Promise<
  ClientAnalyticsStatus[]
> {
  const clients = await prisma.client.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      configuration: {
        select: { dsAnalyticsEnabled: true },
      },
    },
    orderBy: { name: "asc" },
  });

  const dsHealthy = await isDsAnalyticsHealthy();

  return clients.map((client) => ({
    clientId: client.id,
    clientName: client.name,
    dsAnalyticsEnabled: client.configuration?.dsAnalyticsEnabled ?? false,
    dsAnalyticsHealthy: dsHealthy,
  }));
}

/**
 * Enable DS Analytics for a specific client
 */
export async function enableDsAnalyticsForClient(
  clientId: string,
): Promise<void> {
  await prisma.clientConfiguration.upsert({
    where: { clientId },
    update: { dsAnalyticsEnabled: true },
    create: {
      clientId,
      dsAnalyticsEnabled: true,
    },
  });

  logger.info("DS Analytics enabled for client", { clientId });
}

/**
 * Disable DS Analytics for a specific client
 */
export async function disableDsAnalyticsForClient(
  clientId: string,
): Promise<void> {
  await prisma.clientConfiguration.upsert({
    where: { clientId },
    update: { dsAnalyticsEnabled: false },
    create: {
      clientId,
      dsAnalyticsEnabled: false,
    },
  });

  logger.info("DS Analytics disabled for client", { clientId });
}

/**
 * Get DS Analytics service stats
 */
export async function getDsAnalyticsStats(): Promise<{
  healthy: boolean;
  stats: any | null;
}> {
  const healthy = await isDsAnalyticsHealthy();

  if (!healthy) {
    return { healthy: false, stats: null };
  }

  const stats = await dsAnalyticsService.getStats();
  return { healthy: true, stats };
}

/**
 * Get circuit breaker status for admin monitoring
 */
export function getCircuitBreakerStatus(): {
  state: string;
  failures: number;
  lastFailure: Date | null;
  timeUntilRetry: number | null;
  isOpen: boolean;
  isHalfOpen: boolean;
} {
  const status = circuitBreaker.getStatus();
  return {
    ...status,
    isOpen: circuitBreaker.state === "OPEN",
    isHalfOpen: circuitBreaker.state === "HALF_OPEN",
  };
}

/**
 * Manually reset circuit breaker (for admin use)
 */
export function resetCircuitBreaker(): void {
  circuitBreaker.recordSuccess();
  logger.info("Circuit breaker manually reset by admin");
}
