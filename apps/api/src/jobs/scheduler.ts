import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import {
  recalculateClientUsage,
  recalculateClientMonthlyUsage,
} from "../services/usage.service.js";
import { runAlertGeneration } from "../services/alert.service.js";
import {
  createDailySnapshot,
  aggregateDailyAlertMetrics,
  refreshRiskScoreCache,
} from "../services/analytics.service.js";
import {
  getUpcomingDeadlines,
  updateClientTimingCache,
} from "../services/order-timing.service.js";
import { emitOrderDeadlineAlert } from "../services/notification.service.js";
import { BenchmarkingService } from "../services/benchmarking.service.js";

// =============================================================================
// JOB SCHEDULER
// Simple cron-like scheduler for periodic tasks
// =============================================================================

interface ScheduledJob {
  name: string;
  intervalMs: number;
  lastRun: Date | null;
  isRunning: boolean;
  run: () => Promise<void>;
}

const jobs: ScheduledJob[] = [];

/**
 * Register a job with the scheduler
 */
export function registerJob(
  name: string,
  intervalMs: number,
  handler: () => Promise<void>,
): void {
  jobs.push({
    name,
    intervalMs,
    lastRun: null,
    isRunning: false,
    run: handler,
  });
  logger.info("Registered scheduled job", { job: name, intervalMs });
}

/**
 * Start the scheduler
 */
export function startScheduler(): void {
  logger.info("Starting scheduler", { jobCount: jobs.length });

  setInterval(async () => {
    const now = new Date();

    for (const job of jobs) {
      // Skip if job is already running
      if (job.isRunning) continue;

      // Check if it's time to run
      const shouldRun =
        job.lastRun === null ||
        now.getTime() - job.lastRun.getTime() >= job.intervalMs;

      if (shouldRun) {
        job.isRunning = true;
        const timer = logger.startTimer();
        logger.info("Running scheduled job", { job: job.name });

        try {
          await job.run();
          job.lastRun = now;
          logger.info("Completed scheduled job", {
            job: job.name,
            durationMs: timer(),
          });
        } catch (error) {
          logger.error(`Scheduled job failed: ${job.name}`, error as Error, {
            job: job.name,
          });
        } finally {
          job.isRunning = false;
        }
      }
    }
  }, 10000); // Check every 10 seconds
}

// =============================================================================
// SCHEDULED JOBS
// =============================================================================

/**
 * Daily usage recalculation for all active clients
 * Runs every 24 hours
 */
registerJob("daily-usage-recalculation", 24 * 60 * 60 * 1000, async () => {
  const clients = await prisma.client.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  });

  for (const client of clients) {
    try {
      logger.debug("Recalculating usage for client", {
        clientId: client.id,
        clientName: client.name,
      });
      // Phase 12: Basic usage metrics
      await recalculateClientUsage(client.id);
      // Phase 13: Monthly usage with tier transparency (12-mo, 6-mo, 3-mo, weekly)
      await recalculateClientMonthlyUsage(client.id);
    } catch (error) {
      logger.error(
        `Usage recalculation failed for client: ${client.name}`,
        error as Error,
        { clientId: client.id },
      );
    }
  }
});

/**
 * Hourly alert generation for all active clients
 * Runs every hour
 */
registerJob("hourly-alert-generation", 60 * 60 * 1000, async () => {
  const clients = await prisma.client.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  });

  for (const client of clients) {
    try {
      logger.debug("Generating alerts for client", {
        clientId: client.id,
        clientName: client.name,
      });
      await runAlertGeneration(client.id);
    } catch (error) {
      logger.error(
        `Alert generation failed for client: ${client.name}`,
        error as Error,
        { clientId: client.id },
      );
    }
  }
});

/**
 * Stock history snapshot - records current stock levels
 * Runs every 6 hours
 */
registerJob("stock-history-snapshot", 6 * 60 * 60 * 1000, async () => {
  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      client: { isActive: true },
    },
    select: {
      id: true,
      currentStockPacks: true,
      packSize: true,
    },
  });

  const snapshots = products.map((p) => ({
    productId: p.id,
    packsAvailable: p.currentStockPacks,
    totalUnits: p.currentStockPacks * p.packSize,
    source: "scheduled_snapshot" as const,
  }));

  // Batch insert in chunks of 1000
  const chunkSize = 1000;
  for (let i = 0; i < snapshots.length; i += chunkSize) {
    const chunk = snapshots.slice(i, i + chunkSize);
    await prisma.stockHistory.createMany({ data: chunk });
  }

  logger.info("Created stock history snapshots", { count: snapshots.length });
});

