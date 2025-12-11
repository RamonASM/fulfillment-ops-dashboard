import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import { logger } from '../lib/logger.js';
import {
  getAuditLogs,
  getUserActivitySummary,
  getClientActivitySummary,
  AuditAction,
  AuditCategory,
} from '../services/audit.service.js';

const router = Router();

/**
 * GET /api/audit/logs
 * Get audit logs with filtering
 */
router.get('/logs', authenticate, async (req: Request, res: Response) => {
  try {
    const {
      userId,
      clientId,
      action,
      category,
      startDate,
      endDate,
      limit,
      offset,
    } = req.query;

    const user = (req as any).user;
    // Only admins can view all logs, others only see their own
    const filterUserId = user?.role === 'admin'
      ? userId as string
      : user?.id;

    const result = await getAuditLogs({
      userId: filterUserId,
      clientId: clientId as string,
      action: action as AuditAction,
      category: category as AuditCategory,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      limit: limit ? parseInt(limit as string, 10) : 50,
      offset: offset ? parseInt(offset as string, 10) : 0,
    });

    res.json(result);
  } catch (error: any) {
    logger.error('Audit get logs error', error as Error);
    res.status(500).json({ error: error.message || 'Failed to fetch audit logs' });
  }
});

/**
 * GET /api/audit/user/:userId/activity
 * Get user activity summary
 */
router.get('/user/:userId/activity', authenticate, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { days } = req.query;
    const user = (req as any).user;

    // Only admins can view other users' activity
    if (user?.role !== 'admin' && userId !== user?.id) {
      return res.status(403).json({ error: 'Not authorized to view this activity' });
    }

    const summary = await getUserActivitySummary(
      userId,
      days ? parseInt(days as string, 10) : 30
    );

    res.json(summary);
  } catch (error: any) {
    logger.error('Audit user activity error', error as Error);
    res.status(500).json({ error: error.message || 'Failed to fetch activity' });
  }
});

/**
 * GET /api/audit/client/:clientId/activity
 * Get client activity summary
 */
router.get('/client/:clientId/activity', authenticate, async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;
    const { days } = req.query;

    const summary = await getClientActivitySummary(
      clientId,
      days ? parseInt(days as string, 10) : 30
    );

    res.json(summary);
  } catch (error: any) {
    logger.error('Audit client activity error', error as Error);
    res.status(500).json({ error: error.message || 'Failed to fetch activity' });
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
