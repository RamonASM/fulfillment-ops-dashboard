import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
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
import { recalculateAllClientsUsage, recalculateClientUsage, isDsAnalyticsHealthy } from "../services/analytics-facade.service.js";
import { MLClientService } from "../services/ml-client.service.js";
import { dsAnalyticsService } from "../services/ds-analytics.service.js";

// =============================================================================
// JOB SCHEDULER
// Simple cron-like scheduler for periodic tasks with mutex protection
// =============================================================================

interface ScheduledJob {
  name: string;
  intervalMs: number;
  lastRun: Date | null;
  isRunning: boolean;
  run: () => Promise<void>;
}

const jobs: ScheduledJob[] = [];

// Mutex map to prevent concurrent job execution (prevents race condition)
const jobLocks = new Map<string, Promise<void>>();

/**
 * Acquire a lock for a job - prevents concurrent execution
 * Returns a release function if lock acquired, null if already locked
 */
function acquireJobLock(jobName: string): (() => void) | null {
  if (jobLocks.has(jobName)) {
    return null; // Job is already running
  }

  let releaseFn: () => void;
  const lockPromise = new Promise<void>((resolve) => {
    releaseFn = resolve;
  });

  jobLocks.set(jobName, lockPromise);

  return () => {
    jobLocks.delete(jobName);
    releaseFn();
  };
}

/**
 * Register a job with the scheduler
 */
