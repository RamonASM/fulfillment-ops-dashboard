import { prisma } from '../lib/prisma.js';
import { addHours, isAfter } from 'date-fns';
import { addStatusHistory } from './artwork.service.js';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Artwork Status Flow:
 * DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED
 *                               ↓→ REJECTED
 *                               ↓→ CHANGES_REQUESTED → (back to SUBMITTED)
 *      ↓→ CANCELLED (from any non-terminal state)
 */
export type ArtworkStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'changes_requested'
  | 'cancelled';

export type UserType = 'user' | 'portal_user' | 'system';

export interface StatusTransitionResult {
  success: boolean;
  artwork?: any;
  error?: string;
}

export interface SlaStatus {
  deadline: Date | null;
  isBreached: boolean;
  isWarned: boolean;
  hoursRemaining: number | null;
  hoursOverdue: number | null;
}

// =============================================================================
// ARTWORK STATE MACHINE
// =============================================================================

/**
 * Valid status transitions for artworks.
 * Key = current status, Value = array of valid next statuses
 */
export const ARTWORK_TRANSITIONS: Record<ArtworkStatus, ArtworkStatus[]> = {
  draft: ['submitted', 'cancelled'],
  submitted: ['under_review', 'cancelled'],
  under_review: ['approved', 'rejected', 'changes_requested', 'cancelled'],
  approved: [], // Terminal state
  rejected: [], // Terminal state
  changes_requested: ['submitted', 'cancelled'], // Admin re-uploads revised version
  cancelled: [], // Terminal state
};

/**
 * Statuses that count as "active" (not terminal)
 */
export const ACTIVE_STATUSES: ArtworkStatus[] = [
  'draft',
  'submitted',
  'under_review',
  'changes_requested',
];

/**
 * Statuses that require SLA tracking
 */
export const SLA_TRACKED_STATUSES: ArtworkStatus[] = ['under_review'];

/**
 * Default SLA hours (48 hours)
 */
export const DEFAULT_SLA_HOURS = 48;

/**
 * Warning threshold (hours before SLA deadline)
 */
export const SLA_WARNING_HOURS = 4;

/**
 * Check if a status transition is valid
 */
export function isValidTransition(
  currentStatus: ArtworkStatus,
  newStatus: ArtworkStatus
): boolean {
  const validTransitions = ARTWORK_TRANSITIONS[currentStatus] || [];
  return validTransitions.includes(newStatus);
}

/**
 * Get valid next statuses for a given status
 */
export function getValidNextStatuses(currentStatus: ArtworkStatus): ArtworkStatus[] {
  return ARTWORK_TRANSITIONS[currentStatus] || [];
}

// =============================================================================
// STATUS TRANSITION LOGIC
// =============================================================================

/**
 * Transition an artwork to a new status with validation and history tracking.
 */
