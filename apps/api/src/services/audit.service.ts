import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';

// =============================================================================
// AUDIT EVENT TYPES
// =============================================================================

export enum AuditAction {
  // Authentication
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  LOGIN_FAILED = 'LOGIN_FAILED',
  PASSWORD_CHANGED = 'PASSWORD_CHANGED',

  // Products
  PRODUCT_CREATED = 'PRODUCT_CREATED',
  PRODUCT_UPDATED = 'PRODUCT_UPDATED',
  PRODUCT_DELETED = 'PRODUCT_DELETED',
  STOCK_ADJUSTED = 'STOCK_ADJUSTED',

  // Clients
  CLIENT_CREATED = 'CLIENT_CREATED',
  CLIENT_UPDATED = 'CLIENT_UPDATED',
  CLIENT_DELETED = 'CLIENT_DELETED',

  // Imports
  IMPORT_STARTED = 'IMPORT_STARTED',
  IMPORT_COMPLETED = 'IMPORT_COMPLETED',
  IMPORT_FAILED = 'IMPORT_FAILED',

  // Alerts
  ALERT_CREATED = 'ALERT_CREATED',
  ALERT_DISMISSED = 'ALERT_DISMISSED',
  ALERT_READ = 'ALERT_READ',

  // Orders (Portal)
  ORDER_REQUESTED = 'ORDER_REQUESTED',
  ORDER_APPROVED = 'ORDER_APPROVED',
  ORDER_REJECTED = 'ORDER_REJECTED',
  ORDER_FULFILLED = 'ORDER_FULFILLED',

  // Reports
  REPORT_GENERATED = 'REPORT_GENERATED',
  REPORT_EXPORTED = 'REPORT_EXPORTED',

  // Settings
  SETTINGS_UPDATED = 'SETTINGS_UPDATED',
  USER_CREATED = 'USER_CREATED',
  USER_UPDATED = 'USER_UPDATED',
  USER_DELETED = 'USER_DELETED',
}

export enum AuditCategory {
  AUTHENTICATION = 'AUTHENTICATION',
  INVENTORY = 'INVENTORY',
  CLIENT = 'CLIENT',
  IMPORT = 'IMPORT',
  ALERT = 'ALERT',
  ORDER = 'ORDER',
  REPORT = 'REPORT',
  SETTINGS = 'SETTINGS',
  USER = 'USER',
}

interface AuditLogEntry {
  action: AuditAction;
  category: AuditCategory;
  userId?: string;
  clientId?: string;
  resourceType?: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

// =============================================================================
// AUDIT LOG FUNCTIONS
// =============================================================================

/**
 * Log an audit event
 */
export async function logAuditEvent(entry: AuditLogEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: entry.action,
        category: entry.category,
        userId: entry.userId,
        clientId: entry.clientId,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        details: entry.details as any,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
        createdAt: new Date(),
      },
    });
  } catch (error) {
    // Don't fail the main operation if audit logging fails
    logger.error('Audit failed to log event', error as Error);
  }
}

/**
 * Get audit logs with filtering
 */
