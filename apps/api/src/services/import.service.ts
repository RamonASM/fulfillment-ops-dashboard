import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { prisma } from '../lib/prisma.js';
import { recalculateClientUsage } from './usage.service.js';
import { runAlertGeneration } from './alert.service.js';

// =============================================================================
// TYPES
// =============================================================================

interface ColumnMapping {
  source: string;
  mapsTo: string;
  confidence: number;
}

interface ImportResult {
  status: 'completed' | 'failed';
  processedCount: number;
  errorCount: number;
  errors: Array<{ row: number; field?: string; message: string; value?: string }>;
  newProducts: number;
  updatedProducts: number;
  newTransactions: number;
  skippedDuplicates: number;
}

interface ParsedRow {
  [key: string]: string | number | undefined;
}

export type DuplicateStrategy = 'skip' | 'overwrite' | 'error' | 'merge';

interface DuplicateCheckResult {
  isDuplicate: boolean;
  existingRecord?: unknown;
  duplicateType?: 'file' | 'database' | 'in-file';
}

interface ImportOptions {
  duplicateStrategy?: DuplicateStrategy;
  checkFileChecksum?: boolean;
}

// =============================================================================
// FILE PARSING
// =============================================================================

/**
 * Parse a file (CSV, TSV, or XLSX) and return headers and rows
 */
export async function parseFile(
  filePath: string
): Promise<{ headers: string[]; rows: ParsedRow[] }> {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.csv' || ext === '.tsv') {
    return parseCSV(filePath, ext === '.tsv' ? '\t' : ',');
  } else if (ext === '.xlsx' || ext === '.xls') {
    return parseExcel(filePath);
  }

  throw new Error(`Unsupported file type: ${ext}`);
}

/**
 * Parse CSV/TSV file
 */
function parseCSV(
  filePath: string,
  delimiter: string
): Promise<{ headers: string[]; rows: ParsedRow[] }> {
  return new Promise((resolve, reject) => {
    const fileContent = fs.readFileSync(filePath, 'utf-8');

    Papa.parse(fileContent, {
      header: true,
      delimiter,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
      complete: (results) => {
        const headers = results.meta.fields || [];
        const rows = results.data as ParsedRow[];
        resolve({ headers, rows });
      },
      error: (error: Error) => {
        reject(error);
      },
    });
  });
}

/**
 * Parse Excel file
 */
function parseExcel(filePath: string): { headers: string[]; rows: ParsedRow[] } {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  const jsonData = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
  }) as (string | number)[][];

  if (jsonData.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = jsonData[0].map((h) => String(h).trim());
  const rows: ParsedRow[] = [];

  for (let i = 1; i < jsonData.length; i++) {
    const row: ParsedRow = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = jsonData[i][j];
    }
    rows.push(row);
  }

  return { headers, rows };
}

// =============================================================================
// AUTO-DETECTION
// =============================================================================

const INVENTORY_SIGNATURES = [
  'available quantity',
  'quantity multiplier',
  'total qty on hand',
  'notification point',
  'current notification point',
  'packs available',
  'pack size',
];

const ORDER_SIGNATURES = [
  'order id',
  'date submitted',
  'total quantity',
  'ship to',
  'order status',
  'order number',
  'qty ordered',
];

/**
 * Detect file type from headers
 */
export function detectFileType(headers: string[]): 'inventory' | 'orders' | 'both' {
  const normalizedHeaders = headers.map((h) => h.toLowerCase().trim());

  const inventoryMatches = normalizedHeaders.filter((h) =>
    INVENTORY_SIGNATURES.some((sig) => h.includes(sig))
  ).length;

  const orderMatches = normalizedHeaders.filter((h) =>
    ORDER_SIGNATURES.some((sig) => h.includes(sig))
  ).length;

  if (inventoryMatches >= 2 && orderMatches >= 2) {
    return 'both';
  }
  if (inventoryMatches >= 2) {
    return 'inventory';
  }
  if (orderMatches >= 2) {
    return 'orders';
  }

  return 'inventory';
}

