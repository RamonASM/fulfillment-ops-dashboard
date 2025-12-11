import { Router, Request, Response } from 'express';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { portalAuth } from '../../middleware/portal-auth.js';
import bcrypt from 'bcryptjs';

const router = Router();

// Update notification preferences
router.patch('/notifications', portalAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.portalUser!.id;
    const { emailAlerts, lowStockAlerts, orderUpdates, weeklyDigest } = req.body;

    await prisma.portalUser.update({
      where: { id: userId },
      data: {
        notificationPreferences: {
          emailAlerts: Boolean(emailAlerts),
          lowStockAlerts: Boolean(lowStockAlerts),
          orderUpdates: Boolean(orderUpdates),
          weeklyDigest: Boolean(weeklyDigest),
        },
      },
    });

    res.json({ message: 'Preferences updated successfully' });
  } catch (error) {
    logger.error('Portal update notifications error', error as Error);
    res.status(500).json({ message: 'Failed to update preferences' });
  }
});

// Change password
router.post('/password', portalAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.portalUser!.id;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current and new passwords are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }

    const user = await prisma.portalUser.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    const newHash = await bcrypt.hash(newPassword, 12);

    await prisma.portalUser.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    });

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    logger.error('Portal change password error', error as Error);
    res.status(500).json({ message: 'Failed to change password' });
  }
});

export default router;
