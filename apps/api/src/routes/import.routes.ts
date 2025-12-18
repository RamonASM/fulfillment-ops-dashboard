import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { spawn, execSync } from "child_process";
import { fileURLToPath } from "url";
import { prisma } from "../lib/prisma.js";
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

/**
 * Get the monorepo root path by walking up from the current file's directory.
 * This works regardless of how the API is started (PM2, npm workspace, direct).
 *
 * Detection method: Find directory containing package.json with name "inventory-intelligence-platform"
 */
function getMonorepoRoot(): string {
  // Start from __dirname (works in compiled CommonJS)
  // In dev with tsx, this also works
  let currentDir = __dirname;

  // Walk up the directory tree looking for monorepo root marker
  for (let i = 0; i < 10; i++) {
    const pkgPath = path.join(currentDir, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        // Found the monorepo root package.json
        if (pkg.name === "inventory-intelligence-platform") {
          return currentDir;
        }
      } catch {
        // Ignore parse errors, continue walking up
      }
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break; // Reached filesystem root
    currentDir = parentDir;
  }

  // Fallback: assume cwd is correct (for PM2 which explicitly sets cwd)
  console.warn(
    "[Import] Could not detect monorepo root from __dirname, falling back to process.cwd()",
  );
  return process.cwd();
}

const router = Router();

// Ensure uploads directory exists
const uploadsDir = "./uploads";
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname),
    );
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
      "text/csv",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/tab-separated-values",
      "application/octet-stream", // Some systems send files with generic type
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

// Multer error handler middleware
const handleMulterError = (err: any, req: any, res: any, next: any) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        error: "File too large",
        message:
          "File size exceeds the 50MB limit. Please upload a smaller file.",
        maxSize: "50MB",
      });
    }
    return res.status(400).json({
      error: "Upload error",
      message: err.message,
    });
  } else if (err) {
    return res.status(400).json({
      error: "Upload error",
      message: err.message || "An error occurred during file upload",
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

      // Verify client exists
      const client = await prisma.client.findUnique({
        where: { id: clientId },
      });

      if (!client) {
        throw new NotFoundError("Client");
      }

      // Parse file preview for header detection and column mapping
      const { headers, rows } = await parseFilePreview(req.file.path);

      // Get detection result with confidence scoring
      const detectionResult = detectFileTypeWithConfidence(headers);

      // Allow user to override detected type via request body
      const { importType: userSelectedType } = req.body;
      const validTypes = ["inventory", "orders", "both"];
      const finalType = validTypes.includes(userSelectedType)
        ? (userSelectedType as "inventory" | "orders" | "both")
        : detectionResult.type;
      const userOverride =
        userSelectedType && userSelectedType !== detectionResult.type;

      // Pass sample rows for better data type detection
      // Use learning-enabled mapping to incorporate past user corrections
      const columnMapping = await generateColumnMappingWithLearning(
        headers,
        finalType,
        clientId,
        rows.slice(0, 20),
      );

      // Create import batch
      const importBatch = await prisma.importBatch.create({
        data: {
          clientId,
          importType: finalType,
          filename: req.file.originalname,
          filePath: req.file.path,
          status: "pending",
          rowCount: rows.length,
          importedBy: req.user!.userId,
        },
      });

      // Generate preview warnings (legacy)
      const warnings = generateWarnings(headers, rows);

      // Run validation on sample data
      const validationResult = validateImportData(
        rows.slice(0, 100),
        columnMapping,
        finalType,
      );

      const preview = {
        importId: importBatch.id,
        detectedType: detectionResult.type,
        selectedType: finalType,
        userOverride: !!userOverride,
        detection: {
          confidence: detectionResult.confidence,
          inventoryMatches: detectionResult.inventoryMatches,
          orderMatches: detectionResult.orderMatches,
          ambiguousMatches: detectionResult.ambiguousMatches,
          matchedInventoryHeaders: detectionResult.matchedInventoryHeaders,
          matchedOrderHeaders: detectionResult.matchedOrderHeaders,
        },
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
            .filter((r) => r.errors.length > 0 || r.warnings.length > 0)
            .slice(0, 10)
            .flatMap((r) => [...r.errors, ...r.warnings]),
        },
      };

      res.json(preview);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/imports/upload-multiple
 * Upload multiple files for import (processes sequentially)
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

      // Verify client exists
      const client = await prisma.client.findUnique({
        where: { id: clientId },
      });

      if (!client) {
        throw new NotFoundError("Client");
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
          summary: {
            errorsByField: Record<string, number>;
            warningsByField: Record<string, number>;
          };
        };
      }> = [];

      for (const file of files) {
        // Parse file preview for header detection and column mapping
        const { headers, rows } = await parseFilePreview(file.path);
        const detectedType = detectFileType(headers);
        // Use learning-enabled mapping to incorporate past user corrections
        const columnMapping = await generateColumnMappingWithLearning(
          headers,
          detectedType,
          clientId,
          rows.slice(0, 20),
        );

        // Create import batch
        const importBatch = await prisma.importBatch.create({
          data: {
            clientId,
            importType: detectedType,
            filename: file.originalname,
            filePath: file.path,
            status: "pending",
            rowCount: rows.length,
            importedBy: req.user!.userId,
          },
        });

        // Generate warnings
        const warnings = generateWarnings(headers, rows);

        // Run validation on sample data
        const validationResult = validateImportData(
          rows.slice(0, 100),
          columnMapping,
          detectedType,
        );

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
  },
);

