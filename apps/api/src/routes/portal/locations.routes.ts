import { Router, Request, Response } from 'express';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { portalAuth } from '../../middleware/portal-auth.js';

const router = Router();

/**
 * GET /api/portal/locations
 * Get all locations for the authenticated user's client
 */
router.get('/', portalAuth, async (req: Request, res: Response) => {
  try {
    const clientId = req.portalUser!.clientId;

    const locations = await prisma.location.findMany({
      where: {
        clientId,
        isActive: true,
      },
      orderBy: [
        { locationType: 'asc' },
        { name: 'asc' },
      ],
      select: {
        id: true,
        name: true,
        code: true,
        address: true,
        city: true,
        state: true,
        zipCode: true,
        locationType: true,
        isActive: true,
      },
    });

    res.json({ data: locations });
  } catch (error) {
    logger.error('Error fetching locations', error as Error);
    res.status(500).json({ message: 'Failed to fetch locations' });
  }
});

/**
 * GET /api/portal/locations/:locationId
 * Get a specific location by ID
 */
router.get('/:locationId', portalAuth, async (req: Request, res: Response) => {
  try {
    const clientId = req.portalUser!.clientId;
    const { locationId } = req.params;

    const location = await prisma.location.findFirst({
      where: {
        id: locationId,
        clientId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        code: true,
        address: true,
        city: true,
        state: true,
        zipCode: true,
        contactName: true,
        contactEmail: true,
        contactPhone: true,
        locationType: true,
      },
    });

    if (!location) {
      return res.status(404).json({ message: 'Location not found' });
    }

    res.json(location);
  } catch (error) {
    logger.error('Error fetching location', error as Error);
    res.status(500).json({ message: 'Failed to fetch location' });
  }
});

export default router;
