import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { NotFoundError, ValidationError } from '../middleware/error-handler.js';
import {
  createArtwork,
  getArtworkById,
  listArtworks,
  updateArtwork,
  archiveArtwork,
  createVersion,
  getVersions,
  getArtworkStatusCounts,
} from '../services/artwork.service.js';
import {
  submitArtworkForReview,
  cancelArtwork,
  getArtworkStatusDisplay,
  getArtworkTypeDisplay,
} from '../services/artwork-workflow.service.js';

const router = Router();

// =============================================================================
// FILE UPLOAD CONFIGURATION
// =============================================================================

const artworkUploadsDir = './uploads/artworks';
if (!fs.existsSync(artworkUploadsDir)) {
  fs.mkdirSync(artworkUploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const clientId = req.body.clientId || 'unknown';
    const dir = path.join(artworkUploadsDir, clientId);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `artwork-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/tiff',
      'application/pdf',
    ];
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.tiff', '.tif', '.pdf'];

    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPG, PNG, TIFF, and PDF files are allowed.'));
    }
  },
});

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const createArtworkSchema = z.object({
  productId: z.string().uuid(),
  clientId: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  artworkType: z.enum(['product_label', 'packaging_design', 'marketing_material', 'insert_collateral']),
  assignedToId: z.string().uuid().optional(),
});

const updateArtworkSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  assignedToId: z.string().uuid().nullable().optional(),
});

// Apply authentication
router.use(authenticate);

// =============================================================================
// ROUTES
// =============================================================================

/**
 * GET /api/artworks
 * List all artworks with filtering
 */
router.get('/', async (req, res, next) => {
  try {
    const {
      clientId,
      productId,
      status,
      artworkType,
      assignedToId,
      search,
      slaBreached,
      page,
      limit,
      sortBy,
      sortOrder,
    } = req.query;

    const filters = {
      clientId: clientId as string | undefined,
      productId: productId as string | undefined,
      status: status ? (status as string).split(',') : undefined,
      artworkType: artworkType ? (artworkType as string).split(',') as any : undefined,
      assignedToId: assignedToId as string | undefined,
      search: search as string | undefined,
      slaBreached: slaBreached === 'true' ? true : slaBreached === 'false' ? false : undefined,
    };

    const pagination = {
      page: page ? parseInt(page as string) : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      sortBy: sortBy as string | undefined,
      sortOrder: sortOrder as 'asc' | 'desc' | undefined,
    };

    const result = await listArtworks(filters, pagination);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/artworks/stats
 * Get artwork counts by status
 */
router.get('/stats', async (req, res, next) => {
  try {
    const { clientId } = req.query;
    const counts = await getArtworkStatusCounts(clientId as string | undefined);
    res.json({ counts });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/artworks/:artworkId
 * Get artwork details
 */
router.get('/:artworkId', async (req, res, next) => {
  try {
    const { artworkId } = req.params;
    const artwork = await getArtworkById(artworkId);

    if (!artwork) {
      throw new NotFoundError('Artwork not found');
    }

    // Add display info
    const statusDisplay = getArtworkStatusDisplay(artwork.status as any);
    const typeDisplay = getArtworkTypeDisplay(artwork.artworkType);

    res.json({
      ...artwork,
      statusDisplay,
      typeDisplay,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/artworks
 * Create a new artwork
 */
router.post('/', requireRole('admin', 'operations_manager', 'account_manager'), async (req, res, next) => {
  try {
    const data = createArtworkSchema.parse(req.body);

    // Verify product exists and belongs to client
    const product = await prisma.product.findFirst({
      where: { id: data.productId, clientId: data.clientId },
    });

    if (!product) {
      throw new ValidationError('Product not found or does not belong to this client');
    }

    const artwork = await createArtwork({
      ...data,
      createdById: req.user!.userId,
    });

    res.status(201).json(artwork);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/artworks/:artworkId/versions
 * Upload a new version
 */
router.post(
  '/:artworkId/versions',
  requireRole('admin', 'operations_manager', 'account_manager'),
  upload.single('file'),
  async (req, res, next) => {
    try {
      const { artworkId } = req.params;

      if (!req.file) {
        throw new ValidationError('No file uploaded');
      }

      // Verify artwork exists
      const artwork = await getArtworkById(artworkId);
      if (!artwork) {
        throw new NotFoundError('Artwork not found');
      }

      // Fetch user name from database
      const user = await prisma.user.findUnique({
        where: { id: req.user!.userId },
        select: { name: true },
      });

      // Create version
      const version = await createVersion({
        artworkId,
        filename: req.file.filename,
        originalFilename: req.file.originalname,
        fileUrl: `/uploads/artworks/${artwork.clientId}/${req.file.filename}`,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        uploadedById: req.user!.userId,
        uploadedByName: user?.name,
        changeNotes: req.body.changeNotes,
      });

      res.status(201).json(version);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/artworks/:artworkId/versions
 * Get all versions of an artwork
 */
router.get('/:artworkId/versions', async (req, res, next) => {
  try {
    const { artworkId } = req.params;

    // Verify artwork exists
    const artwork = await getArtworkById(artworkId);
    if (!artwork) {
      throw new NotFoundError('Artwork not found');
    }

    const versions = await getVersions(artworkId);
    res.json({ data: versions });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/artworks/:artworkId
 * Update artwork metadata
 */
router.patch('/:artworkId', requireRole('admin', 'operations_manager', 'account_manager'), async (req, res, next) => {
  try {
    const { artworkId } = req.params;
    const data = updateArtworkSchema.parse(req.body);

    // Verify artwork exists
    const existing = await getArtworkById(artworkId);
    if (!existing) {
      throw new NotFoundError('Artwork not found');
    }

    const artwork = await updateArtwork(artworkId, data);
    res.json(artwork);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/artworks/:artworkId/submit
 * Submit artwork for client review
 */
router.post('/:artworkId/submit', requireRole('admin', 'operations_manager', 'account_manager'), async (req, res, next) => {
  try {
    const { artworkId } = req.params;

    // Fetch user name from database
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { name: true },
    });

    const result = await submitArtworkForReview(artworkId, req.user!.userId, user?.name);

    if (!result.success) {
      throw new ValidationError(result.error || 'Failed to submit artwork');
    }

    res.json(result.artwork);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/artworks/:artworkId/cancel
 * Cancel an artwork
 */
router.post('/:artworkId/cancel', requireRole('admin', 'operations_manager', 'account_manager'), async (req, res, next) => {
  try {
    const { artworkId } = req.params;
    const { reason } = req.body;

    if (!reason) {
      throw new ValidationError('Reason is required for cancellation');
    }

    // Fetch user name from database
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { name: true },
    });

    const result = await cancelArtwork(artworkId, req.user!.userId, reason, user?.name);

    if (!result.success) {
      throw new ValidationError(result.error || 'Failed to cancel artwork');
    }

    res.json(result.artwork);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/artworks/:artworkId
 * Archive an artwork (soft delete)
 */
router.delete('/:artworkId', requireRole('admin', 'operations_manager'), async (req, res, next) => {
  try {
    const { artworkId } = req.params;

    // Verify artwork exists
    const existing = await getArtworkById(artworkId);
    if (!existing) {
      throw new NotFoundError('Artwork not found');
    }

    await archiveArtwork(artworkId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
