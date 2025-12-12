import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { prisma } from '../lib/prisma.js';
import { authenticate, requireClientAccess } from '../middleware/auth.js';
import { NotFoundError, ValidationError } from '../middleware/error-handler.js';
import {
  parseFile,
  detectFileType,
  generateColumnMapping,
  processImport,
  validateImportData,
} from '../services/import.service.js';
import { recalculateClientUsage } from '../services/usage.service.js';
import { runAlertGeneration } from '../services/alert.service.js';
import { analyzeImportImpact, generateImportDiff } from '../services/import-analysis.service.js';

const router = Router();

// Ensure uploads directory exists
const uploadsDir = './uploads';
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
    fieldSize: 50 * 1024 * 1024, // 50MB field size limit
  },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/tab-separated-values',
      'application/octet-stream', // Some systems send files with generic type
    ];
    const allowedExtensions = ['.csv', '.xlsx', '.xls', '.tsv'];

    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only CSV, XLSX, XLS, and TSV files are allowed.'));
    }
  },
});

// Multer error handler middleware
const handleMulterError = (err: any, req: any, res: any, next: any) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: 'File too large',
        message: 'File size exceeds the 50MB limit. Please upload a smaller file.',
        maxSize: '50MB',
      });
    }
    return res.status(400).json({
      error: 'Upload error',
      message: err.message,
    });
  } else if (err) {
    return res.status(400).json({
      error: 'Upload error',
      message: err.message || 'An error occurred during file upload',
    });
  }
  next();
};

// Apply authentication
router.use(authenticate);

// =============================================================================
// ROUTES
// =============================================================================

/**
 * POST /api/imports/upload
 * Upload a single file for import
 */
