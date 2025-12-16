/**
 * Formula Detection Service
 *
 * Detects mathematical relationships between columns during import.
 * Examples:
 * - Extended Price = Quantity × Unit Price
 * - Total Quantity = Pack Size × Number of Packs
 * - Total Units = Quantity Multiplier × Base Quantity
 */

// =============================================================================
// TYPES
// =============================================================================

export interface FormulaRelationship {
  type: "multiplicative" | "additive";
  resultColumn: string;
  operandColumns: string[];
  formula: string; // Human-readable: "Extended Price = Quantity × Unit Price"
  confidence: number;
  matchedRows: number;
  totalRows: number;
}

export interface QuantityRelationship {
  type: "pack_calculation" | "unit_calculation" | "multiplier";
  primaryColumn: string;
  relatedColumns: string[];
  detectedPackSize?: number;
  formula: string;
  confidence: number;
}

export interface FormulaDetectionResult {
  relationships: FormulaRelationship[];
  quantityRelationships: QuantityRelationship[];
  suggestions: FormulaSuggestion[];
}

export interface FormulaSuggestion {
  message: string;
  severity: "info" | "warning";
  affectedColumns: string[];
}

// =============================================================================
// KNOWN FORMULA PATTERNS
// =============================================================================

const KNOWN_FORMULAS = [
  {
    name: "Extended Price",
    pattern: "multiplicative",
    resultPatterns: [
      "extended price",
      "ext price",
      "line total",
      "extended",
      "extended amount",
      "total line",
    ],
    operandPatterns: [
      ["quantity", "qty", "units", "count"],
      ["unit price", "price", "price each", "unit cost", "cost each"],
    ],
  },
  {
    name: "Total Quantity",
    pattern: "multiplicative",
    resultPatterns: [
      "total quantity",
      "total qty",
      "total units",
      "total count",
    ],
    operandPatterns: [
      [
        "pack size",
        "pack qty",
        "units per pack",
        "multiplier",
        "quantity multiplier",
      ],
      ["packs", "cases", "quantity packs", "num packs", "pack count"],
    ],
  },
  {
    name: "Total Units (from multiplier)",
    pattern: "multiplicative",
    resultPatterns: ["quantity", "qty", "units", "total units"],
    operandPatterns: [
      ["quantity multiplier", "multiplier", "factor"],
      ["base quantity", "base qty", "base units", "quantity units"],
    ],
  },
  {
    name: "Total Price",
    pattern: "additive",
    resultPatterns: ["total price", "total", "grand total", "invoice total"],
    operandPatterns: [
      ["extended price", "subtotal", "line total"],
      ["tax", "tax amount", "vat", "gst"],
    ],
  },
];

// =============================================================================
// FORMULA DETECTION
// =============================================================================

/**
 * Detect formula relationships between columns.
 */
