/**
 * Import Reconciliation Service
 *
 * Verifies that import operations completed successfully by comparing
 * expected row counts against actual database records.
 *
 * This service catches silent data loss and provides detailed reports
 * for debugging import issues.
 */

import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';

export interface ReconciliationReport {
  importBatchId: string;
  status: 'success' | 'warning' | 'failed';
  expectedRows: number;
  insertedRows: number;
  updatedRows: number;
  skippedRows: number;
  errorRows: number;
  missingRows: number; // expectedRows - (inserted + updated + skipped + errors)
  reconciliationTime: Date;
  details: {
    productsCreated: number;
    productsUpdated: number;
    transactionsCreated: number;
    orphansCreated: number;
  };
  warnings: string[];
  errors: string[];
}

export class ImportReconciliationService {
  /**
   * Run a post-import reconciliation check
   *
   * This should be called after an import completes to verify data integrity.
   */
  static async reconcileImport(importBatchId: string): Promise<ReconciliationReport> {
    const startTime = Date.now();

    // Get the import batch record
    const importBatch = await prisma.importBatch.findUnique({
      where: { id: importBatchId },
      select: {
        id: true,
        clientId: true,
        importType: true,
        rowCount: true,
        processedCount: true,
        errorCount: true,
        status: true,
        createdAt: true,
        completedAt: true,
      },
    });

    if (!importBatch) {
      throw new Error(`Import batch ${importBatchId} not found`);
    }

    const warnings: string[] = [];
    const errors: string[] = [];

    // Count actual records created by this import
    // Note: Products don't have importBatchId, so we use timestamps
    const importStartTime = importBatch.createdAt;
    const importEndTime = importBatch.completedAt || new Date();

    const [productsCreated, productsUpdated, transactionsCreated, orphansCreated] =
      await Promise.all([
        // Products created during this import window
        prisma.product.count({
          where: {
            clientId: importBatch.clientId,
            createdAt: {
              gte: importStartTime,
              lte: importEndTime,
            },
          },
        }),
        // Products updated during this import window (not created)
        prisma.product.count({
          where: {
            clientId: importBatch.clientId,
            createdAt: {
              lt: importStartTime, // Existed before import
            },
            updatedAt: {
              gte: importStartTime,
              lte: importEndTime,
            },
          },
        }),
        // Transactions created by this import (has importBatchId)
        prisma.transaction.count({
          where: {
            product: {
              clientId: importBatch.clientId,
            },
            importBatchId: importBatchId,
          },
        }),
        // Orphan products created during this import
        prisma.product.count({
          where: {
            clientId: importBatch.clientId,
            isOrphan: true,
            createdAt: {
              gte: importStartTime,
              lte: importEndTime,
            },
          },
        }),
      ]);

    // Calculate reconciliation
    const expectedRows = importBatch.rowCount || 0;
    const processedCount = importBatch.processedCount || 0;
    const errorCount = importBatch.errorCount || 0;

    // For inventory imports, products are the primary metric
    // For order imports, transactions are the primary metric
    const insertedRows =
      importBatch.importType === 'orders'
        ? transactionsCreated
        : productsCreated;

    const missingRows = expectedRows - processedCount;

    // Determine overall status
    let status: 'success' | 'warning' | 'failed' = 'success';

    if (missingRows > 0) {
      warnings.push(
        `${missingRows} rows from the file were not processed`
      );
      status = 'warning';
    }

    if (errorCount > 0) {
      warnings.push(`${errorCount} rows had errors during processing`);
      status = 'warning';
    }

    if (orphansCreated > 0) {
      warnings.push(
        `${orphansCreated} orphan products were created (no matching master record)`
      );
    }

    // Serious reconciliation failure
    if (insertedRows === 0 && expectedRows > 0 && errorCount === 0) {
      errors.push(
        'CRITICAL: No records were created despite no errors reported. Possible silent failure.'
      );
      status = 'failed';
    }

    // Large discrepancy
    const discrepancyPct = expectedRows > 0
      ? ((expectedRows - processedCount) / expectedRows) * 100
      : 0;
    if (discrepancyPct > 10) {
      warnings.push(
        `${discrepancyPct.toFixed(1)}% of rows were not processed - this is higher than expected`
      );
    }

    const report: ReconciliationReport = {
      importBatchId,
      status,
      expectedRows,
      insertedRows,
      updatedRows: productsUpdated,
      skippedRows: 0, // Would need to track this in import process
      errorRows: errorCount,
      missingRows,
      reconciliationTime: new Date(),
      details: {
        productsCreated,
        productsUpdated,
        transactionsCreated,
        orphansCreated,
      },
      warnings,
      errors,
    };

    // Log the reconciliation
    const duration = Date.now() - startTime;
    logger.info('Import reconciliation completed', {
      importBatchId,
      status: report.status,
      expectedRows: report.expectedRows,
      insertedRows: report.insertedRows,
      duration: `${duration}ms`,
    });

    // Save reconciliation report to import batch metadata
    await prisma.importBatch.update({
      where: { id: importBatchId },
      data: {
        metadata: {
          ...(importBatch as any).metadata,
          reconciliation: {
            status: report.status,
            expectedRows: report.expectedRows,
            insertedRows: report.insertedRows,
            errorRows: report.errorRows,
            warnings: report.warnings,
            errors: report.errors,
            checkedAt: report.reconciliationTime.toISOString(),
          },
        },
      },
    });

    return report;
  }

