import { describe, it, expect, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import type { AuthPayload } from '@inventory/shared';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
} from '../middleware/auth.js';

describe('Authentication', () => {
  const mockPayload: AuthPayload = {
    userId: 'test-user-id',
    email: 'test@example.com',
    role: 'admin',
  };

  describe('generateAccessToken', () => {
    it('should generate a valid JWT access token', () => {
      const token = generateAccessToken(mockPayload);

      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');

      // Verify token structure
      const decoded = jwt.decode(token) as jwt.JwtPayload;
      expect(decoded.userId).toBe(mockPayload.userId);
      expect(decoded.email).toBe(mockPayload.email);
      expect(decoded.role).toBe(mockPayload.role);
    });

    it('should set expiration time on access token', () => {
      const token = generateAccessToken(mockPayload);
      const decoded = jwt.decode(token) as jwt.JwtPayload;

      expect(decoded.exp).toBeDefined();
      expect(decoded.iat).toBeDefined();
      expect(decoded.exp!).toBeGreaterThan(decoded.iat!);
    });

    it('should include all payload fields', () => {
      const token = generateAccessToken(mockPayload);
      const decoded = jwt.decode(token) as AuthPayload;

      expect(decoded.userId).toBe(mockPayload.userId);
      expect(decoded.email).toBe(mockPayload.email);
      expect(decoded.role).toBe(mockPayload.role);
    });
  });

  describe('generateRefreshToken', () => {
    it('should generate a valid JWT refresh token', () => {
      const token = generateRefreshToken(mockPayload);

      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
    });

    it('should have longer expiration than access token', () => {
      const accessToken = generateAccessToken(mockPayload);
      const refreshToken = generateRefreshToken(mockPayload);

      const accessDecoded = jwt.decode(accessToken) as jwt.JwtPayload;
      const refreshDecoded = jwt.decode(refreshToken) as jwt.JwtPayload;

      // Refresh token should expire later than access token
      expect(refreshDecoded.exp!).toBeGreaterThan(accessDecoded.exp!);
    });
  });

  describe('verifyToken', () => {
    it('should verify a valid token', () => {
      const token = generateAccessToken(mockPayload);
      const decoded = verifyToken(token);

      expect(decoded.userId).toBe(mockPayload.userId);
      expect(decoded.email).toBe(mockPayload.email);
      expect(decoded.role).toBe(mockPayload.role);
    });

    it('should throw error for invalid token', () => {
      const invalidToken = 'invalid.token.here';

      expect(() => verifyToken(invalidToken)).toThrow();
    });

    it('should throw error for tampered token', () => {
      const token = generateAccessToken(mockPayload);
      const tamperedToken = token.slice(0, -5) + 'xxxxx';

      expect(() => verifyToken(tamperedToken)).toThrow();
    });

    it('should throw error for expired token', () => {
      // Generate a token that expires immediately
      const expiredToken = jwt.sign(
        mockPayload,
        process.env.JWT_SECRET!,
        { expiresIn: '0s' }
      );

      // Wait a tiny bit to ensure it's expired
      setTimeout(() => {
        expect(() => verifyToken(expiredToken)).toThrow();
      }, 100);
    });
  });

  describe('JWT Secret Security', () => {
    it('should require JWT_SECRET to be set', () => {
      expect(process.env.JWT_SECRET).toBeDefined();
      expect(process.env.JWT_SECRET!.length).toBeGreaterThanOrEqual(32);
    });

    it('should not accept tokens signed with different secret', () => {
      const differentSecret = 'different-secret-key-for-testing-purposes';
      const tokenWithDifferentSecret = jwt.sign(
        mockPayload,
        differentSecret,
        { expiresIn: '15m' }
      );

      expect(() => verifyToken(tokenWithDifferentSecret)).toThrow();
    });
  });

  describe('Token Payload Validation', () => {
    it('should preserve userId in token', () => {
      const payload: AuthPayload = {
        userId: '123e4567-e89b-12d3-a456-426614174000',
        email: 'user@example.com',
        role: 'account_manager',
      };

      const token = generateAccessToken(payload);
      const decoded = verifyToken(token);

      expect(decoded.userId).toBe(payload.userId);
    });

    it('should preserve email in token', () => {
      const payload: AuthPayload = {
        userId: 'test-id',
        email: 'test@inventory.com',
        role: 'account_manager',
      };

      const token = generateAccessToken(payload);
      const decoded = verifyToken(token);

      expect(decoded.email).toBe(payload.email);
    });

    it('should preserve role in token', () => {
      const roles: Array<AuthPayload['role']> = [
        'admin',
        'operations_manager',
        'account_manager',
      ];

      roles.forEach((role) => {
        const payload: AuthPayload = {
          userId: 'test-id',
          email: 'test@example.com',
          role,
        };

        const token = generateAccessToken(payload);
        const decoded = verifyToken(token);

        expect(decoded.role).toBe(role);
      });
    });
  });
});
