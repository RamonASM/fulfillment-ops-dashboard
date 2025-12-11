import { prisma } from '../lib/prisma.js';
import { Prisma } from '@prisma/client';

// =============================================================================
// TYPES
// =============================================================================

export type ArtworkType = 'product_label' | 'packaging_design' | 'marketing_material' | 'insert_collateral';

export interface CreateArtworkInput {
  productId: string;
  clientId: string;
  name: string;
  description?: string;
  artworkType: ArtworkType;
  createdById: string;
  assignedToId?: string;
}

export interface CreateVersionInput {
  artworkId: string;
  filename: string;
  originalFilename: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  thumbnailUrl?: string;
  uploadedById: string;
  uploadedByName?: string;
  changeNotes?: string;
}

export interface ArtworkFilters {
  clientId?: string;
  productId?: string;
  status?: string | string[];
  artworkType?: ArtworkType | ArtworkType[];
  assignedToId?: string;
  search?: string;
  slaBreached?: boolean;
  isActive?: boolean;
}

export interface PaginationOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// =============================================================================
// ARTWORK CRUD
// =============================================================================

/**
 * Create a new artwork record
 */
export async function createArtwork(input: CreateArtworkInput) {
  const artwork = await prisma.artwork.create({
    data: {
      productId: input.productId,
      clientId: input.clientId,
      name: input.name,
      description: input.description,
      artworkType: input.artworkType,
      status: 'draft',
      createdById: input.createdById,
      assignedToId: input.assignedToId,
      metadata: {},
    },
    include: {
      product: { select: { id: true, name: true, productId: true } },
      client: { select: { id: true, name: true, code: true } },
      versions: { orderBy: { versionNumber: 'desc' }, take: 1 },
    },
  });

  // Create initial status history entry
  await prisma.artworkStatusHistory.create({
    data: {
      artworkId: artwork.id,
      fromStatus: '',
      toStatus: 'draft',
      changedById: input.createdById,
      changedByType: 'user',
      reason: 'Artwork created',
    },
  });

  return artwork;
}

/**
 * Get artwork by ID with full details
 */
