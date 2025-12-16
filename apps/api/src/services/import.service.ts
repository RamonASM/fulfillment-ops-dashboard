import fs from "fs";
import path from "path";
import crypto from "crypto";
import Papa from "papaparse";
import * as xlsx from "xlsx";
import { prisma } from "../lib/prisma.js";
import { Prisma } from "@prisma/client";
import {
  recalculateClientUsage,
  recalculateClientMonthlyUsage,
} from "./usage.service.js";
import { runAlertGeneration } from "./alert.service.js";
import { discoverCustomFields } from "./custom-field.service.js";
import {
  similarityWithExpansion,
  getConfidenceScore,
  getConfidenceLevel,
  type ConfidenceLevel,
} from "../lib/string-similarity.js";
import {
  analyzeColumnDataType,
  validateQuantitySamples,
  validateProductIdSamples,
  validateDateSamples,
  validatePackSizeSamples,
  type ExpectedFieldType,
  type DetectedDataType,
} from "../lib/data-type-detection.js";
import {
  checkBlockingRule,
  calculateCoOccurrenceBoost,
  getMinimumConfidence,
  suggestAlternatives,
  checkSemanticCompatibility,
} from "../lib/field-groups.js";
import {
  getLearnedBoosts,
  applyLearnedBoost,
  type LearnedBoost,
} from "./mapping-learning.service.js";
import {
  detectFormulaRelationships,
  analyzeQuantityFields,
  type FormulaRelationship,
  type QuantityRelationship,
} from "../lib/formula-detection.js";

// =============================================================================
// TYPES
// =============================================================================

export interface ColumnMapping {
  source: string;
  mapsTo: string;
  confidence: number;
  confidenceLevel?: ConfidenceLevel;
  warnings?: string[];
  /** Detected data type for this column */
  detectedDataType?: DetectedDataType;
  /** Whether this is a custom field (not mapped to a known field) */
  isCustomField?: boolean;
  /** Whether this mapping was boosted by learned user corrections */
  isLearned?: boolean;
  /** Formula relationship if this column is calculated */
  formulaInfo?: {
    isCalculated: boolean;
    formula?: string;
    relatedColumns?: string[];
  };
  /** Quantity relationship info */
  quantityInfo?: {
    type: "units" | "packs" | "multiplier" | "total";
    relatedTo?: string[];
  };
}

/** Structure for storing custom fields in Product.metadata */
export interface CustomFieldValue {
  value: string | number | null;
  originalHeader: string;
  dataType: DetectedDataType;
  lastUpdated: string;
}

export interface ProductMetadata {
  customFields?: Record<string, CustomFieldValue>;
  _import?: {
    lastImportBatchId: string;
    originalHeaders: string[];
    mappedFields: string[];
    customFieldCount: number;
    importedAt: string;
  };
}

/** Result from cleanRow with both mapped data and custom fields */
interface CleanedRowResult {
  mappedData: ParsedRow;
  customFields: Record<string, CustomFieldValue>;
  allOriginalHeaders: string[];
}

// Enhanced field pattern with expected data type
interface FieldPattern {
  patterns: string[];
  mapsTo: string;
  expectedType?: ExpectedFieldType;
}

interface ImportResult {
  status: "completed" | "failed";
  processedCount: number;
  errorCount: number;
  errors: Array<{
    row: number;
    field?: string;
    message: string;
    value?: string;
  }>;
  newProducts: number;
  updatedProducts: number;
  newTransactions: number;
  skippedDuplicates: number;
}

interface ParsedRow {
  [key: string]: string | number | undefined;
}

export type DuplicateStrategy = "skip" | "overwrite" | "error" | "merge";

interface DuplicateCheckResult {
  isDuplicate: boolean;
  existingRecord?: unknown;
  duplicateType?: "file" | "database" | "in-file";
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
 * This function is now deprecated and should not be used for actual file parsing.
 * File parsing is delegated to the Python importer service.
 */
export async function parseFile(
  filePath: string,
): Promise<{ headers: string[]; rows: ParsedRow[] }> {
  throw new Error(
    "File parsing is now handled by the Python importer service. This Node.js function should not be called for actual parsing.",
  );
}

/**
 * This function is now deprecated as CSV/TSV parsing is handled by the Python importer service.
 */
function parseCSV(
  filePath: string,
  delimiter: string,
): Promise<{ headers: string[]; rows: ParsedRow[] }> {
  throw new Error("CSV parsing is now handled by the Python importer service.");
}

/**
 * This function is now deprecated as Excel parsing is handled by the Python importer service.
 */
function parseExcel(filePath: string): {
  headers: string[];
  rows: ParsedRow[];
} {
  throw new Error(
    "Excel parsing is now handled by the Python importer service.",
  );
}

/**
 * Parse a file for preview purposes only (analysis, column mapping UI).
 * This is a lightweight parser that returns headers and sample rows.
 * Full import processing is handled by the Python importer.
 *
 * @param filePath - Path to the CSV/TSV/Excel file
 * @param maxRows - Maximum number of rows to return (default 100)
 * @returns Headers and sample rows for preview/analysis
 */
export async function parseFilePreview(
  filePath: string,
  maxRows: number = 100,
): Promise<{ headers: string[]; rows: ParsedRow[] }> {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".csv" || ext === ".tsv") {
    // Use papaparse for CSV/TSV preview
    const content = fs.readFileSync(filePath, "utf-8");
    const delimiter = ext === ".tsv" ? "\t" : ",";

    const result = Papa.parse(content, {
      header: true,
      delimiter,
      preview: maxRows,
      skipEmptyLines: true,
      transformHeader: (header: string) => header.trim(),
    });

    if (result.errors && result.errors.length > 0) {
      console.warn("CSV parse warnings:", result.errors.slice(0, 3));
    }

    const headers = result.meta.fields || [];
    const rows = result.data as ParsedRow[];

    return { headers, rows };
  }

  if (ext === ".xlsx" || ext === ".xls") {
    // Use xlsx for Excel preview
    const workbook = xlsx.readFile(filePath, { sheetRows: maxRows + 1 });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    if (!sheet) {
      throw new Error("Excel file has no sheets");
    }

    const data = xlsx.utils.sheet_to_json(sheet, {
      defval: "",
      raw: false, // Convert all values to strings for consistency
    }) as ParsedRow[];

    // Extract headers from first row keys
    const headers = data.length > 0 ? Object.keys(data[0]) : [];
    const rows = data.slice(0, maxRows);

    return { headers, rows };
  }

  throw new Error(
    `Unsupported file format for preview: ${ext}. Supported: .csv, .tsv, .xlsx, .xls`,
  );
}

// =============================================================================
// AUTO-DETECTION
// =============================================================================

const INVENTORY_SIGNATURES = [
  "available quantity",
  "quantity multiplier",
  "total qty on hand",
  "notification point",
  "current notification point",
  "packs available",
  "pack size",
];

const ORDER_SIGNATURES = [
  "order id",
  "date submitted",
  "total quantity",
  "ship to",
  "order status",
  "order number",
  "qty ordered",
  "line item",
  "quantity multiplier",
  "extended price",
  "unit price",
  "ship to company",
  "ship to identifier",
];

/**
 * Detect file type from headers
 */
export function detectFileType(
  headers: string[],
): "inventory" | "orders" | "both" {
  const normalizedHeaders = headers.map((h) => h.toLowerCase().trim());

  const inventoryMatches = normalizedHeaders.filter((h) =>
    INVENTORY_SIGNATURES.some((sig) => h.includes(sig)),
  ).length;

  const orderMatches = normalizedHeaders.filter((h) =>
    ORDER_SIGNATURES.some((sig) => h.includes(sig)),
  ).length;

  if (inventoryMatches >= 2 && orderMatches >= 2) {
    return "both";
  }
  if (inventoryMatches >= 2) {
    return "inventory";
  }
  if (orderMatches >= 2) {
    return "orders";
  }

  return "inventory";
}

// =============================================================================
// COLUMN MAPPING
// =============================================================================

