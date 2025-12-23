/**
 * Diagnostic Routes
 *
 * Provides diagnostic and system health endpoints for CI/CD integration.
 *
 * Endpoints:
 * - GET /diagnostics - Get recent diagnostic runs
 * - GET /diagnostics/latest - Get most recent diagnostic run with logs
 * - GET /diagnostics/:runId - Get specific diagnostic run with logs
 * - POST /diagnostics/run - Trigger a new diagnostic run
 * - GET /diagnostics/summary - Quick health summary
 */

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { spawn } from 'child_process';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { authenticate, requireRole } from '../middleware/auth.js';
import {
  getRecentErrors,
  getErrorCount,
  getErrorDetails,
  cleanupOldErrors,
  ErrorCategory,
} from '../lib/error-tracker.js';

const router = Router();
const prisma = new PrismaClient();

// All diagnostic routes require authentication
router.use(authenticate);

/**
 * GET /diagnostics
 * Get recent diagnostic runs (paginated)
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const [runs, total] = await Promise.all([
      prisma.diagnosticRun.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: { logs: true },
          },
        },
      }),
      prisma.diagnosticRun.count(),
    ]);

    res.json({
      runs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching diagnostic runs:', error);
    res.status(500).json({ error: 'Failed to fetch diagnostic runs' });
  }
});

/**
 * GET /diagnostics/latest
 * Get the most recent diagnostic run with all logs
 */
