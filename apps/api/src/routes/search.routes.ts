import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { globalSearch } from '../services/search.service.js';
import { paginationSchema } from '../lib/validation-schemas.js';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

// =============================================================================
// VALIDATION SCHEMAS
// Phase 4.2: Using shared validation schemas
// =============================================================================

const searchQuerySchema = z.object({
  q: z.string().min(1, 'Search query is required'),
  types: z.string().optional(), // comma-separated: 'product,client,alert'
  clientId: z.string().uuid().optional(),
  limit: paginationSchema.shape.limit,
});

// =============================================================================
// ROUTES
// =============================================================================

/**
 * GET /api/search
 * Global search across products, clients, and alerts
 */
router.get('/', async (req, res, next) => {
  try {
    const query = searchQuerySchema.parse(req.query);

    const types = query.types
      ? (query.types.split(',') as ('product' | 'client' | 'alert')[])
      : undefined;

    const results = await globalSearch(query.q, {
      clientId: query.clientId,
      types,
      limit: query.limit,
    });

    res.json({ data: results });
  } catch (error) {
    next(error);
  }
});

export default router;
