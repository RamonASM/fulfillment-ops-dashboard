/**
 * Data type detection for smart column mapping.
 * Analyzes sample values to validate column assignments and improve confidence.
 */

// =============================================================================
// TYPES
// =============================================================================

export type DetectedDataType =
  | "numeric"
  | "numeric_positive"
  | "numeric_integer"
  | "date"
  | "alphanumeric"
  | "text"
  | "boolean"
  | "empty";

export interface DataTypeAnalysis {
  detectedType: DetectedDataType;
  confidence: number;
  stats: {
    totalSamples: number;
    validSamples: number;
    nullCount: number;
    uniqueCount: number;
    min?: number;
    max?: number;
    avg?: number;
  };
  patterns: string[];
  warnings: string[];
}

export interface ValidationResult {
  isValid: boolean;
  matchRatio: number;
  issues: string[];
}

// =============================================================================
// DATA TYPE DETECTION
// =============================================================================

/**
 * Analyze column data to detect its type.
 */
export function analyzeColumnDataType(
  values: (string | number | undefined | null)[],
): DataTypeAnalysis {
  const nonEmpty = values.filter(
    (v) => v !== undefined && v !== null && String(v).trim() !== "",
  );

  if (nonEmpty.length === 0) {
    return {
      detectedType: "empty",
      confidence: 1.0,
      stats: {
        totalSamples: values.length,
        validSamples: 0,
        nullCount: values.length,
        uniqueCount: 0,
      },
      patterns: [],
      warnings: ["Column appears to be empty"],
    };
  }

  const stringValues = nonEmpty.map((v) => String(v).trim());
  const uniqueValues = new Set(stringValues);

  // Test different type patterns
  const numericResults = testNumeric(stringValues);
  const dateResults = testDate(stringValues);
  const booleanResults = testBoolean(stringValues);
  const alphanumericResults = testAlphanumeric(stringValues);

  // Determine best match with priority ordering
  // Priority: numeric > alphanumeric > date > boolean > text
  // This prevents numbers from being detected as dates
  const candidates = [
    // Numeric gets a small boost to break ties with date
    { type: numericResults.type, ratio: numericResults.ratio, priority: 4 },
    {
      type: "alphanumeric" as DetectedDataType,
      ratio: alphanumericResults.ratio,
      priority: 3,
    },
    { type: "date" as DetectedDataType, ratio: dateResults.ratio, priority: 2 },
    {
      type: "boolean" as DetectedDataType,
      ratio: booleanResults.ratio,
      priority: 1,
    },
  ];

  // Sort by ratio first, then by priority for ties
  const best = candidates.reduce((a, b) => {
    if (Math.abs(a.ratio - b.ratio) < 0.05) {
      // Within 5% - use priority
      return a.priority > b.priority ? a : b;
    }
    return a.ratio > b.ratio ? a : b;
  });

  // If no strong match, default to text
  const detectedType = best.ratio >= 0.7 ? best.type : "text";
  const confidence = best.ratio >= 0.7 ? best.ratio : 0.5;

  const stats: DataTypeAnalysis["stats"] = {
    totalSamples: values.length,
    validSamples: nonEmpty.length,
    nullCount: values.length - nonEmpty.length,
    uniqueCount: uniqueValues.size,
  };

  // Add numeric stats if applicable
  if (detectedType.startsWith("numeric")) {
    const numbers = numericResults.values;
    if (numbers.length > 0) {
      stats.min = Math.min(...numbers);
      stats.max = Math.max(...numbers);
      stats.avg = numbers.reduce((a, b) => a + b, 0) / numbers.length;
    }
  }

  const warnings: string[] = [];
  if (confidence < 0.8) {
    warnings.push("Data type detection confidence is low");
  }
  if (stats.nullCount > stats.totalSamples * 0.3) {
    warnings.push(
      `${Math.round((stats.nullCount / stats.totalSamples) * 100)}% of values are empty`,
    );
  }

  return {
    detectedType,
    confidence,
    stats,
    patterns: [],
    warnings,
  };
}

// =============================================================================
// TYPE TESTERS
// =============================================================================

interface NumericTestResult {
  type: DetectedDataType;
  ratio: number;
  values: number[];
}