router.get('/latest', async (_req: Request, res: Response) => {
  try {
    const latestRun = await prisma.diagnosticRun.findFirst({
      orderBy: { createdAt: 'desc' },
      include: {
        logs: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!latestRun) {
      return res.status(404).json({ error: 'No diagnostic runs found' });
    }

    res.json(latestRun);
  } catch (error) {
    console.error('Error fetching latest diagnostic:', error);
    res.status(500).json({ error: 'Failed to fetch latest diagnostic' });
  }
});

/**
 * GET /diagnostics/summary
 * Quick health summary based on most recent diagnostic run
 */
router.get('/summary', async (_req: Request, res: Response) => {
  try {
    const latestRun = await prisma.diagnosticRun.findFirst({
      orderBy: { createdAt: 'desc' },
      include: {
        logs: {
          where: { status: 'FAIL' },
          take: 5,
        },
      },
    });

    if (!latestRun) {
      return res.json({
        status: 'unknown',
        message: 'No diagnostic data available',
        lastRun: null,
      });
    }

    // Determine overall status
    let status: 'healthy' | 'warning' | 'critical' | 'unknown';
    if (latestRun.failed > 0) {
      status = 'critical';
    } else if (latestRun.warnings > 0) {
      status = 'warning';
    } else {
      status = 'healthy';
    }

    // Check if diagnostic is stale (older than 24 hours)
    const staleThreshold = 24 * 60 * 60 * 1000; // 24 hours
    const isStale = Date.now() - new Date(latestRun.createdAt).getTime() > staleThreshold;

    res.json({
      status,
      isStale,
      lastRun: {
        id: latestRun.id,
        createdAt: latestRun.createdAt,
        trigger: latestRun.trigger,
        passed: latestRun.passed,
        failed: latestRun.failed,
        warnings: latestRun.warnings,
        duration: latestRun.duration,
        gitCommit: latestRun.gitCommit,
      },
      recentFailures: latestRun.logs,
      recommendations: latestRun.recommendations,
    });
  } catch (error) {
    console.error('Error fetching diagnostic summary:', error);
    res.status(500).json({ error: 'Failed to fetch diagnostic summary' });
  }
});

/**
 * GET /diagnostics/:runId
 * Get a specific diagnostic run with all logs
 */
router.get('/:runId', async (req: Request, res: Response) => {
  try {
    const { runId } = req.params;

    const run = await prisma.diagnosticRun.findUnique({
      where: { id: runId },
      include: {
        logs: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!run) {
      return res.status(404).json({ error: 'Diagnostic run not found' });
    }

    res.json(run);
  } catch (error) {
    console.error('Error fetching diagnostic run:', error);
    res.status(500).json({ error: 'Failed to fetch diagnostic run' });
  }
});

/**
 * POST /diagnostics/run
 * Trigger a new diagnostic run (admin only)
 */
router.post('/run', requireRole('admin', 'operations_manager'), async (req: Request, res: Response) => {
  try {
    const runId = uuidv4();
    const startTime = Date.now();

    // Create the run record
    const run = await prisma.diagnosticRun.create({
      data: {
        id: runId,
        trigger: 'manual',
        environment: process.env.NODE_ENV || 'development',
        passed: 0,
        failed: 0,
        warnings: 0,
      },
    });

    // Get git info
    let gitCommit: string | null = null;
    let gitBranch: string | null = null;
    try {
      const { execSync } = await import('child_process');
      gitCommit = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim().slice(0, 40);
      gitBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
    } catch {
      // Git not available, skip
    }

    // Run diagnostics in background
    const scriptPath = path.join(process.cwd(), 'apps/api/scripts/audit/full-diagnostic.ts');

    const child = spawn('npx', ['tsx', scriptPath, '--run-id', runId, '--json'], {
      env: { ...process.env, DIAGNOSTIC_RUN_ID: runId },
      stdio: 'pipe',
    });

    let output = '';
    let errorOutput = '';

    child.stdout.on('data', (data) => {
      output += data.toString();
    });

    child.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    child.on('close', async (code) => {
      const duration = Date.now() - startTime;

      // Parse results from output
      let passed = 0;
      let failed = 0;
      let warnings = 0;

      // Count from output (simple pattern matching)
      const passMatches = output.match(/✓/g);
      const failMatches = output.match(/❌/g);
      const warnMatches = output.match(/⚠️/g);

      if (passMatches) passed = passMatches.length;
      if (failMatches) failed = failMatches.length;
      if (warnMatches) warnings = warnMatches.length;

      // Update run with results
      await prisma.diagnosticRun.update({
        where: { id: runId },
        data: {
          passed,
          failed,
          warnings,
          duration,
          gitCommit,
          gitBranch,
          summary: code === 0 ? 'Diagnostic completed successfully' : `Diagnostic exited with code ${code}`,
        },
      });
    });

    // Return immediately with run ID
    res.status(202).json({
      message: 'Diagnostic run started',
      runId,
      status: 'running',
    });
  } catch (error) {
    console.error('Error starting diagnostic run:', error);
    res.status(500).json({ error: 'Failed to start diagnostic run' });
  }
});

/**
 * GET /diagnostics/logs/:runId
 * Get logs for a specific run, with optional filtering
 */
router.get('/logs/:runId', async (req: Request, res: Response) => {
  try {
    const { runId } = req.params;
    const { category, status } = req.query;

    const where: Record<string, unknown> = { runId };
    if (category) where.category = category;
    if (status) where.status = status;

    const logs = await prisma.diagnosticLog.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });

    res.json(logs);
  } catch (error) {
    console.error('Error fetching diagnostic logs:', error);
    res.status(500).json({ error: 'Failed to fetch diagnostic logs' });
  }
});

/**
 * GET /diagnostics/categories
 * Get all diagnostic categories with their status counts
 */
router.get('/stats/categories', async (_req: Request, res: Response) => {
  try {
    const latestRun = await prisma.diagnosticRun.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    if (!latestRun) {
      return res.json({ categories: [] });
    }

    const categoryStats = await prisma.diagnosticLog.groupBy({
      by: ['category', 'status'],
      where: { runId: latestRun.id },
      _count: { id: true },
    });

    // Transform into category -> status map
    const categories: Record<string, { passed: number; failed: number; warnings: number }> = {};

    for (const stat of categoryStats) {
      if (!categories[stat.category]) {
        categories[stat.category] = { passed: 0, failed: 0, warnings: 0 };
      }
      if (stat.status === 'PASS') {
        categories[stat.category].passed = stat._count.id;
      } else if (stat.status === 'FAIL') {
        categories[stat.category].failed = stat._count.id;
      } else if (stat.status === 'WARN') {
        categories[stat.category].warnings = stat._count.id;
      }
    }

    res.json({ categories });
  } catch (error) {
    console.error('Error fetching category stats:', error);
    res.status(500).json({ error: 'Failed to fetch category stats' });
  }
});

// =============================================================================
// ERROR TRACKING ENDPOINTS
// =============================================================================

/**
 * GET /diagnostics/errors
 * Get recent errors with summary counts
 *
 * Query params:
 * - hours: Number of hours to look back (default: 24)
 * - category: Optional category filter
 */
router.get('/errors', requireRole('admin', 'operations_manager'), async (req: Request, res: Response) => {
  try {
    const hours = parseInt(req.query.hours as string) || 24;
    const category = req.query.category as ErrorCategory | undefined;

    const [errors, totalCount] = await Promise.all([
      getRecentErrors(hours, category),
      getErrorCount(hours),
    ]);

    res.json({
      success: true,
      data: {
        timeRange: `${hours} hours`,
        totalErrors: totalCount,
        byCategory: errors,
      },
    });
  } catch (error) {
    console.error('Error fetching errors:', error);
    res.status(500).json({ error: 'Failed to fetch errors' });
  }
});

/**
 * GET /diagnostics/errors/:category
 * Get detailed error logs for a specific category
 *
 * Query params:
 * - hours: Number of hours to look back (default: 24)
 * - limit: Maximum number of records (default: 100)
 */
router.get('/errors/:category', requireRole('admin', 'operations_manager'), async (req: Request, res: Response) => {
  try {
    const category = req.params.category as ErrorCategory;
    const hours = parseInt(req.query.hours as string) || 24;
    const limit = parseInt(req.query.limit as string) || 100;

    const errors = await getErrorDetails(category, hours, limit);

    res.json({
      success: true,
      data: {
        category,
        timeRange: `${hours} hours`,
        count: errors.length,
        errors,
      },
    });
  } catch (error) {
    console.error('Error fetching error details:', error);
    res.status(500).json({ error: 'Failed to fetch error details' });
  }
});

/**
 * POST /diagnostics/errors/cleanup
 * Clean up old error logs (admin only)
 *
 * Body params:
 * - daysToKeep: Number of days to retain (default: 30)
 */
router.post('/errors/cleanup', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const daysToKeep = parseInt(req.body.daysToKeep) || 30;

    const deletedCount = await cleanupOldErrors(daysToKeep);

    res.json({
      success: true,
      message: `Cleaned up ${deletedCount} old error logs`,
      data: {
        deleted: deletedCount,
        retentionDays: daysToKeep,
      },
    });
  } catch (error) {
    console.error('Error cleaning up errors:', error);
    res.status(500).json({ error: 'Failed to clean up errors' });
  }
});

export default router;