// Expanded inventory patterns with data type expectations
const INVENTORY_PATTERNS: FieldPattern[] = [
  {
    patterns: [
      "product id",
      "sku",
      "item id",
      "product code",
      "item code",
      "part number",
      "part #",
      "part no",
      "item #",
      "item no",
      "upc",
      "ean",
      "gtin",
      "asin",
      "isbn",
      "barcode",
      "internal id",
      "catalog number",
      "catalog #",
      "material number",
      "stock code",
      "inv id",
      "inventory id",
      "product sku",
    ],
    mapsTo: "productId",
    expectedType: "alphanumeric",
  },
  {
    patterns: [
      "product name",
      "item name",
      "description",
      "name",
      "title",
      "product description",
      "item description",
      "product title",
      "material description",
      "article name",
      "article description",
      "item title",
      "prod name",
      "prod desc",
      "short description",
    ],
    mapsTo: "name",
    expectedType: "text",
  },
  {
    patterns: [
      "available quantity",
      "qty available",
      "packs available",
      "current qty",
      "quantity on hand",
      "qty on hand",
      "qoh",
      "stock on hand",
      "soh",
      "available stock",
      "in stock",
      "inventory qty",
      "inventory quantity",
      "current stock",
      "stock qty",
      "available units",
      "units available",
      "on hand qty",
      "on-hand quantity",
      "warehouse qty",
      "whse qty",
      "total available",
      "available count",
      "stock count",
      "bin qty",
      "location qty",
      "avail qty",
      "avail",
      "available",
      "onhand",
      "physical count",
      "actual qty",
      "actual quantity",
    ],
    mapsTo: "currentStockPacks",
    expectedType: "numeric_positive",
  },
  {
    patterns: [
      "quantity multiplier",
      "pack size",
      "unit count",
      "units per pack",
      "case size",
      "case qty",
      "case quantity",
      "pack qty",
      "pack quantity",
      "units per case",
      "each per pack",
      "eaches per case",
      "inner pack",
      "outer pack",
      "selling unit",
      "uom qty",
      "unit of measure qty",
      "conversion factor",
      "multiplier",
      "qty per",
      "quantity per",
    ],
    mapsTo: "packSize",
    expectedType: "numeric_positive",
  },
  {
    patterns: [
      "notification point",
      "reorder point",
      "min qty",
      "reorder level",
      "minimum quantity",
      "minimum stock",
      "min stock",
      "safety stock",
      "safety level",
      "low stock threshold",
      "reorder threshold",
      "trigger point",
      "minimum level",
      "alert threshold",
      "min level",
      "reorder qty",
      "reorder quantity",
      "par level",
      "par",
    ],
    mapsTo: "notificationPoint",
    expectedType: "numeric_positive",
  },
  {
    patterns: [
      "item type",
      "product type",
      "type",
      "category",
      "classification",
      "product category",
      "item category",
      "class",
      "product class",
      "inventory type",
      "stock type",
      "material type",
      "item class",
      "abc class",
      "abc classification",
      "product group",
      "item group",
    ],
    mapsTo: "itemType",
    expectedType: "categorical",
  },
];

// =============================================================================
// EXTENDED FIELD PATTERNS (Custom Fields - Stored in metadata)
// These are valuable business fields that aren't core to the system but provide insights
// =============================================================================

const EXTENDED_FIELD_PATTERNS: FieldPattern[] = [
  // Financial fields
  {
    patterns: [
      "unit cost",
      "cost",
      "unit price",
      "price",
      "cost per unit",
      "wholesale price",
      "purchase price",
      "buy price",
      "acquisition cost",
      "landed cost",
      "cogs",
      "cost of goods",
      "material cost",
    ],
    mapsTo: "unitCost",
    expectedType: "numeric_positive",
  },
  {
    patterns: [
      "list price",
      "retail price",
      "sell price",
      "selling price",
      "msrp",
      "retail",
      "price each",
      "customer price",
      "sale price",
    ],
    mapsTo: "listPrice",
    expectedType: "numeric_positive",
  },
  {
    patterns: [
      "total value",
      "inventory value",
      "stock value",
      "extended cost",
      "total cost",
      "value",
      "ext cost",
      "extended value",
    ],
    mapsTo: "totalValue",
    expectedType: "numeric_positive",
  },
  {
    patterns: ["currency", "currency code", "curr", "ccy"],
    mapsTo: "currency",
    expectedType: "text",
  },
  // Vendor/Supplier fields
  {
    patterns: [
      "vendor",
      "vendor name",
      "supplier",
      "supplier name",
      "manufacturer",
      "brand",
      "brand name",
      "vendor company",
      "source",
      "mfg",
      "mfr",
      "manufacturer name",
      "supplier company",
    ],
    mapsTo: "vendorName",
    expectedType: "text",
  },
  {
    patterns: [
      "vendor code",
      "vendor id",
      "supplier code",
      "supplier id",
      "vendor number",
      "supplier number",
      "vendor #",
      "supplier #",
    ],
    mapsTo: "vendorCode",
    expectedType: "alphanumeric",
  },
  {
    patterns: [
      "lead time",
      "lead time days",
      "delivery time",
      "shipping time",
      "replenishment time",
      "procurement time",
      "lt days",
      "lt",
      "days to ship",
      "transit time",
      "transit days",
    ],
    mapsTo: "leadTimeDays",
    expectedType: "numeric_positive",
  },
  {
    patterns: [
      "moq",
      "minimum order",
      "minimum order quantity",
      "min order qty",
      "min order",
      "order minimum",
      "minimum qty",
      "min purchase qty",
    ],
    mapsTo: "minimumOrderQuantity",
    expectedType: "numeric_positive",
  },
  {
    patterns: [
      "vendor sku",
      "supplier sku",
      "manufacturer sku",
      "mfg part",
      "mfr part",
      "vendor part number",
      "supplier part number",
    ],
    mapsTo: "vendorSku",
    expectedType: "alphanumeric",
  },
  // Logistics fields
  {
    patterns: [
      "warehouse",
      "warehouse code",
      "warehouse name",
      "whse",
      "wh",
      "storage location",
      "facility",
      "facility code",
    ],
    mapsTo: "warehouse",
    expectedType: "text",
  },
  {
    patterns: [
      "bin",
      "bin location",
      "bin code",
      "bin number",
      "slot",
      "shelf",
      "shelf location",
      "rack",
      "rack location",
      "aisle",
      "zone",
      "location code",
      "storage bin",
    ],
    mapsTo: "binLocation",
    expectedType: "alphanumeric",
  },
  {
    patterns: [
      "weight",
      "unit weight",
      "item weight",
      "weight lbs",
      "weight kg",
      "gross weight",
      "net weight",
      "wt",
    ],
    mapsTo: "weight",
    expectedType: "numeric_positive",
  },
  {
    patterns: [
      "dimensions",
      "size",
      "length",
      "width",
      "height",
      "lwh",
      "l x w x h",
      "dim",
      "package size",
    ],
    mapsTo: "dimensions",
    expectedType: "text",
  },
  {
    patterns: [
      "country of origin",
      "origin",
      "made in",
      "coo",
      "source country",
    ],
    mapsTo: "countryOfOrigin",
    expectedType: "text",
  },
  // Category/Classification fields
  {
    patterns: [
      "product category",
      "category",
      "main category",
      "primary category",
      "category name",
      "product group",
      "merchandise category",
    ],
    mapsTo: "productCategory",
    expectedType: "categorical",
  },
  {
    patterns: [
      "subcategory",
      "sub category",
      "sub-category",
      "secondary category",
      "product subcategory",
      "category 2",
      "category level 2",
    ],
    mapsTo: "subcategory",
    expectedType: "categorical",
  },
  {
    patterns: ["brand", "brand name", "product brand", "make"],
    mapsTo: "brand",
    expectedType: "text",
  },
  {
    patterns: ["department", "dept", "division", "business unit"],
    mapsTo: "department",
    expectedType: "categorical",
  },
  // Status/Lifecycle fields
  {
    patterns: [
      "product status",
      "status",
      "active",
      "lifecycle",
      "item status",
      "availability status",
      "selling status",
    ],
    mapsTo: "productStatus",
    expectedType: "categorical",
  },
  {
    patterns: [
      "discontinue",
      "discontinued",
      "end of life",
      "eol",
      "obsolete",
      "phase out",
      "phased out",
    ],
    mapsTo: "isDiscontinued",
    expectedType: "categorical",
  },
  {
    patterns: [
      "last ordered",
      "last order date",
      "last purchase date",
      "last po date",
      "last receipt date",
      "last received",
    ],
    mapsTo: "lastOrderedDate",
    expectedType: "date",
  },
  {
    patterns: [
      "last sold",
      "last sale date",
      "last transaction",
      "last activity",
    ],
    mapsTo: "lastSoldDate",
    expectedType: "date",
  },
  // Notes/Comments
  {
    patterns: [
      "notes",
      "comments",
      "remarks",
      "memo",
      "internal notes",
      "product notes",
      "item notes",
      "special instructions",
    ],
    mapsTo: "notes",
    expectedType: "text",
  },
];

