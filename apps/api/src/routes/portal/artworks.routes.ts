import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { portalAuth } from '../../middleware/portal-auth.js';
import {
  getArtworkById,
  listArtworks,
  getVersions,
  getArtworkStatusCounts,
  getArtworksPendingReview,
} from '../../services/artwork.service.js';
import {
  markUnderReview,
  approveArtwork,
  rejectArtwork,
  requestArtworkChanges,
  getArtworkStatusDisplay,
  getArtworkTypeDisplay,
  getSlaStatus,
} from '../../services/artwork-workflow.service.js';

const router = Router();

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const approvalSchema = z.object({
  feedback: z.string().optional(),
});

const rejectionSchema = z.object({
  reason: z.string().min(1, 'Reason is required for rejection'),
});

const changesRequestSchema = z.object({
  feedback: z.string().min(1, 'Feedback is required when requesting changes'),
});

// =============================================================================
// ROUTES
// =============================================================================

/**
 * GET /api/portal/artworks
 * List artworks for client (pending review prioritized)
 */
router.get('/', portalAuth, async (req: Request, res: Response) => {
  try {
    const clientId = req.portalUser!.clientId;
    const { status, artworkType, productId, search, page, limit } = req.query;

    const filters = {
      clientId,
      status: status ? (status as string).split(',') : undefined,
      artworkType: artworkType ? (artworkType as string).split(',') as any : undefined,
      productId: productId as string | undefined,
      search: search as string | undefined,
    };

    const pagination = {
      page: page ? parseInt(page as string) : 1,
      limit: limit ? parseInt(limit as string) : 20,
      sortBy: 'submittedAt',
      sortOrder: 'asc' as const,
    };

    const result = await listArtworks(filters, pagination);

    // Add display info to each artwork
    const artworksWithDisplay = result.data.map((artwork: any) => ({
      ...artwork,
      statusDisplay: getArtworkStatusDisplay(artwork.status),
      typeDisplay: getArtworkTypeDisplay(artwork.artworkType),
      slaStatus: getSlaStatus(artwork),
    }));

    res.json({
      ...result,
      data: artworksWithDisplay,
    });
  } catch (error) {
    logger.error('Portal artworks list error', error as Error);
    res.status(500).json({ message: 'Failed to load artworks' });
  }
});

/**
 * GET /api/portal/artworks/pending
 * Get artworks pending review for this client
 */
router.get('/pending', portalAuth, async (req: Request, res: Response) => {
  try {
    const clientId = req.portalUser!.clientId;

    // Get artworks that are submitted or under review
    const artworks = await prisma.artwork.findMany({
      where: {
        clientId,
        status: { in: ['submitted', 'under_review'] },
        isActive: true,
      },
      include: {
        product: { select: { id: true, name: true, productId: true } },
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
          where: { isActive: true },
        },
      },
      orderBy: [
        { slaDeadline: 'asc' },
        { submittedAt: 'asc' },
      ],
    });

    const artworksWithDisplay = artworks.map((artwork: any) => ({
      ...artwork,
      statusDisplay: getArtworkStatusDisplay(artwork.status),
      typeDisplay: getArtworkTypeDisplay(artwork.artworkType),
      slaStatus: getSlaStatus(artwork),
    }));

    res.json({ data: artworksWithDisplay, total: artworks.length });
  } catch (error) {
    logger.error('Portal pending artworks error', error as Error);
    res.status(500).json({ message: 'Failed to load pending artworks' });
  }
});

/**
 * GET /api/portal/artworks/stats
 * Get artwork counts by status for client
 */
router.get('/stats', portalAuth, async (req: Request, res: Response) => {
  try {
    const clientId = req.portalUser!.clientId;
    const counts = await getArtworkStatusCounts(clientId);
    res.json({ counts });
  } catch (error) {
    logger.error('Portal artwork stats error', error as Error);
    res.status(500).json({ message: 'Failed to load artwork stats' });
  }
});

/**
 * GET /api/portal/artworks/:artworkId
 * Get artwork details
 */
router.get('/:artworkId', portalAuth, async (req: Request, res: Response) => {
  try {
    const clientId = req.portalUser!.clientId;
    const { artworkId } = req.params;

    const artwork = await getArtworkById(artworkId);

    if (!artwork || artwork.clientId !== clientId) {
      return res.status(404).json({ message: 'Artwork not found' });
    }

    // Add display info
    const statusDisplay = getArtworkStatusDisplay(artwork.status as any);
    const typeDisplay = getArtworkTypeDisplay(artwork.artworkType);
    const slaStatus = getSlaStatus(artwork as any);

    res.json({
      ...artwork,
      statusDisplay,
      typeDisplay,
      slaStatus,
    });
  } catch (error) {
    logger.error('Portal artwork detail error', error as Error);
    res.status(500).json({ message: 'Failed to load artwork' });
  }
});

/**
 * GET /api/portal/artworks/:artworkId/versions
 * Get all versions of an artwork
 */
router.get('/:artworkId/versions', portalAuth, async (req: Request, res: Response) => {
  try {
    const clientId = req.portalUser!.clientId;
    const { artworkId } = req.params;

    // Verify artwork belongs to client
    const artwork = await getArtworkById(artworkId);
    if (!artwork || artwork.clientId !== clientId) {
      return res.status(404).json({ message: 'Artwork not found' });
    }

    const versions = await getVersions(artworkId);
    res.json({ data: versions });
  } catch (error) {
    logger.error('Portal artwork versions error', error as Error);
    res.status(500).json({ message: 'Failed to load versions' });
  }
});