export async function getArtworkById(artworkId: string) {
  return prisma.artwork.findUnique({
    where: { id: artworkId },
    include: {
      product: { select: { id: true, name: true, productId: true, itemType: true } },
      client: { select: { id: true, name: true, code: true } },
      versions: {
        orderBy: { versionNumber: 'desc' },
        where: { isActive: true },
      },
      statusHistory: {
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
    },
  });
}

/**
 * List artworks with filters and pagination
 */
export async function listArtworks(
  filters: ArtworkFilters,
  pagination: PaginationOptions = {}
) {
  const {
    page = 1,
    limit = 20,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = pagination;

  const where: Prisma.ArtworkWhereInput = {
    isActive: filters.isActive ?? true,
  };

  if (filters.clientId) {
    where.clientId = filters.clientId;
  }

  if (filters.productId) {
    where.productId = filters.productId;
  }

  if (filters.status) {
    where.status = Array.isArray(filters.status)
      ? { in: filters.status }
      : filters.status;
  }

  if (filters.artworkType) {
    where.artworkType = Array.isArray(filters.artworkType)
      ? { in: filters.artworkType }
      : filters.artworkType;
  }

  if (filters.assignedToId) {
    where.assignedToId = filters.assignedToId;
  }

  if (filters.slaBreached !== undefined) {
    where.slaBreached = filters.slaBreached;
  }

  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: 'insensitive' } },
      { description: { contains: filters.search, mode: 'insensitive' } },
      { product: { name: { contains: filters.search, mode: 'insensitive' } } },
      { product: { productId: { contains: filters.search, mode: 'insensitive' } } },
    ];
  }

  const [total, artworks] = await Promise.all([
    prisma.artwork.count({ where }),
    prisma.artwork.findMany({
      where,
      include: {
        product: { select: { id: true, name: true, productId: true } },
        client: { select: { id: true, name: true, code: true } },
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
          where: { isActive: true },
        },
      },
      orderBy: { [sortBy]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return {
    data: artworks,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Update artwork metadata
 */
export async function updateArtwork(
  artworkId: string,
  data: {
    name?: string;
    description?: string;
    assignedToId?: string | null;
  }
) {
  return prisma.artwork.update({
    where: { id: artworkId },
    data: {
      ...(data.name && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.assignedToId !== undefined && { assignedToId: data.assignedToId }),
    },
    include: {
      product: { select: { id: true, name: true, productId: true } },
      client: { select: { id: true, name: true, code: true } },
    },
  });
}

/**
 * Soft delete an artwork
 */
export async function archiveArtwork(artworkId: string) {
  return prisma.artwork.update({
    where: { id: artworkId },
    data: { isActive: false },
  });
}

// =============================================================================
// VERSION MANAGEMENT
// =============================================================================

/**
 * Add a new version to an artwork
 */
export async function createVersion(input: CreateVersionInput) {
  // Get the latest version number
  const latestVersion = await prisma.artworkVersion.findFirst({
    where: { artworkId: input.artworkId },
    orderBy: { versionNumber: 'desc' },
  });

  const versionNumber = (latestVersion?.versionNumber || 0) + 1;

  // Create new version
  const version = await prisma.artworkVersion.create({
    data: {
      artworkId: input.artworkId,
      versionNumber,
      filename: input.filename,
      originalFilename: input.originalFilename,
      fileUrl: input.fileUrl,
      fileSize: input.fileSize,
      mimeType: input.mimeType,
      thumbnailUrl: input.thumbnailUrl,
      uploadedById: input.uploadedById,
      uploadedByName: input.uploadedByName,
      changeNotes: input.changeNotes,
    },
  });

  // Update artwork's current version
  await prisma.artwork.update({
    where: { id: input.artworkId },
    data: { currentVersionId: version.id },
  });

  return version;
}

/**
 * Get all versions of an artwork
 */
export async function getVersions(artworkId: string) {
  return prisma.artworkVersion.findMany({
    where: { artworkId, isActive: true },
    orderBy: { versionNumber: 'desc' },
  });
}

/**
 * Get a specific version
 */
export async function getVersionById(versionId: string) {
  return prisma.artworkVersion.findUnique({
    where: { id: versionId },
    include: {
      artwork: {
        include: {
          product: { select: { id: true, name: true } },
          client: { select: { id: true, name: true } },
        },
      },
    },
  });
}

/**
 * Update version with review decision
 */
export async function updateVersionDecision(
  versionId: string,
  decision: 'approved' | 'rejected' | 'changes_requested',
  feedback: string,
  reviewedById: string,
  reviewedByName?: string
) {
  return prisma.artworkVersion.update({
    where: { id: versionId },
    data: {
      decision,
      feedback,
      reviewedById,
      reviewedByName,
      reviewedAt: new Date(),
    },
  });
}

// =============================================================================
// STATUS HISTORY
// =============================================================================

/**
 * Get status history for an artwork
 */
export async function getStatusHistory(artworkId: string) {
  return prisma.artworkStatusHistory.findMany({
    where: { artworkId },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Add status history entry
 */
export async function addStatusHistory(data: {
  artworkId: string;
  fromStatus: string;
  toStatus: string;
  changedById: string;
  changedByType: 'user' | 'portal_user' | 'system';
  changedByName?: string;
  reason?: string;
  versionId?: string;
  metadata?: Record<string, unknown>;
}) {
  return prisma.artworkStatusHistory.create({
    data: {
      artworkId: data.artworkId,
      fromStatus: data.fromStatus,
      toStatus: data.toStatus,
      changedById: data.changedById,
      changedByType: data.changedByType,
      changedByName: data.changedByName,
      reason: data.reason,
      versionId: data.versionId,
      metadata: data.metadata as any,
    },
  });
}

// =============================================================================
// STATISTICS
// =============================================================================

/**
 * Get artwork counts by status for a client
 */
export async function getArtworkStatusCounts(clientId?: string) {
  const where: Prisma.ArtworkWhereInput = { isActive: true };
  if (clientId) {
    where.clientId = clientId;
  }

  const counts = await prisma.artwork.groupBy({
    by: ['status'],
    where,
    _count: { status: true },
  });

  return counts.reduce(
    (acc, { status, _count }) => {
      acc[status] = _count.status;
      return acc;
    },
    {} as Record<string, number>
  );
}

/**
 * Get artworks pending review for portal user
 */
export async function getArtworksPendingReview(clientId: string) {
  return prisma.artwork.findMany({
    where: {
      clientId,
      status: 'under_review',
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
    orderBy: { submittedAt: 'asc' },
  });
}

/**
 * Get artworks approaching SLA deadline
 */
export async function getArtworksApproachingSla(hoursThreshold: number = 4) {
  const now = new Date();
  const thresholdTime = new Date(now.getTime() + hoursThreshold * 60 * 60 * 1000);

  return prisma.artwork.findMany({
    where: {
      status: 'under_review',
      slaBreached: false,
      slaDeadline: {
        gte: now,
        lte: thresholdTime,
      },
      isActive: true,
    },
    include: {
      product: { select: { id: true, name: true } },
      client: { select: { id: true, name: true } },
    },
    orderBy: { slaDeadline: 'asc' },
  });
}