// =============================================================================
// COLUMN MAPPING
// =============================================================================

const INVENTORY_PATTERNS: Array<{ patterns: string[]; mapsTo: string }> = [
  { patterns: ['product id', 'sku', 'item id', 'product code'], mapsTo: 'productId' },
  { patterns: ['product name', 'item name', 'description', 'name'], mapsTo: 'name' },
  { patterns: ['available quantity', 'qty available', 'packs available', 'current qty'], mapsTo: 'currentStockPacks' },
  { patterns: ['quantity multiplier', 'pack size', 'unit count', 'units per pack'], mapsTo: 'packSize' },
  { patterns: ['notification point', 'reorder point', 'min qty', 'reorder level'], mapsTo: 'notificationPoint' },
  { patterns: ['item type', 'product type', 'type', 'category'], mapsTo: 'itemType' },
];

const ORDER_PATTERNS: Array<{ patterns: string[]; mapsTo: string }> = [
  { patterns: ['product id', 'sku', 'item id'], mapsTo: 'productId' },
  { patterns: ['product name', 'item name', 'name'], mapsTo: 'productName' },
  { patterns: ['order id', 'order number', 'order #', 'po number'], mapsTo: 'orderId' },
  { patterns: ['date submitted', 'order date', 'date', 'submit date'], mapsTo: 'dateSubmitted' },
  { patterns: ['total quantity', 'qty ordered', 'quantity', 'qty'], mapsTo: 'quantityUnits' },
  { patterns: ['ship to company', 'ship to name', 'customer', 'company'], mapsTo: 'shipToCompany' },
  { patterns: ['ship to location', 'ship to address', 'address', 'location'], mapsTo: 'shipToLocation' },
  { patterns: ['order status', 'status'], mapsTo: 'orderStatus' },
];

/**
 * Generate column mappings based on headers
 */
export function generateColumnMapping(
  headers: string[],
  fileType: 'inventory' | 'orders' | 'both'
): ColumnMapping[] {
  const patterns =
    fileType === 'both'
      ? [...INVENTORY_PATTERNS, ...ORDER_PATTERNS]
      : fileType === 'inventory'
        ? INVENTORY_PATTERNS
        : ORDER_PATTERNS;

  const mappings: ColumnMapping[] = [];

  for (const header of headers) {
    const normalizedHeader = header.toLowerCase().trim();
    let bestMatch = { mapsTo: '', confidence: 0 };

    for (const { patterns: patternList, mapsTo } of patterns) {
      for (const pattern of patternList) {
        if (normalizedHeader === pattern) {
          bestMatch = { mapsTo, confidence: 1.0 };
          break;
        } else if (normalizedHeader.includes(pattern)) {
          const confidence = 0.8;
          if (confidence > bestMatch.confidence) {
            bestMatch = { mapsTo, confidence };
          }
        }
      }
      if (bestMatch.confidence === 1.0) break;
    }

    mappings.push({
      source: header,
      mapsTo: bestMatch.mapsTo || '',
      confidence: bestMatch.confidence,
    });
  }

  return mappings;
}

// =============================================================================
// DATA CLEANING
// =============================================================================

/**
 * Clean and normalize data row
 */
function cleanRow(row: ParsedRow, mapping: ColumnMapping[]): ParsedRow {
  const cleaned: ParsedRow = {};

  for (const { source, mapsTo } of mapping) {
    if (!mapsTo || !row[source]) continue;

    let value = row[source];

    // Trim strings
    if (typeof value === 'string') {
      value = value.trim();
    }

    // Normalize item type
    if (mapsTo === 'itemType' && typeof value === 'string') {
      const normalized = value.toLowerCase();
      if (['evergreen', 'event', 'completed'].includes(normalized)) {
        value = normalized;
      } else {
        value = 'evergreen';
      }
    }

    // Parse numbers
    if (['currentStockPacks', 'packSize', 'notificationPoint', 'quantityUnits'].includes(mapsTo)) {
      value = parseInt(String(value).replace(/[^0-9-]/g, ''), 10) || 0;
    }

    // Parse dates
    if (mapsTo === 'dateSubmitted' && value) {
      const dateStr = String(value);
      const parsed = new Date(dateStr);
      value = (isNaN(parsed.getTime()) ? new Date() : parsed) as unknown as string | number;
    }

    cleaned[mapsTo] = value;
  }

  return cleaned;
}

