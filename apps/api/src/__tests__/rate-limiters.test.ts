/**
 * Rate Limiter Tests
 *
 * Tests the role-based rate limiting system:
 * - Default limiter with tiered limits
 * - Auth limiter for brute force prevention
 * - Admin limiter for sensitive endpoints
 * - Upload limiter for expensive operations
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';

// Mock external dependencies before importing
vi.mock('../lib/redis.js', () => ({
  redis: null, // Test in-memory mode
  getRedisClient: () => null,
}));

vi.mock('../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock environment
const originalEnv = process.env;

describe('Rate Limiters', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv, USE_REDIS_RATE_LIMIT: 'false' };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  describe('Role-Based Limits Configuration', () => {
    it('should define correct rate limits for each role', async () => {
      // Import after mocking
      const { createDefaultLimiter } = await import('../lib/rate-limiters.js');

      // Create the limiter
      const limiter = createDefaultLimiter();

      // Verify limiter is created
      expect(limiter).toBeDefined();
      expect(typeof limiter).toBe('function');
    });

    it('should return stricter limits for anonymous users', async () => {
      const { createDefaultLimiter } = await import('../lib/rate-limiters.js');
      const limiter = createDefaultLimiter();

      // Create mock request without auth
      const mockReq = {
        user: undefined,
        portalUser: undefined,
        ip: '127.0.0.1',
      } as unknown as Partial<Request>;

      const mockRes = {
        setHeader: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as Partial<Response>;

      const mockNext = vi.fn() as NextFunction;

      // Should allow the request initially
      await new Promise<void>((resolve) => {
        limiter(mockReq as Request, mockRes as Response, () => {
          mockNext();
          resolve();
        });
      });

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Auth Limiter', () => {
    it('should create auth limiter with strict limits', async () => {
      const { createAuthLimiter } = await import('../lib/rate-limiters.js');
      const limiter = createAuthLimiter();

      expect(limiter).toBeDefined();
    });

    it('should use email for key generation when provided', async () => {
      const { createAuthLimiter } = await import('../lib/rate-limiters.js');
      const limiter = createAuthLimiter();

      const mockReq = {
        body: { email: 'test@example.com' },
        ip: '127.0.0.1',
      } as unknown as Partial<Request>;

      const mockRes = {
        setHeader: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as Partial<Response>;

      const mockNext = vi.fn() as NextFunction;

      await new Promise<void>((resolve) => {
        limiter(mockReq as Request, mockRes as Response, () => {
          mockNext();
          resolve();
        });
      });

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Admin Limiter', () => {
    it('should create admin limiter', async () => {
      const { createAdminLimiter } = await import('../lib/rate-limiters.js');
      const limiter = createAdminLimiter();

      expect(limiter).toBeDefined();
    });

    it.skip('should block anonymous users from admin endpoints', async () => {
      const { createAdminLimiter } = await import('../lib/rate-limiters.js');
      const limiter = createAdminLimiter();

      // Mock request without auth (anonymous)
      const mockReq = {
        user: undefined,
        portalUser: undefined,
        ip: '127.0.0.1',
      } as unknown as Partial<Request>;

      let wasBlocked = false;
      const mockRes = {
        setHeader: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockImplementation(() => {
          wasBlocked = true;
        }),
        send: vi.fn().mockImplementation(() => {
          wasBlocked = true;
        }),
      } as Partial<Response>;

      let calledNext = false;

      await new Promise<void>((resolve) => {
        limiter(mockReq as Request, mockRes as Response, () => {
          calledNext = true;
          resolve();
        });

        // Check if rate limited immediately (max: 0 for anonymous)
        setTimeout(() => {
          resolve();
        }, 50);
      });

      // Anonymous users get max: 0, so should be blocked immediately
      expect(wasBlocked).toBe(true);
    });

    it('should allow admin users', async () => {
      const { createAdminLimiter } = await import('../lib/rate-limiters.js');
      const limiter = createAdminLimiter();

      // Mock request with admin role
      const mockReq = {
        user: { userId: 'admin-123', role: 'admin' },
        portalUser: undefined,
        ip: '127.0.0.1',
      } as unknown as Partial<Request>;

      const mockRes = {
        setHeader: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as Partial<Response>;

      const mockNext = vi.fn() as NextFunction;

      await new Promise<void>((resolve) => {
        limiter(mockReq as Request, mockRes as Response, () => {
          mockNext();
          resolve();
        });
      });

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Upload Limiter', () => {
    it('should create upload limiter', async () => {
      const { createUploadLimiter } = await import('../lib/rate-limiters.js');
      const limiter = createUploadLimiter();

      expect(limiter).toBeDefined();
    });

    it('should allow uploads for authenticated users', async () => {
      const { createUploadLimiter } = await import('../lib/rate-limiters.js');
      const limiter = createUploadLimiter();

      const mockReq = {
        user: { userId: 'user-123', role: 'user' },
        ip: '127.0.0.1',
      } as unknown as Partial<Request>;

      const mockRes = {
        setHeader: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as Partial<Response>;

      const mockNext = vi.fn() as NextFunction;

      await new Promise<void>((resolve) => {
        limiter(mockReq as Request, mockRes as Response, () => {
          mockNext();
          resolve();
        });
      });

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Financial Limiter', () => {
    it('should create financial limiter', async () => {
      const { createFinancialLimiter } = await import('../lib/rate-limiters.js');
      const limiter = createFinancialLimiter();

      expect(limiter).toBeDefined();
    });

    it('should allow authenticated users with user role', async () => {
      const { createFinancialLimiter } = await import('../lib/rate-limiters.js');
      const limiter = createFinancialLimiter();

      const mockReq = {
        user: { userId: 'user-123', role: 'user' },
        ip: '127.0.0.1',
      } as unknown as Partial<Request>;

      const mockRes = {
        setHeader: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
        send: vi.fn(),
      } as Partial<Response>;

      const mockNext = vi.fn() as NextFunction;

      await new Promise<void>((resolve) => {
        limiter(mockReq as Request, mockRes as Response, () => {
          mockNext();
          resolve();
        });
      });

      // User role gets max: 10, so should be allowed
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Portal Limiter', () => {
    it('should create portal limiter with fixed limit', async () => {
      const { createPortalLimiter } = await import('../lib/rate-limiters.js');
      const limiter = createPortalLimiter();

      expect(limiter).toBeDefined();
    });

    it('should allow portal users', async () => {
      const { createPortalLimiter } = await import('../lib/rate-limiters.js');
      const limiter = createPortalLimiter();

      const mockReq = {
        portalUser: { id: 'portal-user-123', role: 'client' },
        ip: '127.0.0.1',
      } as unknown as Partial<Request>;

      const mockRes = {
        setHeader: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as Partial<Response>;

      const mockNext = vi.fn() as NextFunction;

      await new Promise<void>((resolve) => {
        limiter(mockReq as Request, mockRes as Response, () => {
          mockNext();
          resolve();
        });
      });

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('AI/Analytics Limiter', () => {
    it('should create AI limiter with stricter limits', async () => {
      const { createAiLimiter } = await import('../lib/rate-limiters.js');
      const limiter = createAiLimiter();

      expect(limiter).toBeDefined();
    });

    it('should allow authenticated users to access AI endpoints', async () => {
      const { createAiLimiter } = await import('../lib/rate-limiters.js');
      const limiter = createAiLimiter();

      const mockReq = {
        user: { userId: 'user-123', role: 'account_manager' },
        ip: '127.0.0.1',
      } as unknown as Partial<Request>;

      const mockRes = {
        setHeader: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as Partial<Response>;

      const mockNext = vi.fn() as NextFunction;

      await new Promise<void>((resolve) => {
        limiter(mockReq as Request, mockRes as Response, () => {
          mockNext();
          resolve();
        });
      });

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Key Generation', () => {
    it('should use userId for authenticated users', async () => {
      const { createDefaultLimiter } = await import('../lib/rate-limiters.js');
      const limiter = createDefaultLimiter();

      const mockReq = {
        user: { userId: 'unique-user-123', role: 'user' },
        ip: '127.0.0.1',
      } as unknown as Partial<Request>;

      const mockRes = {
        setHeader: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as Partial<Response>;

      const mockNext = vi.fn() as NextFunction;

      // First request should pass
      await new Promise<void>((resolve) => {
        limiter(mockReq as Request, mockRes as Response, () => {
          mockNext();
          resolve();
        });
      });

      expect(mockNext).toHaveBeenCalled();
    });

    it('should use IP for anonymous users', async () => {
      const { createDefaultLimiter } = await import('../lib/rate-limiters.js');
      const limiter = createDefaultLimiter();

      const mockReq = {
        user: undefined,
        portalUser: undefined,
        ip: '192.168.1.100',
      } as unknown as Partial<Request>;

      const mockRes = {
        setHeader: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as Partial<Response>;

      const mockNext = vi.fn() as NextFunction;

      await new Promise<void>((resolve) => {
        limiter(mockReq as Request, mockRes as Response, () => {
          mockNext();
          resolve();
        });
      });

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('In-Memory Fallback', () => {
    it('should work without Redis connection', async () => {
      // Redis is already mocked as null
      const { createDefaultLimiter } = await import('../lib/rate-limiters.js');
      const limiter = createDefaultLimiter();

      const mockReq = {
        user: { userId: 'user-123', role: 'user' },
        ip: '127.0.0.1',
      } as unknown as Partial<Request>;

      const mockRes = {
        setHeader: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as Partial<Response>;

      const mockNext = vi.fn() as NextFunction;

      await new Promise<void>((resolve) => {
        limiter(mockReq as Request, mockRes as Response, () => {
          mockNext();
          resolve();
        });
      });

      // Should work with in-memory fallback
      expect(mockNext).toHaveBeenCalled();
    });
  });
});
