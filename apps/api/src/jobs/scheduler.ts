import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { recalculateClientUsage, recalculateClientMonthlyUsage } from '../services/usage.service.js';
import { runAlertGeneration } from '../services/alert.service.js';
import {
  createDailySnapshot,
  aggregateDailyAlertMetrics,
  refreshRiskScoreCache,
} from '../services/analytics.service.js';

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
  handler: () => Promise<void>
): void {
  jobs.push({
    name,
    intervalMs,
    lastRun: null,
    isRunning: false,
    run: handler,
  });
  logger.info('Registered scheduled job', { job: name, intervalMs });
}

/**
 * Start the scheduler
 */
export function startScheduler(): void {
  logger.info('Starting scheduler', { jobCount: jobs.length });

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
        logger.info('Running scheduled job', { job: job.name });

        try {
          await job.run();
          job.lastRun = now;
          logger.info('Completed scheduled job', { job: job.name, durationMs: timer() });
        } catch (error) {
          logger.error(`Scheduled job failed: ${job.name}`, error as Error, { job: job.name });
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
registerJob('daily-usage-recalculation', 24 * 60 * 60 * 1000, async () => {
  const clients = await prisma.client.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  });

  for (const client of clients) {
    try {
      logger.debug('Recalculating usage for client', { clientId: client.id, clientName: client.name });
      // Phase 12: Basic usage metrics
      await recalculateClientUsage(client.id);
      // Phase 13: Monthly usage with tier transparency (12-mo, 6-mo, 3-mo, weekly)
      await recalculateClientMonthlyUsage(client.id);
    } catch (error) {
      logger.error(`Usage recalculation failed for client: ${client.name}`, error as Error, { clientId: client.id });
    }
  }
});

/**
 * Hourly alert generation for all active clients
 * Runs every hour
 */
registerJob('hourly-alert-generation', 60 * 60 * 1000, async () => {
  const clients = await prisma.client.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  });

  for (const client of clients) {
    try {
      logger.debug('Generating alerts for client', { clientId: client.id, clientName: client.name });
      await runAlertGeneration(client.id);
    } catch (error) {
      logger.error(`Alert generation failed for client: ${client.name}`, error as Error, { clientId: client.id });
    }
  }
});

/**
 * Stock history snapshot - records current stock levels
 * Runs every 6 hours
 */
registerJob('stock-history-snapshot', 6 * 60 * 60 * 1000, async () => {
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
    source: 'scheduled_snapshot' as const,
  }));

  // Batch insert in chunks of 1000
  const chunkSize = 1000;
  for (let i = 0; i < snapshots.length; i += chunkSize) {
    const chunk = snapshots.slice(i, i + chunkSize);
    await prisma.stockHistory.createMany({ data: chunk });
  }

  logger.info('Created stock history snapshots', { count: snapshots.length });
});

// =============================================================================
// PHASE 11: ANALYTICS AGGREGATION JOBS
// =============================================================================

/**
 * Daily snapshot - records product stock levels for trend analysis
 * Runs at 2 AM daily (checked every 24 hours after first run)
 */
registerJob('daily-snapshot', 24 * 60 * 60 * 1000, async () => {
  await createDailySnapshot();
});

/**
 * Daily alert metrics aggregation
 * Runs at 3 AM daily (checked every 24 hours after first run)
 */
registerJob('daily-alert-metrics', 24 * 60 * 60 * 1000, async () => {
  await aggregateDailyAlertMetrics();
});

/**
 * Hourly risk score cache refresh
 * Pre-computes risk scores for all products
 * Runs every hour
 */
registerJob('hourly-risk-cache', 60 * 60 * 1000, async () => {
  await refreshRiskScoreCache();
});

// Export for manual initialization
export default {
  registerJob,
  startScheduler,
};