export async function getAuditLogs(filters: {
  userId?: string;
  clientId?: string;
  action?: AuditAction;
  category?: AuditCategory;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}): Promise<{ logs: any[]; total: number }> {
  const where: any = {};

  if (filters.userId) where.userId = filters.userId;
  if (filters.clientId) where.clientId = filters.clientId;
  if (filters.action) where.action = filters.action;
  if (filters.category) where.category = filters.category;
  if (filters.startDate || filters.endDate) {
    where.createdAt = {};
    if (filters.startDate) where.createdAt.gte = filters.startDate;
    if (filters.endDate) where.createdAt.lte = filters.endDate;
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: {
        user: { select: { name: true, email: true } },
        client: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: filters.limit || 50,
      skip: filters.offset || 0,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { logs, total };
}

/**
 * Get user activity summary
 */
export async function getUserActivitySummary(
  userId: string,
  days: number = 30
): Promise<{
  totalActions: number;
  byCategory: Record<string, number>;
  recentActions: any[];
}> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const logs = await prisma.auditLog.findMany({
    where: {
      userId,
      createdAt: { gte: startDate },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  const byCategory: Record<string, number> = {};
  logs.forEach((log) => {
    byCategory[log.category] = (byCategory[log.category] || 0) + 1;
  });

  return {
    totalActions: logs.length,
    byCategory,
    recentActions: logs.slice(0, 10),
  };
}

/**
 * Get client activity summary
 */
export async function getClientActivitySummary(
  clientId: string,
  days: number = 30
): Promise<{
  totalActions: number;
  byAction: Record<string, number>;
  topUsers: { userId: string; name: string; count: number }[];
}> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const logs = await prisma.auditLog.findMany({
    where: {
      clientId,
      createdAt: { gte: startDate },
    },
    include: {
      user: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const byAction: Record<string, number> = {};
  const userCounts: Record<string, { name: string; count: number }> = {};

  logs.forEach((log) => {
    byAction[log.action] = (byAction[log.action] || 0) + 1;

    if (log.userId) {
      if (!userCounts[log.userId]) {
        userCounts[log.userId] = { name: log.user?.name || 'Unknown', count: 0 };
      }
      userCounts[log.userId].count++;
    }
  });

  const topUsers = Object.entries(userCounts)
    .map(([userId, data]) => ({ userId, ...data }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    totalActions: logs.length,
    byAction,
    topUsers,
  };
}

// =============================================================================
// EXPRESS MIDDLEWARE
// =============================================================================

/**
 * Middleware to automatically log request events
 */
export function auditMiddleware(
  category: AuditCategory,
  action: AuditAction,
  getDetails?: (req: any) => Record<string, unknown>
) {
  return async (req: any, res: any, next: any) => {
    // Store original end function
    const originalEnd = res.end;

    res.end = function (chunk: any, ...args: any[]) {
      // Log after response is sent
      setImmediate(async () => {
        try {
          await logAuditEvent({
            action,
            category,
            userId: req.user?.id,
            clientId: req.params?.clientId || req.body?.clientId,
            resourceType: req.baseUrl?.split('/').pop(),
            resourceId: req.params?.id || req.params?.productId,
            details: {
              method: req.method,
              path: req.path,
              statusCode: res.statusCode,
              ...(getDetails ? getDetails(req) : {}),
            },
            ipAddress: req.ip || req.connection?.remoteAddress,
            userAgent: req.get('user-agent'),
          });
        } catch (error) {
          logger.error('Audit middleware error', error as Error);
        }
      });

      return originalEnd.call(this, chunk, ...args);
    };

    next();
  };
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Log authentication event
 */
export async function logAuthEvent(
  action: AuditAction.LOGIN | AuditAction.LOGOUT | AuditAction.LOGIN_FAILED | AuditAction.PASSWORD_CHANGED,
  userId: string | undefined,
  details: { email: string; ipAddress?: string; userAgent?: string; reason?: string }
): Promise<void> {
  await logAuditEvent({
    action,
    category: AuditCategory.AUTHENTICATION,
    userId,
    details: {
      email: details.email,
      reason: details.reason,
    },
    ipAddress: details.ipAddress,
    userAgent: details.userAgent,
  });
}

/**
 * Log product change
 */
export async function logProductChange(
  action: AuditAction.PRODUCT_CREATED | AuditAction.PRODUCT_UPDATED | AuditAction.PRODUCT_DELETED | AuditAction.STOCK_ADJUSTED,
  userId: string,
  clientId: string,
  productId: string,
  details: Record<string, unknown>
): Promise<void> {
  await logAuditEvent({
    action,
    category: AuditCategory.INVENTORY,
    userId,
    clientId,
    resourceType: 'product',
    resourceId: productId,
    details,
  });
}

/**
 * Log order event
 */
export async function logOrderEvent(
  action: AuditAction.ORDER_REQUESTED | AuditAction.ORDER_APPROVED | AuditAction.ORDER_REJECTED | AuditAction.ORDER_FULFILLED,
  userId: string,
  clientId: string,
  orderId: string,
  details: Record<string, unknown>
): Promise<void> {
  await logAuditEvent({
    action,
    category: AuditCategory.ORDER,
    userId,
    clientId,
    resourceType: 'order',
    resourceId: orderId,
    details,
  });
}

/**
 * Log report generation
 */
export async function logReportGeneration(
  userId: string,
  clientId: string,
  reportType: string,
  format: string
): Promise<void> {
  await logAuditEvent({
    action: AuditAction.REPORT_GENERATED,
    category: AuditCategory.REPORT,
    userId,
    clientId,
    resourceType: 'report',
    details: {
      reportType,
      format,
    },
  });
}