/**
 * POST /api/portal/artworks/:artworkId/view
 * Mark artwork as under review (when client starts reviewing)
 */
router.post('/:artworkId/view', portalAuth, async (req: Request, res: Response) => {
  try {
    const clientId = req.portalUser!.clientId;
    const portalUserId = req.portalUser!.id;

    // Fetch user name from database
    const portalUser = await prisma.portalUser.findUnique({
      where: { id: portalUserId },
      select: { name: true },
    });
    const portalUserName = portalUser?.name;

    const { artworkId } = req.params;

    // Verify artwork belongs to client
    const artwork = await getArtworkById(artworkId);
    if (!artwork || artwork.clientId !== clientId) {
      return res.status(404).json({ message: 'Artwork not found' });
    }

    // Only transition if in submitted status
    if (artwork.status === 'submitted') {
      const result = await markUnderReview(artworkId, portalUserId, portalUserName);
      if (!result.success) {
        return res.status(400).json({ message: result.error });
      }
      return res.json(result.artwork);
    }

    // Return current artwork if already under review or other status
    res.json(artwork);
  } catch (error) {
    logger.error('Portal artwork view error', error as Error);
    res.status(500).json({ message: 'Failed to mark artwork as viewed' });
  }
});

/**
 * POST /api/portal/artworks/:artworkId/approve
 * Approve artwork
 */
router.post('/:artworkId/approve', portalAuth, async (req: Request, res: Response) => {
  try {
    const clientId = req.portalUser!.clientId;
    const portalUserId = req.portalUser!.id;

    // Fetch user name from database
    const portalUser = await prisma.portalUser.findUnique({
      where: { id: portalUserId },
      select: { name: true },
    });
    const portalUserName = portalUser?.name;

    const { artworkId } = req.params;

    const data = approvalSchema.parse(req.body);

    // Verify artwork belongs to client
    const artwork = await getArtworkById(artworkId);
    if (!artwork || artwork.clientId !== clientId) {
      return res.status(404).json({ message: 'Artwork not found' });
    }

    // Only allow approval from under_review status
    if (artwork.status !== 'under_review') {
      return res.status(400).json({ message: 'Artwork must be under review to approve' });
    }

    const result = await approveArtwork(artworkId, portalUserId, portalUserName, data.feedback);

    if (!result.success) {
      return res.status(400).json({ message: result.error });
    }

    res.json(result.artwork);
  } catch (error) {
    logger.error('Portal artwork approval error', error as Error);
    res.status(500).json({ message: 'Failed to approve artwork' });
  }
});

/**
 * POST /api/portal/artworks/:artworkId/reject
 * Reject artwork
 */
router.post('/:artworkId/reject', portalAuth, async (req: Request, res: Response) => {
  try {
    const clientId = req.portalUser!.clientId;
    const portalUserId = req.portalUser!.id;

    // Fetch user name from database
    const portalUser = await prisma.portalUser.findUnique({
      where: { id: portalUserId },
      select: { name: true },
    });
    const portalUserName = portalUser?.name;

    const { artworkId } = req.params;

    const data = rejectionSchema.parse(req.body);

    // Verify artwork belongs to client
    const artwork = await getArtworkById(artworkId);
    if (!artwork || artwork.clientId !== clientId) {
      return res.status(404).json({ message: 'Artwork not found' });
    }

    // Only allow rejection from under_review status
    if (artwork.status !== 'under_review') {
      return res.status(400).json({ message: 'Artwork must be under review to reject' });
    }

    const result = await rejectArtwork(artworkId, portalUserId, data.reason, portalUserName);

    if (!result.success) {
      return res.status(400).json({ message: result.error });
    }

    res.json(result.artwork);
  } catch (error) {
    logger.error('Portal artwork rejection error', error as Error);
    res.status(500).json({ message: 'Failed to reject artwork' });
  }
});

/**
 * POST /api/portal/artworks/:artworkId/request-changes
 * Request changes on artwork
 */
router.post('/:artworkId/request-changes', portalAuth, async (req: Request, res: Response) => {
  try {
    const clientId = req.portalUser!.clientId;
    const portalUserId = req.portalUser!.id;

    // Fetch user name from database
    const portalUser = await prisma.portalUser.findUnique({
      where: { id: portalUserId },
      select: { name: true },
    });
    const portalUserName = portalUser?.name;

    const { artworkId } = req.params;

    const data = changesRequestSchema.parse(req.body);

    // Verify artwork belongs to client
    const artwork = await getArtworkById(artworkId);
    if (!artwork || artwork.clientId !== clientId) {
      return res.status(404).json({ message: 'Artwork not found' });
    }

    // Only allow changes request from under_review status
    if (artwork.status !== 'under_review') {
      return res.status(400).json({ message: 'Artwork must be under review to request changes' });
    }

    const result = await requestArtworkChanges(artworkId, portalUserId, data.feedback, portalUserName);

    if (!result.success) {
      return res.status(400).json({ message: result.error });
    }

    res.json(result.artwork);
  } catch (error) {
    logger.error('Portal artwork changes request error', error as Error);
    res.status(500).json({ message: 'Failed to request changes' });
  }
});

export default router;