function testNumeric(values: string[]): NumericTestResult {
  // Pattern for numbers (with optional commas, decimals, negatives)
  // More strict: requires the entire string to be a valid number format
  const numericPattern = /^-?\d{1,3}(,\d{3})*(\.\d+)?$|^-?\d+(\.\d+)?$/;
  // Pattern for currency values
  const currencyPattern =
    /^[$€£¥]?\s*-?\d{1,3}(,\d{3})*(\.\d+)?$|^-?\d+(\.\d+)?\s*[$€£¥]?$/;

  const numericValues: number[] = [];
  let matchCount = 0;
  let allPositive = true;
  let allInteger = true;

  for (const v of values) {
    const cleaned = v.replace(/[,\s$€£¥]/g, "").trim();

    // Only accept if it matches the strict numeric pattern OR currency pattern
    // Do NOT use parseFloat fallback which is too permissive
    if (numericPattern.test(cleaned) || currencyPattern.test(v.trim())) {
      const num = parseFloat(cleaned);
      if (!isNaN(num) && isFinite(num)) {
        numericValues.push(num);
        matchCount++;
        if (num < 0) allPositive = false;
        if (!Number.isInteger(num)) allInteger = false;
      }
    }
  }

  const ratio = matchCount / values.length;
  let type: DetectedDataType = "numeric";

  if (ratio >= 0.7) {
    if (allPositive && allInteger) {
      type = "numeric_integer";
    } else if (allPositive) {
      type = "numeric_positive";
    }
  }

  return { type, ratio, values: numericValues };
}

interface DateTestResult {
  ratio: number;
  validDates: Date[];
}

function testDate(values: string[]): DateTestResult {
  // Only these specific date format patterns are accepted
  // Do NOT use new Date() alone - it's too permissive (accepts "12", "100", etc.)
  const datePatterns = [
    /^\d{4}-\d{2}-\d{2}$/, // ISO: 2024-01-15
    /^\d{4}-\d{2}-\d{2}T/, // ISO with time: 2024-01-15T10:30:00
    /^\d{1,2}\/\d{1,2}\/\d{2,4}$/, // US: 1/15/2024 or 01/15/24
    /^\d{1,2}-\d{1,2}-\d{2,4}$/, // Alt: 1-15-2024
    /^\d{1,2}\s+\w{3,9}\s+\d{2,4}$/i, // Written: 15 January 2024
    /^\w{3,9}\s+\d{1,2},?\s+\d{2,4}$/i, // US Written: January 15, 2024
    /^\d{1,2}\.\d{1,2}\.\d{2,4}$/, // European: 15.01.2024
  ];

  const validDates: Date[] = [];

  for (const v of values) {
    // CRITICAL: Only accept values that match a known date pattern
    // Do NOT fallback to new Date(v) alone - it parses numbers as dates!
    const matchesPattern = datePatterns.some((p) => p.test(v.trim()));

    if (matchesPattern) {
      const parsed = new Date(v);
      const isValidDate = !isNaN(parsed.getTime());
      // Additional sanity check: year should be reasonable (1900-2100)
      if (isValidDate) {
        const year = parsed.getFullYear();
        if (year >= 1900 && year <= 2100) {
          validDates.push(parsed);
        }
      }
    }
  }

  return {
    ratio: validDates.length / values.length,
    validDates,
  };
}

interface BooleanTestResult {
  ratio: number;
}

function testBoolean(values: string[]): BooleanTestResult {
  // Explicitly DO NOT include '0' and '1' - those are numeric values
  // Only text-based boolean representations
  const booleanValues = ["true", "false", "yes", "no", "y", "n", "t", "f"];
  let matchCount = 0;
  let allSameLengthSet = new Set<number>();

  for (const v of values) {
    const lower = v.toLowerCase().trim();
    if (booleanValues.includes(lower)) {
      matchCount++;
      allSameLengthSet.add(lower.length);
    }
  }

  // Additional check: if we have high match ratio but values look like
  // they could be something else (e.g., mixed with numbers), reduce confidence
  const ratio = matchCount / values.length;

  // Boost confidence if all values are from a consistent boolean set
  // (e.g., all "yes/no" or all "true/false")
  const hasConsistentBooleanPairs =
    values.every((v) => ["yes", "no"].includes(v.toLowerCase().trim())) ||
    values.every((v) => ["true", "false"].includes(v.toLowerCase().trim())) ||
    values.every((v) => ["y", "n"].includes(v.toLowerCase().trim())) ||
    values.every((v) => ["t", "f"].includes(v.toLowerCase().trim()));

  return {
    ratio: hasConsistentBooleanPairs && ratio >= 0.9 ? ratio : ratio * 0.8,
  };
}