export function detectFormulaRelationships(
  headers: string[],
  rows: Record<string, unknown>[],
): FormulaDetectionResult {
  const relationships: FormulaRelationship[] = [];
  const quantityRelationships: QuantityRelationship[] = [];
  const suggestions: FormulaSuggestion[] = [];

  // Get numeric columns only
  const numericColumns = headers.filter((header) => {
    const values = rows
      .map((row) => row[header])
      .filter((v) => v !== undefined && v !== null && v !== "");
    if (values.length === 0) return false;

    const numericCount = values.filter((v) => {
      const num = parseFloat(String(v).replace(/[$,]/g, ""));
      return !isNaN(num) && isFinite(num);
    }).length;

    return numericCount / values.length >= 0.8;
  });

  if (numericColumns.length < 2) {
    return { relationships, quantityRelationships, suggestions };
  }

  // Check for multiplicative relationships (A × B = C)
  for (let i = 0; i < numericColumns.length; i++) {
    for (let j = i + 1; j < numericColumns.length; j++) {
      for (let k = 0; k < numericColumns.length; k++) {
        if (k === i || k === j) continue;

        const colA = numericColumns[i];
        const colB = numericColumns[j];
        const colC = numericColumns[k];

        const result = checkMultiplicativeRelationship(rows, colA, colB, colC);
        if (result.confidence >= 0.85) {
          // Check if this matches a known formula pattern
          const knownPattern = matchKnownFormula(colA, colB, colC, headers);

          relationships.push({
            type: "multiplicative",
            resultColumn: colC,
            operandColumns: [colA, colB],
            formula: knownPattern?.name
              ? `${formatColumnName(colC)} = ${formatColumnName(colA)} × ${formatColumnName(colB)} (${knownPattern.name})`
              : `${formatColumnName(colC)} = ${formatColumnName(colA)} × ${formatColumnName(colB)}`,
            confidence: result.confidence,
            matchedRows: result.matchedRows,
            totalRows: rows.length,
          });

          // Check for quantity-specific relationships
          if (
            isQuantityColumn(colA) ||
            isQuantityColumn(colB) ||
            isQuantityColumn(colC)
          ) {
            quantityRelationships.push(
              analyzeQuantityRelationship(colA, colB, colC, rows),
            );
          }
        }
      }
    }
  }

  // Check for additive relationships (A + B = C)
  for (let i = 0; i < numericColumns.length; i++) {
    for (let j = i + 1; j < numericColumns.length; j++) {
      for (let k = 0; k < numericColumns.length; k++) {
        if (k === i || k === j) continue;

        const colA = numericColumns[i];
        const colB = numericColumns[j];
        const colC = numericColumns[k];

        const result = checkAdditiveRelationship(rows, colA, colB, colC);
        if (result.confidence >= 0.85) {
          relationships.push({
            type: "additive",
            resultColumn: colC,
            operandColumns: [colA, colB],
            formula: `${formatColumnName(colC)} = ${formatColumnName(colA)} + ${formatColumnName(colB)}`,
            confidence: result.confidence,
            matchedRows: result.matchedRows,
            totalRows: rows.length,
          });
        }
      }
    }
  }

  // Detect quantity column relationships even without multiplicative matches
  const quantityColumns = headers.filter((h) => isQuantityColumn(h));
  if (quantityColumns.length >= 2) {
    const qtyAnalysis = analyzeQuantityColumns(quantityColumns, rows);
    if (qtyAnalysis) {
      quantityRelationships.push(qtyAnalysis);
    }
  }

  // Generate suggestions based on detected relationships
  if (relationships.length > 0) {
    suggestions.push({
      message: `Detected ${relationships.length} formula relationship(s). These columns may be calculated fields.`,
      severity: "info",
      affectedColumns: relationships.map((r) => r.resultColumn),
    });
  }

  // Check for potential duplicate quantity columns
  const duplicateQtyCheck = checkDuplicateQuantityColumns(headers, rows);
  if (duplicateQtyCheck) {
    suggestions.push(duplicateQtyCheck);
  }

  return { relationships, quantityRelationships, suggestions };
}

// =============================================================================
// RELATIONSHIP CHECKERS
// =============================================================================

function checkMultiplicativeRelationship(
  rows: Record<string, unknown>[],
  colA: string,
  colB: string,
  colC: string,
): { confidence: number; matchedRows: number } {
  let matchCount = 0;
  let totalCount = 0;

  for (const row of rows) {
    const a = parseNumericValue(row[colA]);
    const b = parseNumericValue(row[colB]);
    const c = parseNumericValue(row[colC]);

    if (a === null || b === null || c === null) continue;
    if (a === 0 && b === 0 && c === 0) continue; // Skip zero rows

    totalCount++;

    // Check if A × B ≈ C (within 1% tolerance)
    const product = a * b;
    const tolerance = Math.abs(c) * 0.01;

    if (Math.abs(product - c) <= tolerance) {
      matchCount++;
    }
  }

  return {
    confidence: totalCount > 0 ? matchCount / totalCount : 0,
    matchedRows: matchCount,
  };
}

function checkAdditiveRelationship(
  rows: Record<string, unknown>[],
  colA: string,
  colB: string,
  colC: string,
): { confidence: number; matchedRows: number } {
  let matchCount = 0;
  let totalCount = 0;

  for (const row of rows) {
    const a = parseNumericValue(row[colA]);
    const b = parseNumericValue(row[colB]);
    const c = parseNumericValue(row[colC]);

    if (a === null || b === null || c === null) continue;

    totalCount++;

    // Check if A + B ≈ C (within 1% tolerance)
    const sum = a + b;
    const tolerance = Math.abs(c) * 0.01;

    if (Math.abs(sum - c) <= tolerance) {
      matchCount++;
    }
  }

  return {
    confidence: totalCount > 0 ? matchCount / totalCount : 0,
    matchedRows: matchCount,
  };
}