// =============================================================================
// PHASE 11: ANALYTICS AGGREGATION JOBS
// =============================================================================

/**
 * Daily snapshot - records product stock levels for trend analysis
 * Runs at 2 AM daily (checked every 24 hours after first run)
 */
registerJob("daily-snapshot", 24 * 60 * 60 * 1000, async () => {
  await createDailySnapshot();
});

/**
 * Daily alert metrics aggregation
 * Runs at 3 AM daily (checked every 24 hours after first run)
 */
registerJob("daily-alert-metrics", 24 * 60 * 60 * 1000, async () => {
  await aggregateDailyAlertMetrics();
});

/**
 * Hourly risk score cache refresh
 * Pre-computes risk scores for all products
 * Runs every hour
 */
registerJob("hourly-risk-cache", 60 * 60 * 1000, async () => {
  await refreshRiskScoreCache();
});

// =============================================================================
// PHASE 3.5: ORDER DEADLINE ALERT JOBS
// =============================================================================

/**
 * Alert days before deadline to send notifications
 * These are the days remaining when we trigger alerts
 */
const ALERT_DAYS = [14, 7, 3, 1, 0, -1, -3, -7];

/**
 * Hourly order deadline check
 * Checks for approaching deadlines and creates alerts at specific thresholds
 * Runs every hour
 */
registerJob("hourly-order-deadline-check", 60 * 60 * 1000, async () => {
  const clients = await prisma.client.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  });

  let totalAlerts = 0;

  for (const client of clients) {
    try {
      // Get all upcoming deadlines (including overdue)
      const deadlines = await getUpcomingDeadlines(client.id, {
        daysAhead: 30,
      });

      for (const deadline of deadlines) {
        if (deadline.daysUntilOrderDeadline === null) continue;

        // Check if we should alert for this deadline
        const shouldAlert = ALERT_DAYS.some(
          (alertDay) =>
            Math.floor(deadline.daysUntilOrderDeadline!) === alertDay ||
            (deadline.daysUntilOrderDeadline! < 0 &&
              alertDay < 0 &&
              deadline.daysUntilOrderDeadline! >= alertDay),
        );

        if (!shouldAlert) continue;

        // Check if we already have an active alert for this product at this threshold
        const existingAlert = await prisma.alert.findFirst({
          where: {
            productId: deadline.productId,
            alertType: "order_deadline",
            isDismissed: false,
            createdAt: {
              // Don't create duplicate alerts within 6 hours
              gte: new Date(Date.now() - 6 * 60 * 60 * 1000),
            },
          },
        });

        if (existingAlert) continue;

        // Determine severity based on days until deadline
        let severity: "info" | "warning" | "critical" = "info";
        if (deadline.daysUntilOrderDeadline! <= 0) {
          severity = "critical";
        } else if (deadline.daysUntilOrderDeadline! <= 3) {
          severity = "critical";
        } else if (deadline.daysUntilOrderDeadline! <= 7) {
          severity = "warning";
        }

        // Create the alert
        await prisma.alert.create({
          data: {
            clientId: client.id,
            productId: deadline.productId,
            alertType: "order_deadline",
            severity,
            title:
              deadline.daysUntilOrderDeadline! < 0
                ? `ORDER OVERDUE: ${deadline.productName}`
                : `Order Soon: ${deadline.productName}`,
            message: deadline.urgencyMessage,
            thresholdValue: deadline.totalLeadTimeDays,
            currentValue: deadline.daysUntilOrderDeadline!,
          },
        });

        // Emit real-time notification
        if (deadline.lastOrderByDate) {
          await emitOrderDeadlineAlert(client.id, {
            id: deadline.productId,
            name: deadline.productName,
            productId: deadline.productCode,
            daysUntilDeadline: deadline.daysUntilOrderDeadline!,
            orderByDate: new Date(deadline.lastOrderByDate),
            stockoutDate: deadline.projectedStockoutDate
              ? new Date(deadline.projectedStockoutDate)
              : null,
            currentStockUnits: deadline.currentStockUnits,
          });
        }

        totalAlerts++;
      }

      logger.debug("Processed order deadline alerts for client", {
        clientId: client.id,
        clientName: client.name,
      });
    } catch (error) {
      logger.error(
        `Order deadline check failed for client: ${client.name}`,
        error as Error,
        {
          clientId: client.id,
        },
      );
    }
  }

  logger.info("Order deadline check completed", { totalAlerts });
});

