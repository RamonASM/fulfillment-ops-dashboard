import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { logger } from "../lib/logger.js";
import readline from "readline";
import xlsx from "xlsx";
import { spawn, execSync } from "child_process";
import { prisma, Prisma } from "../lib/prisma.js";
import { authenticate, requireClientAccess } from "../middleware/auth.js";
import { NotFoundError, ValidationError } from "../middleware/error-handler.js";
import {
  parseFilePreview,
  detectFileType,
  detectFileTypeWithConfidence,
  generateColumnMapping,
  generateColumnMappingWithLearning,
  validateImportData,
} from "../services/import.service.js";
import { recalculateClientUsage } from "../services/analytics-facade.service.js";
import { runAlertGeneration } from "../services/alert.service.js";
import {
  createDailySnapshot,
  refreshRiskScoreCache,
  aggregateDailyAlertMetrics,
} from "../services/analytics.service.js";
import {
  analyzeImportImpact,
  generateImportDiff,
} from "../services/import-analysis.service.js";
import { storeMappingCorrections } from "../services/mapping-learning.service.js";
import {
  getClientCustomFields,
  discoverCustomFields,
  updateCustomFieldDefinition,
  getCustomFieldStats,
} from "../services/custom-field.service.js";
import { columnMappingsSchema } from "../lib/validation-schemas.js";

// Type for import types
type ImportType = "inventory" | "orders" | "both";

/**
 * Convert UUID string to a numeric lock key for PostgreSQL advisory locks.
 * Uses a simple hash to convert the UUID to a 32-bit integer.
 */
function uuidToLockKey(uuid: string): number {
  let hash = 0;
  for (let i = 0; i < uuid.length; i++) {
    const char = uuid.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Stale lock timeout - imports processing for longer than this are considered stuck
 */
const STALE_LOCK_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Clean up stale processing imports for a client.
 * Marks them as failed and releases any advisory locks.
 */
async function cleanupStaleImports(clientId: string): Promise<void> {
  const staleThreshold = new Date(Date.now() - STALE_LOCK_TIMEOUT_MS);

  const staleImports = await prisma.importBatch.findMany({
    where: {
      clientId,
      status: "processing",
      startedAt: { lt: staleThreshold }
    },
    select: { id: true }
  });

  if (staleImports.length > 0) {
    console.warn(`Found ${staleImports.length} stale imports for client ${clientId}, marking as failed`);
    await prisma.importBatch.updateMany({
      where: { id: { in: staleImports.map(i => i.id) } },
      data: {
        status: "failed",
        completedAt: new Date(),
        errors: [{ message: "Import timed out - marked as stale after 30 minutes" }]
      }
    });
  }
}

/**
 * Acquire a PostgreSQL advisory lock for a client.
 * First cleans up any stale imports, then tries to acquire the lock.
 * Returns true if lock acquired, false if another process holds it.
 */
async function acquireClientImportLock(clientId: string): Promise<boolean> {
  // Clean up stale imports first
  await cleanupStaleImports(clientId);

  const lockKey = uuidToLockKey(clientId);
  const result = await prisma.$queryRaw<Array<{ pg_try_advisory_lock: boolean }>>`
    SELECT pg_try_advisory_lock(${lockKey})
  `;
  return result[0]?.pg_try_advisory_lock ?? false;
}

/**
 * Release a PostgreSQL advisory lock for a client.
 * Includes retry logic and emergency fallback to prevent deadlocks.
 */
async function releaseClientImportLock(clientId: string): Promise<void> {
  const lockKey = uuidToLockKey(clientId);

  try {
    await prisma.$queryRaw`SELECT pg_advisory_unlock(${lockKey})`;
    logger.debug("Advisory lock released", { clientId, lockKey });
  } catch (error) {
    logger.error(
      "Failed to release advisory lock, attempting retry",
      error instanceof Error ? error : null,
      { clientId, lockKey }
    );

    // Retry once
    try {
      await prisma.$queryRaw`SELECT pg_advisory_unlock(${lockKey})`;
      logger.info("Advisory lock released on retry", { clientId, lockKey });
    } catch (retryError) {
      // Emergency: Force disconnect to release all session-level locks
      logger.error(
        "CRITICAL: Lock release retry failed, forcing session disconnect",
        retryError instanceof Error ? retryError : null,
        { clientId, lockKey }
      );

      // Disconnecting will auto-release all session-level advisory locks
      try {
        await prisma.$disconnect();
        await prisma.$connect();
        logger.info("Prisma reconnected after emergency disconnect", { clientId });
      } catch (reconnectError) {
        logger.error(
          "CRITICAL: Failed to reconnect Prisma after emergency disconnect",
          reconnectError instanceof Error ? reconnectError : null,
          { clientId }
        );
        // At this point, the advisory lock will be released when the session eventually times out
        // This is a last resort to prevent permanent deadlocks
      }
    }
  }
}

/**
 * Get the monorepo root path by walking up from the current directory.
 * This works regardless of how the API is started (PM2, npm workspace, direct).
 */
function getMonorepoRoot(): string {
  let currentDir = process.cwd();

  for (let i = 0; i < 10; i++) {
    const pkgPath = path.join(currentDir, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        if (pkg.name === "inventory-intelligence-platform") {
          return currentDir;
        }
      } catch {
        // Ignore parse errors, continue walking up
      }
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  console.warn(
    "[Import] Could not detect monorepo root from cwd, using process.cwd()",
  );
  return process.cwd();
}

const router = Router();

// =============================================================================
// CONFIGURATION
// =============================================================================
const IMPORT_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const monorepoRoot = getMonorepoRoot();
const uploadsDir = path.join(monorepoRoot, "uploads");

async function countFileRows(filePath: string): Promise<number | null> {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".csv" || ext === ".tsv") {
    return new Promise<number>((resolve, reject) => {
      let count = -1; // discount header
      const rl = readline.createInterface({
        input: fs.createReadStream(filePath),
        crlfDelay: Infinity,
      });

      rl.on("line", () => {
        count += 1;
      });
      rl.on("close", () => resolve(Math.max(0, count)));
      rl.on("error", (err) => reject(err));
    }).catch(() => null);
  }

  if (ext === ".xlsx" || ext === ".xls") {
    try {
      const workbook = xlsx.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      if (!sheet || !sheet["!ref"]) return null;
      const range = xlsx.utils.decode_range(sheet["!ref"]);
      const totalRows = range.e.r - range.s.r; // exclude header row
      return Math.max(0, totalRows);
    } catch (err) {
      console.warn(
        "[Import] Failed to count Excel rows:",
        (err as Error).message,
      );
      return null;
    }
  }

  return null;
}

const toSnakeCase = (str: string): string =>
  str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

async function createImportPreview(params: {
  filePath: string;
  originalName: string;
  clientId: string;
  userSelectedType?: string;
  importedBy?: string;
}) {
  const { filePath, originalName, clientId, userSelectedType, importedBy } =
    params;

  const { headers, rows } = await parseFilePreview(filePath);
  const detectionResult = detectFileTypeWithConfidence(headers);
  const validTypes: ImportType[] = ["inventory", "orders", "both"];
  const finalType: ImportType = validTypes.includes(
    userSelectedType as ImportType,
  )
    ? (userSelectedType as ImportType)
    : detectionResult.type;

  const columnMapping = await generateColumnMappingWithLearning(
    headers,
    finalType,
    clientId,
    rows.slice(0, 20),
  );

  const totalRows = await countFileRows(filePath);
  const relativeFilePath = path.relative(monorepoRoot, filePath);

  const importBatch = await prisma.importBatch.create({
    data: {
      clientId,
      importType: finalType,
      filename: originalName,
      filePath: relativeFilePath,
      status: "pending",
      rowCount: totalRows ?? rows.length,
      importedBy,
    },
  });

  const warnings = generateWarnings(headers, rows);
  const validationResult = validateImportData(
    rows.slice(0, 100),
    columnMapping,
    finalType,
  );

  const preview = {
    importId: importBatch.id,
    detectedType: detectionResult.type,
    selectedType: finalType,
    userOverride: !!(
      userSelectedType && userSelectedType !== detectionResult.type
    ),
    detection: detectionResult,
    rowCount: totalRows ?? rows.length,
    columns: columnMapping,
    sampleRows: rows.slice(0, 5),
    warnings,
    validation: {
      isValid: validationResult.isValid,
      totalErrors: validationResult.totalErrors,
      totalWarnings: validationResult.totalWarnings,
      summary: validationResult.summary,
      sampleIssues: validationResult.rowResults
        .filter((r) => r.errors.length > 0 || r.warnings.length > 0)
        .slice(0, 10)
        .flatMap((r) => [...r.errors, ...r.warnings]),
    },
  };

  return { importBatch, preview };
}

// Ensure uploads directory exists
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, file.fieldname + "-" + uniqueSuffix + ext);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
    fieldSize: 50 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = [
      "text/csv",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/tab-separated-values",
      "application/octet-stream",
    ];
    const allowedExtensions = [".csv", ".xlsx", ".xls", ".tsv"];
    const ext = path.extname(file.originalname).toLowerCase();

    if (
      allowedTypes.includes(file.mimetype) ||
      allowedExtensions.includes(ext)
    ) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Invalid file type. Only CSV, XLSX, XLS, and TSV files are allowed.",
        ),
      );
    }
  },
});

