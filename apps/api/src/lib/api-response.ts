import crypto from 'crypto';

// =============================================================================
// STANDARD API RESPONSE FORMATS
// =============================================================================
// Provides consistent response structures across all API endpoints.
// All error responses include a unique request ID for debugging.

/**
 * Standard error codes used across the API
 */
export const ERROR_CODES = {
  // Authentication & Authorization (4xx)
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  CSRF_ERROR: 'CSRF_ERROR',

  // Validation & Input Errors (4xx)
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  INVALID_FORMAT: 'INVALID_FORMAT',
  DUPLICATE_ENTRY: 'DUPLICATE_ENTRY',

  // Resource Errors (4xx)
  NOT_FOUND: 'NOT_FOUND',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  CLIENT_NOT_FOUND: 'CLIENT_NOT_FOUND',
  PRODUCT_NOT_FOUND: 'PRODUCT_NOT_FOUND',
  ORDER_NOT_FOUND: 'ORDER_NOT_FOUND',

  // Rate Limiting & Throttling (429)
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',

  // Server Errors (5xx)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];

/**
 * Standard error response structure
 */
export interface ApiErrorResponse {
  success: false;
  code: ErrorCode | string;
  message: string;
  details?: unknown;
  requestId: string;
  timestamp: string;
}

/**
 * Standard success response structure
 */
export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
  requestId?: string;
  timestamp?: string;
}

/**
 * Paginated response structure
 */
export interface PaginatedResponse<T = unknown> {
  success: true;
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  requestId?: string;
  timestamp?: string;
}

/**
 * Create a standard error response
 *
 * @param code - Error code from ERROR_CODES or custom string
 * @param message - Human-readable error message
 * @param details - Optional additional error details (validation errors, stack trace, etc.)
 * @returns Formatted error response object
 *
 * @example
 * ```typescript
 * return res.status(400).json(
 *   errorResponse('INVALID_INPUT', 'Client ID is required')
 * );
 * ```
 */
export function errorResponse(
  code: ErrorCode | string,
  message: string,
  details?: unknown
): ApiErrorResponse {
  const response: ApiErrorResponse = {
    success: false,
    code,
    message,
    requestId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
  };

  if (details !== undefined) {
    response.details = details;
  }

  return response;
}

/**
 * Create a standard success response
 *
 * @param data - Response data
 * @param includeMetadata - Whether to include requestId and timestamp (default: false)
 * @returns Formatted success response object
 *
 * @example
 * ```typescript
 * return res.json(
 *   successResponse({ id: '123', name: 'Product A' })
 * );
 * ```
 */
export function successResponse<T>(
  data: T,
  includeMetadata = false
): ApiSuccessResponse<T> {
  const response: ApiSuccessResponse<T> = {
    success: true,
    data,
  };

  if (includeMetadata) {
    response.requestId = crypto.randomUUID();
    response.timestamp = new Date().toISOString();
  }

  return response;
}

/**
 * Create a paginated response
 *
 * @param data - Array of items
 * @param pagination - Pagination metadata
 * @param includeMetadata - Whether to include requestId and timestamp (default: false)
 * @returns Formatted paginated response object
 *
 * @example
 * ```typescript
 * return res.json(
 *   paginatedResponse(
 *     products,
 *     { page: 1, limit: 20, total: 100, totalPages: 5 }
 *   )
 * );
 * ```
 */
export function paginatedResponse<T>(
  data: T[],
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  },
  includeMetadata = false
): PaginatedResponse<T> {
  const response: PaginatedResponse<T> = {
    success: true,
    data,
    meta: pagination,
  };

  if (includeMetadata) {
    response.requestId = crypto.randomUUID();
    response.timestamp = new Date().toISOString();
  }

  return response;
}

/**
 * HTTP status codes for common error types
 */
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

/**
 * Map error codes to HTTP status codes
 */
export function getHttpStatusForError(code: ErrorCode | string): number {
  const statusMap: Record<string, number> = {
    [ERROR_CODES.UNAUTHORIZED]: HTTP_STATUS.UNAUTHORIZED,
    [ERROR_CODES.FORBIDDEN]: HTTP_STATUS.FORBIDDEN,
    [ERROR_CODES.INVALID_CREDENTIALS]: HTTP_STATUS.UNAUTHORIZED,
    [ERROR_CODES.TOKEN_EXPIRED]: HTTP_STATUS.UNAUTHORIZED,
    [ERROR_CODES.TOKEN_INVALID]: HTTP_STATUS.UNAUTHORIZED,
    [ERROR_CODES.CSRF_ERROR]: HTTP_STATUS.FORBIDDEN,

    [ERROR_CODES.VALIDATION_ERROR]: HTTP_STATUS.BAD_REQUEST,
    [ERROR_CODES.INVALID_INPUT]: HTTP_STATUS.BAD_REQUEST,
    [ERROR_CODES.MISSING_REQUIRED_FIELD]: HTTP_STATUS.BAD_REQUEST,
    [ERROR_CODES.INVALID_FORMAT]: HTTP_STATUS.BAD_REQUEST,
    [ERROR_CODES.DUPLICATE_ENTRY]: HTTP_STATUS.CONFLICT,

    [ERROR_CODES.NOT_FOUND]: HTTP_STATUS.NOT_FOUND,
    [ERROR_CODES.RESOURCE_NOT_FOUND]: HTTP_STATUS.NOT_FOUND,
    [ERROR_CODES.CLIENT_NOT_FOUND]: HTTP_STATUS.NOT_FOUND,
    [ERROR_CODES.PRODUCT_NOT_FOUND]: HTTP_STATUS.NOT_FOUND,
    [ERROR_CODES.ORDER_NOT_FOUND]: HTTP_STATUS.NOT_FOUND,

    [ERROR_CODES.RATE_LIMIT_EXCEEDED]: HTTP_STATUS.TOO_MANY_REQUESTS,
    [ERROR_CODES.TOO_MANY_REQUESTS]: HTTP_STATUS.TOO_MANY_REQUESTS,

    [ERROR_CODES.INTERNAL_ERROR]: HTTP_STATUS.INTERNAL_SERVER_ERROR,
    [ERROR_CODES.DATABASE_ERROR]: HTTP_STATUS.INTERNAL_SERVER_ERROR,
    [ERROR_CODES.EXTERNAL_SERVICE_ERROR]: HTTP_STATUS.SERVICE_UNAVAILABLE,
    [ERROR_CODES.SERVICE_UNAVAILABLE]: HTTP_STATUS.SERVICE_UNAVAILABLE,
  };

  return statusMap[code] || HTTP_STATUS.INTERNAL_SERVER_ERROR;
}
