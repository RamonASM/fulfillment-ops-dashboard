import Papa from 'papaparse';

/**
 * Four51 order CSV -> CorelDRAW Print Merge CSV.
 *
 * The imprint text in a Four51 export lives in the misleadingly named
 * "Customized Product ID" column (not a SKU). This service:
 *   - parses the upload RFC4180-correctly (Papa), so comma-bearing, quoted
 *     imprints no longer shift columns (the line-to-line mapping bug);
 *   - splits the imprint into TitleLine1 / TitleLine2 / EventDate, because
 *     CorelDRAW Print Merge cannot stack two lines inside one field;
 *   - preserves the raw imprint in CustomizedText so a split is never lossy.
 *
 * Pure and dependency-light: a route hands it CSV text, it returns CSV text.
 */

const SRC = {
  orderId: 'Order ID',
  productId: 'Product ID',
  productName: 'Product Name',
  imprint: 'Customized Product ID',
  quantity: 'Quantity',
  quantityMultiplier: 'Quantity Multiplier',
  totalQuantity: 'Total Quantity',
  dateSubmitted: 'Date Submitted',
  shipCompany: 'Ship To Company Name',
  shipFirst: 'Ship To First Name',
  shipLast: 'Ship To Last Name',
  shipCity: 'Ship To City',
  shipState: 'Ship To State',
} as const;

export const PRINT_MERGE_COLUMNS = [
  'OrderID',
  'LineNumber',
  'ProductID',
  'ProductName',
  'IsPersonalized',
  'CustomizedText',
  'TitleLine1',
  'TitleLine2',
  'EventDate',
  'Quantity',
  'QuantityMultiplier',
  'ShipToCompany',
  'ShipToName',
  'ShipToCity',
  'ShipToState',
  'DateSubmitted',
] as const;

const REQUIRED_INPUT_COLUMNS = [SRC.orderId, SRC.productId, SRC.imprint];

export interface ConvertOptions {
  /** Separator used to split the imprint into two lines. Default " - ". */
  lineSep?: string;
  /** Emit one row per unit (Quantity) for one-piece-per-record products. */
  expandQuantity?: boolean;
}

export interface ConvertStats {
  rowsIn: number;
  rowsOut: number;
  personalized: number;
  withTwoLines: number;
  withDate: number;
}

export interface ConvertResult {
  csv: string;
  stats: ConvertStats;
}

export interface ImprintSplit {
  titleLine1: string;
  titleLine2: string;
  eventDate: string;
}

export type PrintMergeRow = Record<(typeof PRINT_MERGE_COLUMNS)[number], string>;

const MONTHS =
  'January|February|March|April|May|June|July|August|September|October|November|December|' +
  'Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec';

const TRAILING_DATE_RE = new RegExp(
  `\\s+((?:${MONTHS})\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s*\\d{4})?)\\s*$`,
  'i'
);

/** Peel a trailing "Month Day(, Year)" off the end of the imprint. */
export function extractTrailingDate(text: string): { remainder: string; date: string } {
  const match = TRAILING_DATE_RE.exec(text);
  if (!match) return { remainder: text.trim(), date: '' };
  return { remainder: text.slice(0, match.index).trim(), date: match[1].trim() };
}

/**
 * Split a single imprint into two visible lines plus an optional date.
 * Conservative and transparent: peel a trailing date, then split once on the
 * separator if present, otherwise the whole remainder is line 1.
 */
export function splitImprint(imprint: string, lineSep = ' - '): ImprintSplit {
  const text = (imprint ?? '').trim();
  if (!text) return { titleLine1: '', titleLine2: '', eventDate: '' };
  const { remainder, date } = extractTrailingDate(text);
  if (lineSep && remainder.includes(lineSep)) {
    const idx = remainder.indexOf(lineSep);
    return {
      titleLine1: remainder.slice(0, idx).trim(),
      titleLine2: remainder.slice(idx + lineSep.length).trim(),
      eventDate: date,
    };
  }
  return { titleLine1: remainder.trim(), titleLine2: '', eventDate: date };
}

/**
 * Real personalization only when the imprint is non-empty AND differs from the
 * SKU (Four51 repeats the Product ID in this column for non-personalized lines).
 */
export function isPersonalized(imprint: string, productId: string): boolean {
  const t = (imprint ?? '').trim();
  return t.length > 0 && t !== (productId ?? '').trim();
}

function fullName(first: string, last: string): string {
  return [first?.trim(), last?.trim()].filter(Boolean).join(' ');
}