// Expanded order patterns with data type expectations
const ORDER_PATTERNS: FieldPattern[] = [
  {
    patterns: [
      "product id",
      "sku",
      "item id",
      "item sku",
      "product sku",
      "article number",
      "material number",
      "item number",
      "item #",
      "part number",
      "part #",
      "stock code",
      "product code",
    ],
    mapsTo: "productId",
    expectedType: "alphanumeric",
  },
  {
    patterns: [
      "product name",
      "item name",
      "name",
      "description",
      "item description",
      "product description",
      "article description",
      "material description",
    ],
    mapsTo: "productName",
    expectedType: "text",
  },
  {
    patterns: [
      "order id",
      "order number",
      "order #",
      "po number",
      "po #",
      "purchase order",
      "purchase order number",
      "sales order",
      "sales order number",
      "so number",
      "so #",
      "reference number",
      "ref number",
      "ref #",
      "transaction id",
      "tx id",
      "txn id",
      "order no",
      "po no",
      "document number",
      "doc number",
      "doc #",
      "confirmation number",
      "confirmation #",
      "invoice number",
      "invoice #",
    ],
    mapsTo: "orderId",
    expectedType: "alphanumeric",
  },
  {
    patterns: [
      "date submitted",
      "order date",
      "date",
      "submit date",
      "submission date",
      "created date",
      "creation date",
      "placed date",
      "date placed",
      "transaction date",
      "tx date",
      "order datetime",
      "datetime",
      "date ordered",
      "ordered date",
      "date created",
      "timestamp",
      "entry date",
      "booking date",
      "processed date",
    ],
    mapsTo: "dateSubmitted",
    expectedType: "date",
  },
  {
    patterns: [
      "qty ordered",
      "quantity ordered",
      "order qty",
      "order quantity",
      "units ordered",
      "shipped qty",
      "ship qty",
      "qty shipped",
      "quantity shipped",
      "line qty",
      "line quantity",
      "unit qty",
    ],
    mapsTo: "quantityUnits",
    expectedType: "numeric_positive",
  },
  {
    patterns: [
      "ship to company",
      "ship to name",
      "customer",
      "company",
      "customer name",
      "recipient",
      "recipient name",
      "consignee",
      "ship to",
      "shipto",
      "deliver to",
      "delivery name",
      "account name",
      "client name",
      "buyer",
      "buyer name",
      "sold to",
      "sold to name",
      "bill to name",
      "billto name",
      "company name",
      "organization",
    ],
    mapsTo: "shipToCompany",
    expectedType: "text",
  },
  {
    patterns: [
      "ship to location",
      "ship to address",
      "address",
      "location",
      "delivery address",
      "shipping address",
      "destination",
      "ship address",
      "deliver to address",
      "consignee address",
      "full address",
      "street address",
      "delivery location",
      "site",
      "site name",
      "warehouse",
      "store",
      "store name",
      "branch",
      "facility",
    ],
    mapsTo: "shipToLocation",
    expectedType: "text",
  },
  {
    patterns: [
      "order status",
      "status",
      "state",
      "order state",
      "fulfillment status",
      "shipment status",
      "delivery status",
      "processing status",
      "line status",
      "item status",
      "completion status",
    ],
    mapsTo: "orderStatus",
    expectedType: "categorical",
  },
  // Granular shipping address fields
  {
    patterns: [
      "ship to street",
      "ship to street 1",
      "ship to address 1",
      "shipping street",
      "street address",
      "address line 1",
      "address 1",
      "street 1",
      "street",
      "delivery street",
      "ship street",
      "address line",
      "ship to addr",
    ],
    mapsTo: "shipToStreet1",
    expectedType: "text",
  },
  {
    patterns: [
      "ship to street 2",
      "ship to address 2",
      "address line 2",
      "address 2",
      "street 2",
      "apt",
      "suite",
      "unit",
      "apartment",
      "floor",
      "building",
      "ship to apt",
      "ship to suite",
    ],
    mapsTo: "shipToStreet2",
    expectedType: "text",
  },
  {
    patterns: [
      "ship to city",
      "city",
      "shipping city",
      "delivery city",
      "town",
      "municipality",
      "ship city",
      "destination city",
    ],
    mapsTo: "shipToCity",
    expectedType: "text",
  },
  {
    patterns: [
      "ship to state",
      "state",
      "province",
      "region",
      "shipping state",
      "delivery state",
      "ship state",
      "state/province",
      "st",
    ],
    mapsTo: "shipToState",
    expectedType: "text",
  },
  {
    patterns: [
      "ship to zip",
      "zip",
      "zip code",
      "postal code",
      "postal",
      "postcode",
      "shipping zip",
      "delivery zip",
      "ship zip",
      "zipcode",
      "zip/postal",
    ],
    mapsTo: "shipToZip",
    expectedType: "alphanumeric",
  },
  {
    patterns: [
      "ship to country",
      "country",
      "country code",
      "shipping country",
      "delivery country",
      "ship country",
      "nation",
      "destination country",
    ],
    mapsTo: "shipToCountry",
    expectedType: "text",
  },
  {
    patterns: [
      "ship to phone",
      "phone",
      "phone number",
      "telephone",
      "tel",
      "contact phone",
      "shipping phone",
      "delivery phone",
      "mobile",
      "cell",
    ],
    mapsTo: "shipToPhone",
    expectedType: "alphanumeric",
  },
  {
    patterns: [
      "ship to email",
      "email",
      "email address",
      "e-mail",
      "shipping email",
      "delivery email",
      "contact email",
      "recipient email",
    ],
    mapsTo: "shipToEmail",
    expectedType: "text",
  },
  {
    patterns: [
      "ship to id",
      "ship to identifier",
      "location id",
      "location code",
      "site id",
      "site code",
      "destination id",
      "store number",
      "store #",
      "branch code",
      "branch id",
      "facility id",
      "facility code",
    ],
    mapsTo: "shipToIdentifier",
    expectedType: "alphanumeric",
  },
  // User/Contact fields (who placed the order)
  {
    patterns: [
      "ordered by",
      "user",
      "requester",
      "submitted by",
      "created by",
      "placed by",
      "requested by",
      "buyer",
      "purchaser",
      "order creator",
      "entered by",
      "order by",
      "ordering user",
      "requestor",
    ],
    mapsTo: "orderedBy",
    expectedType: "text",
  },
  {
    patterns: [
      "contact name",
      "attention",
      "attn",
      "care of",
      "c/o",
      "recipient contact",
      "ship to attention",
      "delivery contact",
    ],
    mapsTo: "contactName",
    expectedType: "text",
  },
  {
    patterns: [
      "customer id",
      "customer number",
      "customer #",
      "account number",
      "account #",
      "account id",
      "client id",
      "client number",
      "client #",
      "buyer id",
      "buyer number",
    ],
    mapsTo: "customerId",
    expectedType: "alphanumeric",
  },
  // Financial/Pricing fields
  {
    patterns: [
      "unit price",
      "price per unit",
      "price each",
      "price/unit",
      "unit prc",
      "item price",
      "line price",
      "sell price",
      "selling price",
      "each price",
    ],
    mapsTo: "unitPrice",
    expectedType: "numeric_positive",
  },
  {
    patterns: [
      "extended price",
      "ext price",
      "extended",
      "line total",
      "line amount",
      "extended amount",
      "ext amt",
      "item total",
      "line value",
      "ext prc",
    ],
    mapsTo: "extendedPrice",
    expectedType: "numeric_positive",
  },
  {
    patterns: [
      "discount",
      "discount amount",
      "disc",
      "discount %",
      "discount pct",
      "discount percent",
      "line discount",
      "promo discount",
    ],
    mapsTo: "discount",
    expectedType: "numeric",
  },
  {
    patterns: [
      "tax",
      "tax amount",
      "sales tax",
      "vat",
      "tax amt",
      "taxes",
      "tax total",
      "tax value",
      "gst",
      "hst",
    ],
    mapsTo: "taxAmount",
    expectedType: "numeric_positive",
  },
  {
    patterns: [
      "total price",
      "total",
      "grand total",
      "order total",
      "final total",
      "total amount",
      "total value",
      "invoice total",
      "total cost",
    ],
    mapsTo: "totalPrice",
    expectedType: "numeric_positive",
  },
  // Order detail fields
  {
    patterns: [
      "line number",
      "line #",
      "line no",
      "row number",
      "row #",
      "row no",
      "item number",
      "seq",
      "sequence",
      "line id",
      "detail line",
    ],
    mapsTo: "lineNumber",
    expectedType: "numeric_positive",
  },
  {
    patterns: [
      "line item id",
      "detail id",
      "line item number",
      "item line id",
      "order line id",
      "order detail id",
    ],
    mapsTo: "lineItemId",
    expectedType: "alphanumeric",
  },
  {
    patterns: [
      "ship method",
      "shipping method",
      "carrier",
      "ship via",
      "shipping carrier",
      "delivery method",
      "freight",
      "shipment method",
      "service level",
      "shipping service",
      "delivery service",
      "courier",
    ],
    mapsTo: "shipMethod",
    expectedType: "text",
  },
  {
    patterns: [
      "tracking number",
      "tracking #",
      "tracking no",
      "track number",
      "shipment tracking",
      "carrier tracking",
      "tracking id",
      "tracking code",
    ],
    mapsTo: "trackingNumber",
    expectedType: "alphanumeric",
  },
  {
    patterns: [
      "ship date",
      "shipped date",
      "shipment date",
      "date shipped",
      "shipping date",
      "dispatch date",
      "date dispatched",
    ],
    mapsTo: "shipDate",
    expectedType: "date",
  },
  {
    patterns: [
      "delivery date",
      "expected delivery",
      "eta",
      "estimated delivery",
      "arrive date",
      "arrival date",
      "due date",
      "required date",
      "need by date",
      "request date",
      "deliver by",
    ],
    mapsTo: "expectedDeliveryDate",
    expectedType: "date",
  },
  {
    patterns: [
      "ship weight",
      "weight",
      "package weight",
      "shipment weight",
      "total weight",
      "gross weight",
      "shipping weight",
    ],
    mapsTo: "shipWeight",
    expectedType: "numeric_positive",
  },
  // Quantity fields (packs vs units)
  {
    patterns: [
      "quantity packs",
      "qty packs",
      "packs ordered",
      "packs qty",
      "cases ordered",
      "cases qty",
      "cartons",
      "boxes",
      "pack quantity",
    ],
    mapsTo: "quantityPacks",
    expectedType: "numeric_positive",
  },

  // =============================================================================
  // NEW FIELD PATTERNS - Fix semantic mismatches
  // =============================================================================

  // Order type - categorical field, NOT financial
  {
    patterns: [
      "order type",
      "type of order",
      "order category",
      "order classification",
      "transaction type",
      "sale type",
      "request type",
    ],
    mapsTo: "orderType",
    expectedType: "categorical",
  },

  // Person name fields - should NOT map to address components
  {
    patterns: [
      "ship to first name",
      "first name",
      "firstname",
      "fname",
      "given name",
      "ship to fname",
      "recipient first name",
      "delivery first name",
    ],
    mapsTo: "shipToFirstName",
    expectedType: "text",
  },
  {
    patterns: [
      "ship to last name",
      "last name",
      "lastname",
      "lname",
      "surname",
      "family name",
      "ship to lname",
      "recipient last name",
      "delivery last name",
    ],
    mapsTo: "shipToLastName",
    expectedType: "text",
  },
  {
    patterns: ["contact first name", "buyer first name", "customer first name"],
    mapsTo: "contactFirstName",
    expectedType: "text",
  },
  {
    patterns: ["contact last name", "buyer last name", "customer last name"],
    mapsTo: "contactLastName",
    expectedType: "text",
  },
  {
    patterns: ["full name", "recipient name", "addressee", "ship to name"],
    mapsTo: "fullName",
    expectedType: "text",
  },

  // Quantity multiplier / Total quantity - distinct from quantityUnits
  {
    patterns: [
      "quantity multiplier",
      "multiplier",
      "pack multiplier",
      "qty multiplier",
      "conversion factor",
      "factor",
      "per pack",
      "units per pack",
    ],
    mapsTo: "quantityMultiplier",
    expectedType: "numeric_positive",
  },
  {
    patterns: [
      "total quantity",
      "total qty",
      "total units",
      "aggregate quantity",
      "sum quantity",
      "sum qty",
      "total count",
      "grand total qty",
    ],
    mapsTo: "totalQuantity",
    expectedType: "numeric_positive",
  },

  // Contact info - distinct phone/email fields
  {
    patterns: ["contact phone", "buyer phone", "customer phone", "order phone"],
    mapsTo: "contactPhone",
    expectedType: "alphanumeric",
  },
  {
    patterns: ["contact email", "buyer email", "customer email", "order email"],
    mapsTo: "contactEmail",
    expectedType: "text",
  },

  // Customized product fields
  {
    patterns: [
      "customized product id",
      "custom product id",
      "personalized id",
      "customized sku",
      "custom sku",
      "personalized product",
    ],
    mapsTo: "customizedProductId",
    expectedType: "alphanumeric",
  },
];

