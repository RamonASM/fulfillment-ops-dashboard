import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { prisma } from '../lib/prisma.js';
import { recalculateClientUsage } from './usage.service.js';
import { runAlertGeneration } from './alert.service.js';
import {
  similarityWithExpansion,
  getConfidenceScore,
  getConfidenceLevel,
  type ConfidenceLevel,
} from '../lib/string-similarity.js';
import {
  analyzeColumnDataType,
  validateQuantitySamples,
  validateProductIdSamples,
  validateDateSamples,
  validatePackSizeSamples,
  type ExpectedFieldType,
} from '../lib/data-type-detection.js';

// =============================================================================
// TYPES
// =============================================================================

export interface ColumnMapping {
  source: string;
  mapsTo: string;
  confidence: number;
  confidenceLevel?: ConfidenceLevel;
  warnings?: string[];
}

// Enhanced field pattern with expected data type
interface FieldPattern {
  patterns: string[];
  mapsTo: string;
  expectedType?: ExpectedFieldType;
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

// Expanded inventory patterns with data type expectations
const INVENTORY_PATTERNS: FieldPattern[] = [
  {
    patterns: [
      'product id', 'sku', 'item id', 'product code', 'item code',
      'part number', 'part #', 'part no', 'item #', 'item no',
      'upc', 'ean', 'gtin', 'asin', 'isbn', 'barcode',
      'internal id', 'catalog number', 'catalog #', 'material number',
      'stock code', 'inv id', 'inventory id', 'product sku',
    ],
    mapsTo: 'productId',
    expectedType: 'alphanumeric',
  },
  {
    patterns: [
      'product name', 'item name', 'description', 'name', 'title',
      'product description', 'item description', 'product title',
      'material description', 'article name', 'article description',
      'item title', 'prod name', 'prod desc', 'short description',
    ],
    mapsTo: 'name',
    expectedType: 'text',
  },
  {
    patterns: [
      'available quantity', 'qty available', 'packs available', 'current qty',
      'quantity on hand', 'qty on hand', 'qoh', 'stock on hand', 'soh',
      'available stock', 'in stock', 'inventory qty', 'inventory quantity',
      'current stock', 'stock qty', 'available units', 'units available',
      'on hand qty', 'on-hand quantity', 'warehouse qty', 'whse qty',
      'total available', 'available count', 'stock count', 'bin qty',
      'location qty', 'avail qty', 'avail', 'available', 'onhand',
      'physical count', 'actual qty', 'actual quantity',
    ],
    mapsTo: 'currentStockPacks',
    expectedType: 'numeric_positive',
  },
  {
    patterns: [
      'quantity multiplier', 'pack size', 'unit count', 'units per pack',
      'case size', 'case qty', 'case quantity', 'pack qty', 'pack quantity',
      'units per case', 'each per pack', 'eaches per case', 'inner pack',
      'outer pack', 'selling unit', 'uom qty', 'unit of measure qty',
      'conversion factor', 'multiplier', 'qty per', 'quantity per',
    ],
    mapsTo: 'packSize',
    expectedType: 'numeric_positive',
  },
  {
    patterns: [
      'notification point', 'reorder point', 'min qty', 'reorder level',
      'minimum quantity', 'minimum stock', 'min stock', 'safety stock',
      'safety level', 'low stock threshold', 'reorder threshold',
      'trigger point', 'minimum level', 'alert threshold', 'min level',
      'reorder qty', 'reorder quantity', 'par level', 'par',
    ],
    mapsTo: 'notificationPoint',
    expectedType: 'numeric_positive',
  },
  {
    patterns: [
      'item type', 'product type', 'type', 'category', 'classification',
      'product category', 'item category', 'class', 'product class',
      'inventory type', 'stock type', 'material type', 'item class',
      'abc class', 'abc classification', 'product group', 'item group',
    ],
    mapsTo: 'itemType',
    expectedType: 'categorical',
  },
];

// Expanded order patterns with data type expectations
const ORDER_PATTERNS: FieldPattern[] = [
  {
    patterns: [
      'product id', 'sku', 'item id', 'item sku', 'product sku',
      'article number', 'material number', 'item number', 'item #',
      'part number', 'part #', 'stock code', 'product code',
    ],
    mapsTo: 'productId',
    expectedType: 'alphanumeric',
  },
  {
    patterns: [
      'product name', 'item name', 'name', 'description', 'item description',
      'product description', 'article description', 'material description',
    ],
    mapsTo: 'productName',
    expectedType: 'text',
  },
  {
    patterns: [
      'order id', 'order number', 'order #', 'po number', 'po #',
      'purchase order', 'purchase order number', 'sales order',
      'sales order number', 'so number', 'so #', 'reference number',
      'ref number', 'ref #', 'transaction id', 'tx id', 'txn id',
      'order no', 'po no', 'document number', 'doc number', 'doc #',
      'confirmation number', 'confirmation #', 'invoice number', 'invoice #',
    ],
    mapsTo: 'orderId',
    expectedType: 'alphanumeric',
  },
  {
    patterns: [
      'date submitted', 'order date', 'date', 'submit date', 'submission date',
      'created date', 'creation date', 'placed date', 'date placed',
      'transaction date', 'tx date', 'order datetime', 'datetime',
      'date ordered', 'ordered date', 'date created', 'timestamp',
      'entry date', 'booking date', 'processed date',
    ],
    mapsTo: 'dateSubmitted',
    expectedType: 'date',
  },
  {
    patterns: [
      'total quantity', 'qty ordered', 'quantity', 'qty', 'order qty',
      'order quantity', 'ordered quantity', 'units ordered', 'units',
      'quantity ordered', 'shipped qty', 'ship qty', 'amount',
      'qty shipped', 'quantity shipped', 'pack qty', 'case qty',
      'unit qty', 'total units', 'total qty', 'line qty', 'line quantity',
    ],
    mapsTo: 'quantityUnits',
    expectedType: 'numeric_positive',
  },
  {
    patterns: [
      'ship to company', 'ship to name', 'customer', 'company',
      'customer name', 'recipient', 'recipient name', 'consignee',
      'ship to', 'shipto', 'deliver to', 'delivery name', 'account name',
      'client name', 'buyer', 'buyer name', 'sold to', 'sold to name',
      'bill to name', 'billto name', 'company name', 'organization',
    ],
    mapsTo: 'shipToCompany',
    expectedType: 'text',
  },
  {
    patterns: [
      'ship to location', 'ship to address', 'address', 'location',
      'delivery address', 'shipping address', 'destination', 'ship address',
      'deliver to address', 'consignee address', 'full address',
      'street address', 'delivery location', 'site', 'site name',
      'warehouse', 'store', 'store name', 'branch', 'facility',
    ],
    mapsTo: 'shipToLocation',
    expectedType: 'text',
  },
  {
    patterns: [
      'order status', 'status', 'state', 'order state', 'fulfillment status',
      'shipment status', 'delivery status', 'processing status',
      'line status', 'item status', 'completion status',
    ],
    mapsTo: 'orderStatus',
    expectedType: 'categorical',
  },
];

/**
 * Generate column mappings based on headers using fuzzy matching.
 * Uses Jaro-Winkler similarity with abbreviation expansion for better accuracy.
 */
export function generateColumnMapping(
  headers: string[],
  fileType: 'inventory' | 'orders' | 'both',
  sampleRows?: ParsedRow[]
): ColumnMapping[] {
  const patterns =
    fileType === 'both'
      ? [...INVENTORY_PATTERNS, ...ORDER_PATTERNS]
      : fileType === 'inventory'
        ? INVENTORY_PATTERNS
        : ORDER_PATTERNS;

  const mappings: ColumnMapping[] = [];
  const usedTargets = new Set<string>();

  for (const header of headers) {
    const normalizedHeader = header.toLowerCase().trim();
    let bestMatch: { mapsTo: string; confidence: number; warnings: string[] } = {
      mapsTo: '',
      confidence: 0,
      warnings: [],
    };

    for (const { patterns: patternList, mapsTo, expectedType } of patterns) {
      // Skip if target already used with high confidence
      if (usedTargets.has(mapsTo) && bestMatch.confidence >= 0.9) {
        continue;
      }

      for (const pattern of patternList) {
        let similarity: number;

        // Check exact match first
        if (normalizedHeader === pattern) {
          similarity = 1.0;
        } else {
          // Use fuzzy matching with abbreviation expansion
          similarity = similarityWithExpansion(normalizedHeader, pattern);
        }

        // Apply data type validation bonus if sample data available
        if (similarity > 0.5 && sampleRows && sampleRows.length > 0 && expectedType) {
          const sampleValues = sampleRows.slice(0, 10).map(row => row[header]);
          const typeValidation = validateSampleDataType(sampleValues, expectedType, mapsTo);

          // Boost or reduce confidence based on data type match
          if (typeValidation.isValid) {
            similarity = Math.min(1.0, similarity + 0.1);
          } else if (typeValidation.matchRatio < 0.5) {
            similarity = similarity * 0.8;
          }
        }

        if (similarity > bestMatch.confidence) {
          bestMatch = {
            mapsTo,
            confidence: similarity,
            warnings: [],
          };
        }
      }
    }

    // Generate warnings for low confidence
    if (bestMatch.confidence > 0 && bestMatch.confidence < 0.7) {
      bestMatch.warnings.push(`Low confidence match - please verify "${header}" maps to "${bestMatch.mapsTo}"`);
    }

    // Mark target as used if high confidence
    if (bestMatch.mapsTo && bestMatch.confidence >= 0.7) {
      usedTargets.add(bestMatch.mapsTo);
    }

    mappings.push({
      source: header,
      mapsTo: bestMatch.mapsTo || '',
      confidence: bestMatch.confidence,
      confidenceLevel: getConfidenceLevel(bestMatch.confidence),
      warnings: bestMatch.warnings.length > 0 ? bestMatch.warnings : undefined,
    });
  }

  return mappings;
}

/**
 * Validate sample data against expected field type.
 */
function validateSampleDataType(
  values: (string | number | undefined)[],
  expectedType: ExpectedFieldType,
  fieldName: string
): { isValid: boolean; matchRatio: number } {
  switch (fieldName) {
    case 'productId':
      return validateProductIdSamples(values);
    case 'currentStockPacks':
    case 'packSize':
    case 'notificationPoint':
    case 'quantityUnits':
      return validateQuantitySamples(values);
    case 'dateSubmitted':
      return validateDateSamples(values);
    default: {
      const analysis = analyzeColumnDataType(values);
      return {
        isValid: analysis.confidence > 0.7,
        matchRatio: analysis.confidence,
      };
    }
  }
}

// =============================================================================
// IMPORT VALIDATION RULES
// =============================================================================

export interface ValidationWarning {
  row: number;
  field: string;
  message: string;
  value: string | number;
  severity: 'error' | 'warning' | 'info';
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationWarning[];
  warnings: ValidationWarning[];
}

/**
 * Validate inventory row data before saving.
 * Returns errors that prevent saving and warnings for review.
 */
export function validateInventoryRow(
  row: ParsedRow,
  rowNum: number
): ValidationResult {
  const errors: ValidationWarning[] = [];
  const warnings: ValidationWarning[] = [];

  // Required field validation
  if (!row.productId) {
    errors.push({
      row: rowNum,
      field: 'productId',
      message: 'Product ID is required',
      value: '',
      severity: 'error',
    });
  }

  if (!row.name) {
    errors.push({
      row: rowNum,
      field: 'name',
      message: 'Product name is required',
      value: '',
      severity: 'error',
    });
  }

  // Pack size validation - must be > 0 (prevents division by zero)
  const packSize = Number(row.packSize);
  if (row.packSize !== undefined && row.packSize !== '') {
    if (isNaN(packSize) || packSize <= 0) {
      errors.push({
        row: rowNum,
        field: 'packSize',
        message: 'Pack size must be a positive number greater than 0',
        value: row.packSize,
        severity: 'error',
      });
    } else if (packSize > 10000) {
      warnings.push({
        row: rowNum,
        field: 'packSize',
        message: `Unusually large pack size (${packSize}) - please verify`,
        value: packSize,
        severity: 'warning',
      });
    }
  }

  // Stock quantity validation - must be >= 0
  const stockPacks = Number(row.currentStockPacks);
  if (row.currentStockPacks !== undefined && row.currentStockPacks !== '') {
    if (isNaN(stockPacks)) {
      errors.push({
        row: rowNum,
        field: 'currentStockPacks',
        message: 'Stock quantity must be a valid number',
        value: row.currentStockPacks,
        severity: 'error',
      });
    } else if (stockPacks < 0) {
      errors.push({
        row: rowNum,
        field: 'currentStockPacks',
        message: 'Stock quantity cannot be negative',
        value: stockPacks,
        severity: 'error',
      });
    } else if (stockPacks > 1000000) {
      warnings.push({
        row: rowNum,
        field: 'currentStockPacks',
        message: `Very large stock quantity (${stockPacks.toLocaleString()}) - please verify`,
        value: stockPacks,
        severity: 'warning',
      });
    }
  }

  // Notification point validation
  const notifPoint = Number(row.notificationPoint);
  if (row.notificationPoint !== undefined && row.notificationPoint !== '') {
    if (isNaN(notifPoint)) {
      warnings.push({
        row: rowNum,
        field: 'notificationPoint',
        message: 'Notification point should be a number',
        value: row.notificationPoint,
        severity: 'warning',
      });
    } else if (notifPoint < 0) {
      warnings.push({
        row: rowNum,
        field: 'notificationPoint',
        message: 'Notification point should not be negative',
        value: notifPoint,
        severity: 'warning',
      });
    } else if (!isNaN(stockPacks) && stockPacks > 0 && notifPoint > stockPacks * 10) {
      warnings.push({
        row: rowNum,
        field: 'notificationPoint',
        message: `Notification point (${notifPoint}) is more than 10x current stock (${stockPacks}) - please verify`,
        value: notifPoint,
        severity: 'warning',
      });
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate order/transaction row data before saving.
 */
export function validateOrderRow(
  row: ParsedRow,
  rowNum: number
): ValidationResult {
  const errors: ValidationWarning[] = [];
  const warnings: ValidationWarning[] = [];

  // Required field validation
  if (!row.productId) {
    errors.push({
      row: rowNum,
      field: 'productId',
      message: 'Product ID is required',
      value: '',
      severity: 'error',
    });
  }

  if (!row.orderId) {
    errors.push({
      row: rowNum,
      field: 'orderId',
      message: 'Order ID is required',
      value: '',
      severity: 'error',
    });
  }

  // Quantity validation
  const qty = Number(row.quantityUnits);
  if (row.quantityUnits !== undefined && row.quantityUnits !== '') {
    if (isNaN(qty)) {
      errors.push({
        row: rowNum,
        field: 'quantityUnits',
        message: 'Quantity must be a valid number',
        value: row.quantityUnits,
        severity: 'error',
      });
    } else if (qty < 0) {
      errors.push({
        row: rowNum,
        field: 'quantityUnits',
        message: 'Quantity cannot be negative',
        value: qty,
        severity: 'error',
      });
    } else if (qty === 0) {
      warnings.push({
        row: rowNum,
        field: 'quantityUnits',
        message: 'Quantity is zero - this may indicate an issue',
        value: qty,
        severity: 'warning',
      });
    } else if (qty > 100000) {
      warnings.push({
        row: rowNum,
        field: 'quantityUnits',
        message: `Very large quantity (${qty.toLocaleString()}) - please verify`,
        value: qty,
        severity: 'warning',
      });
    }
  }

  // Date validation
  if (row.dateSubmitted) {
    const dateStr = String(row.dateSubmitted);
    const parsed = new Date(dateStr);

    if (isNaN(parsed.getTime())) {
      warnings.push({
        row: rowNum,
        field: 'dateSubmitted',
        message: `Could not parse date: "${dateStr}"`,
        value: dateStr,
        severity: 'warning',
      });
    } else {
      const now = new Date();
      const oneWeekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const fiveYearsAgo = new Date(now.getFullYear() - 5, now.getMonth(), now.getDate());

      if (parsed > oneWeekAhead) {
        warnings.push({
          row: rowNum,
          field: 'dateSubmitted',
          message: `Date is more than a week in the future (${parsed.toLocaleDateString()})`,
          value: dateStr,
          severity: 'warning',
        });
      } else if (parsed < fiveYearsAgo) {
        warnings.push({
          row: rowNum,
          field: 'dateSubmitted',
          message: `Date is more than 5 years old (${parsed.toLocaleDateString()})`,
          value: dateStr,
          severity: 'warning',
        });
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate all rows and return aggregated results.
 */
export function validateImportData(
  rows: ParsedRow[],
  mapping: ColumnMapping[],
  importType: 'inventory' | 'orders' | 'both'
): {
  isValid: boolean;
  totalErrors: number;
  totalWarnings: number;
  rowResults: ValidationResult[];
  summary: {
    errorsByField: Record<string, number>;
    warningsByField: Record<string, number>;
  };
} {
  const rowResults: ValidationResult[] = [];
  const errorsByField: Record<string, number> = {};
  const warningsByField: Record<string, number> = {};
  let totalErrors = 0;
  let totalWarnings = 0;

  for (let i = 0; i < rows.length; i++) {
    const cleanedRow = cleanRow(rows[i], mapping);
    const rowNum = i + 2; // 1-indexed + header row

    let result: ValidationResult;
    if (importType === 'inventory') {
      result = validateInventoryRow(cleanedRow, rowNum);
    } else if (importType === 'orders') {
      result = validateOrderRow(cleanedRow, rowNum);
    } else {
      // For 'both', combine validations
      const invResult = validateInventoryRow(cleanedRow, rowNum);
      const ordResult = validateOrderRow(cleanedRow, rowNum);
      result = {
        isValid: invResult.isValid && ordResult.isValid,
        errors: [...invResult.errors, ...ordResult.errors],
        warnings: [...invResult.warnings, ...ordResult.warnings],
      };
    }

    rowResults.push(result);
    totalErrors += result.errors.length;
    totalWarnings += result.warnings.length;

    // Aggregate by field
    for (const err of result.errors) {
      errorsByField[err.field] = (errorsByField[err.field] || 0) + 1;
    }
    for (const warn of result.warnings) {
      warningsByField[warn.field] = (warningsByField[warn.field] || 0) + 1;
    }
  }

  return {
    isValid: totalErrors === 0,
    totalErrors,
    totalWarnings,
    rowResults,
    summary: {
      errorsByField,
      warningsByField,
    },
  };
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
