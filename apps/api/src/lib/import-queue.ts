/**
 * Import Queue Infrastructure
 *
 * Phase 2.2: Worker Queue Architecture
 *
 * This module provides a Redis-backed job queue for processing import tasks.
 * Benefits over direct spawning:
 * - Decouples API from long-running tasks
 * - Horizontal scalability (run multiple workers)
 * - Built-in retry logic
 * - Job progress tracking
 * - Queue monitoring via BullMQ dashboard
 */

import { Queue, Worker, QueueEvents } from 'bullmq';
import Redis from 'ioredis';

// Redis connection configuration
const redisConnection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null, // Required for BullMQ
  enableReadyCheck: false,
});

// Import job data interface
export interface ImportJobData {
  importId: string;
  filePath: string;
  mappingPath: string;
  clientId: string;
  importType: 'inventory' | 'orders';
}

// Create the import queue
export const importQueue = new Queue<ImportJobData>('imports', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3, // Retry failed jobs up to 3 times
    backoff: {
      type: 'exponential',
      delay: 2000, // Start with 2 second delay, doubles each retry
    },
    removeOnComplete: {
      count: 100, // Keep last 100 completed jobs for history
      age: 24 * 3600, // Remove after 24 hours
    },
    removeOnFail: {
      count: 500, // Keep last 500 failed jobs for debugging
      age: 7 * 24 * 3600, // Remove after 7 days
    },
  },
});

// Queue events for monitoring
export const importQueueEvents = new QueueEvents('imports', {
  connection: redisConnection,
});

/**
 * Enqueue an import job
 *
 * @param importId - UUID of the import batch
 * @param filePath - Absolute path to the uploaded file
 * @param mappingPath - Absolute path to the mapping JSON file
 * @param clientId - Client UUID
 * @param importType - Type of import (inventory or orders)
 * @returns Promise<Job> - The created job
 */
export async function enqueueImport(
  importId: string,
  filePath: string,
  mappingPath: string,
  clientId: string,
  importType: 'inventory' | 'orders'
) {
  const job = await importQueue.add(
    'process_import' as any, // BullMQ v5 type inference issue
    {
      importId,
      filePath,
      mappingPath,
      clientId,
      importType,
    },
    {
      jobId: importId, // Use importId as job ID to prevent duplicates
      priority: importType === 'inventory' ? 2 : 1, // Prioritize inventory imports
    }
  );

  console.log(
    `[Import Queue] Enqueued job ${job.id} for ${importType} import (client: ${clientId})`
  );

  return job;
}

/**
 * Get job status by import ID
 *
 * @param importId - UUID of the import batch
 * @returns Promise<Job status info or null>
 */
export async function getImportJobStatus(importId: string) {
  const job = await importQueue.getJob(importId);

  if (!job) {
    return null;
  }

  const state = await job.getState();
  const progress = job.progress;
  const failedReason = job.failedReason;

  return {
    id: job.id,
    state, // 'waiting', 'active', 'completed', 'failed', 'delayed'
    progress,
    data: job.data,
    returnvalue: job.returnvalue,
    failedReason,
    attemptsMade: job.attemptsMade,
    processedOn: job.processedOn,
    finishedOn: job.finishedOn,
  };
}

/**
 * Cancel a queued or active import job
 *
 * @param importId - UUID of the import batch
 * @returns Promise<boolean> - True if job was cancelled
 */
export async function cancelImportJob(importId: string): Promise<boolean> {
  const job = await importQueue.getJob(importId);

  if (!job) {
    return false;
  }

  const state = await job.getState();

  // Can only cancel waiting or delayed jobs
  if (state === 'waiting' || state === 'delayed') {
    await job.remove();
    console.log(`[Import Queue] Cancelled job ${importId}`);
    return true;
  }

  // For active jobs, we can't stop the process, but we can mark it as failed
  if (state === 'active') {
    const error = new Error('Job cancelled by user');
    await job.moveToFailed(error, '0' as any); // Token parameter (BullMQ internal)
    console.log(`[Import Queue] Marked active job ${importId} as failed (user cancelled)`);
    return true;
  }

  return false;
}

/**
 * Get queue metrics
 *
 * @returns Promise<Queue stats>
 */
export async function getQueueMetrics() {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    importQueue.getWaitingCount(),
    importQueue.getActiveCount(),
    importQueue.getCompletedCount(),
    importQueue.getFailedCount(),
    importQueue.getDelayedCount(),
  ]);

  return {
    waiting,
    active,
    completed,
    failed,
    delayed,
    total: waiting + active + completed + failed + delayed,
  };
}

/**
 * Clean up old jobs to prevent memory bloat
 * Run this periodically (e.g., via cron job)
 *
 * @param maxAge - Maximum age in milliseconds (default: 7 days)
 * @param maxCount - Maximum number of jobs to keep (default: 1000)
 */
export async function cleanOldJobs(
  maxAge: number = 7 * 24 * 60 * 60 * 1000,
  maxCount: number = 1000
) {
  const cleaned = await importQueue.clean(maxAge, maxCount, 'completed');
  console.log(`[Import Queue] Cleaned ${cleaned.length} old completed jobs`);

  const cleanedFailed = await importQueue.clean(maxAge, maxCount, 'failed');
  console.log(`[Import Queue] Cleaned ${cleanedFailed.length} old failed jobs`);

  return {
    completedCleaned: cleaned.length,
    failedCleaned: cleanedFailed.length,
  };
}

// Graceful shutdown
export async function closeQueue() {
  await importQueue.close();
  await importQueueEvents.close();
  await redisConnection.quit();
  console.log('[Import Queue] Queue closed gracefully');
}

// Handle process termination
process.on('SIGTERM', async () => {
  console.log('[Import Queue] SIGTERM received, closing queue...');
  await closeQueue();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[Import Queue] SIGINT received, closing queue...');
  await closeQueue();
  process.exit(0);
});
