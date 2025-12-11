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
} from '../services/import.service.js';
import { recalculateClientUsage } from '../services/usage.service.js';
import { runAlertGeneration } from '../services/alert.service.js';

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
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/tab-separated-values',
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

// Apply authentication
router.use(authenticate);

// =============================================================================
// ROUTES
// =============================================================================

/**
 * POST /api/imports/upload
 * Upload a single file for import
 */
router.post('/upload', upload.single('file'), async (req, res, next) => {
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
    const columnMapping = generateColumnMapping(headers, detectedType);

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

    // Generate preview
    const warnings = generateWarnings(headers, rows);

    const preview = {
      importId: importBatch.id,
      detectedType,
      rowCount: rows.length,
      columns: columnMapping,
      sampleRows: rows.slice(0, 5),
      warnings,
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
router.post('/upload-multiple', upload.array('files', 10), async (req, res, next) => {
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

    const previews = [];

    for (const file of files) {
      // Parse file and detect type
      const { headers, rows } = await parseFile(file.path);
      const detectedType = detectFileType(headers);
      const columnMapping = generateColumnMapping(headers, detectedType);

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

      previews.push({
        importId: importBatch.id,
        filename: file.originalname,
        detectedType,
        rowCount: rows.length,
        columns: columnMapping,
        sampleRows: rows.slice(0, 3),
        warnings,
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
