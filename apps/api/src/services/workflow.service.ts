import { prisma } from '../lib/prisma.js';
import { addHours, isAfter, isBefore } from 'date-fns';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Reorder Request Status Flow:
 * DRAFT → SUBMITTED → ACKNOWLEDGED → FULFILLED
 *                  ↓               ↓
 *         CHANGES_REQUESTED     ON_HOLD
 *                  ↓
 *               (back to SUBMITTED after revision)
 */
export type RequestStatus =
  | 'draft'
  | 'submitted'
  | 'acknowledged'
  | 'changes_requested'
  | 'on_hold'
  | 'fulfilled'
  | 'cancelled';

export type UserType = 'user' | 'portal_user' | 'system';

export interface StatusTransitionResult {
  success: boolean;
  orderRequest?: any;
  error?: string;
}

export interface SlaStatus {
  deadline: Date | null;
  isBreached: boolean;
  hoursRemaining: number | null;
  hoursOverdue: number | null;
}

// =============================================================================
// ORDER STATE MACHINE
// =============================================================================

/**
 * Valid status transitions for reorder requests.
 * Key = current status, Value = array of valid next statuses
 */
export const ORDER_TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  draft: ['submitted', 'cancelled'],
  submitted: ['acknowledged', 'changes_requested', 'on_hold', 'cancelled'],
  acknowledged: ['fulfilled', 'on_hold', 'cancelled'],
  changes_requested: ['submitted', 'cancelled'], // Client revises and resubmits
  on_hold: ['acknowledged', 'changes_requested', 'cancelled'],
  fulfilled: [], // Terminal state
  cancelled: [], // Terminal state
};

/**
 * Statuses that count as "active" (not terminal)
 */
export const ACTIVE_STATUSES: RequestStatus[] = [
  'draft',
  'submitted',
  'acknowledged',
  'changes_requested',
  'on_hold',
];

/**
 * Statuses that require SLA tracking
 */
export const SLA_TRACKED_STATUSES: RequestStatus[] = [
  'submitted',
  'acknowledged',
];

/**
 * Check if a status transition is valid
 */
export function isValidTransition(
  currentStatus: RequestStatus,
  newStatus: RequestStatus
): boolean {
  const validTransitions = ORDER_TRANSITIONS[currentStatus] || [];
  return validTransitions.includes(newStatus);
}

/**
 * Get valid next statuses for a given status
 */
export function getValidNextStatuses(currentStatus: RequestStatus): RequestStatus[] {
  return ORDER_TRANSITIONS[currentStatus] || [];
}

// =============================================================================
// STATUS TRANSITION LOGIC
// =============================================================================

/**
 * Transition an order request to a new status with validation and history tracking.
 */
