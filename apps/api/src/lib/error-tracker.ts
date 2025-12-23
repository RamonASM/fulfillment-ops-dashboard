/**
 * Centralized Error Tracking Module
 *
 * Provides consistent error logging across the application:
 * 1. Structured logging via logger
 * 2. Persistence to DiagnosticLog table
 * 3. Query interface for recent errors
 */

import { prisma } from './prisma.js';
import { logger } from './logger.js';

// =============================================================================
// TYPES
// =============================================================================

export type ErrorCategory = 'import' | 'database' | 'api' | 'file' | 'lock' | 'auth' | 'validation' | 'ml' | 'analytics';

export interface ErrorContext {
  category: ErrorCategory;
  operation: string;
  details?: Record<string, unknown>;
  recoverable: boolean;
}

export interface ErrorSummary {
  category: string;
  count: number;
  lastOccurred: Date;
}

// =============================================================================
// TRACK ERROR
// =============================================================================

/**
 * Track an error with structured logging and persistence.
 *
 * @param error - The error that occurred (can be Error object or unknown)
 * @param context - Context about where/how the error occurred
 */
export async function trackError(
  error: Error | unknown,
  context: ErrorContext
): Promise<void> {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;

  // Log to console/file via structured logger
  logger.error(
    `[${context.category}] ${context.operation}`,
    error instanceof Error ? error : null,
    {
      ...context.details,
      recoverable: context.recoverable,
    }
  );

  // Persist to database for analysis
  try {
    await prisma.diagnosticLog.create({
      data: {
        runId: `error-${Date.now()}`,
        category: context.category,
        check: context.operation,
        status: context.recoverable ? 'WARN' : 'FAIL',
        message: errorMessage,
        details: {
          stack: errorStack,
          ...context.details,
        },
      },
    });
  } catch (dbError) {
    // Last resort - at least we logged to console
    logger.error(
      'Failed to persist error to DiagnosticLog',
      dbError instanceof Error ? dbError : null,
      { originalError: errorMessage }
    );
  }
}

// =============================================================================
// QUERY RECENT ERRORS
// =============================================================================

/**
 * Get a summary of recent errors grouped by category.
 *
 * @param hours - Number of hours to look back (default: 24)
 * @param category - Optional category filter
 * @returns Array of error summaries with counts
 */
export async function getRecentErrors(
  hours: number = 24,
  category?: ErrorCategory
): Promise<ErrorSummary[]> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const errors = await prisma.diagnosticLog.groupBy({
    by: ['category', 'check'],
    where: {
      status: { in: ['FAIL', 'WARN'] },
      createdAt: { gte: since },
      ...(category && { category }),
    },
    _count: true,
    _max: { createdAt: true },
  });

  return errors.map((e) => ({
    category: `${e.category}:${e.check}`,
    count: e._count,
    lastOccurred: e._max.createdAt!,
  }));
}

/**
 * Get the total error count in the last N hours.
 *
 * @param hours - Number of hours to look back (default: 24)
 * @returns Total error count
 */
export async function getErrorCount(hours: number = 24): Promise<number> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  return prisma.diagnosticLog.count({
    where: {
      status: { in: ['FAIL', 'WARN'] },
      createdAt: { gte: since },
    },
  });
}

/**
 * Get detailed error logs for a specific category.
 *
 * @param category - Category to filter by
 * @param hours - Number of hours to look back (default: 24)
 * @param limit - Maximum number of records to return (default: 100)
 * @returns Array of detailed error logs
 */
export async function getErrorDetails(
  category: ErrorCategory,
  hours: number = 24,
  limit: number = 100
): Promise<Array<{
  id: string;
  check: string;
  status: string;
  message: string;
  details: unknown;
  createdAt: Date;
}>> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  return prisma.diagnosticLog.findMany({
    where: {
      category,
      status: { in: ['FAIL', 'WARN'] },
      createdAt: { gte: since },
    },
    select: {
      id: true,
      check: true,
      status: true,
      message: true,
      details: true,
      createdAt: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: limit,
  });
}

/**
 * Clear old error logs (for maintenance).
 *
 * @param daysToKeep - Number of days to retain (default: 30)
 * @returns Number of records deleted
 */
export async function cleanupOldErrors(daysToKeep: number = 30): Promise<number> {
  const cutoff = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);

  const result = await prisma.diagnosticLog.deleteMany({
    where: {
      createdAt: { lt: cutoff },
    },
  });

  logger.info('Cleaned up old diagnostic logs', {
    deleted: result.count,
    cutoffDate: cutoff.toISOString(),
  });

  return result.count;
}
