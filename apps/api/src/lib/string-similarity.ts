/**
 * String similarity algorithms for smart column mapping.
 * Uses Jaro-Winkler for fuzzy matching and token overlap for multi-word headers.
 */

// =============================================================================
// JARO-WINKLER SIMILARITY
// =============================================================================

/**
 * Calculate Jaro similarity between two strings.
 * Returns a score between 0 and 1.
 */
function jaroSimilarity(s1: string, s2: string): number {
  if (s1 === s2) return 1.0;

  const len1 = s1.length;
  const len2 = s2.length;

  if (len1 === 0 || len2 === 0) return 0.0;

  // Match window: floor(max(len1, len2) / 2) - 1
  const matchWindow = Math.floor(Math.max(len1, len2) / 2) - 1;

  const s1Matches = new Array(len1).fill(false);
  const s2Matches = new Array(len2).fill(false);

  let matches = 0;
  let transpositions = 0;

  // Find matching characters
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, len2);

    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0.0;

  // Count transpositions
  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  // Jaro similarity formula
  return (
    (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) /
    3
  );
}

/**
 * Calculate Jaro-Winkler similarity between two strings.
 * Gives bonus for common prefix (up to 4 characters).
 * Returns a score between 0 and 1.
 */
export function jaroWinkler(s1: string, s2: string): number {
  const jaro = jaroSimilarity(s1, s2);

  // Winkler modification: bonus for common prefix (max 4 chars)
  let prefix = 0;
  const maxPrefix = Math.min(4, Math.min(s1.length, s2.length));
  for (let i = 0; i < maxPrefix; i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }

  const scalingFactor = 0.1; // Standard Winkler scaling factor
  return jaro + prefix * scalingFactor * (1 - jaro);
}

// =============================================================================
// TOKEN-BASED SIMILARITY
// =============================================================================

/**
 * Calculate token overlap similarity (Jaccard index).
 * Handles word order differences: "Qty Available" vs "Available Qty"
 */
export function tokenSimilarity(s1: string, s2: string): number {
  const tokens1 = new Set(
    s1
      .toLowerCase()
      .split(/[\s\-_]+/)
      .filter((t) => t.length > 0)
  );
  const tokens2 = new Set(
    s2
      .toLowerCase()
      .split(/[\s\-_]+/)
      .filter((t) => t.length > 0)
  );

  if (tokens1.size === 0 && tokens2.size === 0) return 1.0;
  if (tokens1.size === 0 || tokens2.size === 0) return 0.0;

  const intersection = new Set([...tokens1].filter((x) => tokens2.has(x)));
  const union = new Set([...tokens1, ...tokens2]);

  return intersection.size / union.size;
}

/**
 * Calculate partial token match score.
 * Checks if any token in s1 is a substring of any token in s2 (or vice versa).
 * Useful for abbreviations: "qty" partially matches "quantity".
 */
export function partialTokenMatch(s1: string, s2: string): number {
  const tokens1 = s1
    .toLowerCase()
    .split(/[\s\-_]+/)
    .filter((t) => t.length > 0);
  const tokens2 = s2
    .toLowerCase()
    .split(/[\s\-_]+/)
    .filter((t) => t.length > 0);

  if (tokens1.length === 0 || tokens2.length === 0) return 0;

  let matchedTokens = 0;
  const totalTokens = tokens1.length;

  for (const t1 of tokens1) {
    for (const t2 of tokens2) {
      // Check if either is substring of the other
      if (t1.includes(t2) || t2.includes(t1)) {
        matchedTokens++;
        break;
      }
    }
  }

  return matchedTokens / totalTokens;
}

// =============================================================================
// COMBINED SIMILARITY
// =============================================================================

/**
 * Combined similarity score using multiple algorithms.
 * Weights: 50% Jaro-Winkler, 30% token overlap, 20% partial match
 */
export function combinedSimilarity(s1: string, s2: string): number {
  const normalized1 = s1.toLowerCase().trim();
  const normalized2 = s2.toLowerCase().trim();

  // Exact match
  if (normalized1 === normalized2) return 1.0;

  const jaroScore = jaroWinkler(normalized1, normalized2);
  const tokenScore = tokenSimilarity(normalized1, normalized2);
  const partialScore = partialTokenMatch(normalized1, normalized2);

  // Weighted combination
  return jaroScore * 0.5 + tokenScore * 0.3 + partialScore * 0.2;
}

// =============================================================================
// ABBREVIATION EXPANSION
// =============================================================================

/**
 * Common abbreviations used in inventory/order management spreadsheets.
 */
