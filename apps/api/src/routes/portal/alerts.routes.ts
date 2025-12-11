import { Router, Request, Response } from 'express';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { portalAuth } from '../../middleware/portal-auth.js';

const router = Router();

// Get client's alerts
router.get('/', portalAuth, async (req: Request, res: Response) => {
  try {
    const clientId = req.portalUser!.clientId;

    const alerts = await prisma.alert.findMany({
      where: {
        clientId,
        // Only show alerts relevant to client portal
        alertType: {
          in: ['stockout', 'critical_stock', 'low_stock', 'reorder_due'],
        },
      },
      orderBy: [
        { status: 'asc' }, // Active first
        { severity: 'asc' }, // Critical first
        { createdAt: 'desc' },
      ],
      include: {
        product: {
          select: {
            id: true,
            productId: true,
            name: true,
          },
        },
      },
    });

    const unreadCount = alerts.filter(a => a.status === 'active').length;

    const formattedAlerts = alerts.map(alert => ({
      id: alert.id,
      alertType: alert.alertType,
      severity: alert.severity,
      title: alert.title,
      message: alert.message,
      productId: alert.product?.productId,
      productName: alert.product?.name,
      isRead: alert.status !== 'active',
      createdAt: alert.createdAt,
    }));

    res.json({
      data: formattedAlerts,
      meta: {
        total: alerts.length,
        unreadCount,
      },
    });
  } catch (error) {
    logger.error('Portal alerts error', error as Error);
    res.status(500).json({ message: 'Failed to load alerts' });
  }
});

// Mark alert as read
router.patch('/:id/read', portalAuth, async (req: Request, res: Response) => {
  try {
    const clientId = req.portalUser!.clientId;
    const { id } = req.params;

    const alert = await prisma.alert.findFirst({
      where: { id, clientId },
    });

    if (!alert) {
      return res.status(404).json({ message: 'Alert not found' });
    }

    await prisma.alert.update({
      where: { id },
      data: { status: 'read' },
    });

    res.json({ message: 'Alert marked as read' });
  } catch (error) {
    logger.error('Portal mark alert read error', error as Error);
    res.status(500).json({ message: 'Failed to update alert' });
  }
});

// Mark all alerts as read
router.post('/read-all', portalAuth, async (req: Request, res: Response) => {
  try {
    const clientId = req.portalUser!.clientId;

    await prisma.alert.updateMany({
      where: {
        clientId,
        status: 'active',
      },
      data: { status: 'read' },
    });

    res.json({ message: 'All alerts marked as read' });
  } catch (error) {
    logger.error('Portal mark all read error', error as Error);
    res.status(500).json({ message: 'Failed to update alerts' });
  }
});

export default router;