export async function transitionOrderStatus(
  orderRequestId: string,
  newStatus: RequestStatus,
  changedBy: string,
  changedByType: UserType,
  options?: {
    reason?: string;
    externalOrderRef?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<StatusTransitionResult> {
  // Get current order request
  const orderRequest = await prisma.orderRequest.findUnique({
    where: { id: orderRequestId },
    include: { client: { include: { configuration: true } } },
  });

  if (!orderRequest) {
    return { success: false, error: 'Order request not found' };
  }

  const currentStatus = orderRequest.status as RequestStatus;

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
      // Calculate SLA deadline
      const slaHours = orderRequest.client.configuration?.orderResponseSlaHours || 24;
      updateData.slaDeadline = addHours(now, slaHours);
      updateData.slaBreached = false;
      break;

    case 'acknowledged':
      updateData.acknowledgedAt = now;
      // Check if SLA was breached
      if (orderRequest.slaDeadline && isAfter(now, orderRequest.slaDeadline)) {
        updateData.slaBreached = true;
      }
      break;

    case 'fulfilled':
      updateData.fulfilledAt = now;
      updateData.fulfilledBy = changedBy;
      if (options?.externalOrderRef) {
        updateData.externalOrderRef = options.externalOrderRef;
        updateData.externalOrderDate = now;
      }
      if (options?.reason) {
        updateData.externalOrderNotes = options.reason;
      }
      break;

    case 'changes_requested':
    case 'on_hold':
      // Reason is required for these transitions
      if (!options?.reason) {
        return {
          success: false,
          error: `Reason is required when transitioning to ${newStatus}`,
        };
      }
      updateData.reviewNotes = options.reason;
      break;
  }

  // Perform transaction: update order and create history entry
  const result = await prisma.$transaction(async (tx) => {
    // Update order request
    const updated = await tx.orderRequest.update({
      where: { id: orderRequestId },
      data: updateData,
    });

    // Create status history entry
    await tx.requestStatusHistory.create({
      data: {
        orderRequestId,
        fromStatus: currentStatus,
        toStatus: newStatus,
        changedBy,
        changedByType,
        reason: options?.reason,
        metadata: options?.metadata as any,
      },
    });

    return updated;
  });

  return { success: true, orderRequest: result };
}

/**
 * Submit an order request (client action)
 */
export async function submitOrderRequest(
  orderRequestId: string,
  portalUserId: string
): Promise<StatusTransitionResult> {
  return transitionOrderStatus(
    orderRequestId,
    'submitted',
    portalUserId,
    'portal_user'
  );
}

/**
 * Acknowledge an order request (admin action)
 */
export async function acknowledgeOrderRequest(
  orderRequestId: string,
  userId: string
): Promise<StatusTransitionResult> {
  return transitionOrderStatus(
    orderRequestId,
    'acknowledged',
    userId,
    'user'
  );
}

/**
 * Request changes on an order (admin action)
 */
export async function requestChanges(
  orderRequestId: string,
  userId: string,
  reason: string
): Promise<StatusTransitionResult> {
  return transitionOrderStatus(
    orderRequestId,
    'changes_requested',
    userId,
    'user',
    { reason }
  );
}

/**
 * Put an order on hold (admin action)
 */
export async function putOnHold(
  orderRequestId: string,
  userId: string,
  reason: string
): Promise<StatusTransitionResult> {
  return transitionOrderStatus(
    orderRequestId,
    'on_hold',
    userId,
    'user',
    { reason }
  );
}

/**
 * Mark an order as fulfilled (admin action)
 */
export async function fulfillOrder(
  orderRequestId: string,
  userId: string,
  externalOrderRef: string,
  notes?: string
): Promise<StatusTransitionResult> {
  return transitionOrderStatus(
    orderRequestId,
    'fulfilled',
    userId,
    'user',
    { externalOrderRef, reason: notes }
  );
}

/**
 * Cancel an order request
 */
export async function cancelOrder(
  orderRequestId: string,
  changedBy: string,
  changedByType: UserType,
  reason: string
): Promise<StatusTransitionResult> {
  return transitionOrderStatus(
    orderRequestId,
    'cancelled',
    changedBy,
    changedByType,
    { reason }
  );
}

// =============================================================================
// SLA TRACKING
// =============================================================================

/**
 * Get SLA status for an order request
 */
export function getSlaStatus(orderRequest: {
  slaDeadline: Date | null;
  slaBreached: boolean;
  status: string;
}): SlaStatus {
  if (!orderRequest.slaDeadline) {
    return {
      deadline: null,
      isBreached: false,
      hoursRemaining: null,
      hoursOverdue: null,
    };
  }

  const now = new Date();
  const deadline = new Date(orderRequest.slaDeadline);
  const isBreached = orderRequest.slaBreached || isAfter(now, deadline);

  const diffMs = deadline.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  return {
    deadline,
    isBreached,
    hoursRemaining: diffHours > 0 ? Math.round(diffHours * 10) / 10 : null,
    hoursOverdue: diffHours < 0 ? Math.round(-diffHours * 10) / 10 : null,
  };
}

/**
 * Check and mark SLA breaches for pending orders.
 * This should be run periodically (e.g., every 15 minutes).
 */
export async function checkSlaBreaches(): Promise<{
  checked: number;
  breached: number;
  breachedOrders: string[];
}> {
  const now = new Date();

  // Find orders with SLA deadlines that have passed and aren't already marked
  const ordersToCheck = await prisma.orderRequest.findMany({
    where: {
      status: { in: ['submitted'] },
      slaDeadline: { lt: now },
      slaBreached: false,
    },
    select: {
      id: true,
      clientId: true,
      slaDeadline: true,
    },
  });

  if (ordersToCheck.length === 0) {
    return { checked: 0, breached: 0, breachedOrders: [] };
  }

  // Mark as breached
  const breachedIds = ordersToCheck.map((o) => o.id);

  await prisma.orderRequest.updateMany({
    where: { id: { in: breachedIds } },
    data: { slaBreached: true },
  });

  // Create activity feed entries for breaches
  for (const order of ordersToCheck) {
    await prisma.activityFeed.create({
      data: {
        clientId: order.clientId,
        actorType: 'system',
        action: 'sla_breach',
        category: 'order',
        entityType: 'order_request',
        entityId: order.id,
        severity: 'warning',
        metadata: {
          slaDeadline: order.slaDeadline,
          breachedAt: now,
        },
      },
    });
  }

  return {
    checked: ordersToCheck.length,
    breached: breachedIds.length,
    breachedOrders: breachedIds,
  };
}

/**
 * Get orders approaching SLA deadline (for alerts)
 */
export async function getOrdersApproachingSla(
  hoursThreshold: number = 4
): Promise<Array<{
  id: string;
  clientId: string;
  clientName: string;
  submittedAt: Date | null;
  slaDeadline: Date | null;
  hoursRemaining: number;
}>> {
  const now = new Date();
  const thresholdTime = addHours(now, hoursThreshold);

  const orders = await prisma.orderRequest.findMany({
    where: {
      status: 'submitted',
      slaBreached: false,
      slaDeadline: {
        gte: now,
        lte: thresholdTime,
      },
    },
    include: {
      client: { select: { name: true } },
    },
  });

  return orders.map((order) => ({
    id: order.id,
    clientId: order.clientId,
    clientName: order.client.name,
    submittedAt: order.submittedAt,
    slaDeadline: order.slaDeadline,
    hoursRemaining:
      order.slaDeadline
        ? Math.round(
            ((order.slaDeadline.getTime() - now.getTime()) / (1000 * 60 * 60)) * 10
          ) / 10
        : 0,
  }));
}

// =============================================================================
// ORDER REQUEST HELPERS
// =============================================================================

/**
 * Get order request status history
 */
export async function getStatusHistory(orderRequestId: string) {
  return prisma.requestStatusHistory.findMany({
    where: { orderRequestId },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Get active order requests requiring attention
 */
export async function getActiveOrderRequests(options?: {
  clientId?: string;
  status?: RequestStatus[];
  breachedOnly?: boolean;
  limit?: number;
}) {
  const where: any = {
    status: { in: options?.status || ACTIVE_STATUSES },
  };

  if (options?.clientId) {
    where.clientId = options.clientId;
  }

  if (options?.breachedOnly) {
    where.slaBreached = true;
  }

  return prisma.orderRequest.findMany({
    where,
    orderBy: [
      { slaBreached: 'desc' },
      { slaDeadline: 'asc' },
      { createdAt: 'asc' },
    ],
    take: options?.limit || 50,
    include: {
      client: { select: { name: true, code: true } },
      requestedBy: { select: { name: true, email: true } },
      location: { select: { name: true, code: true } },
    },
  });
}

/**
 * Get status display information for UI
 */
export function getStatusDisplay(status: RequestStatus): {
  label: string;
  color: 'gray' | 'blue' | 'green' | 'amber' | 'red';
  description: string;
} {
  const displays: Record<RequestStatus, { label: string; color: 'gray' | 'blue' | 'green' | 'amber' | 'red'; description: string }> = {
    draft: {
      label: 'Draft',
      color: 'gray',
      description: 'Order is being prepared',
    },
    submitted: {
      label: 'Submitted',
      color: 'blue',
      description: 'Waiting for admin review',
    },
    acknowledged: {
      label: 'Acknowledged',
      color: 'green',
      description: 'Admin received, creating external order',
    },
    changes_requested: {
      label: 'Changes Requested',
      color: 'amber',
      description: 'Admin needs client to revise',
    },
    on_hold: {
      label: 'On Hold',
      color: 'amber',
      description: 'Waiting for additional information',
    },
    fulfilled: {
      label: 'Fulfilled',
      color: 'green',
      description: 'External order completed',
    },
    cancelled: {
      label: 'Cancelled',
      color: 'red',
      description: 'Order request cancelled',
    },
  };

  return displays[status] || displays.draft;
}