export async function transitionArtworkStatus(
  artworkId: string,
  newStatus: ArtworkStatus,
  changedById: string,
  changedByType: UserType,
  options?: {
    reason?: string;
    changedByName?: string;
    versionId?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<StatusTransitionResult> {
  // Get current artwork
  const artwork = await prisma.artwork.findUnique({
    where: { id: artworkId },
    include: {
      client: { include: { configuration: true } },
    },
  });

  if (!artwork) {
    return { success: false, error: 'Artwork not found' };
  }

  const currentStatus = artwork.status as ArtworkStatus;

  // Validate transition
  if (!isValidTransition(currentStatus, newStatus)) {
    return {
      success: false,
      error: `Invalid transition from ${currentStatus} to ${newStatus}. Valid transitions: ${getValidNextStatuses(currentStatus).join(', ')}`,
    };
  }

  // Prepare update data
  const updateData: any = {
    status: newStatus,
  };

  const now = new Date();

  // Status-specific updates
  switch (newStatus) {
    case 'submitted':
      updateData.submittedAt = now;
      break;

    case 'under_review':
      // Calculate SLA deadline (48 hours)
      const slaHours = DEFAULT_SLA_HOURS;
      updateData.slaDeadline = addHours(now, slaHours);
      updateData.slaBreached = false;
      updateData.slaWarned = false;
      break;

    case 'approved':
    case 'rejected':
      updateData.resolvedAt = now;
      updateData.resolvedById = changedById;
      // Check if SLA was breached
      if (artwork.slaDeadline && isAfter(now, artwork.slaDeadline)) {
        updateData.slaBreached = true;
      }
      break;

    case 'changes_requested':
      // Reason is required for changes requested
      if (!options?.reason) {
        return {
          success: false,
          error: 'Reason is required when requesting changes',
        };
      }
      break;
  }

  // Perform transaction: update artwork and create history entry
  const result = await prisma.$transaction(async (tx) => {
    // Update artwork
    const updated = await tx.artwork.update({
      where: { id: artworkId },
      data: updateData,
      include: {
        product: { select: { id: true, name: true, productId: true } },
        client: { select: { id: true, name: true, code: true } },
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
        },
      },
    });

    // Create status history entry
    await tx.artworkStatusHistory.create({
      data: {
        artworkId,
        fromStatus: currentStatus,
        toStatus: newStatus,
        changedById,
        changedByType,
        changedByName: options?.changedByName,
        reason: options?.reason,
        versionId: options?.versionId,
        metadata: options?.metadata as any,
      },
    });

    // Create activity feed entry
    await tx.activityFeed.create({
      data: {
        clientId: artwork.clientId,
        actorId: changedById,
        actorType: changedByType,
        action: `artwork_${newStatus}`,
        category: 'artwork',
        entityType: 'artwork',
        entityId: artworkId,
        entityName: artwork.name,
        metadata: {
          fromStatus: currentStatus,
          toStatus: newStatus,
          reason: options?.reason,
          productId: artwork.productId,
        },
      },
    });

    return updated;
  });

  return { success: true, artwork: result };
}

// =============================================================================
// WORKFLOW ACTIONS
// =============================================================================

/**
 * Submit artwork for client review (admin action after uploading)
 */
export async function submitArtworkForReview(
  artworkId: string,
  userId: string,
  userName?: string
): Promise<StatusTransitionResult> {
  // First check if there's at least one version
  const versions = await prisma.artworkVersion.findMany({
    where: { artworkId, isActive: true },
  });

  if (versions.length === 0) {
    return { success: false, error: 'Cannot submit artwork without any uploaded versions' };
  }

  return transitionArtworkStatus(artworkId, 'submitted', userId, 'user', {
    changedByName: userName,
  });
}

/**
 * Mark artwork as under review (system action when client views it)
 */
export async function markUnderReview(
  artworkId: string,
  portalUserId: string,
  portalUserName?: string
): Promise<StatusTransitionResult> {
  return transitionArtworkStatus(artworkId, 'under_review', portalUserId, 'portal_user', {
    changedByName: portalUserName,
  });
}

/**
 * Approve artwork (client portal action)
 */
export async function approveArtwork(
  artworkId: string,
  portalUserId: string,
  portalUserName?: string,
  feedback?: string
): Promise<StatusTransitionResult> {
  // Get current version and mark it as approved
  const artwork = await prisma.artwork.findUnique({
    where: { id: artworkId },
    include: {
      versions: {
        orderBy: { versionNumber: 'desc' },
        take: 1,
      },
    },
  });

  if (!artwork || artwork.versions.length === 0) {
    return { success: false, error: 'Artwork or version not found' };
  }

  const currentVersion = artwork.versions[0];

  // Update version with approval
  await prisma.artworkVersion.update({
    where: { id: currentVersion.id },
    data: {
      decision: 'approved',
      feedback: feedback || 'Approved',
      reviewedById: portalUserId,
      reviewedByName: portalUserName,
      reviewedAt: new Date(),
    },
  });

  return transitionArtworkStatus(artworkId, 'approved', portalUserId, 'portal_user', {
    changedByName: portalUserName,
    versionId: currentVersion.id,
    reason: feedback,
  });
}

/**
 * Reject artwork (client portal action)
 */
export async function rejectArtwork(
  artworkId: string,
  portalUserId: string,
  reason: string,
  portalUserName?: string
): Promise<StatusTransitionResult> {
  if (!reason || reason.trim().length === 0) {
    return { success: false, error: 'Reason is required for rejection' };
  }

  // Get current version and mark it as rejected
  const artwork = await prisma.artwork.findUnique({
    where: { id: artworkId },
    include: {
      versions: {
        orderBy: { versionNumber: 'desc' },
        take: 1,
      },
    },
  });

  if (!artwork || artwork.versions.length === 0) {
    return { success: false, error: 'Artwork or version not found' };
  }

  const currentVersion = artwork.versions[0];

  // Update version with rejection
  await prisma.artworkVersion.update({
    where: { id: currentVersion.id },
    data: {
      decision: 'rejected',
      feedback: reason,
      reviewedById: portalUserId,
      reviewedByName: portalUserName,
      reviewedAt: new Date(),
    },
  });

  return transitionArtworkStatus(artworkId, 'rejected', portalUserId, 'portal_user', {
    changedByName: portalUserName,
    versionId: currentVersion.id,
    reason,
  });
}

/**
 * Request changes on artwork (client portal action)
 */
export async function requestArtworkChanges(
  artworkId: string,
  portalUserId: string,
  feedback: string,
  portalUserName?: string
): Promise<StatusTransitionResult> {
  if (!feedback || feedback.trim().length === 0) {
    return { success: false, error: 'Feedback is required when requesting changes' };
  }

  // Get current version and mark it as changes requested
  const artwork = await prisma.artwork.findUnique({
    where: { id: artworkId },
    include: {
      versions: {
        orderBy: { versionNumber: 'desc' },
        take: 1,
      },
    },
  });

  if (!artwork || artwork.versions.length === 0) {
    return { success: false, error: 'Artwork or version not found' };
  }

  const currentVersion = artwork.versions[0];

  // Update version with changes requested
  await prisma.artworkVersion.update({
    where: { id: currentVersion.id },
    data: {
      decision: 'changes_requested',
      feedback,
      reviewedById: portalUserId,
      reviewedByName: portalUserName,
      reviewedAt: new Date(),
    },
  });

  return transitionArtworkStatus(artworkId, 'changes_requested', portalUserId, 'portal_user', {
    changedByName: portalUserName,
    versionId: currentVersion.id,
    reason: feedback,
  });
}

/**
 * Cancel an artwork (admin action)
 */
export async function cancelArtwork(
  artworkId: string,
  userId: string,
  reason: string,
  userName?: string
): Promise<StatusTransitionResult> {
  return transitionArtworkStatus(artworkId, 'cancelled', userId, 'user', {
    changedByName: userName,
    reason,
  });
}

// =============================================================================
// SLA TRACKING
// =============================================================================

/**
 * Get SLA status for an artwork
 */
export function getSlaStatus(artwork: {
  slaDeadline: Date | null;
  slaBreached: boolean;
  slaWarned: boolean;
  status: string;
}): SlaStatus {
  if (!artwork.slaDeadline) {
    return {
      deadline: null,
      isBreached: false,
      isWarned: false,
      hoursRemaining: null,
      hoursOverdue: null,
    };
  }

  const now = new Date();
  const deadline = new Date(artwork.slaDeadline);
  const isBreached = artwork.slaBreached || isAfter(now, deadline);

  const diffMs = deadline.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  return {
    deadline,
    isBreached,
    isWarned: artwork.slaWarned,
    hoursRemaining: diffHours > 0 ? Math.round(diffHours * 10) / 10 : null,
    hoursOverdue: diffHours < 0 ? Math.round(-diffHours * 10) / 10 : null,
  };
}

/**
 * Check and mark SLA breaches for pending artworks.
 * This should be run periodically (e.g., every 15 minutes).
 */
export async function checkArtworkSlaBreaches(): Promise<{
  checked: number;
  breached: number;
  warned: number;
  breachedArtworks: string[];
  warnedArtworks: string[];
}> {
  const now = new Date();
  const warningThreshold = new Date(now.getTime() + SLA_WARNING_HOURS * 60 * 60 * 1000);

  // Find artworks with SLA deadlines that have passed and aren't already marked
  const breachedArtworks = await prisma.artwork.findMany({
    where: {
      status: 'under_review',
      slaDeadline: { lt: now },
      slaBreached: false,
      isActive: true,
    },
    select: {
      id: true,
      clientId: true,
      name: true,
      slaDeadline: true,
    },
  });

  // Find artworks approaching SLA (for warning)
  const warningArtworks = await prisma.artwork.findMany({
    where: {
      status: 'under_review',
      slaDeadline: {
        gte: now,
        lte: warningThreshold,
      },
      slaWarned: false,
      slaBreached: false,
      isActive: true,
    },
    select: {
      id: true,
      clientId: true,
      name: true,
      slaDeadline: true,
    },
  });

  // Mark breached
  const breachedIds = breachedArtworks.map((a) => a.id);
  if (breachedIds.length > 0) {
    await prisma.artwork.updateMany({
      where: { id: { in: breachedIds } },
      data: { slaBreached: true },
    });

    // Create activity feed entries for breaches
    for (const artwork of breachedArtworks) {
      await prisma.activityFeed.create({
        data: {
          clientId: artwork.clientId,
          actorType: 'system',
          action: 'artwork_sla_breach',
          category: 'artwork',
          entityType: 'artwork',
          entityId: artwork.id,
          entityName: artwork.name,
          severity: 'critical',
          metadata: {
            slaDeadline: artwork.slaDeadline,
            breachedAt: now,
          },
        },
      });
    }
  }

  // Mark warned
  const warnedIds = warningArtworks.map((a) => a.id);
  if (warnedIds.length > 0) {
    await prisma.artwork.updateMany({
      where: { id: { in: warnedIds } },
      data: { slaWarned: true },
    });

    // Create activity feed entries for warnings
    for (const artwork of warningArtworks) {
      await prisma.activityFeed.create({
        data: {
          clientId: artwork.clientId,
          actorType: 'system',
          action: 'artwork_sla_warning',
          category: 'artwork',
          entityType: 'artwork',
          entityId: artwork.id,
          entityName: artwork.name,
          severity: 'warning',
          metadata: {
            slaDeadline: artwork.slaDeadline,
            hoursRemaining: SLA_WARNING_HOURS,
          },
        },
      });
    }
  }

  return {
    checked: breachedArtworks.length + warningArtworks.length,
    breached: breachedIds.length,
    warned: warnedIds.length,
    breachedArtworks: breachedIds,
    warnedArtworks: warnedIds,
  };
}

// =============================================================================
// STATUS DISPLAY HELPERS
// =============================================================================

/**
 * Get status display information for UI
 */
export function getArtworkStatusDisplay(status: ArtworkStatus): {
  label: string;
  color: 'gray' | 'blue' | 'green' | 'amber' | 'red' | 'purple';
  description: string;
} {
  const displays: Record<ArtworkStatus, { label: string; color: 'gray' | 'blue' | 'green' | 'amber' | 'red' | 'purple'; description: string }> = {
    draft: {
      label: 'Draft',
      color: 'gray',
      description: 'Artwork is being prepared',
    },
    submitted: {
      label: 'Submitted',
      color: 'blue',
      description: 'Waiting for client to start review',
    },
    under_review: {
      label: 'Under Review',
      color: 'purple',
      description: 'Client is reviewing artwork',
    },
    approved: {
      label: 'Approved',
      color: 'green',
      description: 'Client approved the artwork',
    },
    rejected: {
      label: 'Rejected',
      color: 'red',
      description: 'Client rejected the artwork',
    },
    changes_requested: {
      label: 'Changes Requested',
      color: 'amber',
      description: 'Client requested modifications',
    },
    cancelled: {
      label: 'Cancelled',
      color: 'gray',
      description: 'Artwork request was cancelled',
    },
  };

  return displays[status] || displays.draft;
}

/**
 * Get artwork type display information
 */
export function getArtworkTypeDisplay(type: string): {
  label: string;
  icon: string;
} {
  const types: Record<string, { label: string; icon: string }> = {
    product_label: { label: 'Product Label', icon: 'tag' },
    packaging_design: { label: 'Packaging Design', icon: 'package' },
    marketing_material: { label: 'Marketing Material', icon: 'megaphone' },
    insert_collateral: { label: 'Insert/Collateral', icon: 'file-text' },
  };

  return types[type] || { label: type, icon: 'file' };
}