// =============================================================================
// IMPORT PROCESSING
// =============================================================================

/**
 * Process inventory import
 */
export async function processInventoryImport(
  clientId: string,
  rows: ParsedRow[],
  mapping: ColumnMapping[],
  importBatchId: string
): Promise<Partial<ImportResult>> {
  const errors: ImportResult['errors'] = [];
  let newProducts = 0;
  let updatedProducts = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = cleanRow(rows[i], mapping);
    const rowNum = i + 2; // 1-indexed + header row

    try {
      // Validate required fields
      if (!row.productId) {
        errors.push({ row: rowNum, field: 'productId', message: 'Product ID is required' });
        continue;
      }
      if (!row.name) {
        errors.push({ row: rowNum, field: 'name', message: 'Product name is required' });
        continue;
      }

      // Find or create product
      const existing = await prisma.product.findFirst({
        where: {
          clientId,
          productId: String(row.productId),
        },
      });

      const productData = {
        name: String(row.name),
        itemType: String(row.itemType || 'evergreen'),
        packSize: Number(row.packSize) || 1,
        notificationPoint: row.notificationPoint ? Number(row.notificationPoint) : null,
        currentStockPacks: Number(row.currentStockPacks) || 0,
        isOrphan: false,
      };

      if (existing) {
        // Update existing product
        await prisma.product.update({
          where: { id: existing.id },
          data: productData,
        });

        // Record stock history
        await prisma.stockHistory.create({
          data: {
            productId: existing.id,
            packsAvailable: productData.currentStockPacks,
            totalUnits: productData.currentStockPacks * productData.packSize,
            source: 'import',
          },
        });

        updatedProducts++;
      } else {
        // Create new product
        const newProduct = await prisma.product.create({
          data: {
            clientId,
            productId: String(row.productId),
            ...productData,
          },
        });

        // Record initial stock history
        await prisma.stockHistory.create({
          data: {
            productId: newProduct.id,
            packsAvailable: productData.currentStockPacks,
            totalUnits: productData.currentStockPacks * productData.packSize,
            source: 'import',
          },
        });

        newProducts++;
      }
    } catch (error) {
      errors.push({
        row: rowNum,
        message: error instanceof Error ? error.message : 'Unknown error',
        value: String(row.productId),
      });
    }
  }

  return {
    processedCount: newProducts + updatedProducts,
    errorCount: errors.length,
    errors,
    newProducts,
    updatedProducts,
  };
}

/**
 * Process orders/transactions import
 */