// Multer error handler
const handleMulterError = (err: Error | multer.MulterError, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        error: "File too large",
        message: "File size exceeds the 50MB limit.",
        maxSize: "50MB",
      });
    }
    return res
      .status(400)
      .json({ error: "Upload error", message: err.message });
  } else if (err) {
    return res.status(400).json({
      error: "Upload error",
      message: err.message || "An error occurred during file upload",
    });
  }
  next();
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function getPythonCommand(): string {
  const possiblePaths = [
    path.join(monorepoRoot, "apps", "python-importer", "venv", "bin", "python"),
    "python3",
    "python",
  ];
  const requiredDependencies = ["pandas", "sqlalchemy", "psycopg2", "openpyxl"];

  for (const cmd of possiblePaths) {
    try {
      execSync(`${cmd} --version`, { stdio: "ignore" });
      for (const dep of requiredDependencies) {
        try {
          execSync(`${cmd} -c "import ${dep}"`, { stdio: "ignore" });
        } catch {
          throw new Error(
            `Python found at ${cmd}, but missing dependency: '${dep}'`,
          );
        }
      }
      console.log(`[Import] Using validated Python environment: ${cmd}`);
      return cmd;
    } catch (err) {
      console.warn(
        `[Import] Python path '${cmd}' failed:`,
        (err as Error).message,
      );
    }
  }
  throw new Error(
    "A valid Python environment with required dependencies could not be found.",
  );
}