export function registerJob(
  name: string,
  intervalMs: number,
  handler: () => Promise<void>,
): void {
  // Prevent duplicate job registration
  if (jobs.some(j => j.name === name)) {
    logger.warn("Job already registered, skipping duplicate", { job: name });
    return;
  }

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
      // Acquire lock atomically - this prevents the race condition
      const release = acquireJobLock(job.name);
      if (!release) {
        // Job is already running, skip
        continue;
      }

      // Check if it's time to run
      const shouldRun =
        job.lastRun === null ||
        now.getTime() - job.lastRun.getTime() >= job.intervalMs;

      if (!shouldRun) {
        // Release lock immediately if we're not running
        release();
        continue;
      }

      // Mark as running and execute
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
        release(); // Always release the lock
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
 * Uses analytics facade to route between DS Analytics (Python) and TypeScript
 * based on per-client feature flags
 */
registerJob("daily-usage-recalculation", 24 * 60 * 60 * 1000, async () => {
  const stats = await recalculateAllClientsUsage();

  logger.info("Daily usage recalculation completed", {
    total: stats.total,
    dsAnalytics: stats.dsAnalytics,
    typescript: stats.typescript,
    fallback: stats.fallback,
    failed: stats.failed,
  });
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

/**
 * Retry failed import post-processing analytics
 * Checks for imports with failed post-processing and retries them
 * Runs every 15 minutes
 */
registerJob("retry-failed-import-analytics", 15 * 60 * 1000, async () => {
  // Find imports from last 24 hours with failed post-processing
  const recentImports = await prisma.importBatch.findMany({
    where: {
      status: { in: ["completed", "completed_with_errors"] },
      createdAt: {
        gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    },
    select: {
      id: true,
      clientId: true,
      metadata: true,
      createdAt: true,
    },
  });

  interface ServiceResult {
    success: boolean;
    error: string | null;
    duration: number;
    retriedAt?: string;
  }
  interface PostProcessingResults {
    usageRecalc?: ServiceResult;
    alertGeneration?: ServiceResult;
    dailySnapshot?: ServiceResult;
    riskScoreRefresh?: ServiceResult;
    alertMetrics?: ServiceResult;
  }

  let retriedCount = 0;
  let successCount = 0;

  for (const importBatch of recentImports) {
    const batchMetadata = importBatch.metadata as Record<string, unknown> | null;
    const results = batchMetadata?.postProcessingResults as PostProcessingResults | undefined;

    if (!results) continue;

    // Check for any failed services that haven't been retried yet
    const failedServices = Object.entries(results).filter(
      ([, r]) => r && !r.success && !r.retriedAt,
    );

    if (failedServices.length === 0) continue;

    logger.info("Retrying failed import analytics", {
      importId: importBatch.id,
      failedServices: failedServices.map(([name]) => name),
    });

    const retryResults: Record<string, ServiceResult> = {};

    for (const [serviceName] of failedServices) {
      const startTime = Date.now();
      try {
        switch (serviceName) {
          case "usageRecalc":
            await recalculateClientUsage(importBatch.clientId);
            break;
          case "alertGeneration":
            await runAlertGeneration(importBatch.clientId);
            break;
          case "dailySnapshot":
            await createDailySnapshot();
            break;
          case "riskScoreRefresh":
            await refreshRiskScoreCache();
            break;
          case "alertMetrics":
            await aggregateDailyAlertMetrics();
            break;
        }
        retryResults[serviceName] = {
          success: true,
          error: null,
          duration: Date.now() - startTime,
          retriedAt: new Date().toISOString(),
        };
        successCount++;
        logger.info(`✓ Retry succeeded: ${serviceName}`, { importId: importBatch.id });
      } catch (error) {
        retryResults[serviceName] = {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          duration: Date.now() - startTime,
          retriedAt: new Date().toISOString(),
        };
        logger.error(`✗ Retry failed: ${serviceName}`, error as Error, {
          importId: importBatch.id,
        });
      }
      retriedCount++;
    }

    // Update import metadata with retry results
    const updatedResults: PostProcessingResults = { ...results };
    for (const [serviceName, result] of Object.entries(retryResults)) {
      updatedResults[serviceName as keyof PostProcessingResults] = result;
    }

    await prisma.importBatch.update({
      where: { id: importBatch.id },
      data: {
        metadata: JSON.parse(JSON.stringify({
          ...batchMetadata,
          postProcessingResults: updatedResults,
          lastRetryAt: new Date().toISOString(),
        })),
      },
    });
  }

  if (retriedCount > 0) {
    logger.info("Import analytics retry completed", {
      retriedCount,
      successCount,
      failedCount: retriedCount - successCount,
    });
  }
});

/**
 * Daily trend monitoring - detects significant usage trend changes
 * Runs every 24 hours to analyze monthly usage snapshots and create alerts
 * for products with significant trend shifts
 */
registerJob("daily-trend-monitoring", 24 * 60 * 60 * 1000, async () => {
  logger.info("Running trend monitoring job");

  // Get all products with at least 3 months of usage snapshots
  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      client: { isActive: true },
    },
    include: {
      monthlyUsageSnapshots: {
        orderBy: { yearMonth: "desc" },
        take: 3,
      },
      client: {
        select: { id: true, name: true },
      },
    },
  });

  let alertsCreated = 0;

  for (const product of products) {
    const snapshots = product.monthlyUsageSnapshots;
    if (snapshots.length < 3) continue;

    // Calculate trend from last 3 months
    const [latest, prev, prevPrev] = snapshots;

    // Skip if no consumption data
    if (prev.consumedUnits === 0) continue;

    // Calculate percentage changes
    const recentChange =
      ((latest.consumedUnits - prev.consumedUnits) / prev.consumedUnits) * 100;
    const priorChange =
      ((prev.consumedUnits - prevPrev.consumedUnits) / prevPrev.consumedUnits) *
      100;

    // Detect significant trend shift (>20% difference between periods)
    const trendShift = Math.abs(recentChange - priorChange);
    if (trendShift < 20) continue;

    // Check if alert already exists for this product in the last 7 days
    const existingAlert = await prisma.alert.findFirst({
      where: {
        productId: product.id,
        alertType: "usage_trend_change",
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        },
      },
    });

    if (existingAlert) continue;

    // Determine severity based on magnitude of change
    const severity =
      Math.abs(recentChange) > 50
        ? "critical"
        : Math.abs(recentChange) > 30
          ? "warning"
          : "info";

    // Create alert
    await prisma.alert.create({
      data: {
        clientId: product.clientId,
        productId: product.id,
        alertType: "usage_trend_change",
        severity,
        status: "active",
        title: `Demand ${recentChange > 0 ? "Increase" : "Decrease"} Detected: ${product.name}`,
        message: `${product.name} demand ${recentChange > 0 ? "increased" : "decreased"} ${Math.abs(recentChange).toFixed(1)}% in the last 30 days. Previous trend was ${priorChange > 0 ? "+" : ""}${priorChange.toFixed(1)}%. This ${trendShift > 30 ? "significant" : "notable"} shift may require action.`,
        currentValue: latest.consumedUnits,
        thresholdValue: prev.consumedUnits,
        isRead: false,
        isDismissed: false,
      },
    });

    alertsCreated++;

    logger.debug("Created trend alert", {
      productId: product.id,
      productName: product.name,
      recentChange: recentChange.toFixed(1),
      priorChange: priorChange.toFixed(1),
      trendShift: trendShift.toFixed(1),
    });
  }

  logger.info("Trend monitoring completed", { alertsCreated });
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

// =============================================================================
// ML ANALYTICS JOBS
// =============================================================================

/**
 * Daily ML forecast generation
 * Generates demand forecasts for top 50 most active products
 * Runs every 24 hours
 */
registerJob("daily-ml-forecasts", 24 * 60 * 60 * 1000, async () => {
  logger.info("Starting daily ML forecast generation");

  // Check ML service health
  const isHealthy = await MLClientService.healthCheck();
  if (!isHealthy) {
    logger.warn("ML service unavailable, skipping forecasts");
    return;
  }

  // Get top 50 products by transaction count (last 90 days)
  const topProducts = await prisma.$queryRaw<
    Array<{ id: string; name: string; order_count: bigint }>
  >`
    SELECT p.id, p.name, COUNT(DISTINCT ori.order_request_id) as order_count
    FROM products p
    JOIN order_request_items ori ON ori.product_id = p.id
    JOIN order_requests o ON o.id = ori.order_request_id
    WHERE p.is_active = true
      AND o.created_at >= NOW() - INTERVAL '90 days'
    GROUP BY p.id, p.name
    ORDER BY order_count DESC
    LIMIT 50
  `;

  // Process products in parallel batches to avoid overwhelming the ML service
  const BATCH_SIZE = 10;
  let successCount = 0;
  let errorCount = 0;
  const errors: Array<{ productId: string; error: string }> = [];

  for (let i = 0; i < topProducts.length; i += BATCH_SIZE) {
    const batch = topProducts.slice(i, i + BATCH_SIZE);

    // Process batch in parallel using Promise.allSettled
    const results = await Promise.allSettled(
      batch.map(async (product) => {
        // Generate demand forecast
        await MLClientService.getDemandForecast(product.id, 30);

        // Generate stockout prediction
        const productData = await prisma.product.findUnique({
          where: { id: product.id },
          select: { currentStockUnits: true },
        });

        if (productData && productData.currentStockUnits > 0) {
          await MLClientService.predictStockout(
            product.id,
            productData.currentStockUnits,
            90,
          );
        }

        return product.id;
      }),
    );

    // Aggregate results
    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      if (result.status === "fulfilled") {
        successCount++;
      } else {
        errorCount++;
        errors.push({
          productId: batch[j].id,
          error: result.reason?.message || "Unknown error",
        });
      }
    }
  }

  // Log aggregated errors if any
  if (errors.length > 0) {
    logger.warn("ML forecast failures", {
      count: errors.length,
      samples: errors.slice(0, 5), // Log first 5 errors as samples
    });
  }

  logger.info("ML forecast job complete", {
    success: successCount,
    errors: errorCount,
    total: topProducts.length,
  });
});

/**
 * Weekly ML stockout alert generation
 * Scans products with low/critical stock for ML-predicted stockouts
 * Creates alerts for products predicted to stock out within 14 days
 * Runs every 7 days
 */
registerJob("weekly-ml-stockout-alerts", 7 * 24 * 60 * 60 * 1000, async () => {
  logger.info("Starting ML stockout alert scan");

  // Check ML service health
  const isHealthy = await MLClientService.healthCheck();
  if (!isHealthy) {
    logger.warn("ML service unavailable, skipping stockout alerts");
    return;
  }

  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      stockStatus: { in: ["low", "critical"] },
    },
    select: { id: true, name: true, clientId: true, currentStockUnits: true },
  });

  let alertsCreated = 0;

  for (const product of products) {
    try {
      const prediction = await MLClientService.predictStockout(
        product.id,
        product.currentStockUnits,
        90,
      );

      if (
        prediction.days_until_stockout &&
        prediction.days_until_stockout <= 14
      ) {
        const severity =
          prediction.days_until_stockout <= 7 ? "critical" : "warning";

        // Check if alert already exists
        const existingAlert = await prisma.alert.findFirst({
          where: {
            productId: product.id,
            alertType: "ml_stockout_prediction",
            createdAt: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
            },
          },
        });

        if (!existingAlert) {
          await prisma.alert.create({
            data: {
              clientId: product.clientId,
              productId: product.id,
              alertType: "ml_stockout_prediction",
              severity,
              title: `ML Stockout Prediction: ${product.name}`,
              message: `AI predicts stockout in ${prediction.days_until_stockout} days with ${Math.round(prediction.confidence * 100)}% confidence. Consider reordering soon. (Days: ${prediction.days_until_stockout}, Confidence: ${Math.round(prediction.confidence * 100)}%)`,
            },
          });
          alertsCreated++;
        }
      }
    } catch (error) {
      logger.warn(
        `ML stockout prediction failed for ${product.id}: ${(error as Error).message}`,
      );
    }
  }

  logger.info(
    `ML stockout alert scan complete: ${alertsCreated} alerts created`,
  );
});