export const ABBREVIATIONS: Record<string, string> = {
  // Quantity
  qty: 'quantity',
  amt: 'amount',
  cnt: 'count',
  ct: 'count',

  // Product
  prod: 'product',
  itm: 'item',
  art: 'article',
  mat: 'material',
  sku: 'stock keeping unit',

  // Description
  desc: 'description',
  descr: 'description',

  // Availability
  avail: 'available',
  curr: 'current',

  // Inventory
  inv: 'inventory',
  stk: 'stock',
  whse: 'warehouse',
  wh: 'warehouse',

  // Order
  ord: 'order',
  po: 'purchase order',
  so: 'sales order',

  // Numbers/IDs
  no: 'number',
  num: 'number',
  '#': 'number',
  id: 'identifier',
  ref: 'reference',
  doc: 'document',

  // Date/Time
  dt: 'date',

  // Location
  addr: 'address',
  loc: 'location',

  // Shipping
  shp: 'ship',
  dlvr: 'deliver',
  dlv: 'delivery',

  // Status
  stat: 'status',
  sts: 'status',

  // Misc
  lvl: 'level',
  min: 'minimum',
  max: 'maximum',
  avg: 'average',
  tot: 'total',
  pt: 'point',
  cfg: 'configuration',
};

/**
 * Expand abbreviations in a string.
 * Replaces known abbreviations with their full forms.
 */
export function expandAbbreviations(text: string): string {
  let expanded = text.toLowerCase().trim();

  for (const [abbr, full] of Object.entries(ABBREVIATIONS)) {
    // Only expand standalone words (not parts of other words)
    const regex = new RegExp(`\\b${escapeRegex(abbr)}\\b`, 'gi');
    expanded = expanded.replace(regex, full);
  }

  return expanded;
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// =============================================================================
// SIMILARITY WITH ABBREVIATION EXPANSION
// =============================================================================

/**
 * Calculate similarity with abbreviation expansion.
 * First expands abbreviations in both strings, then calculates similarity.
 */
export function similarityWithExpansion(s1: string, s2: string): number {
  const expanded1 = expandAbbreviations(s1);
  const expanded2 = expandAbbreviations(s2);

  return combinedSimilarity(expanded1, expanded2);
}

// =============================================================================
// BEST MATCH FINDER
// =============================================================================

export interface MatchResult {
  pattern: string;
  similarity: number;
  expanded: boolean;
}

/**
 * Find the best matching pattern from a list of patterns.
 * Tries both direct matching and with abbreviation expansion.
 */
export function findBestMatch(
  input: string,
  patterns: string[]
): MatchResult | null {
  if (patterns.length === 0) return null;

  const normalizedInput = input.toLowerCase().trim();
  const expandedInput = expandAbbreviations(input);

  let bestMatch: MatchResult | null = null;

  for (const pattern of patterns) {
    const normalizedPattern = pattern.toLowerCase().trim();

    // Try exact match first
    if (normalizedInput === normalizedPattern) {
      return { pattern, similarity: 1.0, expanded: false };
    }

    // Try direct similarity
    const directSimilarity = combinedSimilarity(normalizedInput, normalizedPattern);
    if (!bestMatch || directSimilarity > bestMatch.similarity) {
      bestMatch = { pattern, similarity: directSimilarity, expanded: false };
    }

    // Try with abbreviation expansion
    const expandedPattern = expandAbbreviations(pattern);
    const expandedSimilarity = combinedSimilarity(expandedInput, expandedPattern);
    if (expandedSimilarity > bestMatch.similarity) {
      bestMatch = { pattern, similarity: expandedSimilarity, expanded: true };
    }
  }

  return bestMatch;
}

// =============================================================================
// CONFIDENCE LEVEL DETERMINATION
// =============================================================================

export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

/**
 * Get confidence level based on similarity score.
 */
export function getConfidenceLevel(similarity: number): ConfidenceLevel {
  if (similarity >= 0.90) return 'HIGH';
  if (similarity >= 0.70) return 'MEDIUM';
  if (similarity >= 0.50) return 'LOW';
  return 'NONE';
}

/**
 * Get numeric confidence from similarity score.
 * Maps similarity to a confidence value for the API.
 */
export function getConfidenceScore(similarity: number): number {
  if (similarity >= 1.0) return 1.0;
  if (similarity >= 0.90) return 0.95;
  if (similarity >= 0.80) return 0.85;
  if (similarity >= 0.70) return 0.70;
  if (similarity >= 0.60) return 0.55;
  return 0;
}
