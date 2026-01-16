import { describe, it, expect } from 'vitest';
import {
  errorResponse,
  successResponse,
  paginatedResponse,
  ERROR_CODES,
  getHttpStatusForError,
  HTTP_STATUS,
} from '../lib/api-response.js';

describe('API Response Formatting', () => {
  describe('errorResponse', () => {
    it('should create standard error response', () => {
      const response = errorResponse(
        ERROR_CODES.INVALID_INPUT,
        'Client ID is required'
      );

      expect(response.success).toBe(false);
      expect(response.code).toBe(ERROR_CODES.INVALID_INPUT);
      expect(response.message).toBe('Client ID is required');
      expect(response.requestId).toBeDefined();
      expect(response.timestamp).toBeDefined();
    });

    it('should include details when provided', () => {
      const details = { field: 'email', issue: 'invalid format' };
      const response = errorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        'Validation failed',
        details
      );

      expect(response.details).toEqual(details);
    });

    it('should not include details when not provided', () => {
      const response = errorResponse(ERROR_CODES.NOT_FOUND, 'Resource not found');

      expect(response.details).toBeUndefined();
    });

    it('should generate unique request IDs', () => {
      const response1 = errorResponse(ERROR_CODES.INTERNAL_ERROR, 'Error 1');
      const response2 = errorResponse(ERROR_CODES.INTERNAL_ERROR, 'Error 2');

      expect(response1.requestId).not.toBe(response2.requestId);
    });

    it('should include ISO timestamp', () => {
      const response = errorResponse(ERROR_CODES.UNAUTHORIZED, 'Auth required');

      const timestamp = new Date(response.timestamp);
      expect(timestamp.toISOString()).toBe(response.timestamp);
      expect(timestamp.getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('should accept custom error codes', () => {
      const customCode = 'CUSTOM_ERROR_CODE';
      const response = errorResponse(customCode, 'Custom error');

      expect(response.code).toBe(customCode);
    });
  });

  describe('successResponse', () => {
    it('should create standard success response', () => {
      const data = { id: '123', name: 'Test' };
      const response = successResponse(data);

      expect(response.success).toBe(true);
      expect(response.data).toEqual(data);
    });

    it('should not include metadata by default', () => {
      const response = successResponse({ test: 'data' });

      expect(response.requestId).toBeUndefined();
      expect(response.timestamp).toBeUndefined();
    });

    it('should include metadata when requested', () => {
      const response = successResponse({ test: 'data' }, true);

      expect(response.requestId).toBeDefined();
      expect(response.timestamp).toBeDefined();
    });

    it('should handle various data types', () => {
      // Object
      expect(successResponse({ key: 'value' }).data).toEqual({ key: 'value' });

      // Array
      expect(successResponse([1, 2, 3]).data).toEqual([1, 2, 3]);

      // String
      expect(successResponse('test').data).toBe('test');

      // Number
      expect(successResponse(42).data).toBe(42);

      // Boolean
      expect(successResponse(true).data).toBe(true);

      // Null
      expect(successResponse(null).data).toBe(null);
    });
  });

  describe('paginatedResponse', () => {
    it('should create paginated response', () => {
      const data = [{ id: '1' }, { id: '2' }];
      const pagination = {
        page: 1,
        limit: 20,
        total: 100,
        totalPages: 5,
      };

      const response = paginatedResponse(data, pagination);

      expect(response.success).toBe(true);
      expect(response.data).toEqual(data);
      expect(response.meta).toEqual(pagination);
    });

    it('should calculate pagination correctly', () => {
      const data = Array.from({ length: 20 }, (_, i) => ({ id: String(i) }));
      const pagination = {
        page: 2,
        limit: 20,
        total: 100,
        totalPages: 5,
      };

      const response = paginatedResponse(data, pagination);

      expect(response.meta.page).toBe(2);
      expect(response.meta.limit).toBe(20);
      expect(response.meta.total).toBe(100);
      expect(response.meta.totalPages).toBe(5);
    });

    it('should not include metadata by default', () => {
      const response = paginatedResponse(
        [],
        { page: 1, limit: 20, total: 0, totalPages: 0 }
      );

      expect(response.requestId).toBeUndefined();
      expect(response.timestamp).toBeUndefined();
    });

    it('should include metadata when requested', () => {
      const response = paginatedResponse(
        [],
        { page: 1, limit: 20, total: 0, totalPages: 0 },
        true
      );

      expect(response.requestId).toBeDefined();
      expect(response.timestamp).toBeDefined();
    });
  });

  describe('ERROR_CODES', () => {
    it('should have authentication error codes', () => {
      expect(ERROR_CODES.UNAUTHORIZED).toBe('UNAUTHORIZED');
      expect(ERROR_CODES.FORBIDDEN).toBe('FORBIDDEN');
      expect(ERROR_CODES.INVALID_CREDENTIALS).toBe('INVALID_CREDENTIALS');
      expect(ERROR_CODES.TOKEN_EXPIRED).toBe('TOKEN_EXPIRED');
      expect(ERROR_CODES.TOKEN_INVALID).toBe('TOKEN_INVALID');
    });

    it('should have validation error codes', () => {
      expect(ERROR_CODES.VALIDATION_ERROR).toBe('VALIDATION_ERROR');
      expect(ERROR_CODES.INVALID_INPUT).toBe('INVALID_INPUT');
      expect(ERROR_CODES.MISSING_REQUIRED_FIELD).toBe('MISSING_REQUIRED_FIELD');
    });

    it('should have resource error codes', () => {
      expect(ERROR_CODES.NOT_FOUND).toBe('NOT_FOUND');
      expect(ERROR_CODES.CLIENT_NOT_FOUND).toBe('CLIENT_NOT_FOUND');
      expect(ERROR_CODES.PRODUCT_NOT_FOUND).toBe('PRODUCT_NOT_FOUND');
    });

    it('should have server error codes', () => {
      expect(ERROR_CODES.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
      expect(ERROR_CODES.DATABASE_ERROR).toBe('DATABASE_ERROR');
      expect(ERROR_CODES.SERVICE_UNAVAILABLE).toBe('SERVICE_UNAVAILABLE');
    });
  });

  describe('getHttpStatusForError', () => {
    it('should map auth errors to 401/403', () => {
      expect(getHttpStatusForError(ERROR_CODES.UNAUTHORIZED)).toBe(HTTP_STATUS.UNAUTHORIZED);
      expect(getHttpStatusForError(ERROR_CODES.FORBIDDEN)).toBe(HTTP_STATUS.FORBIDDEN);
      expect(getHttpStatusForError(ERROR_CODES.INVALID_CREDENTIALS)).toBe(HTTP_STATUS.UNAUTHORIZED);
    });

    it('should map validation errors to 400', () => {
      expect(getHttpStatusForError(ERROR_CODES.VALIDATION_ERROR)).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(getHttpStatusForError(ERROR_CODES.INVALID_INPUT)).toBe(HTTP_STATUS.BAD_REQUEST);
    });

    it('should map not found errors to 404', () => {
      expect(getHttpStatusForError(ERROR_CODES.NOT_FOUND)).toBe(HTTP_STATUS.NOT_FOUND);
      expect(getHttpStatusForError(ERROR_CODES.CLIENT_NOT_FOUND)).toBe(HTTP_STATUS.NOT_FOUND);
    });

    it('should map rate limit errors to 429', () => {
      expect(getHttpStatusForError(ERROR_CODES.RATE_LIMIT_EXCEEDED)).toBe(HTTP_STATUS.TOO_MANY_REQUESTS);
    });

    it('should default to 500 for unknown codes', () => {
      expect(getHttpStatusForError('UNKNOWN_ERROR')).toBe(HTTP_STATUS.INTERNAL_SERVER_ERROR);
    });
  });

  describe('HTTP_STATUS constants', () => {
    it('should have success status codes', () => {
      expect(HTTP_STATUS.OK).toBe(200);
      expect(HTTP_STATUS.CREATED).toBe(201);
      expect(HTTP_STATUS.NO_CONTENT).toBe(204);
    });

    it('should have client error status codes', () => {
      expect(HTTP_STATUS.BAD_REQUEST).toBe(400);
      expect(HTTP_STATUS.UNAUTHORIZED).toBe(401);
      expect(HTTP_STATUS.FORBIDDEN).toBe(403);
      expect(HTTP_STATUS.NOT_FOUND).toBe(404);
    });

    it('should have server error status codes', () => {
      expect(HTTP_STATUS.INTERNAL_SERVER_ERROR).toBe(500);
      expect(HTTP_STATUS.SERVICE_UNAVAILABLE).toBe(503);
    });
  });
});