  /**
   * Get the last reconciliation report for an import batch
   */
  static async getReconciliationReport(
    importBatchId: string
  ): Promise<ReconciliationReport | null> {
    const importBatch = await prisma.importBatch.findUnique({
      where: { id: importBatchId },
      select: {
        metadata: true,
      },
    });

    if (!importBatch?.metadata) {
      return null;
    }

    const metadata = importBatch.metadata as Record<string, any>;
    if (!metadata.reconciliation) {
      return null;
    }

    return metadata.reconciliation as ReconciliationReport;
  }

  /**
   * Get reconciliation summary for all recent imports
   */
  static async getRecentReconciliationSummary(
    clientId?: string,
    limit = 10
  ): Promise<{
    successCount: number;
    warningCount: number;
    failedCount: number;
    recentReports: Array<{
      importBatchId: string;
      filename: string;
      status: string;
      expectedRows: number;
      insertedRows: number;
      createdAt: Date;
    }>;
  }> {
    const where = clientId ? { clientId } : {};

    const recentImports = await prisma.importBatch.findMany({
      where: {
        ...where,
        status: { in: ['completed', 'completed_with_errors', 'failed'] },
      },
      select: {
        id: true,
        filename: true,
        rowCount: true,
        processedCount: true,
        status: true,
        createdAt: true,
        metadata: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    let successCount = 0;
    let warningCount = 0;
    let failedCount = 0;

    const recentReports = recentImports.map((importBatch) => {
      const metadata = importBatch.metadata as Record<string, any> | null;
      const reconciliation = metadata?.reconciliation;

      let status = 'unknown';
      if (reconciliation) {
        status = reconciliation.status;
        if (status === 'success') successCount++;
        else if (status === 'warning') warningCount++;
        else if (status === 'failed') failedCount++;
      } else {
        // No reconciliation run yet
        status = importBatch.status === 'failed' ? 'failed' : 'pending';
        if (status === 'failed') failedCount++;
      }

      return {
        importBatchId: importBatch.id,
        filename: importBatch.filename,
        status,
        expectedRows: importBatch.rowCount || 0,
        insertedRows: reconciliation?.insertedRows || importBatch.processedCount || 0,
        createdAt: importBatch.createdAt,
      };
    });

    return {
      successCount,
      warningCount,
      failedCount,
      recentReports,
    };
  }
}
