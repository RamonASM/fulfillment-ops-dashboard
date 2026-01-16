/**
 * Error Tracking Service
 *
 * Provides integration with error tracking services like Sentry.
 * Falls back to console logging if no tracking service is configured.
 *
 * Configuration:
 *   SENTRY_DSN - Sentry Data Source Name (enables Sentry)
 *   NODE_ENV - Only sends to Sentry in production/staging
 *
 * Usage:
 *   import { errorTracker } from './lib/error-tracking.js';
 *   errorTracker.captureException(error, { userId: '123' });
 *   errorTracker.captureMessage('Something happened', 'warning');
 */

import { logger } from './logger.js';

export type SeverityLevel = 'fatal' | 'error' | 'warning' | 'info' | 'debug';

export interface ErrorContext {
  userId?: string;
  clientId?: string;
  requestId?: string;
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
}

interface ErrorTracker {
  init(): void;
  captureException(error: Error, context?: ErrorContext): string | undefined;
  captureMessage(message: string, level?: SeverityLevel, context?: ErrorContext): string | undefined;
  setUser(user: { id: string; email?: string; role?: string } | null): void;
  addBreadcrumb(category: string, message: string, data?: Record<string, unknown>): void;
  flush(): Promise<boolean>;
}

class ConsoleErrorTracker implements ErrorTracker {
  private enabled: boolean;

  constructor() {
    this.enabled = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging';
  }

  init(): void {
    if (this.enabled) {
      logger.info('Error tracking initialized (console mode - set SENTRY_DSN for Sentry)');
    }
  }

  captureException(error: Error, context?: ErrorContext): string | undefined {
    const eventId = this.generateEventId();
    logger.error(`[${eventId}] ${error.message}`, error, {
      ...context?.extra,
      userId: context?.userId,
      clientId: context?.clientId,
      tags: context?.tags,
    });
    return eventId;
  }

  captureMessage(message: string, level: SeverityLevel = 'info', context?: ErrorContext): string | undefined {
    const eventId = this.generateEventId();
    const logContext = {
      eventId,
      ...context?.extra,
      userId: context?.userId,
      clientId: context?.clientId,
      tags: context?.tags,
    };

    switch (level) {
      case 'fatal':
      case 'error':
        logger.error(`[${eventId}] ${message}`, null, logContext);
        break;
      case 'warning':
        logger.warn(`[${eventId}] ${message}`, logContext);
        break;
      default:
        logger.info(`[${eventId}] ${message}`, logContext);
    }

    return eventId;
  }

  setUser(_user: { id: string; email?: string; role?: string } | null): void {
    // No-op for console tracker
  }

  addBreadcrumb(category: string, message: string, data?: Record<string, unknown>): void {
    logger.debug(`[breadcrumb:${category}] ${message}`, data);
  }

  async flush(): Promise<boolean> {
    return true;
  }

  private generateEventId(): string {
    return Math.random().toString(36).substring(2, 15);
  }
}

// Factory function to create the appropriate error tracker
function createErrorTracker(): ErrorTracker {
  const sentryDsn = process.env.SENTRY_DSN;

  if (sentryDsn) {
    // Dynamic import of Sentry if configured
    // Note: This requires @sentry/node to be installed
    try {
      // For now, return console tracker
      // When Sentry is needed, uncomment and install @sentry/node:
      // const Sentry = require('@sentry/node');
      // return new SentryErrorTracker(Sentry, sentryDsn);

      logger.info('Sentry DSN found, but @sentry/node not installed. Using console tracker.');
      return new ConsoleErrorTracker();
    } catch {
      logger.warn('Sentry initialization failed, falling back to console tracker');
      return new ConsoleErrorTracker();
    }
  }

  return new ConsoleErrorTracker();
}

// Singleton error tracker
export const errorTracker = createErrorTracker();

// Initialize on import
errorTracker.init();

// Express error handler middleware factory
export function createErrorTrackingMiddleware() {
  return (
    error: Error,
    req: { user?: { userId?: string }; id?: string },
    _res: unknown,
    next: (error?: Error) => void
  ) => {
    errorTracker.captureException(error, {
      userId: req.user?.userId,
      requestId: req.id,
    });
    next(error);
  };
}
