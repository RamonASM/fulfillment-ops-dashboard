import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireClientAccess } from '../middleware/auth.js';
import { NotFoundError } from '../middleware/error-handler.js';
import { OrphanReconciliationService } from '../services/orphan-reconciliation.service.js';

const router = Router({ mergeParams: true });

// Apply authentication to all routes
router.use(authenticate);
router.use(requireClientAccess);

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const mergeOrphanSchema = z.object({
  targetProductId: z.string().uuid('Target product ID must be a valid UUID'),
});

const rejectSuggestionSchema = z.object({
  reason: z.string().optional(),
});

// =============================================================================
// ROUTES
// =============================================================================

/**
 * GET /api/clients/:clientId/orphans
 * Get all orphan products for a client
 *
 * Returns products with isOrphan=true that need reconciliation.
 */
router.get('/', async (req, res, next) => {
  try {
    const { clientId } = req.params as { clientId: string };

    const orphans = await OrphanReconciliationService.getOrphans(clientId);

    res.json({
      data: orphans,
      meta: {
        total: orphans.length,
        message: orphans.length === 0
          ? 'No orphan products found'
          : `Found ${orphans.length} orphan product(s) needing reconciliation`,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/clients/:clientId/orphans/stats
 * Get reconciliation statistics for a client
 *
 * Returns counts of total orphans, pending, merged, rejected, and reconciliation rate.
 */
router.get('/stats', async (req, res, next) => {
  try {
    const { clientId } = req.params as { clientId: string };

    const stats = await OrphanReconciliationService.getReconciliationStats(clientId);

    res.json({
      data: stats,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/clients/:clientId/orphans/:orphanId/reconcile
 * Get fuzzy match suggestions for an orphan product
 *
 * Uses FREE Python fuzzy matching - NO API costs!
 * Returns top 3 matches with confidence scores and reasoning.
 */
router.post('/:orphanId/reconcile', async (req, res, next) => {
  try {
    const { clientId, orphanId } = req.params as {
      clientId: string;
      orphanId: string;
    };

    const suggestion = await OrphanReconciliationService.getReconciliationSuggestion(
      orphanId,
      clientId
    );

    res.json({
      data: suggestion,
      meta: {
        matchCount: suggestion.matches.length,
        confidence: suggestion.confidence,
        recommendedAction: suggestion.recommendedAction,
        cost: 0, // FREE fuzzy matching!
      },
    });
  } catch (error) {
    // Handle specific errors
    if (error instanceof Error && error.message.includes('not found')) {
      throw new NotFoundError('Orphan product');
    }
    next(error);
  }
});

/**
 * POST /api/clients/:clientId/orphans/:orphanId/merge
 * Merge an orphan product into a target product
 *
 * Transfers all transactions from orphan to target and marks orphan as inactive.
 * This is a destructive operation that cannot be undone.
 */
router.post('/:orphanId/merge', async (req, res, next) => {
  try {
    const { clientId, orphanId } = req.params as {
      clientId: string;
      orphanId: string;
    };
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        code: 'UNAUTHORIZED',
        message: 'User ID not found in request',
      });
    }

    const { targetProductId } = mergeOrphanSchema.parse(req.body);

    const result = await OrphanReconciliationService.mergeOrphan(
      orphanId,
      targetProductId,
      clientId,
      userId
    );

    res.json({
      message: `Successfully merged orphan product. ${result.transactionsMoved} transaction(s) transferred.`,
      data: result,
    });
  } catch (error) {
    // Handle specific errors
    if (error instanceof Error) {
      if (error.message.includes('Orphan product not found')) {
        throw new NotFoundError('Orphan product');
      }
      if (error.message.includes('Target product not found')) {
        throw new NotFoundError('Target product');
      }
    }
    next(error);
  }
});

/**
 * POST /api/clients/:clientId/orphans/:orphanId/reject
 * Reject a reconciliation suggestion
 *
 * Records that the user reviewed the orphan and rejected all suggestions.
 * The orphan remains active and can be reviewed again later.
 */
router.post('/:orphanId/reject', async (req, res, next) => {
  try {
    const { clientId, orphanId } = req.params as {
      clientId: string;
      orphanId: string;
    };
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        code: 'UNAUTHORIZED',
        message: 'User ID not found in request',
      });
    }

    const { reason } = rejectSuggestionSchema.parse(req.body);

    const result = await OrphanReconciliationService.rejectSuggestion(
      orphanId,
      clientId,
      userId,
      reason
    );

    res.json({
      message: 'Reconciliation suggestion rejected',
      data: result,
    });
  } catch (error) {
    // Handle specific errors
    if (error instanceof Error && error.message.includes('not found')) {
      throw new NotFoundError('Orphan product');
    }
    next(error);
  }
});

export default router;