function toRecord(row: Record<string, string>, lineNumber: number, lineSep: string): PrintMergeRow {
  const imprint = (row[SRC.imprint] ?? '').trim();
  const productId = (row[SRC.productId] ?? '').trim();
  const personalized = isPersonalized(imprint, productId);
  const split = personalized ? splitImprint(imprint, lineSep) : { titleLine1: '', titleLine2: '', eventDate: '' };
  return {
    OrderID: (row[SRC.orderId] ?? '').trim(),
    LineNumber: String(lineNumber),
    ProductID: productId,
    ProductName: (row[SRC.productName] ?? '').trim(),
    IsPersonalized: personalized ? 'Yes' : 'No',
    CustomizedText: personalized ? imprint : '',
    TitleLine1: split.titleLine1,
    TitleLine2: split.titleLine2,
    EventDate: split.eventDate,
    Quantity: (row[SRC.totalQuantity] || row[SRC.quantity] || '').trim(),
    QuantityMultiplier: (row[SRC.quantityMultiplier] ?? '').trim(),
    ShipToCompany: (row[SRC.shipCompany] ?? '').trim(),
    ShipToName: fullName(row[SRC.shipFirst] ?? '', row[SRC.shipLast] ?? ''),
    ShipToCity: (row[SRC.shipCity] ?? '').trim(),
    ShipToState: (row[SRC.shipState] ?? '').trim(),
    DateSubmitted: (row[SRC.dateSubmitted] ?? '').trim(),
  };
}

/** Convert a Four51 orders CSV (as text) into a CorelDRAW Print Merge CSV (as text). */
export function convertFour51OrdersToPrintMerge(
  csvText: string,
  options: ConvertOptions = {}
): ConvertResult {
  const lineSep = options.lineSep ?? ' - ';
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: 'greedy',
  });

  const headers = parsed.meta.fields ?? [];
  const missing = REQUIRED_INPUT_COLUMNS.filter((c) => !headers.includes(c));
  if (missing.length > 0) {
    throw new Error(
      `Input does not look like a Four51 orders export. Missing columns: ${missing.join(', ')}`
    );
  }

  const stats: ConvertStats = {
    rowsIn: 0,
    rowsOut: 0,
    personalized: 0,
    withTwoLines: 0,
    withDate: 0,
  };
  const perOrder = new Map<string, number>();
  const records: PrintMergeRow[] = [];

  for (const row of parsed.data) {
    if (!row || Object.keys(row).length === 0) continue;
    stats.rowsIn += 1;
    const orderId = (row[SRC.orderId] ?? '').trim();
    const next = (perOrder.get(orderId) ?? 0) + 1;
    perOrder.set(orderId, next);

    const record = toRecord(row, next, lineSep);
    if (record.IsPersonalized === 'Yes') {
      stats.personalized += 1;
      if (record.TitleLine2) stats.withTwoLines += 1;
      if (record.EventDate) stats.withDate += 1;
    }

    let reps = 1;
    if (options.expandQuantity) {
      const q = Number.parseInt(record.Quantity || '1', 10);
      reps = Number.isFinite(q) && q > 0 ? q : 1;
    }
    for (let i = 0; i < reps; i += 1) {
      records.push(record);
      stats.rowsOut += 1;
    }
  }

  return { csv: serializePrintMergeCsv(records), stats };
}

/** Serialize Print Merge rows to RFC4180 CSV in the canonical column order. */
export function serializePrintMergeCsv(rows: PrintMergeRow[]): string {
  return Papa.unparse(rows, { columns: [...PRINT_MERGE_COLUMNS] });
}

// ---------------------------------------------------------------------------
// Stored-order path: build the same rows from persisted Four51 print orders
// (the cXML listener populates these), so the DB export and the CSV upload
// produce an identical Print Merge contract.
// ---------------------------------------------------------------------------

export interface StoredPrintLine {
  lineNumber: number;
  productId: string;
  description: string | null;
  quantity: number;
  quantityMultiplier: number;
  titleLine1: string | null;
  titleLine2: string | null;
  specs: Record<string, unknown>;
}

export interface StoredPrintOrder {
  four51OrderId: string;
  orderDate: Date | null;
  shipToCompany: string | null;
  shipToName: string | null;
  shipToCity: string | null;
  shipToState: string | null;
  lines: StoredPrintLine[];
}

export function buildPrintMergeRows(orders: StoredPrintOrder[]): PrintMergeRow[] {
  const rows: PrintMergeRow[] = [];
  for (const order of orders) {
    for (const line of order.lines) {
      const hasSpecs = Boolean(line.specs) && Object.keys(line.specs).length > 0;
      const personalized = Boolean(line.titleLine1 || line.titleLine2 || hasSpecs);
      rows.push({
        OrderID: order.four51OrderId,
        LineNumber: String(line.lineNumber),
        ProductID: line.productId,
        ProductName: line.description ?? '',
        IsPersonalized: personalized ? 'Yes' : 'No',
        CustomizedText: [line.titleLine1, line.titleLine2].filter(Boolean).join(' '),
        TitleLine1: line.titleLine1 ?? '',
        TitleLine2: line.titleLine2 ?? '',
        EventDate: '',
        Quantity: line.quantity ? String(line.quantity) : '',
        QuantityMultiplier: line.quantityMultiplier ? String(line.quantityMultiplier) : '',
        ShipToCompany: order.shipToCompany ?? '',
        ShipToName: order.shipToName ?? '',
        ShipToCity: order.shipToCity ?? '',
        ShipToState: order.shipToState ?? '',
        DateSubmitted: order.orderDate ? order.orderDate.toISOString().slice(0, 10) : '',
      });
    }
  }
  return rows;
}