router.post('/upload', upload.single('file'), handleMulterError, async (req, res, next) => {
  try {
    if (!req.file) {
      throw new ValidationError('No file uploaded');
    }

    const { clientId } = req.body;
    if (!clientId) {
      throw new ValidationError('Client ID is required');
    }

    // Verify client exists
    const client = await prisma.client.findUnique({
      where: { id: clientId },
    });

    if (!client) {
      throw new NotFoundError('Client');
    }

    // Parse file and detect type
    const { headers, rows } = await parseFile(req.file.path);
    const detectedType = detectFileType(headers);
    // Pass sample rows for better data type detection
    const columnMapping = generateColumnMapping(headers, detectedType, rows.slice(0, 20));

    // Create import batch
    const importBatch = await prisma.importBatch.create({
      data: {
        clientId,
        importType: detectedType,
        filename: req.file.originalname,
        filePath: req.file.path,
        status: 'pending',
        rowCount: rows.length,
        importedBy: req.user!.userId,
      },
    });

    // Generate preview warnings (legacy)
    const warnings = generateWarnings(headers, rows);

    // Run validation on sample data
    const validationResult = validateImportData(rows.slice(0, 100), columnMapping, detectedType);

    const preview = {
      importId: importBatch.id,
      detectedType,
      rowCount: rows.length,
      columns: columnMapping,
      sampleRows: rows.slice(0, 5),
      warnings,
      validation: {
        isValid: validationResult.isValid,
        totalErrors: validationResult.totalErrors,
        totalWarnings: validationResult.totalWarnings,
        summary: validationResult.summary,
        // Only include first 10 detailed results to keep response size manageable
        sampleIssues: validationResult.rowResults
          .filter(r => r.errors.length > 0 || r.warnings.length > 0)
          .slice(0, 10)
          .flatMap(r => [...r.errors, ...r.warnings]),
      },
    };

    res.json(preview);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/imports/upload-multiple
 * Upload multiple files for import (processes sequentially)
 */
router.post('/upload-multiple', upload.array('files', 10), handleMulterError, async (req, res, next) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      throw new ValidationError('No files uploaded');
    }

    const { clientId } = req.body;
    if (!clientId) {
      throw new ValidationError('Client ID is required');
    }

    // Verify client exists
    const client = await prisma.client.findUnique({
      where: { id: clientId },
    });

    if (!client) {
      throw new NotFoundError('Client');
    }

    const previews: Array<{
      importId: string;
      filename: string;
      detectedType: string;
      rowCount: number;
      columns: ReturnType<typeof generateColumnMapping>;
      sampleRows: Record<string, string | number | undefined>[];
      warnings: ReturnType<typeof generateWarnings>;
      validation: {
        isValid: boolean;
        totalErrors: number;
        totalWarnings: number;
        summary: { errorsByField: Record<string, number>; warningsByField: Record<string, number> };
      };
    }> = [];

    for (const file of files) {
      // Parse file and detect type
      const { headers, rows } = await parseFile(file.path);
      const detectedType = detectFileType(headers);
      const columnMapping = generateColumnMapping(headers, detectedType, rows.slice(0, 20));

      // Create import batch
      const importBatch = await prisma.importBatch.create({
        data: {
          clientId,
          importType: detectedType,
          filename: file.originalname,
          filePath: file.path,
          status: 'pending',
          rowCount: rows.length,
          importedBy: req.user!.userId,
        },
      });

      // Generate warnings
      const warnings = generateWarnings(headers, rows);

      // Run validation on sample data
      const validationResult = validateImportData(rows.slice(0, 100), columnMapping, detectedType);

      previews.push({
        importId: importBatch.id,
        filename: file.originalname,
        detectedType,
        rowCount: rows.length,
        columns: columnMapping,
        sampleRows: rows.slice(0, 3),
        warnings,
        validation: {
          isValid: validationResult.isValid,
          totalErrors: validationResult.totalErrors,
          totalWarnings: validationResult.totalWarnings,
          summary: validationResult.summary,
        },
      });
    }

    res.json({
      count: previews.length,
      previews,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/imports/history
 * List past imports (must be before /:importId to avoid route conflict)
 */
router.get('/history', async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const role = req.user!.role;

    // Get client IDs user has access to
    let clientIds: string[] = [];

    if (role === 'admin' || role === 'operations_manager') {
      const clients = await prisma.client.findMany({
        where: { isActive: true },
        select: { id: true },
      });
      clientIds = clients.map((c) => c.id);
    } else {
      const userClients = await prisma.userClient.findMany({
        where: { userId },
        select: { clientId: true },
      });
      clientIds = userClients.map((uc) => uc.clientId);
    }

    const imports = await prisma.importBatch.findMany({
      where: {
        clientId: { in: clientIds },
      },
      include: {
        client: {
          select: { name: true, code: true },
        },
        user: {
          select: { name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.json({ data: imports });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/imports/:importId
 * Get import status
 */
router.get('/:importId', async (req, res, next) => {
  try {
    const { importId } = req.params;

    const importBatch = await prisma.importBatch.findUnique({
      where: { id: importId },
      include: {
        client: {
          select: { name: true, code: true },
        },
        user: {
          select: { name: true, email: true },
        },
      },
    });

    if (!importBatch) {
      throw new NotFoundError('Import');
    }

    res.json(importBatch);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/imports/:importId/analyze
 * Analyze import impact before confirming
 * Returns projections of status changes, anomalies, and alert impact
 */
router.post('/:importId/analyze', async (req, res, next) => {
  try {
    const { importId } = req.params;
    const { columnMapping } = req.body;

    const importBatch = await prisma.importBatch.findUnique({
      where: { id: importId },
    });

    if (!importBatch) {
      throw new NotFoundError('Import');
    }

    if (importBatch.status !== 'pending') {
      throw new ValidationError('Can only analyze pending imports');
    }

    // If no column mapping provided, generate one
    let mapping = columnMapping;
    if (!mapping || mapping.length === 0) {
      const { headers, rows } = await parseFile(importBatch.filePath!);
      mapping = generateColumnMapping(headers, importBatch.importType as 'inventory' | 'orders' | 'both', rows.slice(0, 20));
    }

    const analysis = await analyzeImportImpact(importId, mapping);

    res.json(analysis);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/imports/:importId/diff
 * Get side-by-side comparison of existing vs import data
 */
router.get('/:importId/diff', async (req, res, next) => {
  try {
    const { importId } = req.params;

    const importBatch = await prisma.importBatch.findUnique({
      where: { id: importId },
    });

    if (!importBatch) {
      throw new NotFoundError('Import');
    }

    // Generate column mapping
    const { headers, rows } = await parseFile(importBatch.filePath!);
    const mapping = generateColumnMapping(
      headers,
      importBatch.importType as 'inventory' | 'orders' | 'both',
      rows.slice(0, 20)
    );

    const diff = await generateImportDiff(importId, mapping);

    res.json(diff);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/imports/:importId/confirm
 * Confirm and process an import
 */
router.post('/:importId/confirm', async (req, res, next) => {
  try {
    const { importId } = req.params;
    const { columnMapping } = req.body;

    const importBatch = await prisma.importBatch.findUnique({
      where: { id: importId },
    });

    if (!importBatch) {
      throw new NotFoundError('Import');
    }

    if (importBatch.status !== 'pending') {
      throw new ValidationError('Import has already been processed');
    }

    // Process import using the service
    const result = await processImport(importId, columnMapping || []);

    const updatedBatch = await prisma.importBatch.findUnique({
      where: { id: importId },
    });

    res.json({
      ...updatedBatch,
      result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/imports/:importId
 * Cancel a pending import
 */
router.delete('/:importId', async (req, res, next) => {
  try {
    const { importId } = req.params;

    const importBatch = await prisma.importBatch.findUnique({
      where: { id: importId },
    });

    if (!importBatch) {
      throw new NotFoundError('Import');
    }

    if (importBatch.status !== 'pending') {
      throw new ValidationError('Can only cancel pending imports');
    }

    // Delete file if exists
    if (importBatch.filePath && fs.existsSync(importBatch.filePath)) {
      fs.unlinkSync(importBatch.filePath);
    }

    await prisma.importBatch.delete({
      where: { id: importId },
    });

    res.json({ message: 'Import cancelled' });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/imports/recalculate/:clientId
 * Trigger manual recalculation for a client
 */
router.post('/recalculate/:clientId', async (req, res, next) => {
  try {
    const { clientId } = req.params;

    // Verify client exists
    const client = await prisma.client.findUnique({
      where: { id: clientId },
    });

    if (!client) {
      throw new NotFoundError('Client');
    }

    // Run recalculations
    await recalculateClientUsage(clientId);
    const alertResult = await runAlertGeneration(clientId);

    res.json({
      message: 'Recalculation completed',
      alerts: alertResult,
    });
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

interface ParsedRow {
  [key: string]: string | number | undefined;
}

function generateWarnings(headers: string[], rows: ParsedRow[]) {
  const warnings: { type: string; message: string; affectedRows: number }[] = [];

  // Check for whitespace issues
  let whitespaceCount = 0;
  for (const header of headers) {
    if (header !== header.trim()) {
      whitespaceCount++;
    }
  }
  if (whitespaceCount > 0) {
    warnings.push({
      type: 'whitespace',
      message: `${whitespaceCount} column headers contain leading/trailing whitespace`,
      affectedRows: rows.length,
    });
  }

  // Check for empty rows
  let emptyRowCount = 0;
  for (const row of rows) {
    const values = Object.values(row).filter((v) => v !== undefined && v !== '');
    if (values.length === 0) {
      emptyRowCount++;
    }
  }
  if (emptyRowCount > 0) {
    warnings.push({
      type: 'empty_rows',
      message: `${emptyRowCount} empty rows detected`,
      affectedRows: emptyRowCount,
    });
  }

  // Check for missing required fields
  const requiredFields = ['product id', 'sku', 'item id'];
  const hasProductId = headers.some((h) =>
    requiredFields.some((f) => h.toLowerCase().includes(f))
  );
  if (!hasProductId) {
    warnings.push({
      type: 'missing_field',
      message: 'No product identifier column detected',
      affectedRows: rows.length,
    });
  }

  return warnings;
}

export default router;
