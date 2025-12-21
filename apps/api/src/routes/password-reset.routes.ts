/**
 * Password Reset Routes
 *
 * Handles forgot password / reset password flow for both admin and portal users.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { sendPasswordResetEmail } from '../services/email.service.js';

const router = Router();

// Validation schemas
const requestResetSchema = z.object({
  email: z.string().email('Invalid email address'),
  userType: z.enum(['admin', 'portal']),
});

const verifyTokenSchema = z.object({
  token: z.string().min(1, 'Token is required'),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

// Token expiration time (1 hour)
const TOKEN_EXPIRATION_HOURS = 1;

/**
 * Request a password reset
 * POST /api/auth/forgot-password
 */
router.post('/forgot-password', async (req: Request, res: Response) => {
  try {
    const { email, userType } = requestResetSchema.parse(req.body);

    // Check if user exists based on type
    let userExists = false;
    if (userType === 'admin') {
      const user = await prisma.user.findUnique({ where: { email } });
      userExists = !!user && user.isActive;
    } else {
      const user = await prisma.portalUser.findUnique({ where: { email } });
      userExists = !!user && user.isActive;
    }

    // Always return success to prevent email enumeration
    if (!userExists) {
      logger.info(`Password reset requested for non-existent email: ${email}`);
      return res.json({
        message: 'If an account exists with this email, a reset link has been sent.',
        // In dev/demo mode, indicate no email was sent
        debug: process.env.NODE_ENV !== 'production' ? 'User not found' : undefined,
      });
    }

    // Generate secure token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRATION_HOURS * 60 * 60 * 1000);

    // Delete any existing tokens for this email
    await prisma.passwordResetToken.deleteMany({
      where: { email, userType },
    });

    // Create new token
    await prisma.passwordResetToken.create({
      data: {
        token,
        email,
        userType,
        expiresAt,
      },
    });

    // Build reset URL based on user type
    const baseUrl = userType === 'admin'
      ? process.env.ADMIN_APP_URL || 'https://admin.yourtechassist.us'
      : process.env.PORTAL_APP_URL || 'https://portal.yourtechassist.us';
    const resetUrl = `${baseUrl}/reset-password?token=${token}`;

    // Send password reset email
    try {
      await sendPasswordResetEmail(email, resetUrl, userType);
      logger.info(`Password reset email sent to ${email}`, { userType });
    } catch (emailError) {
      // Log error but don't expose to user (security: prevent email enumeration)
      logger.error('Failed to send password reset email', emailError as Error, { email });
    }

    // In development/demo mode, return the token directly for testing
    const isDev = process.env.NODE_ENV !== 'production';

    res.json({
      message: 'If an account exists with this email, a reset link has been sent.',
      // Only include these in non-production for testing
      ...(isDev && {
        debug: {
          token,
          resetUrl,
          expiresAt: expiresAt.toISOString(),
        },
      }),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.errors[0].message });
    }
    logger.error('Forgot password error', error as Error);
    res.status(500).json({ message: 'Failed to process request' });
  }
});

/**
 * Verify a reset token is valid
 * POST /api/auth/verify-reset-token
 */
router.post('/verify-reset-token', async (req: Request, res: Response) => {
  try {
    const { token } = verifyTokenSchema.parse(req.body);

    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token },
    });

    if (!resetToken) {
      return res.status(400).json({
        valid: false,
        message: 'Invalid or expired reset link'
      });
    }

    if (resetToken.usedAt) {
      return res.status(400).json({
        valid: false,
        message: 'This reset link has already been used'
      });
    }

    if (new Date() > resetToken.expiresAt) {
      return res.status(400).json({
        valid: false,
        message: 'This reset link has expired'
      });
    }

    res.json({
      valid: true,
      email: resetToken.email,
      userType: resetToken.userType,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.errors[0].message });
    }
    logger.error('Verify reset token error', error as Error);
    res.status(500).json({ message: 'Failed to verify token' });
  }
});

/**
 * Reset password with token
 * POST /api/auth/reset-password
 */
router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { token, password } = resetPasswordSchema.parse(req.body);

    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token },
    });

    if (!resetToken) {
      return res.status(400).json({ message: 'Invalid or expired reset link' });
    }

    if (resetToken.usedAt) {
      return res.status(400).json({ message: 'This reset link has already been used' });
    }

    if (new Date() > resetToken.expiresAt) {
      return res.status(400).json({ message: 'This reset link has expired' });
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(password, 12);

    // Update password based on user type
    if (resetToken.userType === 'admin') {
      await prisma.user.update({
        where: { email: resetToken.email },
        data: { passwordHash },
      });
    } else {
      await prisma.portalUser.update({
        where: { email: resetToken.email },
        data: { passwordHash },
      });
    }

    // Mark token as used
    await prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() },
    });

    logger.info(`Password reset completed for ${resetToken.email} (${resetToken.userType})`);

    res.json({ message: 'Password has been reset successfully' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.errors[0].message });
    }
    logger.error('Reset password error', error as Error);
    res.status(500).json({ message: 'Failed to reset password' });
  }
});

export default router;