interface AlphanumericTestResult {
  ratio: number;
}

function testAlphanumeric(values: string[]): AlphanumericTestResult {
  // Alphanumeric IDs: letters, numbers, hyphens, underscores
  const alphanumericPattern = /^[A-Za-z0-9\-_#]+$/;
  let matchCount = 0;

  for (const v of values) {
    if (alphanumericPattern.test(v) && /[A-Za-z]/.test(v) && /\d/.test(v)) {
      // Must contain both letters and numbers to be considered alphanumeric ID
      matchCount++;
    }
  }

  return { ratio: matchCount / values.length };
}

// =============================================================================
// FIELD TYPE VALIDATION
// =============================================================================

export type ExpectedFieldType =
  | "numeric"
  | "numeric_positive"
  | "date"
  | "alphanumeric"
  | "text"
  | "categorical";

/**
 * Validate that column data matches expected field type.
 */
export function validateColumnForField(
  values: (string | number | undefined | null)[],
  expectedType: ExpectedFieldType,
  options?: { allowedValues?: string[] },
): ValidationResult {
  const analysis = analyzeColumnDataType(values);
  const issues: string[] = [];

  // Type compatibility check
  const compatibilityMap: Record<ExpectedFieldType, DetectedDataType[]> = {
    numeric: ["numeric", "numeric_positive", "numeric_integer"],
    numeric_positive: ["numeric_positive", "numeric_integer"],
    date: ["date"],
    alphanumeric: ["alphanumeric", "text", "numeric_integer"],
    text: [
      "text",
      "alphanumeric",
      "numeric",
      "numeric_positive",
      "numeric_integer",
    ],
    categorical: ["text", "alphanumeric"],
  };

  const compatible = compatibilityMap[expectedType]?.includes(
    analysis.detectedType,
  );

  if (!compatible && analysis.confidence > 0.7) {
    issues.push(
      `Expected ${expectedType} but detected ${analysis.detectedType} (${Math.round(
        analysis.confidence * 100,
      )}% confidence)`,
    );
  }

  // For numeric_positive, check for negatives
  if (expectedType === "numeric_positive" && analysis.stats.min !== undefined) {
    if (analysis.stats.min < 0) {
      issues.push("Negative values found where only positive values expected");
    }
  }

  // For categorical fields, check allowed values
  if (expectedType === "categorical" && options?.allowedValues) {
    const stringValues = values
      .filter((v) => v !== undefined && v !== null)
      .map((v) => String(v).toLowerCase().trim());
    const invalidValues = stringValues.filter(
      (v) => !options.allowedValues!.includes(v) && v !== "",
    );
    if (invalidValues.length > 0) {
      const uniqueInvalid = [...new Set(invalidValues)].slice(0, 3);
      issues.push(
        `${invalidValues.length} values don't match allowed categories: ${uniqueInvalid.join(", ")}${
          invalidValues.length > 3 ? "..." : ""
        }`,
      );
    }
  }

  const matchRatio = compatible
    ? analysis.confidence
    : analysis.confidence * 0.5;

  return {
    isValid: issues.length === 0,
    matchRatio,
    issues,
  };
}

// =============================================================================
// SPECIFIC FIELD VALIDATORS
// =============================================================================

/**
 * Validate product ID field samples.
 * Product IDs should be mostly unique, alphanumeric.
 */
export function validateProductIdSamples(
  values: (string | number | undefined | null)[],
): ValidationResult {
  const nonEmpty = values.filter(
    (v) => v !== undefined && v !== null && String(v).trim() !== "",
  );
  const stringValues = nonEmpty.map((v) => String(v).trim());

  const uniqueCount = new Set(stringValues).size;
  const uniquenessRatio = uniqueCount / stringValues.length;

  const issues: string[] = [];

  // Product IDs should be highly unique
  if (uniquenessRatio < 0.9) {
    issues.push(
      `Only ${Math.round(uniquenessRatio * 100)}% unique values - expected higher for product IDs`,
    );
  }

  // Check for ID-like patterns
  const alphanumericCount = stringValues.filter((v) =>
    /^[A-Za-z0-9\-_]+$/.test(v),
  ).length;
  const formatConsistency = alphanumericCount / stringValues.length;

  if (formatConsistency < 0.8) {
    issues.push("Some values contain unexpected characters for product IDs");
  }

  return {
    isValid: issues.length === 0,
    matchRatio: uniquenessRatio * 0.6 + formatConsistency * 0.4,
    issues,
  };
}

/**
 * Validate quantity field samples.
 * Quantities should be non-negative numbers.
 */
export function validateQuantitySamples(
  values: (string | number | undefined | null)[],
): ValidationResult {
  const nonEmpty = values.filter(
    (v) => v !== undefined && v !== null && String(v).trim() !== "",
  );
  const issues: string[] = [];

  let validCount = 0;
  let hasNegative = false;
  let hasNonInteger = false;

  for (const v of nonEmpty) {
    const num = parseFloat(String(v).replace(/[,\s]/g, ""));
    if (!isNaN(num)) {
      validCount++;
      if (num < 0) hasNegative = true;
      if (!Number.isInteger(num)) hasNonInteger = true;
    }
  }

  const validRatio = validCount / nonEmpty.length;

  if (validRatio < 0.9) {
    issues.push(
      `${Math.round((1 - validRatio) * 100)}% of values are not valid numbers`,
    );
  }

  if (hasNegative) {
    issues.push("Negative values found - quantities should be non-negative");
  }

  if (hasNonInteger) {
    issues.push(
      "Decimal values found - quantities are typically whole numbers",
    );
  }

  return {
    isValid: issues.length === 0,
    matchRatio: validRatio,
    issues,
  };
}

/**
 * Validate date field samples.
 * Dates should parse correctly and be reasonable (not too far past/future).
 */
export function validateDateSamples(
  values: (string | number | undefined | null)[],
): ValidationResult {
  const nonEmpty = values.filter(
    (v) => v !== undefined && v !== null && String(v).trim() !== "",
  );
  const issues: string[] = [];

  const now = new Date();
  const fiveYearsAgo = new Date(
    now.getFullYear() - 5,
    now.getMonth(),
    now.getDate(),
  );
  const oneYearAhead = new Date(
    now.getFullYear() + 1,
    now.getMonth(),
    now.getDate(),
  );

  let validCount = 0;
  let futureCount = 0;
  let oldCount = 0;

  for (const v of nonEmpty) {
    const parsed = new Date(String(v));
    if (!isNaN(parsed.getTime())) {
      validCount++;
      if (parsed > oneYearAhead) futureCount++;
      if (parsed < fiveYearsAgo) oldCount++;
    }
  }

  const validRatio = validCount / nonEmpty.length;

  if (validRatio < 0.8) {
    issues.push(
      `Only ${Math.round(validRatio * 100)}% of values parsed as valid dates`,
    );
  }

  if (futureCount > 0) {
    issues.push(
      `${futureCount} date(s) appear to be more than a year in the future`,
    );
  }

  if (oldCount > 0) {
    issues.push(`${oldCount} date(s) appear to be more than 5 years old`);
  }

  return {
    isValid: issues.length === 0,
    matchRatio: validRatio,
    issues,
  };
}

/**
 * Validate pack size field samples.
 * Pack sizes should be positive integers, typically 1-1000.
 */
export function validatePackSizeSamples(
  values: (string | number | undefined | null)[],
): ValidationResult {
  const nonEmpty = values.filter(
    (v) => v !== undefined && v !== null && String(v).trim() !== "",
  );
  const issues: string[] = [];

  let validCount = 0;
  let invalidValues: number[] = [];

  for (const v of nonEmpty) {
    const num = parseInt(String(v), 10);
    if (!isNaN(num)) {
      validCount++;
      if (num <= 0) {
        invalidValues.push(num);
      } else if (num > 10000) {
        issues.push(`Unusually large pack size: ${num}`);
      }
    }
  }

  if (invalidValues.length > 0) {
    issues.push(
      `Pack size must be positive. Found: ${invalidValues.slice(0, 3).join(", ")}`,
    );
  }

  return {
    isValid: issues.length === 0,
    matchRatio: validCount / nonEmpty.length,
    issues,
  };
}
