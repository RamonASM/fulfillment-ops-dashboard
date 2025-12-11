// =============================================================================
// PORTAL EXPORTS ROUTES (Phase 11)
// PDF/Excel/CSV export endpoints for portal users
// =============================================================================

import { Router, Request, Response } from 'express';
import { portalAuth } from '../../middleware/portal-auth.js';
import { logger } from '../../lib/logger.js';
import { generateInventoryStatusPDF, generateAlertReportPDF } from '../../services/reports/pdf.service.js';
import { generateInventoryExcel, generateAlertsExcel } from '../../services/reports/excel.service.js';

const router = Router();

// All routes require portal authentication
router.use(portalAuth);

/**
 * GET /api/portal/exports/pdf/inventory-snapshot
 * Generate PDF inventory snapshot for portal user's client
 */
router.get('/pdf/inventory-snapshot', async (req: Request, res: Response) => {
  try {
    const { clientId } = (req as any).portalUser;

    const pdfBuffer = await generateInventoryStatusPDF(clientId);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="inventory-snapshot-${Date.now()}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    logger.error('Error generating PDF', error as Error);
    res.status(500).json({ error: 'Failed to generate PDF report' });
  }
});

/**
 * GET /api/portal/exports/excel/inventory-snapshot
 * Generate Excel inventory snapshot for portal user's client
 */
router.get('/excel/inventory-snapshot', async (req: Request, res: Response) => {
  try {
    const { clientId } = (req as any).portalUser;

    const excelBuffer = await generateInventoryExcel(clientId);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="inventory-snapshot-${Date.now()}.xlsx"`);
    res.send(excelBuffer);
  } catch (error) {
    logger.error('Error generating Excel', error as Error);
    res.status(500).json({ error: 'Failed to generate Excel report' });
  }
});

/**
 * GET /api/portal/exports/csv/inventory-snapshot
 * Generate CSV inventory snapshot for portal user's client
 */
router.get('/csv/inventory-snapshot', async (req: Request, res: Response) => {
  try {
    const { clientId } = (req as any).portalUser;
    const { prisma } = await import('../../lib/prisma.js');

    const products = await prisma.product.findMany({
      where: { clientId, isActive: true },
      orderBy: { stockStatus: 'asc' },
    });

    // Generate CSV
    const headers = [
      'Product ID',
      'Name',
      'Type',
      'Pack Size',
      'Current Stock (Packs)',
      'Current Stock (Units)',
      'Reorder Point',
      'Status',
      'Weeks Remaining',
      'Avg Daily Usage',
    ];

    const rows = products.map((p) => [
      p.productId,
      `"${p.name.replace(/"/g, '""')}"`,
      p.itemType,
      p.packSize,
      p.currentStockPacks,
      p.currentStockUnits,
      p.reorderPointPacks || '',
      p.stockStatus || '',
      p.weeksRemaining || '',
      p.avgDailyUsage?.toFixed(2) || '',
    ]);

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="inventory-snapshot-${Date.now()}.csv"`);
    res.send(csv);
  } catch (error) {
    logger.error('Error generating CSV', error as Error);
    res.status(500).json({ error: 'Failed to generate CSV report' });
  }
});

/**
 * GET /api/portal/exports/pdf/usage-trends
 * Generate PDF usage trends report
 */
router.get('/pdf/usage-trends', async (req: Request, res: Response) => {
  try {
    const { clientId } = (req as any).portalUser;

    // Reuse the inventory PDF for now (can be enhanced later)
    const pdfBuffer = await generateInventoryStatusPDF(clientId);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="usage-trends-${Date.now()}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    logger.error('Error generating PDF', error as Error);
    res.status(500).json({ error: 'Failed to generate PDF report' });
  }
});

/**
 * GET /api/portal/exports/excel/usage-trends
 * Generate Excel usage trends report
 */
router.get('/excel/usage-trends', async (req: Request, res: Response) => {
  try {
    const { clientId } = (req as any).portalUser;

    // Reuse the inventory Excel for now (can be enhanced later)
    const excelBuffer = await generateInventoryExcel(clientId);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="usage-trends-${Date.now()}.xlsx"`);
    res.send(excelBuffer);
  } catch (error) {
    logger.error('Error generating Excel', error as Error);
    res.status(500).json({ error: 'Failed to generate Excel report' });
  }
});

/**
 * GET /api/portal/exports/pdf/order-history
 * Generate PDF order history report
 */
router.get('/pdf/order-history', async (req: Request, res: Response) => {
  try {
    const { clientId } = (req as any).portalUser;
    const { generateOrderHistoryPDF } = await import('../../services/reports/pdf.service.js');

    const pdfBuffer = await generateOrderHistoryPDF(clientId);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="order-history-${Date.now()}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    logger.error('Error generating PDF', error as Error);
    res.status(500).json({ error: 'Failed to generate PDF report' });
  }
});

/**
 * GET /api/portal/exports/excel/order-history
 * Generate Excel order history report
 */
router.get('/excel/order-history', async (req: Request, res: Response) => {
  try {
    const { clientId } = (req as any).portalUser;

    // Reuse the inventory Excel for now (can be enhanced later)
    const excelBuffer = await generateInventoryExcel(clientId);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="order-history-${Date.now()}.xlsx"`);
    res.send(excelBuffer);
  } catch (error) {
    logger.error('Error generating Excel', error as Error);
    res.status(500).json({ error: 'Failed to generate Excel report' });
  }
});

/**
 * GET /api/portal/exports/csv/order-history
 * Generate CSV order history report
 */
router.get('/csv/order-history', async (req: Request, res: Response) => {
  try {
    const { clientId } = (req as any).portalUser;
    const { prisma } = await import('../../lib/prisma.js');

    const orders = await prisma.orderRequest.findMany({
      where: { clientId },
      include: {
        requestedBy: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Generate CSV
    const headers = [
      'Order ID',
      'Status',
      'Requested By',
      'Items Count',
      'Notes',
      'Created At',
    ];

    const rows = orders.map((o) => {
      const items = o.items as any[];
      return [
        o.id,
        o.status,
        o.requestedBy.name,
        items?.length || 0,
        `"${(o.notes || '').replace(/"/g, '""')}"`,
        o.createdAt.toISOString(),
      ];
    });

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="order-history-${Date.now()}.csv"`);
    res.send(csv);
  } catch (error) {
    logger.error('Error generating CSV', error as Error);
    res.status(500).json({ error: 'Failed to generate CSV report' });
  }
});

export default router;
