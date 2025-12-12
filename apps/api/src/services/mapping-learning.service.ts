/**
 * Mapping Learning Service
 *
 * Learns from user corrections to improve column mapping accuracy over time.
 * When users correct mappings during import, we store those corrections
 * and use them to boost confidence scores in future imports.
 */

import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';

// =============================================================================
// TYPES
// =============================================================================

export interface MappingCorrectionInput {
  clientId: string;
  header: string;
  suggestedField: string;
  confirmedField: string;
}

export interface LearnedBoost {
  header: string;
  boostedField: string;
  boostAmount: number;
  correctionCount: number;
  daysSinceLastCorrection: number;
}

// =============================================================================
// CONSTANTS
// =============================================================================

// Weight decay half-life in days (after 90 days, boost is halved)
const HALF_LIFE_DAYS = 90;

// Maximum boost from learned corrections
const MAX_LEARNED_BOOST = 0.4;

// Minimum correction count before applying boost
const MIN_CORRECTION_COUNT = 1;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Normalize a header string for consistent storage and lookup.
 */
function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .trim()
    // Remove common punctuation
    .replace(/[()[\]{}]/g, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    // Remove common prefixes that vary between systems
    .replace(/^(ship to|ship|shipping|deliver to|delivery)\s+/i, '')
    .trim();
}

/**
 * Calculate weight decay based on days since last correction.
 * Uses exponential decay with configurable half-life.
 */
function calculateDecayWeight(daysSinceCorrection: number): number {
  // Exponential decay: weight = 0.5^(days/half_life)
  return Math.pow(0.5, daysSinceCorrection / HALF_LIFE_DAYS);
}

// =============================================================================
// STORE CORRECTIONS
// =============================================================================

/**
 * Store a mapping correction from user feedback.
 * Called when user confirms an import with modified mappings.
 */
export async function storeMappingCorrection(
  input: MappingCorrectionInput
): Promise<void> {
  const { clientId, header, suggestedField, confirmedField } = input;

  // Only store if the user actually changed the mapping
  if (suggestedField === confirmedField) {
    return;
  }

  const normalizedHeader = normalizeHeader(header);

  try {
    // Upsert: increment count if exists, create if not
    await prisma.mappingCorrection.upsert({
      where: {
        clientId_headerNormalized: {
          clientId,
          headerNormalized: normalizedHeader,
        },
      },
      create: {
        clientId,
        headerNormalized: normalizedHeader,
        suggestedField,
        confirmedField,
        correctionCount: 1,
        lastCorrectedAt: new Date(),
      },
      update: {
        confirmedField,
        correctionCount: { increment: 1 },
        lastCorrectedAt: new Date(),
      },
    });

    logger.info('Stored mapping correction', {
      clientId,
      header: normalizedHeader,
      from: suggestedField,
      to: confirmedField,
    });
  } catch (error) {
    logger.error('Failed to store mapping correction', error as Error, {
      clientId,
      header,
    });
  }
}

/**
 * Store multiple mapping corrections at once.
 * Called when user confirms import with modified mappings.
 */
export async function storeMappingCorrections(
  clientId: string,
  corrections: Array<{
    header: string;
    suggestedField: string;
    confirmedField: string;
  }>
): Promise<void> {
  // Filter to only actual changes
  const changes = corrections.filter(c => c.suggestedField !== c.confirmedField);

  if (changes.length === 0) {
    return;
  }

  // Store each correction
  await Promise.all(
    changes.map(c =>
      storeMappingCorrection({
        clientId,
        header: c.header,
        suggestedField: c.suggestedField,
        confirmedField: c.confirmedField,
      })
    )
  );

  logger.info(`Stored ${changes.length} mapping corrections for client ${clientId}`);
}

// =============================================================================
// RETRIEVE LEARNED BOOSTS
// =============================================================================

/**
 * Get learned boosts for headers based on previous corrections.
 * Returns a map of normalized header -> { field, boost }
 */