export async function processOrdersImport(
  clientId: string,
  rows: ParsedRow[],
  mapping: ColumnMapping[],
  importBatchId: string
): Promise<Partial<ImportResult>> {
  const errors: ImportResult['errors'] = [];
  let newTransactions = 0;
  let skippedDuplicates = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = cleanRow(rows[i], mapping);
    const rowNum = i + 2;

    try {
      // Validate required fields
      if (!row.productId) {
        errors.push({ row: rowNum, field: 'productId', message: 'Product ID is required' });
        continue;
      }
      if (!row.orderId) {
        errors.push({ row: rowNum, field: 'orderId', message: 'Order ID is required' });
        continue;
      }

      // Find product
      let product = await prisma.product.findFirst({
        where: {
          clientId,
          productId: String(row.productId),
        },
      });

      // Create orphan product if not found
      if (!product) {
        product = await prisma.product.create({
          data: {
            clientId,
            productId: String(row.productId),
            name: String(row.productName || row.productId),
            isOrphan: true,
            packSize: 1,
          },
        });
      }

      const rawDate = row.dateSubmitted;
      const dateSubmitted = (rawDate && typeof rawDate === 'object' && (rawDate as any) instanceof Date)
        ? (rawDate as Date)
        : new Date(String(rawDate));
      const quantityUnits = Number(row.quantityUnits) || 0;
      const quantityPacks = Math.ceil(quantityUnits / product.packSize);

      // Check for duplicate
      const existingTransaction = await prisma.transaction.findFirst({
        where: {
          productId: product.id,
          orderId: String(row.orderId),
          shipToLocation: row.shipToLocation ? String(row.shipToLocation) : null,
          dateSubmitted,
        },
      });

      if (existingTransaction) {
        // Update if quantities differ
        if (existingTransaction.quantityUnits !== quantityUnits) {
          await prisma.transaction.update({
            where: { id: existingTransaction.id },
            data: {
              quantityUnits,
              quantityPacks,
            },
          });
          newTransactions++;
        } else {
          skippedDuplicates++;
        }
        continue;
      }

      // Create new transaction
      await prisma.transaction.create({
        data: {
          productId: product.id,
          orderId: String(row.orderId),
          quantityPacks,
          quantityUnits,
          dateSubmitted,
          orderStatus: String(row.orderStatus || 'completed'),
          shipToLocation: row.shipToLocation ? String(row.shipToLocation) : null,
          shipToCompany: row.shipToCompany ? String(row.shipToCompany) : null,
          importBatchId,
        },
      });

      newTransactions++;
    } catch (error) {
      errors.push({
        row: rowNum,
        message: error instanceof Error ? error.message : 'Unknown error',
        value: String(row.productId),
      });
    }
  }

  return {
    processedCount: newTransactions,
    errorCount: errors.length,
    errors,
    newTransactions,
    skippedDuplicates,
  };
}

// =============================================================================
// MAIN IMPORT FUNCTION
// =============================================================================

/**
 * Process a complete import
 */
export async function processImport(
  importBatchId: string,
  columnMapping: ColumnMapping[]
): Promise<ImportResult> {
  const importBatch = await prisma.importBatch.findUnique({
    where: { id: importBatchId },
  });

  if (!importBatch || !importBatch.filePath) {
    throw new Error('Import batch not found or missing file');
  }

  // Update status
  await prisma.importBatch.update({
    where: { id: importBatchId },
    data: {
      status: 'processing',
      startedAt: new Date(),
    },
  });

  try {
    // Parse file
    const { rows } = await parseFile(importBatch.filePath);

    let result: Partial<ImportResult> = {
      processedCount: 0,
      errorCount: 0,
      errors: [],
      newProducts: 0,
      updatedProducts: 0,
      newTransactions: 0,
      skippedDuplicates: 0,
    };

    // Process based on import type
    if (importBatch.importType === 'inventory' || importBatch.importType === 'both') {
      const inventoryResult = await processInventoryImport(
        importBatch.clientId,
        rows,
        columnMapping,
        importBatchId
      );
      result.newProducts = inventoryResult.newProducts;
      result.updatedProducts = inventoryResult.updatedProducts;
      result.processedCount! += inventoryResult.processedCount || 0;
      result.errorCount! += inventoryResult.errorCount || 0;
      result.errors!.push(...(inventoryResult.errors || []));
    }

    if (importBatch.importType === 'orders' || importBatch.importType === 'both') {
      const ordersResult = await processOrdersImport(
        importBatch.clientId,
        rows,
        columnMapping,
        importBatchId
      );
      result.newTransactions = ordersResult.newTransactions;
      result.skippedDuplicates = ordersResult.skippedDuplicates;
      result.processedCount! += ordersResult.processedCount || 0;
      result.errorCount! += ordersResult.errorCount || 0;
      result.errors!.push(...(ordersResult.errors || []));
    }

    // Update import batch
    await prisma.importBatch.update({
      where: { id: importBatchId },
      data: {
        status: 'completed',
        completedAt: new Date(),
        processedCount: result.processedCount,
        errorCount: result.errorCount,
        errors: result.errors as unknown as undefined,
      },
    });

    // Recalculate usage metrics
    await recalculateClientUsage(importBatch.clientId);

    // Generate alerts
    await runAlertGeneration(importBatch.clientId);

    return {
      status: 'completed',
      ...result,
    } as ImportResult;
  } catch (error) {
    // Update import batch with failure
    await prisma.importBatch.update({
      where: { id: importBatchId },
      data: {
        status: 'failed',
        completedAt: new Date(),
        errors: [{ row: 0, message: error instanceof Error ? error.message : 'Unknown error' }] as unknown as undefined,
      },
    });

    throw error;
  }
}