/**
 * GET /api/imports/history
 * List past imports (must be before /:importId to avoid route conflict)
 */
router.get("/history", async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const role = req.user!.role;

    // Get client IDs user has access to
    let clientIds: string[] = [];

    if (role === "admin" || role === "operations_manager") {
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
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    res.json({ data: imports });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/imports/:importId
 * Update import type (allows user to override auto-detected type)
 */
router.patch("/:importId", async (req, res, next) => {
  try {
    const { importId } = req.params;
    const { importType } = req.body;

    // Validate import type
    const validTypes = ["inventory", "orders", "both"];
    if (!importType || !validTypes.includes(importType)) {
      throw new ValidationError(
        "Invalid import type. Must be 'inventory', 'orders', or 'both'",
      );
    }

    const importBatch = await prisma.importBatch.findUnique({
      where: { id: importId },
    });

    if (!importBatch) {
      throw new NotFoundError("Import");
    }

    if (importBatch.status !== "pending") {
      throw new ValidationError("Can only update pending imports");
    }

    if (!importBatch.filePath) {
      throw new ValidationError("Import file not found");
    }

    // Re-parse file to regenerate column mapping with new type
    const { headers, rows } = await parseFilePreview(importBatch.filePath);
    const columnMapping = await generateColumnMappingWithLearning(
      headers,
      importType as "inventory" | "orders" | "both",
      importBatch.clientId,
      rows.slice(0, 20),
    );

    // Update import batch with new type
    const updatedImport = await prisma.importBatch.update({
      where: { id: importId },
      data: {
        importType: importType as "inventory" | "orders" | "both",
      },
      include: {
        client: {
          select: { name: true, code: true },
        },
      },
    });

    // Run validation on sample data with new type
    const validationResult = validateImportData(
      rows.slice(0, 100),
      columnMapping,
      importType as "inventory" | "orders" | "both",
    );

    res.json({
      ...updatedImport,
      columns: columnMapping,
      sampleRows: rows.slice(0, 5),
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
 * Get import status
 */
router.get("/:importId", async (req, res, next) => {
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
      throw new NotFoundError("Import");
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
router.post("/:importId/analyze", async (req, res, next) => {
  try {
    const { importId } = req.params;
    const { columnMapping } = req.body;

    const importBatch = await prisma.importBatch.findUnique({
      where: { id: importId },
    });

    if (!importBatch) {
      throw new NotFoundError("Import");
    }

    if (importBatch.status !== "pending") {
      throw new ValidationError("Can only analyze pending imports");
    }

    // If no column mapping provided, generate one
    let mapping = columnMapping;
    if (!mapping || mapping.length === 0) {
      const { headers, rows } = await parseFilePreview(importBatch.filePath!);
      mapping = generateColumnMapping(
        headers,
        importBatch.importType as "inventory" | "orders" | "both",
        rows.slice(0, 20),
      );
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
router.get("/:importId/diff", async (req, res, next) => {
  try {
    const { importId } = req.params;

    const importBatch = await prisma.importBatch.findUnique({
      where: { id: importId },
    });

    if (!importBatch) {
      throw new NotFoundError("Import");
    }

    // Generate column mapping using preview parser
    const { headers, rows } = await parseFilePreview(importBatch.filePath!);
    const mapping = generateColumnMapping(
      headers,
      importBatch.importType as "inventory" | "orders" | "both",
      rows.slice(0, 20),
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
router.post("/:importId/confirm", async (req, res, next) => {
  try {
    const { importId } = req.params;
    const { columnMapping, originalMapping } = req.body;

    const importBatch = await prisma.importBatch.findUnique({
      where: { id: importId },
    });

    if (!importBatch) {
      throw new NotFoundError("Import");
    }

    if (importBatch.status !== "pending") {
      throw new ValidationError("Import has already been processed");
    }

    // Store mapping corrections for learning (if user modified mappings)
    if (
      originalMapping &&
      columnMapping &&
      Array.isArray(originalMapping) &&
      Array.isArray(columnMapping)
    ) {
      const corrections: Array<{
        header: string;
        suggestedField: string;
        confirmedField: string;
      }> = [];

      for (let i = 0; i < columnMapping.length; i++) {
        const original = originalMapping[i];
        const confirmed = columnMapping[i];
        if (original && confirmed && original.mapsTo !== confirmed.mapsTo) {
          corrections.push({
            header: original.source,
            suggestedField: original.mapsTo,
            confirmedField: confirmed.mapsTo,
          });
        }
      }

      if (corrections.length > 0) {
        // Store corrections for learning
        await storeMappingCorrections(importBatch.clientId, corrections);
      }
    }

    // Helper to convert camelCase to snake_case
    const toSnakeCase = (str: string): string =>
      str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

    // Convert camelCase mapsTo values to snake_case for Python (database column names)
    const normalizedMappings = (columnMapping || []).map(
      (m: { source: string; mapsTo: string; isCustomField?: boolean }) => ({
        ...m,
        mapsTo: toSnakeCase(m.mapsTo),
      }),
    );

    // Write column mappings to JSON sidecar file for Python importer
    const mappingFilePath = `${importBatch.filePath}.mapping.json`;
    const mappingData = {
      importId,
      clientId: importBatch.clientId,
      importType: importBatch.importType,
      columnMappings: normalizedMappings,
      customFields: normalizedMappings.filter(
        (m: { isCustomField?: boolean }) => m.isCustomField,
      ),
      createdAt: new Date().toISOString(),
    };
    fs.writeFileSync(mappingFilePath, JSON.stringify(mappingData, null, 2));
    console.log(`Wrote mapping file to ${mappingFilePath}`);

    // Detect Python command (python3 or python)
    let pythonCmd: string;
    try {
      pythonCmd = getPythonCommand();
    } catch (err) {
      await prisma.importBatch.update({
        where: { id: importId },
        data: {
          status: "failed",
          errors: [{ message: "Python not found on system" }],
        },
      });
      throw new ValidationError("Python is not installed on the server");
    }

    // Validate DATABASE_URL exists before spawning Python
    if (!process.env.DATABASE_URL) {
      await prisma.importBatch.update({
        where: { id: importId },
        data: {
          status: "failed",
          errors: [{ message: "DATABASE_URL not configured in environment" }],
        },
      });
      throw new ValidationError(
        "Server configuration error: DATABASE_URL not set",
      );
    }

    // === ROBUST ERROR HANDLING IMPLEMENTATION ===
    // Initialize variables to capture ALL output (not just lines with keywords)
    let stdoutOutput = "";
    let stderrOutput = "";

    // Calculate monorepo root for correct path to python-importer
    const monorepoRoot = getMonorepoRoot();
    const apiDir = path.join(monorepoRoot, "apps", "api");

    // File paths are stored relative to API directory, make them absolute
    const absoluteFilePath = path.join(apiDir, importBatch.filePath!);
    const absoluteMappingFilePath = path.join(apiDir, mappingFilePath);

    const pythonProcess = spawn(
      pythonCmd,
      [
        path.join(monorepoRoot, "apps", "python-importer", "main.py"),
        process.env.DATABASE_URL,
        importId,
        absoluteFilePath,
        importBatch.importType!,
        absoluteMappingFilePath,
      ],
      {
        cwd: monorepoRoot,
        env: {
          ...process.env,
          PYTHONUNBUFFERED: "1", // Ensure real-time output
        },
      },
    );

    // Set up timeout to kill process if it runs too long
    const timeout = setTimeout(async () => {
      if (!pythonProcess.killed) {
        pythonProcess.kill("SIGTERM");
        console.error(
          `Python Importer timed out after ${IMPORT_TIMEOUT_MS / 1000}s`,
        );
        await prisma.importBatch.update({
          where: { id: importId },
          data: {
            status: "failed",
            errors: [
              {
                message: "Import timed out after 30 minutes.",
                details: stderrOutput,
              },
            ],
          },
        });
      }
    }, IMPORT_TIMEOUT_MS);

    // Capture all stdout data (accumulated for debugging)
    pythonProcess.stdout.on("data", (data) => {
      const output = data.toString();
      stdoutOutput += output;
      console.log(`Python Importer stdout: ${output}`);
    });

    // Capture all stderr data (accumulated for error reporting)
    pythonProcess.stderr.on("data", (data) => {
      const output = data.toString();
      stderrOutput += output;
      console.error(`Python Importer stderr: ${output}`);
    });

    // Use 'close' event as the single source of truth for success or failure
    pythonProcess.on("close", async (code) => {
      clearTimeout(timeout);
      console.log(`Python Importer process exited with code ${code}`);

      // NOTE: Mapping file cleanup moved to AFTER post-processing to avoid race condition

      if (code === 0) {
        // SUCCESS: Trigger post-import calculations
        // Outer try/catch ensures imports never get stuck in post_processing state
        try {
          await prisma.importBatch.update({
            where: { id: importId },
            data: { status: "post_processing" },
          });

          // Post-processing with timeout to prevent hangs
          const POST_PROCESSING_TIMEOUT = 5 * 60 * 1000; // 5 minutes max
          let postProcessingError: Error | null = null;
          try {
            await Promise.race([
              (async () => {
                await recalculateClientUsage(importBatch.clientId);
                await runAlertGeneration(importBatch.clientId);
              })(),
              new Promise<never>((_, reject) =>
                setTimeout(
                  () =>
                    reject(
                      new Error("Post-processing timed out after 5 minutes"),
                    ),
                  POST_PROCESSING_TIMEOUT,
                ),
              ),
            ]);
          } catch (calcError) {
            console.error("Post-import calculation error:", calcError);
            postProcessingError = calcError as Error;
          }

          // CRITICAL: Finalize status after post-processing completes
          // Without this, imports stay stuck at "post_processing" forever!
          await prisma.importBatch.update({
            where: { id: importId },
            data: {
              status: postProcessingError
                ? "completed_with_errors"
                : "completed",
              completedAt: new Date(),
              ...(postProcessingError && {
                errors: [
                  {
                    message: "Post-processing failed",
                    details: String(postProcessingError),
                  },
                ],
              }),
            },
          });
        } catch (finalizeError) {
          // Outer catch: Handle failures in the finalization process itself
          console.error(
            "CRITICAL: Failed to finalize import status:",
            finalizeError,
          );
          // Last-ditch attempt to mark as failed so import doesn't stay stuck
          try {
            await prisma.importBatch.update({
              where: { id: importId },
              data: {
                status: "completed_with_errors",
                completedAt: new Date(),
                errors: [
                  {
                    message: "Failed to finalize import",
                    details: String(finalizeError),
                  },
                ],
              },
            });
          } catch (fatalError) {
            console.error(
              "FATAL: Could not update import status at all:",
              fatalError,
            );
            // At this point, the import will be stuck - but at least we logged the error
          }
        }

        // Clean up mapping file AFTER all post-processing is complete
        try {
          if (fs.existsSync(mappingFilePath)) {
            fs.unlinkSync(mappingFilePath);
          }
        } catch (cleanupError) {
          console.warn("Failed to clean up mapping file:", cleanupError);
        }
      } else {
        // FAILURE: Save the complete stderr output to database
        await prisma.importBatch.update({
          where: { id: importId },
          data: {
            status: "failed",
            errors: [
              {
                message: "The import script failed to execute.",
                details: stderrOutput || "No error output was captured.",
              },
            ],
          },
        });
      }
    });

    pythonProcess.on("error", async (err) => {
      clearTimeout(timeout);
      console.error("Failed to start Python Importer process:", err);
      await prisma.importBatch.update({
        where: { id: importId },
        data: {
          status: "failed",
          errors: [
            { message: `Failed to start Python process: ${err.message}` },
          ],
        },
      });
    });

    // Update the status to 'processing' to give immediate feedback to the user
    const updatedBatch = await prisma.importBatch.update({
      where: { id: importId },
      data: { status: "processing", startedAt: new Date() },
    });

    res.json({
      ...updatedBatch,
      message:
        "Import process started. You can monitor the progress on the import status page.",
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/imports/:importId/data
 * Delete all data (products and transactions) created by a completed import
 * This allows users to undo an import and remove all associated data
 */
router.delete("/:importId/data", async (req, res, next) => {
  try {
    const { importId } = req.params;
    const { deleteProducts = true, deleteTransactions = true } = req.query;

    const importBatch = await prisma.importBatch.findUnique({
      where: { id: importId },
    });

    if (!importBatch) {
      throw new NotFoundError("Import");
    }

    let deletedProducts = 0;
    let deletedTransactions = 0;

    // Delete transactions created by this import
    if (deleteTransactions !== "false") {
      const transactionResult = await prisma.transaction.deleteMany({
        where: { importBatchId: importId },
      });
      deletedTransactions = transactionResult.count;
    }

    // Delete products created by this import (if they have no other transactions)
    if (deleteProducts !== "false") {
      // Find products that were only created for this import (orphan products from order imports)
      // and have no transactions from other imports
      const orphanProducts = await prisma.product.findMany({
        where: {
          clientId: importBatch.clientId,
          isOrphan: true,
          transactions: {
            none: {
              importBatchId: { not: importId },
            },
          },
        },
        select: { id: true },
      });

      if (orphanProducts.length > 0) {
        // First delete their transactions (already done above)
        // Then delete the products
        const productResult = await prisma.product.deleteMany({
          where: {
            id: { in: orphanProducts.map((p) => p.id) },
          },
        });
        deletedProducts = productResult.count;
      }
    }

    // Delete the uploaded file if exists
    if (importBatch.filePath && fs.existsSync(importBatch.filePath)) {
      fs.unlinkSync(importBatch.filePath);
    }

    // Update import batch status to indicate it was rolled back
    await prisma.importBatch.update({
      where: { id: importId },
      data: {
        status: "rolled_back",
        completedAt: new Date(),
      },
    });

    // Recalculate usage after deletion via analytics facade
    await recalculateClientUsage(importBatch.clientId);

    res.json({
      message: "Import data deleted successfully",
      deletedProducts,
      deletedTransactions,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/imports/:importId
 * Cancel a pending import
 */
router.delete("/:importId", async (req, res, next) => {
  try {
    const { importId } = req.params;

    const importBatch = await prisma.importBatch.findUnique({
      where: { id: importId },
    });

    if (!importBatch) {
      throw new NotFoundError("Import");
    }

    if (importBatch.status !== "pending") {
      throw new ValidationError("Can only cancel pending imports");
    }

    // Delete file if exists
    if (importBatch.filePath && fs.existsSync(importBatch.filePath)) {
      fs.unlinkSync(importBatch.filePath);
    }

    await prisma.importBatch.delete({
      where: { id: importId },
    });

    res.json({ message: "Import cancelled" });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/imports/client/:clientId/data
 * Delete ALL products and transactions for a client (fresh start)
 * Use with caution - this removes all inventory data
 */
router.delete("/client/:clientId/data", async (req, res, next) => {
  try {
    const { clientId } = req.params;
    const { confirm } = req.query;

    // Require explicit confirmation
    if (confirm !== "true") {
      throw new ValidationError(
        "Must confirm deletion by adding ?confirm=true to the request",
      );
    }

    // Verify client exists
    const client = await prisma.client.findUnique({
      where: { id: clientId },
    });

    if (!client) {
      throw new NotFoundError("Client");
    }

    // Delete in order: transactions first, then usage metrics, then products, then import batches
    const deletedTransactions = await prisma.transaction.deleteMany({
      where: {
        product: { clientId },
      },
    });

    const deletedUsageMetrics = await prisma.usageMetric.deleteMany({
      where: {
        product: { clientId },
      },
    });

    const deletedSnapshots = await prisma.monthlyUsageSnapshot.deleteMany({
      where: {
        product: { clientId },
      },
    });

    const deletedProducts = await prisma.product.deleteMany({
      where: { clientId },
    });

    // Delete import batch records
    const deletedImports = await prisma.importBatch.deleteMany({
      where: { clientId },
    });

    res.json({
      message: "All client data deleted successfully",
      deleted: {
        transactions: deletedTransactions.count,
        usageMetrics: deletedUsageMetrics.count,
        monthlySnapshots: deletedSnapshots.count,
        products: deletedProducts.count,
        imports: deletedImports.count,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/imports/recalculate/:clientId
 * Trigger manual recalculation for a client
 */
router.post("/recalculate/:clientId", async (req, res, next) => {
  try {
    const { clientId } = req.params;

    // Verify client exists
    const client = await prisma.client.findUnique({
      where: { id: clientId },
    });

    if (!client) {
      throw new NotFoundError("Client");
    }

    // Fix any products that have isActive = false (shouldn't happen but fix legacy data)
    const fixedProducts = await prisma.product.updateMany({
      where: {
        clientId,
        isActive: false,
      },
      data: {
        isActive: true,
      },
    });

    // Run recalculations via analytics facade
    // The facade handles both DS Analytics and TypeScript based on client feature flag
    await recalculateClientUsage(clientId);

    const alertResult = await runAlertGeneration(clientId);

    res.json({
      message: "Recalculation completed",
      alerts: alertResult,
      fixedProducts: fixedProducts.count,
    });
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// CUSTOM FIELD ENDPOINTS
// =============================================================================

/**
 * GET /api/imports/custom-fields/:clientId
 * Get all custom field definitions for a client
 * Used by MappingComboBox to show existing custom fields
 */
router.get("/custom-fields/:clientId", async (req, res, next) => {
  try {
    const { clientId } = req.params;

    // Verify client exists
    const client = await prisma.client.findUnique({
      where: { id: clientId },
    });

    if (!client) {
      throw new NotFoundError("Client");
    }

    const customFields = await getClientCustomFields(clientId);

    res.json({
      data: customFields,
      count: customFields.length,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/imports/custom-fields/:clientId
 * Create a new custom field definition on-the-fly
 * Used when user types a new field name in the MappingComboBox
 */
router.post("/custom-fields/:clientId", async (req, res, next) => {
  try {
    const { clientId } = req.params;
    const { fieldName, sourceColumnName, dataType = "text" } = req.body;

    if (!fieldName) {
      throw new ValidationError("Field name is required");
    }

    // Verify client exists
    const client = await prisma.client.findUnique({
      where: { id: clientId },
    });

    if (!client) {
      throw new NotFoundError("Client");
    }

    // Normalize field name to camelCase
    const normalizedName = fieldName
      .toLowerCase()
      .trim()
      .replace(/[()[\]{}]/g, "")
      .replace(/[-_\s]+(.)?/g, (_: string, c: string) =>
        c ? c.toUpperCase() : "",
      )
      .replace(/^./, (c: string) => c.toLowerCase());

    // Create custom field using the discovery service
    const [customField] = await discoverCustomFields(clientId, [
      {
        source: sourceColumnName || fieldName,
        mapsTo: normalizedName,
        dataType,
      },
    ]);

    res.json({
      data: customField,
      message: "Custom field created successfully",
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/imports/custom-fields/:fieldId
 * Update a custom field definition
 */
router.patch("/custom-fields/:fieldId", async (req, res, next) => {
  try {
    const { fieldId } = req.params;
    const {
      displayName,
      isDisplayed,
      isPinned,
      displayOrder,
      aggregationType,
      formatPattern,
    } = req.body;

    const updated = await updateCustomFieldDefinition(fieldId, {
      displayName,
      isDisplayed,
      isPinned,
      displayOrder,
      aggregationType,
      formatPattern,
    });

    res.json({
      data: updated,
      message: "Custom field updated successfully",
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/imports/custom-fields/:clientId/stats
 * Get statistics for all custom fields
 */
router.get("/custom-fields/:clientId/stats", async (req, res, next) => {
  try {
    const { clientId } = req.params;

    // Verify client exists
    const client = await prisma.client.findUnique({
      where: { id: clientId },
    });

    if (!client) {
      throw new NotFoundError("Client");
    }

    const stats = await getCustomFieldStats(clientId);

    res.json({
      data: stats,
      count: stats.length,
    });
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Detect the Python command available on the system.
 * Supports multiple platforms: Docker containers, Unix (macOS/Linux), and Windows.
 * Validates that critical dependencies (including openpyxl for Excel support) are installed.
 */
function getPythonCommand(): string {
  // Multi-platform Python paths in priority order:
  // 1. Docker container system Python (installed globally in Dockerfile)
  // 2. Local venv on Unix (macOS/Linux)
  // 3. Local venv on Windows
  // 4. System Python (python3/python)

  const monorepoRoot = getMonorepoRoot();

  const possiblePaths = [
    // Docker container - Python installed system-wide
    "/usr/bin/python3",
    // Local venv on Unix (macOS/Linux) - relative to monorepo root
    path.join(monorepoRoot, "apps", "python-importer", "venv", "bin", "python"),
    // Local venv on Windows - relative to monorepo root
    path.join(
      monorepoRoot,
      "apps",
      "python-importer",
      "venv",
      "Scripts",
      "python.exe",
    ),
    // System Python (works on all platforms)
    "python3",
    "python",
  ];

  for (const cmd of possiblePaths) {
    try {
      // Check Python version
      execSync(`${cmd} --version`, { stdio: "ignore" });

      // Validate ALL critical dependencies exist, including openpyxl for Excel support
      // CRITICAL: openpyxl is required for .xlsx/.xls file imports
      const testImport = `${cmd} -c "import pandas, sqlalchemy, psycopg2, openpyxl"`;
      execSync(testImport, { stdio: "ignore" });

      console.log(`[Import] Using Python: ${cmd}`);
      return cmd;
    } catch (err) {
      console.warn(
        `[Import] Python command ${cmd} failed validation:`,
        err instanceof Error ? err.message : String(err),
      );
      // Try next command
    }
  }

  throw new Error(
    "Python not found or missing required dependencies (pandas, sqlalchemy, psycopg2, openpyxl). " +
      "Please set up Python environment in apps/python-importer/venv or install dependencies globally. " +
      "Note: openpyxl is required for Excel (.xlsx/.xls) file support.",
  );
}

/** Import timeout in milliseconds (30 minutes) */
const IMPORT_TIMEOUT_MS = 30 * 60 * 1000;

interface ParsedRow {
  [key: string]: string | number | undefined;
}

function generateWarnings(headers: string[], rows: ParsedRow[]) {
  const warnings: { type: string; message: string; affectedRows: number }[] =
    [];

  // Check for whitespace issues
  let whitespaceCount = 0;
  for (const header of headers) {
    if (header !== header.trim()) {
      whitespaceCount++;
    }
  }
  if (whitespaceCount > 0) {
    warnings.push({
      type: "whitespace",
      message: `${whitespaceCount} column headers contain leading/trailing whitespace`,
      affectedRows: rows.length,
    });
  }

  // Check for empty rows
  let emptyRowCount = 0;
  for (const row of rows) {
    const values = Object.values(row).filter(
      (v) => v !== undefined && v !== "",
    );
    if (values.length === 0) {
      emptyRowCount++;
    }
  }
  if (emptyRowCount > 0) {
    warnings.push({
      type: "empty_rows",
      message: `${emptyRowCount} empty rows detected`,
      affectedRows: emptyRowCount,
    });
  }

  // Check for missing required fields
  const requiredFields = ["product id", "sku", "item id"];
  const hasProductId = headers.some((h) =>
    requiredFields.some((f) => h.toLowerCase().includes(f)),
  );
  if (!hasProductId) {
    warnings.push({
      type: "missing_field",
      message: "No product identifier column detected",
      affectedRows: rows.length,
    });
  }

  return warnings;
}

export default router;
