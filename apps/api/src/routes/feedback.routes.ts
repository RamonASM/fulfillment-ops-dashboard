import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireClientAccess, requireRole } from '../middleware/auth.js';
import {
  createFeedback,
  getProductFeedback,
  getClientFeedback,
  getClientFeedbackAnalytics,
  getPendingFeedbackProducts,
  getProductRecommendations,
  updateAllPopularityScores,
} from '../services/feedback.service.js';
import { logActivity } from '../services/collaboration.service.js';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const createFeedbackSchema = z.object({
  productId: z.string().uuid(),
  orderRequestId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  qualityRating: z.number().int().min(1).max(5),
  deliveryRating: z.number().int().min(1).max(5).optional(),
  valueRating: z.number().int().min(1).max(5).optional(),
  wouldReorder: z.boolean().optional(),
  usageNotes: z.string().max(2000).optional(),
  quantitySatisfaction: z.enum(['too_little', 'just_right', 'too_much']).optional(),
  positiveComments: z.string().max(2000).optional(),
  improvementSuggestions: z.string().max(2000).optional(),
  photos: z.array(z.string().url()).max(5).optional(),
});

// =============================================================================
// ADMIN ROUTES
// =============================================================================

/**
 * GET /api/feedback/client/:clientId
 * Get all feedback for a client (admin view)
 */
router.get('/client/:clientId', requireClientAccess, async (req, res, next) => {
  try {
    const { clientId } = req.params;
    const { productId, locationId, minRating, limit, offset } = req.query;

    const result = await getClientFeedback(clientId, {
      productId: productId as string,
      locationId: locationId as string,
      minRating: minRating ? parseInt(minRating as string) : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });

    res.json({
      data: result.feedback,
      meta: {
        total: result.total,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/feedback/client/:clientId/analytics
 * Get feedback analytics for a client
 */
router.get('/client/:clientId/analytics', requireClientAccess, async (req, res, next) => {
  try {
    const { clientId } = req.params;

    const analytics = await getClientFeedbackAnalytics(clientId);

    res.json(analytics);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/feedback/product/:productId
 * Get feedback for a specific product
 */
router.get('/product/:productId', async (req, res, next) => {
  try {
    const { productId } = req.params;
    const { limit, offset, includePhotos } = req.query;

    const result = await getProductFeedback(productId, {
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
      includePhotos: includePhotos === 'true',
    });

    res.json({
      data: result.feedback,
      meta: {
        total: result.total,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/feedback/recommendations/:clientId
 * Get product recommendations for a client
 */
router.get('/recommendations/:clientId', requireClientAccess, async (req, res, next) => {
  try {
    const { clientId } = req.params;
    const { type, limit } = req.query;

    const recommendations = await getProductRecommendations(clientId, {
      type: type as 'trending' | 'top_rated' | 'low_stock_high_demand' | 'review_needed',
      limit: limit ? parseInt(limit as string) : undefined,
    });

    res.json({
      data: recommendations,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/feedback/popularity/refresh
 * Refresh popularity scores for all products (admin only)
 */
router.post(
  '/popularity/refresh',
  requireRole('admin', 'operations_manager'),
  async (req, res, next) => {
    try {
      const { clientId } = req.query;

      const result = await updateAllPopularityScores(clientId as string);

      res.json({
        message: 'Popularity scores updated',
        updated: result.updated,
      });
    } catch (error) {
      next(error);
    }
  }
);

// =============================================================================
// PORTAL ROUTES (for portal users submitting feedback)
// =============================================================================

/**
 * POST /api/feedback
 * Submit product feedback (portal users)
 */
router.post('/', async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const data = createFeedbackSchema.parse(req.body);

    const feedback = await createFeedback({
      ...data,
      submittedById: userId,
      submittedByType: 'portal_user',
    });

    // Log activity
    await logActivity({
      actorType: 'portal_user',
      actorId: userId,
      action: 'feedback_submitted',
      category: 'user',
      entityType: 'product',
      entityId: data.productId,
      metadata: {
        feedbackId: feedback.id,
        qualityRating: data.qualityRating,
      },
    });

    res.status(201).json(feedback);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/feedback/pending
 * Get products pending feedback for current portal user
 */
router.get('/pending', async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const { clientId, limit } = req.query;

    if (!clientId) {
      return res.status(400).json({ message: 'clientId is required' });
    }

    const pendingProducts = await getPendingFeedbackProducts(
      userId,
      clientId as string,
      { limit: limit ? parseInt(limit as string) : undefined }
    );

    res.json({
      data: pendingProducts,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
