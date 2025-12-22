import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import { logger } from '../lib/logger.js';
import {
  generateInventoryStatusPDF,
  generateAlertReportPDF,
  generateOrderHistoryPDF,
} from '../services/reports/pdf.service.js';
import {
  generateInventoryExcel,
  generateTransactionsExcel,
  generateAlertsExcel,
  generateInventoryCSV,
} from '../services/reports/excel.service.js';
import { logReportGeneration } from '../services/audit.service.js';

const router = Router();

// =============================================================================
// PDF EXPORTS
// =============================================================================

/**
 * GET /api/exports/pdf/inventory/:clientId
 * Generate inventory status PDF report
 */
router.get('/pdf/inventory/:clientId', authenticate, async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;
    const { title } = req.query;

    const pdf = await generateInventoryStatusPDF(clientId, {
      title: title as string,
    });

    await logReportGeneration(req.user?.userId || 'anonymous', clientId, 'inventory', 'pdf');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=inventory-status-${clientId}.pdf`);
    res.send(pdf);
  } catch (error) {
    logger.error('Export PDF inventory error', error as Error);
    res.status(500).json({ error: (error as Error).message || 'Failed to generate PDF' });
  }
});

/**
 * GET /api/exports/pdf/alerts/:clientId
 * Generate alerts PDF report
 */
router.get('/pdf/alerts/:clientId', authenticate, async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;
    const { title, startDate, endDate } = req.query;

    const pdf = await generateAlertReportPDF(clientId, {
      title: title as string,
      dateRange: startDate && endDate ? {
        start: new Date(startDate as string),
        end: new Date(endDate as string),
      } : undefined,
    });

    await logReportGeneration(req.user?.userId || 'anonymous', clientId, 'alerts', 'pdf');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=alerts-report-${clientId}.pdf`);
    res.send(pdf);
  } catch (error) {
    logger.error('Export PDF alerts error', error as Error);
    res.status(500).json({ error: (error as Error).message || 'Failed to generate PDF' });
  }
});

/**
 * GET /api/exports/pdf/orders/:clientId
 * Generate order history PDF report
 */
router.get('/pdf/orders/:clientId', authenticate, async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;
    const { title } = req.query;

    const pdf = await generateOrderHistoryPDF(clientId, {
      title: title as string,
    });

    await logReportGeneration(req.user?.userId || 'anonymous', clientId, 'orders', 'pdf');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=order-history-${clientId}.pdf`);
    res.send(pdf);
  } catch (error) {
    logger.error('Export PDF orders error', error as Error);
    res.status(500).json({ error: (error as Error).message || 'Failed to generate PDF' });
  }
});

// =============================================================================
// EXCEL EXPORTS
// =============================================================================

/**
 * GET /api/exports/excel/inventory/:clientId
 * Generate inventory Excel export
 */
router.get('/excel/inventory/:clientId', authenticate, async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;
    const { includeHistory } = req.query;

    const excel = await generateInventoryExcel(clientId, {
      includeHistory: includeHistory === 'true',
    });

    await logReportGeneration(req.user?.userId || 'anonymous', clientId, 'inventory', 'excel');

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=inventory-${clientId}.xlsx`);
    res.send(excel);
  } catch (error) {
    logger.error('Export Excel inventory error', error as Error);
    res.status(500).json({ error: (error as Error).message || 'Failed to generate Excel' });
  }
});

/**
 * GET /api/exports/excel/transactions/:clientId
 * Generate transactions Excel export
 */
router.get('/excel/transactions/:clientId', authenticate, async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;
    const { startDate, endDate } = req.query;

    const excel = await generateTransactionsExcel(clientId, {
      dateRange: startDate && endDate ? {
        start: new Date(startDate as string),
        end: new Date(endDate as string),
      } : undefined,
    });

    await logReportGeneration(req.user?.userId || 'anonymous', clientId, 'transactions', 'excel');

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=transactions-${clientId}.xlsx`);
    res.send(excel);
  } catch (error) {
    logger.error('Export Excel transactions error', error as Error);
    res.status(500).json({ error: (error as Error).message || 'Failed to generate Excel' });
  }
});

/**
 * GET /api/exports/excel/alerts/:clientId
 * Generate alerts Excel export
 */
router.get('/excel/alerts/:clientId', authenticate, async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;
    const { startDate, endDate } = req.query;

    const excel = await generateAlertsExcel(clientId, {
      dateRange: startDate && endDate ? {
        start: new Date(startDate as string),
        end: new Date(endDate as string),
      } : undefined,
    });

    await logReportGeneration(req.user?.userId || 'anonymous', clientId, 'alerts', 'excel');

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=alerts-${clientId}.xlsx`);
    res.send(excel);
  } catch (error) {
    logger.error('Export Excel alerts error', error as Error);
    res.status(500).json({ error: (error as Error).message || 'Failed to generate Excel' });
  }
});

// =============================================================================
// CSV EXPORTS
// =============================================================================

/**
 * GET /api/exports/csv/inventory/:clientId
 * Generate inventory CSV export
 */
router.get('/csv/inventory/:clientId', authenticate, async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;

    const csv = await generateInventoryCSV(clientId);

    await logReportGeneration(req.user?.userId || 'anonymous', clientId, 'inventory', 'csv');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=inventory-${clientId}.csv`);
    res.send(csv);
  } catch (error) {
    logger.error('Export CSV error', error as Error);
    res.status(500).json({ error: (error as Error).message || 'Failed to generate CSV' });
  }
});

export default router;