// =============================================================================
// DUPLICATE DETECTION UTILITIES
// =============================================================================

/**
 * Calculate SHA-256 checksum of a file
 */
export function calculateFileChecksum(filePath: string): string {
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  return hashSum.digest('hex');
}

/**
 * Check if a file with the same checksum has been imported
 */
export async function checkFileAlreadyImported(
  clientId: string,
  checksum: string
): Promise<{ isDuplicate: boolean; existingImport?: { id: string; createdAt: Date } }> {
  const existing = await prisma.importBatch.findFirst({
    where: {
      clientId,
      fileChecksum: checksum,
      status: 'completed',
    },
    select: { id: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });

  return {
    isDuplicate: !!existing,
    existingImport: existing || undefined,
  };
}

/**
 * Detect in-file duplicates based on a key field
 */
export function detectInFileDuplicates(
  rows: ParsedRow[],
  keyField: string
): Map<string, number[]> {
  const duplicates = new Map<string, number[]>();
  const seen = new Map<string, number>();

  for (let i = 0; i < rows.length; i++) {
    const key = String(rows[i][keyField] || '');
    if (!key) continue;

    if (seen.has(key)) {
      const existing = duplicates.get(key) || [seen.get(key)!];
      existing.push(i + 2); // 1-indexed + header
      duplicates.set(key, existing);
    } else {
      seen.set(key, i + 2);
    }
  }

  return duplicates;
}

/**
 * Validate file content by magic bytes
 */
export function validateFileMagicBytes(filePath: string): {
  valid: boolean;
  detectedType?: string;
  expectedType?: string;
} {
  const ext = path.extname(filePath).toLowerCase();
  const buffer = Buffer.alloc(8);
  const fd = fs.openSync(filePath, 'r');
  fs.readSync(fd, buffer, 0, 8, 0);
  fs.closeSync(fd);

  // Magic bytes for common formats
  const MAGIC_BYTES = {
    xlsx: [0x50, 0x4b, 0x03, 0x04], // PK.. (ZIP-based)
    xls: [0xd0, 0xcf, 0x11, 0xe0], // OLE compound document
    csv: null, // Plain text, no magic bytes
  };

  let detectedType: string | undefined;

  // Check XLSX (ZIP)
  if (buffer[0] === 0x50 && buffer[1] === 0x4b) {
    detectedType = 'xlsx';
  }
  // Check XLS (OLE)
  else if (buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0) {
    detectedType = 'xls';
  }
  // Assume CSV/TSV for plain text
  else {
    detectedType = 'csv';
  }

  const expectedType = ext.replace('.', '');
  const valid = detectedType === expectedType ||
    (detectedType === 'csv' && ['csv', 'tsv', 'txt'].includes(expectedType));

  return { valid, detectedType, expectedType };
}

/**
 * Generate a unique row key for deduplication
 */
export function generateRowKey(row: ParsedRow, keyFields: string[]): string {
  const values = keyFields.map(field => String(row[field] || '')).join('|');
  return crypto.createHash('md5').update(values).digest('hex');
}