/**
 * Generate column mappings based on headers using fuzzy matching.
 * Uses Jaro-Winkler similarity with abbreviation expansion for better accuracy.
 * Now includes blocking rules to prevent bad mappings and co-occurrence boosting.
 */
export function generateColumnMapping(
  headers: string[],
  fileType: "inventory" | "orders" | "both",
  sampleRows?: ParsedRow[],
): ColumnMapping[] {
  // Core patterns for required fields
  const corePatterns =
    fileType === "both"
      ? [...INVENTORY_PATTERNS, ...ORDER_PATTERNS]
      : fileType === "inventory"
        ? INVENTORY_PATTERNS
        : ORDER_PATTERNS;

  // Include extended patterns for rich data preservation
  const allPatterns = [...corePatterns, ...EXTENDED_FIELD_PATTERNS];

  const mappings: ColumnMapping[] = [];
  const usedTargets = new Set<string>();
  const usedExtendedTargets = new Set<string>();
  const matchedFields = new Set<string>(); // For co-occurrence boosting

  // Two-pass approach: first pass collects high-confidence matches for boosting
  const firstPassResults: Array<{
    header: string;
    mapsTo: string;
    confidence: number;
    isExtended: boolean;
  }> = [];

  // First pass: identify high-confidence matches
  for (const header of headers) {
    const result = findBestMatchForHeader(
      header,
      corePatterns,
      EXTENDED_FIELD_PATTERNS,
      sampleRows,
      new Set(), // No co-occurrence boost in first pass
    );
    if (result.confidence >= 0.7) {
      firstPassResults.push({
        header,
        mapsTo: result.mapsTo,
        confidence: result.confidence,
        isExtended: result.isExtended,
      });
      matchedFields.add(result.mapsTo);
    }
  }

  // Second pass: apply co-occurrence boosting and blocking rules
  for (const header of headers) {
    const normalizedHeader = header.toLowerCase().trim();
    let bestMatch = findBestMatchForHeader(
      header,
      corePatterns,
      EXTENDED_FIELD_PATTERNS,
      sampleRows,
      matchedFields, // Apply co-occurrence boost
    );

    // Apply blocking rules - check if the best match should be blocked
    if (bestMatch.mapsTo) {
      const blockingRule = checkBlockingRule(header, bestMatch.mapsTo);
      if (blockingRule) {
        // This mapping is blocked! Find an alternative or clear it
        const alternatives = suggestAlternatives(header, bestMatch.mapsTo);

        if (alternatives.length > 0) {
          // Try to find a match among alternatives
          let foundAlternative = false;
          for (const altField of alternatives) {
            // Find patterns for this alternative field
            const altPattern = [
              ...corePatterns,
              ...EXTENDED_FIELD_PATTERNS,
            ].find((p) => p.mapsTo === altField);
            if (
              altPattern &&
              !usedTargets.has(altField) &&
              !usedExtendedTargets.has(altField)
            ) {
              // Check if this alternative passes blocking rules
              const altBlocked = checkBlockingRule(header, altField);
              if (!altBlocked) {
                // Use this alternative
                bestMatch = {
                  mapsTo: altField,
                  confidence: Math.max(0.65, bestMatch.confidence * 0.9), // Slightly reduced confidence
                  warnings: [
                    `Auto-corrected from "${bestMatch.mapsTo}" to "${altField}"`,
                  ],
                  isExtended: !corePatterns.some((p) => p.mapsTo === altField),
                };
                foundAlternative = true;
                break;
              }
            }
          }

          if (!foundAlternative) {
            // No valid alternative found, mark as custom field
            bestMatch = {
              mapsTo: normalizeFieldName(header),
              confidence: 0,
              warnings: [
                `Blocked mapping to "${bestMatch.mapsTo}" - ${blockingRule.reason}`,
              ],
              isExtended: true,
            };
          }
        } else {
          // No alternatives suggested, clear the mapping
          bestMatch = {
            mapsTo: normalizeFieldName(header),
            confidence: 0,
            warnings: [
              `Blocked mapping to "${bestMatch.mapsTo}" - ${blockingRule.reason}`,
            ],
            isExtended: true,
          };
        }
      }
    }

    // Check minimum confidence threshold for the field
    if (bestMatch.mapsTo && bestMatch.confidence > 0) {
      const minConfidence = getMinimumConfidence(bestMatch.mapsTo);
      if (bestMatch.confidence < minConfidence) {
        // Below minimum threshold for this field type
        bestMatch.warnings.push(
          `Low confidence (${Math.round(bestMatch.confidence * 100)}%) - requires ${Math.round(minConfidence * 100)}% for "${bestMatch.mapsTo}"`,
        );
      }
    }

    // Detect data type for all columns (useful for custom fields and validation)
    let detectedDataType: DetectedDataType = "text";
    if (sampleRows && sampleRows.length > 0) {
      const sampleValues = sampleRows.slice(0, 20).map((row) => row[header]);
      const analysis = analyzeColumnDataType(sampleValues);
      detectedDataType = analysis.detectedType;
    }

    // Generate warnings for low confidence
    if (bestMatch.confidence > 0 && bestMatch.confidence < 0.7) {
      if (!bestMatch.warnings.some((w) => w.includes("Low confidence"))) {
        bestMatch.warnings.push(
          `Low confidence match - please verify "${header}" maps to "${bestMatch.mapsTo}"`,
        );
      }
    }

    // Mark target as used if high confidence
    if (bestMatch.mapsTo && bestMatch.confidence >= 0.7) {
      if (bestMatch.isExtended) {
        usedExtendedTargets.add(bestMatch.mapsTo);
      } else {
        usedTargets.add(bestMatch.mapsTo);
      }
    }

    // Determine if this is a custom field
    const isCustomField =
      !bestMatch.mapsTo || bestMatch.isExtended || bestMatch.confidence < 0.5;

    mappings.push({
      source: header,
      mapsTo: bestMatch.mapsTo || normalizeFieldName(header),
      confidence: bestMatch.confidence,
      confidenceLevel: getConfidenceLevel(bestMatch.confidence),
      warnings: bestMatch.warnings.length > 0 ? bestMatch.warnings : undefined,
      detectedDataType,
      isCustomField,
    });
  }

  // Resolve conflicts - if multiple columns map to same target, keep highest confidence
  return resolveConflicts(mappings);
}