/**
 * Daily timing cache recalculation
 * Recalculates stockout dates and order-by dates for all products
 * Runs every 24 hours
 */
registerJob("daily-timing-cache-refresh", 24 * 60 * 60 * 1000, async () => {
  const clients = await prisma.client.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  });

  let totalUpdated = 0;

  for (const client of clients) {
    try {
      const result = await updateClientTimingCache(client.id);
      totalUpdated += result.updated;
      logger.debug("Refreshed timing cache for client", {
        clientId: client.id,
        clientName: client.name,
        productsUpdated: result.updated,
        productsSkipped: result.skipped,
      });
    } catch (error) {
      logger.error(
        `Timing cache refresh failed for client: ${client.name}`,
        error as Error,
        {
          clientId: client.id,
        },
      );
    }
  }

  logger.info("Daily timing cache refresh completed", {
    totalProductsUpdated: totalUpdated,
  });
});

/**
 * Resolve deadline alerts when stock is replenished
 * Runs every 2 hours
 */
registerJob("resolve-deadline-alerts", 2 * 60 * 60 * 1000, async () => {
  // Find all active order_deadline alerts
  const alerts = await prisma.alert.findMany({
    where: {
      alertType: "order_deadline",
      isDismissed: false,
    },
    include: {
      product: true,
    },
  });

  let resolvedCount = 0;

  for (const alert of alerts) {
    if (!alert.product || !alert.productId) continue;

    // Recalculate the deadline for this product
    try {
      const deadlines = await getUpcomingDeadlines(alert.clientId, {
        daysAhead: 90,
      });
      const productDeadline = deadlines.find(
        (d) => d.productId === alert.productId,
      );

      // If no deadline found (stock is healthy) or deadline is now > 14 days away
      // resolve the alert
      if (
        !productDeadline ||
        productDeadline.daysUntilOrderDeadline === null ||
        productDeadline.daysUntilOrderDeadline > 14
      ) {
        await prisma.alert.update({
          where: { id: alert.id },
          data: {
            isDismissed: true,
            dismissedAt: new Date(),
          },
        });
        resolvedCount++;
      }
    } catch (error) {
      logger.error("Failed to resolve deadline alert", error as Error, {
        alertId: alert.id,
        productId: alert.productId,
      });
    }
  }

  if (resolvedCount > 0) {
    logger.info("Resolved order deadline alerts", { resolvedCount });
  }
});

// =============================================================================
// PHASE 6: BENCHMARKING SNAPSHOT GENERATION
// =============================================================================

/**
 * Monthly benchmark snapshot generation
 * Generates performance benchmarks for all cohorts
 * Runs on the 1st of each month at 4 AM (daily check)
 */
registerJob("monthly-benchmark-snapshot", 24 * 60 * 60 * 1000, async () => {
  const now = new Date();

  // Only run on the 1st of the month
  if (now.getDate() !== 1) {
    logger.debug("Skipping benchmark snapshot - not 1st of month");
    return;
  }

  // Get all active cohorts
  const cohorts = await BenchmarkingService.getAvailableCohorts();

  logger.info("Generating monthly benchmark snapshots", { cohorts });

  for (const cohort of cohorts) {
    try {
      await BenchmarkingService.generateSnapshot(cohort);
      logger.info("Generated benchmark snapshot", { cohort });
    } catch (error) {
      logger.error(
        `Benchmark snapshot failed for cohort: ${cohort}`,
        error as Error,
        { cohort },
      );
    }
  }

  logger.info("Monthly benchmark snapshot generation completed", {
    cohortCount: cohorts.length,
  });
});

// Export for manual initialization
export default {
  registerJob,
  startScheduler,
};