// =============================================================================
// QUANTITY ANALYSIS
// =============================================================================

function isQuantityColumn(header: string): boolean {
  const h = header.toLowerCase();
  return (
    h.includes("quantity") ||
    h.includes("qty") ||
    h.includes("units") ||
    h.includes("packs") ||
    h.includes("count") ||
    h.includes("multiplier") ||
    h.includes("pack size")
  );
}

function analyzeQuantityRelationship(
  colA: string,
  colB: string,
  colC: string,
  rows: Record<string, unknown>[],
): QuantityRelationship {
  const aLower = colA.toLowerCase();
  const bLower = colB.toLowerCase();
  const cLower = colC.toLowerCase();

  // Determine which is the multiplier/pack size
  let type: "pack_calculation" | "unit_calculation" | "multiplier" =
    "multiplier";
  let primaryColumn = colC;
  let relatedColumns = [colA, colB];

  if (aLower.includes("pack size") || aLower.includes("multiplier")) {
    type = "pack_calculation";
    primaryColumn = colC;
  } else if (bLower.includes("pack size") || bLower.includes("multiplier")) {
    type = "pack_calculation";
    primaryColumn = colC;
  } else if (cLower.includes("total") || cLower.includes("units")) {
    type = "unit_calculation";
    primaryColumn = colC;
  }

  // Try to detect a consistent pack size
  let detectedPackSize: number | undefined;
  const packSizes = new Set<number>();

  for (const row of rows) {
    const a = parseNumericValue(row[colA]);
    const b = parseNumericValue(row[colB]);
    const c = parseNumericValue(row[colC]);

    if (a && b && c && a !== 0 && b !== 0) {
      if (Math.abs(a * b - c) < 0.01) {
        // One of these is likely the pack size
        if (a === Math.round(a) && a <= 100) packSizes.add(a);
        if (b === Math.round(b) && b <= 100) packSizes.add(b);
      }
    }
  }

  // If we have a consistent pack size, use it
  if (packSizes.size === 1) {
    detectedPackSize = packSizes.values().next().value;
  }

  return {
    type,
    primaryColumn,
    relatedColumns,
    detectedPackSize,
    formula: `${formatColumnName(colC)} = ${formatColumnName(colA)} × ${formatColumnName(colB)}`,
    confidence: 0.9,
  };
}

function analyzeQuantityColumns(
  quantityColumns: string[],
  rows: Record<string, unknown>[],
): QuantityRelationship | null {
  // Look for patterns like: quantity units and quantity multiplier
  const unitsCol = quantityColumns.find(
    (h) =>
      h.toLowerCase().includes("units") ||
      (h.toLowerCase().includes("quantity") &&
        !h.toLowerCase().includes("multiplier")),
  );
  const multiplierCol = quantityColumns.find(
    (h) =>
      h.toLowerCase().includes("multiplier") ||
      h.toLowerCase().includes("pack size"),
  );
  const totalCol = quantityColumns.find((h) =>
    h.toLowerCase().includes("total"),
  );

  if (unitsCol && multiplierCol) {
    // Calculate if there's a consistent relationship
    const consistentValues: number[] = [];

    for (const row of rows) {
      const units = parseNumericValue(row[unitsCol]);
      const multiplier = parseNumericValue(row[multiplierCol]);

      if (units && multiplier && multiplier !== 0) {
        const ratio = units / multiplier;
        if (Number.isInteger(ratio) && ratio > 0) {
          consistentValues.push(ratio);
        }
      }
    }

    if (consistentValues.length > rows.length * 0.5) {
      return {
        type: "unit_calculation",
        primaryColumn: unitsCol,
        relatedColumns: [multiplierCol],
        formula: `${formatColumnName(unitsCol)} represents total units, ${formatColumnName(multiplierCol)} is the pack conversion factor`,
        confidence: 0.85,
      };
    }
  }

  return null;
}