/**
 * Find the best matching field for a header.
 * Now includes semantic compatibility checking to prevent mismatches.
 */
function findBestMatchForHeader(
  header: string,
  corePatterns: FieldPattern[],
  extendedPatterns: FieldPattern[],
  sampleRows: ParsedRow[] | undefined,
  matchedFields: Set<string>,
): {
  mapsTo: string;
  confidence: number;
  warnings: string[];
  isExtended: boolean;
} {
  const normalizedHeader = header.toLowerCase().trim();
  let bestMatch = {
    mapsTo: "",
    confidence: 0,
    warnings: [] as string[],
    isExtended: false,
  };

  // Detect data type from sample data for semantic compatibility checking
  let detectedDataType: string | undefined;
  if (sampleRows && sampleRows.length > 0) {
    const sampleValues = sampleRows.slice(0, 10).map((row) => row[header]);
    const analysis = analyzeColumnDataType(sampleValues);
    detectedDataType = analysis.detectedType;
  }

  // First, try to match against core patterns
  for (const { patterns: patternList, mapsTo, expectedType } of corePatterns) {
    for (const pattern of patternList) {
      let similarity: number;

      if (normalizedHeader === pattern) {
        similarity = 1.0;
      } else {
        similarity = similarityWithExpansion(normalizedHeader, pattern);
      }

      // Apply co-occurrence boosting
      const boost = calculateCoOccurrenceBoost(mapsTo, matchedFields);
      similarity = Math.min(1.0, similarity + boost);

      // Apply semantic compatibility check - penalize semantically incompatible matches
      const semanticCheck = checkSemanticCompatibility(
        header,
        mapsTo,
        detectedDataType,
      );
      if (!semanticCheck.compatible) {
        // Heavily penalize semantically incompatible matches
        similarity = similarity * 0.3;
      }

      if (
        similarity > 0.5 &&
        sampleRows &&
        sampleRows.length > 0 &&
        expectedType
      ) {
        const sampleValues = sampleRows.slice(0, 10).map((row) => row[header]);
        const typeValidation = validateSampleDataType(
          sampleValues,
          expectedType,
          mapsTo,
        );

        if (typeValidation.isValid) {
          similarity = Math.min(1.0, similarity + 0.1);
        } else if (typeValidation.matchRatio < 0.5) {
          similarity = similarity * 0.8;
        }
      }

      if (similarity > bestMatch.confidence) {
        const warnings: string[] = [];
        if (!semanticCheck.compatible && semanticCheck.reason) {
          warnings.push(`Semantic warning: ${semanticCheck.reason}`);
        }
        bestMatch = {
          mapsTo,
          confidence: similarity,
          warnings,
          isExtended: false,
        };
      }
    }
  }

  // If no good match in core patterns, try extended patterns
  if (bestMatch.confidence < 0.7) {
    for (const {
      patterns: patternList,
      mapsTo,
      expectedType,
    } of extendedPatterns) {
      for (const pattern of patternList) {
        let similarity: number;

        if (normalizedHeader === pattern) {
          similarity = 1.0;
        } else {
          similarity = similarityWithExpansion(normalizedHeader, pattern);
        }

        // Apply co-occurrence boosting
        const boost = calculateCoOccurrenceBoost(mapsTo, matchedFields);
        similarity = Math.min(1.0, similarity + boost);

        // Apply semantic compatibility check - penalize semantically incompatible matches
        const semanticCheck = checkSemanticCompatibility(
          header,
          mapsTo,
          detectedDataType,
        );
        if (!semanticCheck.compatible) {
          similarity = similarity * 0.3;
        }

        if (
          similarity > 0.5 &&
          sampleRows &&
          sampleRows.length > 0 &&
          expectedType
        ) {
          const sampleValues = sampleRows
            .slice(0, 10)
            .map((row) => row[header]);
          const typeValidation = validateSampleDataType(
            sampleValues,
            expectedType,
            mapsTo,
          );

          if (typeValidation.isValid) {
            similarity = Math.min(1.0, similarity + 0.1);
          } else if (typeValidation.matchRatio < 0.5) {
            similarity = similarity * 0.8;
          }
        }

        if (similarity > bestMatch.confidence) {
          const warnings: string[] = [];
          if (!semanticCheck.compatible && semanticCheck.reason) {
            warnings.push(`Semantic warning: ${semanticCheck.reason}`);
          }
          bestMatch = {
            mapsTo,
            confidence: similarity,
            warnings,
            isExtended: true,
          };
        }
      }
    }
  }

  return bestMatch;
}

/**
 * Resolve conflicts when multiple columns map to the same target field.
 * Keeps the highest confidence mapping and marks others for review.
 */
function resolveConflicts(mappings: ColumnMapping[]): ColumnMapping[] {
  // Group mappings by target field
  const targetGroups = new Map<string, ColumnMapping[]>();
  for (const mapping of mappings) {
    if (mapping.mapsTo && mapping.confidence >= 0.5) {
      const existing = targetGroups.get(mapping.mapsTo) || [];
      existing.push(mapping);
      targetGroups.set(mapping.mapsTo, existing);
    }
  }

  // Find conflicts (same target, multiple sources)
  const conflicts = new Map<string, ColumnMapping>();
  for (const [target, group] of targetGroups) {
    if (group.length > 1) {
      // Sort by confidence, keep highest
      group.sort((a, b) => b.confidence - a.confidence);
      conflicts.set(target, group[0]); // Winner

      // Mark losers
      for (let i = 1; i < group.length; i++) {
        const loser = group[i];
        loser.warnings = loser.warnings || [];
        loser.warnings.push(
          `Conflict: "${group[0].source}" also maps to "${target}" with higher confidence (${Math.round(group[0].confidence * 100)}%)`,
        );
        // Reduce confidence so it shows as needing review
        loser.confidence = Math.min(loser.confidence, 0.45);
        loser.confidenceLevel = getConfidenceLevel(loser.confidence);
        loser.isCustomField = true;
      }
    }
  }

  return mappings;
}

/**
 * Generate column mappings with learning from past user corrections.
 * This is the async version that fetches learned boosts from the database.
 */
export async function generateColumnMappingWithLearning(
  headers: string[],
  fileType: "inventory" | "orders" | "both",
  clientId: string,
  sampleRows?: ParsedRow[],
): Promise<ColumnMapping[]> {
  // Get learned boosts for this client
  const learnedBoosts = await getLearnedBoosts(clientId, headers);

  // Generate base mappings
  const mappings = generateColumnMapping(headers, fileType, sampleRows);

  // Apply learned boosts to each mapping
  for (const mapping of mappings) {
    if (mapping.confidence > 0) {
      const { confidence, isLearned } = applyLearnedBoost(
        mapping.source,
        mapping.mapsTo,
        mapping.confidence,
        learnedBoosts,
      );
      mapping.confidence = confidence;
      mapping.confidenceLevel = getConfidenceLevel(confidence);
      mapping.isLearned = isLearned;

      if (isLearned) {
        // Add a note that this was learned from previous corrections
        mapping.warnings = mapping.warnings || [];
        mapping.warnings.push("Mapping improved from previous corrections");
      }
    }

    // Also check if there's a learned boost suggesting a different field
    const boost = learnedBoosts.get(normalizeHeaderForLearning(mapping.source));
    if (
      boost &&
      boost.boostedField !== mapping.mapsTo &&
      mapping.confidence < 0.7
    ) {
      // Suggest the learned field as an alternative
      mapping.warnings = mapping.warnings || [];
      mapping.warnings.push(
        `Previously mapped to "${boost.boostedField}" (${boost.correctionCount} times)`,
      );
    }
  }

  // Run formula detection if we have sample rows
  if (sampleRows && sampleRows.length > 0) {
    try {
      const formulaResult = detectFormulaRelationships(headers, sampleRows);

      // Add formula info to mappings
      for (const relationship of formulaResult.relationships) {
        const resultMapping = mappings.find(
          (m) => m.source === relationship.resultColumn,
        );
        if (resultMapping) {
          resultMapping.formulaInfo = {
            isCalculated: true,
            formula: relationship.formula,
            relatedColumns: relationship.operandColumns,
          };
          resultMapping.warnings = resultMapping.warnings || [];
          resultMapping.warnings.push(
            `Calculated field: ${relationship.formula}`,
          );
        }
      }

      // Add quantity relationship info
      const quantityAnalysis = analyzeQuantityFields(headers, sampleRows);
      for (const [header, suggestedField] of Object.entries(
        quantityAnalysis.suggestedMappings,
      )) {
        const mapping = mappings.find((m) => m.source === header);
        if (mapping) {
          // Determine quantity type from suggested field
          let qtyType: "units" | "packs" | "multiplier" | "total" = "units";
          if (suggestedField === "totalQuantity") qtyType = "total";
          else if (suggestedField === "quantityPacks") qtyType = "packs";
          else if (suggestedField === "packSize") qtyType = "multiplier";

          mapping.quantityInfo = {
            type: qtyType,
            relatedTo: quantityAnalysis.quantityInfo
              .filter(
                (q) =>
                  q.relatedColumns.includes(header) ||
                  q.primaryColumn === header,
              )
              .flatMap((q) => [...q.relatedColumns, q.primaryColumn])
              .filter((c) => c !== header),
          };

          // If current mapping is low confidence, suggest the analyzed field
          if (mapping.confidence < 0.7 && suggestedField !== mapping.mapsTo) {
            mapping.warnings = mapping.warnings || [];
            mapping.warnings.push(
              `Consider mapping to "${suggestedField}" based on data analysis`,
            );
          }
        }
      }

      // Add quantity warnings
      for (const warning of quantityAnalysis.warnings) {
        // Add to relevant mappings
        for (const mapping of mappings) {
          if (warning.includes(mapping.source)) {
            mapping.warnings = mapping.warnings || [];
            mapping.warnings.push(warning);
          }
        }
      }

      // Add formula suggestions to relevant mappings
      for (const suggestion of formulaResult.suggestions) {
        for (const colName of suggestion.affectedColumns) {
          const mapping = mappings.find((m) => m.source === colName);
          if (mapping) {
            mapping.warnings = mapping.warnings || [];
            mapping.warnings.push(suggestion.message);
          }
        }
      }
    } catch (error) {
      // Don't fail the entire mapping if formula detection fails
      console.error("Formula detection error:", error);
    }
  }

  return mappings;
}

