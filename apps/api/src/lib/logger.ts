import { AsyncLocalStorage } from 'async_hooks';

// =============================================================================
// SENSITIVE FIELD REDACTION
// =============================================================================

const SENSITIVE_FIELDS = new Set([
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'authorization',
  'secret',
  'apiKey',
  'api_key',
  'creditCard',
  'credit_card',
  'ssn',
  'socialSecurityNumber',
]);

function redactSensitiveFields(obj: unknown, depth = 0): unknown {
  if (depth > 10) return '[MAX_DEPTH]';
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => redactSensitiveFields(item, depth + 1));
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_FIELDS.has(key.toLowerCase())) {
      result[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      result[key] = redactSensitiveFields(value, depth + 1);
    } else {
      result[key] = value;
    }
  }
  return result;
}

// =============================================================================
// TYPES
// =============================================================================

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4,
}

export interface LogContext {
  requestId?: string;
  userId?: string;
  clientId?: string;
  method?: string;
  path?: string;
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  duration?: number;
}

// =============================================================================
// ASYNC LOCAL STORAGE FOR REQUEST CONTEXT
// =============================================================================

export const requestContext = new AsyncLocalStorage<LogContext>();

// =============================================================================
// LOGGER CLASS
// =============================================================================

class Logger {
  private minLevel: LogLevel;
  private isProduction: boolean;

  constructor() {
    this.isProduction = process.env.NODE_ENV === 'production';
    this.minLevel = this.isProduction ? LogLevel.INFO : LogLevel.DEBUG;
  }

  private getContext(): LogContext {
    return requestContext.getStore() || {};
  }

  private formatEntry(level: string, message: string, extra?: Record<string, unknown>): LogEntry {
    const context = this.getContext();
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: Object.keys(context).length > 0 || extra
        ? { ...context, ...extra }
        : undefined,
    };
  }

  private output(entry: LogEntry): void {
    // Redact sensitive fields before logging
    const safeEntry = redactSensitiveFields(entry) as LogEntry;

    if (this.isProduction) {
      // Structured JSON output for production log aggregation
      console.log(JSON.stringify(safeEntry));
    } else {
      // Colorized output for development
      const color = this.getColor(entry.level);
      const reset = '\x1b[0m';
      const dim = '\x1b[2m';

      let output = `${color}[${entry.level}]${reset} ${dim}${entry.timestamp}${reset} ${entry.message}`;

      if (entry.context && Object.keys(entry.context).length > 0) {
        output += ` ${dim}${JSON.stringify(entry.context)}${reset}`;
      }

      if (entry.error) {
        output += `\n${color}${entry.error.name}: ${entry.error.message}${reset}`;
        if (entry.error.stack && !this.isProduction) {
          output += `\n${dim}${entry.error.stack}${reset}`;
        }
      }

      console.log(output);
    }
  }

  private getColor(level: string): string {
    switch (level) {
      case 'DEBUG': return '\x1b[36m';  // Cyan
      case 'INFO': return '\x1b[32m';   // Green
      case 'WARN': return '\x1b[33m';   // Yellow
      case 'ERROR': return '\x1b[31m';  // Red
      case 'FATAL': return '\x1b[35m';  // Magenta
      default: return '\x1b[0m';        // Reset
    }
  }

  debug(message: string, context?: Record<string, unknown>): void {
    if (this.minLevel <= LogLevel.DEBUG) {
      this.output(this.formatEntry('DEBUG', message, context));
    }
  }

  info(message: string, context?: Record<string, unknown>): void {
    if (this.minLevel <= LogLevel.INFO) {
      this.output(this.formatEntry('INFO', message, context));
    }
  }

  warn(message: string, context?: Record<string, unknown>): void {
    if (this.minLevel <= LogLevel.WARN) {
      this.output(this.formatEntry('WARN', message, context));
    }
  }

  error(message: string, error?: Error | null, context?: Record<string, unknown>): void {
    if (this.minLevel <= LogLevel.ERROR) {
      const entry = this.formatEntry('ERROR', message, context);
      if (error) {
        entry.error = {
          name: error.name,
          message: error.message,
          stack: error.stack,
        };
      }
      this.output(entry);
    }
  }

  fatal(message: string, error?: Error | null, context?: Record<string, unknown>): void {
    const entry = this.formatEntry('FATAL', message, context);
    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }
    this.output(entry);
  }

  // Helper for timing operations
  startTimer(): () => number {
    const start = Date.now();
    return () => Date.now() - start;
  }

  // Log slow operations (useful for queries, API calls)
  logSlow(operation: string, duration: number, threshold: number = 100): void {
    if (duration > threshold) {
      this.warn(`Slow ${operation}`, { duration, threshold });
    }
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const logger = new Logger();