function calculateDuration(importBatch: {
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
}): { seconds: number; formatted: string } | null {
  if (!importBatch.startedAt) return null;
  const endTime = importBatch.completedAt ?? new Date();
  const startTime = importBatch.startedAt;
  const seconds = Math.round((endTime.getTime() - startTime.getTime()) / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return {
    seconds,
    formatted: minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${seconds}s`,
  };
}

function calculateProgress(importBatch: {
  processedCount: number | null;
  rowCount: number | null;
}): number {
  const processed = importBatch.processedCount ?? 0;
  const total = importBatch.rowCount ?? 0;
  if (total === 0) return 0;
  return Math.min(100, Math.round((processed / total) * 100));
}

function generateWarnings(headers: string[], rows: Record<string, unknown>[]): string[] {
  const warnings: string[] = [];

  // Check for empty columns
  const emptyColumns = headers.filter((h) => {
    const hasValues = rows.some(
      (r) => r[h] !== undefined && r[h] !== null && r[h] !== "",
    );
    return !hasValues;
  });
  if (emptyColumns.length > 0) {
    warnings.push(`Empty columns detected: ${emptyColumns.join(", ")}`);
  }

  // Check for duplicate headers
  const duplicates = headers.filter((h, i) => headers.indexOf(h) !== i);
  if (duplicates.length > 0) {
    warnings.push(
      `Duplicate column headers: ${[...new Set(duplicates)].join(", ")}`,
    );
  }

  return warnings;
}

// =============================================================================
// MIDDLEWARE
// =============================================================================
router.use(authenticate);

// =============================================================================
// ROUTES - IMPORT HISTORY (must be before /:importId routes)
// =============================================================================

/**
 * GET /api/imports/history
 * Get import history for all clients (filtered by user access)
 */
router.get("/history", async (req, res, next) => {
  try {
    const { clientId, status, limit = "50", offset = "0" } = req.query;

    const where: Prisma.ImportBatchWhereInput = {};

    // Filter by clientId if provided
    if (clientId && typeof clientId === "string") {
      where.clientId = clientId;
    }

    // Filter by status if provided
    if (status && typeof status === "string") {
      where.status = status;
    }

    const imports = await prisma.importBatch.findMany({
      where,
      include: {
        client: {
          select: { id: true, name: true, code: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: parseInt(limit as string, 10),
      skip: parseInt(offset as string, 10),
    });

    const total = await prisma.importBatch.count({ where });

    res.json({
      data: imports,
      total,
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10),
    });
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// ROUTES - CUSTOM FIELDS (must be before /:importId routes)
// =============================================================================

/**
 * GET /api/imports/custom-fields/:clientId
 * Get custom field definitions for a client
 */
router.get(
  "/custom-fields/:clientId",
  requireClientAccess,
  async (req, res, next) => {
    try {
      const { clientId } = req.params;
      const fields = await getClientCustomFields(clientId);
      res.json({ data: fields, count: fields.length });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/imports/custom-fields/:clientId
 * Discover and create custom fields from import data
 */
router.post(
  "/custom-fields/:clientId",
  requireClientAccess,
  async (req, res, next) => {
    try {
      const { clientId } = req.params;
      const { headers } = req.body;

      const discovered = await discoverCustomFields(clientId, headers);
      res.json({
        data: discovered,
        message: `Discovered ${discovered.length} custom fields`,
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * PATCH /api/imports/custom-fields/:fieldId
 * Update a custom field definition
 */
router.patch("/custom-fields/:fieldId", async (req, res, next) => {
  try {
    const { fieldId } = req.params;
    const updates = req.body;

    const updated = await updateCustomFieldDefinition(fieldId, updates);
    res.json({ data: updated });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/imports/custom-fields/:clientId/stats
 * Get custom field usage statistics
 */
router.get(
  "/custom-fields/:clientId/stats",
  requireClientAccess,
  async (req, res, next) => {
    try {
      const { clientId } = req.params;
      const stats = await getCustomFieldStats(clientId);
      res.json({ stats });
    } catch (error) {
      next(error);
    }
  },
);

// =============================================================================
// ROUTES - CLIENT DATA OPERATIONS (must be before /:importId routes)
// =============================================================================

/**
 * DELETE /api/imports/client/:clientId/data
 * Delete all import data for a client (full wipe)
 */
router.delete(
  "/client/:clientId/data",
  requireClientAccess,
  async (req, res, next) => {
    try {
      const { clientId } = req.params;
      const { confirm } = req.body;

      if (confirm !== "DELETE_ALL_DATA") {
        throw new ValidationError("Must confirm with 'DELETE_ALL_DATA'");
      }

      // Delete in order to respect foreign keys
      const deletedTransactions = await prisma.transaction.deleteMany({
        where: { product: { clientId } },
      });

      const deletedProducts = await prisma.product.deleteMany({
        where: { clientId },
      });

      const deletedImports = await prisma.importBatch.deleteMany({
        where: { clientId },
      });

      res.json({
        message: "All client data deleted",
        deleted: {
          transactions: deletedTransactions.count,
          products: deletedProducts.count,
          imports: deletedImports.count,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/imports/recalculate/:clientId
 * Trigger manual recalculation of client usage and alerts
 */
router.post(
  "/recalculate/:clientId",
  requireClientAccess,
  async (req, res, next) => {
    try {
      const { clientId } = req.params;

      await recalculateClientUsage(clientId);
      const alertResult = await runAlertGeneration(clientId);

      res.json({
        message: "Recalculation complete",
        alertsGenerated: alertResult?.created || 0,
      });
    } catch (error) {
      next(error);
    }
  },
);

// =============================================================================
// ROUTES - FILE UPLOAD
// =============================================================================

/**
 * POST /api/imports/upload
 * Upload a single file for import
 */
router.post(
  "/upload",
  upload.single("file"),
  handleMulterError,
  async (req, res, next) => {
    try {
      if (!req.file) {
        throw new ValidationError("No file uploaded");
      }

      const { clientId } = req.body;
      if (!clientId) {
        throw new ValidationError("Client ID is required");
      }

      const client = await prisma.client.findUnique({
        where: { id: clientId },
      });
      if (!client) {
        throw new NotFoundError("Client");
      }

      const absoluteFilePath = req.file.path;
      const totalRows = await countFileRows(absoluteFilePath);

      const { headers, rows } = await parseFilePreview(absoluteFilePath);
      const detectionResult = detectFileTypeWithConfidence(headers);
      const { importType: userSelectedType } = req.body;

      // Determine final type - force user selection if "both" detected and not overridden
      const validProcessableTypes: ImportType[] = ["inventory", "orders"];
      const requiresTypeSelection =
        detectionResult.type === "both" &&
        !validProcessableTypes.includes(userSelectedType as ImportType);

      // If user provided a valid type, use it; otherwise use detected (but may require selection)
      const finalType: ImportType = validProcessableTypes.includes(
        userSelectedType as ImportType,
      )
        ? (userSelectedType as ImportType)
        : requiresTypeSelection
          ? "inventory" // Default for column mapping, but flag will indicate user must choose
          : detectionResult.type;

      const columnMapping = await generateColumnMappingWithLearning(
        headers,
        requiresTypeSelection ? "inventory" : finalType, // Use inventory patterns for preview if both
        clientId,
        rows.slice(0, 20),
      );

      // Store relative path to prevent path disclosure
      const relativeFilePath = path.relative(monorepoRoot, absoluteFilePath);

      const importBatch = await prisma.importBatch.create({
        data: {
          clientId,
          importType: finalType,
          filename: req.file.originalname,
          filePath: relativeFilePath,
          status: "pending",
          rowCount: totalRows ?? rows.length,
          processedCount: 0,
          importedBy: req.user!.userId,
        },
      });

      const warnings = generateWarnings(headers, rows);
      const validationResult = validateImportData(
        rows.slice(0, 100),
        columnMapping,
        finalType,
      );

      res.json({
        importId: importBatch.id,
        detectedType: detectionResult.type,
        selectedType: requiresTypeSelection ? null : finalType,
        userOverride:
          userSelectedType && userSelectedType !== detectionResult.type,
        requiresTypeSelection,
        ...(requiresTypeSelection && {
          message:
            "File contains both inventory and order data. Please select which type to import.",
        }),
        detection: detectionResult,
        rowCount: totalRows ?? rows.length,
        columns: columnMapping,
        sampleRows: rows.slice(0, 5),
        warnings,
        validation: {
          isValid: validationResult.isValid,
          totalErrors: validationResult.totalErrors,
          totalWarnings: validationResult.totalWarnings,
          summary: validationResult.summary,
          sampleIssues: validationResult.rowResults
            .filter((r) => r.errors.length > 0 || r.warnings.length > 0)
            .slice(0, 10)
            .flatMap((r) => [...r.errors, ...r.warnings]),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/imports/upload-multiple
 * Upload multiple files for import
 */
router.post(
  "/upload-multiple",
  upload.array("files", 10),
  handleMulterError,
  async (req, res, next) => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        throw new ValidationError("No files uploaded");
      }

      const { clientId } = req.body;
      if (!clientId) {
        throw new ValidationError("Client ID is required");
      }

      const client = await prisma.client.findUnique({
        where: { id: clientId },
      });
      if (!client) {
        throw new NotFoundError("Client");
      }

      const previews: Array<{
        importId: string;
        filename: string;
        detectedType: "orders" | "inventory" | "both";
        selectedType: "orders" | "inventory" | null;
        requiresTypeSelection?: boolean;
        message?: string;
        detection: ReturnType<typeof detectFileTypeWithConfidence>;
        rowCount: number;
        columns: Awaited<ReturnType<typeof generateColumnMappingWithLearning>>;
        sampleRows: Record<string, unknown>[];
        warnings: string[];
        validation: {
          isValid: boolean;
          totalErrors: number;
          totalWarnings: number;
          summary: Record<string, unknown>;
          sampleIssues: string[];
        };
      }> = [];

      for (const file of files) {
        const absoluteFilePath = file.path;
        const totalRows = await countFileRows(absoluteFilePath);
        const { headers, rows } = await parseFilePreview(absoluteFilePath);
        const detectionResult = detectFileTypeWithConfidence(headers);

        // FIX: Handle "both" type detection same as single-file upload
        const validProcessableTypes: ImportType[] = ["inventory", "orders"];
        const requiresTypeSelection =
          detectionResult.type === "both" &&
          !validProcessableTypes.includes(detectionResult.type as ImportType);

        // Default to "inventory" for mapping when "both" detected
        const finalType: ImportType = requiresTypeSelection
          ? "inventory"
          : detectionResult.type;

        const columnMapping = await generateColumnMappingWithLearning(
          headers,
          requiresTypeSelection ? "inventory" : finalType,
          clientId,
          rows.slice(0, 20),
        );

        // Store relative path to prevent path disclosure
        const relativeFilePath = path.relative(monorepoRoot, absoluteFilePath);

        const importBatch = await prisma.importBatch.create({
          data: {
            clientId,
            importType: finalType,
            filename: file.originalname,
            filePath: relativeFilePath,
            status: "pending",
            rowCount: totalRows ?? rows.length,
            processedCount: 0,
            importedBy: req.user!.userId,
          },
        });

        const warnings = generateWarnings(headers, rows);
        const validationResult = validateImportData(
          rows.slice(0, 100),
          columnMapping,
          detectionResult.type,
        );

        previews.push({
          importId: importBatch.id,
          filename: file.originalname,
          detectedType: detectionResult.type,
          selectedType: requiresTypeSelection ? null : (finalType as "orders" | "inventory"),
          requiresTypeSelection,
          ...(requiresTypeSelection && {
            message:
              "File contains both inventory and order data. Please select which type to import.",
          }),
          detection: detectionResult,
          rowCount: totalRows ?? rows.length,
          columns: columnMapping,
          sampleRows: rows.slice(0, 5),
          warnings,
          validation: {
            isValid: validationResult.isValid,
            totalErrors: validationResult.totalErrors,
            totalWarnings: validationResult.totalWarnings,
            summary: validationResult.summary,
            sampleIssues: validationResult.rowResults
              .filter((r) => r.errors.length > 0 || r.warnings.length > 0)
              .slice(0, 10)
              .flatMap((r) =>
                [...r.errors, ...r.warnings].map((w) => w.message),
              ),
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
  },
);

// =============================================================================
// ROUTES - IMPORT OPERATIONS
// =============================================================================

/**
 * POST /api/imports/:importId/confirm
 * Confirm and process an import
 */
router.post("/:importId/confirm", async (req, res, next) => {
  // Track clientId for lock release in catch block
  let clientIdForLock: string | null = null;

  try {
    const { importId } = req.params;
    const { columnMapping: rawColumnMapping, originalMapping } = req.body;

    // Validate column mapping with Zod schema
    const columnMappingResult = columnMappingsSchema.safeParse(rawColumnMapping);
    if (!columnMappingResult.success) {
      throw new ValidationError(
        `Invalid column mapping: ${columnMappingResult.error.errors.map(e => e.message).join(', ')}`
      );
    }
    const columnMapping = columnMappingResult.data;

    const importBatch = await prisma.importBatch.findUnique({
      where: { id: importId },
    });

    if (!importBatch) throw new NotFoundError("Import");
    if (importBatch.status !== "pending") {
      throw new ValidationError("Import has already been processed");
    }

    // Acquire PostgreSQL advisory lock for this client to prevent concurrent imports
    // This is race-condition safe unlike a simple status check
    const lockAcquired = await acquireClientImportLock(importBatch.clientId);
    if (!lockAcquired) {
      // Secondary check: find which import is blocking
      const concurrentImport = await prisma.importBatch.findFirst({
        where: {
          clientId: importBatch.clientId,
          status: "processing",
          id: { not: importId },
        },
        select: { id: true, filename: true },
      });
      throw new ValidationError(
        `Another import is currently processing for this client${concurrentImport?.filename ? ` (${concurrentImport.filename})` : ""}. Please wait for it to complete before starting a new import.`,
      );
    }

    // Track clientId so we can release lock in catch block if needed
    clientIdForLock = importBatch.clientId;

    // Handle import type "both" - auto-detect based on column mappings
    let effectiveImportType = importBatch.importType;
    if (importBatch.importType === "both") {
      // Auto-detect type based on mapped columns
      const mappedFields = (columnMapping || []).map((m: { mapsTo: string }) => m.mapsTo.toLowerCase());

      const inventoryFields = ['currentstockpacks', 'packsize', 'notificationpoint', 'reorderpointpacks', 'itemtype'];
      const orderFields = ['orderid', 'quantityunits', 'quantitypacks', 'orderstatus', 'datesubmitted', 'shiptocompany'];

      const hasInventoryFields = inventoryFields.some(f => mappedFields.includes(f));
      const hasOrderFields = orderFields.some(f => mappedFields.includes(f));

      if (hasInventoryFields && !hasOrderFields) {
        effectiveImportType = 'inventory';
        console.log(`[Import] Auto-detected type 'inventory' from column mappings`);
      } else if (hasOrderFields && !hasInventoryFields) {
        effectiveImportType = 'orders';
        console.log(`[Import] Auto-detected type 'orders' from column mappings`);
      } else if (hasOrderFields && hasInventoryFields) {
        // Mixed signals - prefer orders if we see order-specific fields
        effectiveImportType = 'orders';
        console.log(`[Import] Mixed columns detected, defaulting to 'orders'`);
      } else {
        // No strong signals - require user to specify
        throw new ValidationError(
          "Cannot auto-detect import type from column mappings. Please select 'inventory' or 'orders' explicitly using PATCH /api/imports/:id before confirming. Inventory files typically have: Stock, Pack Size, Reorder Point. Order files typically have: Order ID, Quantity, Ship To."
        );
      }

      // Update the import batch with detected type
      await prisma.importBatch.update({
        where: { id: importId },
        data: { importType: effectiveImportType },
      });
    }

    if (!importBatch.filePath || !fs.existsSync(importBatch.filePath)) {
      throw new ValidationError(
        "Uploaded file is missing on server. Please re-upload and try again.",
      );
    }

    // Store mapping corrections for learning
    if (originalMapping && columnMapping) {
      // Transform mappings into corrections format
      const corrections = (
        columnMapping as Array<{ source: string; mapsTo: string }>
      ).map((col) => {
        const original = (
          originalMapping as Array<{ source: string; mapsTo: string }>
        ).find((o) => o.source === col.source);
        return {
          header: col.source,
          suggestedField: original?.mapsTo || "",
          confirmedField: col.mapsTo,
        };
      });

      // Identify actual corrections (where user changed the mapping)
      const actualCorrections = corrections.filter(
        (c) => c.suggestedField && c.suggestedField !== c.confirmedField
      );

      // Store in import batch metadata for audit trail
      if (actualCorrections.length > 0) {
        logger.info("Mapping corrections applied", {
          importId,
          clientId: importBatch.clientId,
          correctionCount: actualCorrections.length,
          corrections: actualCorrections,
        });

        await prisma.importBatch.update({
          where: { id: importId },
          data: {
            metadata: {
              ...(importBatch.metadata as Record<string, unknown> || {}),
              mappingCorrections: actualCorrections,
              correctionCount: actualCorrections.length,
            },
          },
        });
      }

      // Try to store for ML learning (non-blocking)
      try {
        await storeMappingCorrections(importBatch.clientId, corrections);
      } catch (err) {
        logger.warn("Failed to store mapping corrections for ML learning", {
          clientId: importBatch.clientId,
          error: err instanceof Error ? err.message : String(err),
        });
        // Corrections are already saved in ImportBatch.metadata, so this is non-critical
      }
    }

    const normalizedMappings = (columnMapping || []).map(
      (m: { source: string; mapsTo: string; isCustomField?: boolean }) => ({
        ...m,
        mapsTo: toSnakeCase(m.mapsTo),
      }),
    );

    // Create mapping file next to the data file
    const mappingFilePath = `${importBatch.filePath}.mapping.json`;

    fs.writeFileSync(
      mappingFilePath,
      JSON.stringify(
        {
          importId,
          clientId: importBatch.clientId,
          importType: effectiveImportType, // Use auto-detected type if original was "both"
          columnMappings: normalizedMappings,
        },
        null,
        2,
      ),
    );

    // Get Python command
    let pythonCmd: string;
    try {
      pythonCmd = getPythonCommand();
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown Python error";
      await prisma.importBatch.update({
        where: { id: importId },
        data: {
          status: "failed",
          errors: [
            {
              message: "Python environment validation failed",
              details: errorMessage,
            },
          ],
        },
      });
      return res.status(500).json({
        error: "Python environment validation failed",
        message: errorMessage,
      });
    }

    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is not set in the API environment.");
    }

    let stderrOutput = "";
    let stdoutBuffer = "";
    const diagnosticLogs: Array<{
      level: string;
      message: string;
      timestamp: string;
      context: Record<string, unknown>;
    }> = [];

    // Ensure file paths are absolute (database may have relative paths)
    const absoluteFilePath = path.isAbsolute(importBatch.filePath!)
      ? importBatch.filePath!
      : path.join(monorepoRoot, importBatch.filePath!);

    const absoluteMappingPath = path.isAbsolute(mappingFilePath)
      ? mappingFilePath
      : path.join(monorepoRoot, mappingFilePath);

    // Spawn Python process with ABSOLUTE paths
    const pythonProcess = spawn(
      pythonCmd,
      [
        path.join(monorepoRoot, "apps", "python-importer", "main.py"),
        process.env.DATABASE_URL,
        importId,
        absoluteFilePath,
        effectiveImportType!, // Use auto-detected type if original was "both"
        absoluteMappingPath,
      ],
      {
        cwd: monorepoRoot,
        env: { ...process.env, PYTHONUNBUFFERED: "1" },
      },
    );

    // Timeout handler
    const timeout = setTimeout(async () => {
      if (!pythonProcess.killed) {
        pythonProcess.kill("SIGTERM");
        await prisma.importBatch.update({
          where: { id: importId },
          data: {
            status: "failed",
            errors: [
              {
                message: "Import timed out after 30 minutes",
                details: stderrOutput,
              },
            ],
          },
        });
      }
    }, IMPORT_TIMEOUT_MS);

    // Capture stdout for progress events
    pythonProcess.stdout.on("data", async (data) => {
      stdoutBuffer += data.toString();

      // Parse progress events (one per line)
      const lines = stdoutBuffer.split("\n");
      stdoutBuffer = lines.pop() || ""; // Keep incomplete line

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          if (event.type === "chunk_completed" && event.data) {
            // Update progress in database
            await prisma.importBatch.update({
              where: { id: importId },
              data: {
                processedCount: event.data.total_processed,
              },
            });
          }
        } catch {
          // Not JSON, just log output
          console.log(`[Python] ${line}`);
        }
      }
    });

    // Capture stderr for errors - parse structured diagnostics
    pythonProcess.stderr.on("data", (data) => {
      const lines = data.toString().split("\n");
      for (const line of lines) {
        if (!line.trim()) continue;
        stderrOutput += line + "\n";

        // Parse structured diagnostic logs from Python
        if (line.startsWith("[DIAG]")) {
          try {
            const jsonStr = line.substring(7).trim(); // Remove "[DIAG] " prefix
            const diag = JSON.parse(jsonStr);
            diagnosticLogs.push(diag);
            const logPrefix = `[Python ${diag.level}]`;
            const contextStr =
              diag.context && Object.keys(diag.context).length > 0
                ? ` (${JSON.stringify(diag.context)})`
                : "";
            console.log(`${logPrefix} ${diag.message}${contextStr}`);
          } catch {
            // Not valid JSON, log as plain stderr
            console.error(`[Python stderr] ${line}`);
          }
        } else {
          console.error(`[Python stderr] ${line}`);
        }
      }
    });

    // Handle process completion
    pythonProcess.on("close", async (code) => {
      clearTimeout(timeout);
      console.log(`Python process exited with code ${code}`);

      // Clean up mapping file
      try {
        if (fs.existsSync(mappingFilePath)) {
          fs.unlinkSync(mappingFilePath);
          logger.debug("Cleaned up mapping file", { mappingFilePath });
        }
      } catch (cleanupError) {
        logger.warn("Failed to clean up mapping file - temp files may accumulate", {
          mappingFilePath,
          error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
        });
      }

      // Read Python's status from database
      const pythonBatch = await prisma.importBatch.findUnique({
        where: { id: importId },
      });

      if (!pythonBatch) {
        await prisma.importBatch.update({
          where: { id: importId },
          data: {
            status: "failed",
            completedAt: new Date(),
            errors: [
              {
                message: "Import failed",
                details: "Could not read import batch after Python execution.",
              },
            ],
            diagnosticLogs:
              diagnosticLogs.length > 0 ? (diagnosticLogs as any) : undefined,
          },
        });
        return;
      }

      // Store diagnostic logs from Python execution
      if (diagnosticLogs.length > 0) {
        await prisma.importBatch.update({
          where: { id: importId },
          data: {
            diagnosticLogs: diagnosticLogs as any,
          },
        });
      }

      if (pythonBatch.status === "failed") {
        // Python marked failure explicitly; surface its errors and stop.
        await prisma.importBatch.update({
          where: { id: importId },
          data: {
            completedAt: pythonBatch.completedAt ?? new Date(),
          },
        });
        return;
      }

      if (code === 0 || code === 2) {
        // Python handled it - run post-processing with per-service resilience
        try {
          await prisma.importBatch.update({
            where: { id: importId },
            data: { status: "post_processing" },
          });

          // Track results for each analytics service independently
          interface ServiceResult {
            success: boolean;
            error: string | null;
            duration: number;
          }
          const postProcessingResults: Record<string, ServiceResult> = {};

          // Helper to run each service with timeout and error isolation
          const runWithTimeout = async (
            fn: () => Promise<unknown>,
            name: string,
            timeoutMs = 60000,
          ): Promise<ServiceResult> => {
            const startTime = Date.now();
            try {
              await Promise.race([
                fn(),
                new Promise<never>((_, reject) =>
                  setTimeout(
                    () => reject(new Error(`${name} timed out after ${timeoutMs}ms`)),
                    timeoutMs,
                  ),
                ),
              ]);
              console.log(`✓ ${name} completed in ${Date.now() - startTime}ms`);
              return { success: true, error: null, duration: Date.now() - startTime };
            } catch (error) {
              const errorMsg = error instanceof Error ? error.message : String(error);
              console.error(`✗ ${name} failed:`, errorMsg);
              return { success: false, error: errorMsg, duration: Date.now() - startTime };
            }
          };

          console.log("Running post-import analytics (isolated per service)...");

          // Run each service independently - failures don't block others
          postProcessingResults.usageRecalc = await runWithTimeout(
            () => recalculateClientUsage(importBatch.clientId),
            "Usage recalculation",
            90000, // 90 seconds for usage calc
          );

          postProcessingResults.alertGeneration = await runWithTimeout(
            () => runAlertGeneration(importBatch.clientId),
            "Alert generation",
            60000,
          );

          postProcessingResults.dailySnapshot = await runWithTimeout(
            () => createDailySnapshot(),
            "Daily snapshot",
            60000,
          );

          postProcessingResults.riskScoreRefresh = await runWithTimeout(
            () => refreshRiskScoreCache(),
            "Risk score refresh",
            60000,
          );

          postProcessingResults.alertMetrics = await runWithTimeout(
            () => aggregateDailyAlertMetrics(),
            "Alert metrics aggregation",
            60000,
          );

          // Count successes and failures
          const results = Object.values(postProcessingResults);
          const successCount = results.filter((r) => r.success).length;
          const failureCount = results.filter((r) => !r.success).length;
          console.log(
            `Post-import analytics complete: ${successCount}/${results.length} succeeded, ${failureCount} failed`,
          );

          // Determine final status based on Python status + post-processing
          const pythonStatus = pythonBatch.status;
          const hasPostProcessingFailures = failureCount > 0;
          const finalStatus =
            hasPostProcessingFailures || pythonStatus === "completed_with_errors"
              ? "completed_with_errors"
              : pythonStatus === "completed"
                ? "completed"
                : "completed_with_errors";

          // Get existing metadata to preserve it
          const existingMetadata =
            (pythonBatch.metadata as Record<string, unknown>) || {};

          await prisma.importBatch.update({
            where: { id: importId },
            data: {
              status: finalStatus,
              completedAt: new Date(),
              metadata: JSON.parse(JSON.stringify({
                ...existingMetadata,
                postProcessingResults,
                postProcessingCompletedAt: new Date().toISOString(),
              })),
              ...(hasPostProcessingFailures && {
                errors: {
                  push: {
                    message: `Post-processing: ${failureCount}/${results.length} services failed`,
                    details: Object.entries(postProcessingResults)
                      .filter(([, r]) => !r.success)
                      .map(([name, r]) => `${name}: ${r.error}`)
                      .join("; "),
                  },
                },
              }),
            },
          });
        } catch (finalizeError) {
          await prisma.importBatch.update({
            where: { id: importId },
            data: {
              status: "failed",
              completedAt: new Date(),
              errors: {
                push: {
                  message: "Failed to finalize import",
                  details: (finalizeError as Error).message,
                },
              },
            },
          });
        }
      } else {
        // Python returned error - don't overwrite if Python already set status
        if (pythonBatch?.status !== "failed") {
          await prisma.importBatch.update({
            where: { id: importId },
            data: {
              status: "failed",
              completedAt: new Date(),
              errors: [
                {
                  message: "Import script failed",
                  details: stderrOutput || "No error output captured",
                },
              ],
            },
          });
        }
      }

      // Release advisory lock when import completes (success or failure)
      // Function handles errors internally with retry and emergency fallback
      await releaseClientImportLock(importBatch.clientId);
    });

    pythonProcess.on("error", async (err) => {
      clearTimeout(timeout);
      await prisma.importBatch.update({
        where: { id: importId },
        data: {
          status: "failed",
          errors: [
            { message: `Failed to start Python process: ${err.message}` },
          ],
        },
      });
      // Release advisory lock on error - function handles errors internally
      await releaseClientImportLock(importBatch.clientId);
    });

    // Update status to processing
    await prisma.importBatch.update({
      where: { id: importId },
      data: { status: "processing", startedAt: new Date() },
    });

    // Return full response for frontend
    res.json({
      id: importId,
      status: "processing",
      processedCount: 0,
      rowCount: importBatch.rowCount ?? 0,
      message: "Import process started",
    });
  } catch (error) {
    // Release advisory lock if we acquired it and there was an error before Python started
    // Function handles errors internally with retry and emergency fallback
    if (clientIdForLock) {
      await releaseClientImportLock(clientIdForLock);
    }
    next(error);
  }
});

/**
 * POST /api/imports/:importId/analyze
 * Analyze import impact before confirming
 */
router.post("/:importId/analyze", async (req, res, next) => {
  try {
    const { importId } = req.params;
    const { columnMapping } = req.body;

    const importBatch = await prisma.importBatch.findUnique({
      where: { id: importId },
    });

    if (!importBatch) throw new NotFoundError("Import");

    const analysis = await analyzeImportImpact(importId, columnMapping || []);

    res.json(analysis);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/imports/:importId/diff
 * Get diff preview for import with column mapping
 */
router.post("/:importId/diff", async (req, res, next) => {
  try {
    const { importId } = req.params;
    const { columnMapping } = req.body;

    const importBatch = await prisma.importBatch.findUnique({
      where: { id: importId },
    });

    if (!importBatch) throw new NotFoundError("Import");

    const diff = await generateImportDiff(importId, columnMapping || []);

    res.json(diff);
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/imports/:importId
 * Update import type and regenerate mappings
 */
router.patch("/:importId", async (req, res, next) => {
  try {
    const { importId } = req.params;
    const { importType } = req.body;

    const importBatch = await prisma.importBatch.findUnique({
      where: { id: importId },
    });

    if (!importBatch) throw new NotFoundError("Import");
    if (importBatch.status !== "pending") {
      throw new ValidationError("Cannot modify import that has been processed");
    }

    const validTypes = ["inventory", "orders", "both"];
    if (!validTypes.includes(importType)) {
      throw new ValidationError(
        `Invalid import type. Must be one of: ${validTypes.join(", ")}`,
      );
    }

    // Regenerate column mapping for new type
    const totalRows = await countFileRows(importBatch.filePath!);
    const { headers, rows } = await parseFilePreview(importBatch.filePath!);
    const columnMapping = await generateColumnMappingWithLearning(
      headers,
      importType,
      importBatch.clientId,
      rows.slice(0, 20),
    );

    await prisma.importBatch.update({
      where: { id: importId },
      data: { importType, rowCount: totalRows ?? rows.length },
    });

    const warnings = generateWarnings(headers, rows);
    const validationResult = validateImportData(
      rows.slice(0, 100),
      columnMapping,
      importType,
    );

    res.json({
      importId,
      detectedType: importType,
      selectedType: importType,
      rowCount: totalRows ?? rows.length,
      columns: columnMapping,
      sampleRows: rows.slice(0, 5),
      warnings,
      validation: {
        isValid: validationResult.isValid,
        totalErrors: validationResult.totalErrors,
        totalWarnings: validationResult.totalWarnings,
        summary: validationResult.summary,
        sampleIssues: validationResult.rowResults
          .filter((r) => r.errors.length > 0 || r.warnings.length > 0)
          .slice(0, 10)
          .flatMap((r) => [...r.errors, ...r.warnings]),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/imports/:importId
 * Get import status and details (for polling)
 */
router.get("/:importId", async (req, res, next) => {
  try {
    const { importId } = req.params;

    const importBatch = await prisma.importBatch.findUnique({
      where: { id: importId },
      include: {
        client: {
          select: { id: true, name: true, code: true },
        },
      },
    });

    if (!importBatch) throw new NotFoundError("Import");

    res.json({
      id: importBatch.id,
      clientId: importBatch.clientId,
      client: importBatch.client,
      filename: importBatch.filename,
      importType: importBatch.importType,
      status: importBatch.status,
      rowCount: importBatch.rowCount,
      processedCount: importBatch.processedCount,
      errorCount: importBatch.errorCount,
      errors: importBatch.errors,
      createdAt: importBatch.createdAt,
      startedAt: importBatch.startedAt,
      completedAt: importBatch.completedAt,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/imports/:importId/diagnostics
 * Get detailed diagnostic information for debugging failed imports
 */
router.get("/:importId/diagnostics", async (req, res, next) => {
  try {
    const { importId } = req.params;

    const importBatch = await prisma.importBatch.findUnique({
      where: { id: importId },
      include: {
        client: {
          select: { id: true, name: true, code: true },
        },
      },
    });

    if (!importBatch) throw new NotFoundError("Import");

    // Check Python environment
    let pythonPath: string | null = null;
    let pythonError: string | null = null;
    try {
      pythonPath = getPythonCommand();
    } catch (err) {
      pythonError = (err as Error).message;
    }

    // Check file existence
    const fileExists = importBatch.filePath
      ? fs.existsSync(importBatch.filePath)
      : false;
    const mappingFileExists = importBatch.filePath
      ? fs.existsSync(`${importBatch.filePath}.mapping.json`)
      : false;

    // Get file stats if it exists
    let fileStats: { size: number; permissions: string } | null = null;
    if (fileExists && importBatch.filePath) {
      try {
        const stats = fs.statSync(importBatch.filePath);
        fileStats = {
          size: stats.size,
          permissions: `0${(stats.mode & parseInt("777", 8)).toString(8)}`,
        };
      } catch {
        // Ignore stats errors
      }
    }

    res.json({
      // Import metadata
      id: importBatch.id,
      clientId: importBatch.clientId,
      client: importBatch.client,
      status: importBatch.status,
      importType: importBatch.importType,
      filename: importBatch.filename,
      filePath: importBatch.filePath,

      // Timing
      timing: {
        createdAt: importBatch.createdAt,
        startedAt: importBatch.startedAt,
        completedAt: importBatch.completedAt,
        duration: calculateDuration(importBatch),
      },

      // Progress
      progress: {
        rowCount: importBatch.rowCount,
        processedCount: importBatch.processedCount,
        errorCount: importBatch.errorCount,
        progressPercent: calculateProgress(importBatch),
      },

      // Errors (full detail)
      errors: importBatch.errors,

      // Diagnostic logs from Python
      diagnosticLogs: importBatch.diagnosticLogs || [],

      // Reconciliation data
      reconciliation: (importBatch.metadata as any)?.reconciliation || {
        total_rows_seen: importBatch.rowCount || 0,
        rows_cleaned: null,
        rows_inserted: importBatch.processedCount || 0,
        rows_updated: null,
        rows_dropped: null,
        chunk_count: null,
        drop_reasons: {},
      },

      // Success rate calculation
      successRate:
        (importBatch.metadata as any)?.reconciliation?.total_rows_seen > 0
          ? ((importBatch.metadata as any).reconciliation.rows_inserted /
              (importBatch.metadata as any).reconciliation.total_rows_seen) *
            100
          : importBatch.rowCount && importBatch.rowCount > 0
            ? ((importBatch.processedCount || 0) / importBatch.rowCount) * 100
            : 0,

      // Environment checks
      environment: {
        pythonPath,
        pythonError,
        fileExists,
        mappingFileExists,
        fileStats,
        uploadsDir,
        monorepoRoot,
        cwd: process.cwd(),
        databaseUrlSet: !!process.env.DATABASE_URL,
      },

      // Recommendations based on status
      recommendations: generateDiagnosticRecommendations(importBatch, {
        pythonPath,
        pythonError,
        fileExists,
        mappingFileExists,
      }),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Generate diagnostic recommendations based on import state
 */
function generateDiagnosticRecommendations(
  importBatch: {
    status: string;
    importType: string | null;
    errors: Prisma.JsonValue;
    filePath: string | null;
    rowCount: number | null;
    processedCount: number;
    metadata: Prisma.JsonValue;
  },
  env: {
    pythonPath: string | null;
    pythonError: string | null;
    fileExists: boolean;
    mappingFileExists: boolean;
  },
): string[] {
  const recommendations: string[] = [];
  const metadata = importBatch.metadata as Record<string, unknown> | null;
  const reconciliation = metadata?.reconciliation as Record<string, unknown> | undefined;

  // Check Python environment
  if (!env.pythonPath) {
    recommendations.push(
      `Python environment issue: ${env.pythonError || "Python not found"}. Install Python 3.8+ with pandas, sqlalchemy, psycopg2, and openpyxl.`,
    );
  }

  // Check file exists
  if (!env.fileExists && importBatch.filePath) {
    recommendations.push(
      `Uploaded file not found at '${importBatch.filePath}'. The file may have been deleted or the path is incorrect.`,
    );
  }

  // Check import type
  if (importBatch.importType === "both") {
    recommendations.push(
      "Import type is 'both' which is not supported by Python processor. Use PATCH /api/imports/:id to change to 'inventory' or 'orders'.",
    );
  }

  // Check for common error patterns
  const errors = importBatch.errors as Array<{
    message?: string;
    details?: string;
  }> | null;
  if (errors && errors.length > 0) {
    const errorMessages = errors.map((e) => e.message || "").join(" ");

    if (
      errorMessages.includes("invalid date") ||
      errorMessages.includes("date format")
    ) {
      recommendations.push(
        "Date parsing issues detected. Ensure dates are in ISO format (YYYY-MM-DD) or common US formats (MM/DD/YYYY).",
      );
    }

    if (
      errorMessages.includes("required column") ||
      errorMessages.includes("missing column")
    ) {
      recommendations.push(
        "Missing required columns. Inventory requires: product_id, name, current_stock. Orders require: order_id, product_id, quantity.",
      );
    }

    if (
      errorMessages.includes("permission") ||
      errorMessages.includes("access denied")
    ) {
      recommendations.push(
        "File permission issues detected. Ensure the uploads directory is writable by the API process.",
      );
    }
  }

  // Check reconciliation data for specific issues
  if (
    importBatch.processedCount === 0 &&
    importBatch.rowCount &&
    importBatch.rowCount > 0
  ) {
    recommendations.push(
      `All ${importBatch.rowCount} rows were dropped during processing. Check column mapping - required fields may not be mapped correctly. Review the errors list for specific validation failures.`,
    );
  }

  // Check for data quality issues from drop_reasons
  if (reconciliation?.drop_reasons) {
    const dropReasons = reconciliation.drop_reasons as {
      invalid_dates?: number;
      missing_required?: number;
      data_validation?: number;
    };

    if (dropReasons.invalid_dates && dropReasons.invalid_dates > 0) {
      recommendations.push(
        `${dropReasons.invalid_dates} rows dropped due to invalid dates. Ensure date columns are in format YYYY-MM-DD or MM/DD/YYYY.`,
      );
    }

    if (dropReasons.missing_required && dropReasons.missing_required > 0) {
      recommendations.push(
        `${dropReasons.missing_required} rows dropped due to missing required fields. Check that all required columns have data.`,
      );
    }

    if (dropReasons.data_validation && dropReasons.data_validation > 0) {
      recommendations.push(
        `${dropReasons.data_validation} rows failed data validation. Check for invalid numeric values, special characters, or formatting issues.`,
      );
    }
  }

  // Check for low success rate
  const totalRowsSeen = reconciliation?.total_rows_seen as number | undefined;
  const rowsInserted = reconciliation?.rows_inserted as number | undefined;
  if (totalRowsSeen && totalRowsSeen > 0 && rowsInserted !== undefined) {
    const successRate = (rowsInserted / totalRowsSeen) * 100;
    if (successRate < 50 && successRate > 0) {
      recommendations.push(
        `Low success rate: Only ${successRate.toFixed(1)}% of rows were successfully imported. Review column mappings and data format.`,
      );
    }
  }

  // Status-specific recommendations
  if (importBatch.status === "processing") {
    recommendations.push(
      "Import is still processing. Check PM2 logs for Python output: pm2 logs inventory-api",
    );
  }

  if (importBatch.status === "failed" && recommendations.length === 0) {
    recommendations.push(
      "Check PM2 logs for detailed error output: pm2 logs inventory-api --lines 200",
    );
  }

  return recommendations;
}

/**
 * DELETE /api/imports/:importId/data
 * Rollback import - delete data created by this import
 */
router.delete("/:importId/data", async (req, res, next) => {
  try {
    const { importId } = req.params;

    const importBatch = await prisma.importBatch.findUnique({
      where: { id: importId },
    });

    if (!importBatch) throw new NotFoundError("Import");

    // Delete transactions linked to this import
    const deletedTransactions = await prisma.transaction.deleteMany({
      where: { importBatchId: importId },
    });

    // For inventory imports, we can't easily identify which products were created
    // So we just delete orphaned products (those with no transactions)
    const deletedOrphans = await prisma.product.deleteMany({
      where: {
        clientId: importBatch.clientId,
        isOrphan: true,
        transactions: { none: {} },
      },
    });

    // Update import status
    await prisma.importBatch.update({
      where: { id: importId },
      data: { status: "rolled_back" },
    });

    res.json({
      message: "Import data rolled back",
      deletedTransactions: deletedTransactions.count,
      deletedOrphanProducts: deletedOrphans.count,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/imports/:importId
 * Cancel/delete a pending import
 */
router.delete("/:importId", async (req, res, next) => {
  try {
    const { importId } = req.params;

    const importBatch = await prisma.importBatch.findUnique({
      where: { id: importId },
    });

    if (!importBatch) throw new NotFoundError("Import");

    if (importBatch.status === "processing") {
      throw new ValidationError(
        "Cannot delete import that is currently processing",
      );
    }

    // Delete the uploaded file if it exists
    if (importBatch.filePath && fs.existsSync(importBatch.filePath)) {
      try {
        fs.unlinkSync(importBatch.filePath);
        logger.debug("Deleted uploaded file", { filePath: importBatch.filePath });
      } catch (cleanupError) {
        // Log to structured logger and DiagnosticLog for monitoring
        logger.warn("File cleanup failed - disk space may accumulate", {
          filePath: importBatch.filePath,
          error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
        });

        // Track in DiagnosticLog for monitoring dashboard
        try {
          await prisma.diagnosticLog.create({
            data: {
              runId: `cleanup-${Date.now()}`,
              category: "file_cleanup",
              check: "Upload file deletion",
              status: "WARN",
              message: `Failed to delete: ${importBatch.filePath}`,
              details: {
                error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
                importId: importBatch.id,
              },
            },
          });
        } catch (dbError) {
          // Last resort - at least the logger captured it
          logger.error(
            "Failed to log file cleanup error to DiagnosticLog",
            dbError instanceof Error ? dbError : null
          );
        }
      }
    }

    // Delete the import record
    await prisma.importBatch.delete({
      where: { id: importId },
    });

    res.json({ message: "Import deleted" });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/imports/:importId/retry-analytics
 * Manually retry failed post-processing analytics for an import
 */
router.post("/:importId/retry-analytics", async (req, res, next) => {
  try {
    const { importId } = req.params;

    const importBatch = await prisma.importBatch.findUnique({
      where: { id: importId },
    });

    if (!importBatch) throw new NotFoundError("Import");

    if (!["completed", "completed_with_errors"].includes(importBatch.status)) {
      throw new ValidationError(
        "Can only retry analytics for completed imports",
      );
    }

    const metadata = importBatch.metadata as Record<string, unknown> | null;

    interface ServiceResult {
      success: boolean;
      error: string | null;
      duration: number;
      retriedAt?: string;
    }

    // Run all analytics services with per-service error handling
    const runWithTimeout = async (
      fn: () => Promise<unknown>,
      name: string,
      timeoutMs = 60000,
    ): Promise<ServiceResult> => {
      const startTime = Date.now();
      try {
        await Promise.race([
          fn(),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error(`${name} timed out after ${timeoutMs}ms`)),
              timeoutMs,
            ),
          ),
        ]);
        return {
          success: true,
          error: null,
          duration: Date.now() - startTime,
          retriedAt: new Date().toISOString(),
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: errorMsg,
          duration: Date.now() - startTime,
          retriedAt: new Date().toISOString(),
        };
      }
    };

    const retryResults: Record<string, ServiceResult> = {};

    retryResults.usageRecalc = await runWithTimeout(
      () => recalculateClientUsage(importBatch.clientId),
      "Usage recalculation",
      90000,
    );

    retryResults.alertGeneration = await runWithTimeout(
      () => runAlertGeneration(importBatch.clientId),
      "Alert generation",
      60000,
    );

    retryResults.dailySnapshot = await runWithTimeout(
      () => createDailySnapshot(),
      "Daily snapshot",
      60000,
    );

    retryResults.riskScoreRefresh = await runWithTimeout(
      () => refreshRiskScoreCache(),
      "Risk score refresh",
      60000,
    );

    retryResults.alertMetrics = await runWithTimeout(
      () => aggregateDailyAlertMetrics(),
      "Alert metrics aggregation",
      60000,
    );

    // Count results
    const results = Object.values(retryResults);
    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter((r) => !r.success).length;

    // Update import metadata
    await prisma.importBatch.update({
      where: { id: importId },
      data: {
        status: failureCount > 0 ? "completed_with_errors" : "completed",
        metadata: JSON.parse(JSON.stringify({
          ...metadata,
          postProcessingResults: retryResults,
          manualRetryAt: new Date().toISOString(),
        })),
      },
    });

    res.json({
      message: `Analytics retry complete: ${successCount}/${results.length} succeeded`,
      results: retryResults,
      successCount,
      failureCount,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