export async function getLearnedBoosts(
  clientId: string,
  headers: string[]
): Promise<Map<string, LearnedBoost>> {
  const boosts = new Map<string, LearnedBoost>();

  if (headers.length === 0) {
    return boosts;
  }

  // Normalize all headers
  const normalizedHeaders = headers.map(normalizeHeader);

  try {
    // Fetch corrections for these headers
    const corrections = await prisma.mappingCorrection.findMany({
      where: {
        clientId,
        headerNormalized: { in: normalizedHeaders },
      },
    });

    const now = new Date();

    for (const correction of corrections) {
      if (correction.correctionCount < MIN_CORRECTION_COUNT) {
        continue;
      }

      // Calculate days since last correction
      const daysSince = Math.floor(
        (now.getTime() - correction.lastCorrectedAt.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Calculate decay weight
      const decayWeight = calculateDecayWeight(daysSince);

      // Calculate boost amount based on correction count and decay
      // More corrections = higher confidence in the learned mapping
      const baseBoost = Math.min(
        MAX_LEARNED_BOOST,
        0.15 + 0.05 * Math.log2(correction.correctionCount + 1)
      );
      const boostAmount = baseBoost * decayWeight;

      // Find the original header that matches this normalized version
      const originalIdx = normalizedHeaders.findIndex(
        h => h === correction.headerNormalized
      );
      const originalHeader = originalIdx >= 0 ? headers[originalIdx] : correction.headerNormalized;

      boosts.set(correction.headerNormalized, {
        header: originalHeader,
        boostedField: correction.confirmedField,
        boostAmount,
        correctionCount: correction.correctionCount,
        daysSinceLastCorrection: daysSince,
      });
    }
  } catch (error) {
    logger.error('Failed to fetch learned boosts', error as Error, { clientId });
  }

  return boosts;
}

/**
 * Apply learned boosts to mapping candidates.
 * Returns updated confidence score for the target field.
 */
export function applyLearnedBoost(
  header: string,
  targetField: string,
  currentConfidence: number,
  learnedBoosts: Map<string, LearnedBoost>
): { confidence: number; isLearned: boolean } {
  const normalized = normalizeHeader(header);
  const boost = learnedBoosts.get(normalized);

  if (boost && boost.boostedField === targetField) {
    return {
      confidence: Math.min(1.0, currentConfidence + boost.boostAmount),
      isLearned: true,
    };
  }

  // If there's a learned boost for a different field, slightly penalize this one
  if (boost && boost.boostedField !== targetField) {
    return {
      confidence: currentConfidence * 0.85,
      isLearned: false,
    };
  }

  return { confidence: currentConfidence, isLearned: false };
}

// =============================================================================
// CLEANUP
// =============================================================================

/**
 * Clean up old corrections that haven't been used in a long time.
 * Called periodically to prevent database bloat.
 */
export async function cleanupOldCorrections(daysThreshold = 365): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysThreshold);

  try {
    const result = await prisma.mappingCorrection.deleteMany({
      where: {
        lastCorrectedAt: { lt: cutoffDate },
      },
    });

    if (result.count > 0) {
      logger.info(`Cleaned up ${result.count} old mapping corrections`);
    }

    return result.count;
  } catch (error) {
    logger.error('Failed to cleanup old corrections', error as Error);
    return 0;
  }
}

// =============================================================================
// ANALYTICS
// =============================================================================

/**
 * Get statistics about mapping corrections for a client.
 */
export async function getMappingStats(clientId: string): Promise<{
  totalCorrections: number;
  uniqueHeaders: number;
  topCorrections: Array<{
    header: string;
    from: string;
    to: string;
    count: number;
  }>;
}> {
  try {
    const corrections = await prisma.mappingCorrection.findMany({
      where: { clientId },
      orderBy: { correctionCount: 'desc' },
      take: 10,
    });

    return {
      totalCorrections: corrections.reduce((sum, c) => sum + c.correctionCount, 0),
      uniqueHeaders: corrections.length,
      topCorrections: corrections.map(c => ({
        header: c.headerNormalized,
        from: c.suggestedField,
        to: c.confirmedField,
        count: c.correctionCount,
      })),
    };
  } catch (error) {
    logger.error('Failed to get mapping stats', error as Error, { clientId });
    return { totalCorrections: 0, uniqueHeaders: 0, topCorrections: [] };
  }
}