// =============================================================================
// IMPORT LOCK RESILIENCE - STALE IMPORT CLEANUP
// =============================================================================

/**
 * Stale import timeout - imports processing for longer than this are considered stuck
 * Reduced from 30 minutes to 10 minutes for better UX
 */
const STALE_IMPORT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Convert UUID string to a numeric lock key for PostgreSQL advisory locks.
 * Uses a simple hash to convert the UUID to a 32-bit integer.
 * (Duplicated from import.routes.ts to avoid circular dependencies)
 */
function uuidToLockKey(uuid: string): number {
  let hash = 0;
  for (let i = 0; i < uuid.length; i++) {
    const char = uuid.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Stale import cleanup
 * Automatically recovers from stuck imports by:
 * 1. Marking stale processing/pending imports as failed
 * 2. Releasing orphaned PostgreSQL advisory locks
 *
 * This prevents the "Another import is currently processing" error from
 * blocking users indefinitely when imports crash or timeout.
 *
 * Runs every 5 minutes
 */
registerJob("cleanup-stale-imports", 5 * 60 * 1000, async () => {
  const staleThreshold = new Date(Date.now() - STALE_IMPORT_TIMEOUT_MS);

  // Find all imports that have been processing for too long
  // Check startedAt for processing imports, createdAt for pending imports
  const staleImports = await prisma.importBatch.findMany({
    where: {
      OR: [
        {
          status: "processing",
          startedAt: { lt: staleThreshold },
        },
        {
          status: "pending",
          createdAt: { lt: staleThreshold },
        },
      ],
    },
    select: {
      id: true,
      clientId: true,
      filename: true,
      status: true,
      startedAt: true,
      createdAt: true,
    },
  });

  if (staleImports.length === 0) {
    return; // No stale imports to clean up
  }

  logger.warn("Found stale imports, cleaning up", {
    count: staleImports.length,
    imports: staleImports.map(i => ({
      id: i.id,
      filename: i.filename,
      status: i.status,
      ageMinutes: Math.round(
        (Date.now() - (i.startedAt || i.createdAt).getTime()) / 60000
      ),
    })),
  });

  // Mark stale imports as failed
  await prisma.importBatch.updateMany({
    where: { id: { in: staleImports.map(i => i.id) } },
    data: {
      status: "failed",
      completedAt: new Date(),
      errors: [{
        message: "Import timed out - auto-recovered by system",
        details: `Import exceeded ${STALE_IMPORT_TIMEOUT_MS / 60000} minute timeout and was automatically marked as failed.`,
      }],
    },
  });

  // Get unique client IDs to release their advisory locks
  const uniqueClientIds = [...new Set(staleImports.map(i => i.clientId))];

  // Release advisory locks for affected clients
  for (const clientId of uniqueClientIds) {
    try {
      const lockKey = uuidToLockKey(clientId);
      await prisma.$executeRaw`SELECT pg_advisory_unlock(${lockKey})`;
      logger.info("Released orphaned advisory lock", { clientId, lockKey });
    } catch (error) {
      // Lock might not exist (already released), which is fine
      logger.debug("Advisory lock release attempt", {
        clientId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  logger.info("Stale import cleanup completed", {
    importsRecovered: staleImports.length,
    clientsUnlocked: uniqueClientIds.length,
  });
});

// =============================================================================
// DS ANALYTICS HEALTH MONITORING
// =============================================================================

/**
 * DS Analytics health check
 * Monitors the Python DS Analytics service health every 5 minutes
 * Creates alerts if service becomes unhealthy
 */
let dsAnalyticsWasHealthy = true; // Track previous state for change detection

registerJob("ds-analytics-health-check", 5 * 60 * 1000, async () => {
  try {
    const isHealthy = await isDsAnalyticsHealthy();

    if (!isHealthy && dsAnalyticsWasHealthy) {
      // Service just went down - create alert
      logger.error("DS Analytics service is unhealthy", new Error("Service health check failed"), {
        previousState: "healthy",
        currentState: "unhealthy",
      });

      // Create a system alert for admins
      await prisma.alert.create({
        data: {
          clientId: (await prisma.client.findFirst({ select: { id: true } }))?.id || "",
          alertType: "system_health",
          severity: "critical",
          title: "DS Analytics Service Down",
          message: "The Python DS Analytics service is not responding. Usage calculations will fall back to TypeScript implementation until service is restored.",
          status: "active",
        },
      });
    } else if (isHealthy && !dsAnalyticsWasHealthy) {
      // Service recovered
      logger.info("DS Analytics service recovered", {
        previousState: "unhealthy",
        currentState: "healthy",
      });

      // Resolve the system alert
      await prisma.alert.updateMany({
        where: {
          alertType: "system_health",
          title: "DS Analytics Service Down",
          isDismissed: false,
        },
        data: {
          isDismissed: true,
          dismissedAt: new Date(),
        },
      });
    }

    dsAnalyticsWasHealthy = isHealthy;

    // Log stats periodically
    if (isHealthy) {
      const stats = await dsAnalyticsService.getStats();
      if (stats) {
        logger.debug("DS Analytics stats", {
          totalProducts: stats.total_products,
          productsWithUsage: stats.products_with_usage,
          avgConfidence: stats.avg_confidence_score,
        });
      }
    }
  } catch (error) {
    logger.error("DS Analytics health check failed", error as Error);
  }
});

// Export for manual initialization
export default {
  registerJob,
  startScheduler,
};
