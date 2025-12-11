import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { requestContext, LogContext } from '../lib/logger.js';

// =============================================================================
// REQUEST ID MIDDLEWARE
// =============================================================================

declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

/**
 * Middleware to generate and propagate request IDs for tracing
 * - Uses existing x-request-id header if present (for distributed tracing)
 * - Generates new UUID if not present
 * - Sets request ID on response headers
 * - Propagates context via AsyncLocalStorage for logging
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Use existing request ID or generate new one
  const requestId = (req.headers['x-request-id'] as string) || uuidv4();

  // Attach to request object
  req.requestId = requestId;

  // Set on response headers for client correlation
  res.setHeader('x-request-id', requestId);

  // Build log context
  const context: LogContext = {
    requestId,
    method: req.method,
    path: req.path,
  };

  // Add user info if authenticated
  if (req.user?.userId) {
    context.userId = req.user.userId;
  }
  if (req.portalUser?.id) {
    context.userId = req.portalUser.id;
    context.clientId = req.portalUser.clientId;
  }

  // Run the rest of the request in this context
  requestContext.run(context, () => {
    next();
  });
}

/**
 * Update log context with user info after authentication
 * Call this after authenticate/portalAuth middleware
 */
export function updateRequestContext(req: Request): void {
  const store = requestContext.getStore();
  if (store) {
    if (req.user?.userId) {
      store.userId = req.user.userId;
    }
    if (req.portalUser?.id) {
      store.userId = req.portalUser.id;
      store.clientId = req.portalUser.clientId;
    }
  }
}