function checkDuplicateQuantityColumns(
  headers: string[],
  rows: Record<string, unknown>[],
): FormulaSuggestion | null {
  const quantityColumns = headers.filter((h) => isQuantityColumn(h));

  if (quantityColumns.length < 2) return null;

  // Check for columns with identical values
  for (let i = 0; i < quantityColumns.length; i++) {
    for (let j = i + 1; j < quantityColumns.length; j++) {
      const colA = quantityColumns[i];
      const colB = quantityColumns[j];

      let matchCount = 0;
      let totalCount = 0;

      for (const row of rows) {
        const a = parseNumericValue(row[colA]);
        const b = parseNumericValue(row[colB]);

        if (a !== null && b !== null) {
          totalCount++;
          if (a === b) matchCount++;
        }
      }

      if (totalCount > 0 && matchCount / totalCount > 0.95) {
        return {
          message: `Columns "${colA}" and "${colB}" appear to contain duplicate quantity values. Consider mapping only one.`,
          severity: "warning",
          affectedColumns: [colA, colB],
        };
      }
    }
  }

  return null;
}

// =============================================================================
// HELPERS
// =============================================================================

function parseNumericValue(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;

  const cleaned = String(value).replace(/[$,\s]/g, "");
  const num = parseFloat(cleaned);

  return isNaN(num) || !isFinite(num) ? null : num;
}

function formatColumnName(column: string): string {
  // Convert camelCase or snake_case to Title Case
  return column
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]/g, " ")
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ")
    .trim();
}

function matchKnownFormula(
  colA: string,
  colB: string,
  colC: string,
  _headers: string[],
): { name: string } | null {
  const aLower = colA.toLowerCase();
  const bLower = colB.toLowerCase();
  const cLower = colC.toLowerCase();

  for (const formula of KNOWN_FORMULAS) {
    if (formula.pattern !== "multiplicative") continue;

    // Check if result column matches
    const resultMatches = formula.resultPatterns.some((p) =>
      cLower.includes(p),
    );
    if (!resultMatches) continue;

    // Check if operand columns match
    const op1Matches = formula.operandPatterns[0].some(
      (p) => aLower.includes(p) || bLower.includes(p),
    );
    const op2Matches = formula.operandPatterns[1].some(
      (p) => aLower.includes(p) || bLower.includes(p),
    );

    if (op1Matches && op2Matches) {
      return { name: formula.name };
    }
  }

  return null;
}

// =============================================================================
// EXPORTS FOR IMPORT SERVICE
// =============================================================================

/**
 * Analyze quantity fields and return intelligent mapping suggestions.
 */
export function analyzeQuantityFields(
  headers: string[],
  sampleRows: Record<string, unknown>[],
): {
  suggestedMappings: Record<string, string>;
  quantityInfo: QuantityRelationship[];
  warnings: string[];
} {
  const suggestedMappings: Record<string, string> = {};
  const warnings: string[] = [];

  const result = detectFormulaRelationships(headers, sampleRows);

  // Map quantity columns intelligently
  for (const header of headers) {
    const h = header.toLowerCase();

    // Skip if already mapped
    if (suggestedMappings[header]) continue;

    if (h.includes("total quantity") || h.includes("total qty")) {
      suggestedMappings[header] = "totalQuantity";
    } else if (
      h.includes("quantity multiplier") ||
      h.includes("multiplier") ||
      h.includes("pack size")
    ) {
      suggestedMappings[header] = "packSize";
    } else if (h.includes("quantity") && h.includes("pack")) {
      suggestedMappings[header] = "quantityPacks";
    } else if (h.includes("quantity") && h.includes("unit")) {
      suggestedMappings[header] = "quantityUnits";
    } else if (h.includes("qty") || h.includes("quantity")) {
      // Default quantity mapping based on context
      suggestedMappings[header] = "quantityUnits";
    }
  }

  // Add warnings for complex quantity relationships
  if (result.quantityRelationships.length > 0) {
    for (const qr of result.quantityRelationships) {
      warnings.push(
        `Detected quantity relationship: ${qr.formula}. ` +
          (qr.detectedPackSize
            ? `Pack size appears to be ${qr.detectedPackSize}.`
            : ""),
      );
    }
  }

  return {
    suggestedMappings,
    quantityInfo: result.quantityRelationships,
    warnings,
  };
}