/**
 * Normalize header for learning lookup (matches the normalization in mapping-learning.service.ts)
 */
function normalizeHeaderForLearning(header: string): string {
  return header
    .toLowerCase()
    .trim()
    .replace(/[()[\]{}]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^(ship to|ship|shipping|deliver to|delivery)\s+/i, "")
    .trim();
}

/**
 * Normalize a header name to a consistent field name for custom fields.
 * Converts "Unit Cost (USD)" to "unitCostUsd", etc.
 */
function normalizeFieldName(header: string): string {
  return (
    header
      .toLowerCase()
      .trim()
      // Remove common special characters
      .replace(/[()[\]{}]/g, "")
      // Replace spaces, dashes, underscores with spaces for word splitting
      .replace(/[-_\s]+/g, " ")
      // Split into words
      .split(" ")
      .filter((word) => word.length > 0)
      // Convert to camelCase
      .map((word, index) =>
        index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1),
      )
      .join("")
  );
}

/**
 * Validate sample data against expected field type.
 */
function validateSampleDataType(
  values: (string | number | undefined)[],
  expectedType: ExpectedFieldType,
  fieldName: string,
): { isValid: boolean; matchRatio: number } {
  switch (fieldName) {
    case "productId":
      return validateProductIdSamples(values);
    case "currentStockPacks":
    case "packSize":
    case "notificationPoint":
    case "quantityUnits":
      return validateQuantitySamples(values);
    case "dateSubmitted":
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
  severity: "error" | "warning" | "info";
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
  rowNum: number,
): ValidationResult {
  const errors: ValidationWarning[] = [];
  const warnings: ValidationWarning[] = [];

  // Required field validation
  if (!row.productId) {
    errors.push({
      row: rowNum,
      field: "productId",
      message: "Product ID is required",
      value: "",
      severity: "error",
    });
  }

  if (!row.name) {
    errors.push({
      row: rowNum,
      field: "name",
      message: "Product name is required",
      value: "",
      severity: "error",
    });
  }

  // Pack size validation - must be > 0 (prevents division by zero)
  const packSize = Number(row.packSize);
  if (row.packSize !== undefined && row.packSize !== "") {
    if (isNaN(packSize) || packSize <= 0) {
      errors.push({
        row: rowNum,
        field: "packSize",
        message: "Pack size must be a positive number greater than 0",
        value: row.packSize,
        severity: "error",
      });
    } else if (packSize > 10000) {
      warnings.push({
        row: rowNum,
        field: "packSize",
        message: `Unusually large pack size (${packSize}) - please verify`,
        value: packSize,
        severity: "warning",
      });
    }
  }

  // Stock quantity validation - must be >= 0
  const stockPacks = Number(row.currentStockPacks);
  if (row.currentStockPacks !== undefined && row.currentStockPacks !== "") {
    if (isNaN(stockPacks)) {
      errors.push({
        row: rowNum,
        field: "currentStockPacks",
        message: "Stock quantity must be a valid number",
        value: row.currentStockPacks,
        severity: "error",
      });
    } else if (stockPacks < 0) {
      errors.push({
        row: rowNum,
        field: "currentStockPacks",
        message: "Stock quantity cannot be negative",
        value: stockPacks,
        severity: "error",
      });
    } else if (stockPacks > 1000000) {
      warnings.push({
        row: rowNum,
        field: "currentStockPacks",
        message: `Very large stock quantity (${stockPacks.toLocaleString()}) - please verify`,
        value: stockPacks,
        severity: "warning",
      });
    }
  }

  // Notification point validation
  const notifPoint = Number(row.notificationPoint);
  if (row.notificationPoint !== undefined && row.notificationPoint !== "") {
    if (isNaN(notifPoint)) {
      warnings.push({
        row: rowNum,
        field: "notificationPoint",
        message: "Notification point should be a number",
        value: row.notificationPoint,
        severity: "warning",
      });
    } else if (notifPoint < 0) {
      warnings.push({
        row: rowNum,
        field: "notificationPoint",
        message: "Notification point should not be negative",
        value: notifPoint,
        severity: "warning",
      });
    } else if (
      !isNaN(stockPacks) &&
      stockPacks > 0 &&
      notifPoint > stockPacks * 10
    ) {
      warnings.push({
        row: rowNum,
        field: "notificationPoint",
        message: `Notification point (${notifPoint}) is more than 10x current stock (${stockPacks}) - please verify`,
        value: notifPoint,
        severity: "warning",
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
  rowNum: number,
): ValidationResult {
  const errors: ValidationWarning[] = [];
  const warnings: ValidationWarning[] = [];

  // Required field validation
  if (!row.productId) {
    errors.push({
      row: rowNum,
      field: "productId",
      message: "Product ID is required",
      value: "",
      severity: "error",
    });
  }

  if (!row.orderId) {
    errors.push({
      row: rowNum,
      field: "orderId",
      message: "Order ID is required",
      value: "",
      severity: "error",
    });
  }

  // Quantity validation
  const qty = Number(row.quantityUnits);
  if (row.quantityUnits !== undefined && row.quantityUnits !== "") {
    if (isNaN(qty)) {
      errors.push({
        row: rowNum,
        field: "quantityUnits",
        message: "Quantity must be a valid number",
        value: row.quantityUnits,
        severity: "error",
      });
    } else if (qty < 0) {
      errors.push({
        row: rowNum,
        field: "quantityUnits",
        message: "Quantity cannot be negative",
        value: qty,
        severity: "error",
      });
    } else if (qty === 0) {
      warnings.push({
        row: rowNum,
        field: "quantityUnits",
        message: "Quantity is zero - this may indicate an issue",
        value: qty,
        severity: "warning",
      });
    } else if (qty > 100000) {
      warnings.push({
        row: rowNum,
        field: "quantityUnits",
        message: `Very large quantity (${qty.toLocaleString()}) - please verify`,
        value: qty,
        severity: "warning",
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
        field: "dateSubmitted",
        message: `Could not parse date: "${dateStr}"`,
        value: dateStr,
        severity: "warning",
      });
    } else {
      const now = new Date();
      const oneWeekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const fiveYearsAgo = new Date(
        now.getFullYear() - 5,
        now.getMonth(),
        now.getDate(),
      );

      if (parsed > oneWeekAhead) {
        warnings.push({
          row: rowNum,
          field: "dateSubmitted",
          message: `Date is more than a week in the future (${parsed.toLocaleDateString()})`,
          value: dateStr,
          severity: "warning",
        });
      } else if (parsed < fiveYearsAgo) {
        warnings.push({
          row: rowNum,
          field: "dateSubmitted",
          message: `Date is more than 5 years old (${parsed.toLocaleDateString()})`,
          value: dateStr,
          severity: "warning",
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
  importType: "inventory" | "orders" | "both",
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
    if (importType === "inventory") {
      result = validateInventoryRow(cleanedRow, rowNum);
    } else if (importType === "orders") {
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

/** Core fields that map directly to Product table columns */
const CORE_PRODUCT_FIELDS = new Set([
  "productId",
  "name",
  "itemType",
  "packSize",
  "notificationPoint",
  "currentStockPacks",
]);

/** Core fields that map directly to Transaction table columns */
const CORE_ORDER_FIELDS = new Set([
  "productId",
  "productName",
  "orderId",
  "dateSubmitted",
  "quantityUnits",
  "shipToCompany",
  "shipToLocation",
  "orderStatus",
]);

/**
 * Clean and normalize data row (legacy function for validation)
 * Returns only mapped core fields
 */
function cleanRow(row: ParsedRow, mapping: ColumnMapping[]): ParsedRow {
  const cleaned: ParsedRow = {};

  for (const { source, mapsTo, isCustomField } of mapping) {
    // Skip custom fields - only include core mapped fields
    if (!mapsTo || !row[source] || isCustomField) continue;

    let value = row[source];

    // Trim strings
    if (typeof value === "string") {
      value = value.trim();
    }

    // Normalize item type
    if (mapsTo === "itemType" && typeof value === "string") {
      const normalized = value.toLowerCase();
      if (["evergreen", "event", "completed"].includes(normalized)) {
        value = normalized;
      } else {
        value = "evergreen";
      }
    }

    // Parse numbers
    if (
      [
        "currentStockPacks",
        "packSize",
        "notificationPoint",
        "quantityUnits",
      ].includes(mapsTo)
    ) {
      value = parseInt(String(value).replace(/[^0-9-]/g, ""), 10) || 0;
    }

    // Parse dates
    if (mapsTo === "dateSubmitted" && value) {
      const dateStr = String(value);
      const parsed = new Date(dateStr);
      value = (isNaN(parsed.getTime()) ? new Date() : parsed) as unknown as
        | string
        | number;
    }

    cleaned[mapsTo] = value;
  }

  return cleaned;
}

/**
 * Clean and extract all data from a row, separating core fields from custom fields.
 * This preserves ALL data from the import file.
 */
function cleanRowWithCustomFields(
  row: ParsedRow,
  mapping: ColumnMapping[],
  importType: "inventory" | "orders" | "both",
): CleanedRowResult {
  const mappedData: ParsedRow = {};
  const customFields: Record<string, CustomFieldValue> = {};
  const allOriginalHeaders: string[] = [];

  const coreFields =
    importType === "orders" ? CORE_ORDER_FIELDS : CORE_PRODUCT_FIELDS;
  const now = new Date().toISOString();

  for (const { source, mapsTo, isCustomField, detectedDataType } of mapping) {
    allOriginalHeaders.push(source);

    const rawValue = row[source];
    if (rawValue === undefined || rawValue === null || rawValue === "") {
      continue;
    }

    let value: string | number = rawValue as string | number;

    // Trim strings
    if (typeof value === "string") {
      value = value.trim();
      if (value === "") continue;
    }

    // Determine if this maps to a core field
    const isCoreField = !isCustomField && coreFields.has(mapsTo);

    if (isCoreField) {
      // Process core fields as before
      if (mapsTo === "itemType" && typeof value === "string") {
        const normalized = value.toLowerCase();
        if (["evergreen", "event", "completed"].includes(normalized)) {
          value = normalized;
        } else {
          value = "evergreen";
        }
      }

      if (
        [
          "currentStockPacks",
          "packSize",
          "notificationPoint",
          "quantityUnits",
        ].includes(mapsTo)
      ) {
        value = parseInt(String(value).replace(/[^0-9-]/g, ""), 10) || 0;
      }

      if (mapsTo === "dateSubmitted" && value) {
        const dateStr = String(value);
        const parsed = new Date(dateStr);
        value = (isNaN(parsed.getTime()) ? new Date() : parsed) as unknown as
          | string
          | number;
      }

      mappedData[mapsTo] = value;
    } else {
      // Store as custom field with metadata
      // Parse numeric values for custom fields too
      let parsedValue: string | number | null = value;
      const dataType = detectedDataType || "text";

      if (
        dataType === "numeric" ||
        dataType === "numeric_positive" ||
        dataType === "numeric_integer"
      ) {
        // Clean and parse numeric value
        const cleanedNum = String(value)
          .replace(/[,$\s€£¥]/g, "")
          .trim();
        const parsed = parseFloat(cleanedNum);
        if (!isNaN(parsed)) {
          parsedValue = parsed;
        }
      } else if (dataType === "date") {
        // Keep date as string for flexibility
        parsedValue = String(value);
      }

      customFields[mapsTo] = {
        value: parsedValue,
        originalHeader: source,
        dataType: dataType as DetectedDataType,
        lastUpdated: now,
      };
    }
  }

  return {
    mappedData,
    customFields,
    allOriginalHeaders,
  };
}

/**
 * Merge custom fields into existing metadata, preserving existing fields
 * that aren't being updated.
 */
function mergeMetadata(
  existingMetadata: ProductMetadata | null,
  newCustomFields: Record<string, CustomFieldValue>,
  importBatchId: string,
  headers: string[],
  mappedFields: string[],
): ProductMetadata {
  const existing = existingMetadata || {};
  const existingCustomFields = existing.customFields || {};

  // Merge custom fields - new values overwrite old ones
  const mergedCustomFields = {
    ...existingCustomFields,
    ...newCustomFields,
  };

  return {
    customFields: mergedCustomFields,
    _import: {
      lastImportBatchId: importBatchId,
      originalHeaders: headers,
      mappedFields,
      customFieldCount: Object.keys(mergedCustomFields).length,
      importedAt: new Date().toISOString(),
    },
  };
}

// =============================================================================
// IMPORT PROCESSING
// =============================================================================

/**
 * Process inventory import
 * Now preserves ALL data from the import file, storing non-core fields in Product.metadata
 */
export async function processInventoryImport(
  clientId: string,
  rows: ParsedRow[],
  mapping: ColumnMapping[],
  importBatchId: string,
): Promise<Partial<ImportResult>> {
  const errors: ImportResult["errors"] = [];
  let newProducts = 0;
  let updatedProducts = 0;

  // Pre-calculate mapped field names for metadata tracking
  const mappedCoreFields = mapping
    .filter((m) => !m.isCustomField && m.confidence >= 0.5)
    .map((m) => m.mapsTo);

  // Pre-fetch all existing products for this client to avoid N+1 queries
  // This dramatically improves performance for large imports (5000 rows: 30min → 2min)
  const productIdMapping = mapping.find((m) => m.mapsTo === "productId");
  const productIds = productIdMapping
    ? rows
        .map((r) => r[productIdMapping.source])
        .filter(
          (id): id is string | number =>
            id !== undefined && id !== null && id !== "",
        )
        .map((id) => String(id))
    : [];

  const existingProducts = await prisma.product.findMany({
    where: {
      clientId,
      productId: { in: productIds },
    },
  });

  // Create lookup map for O(1) access
  const existingProductMap = new Map(
    existingProducts.map((p) => [p.productId, p]),
  );

  for (let i = 0; i < rows.length; i++) {
    // Use new function that extracts custom fields
    const {
      mappedData: row,
      customFields,
      allOriginalHeaders,
    } = cleanRowWithCustomFields(rows[i], mapping, "inventory");
    const rowNum = i + 2; // 1-indexed + header row

    try {
      // Validate required fields
      if (!row.productId) {
        errors.push({
          row: rowNum,
          field: "productId",
          message: "Product ID is required",
        });
        continue;
      }
      if (!row.name) {
        errors.push({
          row: rowNum,
          field: "name",
          message: "Product name is required",
        });
        continue;
      }

      // Use pre-fetched product map instead of individual query
      const existing = existingProductMap.get(String(row.productId));

      const productData = {
        name: String(row.name),
        itemType: String(row.itemType || "evergreen"),
        packSize: Number(row.packSize) || 1,
        notificationPoint: row.notificationPoint
          ? Number(row.notificationPoint)
          : null,
        currentStockPacks: Number(row.currentStockPacks) || 0,
        isOrphan: false,
        isActive: true, // Explicitly set to ensure products show in listings
      };

      // Build metadata with custom fields
      const hasCustomFields = Object.keys(customFields).length > 0;

      if (existing) {
        // Merge metadata with existing custom fields
        const existingMetadata = existing.metadata as ProductMetadata | null;
        const newMetadata = mergeMetadata(
          existingMetadata,
          customFields,
          importBatchId,
          allOriginalHeaders,
          mappedCoreFields,
        );

        // Update existing product with custom fields in metadata
        await prisma.product.update({
          where: { id: existing.id },
          data: {
            ...productData,
            metadata: hasCustomFields
              ? (newMetadata as unknown as Prisma.InputJsonValue)
              : (existing.metadata as Prisma.InputJsonValue),
          },
        });

        // Record stock history
        await prisma.stockHistory.create({
          data: {
            productId: existing.id,
            packsAvailable: productData.currentStockPacks,
            totalUnits: productData.currentStockPacks * productData.packSize,
            source: "import",
          },
        });

        updatedProducts++;
      } else {
        // Create new product with metadata
        const metadata: ProductMetadata = {
          customFields: hasCustomFields ? customFields : undefined,
          _import: {
            lastImportBatchId: importBatchId,
            originalHeaders: allOriginalHeaders,
            mappedFields: mappedCoreFields,
            customFieldCount: Object.keys(customFields).length,
            importedAt: new Date().toISOString(),
          },
        };

        const newProduct = await prisma.product.create({
          data: {
            clientId,
            productId: String(row.productId),
            ...productData,
            metadata: metadata as unknown as Prisma.InputJsonValue,
          },
        });

        // Record initial stock history
        await prisma.stockHistory.create({
          data: {
            productId: newProduct.id,
            packsAvailable: productData.currentStockPacks,
            totalUnits: productData.currentStockPacks * productData.packSize,
            source: "import",
          },
        });

        newProducts++;
      }
    } catch (error) {
      errors.push({
        row: rowNum,
        message: error instanceof Error ? error.message : "Unknown error",
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
  importBatchId: string,
): Promise<Partial<ImportResult>> {
  const errors: ImportResult["errors"] = [];
  let newTransactions = 0;
  let skippedDuplicates = 0;

  // Pre-fetch all existing products for this client to avoid N+1 queries
  // This improves performance significantly for large order imports
  const productIdMapping = mapping.find((m) => m.mapsTo === "productId");
  const productIds = productIdMapping
    ? rows
        .map((r) => r[productIdMapping.source])
        .filter(
          (id): id is string | number =>
            id !== undefined && id !== null && id !== "",
        )
        .map((id) => String(id))
    : [];

  const existingProducts = await prisma.product.findMany({
    where: {
      clientId,
      productId: { in: productIds },
    },
  });

  // Create lookup map for O(1) access
  const existingProductMap = new Map(
    existingProducts.map((p) => [p.productId, p]),
  );

  // Track products we create during this import to avoid duplicate creation
  const createdProductsMap = new Map<string, (typeof existingProducts)[0]>();

  for (let i = 0; i < rows.length; i++) {
    const row = cleanRow(rows[i], mapping);
    const rowNum = i + 2;

    try {
      // Validate required fields
      if (!row.productId) {
        errors.push({
          row: rowNum,
          field: "productId",
          message: "Product ID is required",
        });
        continue;
      }
      if (!row.orderId) {
        errors.push({
          row: rowNum,
          field: "orderId",
          message: "Order ID is required",
        });
        continue;
      }

      // Find product using pre-fetched map (O(1) lookup)
      const productIdStr = String(row.productId);
      let product =
        existingProductMap.get(productIdStr) ||
        createdProductsMap.get(productIdStr);

      // Create orphan product if not found
      if (!product) {
        product = await prisma.product.create({
          data: {
            clientId,
            productId: productIdStr,
            name: String(row.productName || row.productId),
            isOrphan: true,
            isActive: true, // Explicitly set to ensure products show in listings
            packSize: 1,
          },
        });
        // Track newly created product to avoid duplicate creation in same import
        createdProductsMap.set(productIdStr, product);
      }

      // Parse and validate date
      const rawDate = row.dateSubmitted;
      let dateSubmitted: Date;

      if (
        rawDate &&
        typeof rawDate === "object" &&
        (rawDate as Date) instanceof Date
      ) {
        dateSubmitted = rawDate as Date;
      } else if (rawDate) {
        const parsed = new Date(String(rawDate));
        // Check for Invalid Date
        if (isNaN(parsed.getTime())) {
          errors.push({
            row: rowNum,
            field: "dateSubmitted",
            message: `Invalid date format: "${rawDate}"`,
            value: String(rawDate),
          });
          continue;
        }
        dateSubmitted = parsed;
      } else {
        // Default to current date if not provided
        dateSubmitted = new Date();
      }

      const quantityUnits = Number(row.quantityUnits) || 0;
      // Prevent division by zero - ensure pack size is at least 1
      const safePackSize = Math.max(1, product.packSize || 1);
      const quantityPacks = Math.ceil(quantityUnits / safePackSize);

      // Check for duplicate
      const existingTransaction = await prisma.transaction.findFirst({
        where: {
          productId: product.id,
          orderId: String(row.orderId),
          shipToLocation: row.shipToLocation
            ? String(row.shipToLocation)
            : null,
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
          orderStatus: String(row.orderStatus || "completed"),
          shipToLocation: row.shipToLocation
            ? String(row.shipToLocation)
            : null,
          shipToCompany: row.shipToCompany ? String(row.shipToCompany) : null,
          importBatchId,
        },
      });

      newTransactions++;
    } catch (error) {
      errors.push({
        row: rowNum,
        message: error instanceof Error ? error.message : "Unknown error",
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
  columnMapping: ColumnMapping[],
): Promise<ImportResult> {
  const importBatch = await prisma.importBatch.findUnique({
    where: { id: importBatchId },
  });

  if (!importBatch || !importBatch.filePath) {
    throw new Error("Import batch not found or missing file");
  }

  // Extract column header information for tracking
  const sourceHeaders = columnMapping.map((m) => m.source);
  const mappedHeaders = columnMapping
    .filter((m) => !m.isCustomField && m.confidence >= 0.5)
    .map((m) => ({ source: m.source, mapsTo: m.mapsTo }));
  const customHeaders = columnMapping
    .filter((m) => m.isCustomField || m.confidence < 0.5)
    .map((m) => ({
      source: m.source,
      mapsTo: m.mapsTo,
      dataType: m.detectedDataType || "text",
    }));

  // Update status and save column tracking info
  await prisma.importBatch.update({
    where: { id: importBatchId },
    data: {
      status: "processing",
      startedAt: new Date(),
      sourceHeaders: sourceHeaders as unknown as Prisma.InputJsonValue,
      mappedHeaders: mappedHeaders as unknown as Prisma.InputJsonValue,
      customHeaders: customHeaders as unknown as Prisma.InputJsonValue,
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
    if (
      importBatch.importType === "inventory" ||
      importBatch.importType === "both"
    ) {
      const inventoryResult = await processInventoryImport(
        importBatch.clientId,
        rows,
        columnMapping,
        importBatchId,
      );
      result.newProducts = inventoryResult.newProducts;
      result.updatedProducts = inventoryResult.updatedProducts;
      result.processedCount! += inventoryResult.processedCount || 0;
      result.errorCount! += inventoryResult.errorCount || 0;
      result.errors!.push(...(inventoryResult.errors || []));
    }

    if (
      importBatch.importType === "orders" ||
      importBatch.importType === "both"
    ) {
      const ordersResult = await processOrdersImport(
        importBatch.clientId,
        rows,
        columnMapping,
        importBatchId,
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
        status: "completed",
        completedAt: new Date(),
        processedCount: result.processedCount,
        errorCount: result.errorCount,
        errors: result.errors as unknown as undefined,
      },
    });

    // Discover and register custom fields for this client
    // This creates ClientCustomFieldDefinition records for any new custom fields
    if (customHeaders.length > 0) {
      try {
        await discoverCustomFields(importBatch.clientId, customHeaders);
      } catch (err) {
        // Log error but don't fail the import - custom field discovery is non-critical
        console.error("Failed to discover custom fields:", err);
      }
    }

    // Recalculate usage metrics
    await recalculateClientUsage(importBatch.clientId);

    // Calculate monthly usage for Phase 13 features (stock health, AI insights)
    await recalculateClientMonthlyUsage(importBatch.clientId);

    // Generate alerts
    await runAlertGeneration(importBatch.clientId);

    return {
      status: "completed",
      ...result,
    } as ImportResult;
  } catch (error) {
    // Update import batch with failure
    await prisma.importBatch.update({
      where: { id: importBatchId },
      data: {
        status: "failed",
        completedAt: new Date(),
        errors: [
          {
            row: 0,
            message: error instanceof Error ? error.message : "Unknown error",
          },
        ] as unknown as undefined,
      },
    });

    // Clean up uploaded file on error to prevent disk space buildup
    try {
      if (importBatch.filePath && fs.existsSync(importBatch.filePath)) {
        fs.unlinkSync(importBatch.filePath);
      }
    } catch (cleanupError) {
      console.error("Failed to cleanup import file after error:", cleanupError);
    }

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
  const hashSum = crypto.createHash("sha256");
  hashSum.update(fileBuffer);
  return hashSum.digest("hex");
}

/**
 * Check if a file with the same checksum has been imported
 */
export async function checkFileAlreadyImported(
  clientId: string,
  checksum: string,
): Promise<{
  isDuplicate: boolean;
  existingImport?: { id: string; createdAt: Date };
}> {
  const existing = await prisma.importBatch.findFirst({
    where: {
      clientId,
      fileChecksum: checksum,
      status: "completed",
    },
    select: { id: true, createdAt: true },
    orderBy: { createdAt: "desc" },
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
  keyField: string,
): Map<string, number[]> {
  const duplicates = new Map<string, number[]>();
  const seen = new Map<string, number>();

  for (let i = 0; i < rows.length; i++) {
    const key = String(rows[i][keyField] || "");
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
  const fd = fs.openSync(filePath, "r");
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
    detectedType = "xlsx";
  }
  // Check XLS (OLE)
  else if (
    buffer[0] === 0xd0 &&
    buffer[1] === 0xcf &&
    buffer[2] === 0x11 &&
    buffer[3] === 0xe0
  ) {
    detectedType = "xls";
  }
  // Assume CSV/TSV for plain text
  else {
    detectedType = "csv";
  }

  const expectedType = ext.replace(".", "");
  const valid =
    detectedType === expectedType ||
    (detectedType === "csv" && ["csv", "tsv", "txt"].includes(expectedType));

  return { valid, detectedType, expectedType };
}

/**
 * Generate a unique row key for deduplication
 */
export function generateRowKey(row: ParsedRow, keyFields: string[]): string {
  const values = keyFields.map((field) => String(row[field] || "")).join("|");
  return crypto.createHash("md5").update(values).digest("hex");
}
