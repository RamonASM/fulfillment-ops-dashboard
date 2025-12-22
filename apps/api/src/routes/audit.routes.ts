import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate, requireClientAccess } from '../middleware/auth.js';
import { logger } from '../lib/logger.js';
import {
  getAuditLogs,
  getUserActivitySummary,
  getClientActivitySummary,
  AuditAction,
  AuditCategory,
} from '../services/audit.service.js';
import { paginationSchema } from '../lib/validation-schemas.js';

const router = Router();

// =============================================================================
// VALIDATION SCHEMAS
// Phase 4.2: Using shared validation schemas
// =============================================================================

const auditLogsQuerySchema = paginationSchema.extend({
  userId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
  action: z.string().optional(),
  category: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

const activityQuerySchema = z.object({
  days: z.coerce.number().int().positive().max(365).optional().default(30),
});

/**
 * GET /api/audit/logs
 * Get audit logs with filtering
 */
router.get('/logs', authenticate, async (req: Request, res: Response) => {
  try {
    const query = auditLogsQuerySchema.parse(req.query);
    const user = req.user;

    // Only admins can view all logs, others only see their own
    const filterUserId = user?.role === 'admin'
      ? query.userId
      : user?.userId;

    const result = await getAuditLogs({
      userId: filterUserId,
      clientId: query.clientId,
      action: query.action as AuditAction,
      category: query.category as AuditCategory,
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
      limit: query.limit,
      offset: query.offset || 0,
    });

    res.json(result);
  } catch (error) {
    logger.error('Audit get logs error', error as Error);
    const message = error instanceof Error ? error.message : 'Failed to fetch audit logs';
    res.status(500).json({ error: message });
  }
});

/**
 * GET /api/audit/user/:userId/activity
 * Get user activity summary
 */
router.get('/user/:userId/activity', authenticate, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const query = activityQuerySchema.parse(req.query);
    const user = req.user;

    // Only admins can view other users' activity
    if (user?.role !== 'admin' && userId !== user?.userId) {
      return res.status(403).json({ error: 'Not authorized to view this activity' });
    }

    const summary = await getUserActivitySummary(userId, query.days);

    res.json(summary);
  } catch (error) {
    logger.error('Audit user activity error', error as Error);
    const message = error instanceof Error ? error.message : 'Failed to fetch activity';
    res.status(500).json({ error: message });
  }
});

/**
 * GET /api/audit/client/:clientId/activity
 * Get client activity summary
 * Requires user to have access to the specified client
 */
router.get('/client/:clientId/activity', authenticate, requireClientAccess, async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;
    const { days } = req.query;

    const summary = await getClientActivitySummary(
      clientId,
      days ? parseInt(days as string, 10) : 30
    );

    res.json(summary);
  } catch (error) {
    logger.error('Audit client activity error', error as Error);
    const message = error instanceof Error ? error.message : 'Failed to fetch activity';
    res.status(500).json({ error: message });
  }
});

/**
 * GET /api/audit/actions
 * Get list of all audit actions
 */
router.get('/actions', authenticate, (_req: Request, res: Response) => {
  res.json({
    actions: Object.values(AuditAction),
    categories: Object.values(AuditCategory),
  });
});

export default router;
