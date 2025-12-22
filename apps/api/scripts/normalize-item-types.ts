import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * One-time backfill script to normalize item_type values for all products.
 *
 * This script:
 * 1. Finds all products with non-standard item_type values (uppercase, unknown, null)
 * 2. Normalizes them to lowercase: 'evergreen', 'event', or 'completed'
 * 3. Maps unknown/null values to 'evergreen' (default)
 *
 * Run: npx tsx apps/api/scripts/normalize-item-types.ts
 *
 * Safe to run multiple times - idempotent.
 */

const VALID_ITEM_TYPES = ['evergreen', 'event', 'completed'] as const;

interface NormalizationStats {
  totalProducts: number;
  alreadyNormalized: number;
  lowercased: number;
  mappedToEvergreen: number;
  errors: string[];
}

async function normalizeItemTypes(): Promise<NormalizationStats> {
  const stats: NormalizationStats = {
    totalProducts: 0,
    alreadyNormalized: 0,
    lowercased: 0,
    mappedToEvergreen: 0,
    errors: [],
  };

  console.log('Starting item_type normalization...\n');

  // Get all products
  const products = await prisma.product.findMany({
    select: {
      id: true,
      productId: true,
      name: true,
      itemType: true,
      clientId: true,
    },
  });

  stats.totalProducts = products.length;
  console.log(`Found ${products.length} products to check.\n`);

  // Group by current item_type for reporting
  const typeDistribution = new Map<string, number>();
  for (const p of products) {
    const key = p.itemType || 'null';
    typeDistribution.set(key, (typeDistribution.get(key) || 0) + 1);
  }

  console.log('Current item_type distribution:');
  for (const [type, count] of typeDistribution.entries()) {
    console.log(`  ${type}: ${count}`);
  }
  console.log('');

  // Process each product
  for (const product of products) {
    const currentType = product.itemType;
    let newType: string;

    // Check if already normalized
    if (currentType && VALID_ITEM_TYPES.includes(currentType as any)) {
      stats.alreadyNormalized++;
      continue;
    }

    // Determine the normalized type
    if (currentType) {
      const lowerType = currentType.toLowerCase().trim();

      if (VALID_ITEM_TYPES.includes(lowerType as any)) {
        // Just needs lowercasing (e.g., "Evergreen" -> "evergreen")
        newType = lowerType;
        stats.lowercased++;
      } else {
        // Unknown value - map to 'evergreen'
        newType = 'evergreen';
        stats.mappedToEvergreen++;
        console.log(`  Product ${product.productId}: "${currentType}" -> "evergreen" (unknown value)`);
      }
    } else {
      // Null/undefined - default to 'evergreen'
      newType = 'evergreen';
      stats.mappedToEvergreen++;
      console.log(`  Product ${product.productId}: null -> "evergreen"`);
    }

    // Update the product
    try {
      await prisma.product.update({
        where: { id: product.id },
        data: { itemType: newType },
      });
    } catch (err) {
      const errorMsg = `Failed to update product ${product.productId}: ${err instanceof Error ? err.message : String(err)}`;
      stats.errors.push(errorMsg);
      console.error(`  ERROR: ${errorMsg}`);
    }
  }

  return stats;
}

async function main() {
  console.log('='.repeat(60));
  console.log('Item Type Normalization Script');
  console.log('='.repeat(60));
  console.log('');

  try {
    const stats = await normalizeItemTypes();

    console.log('\n' + '='.repeat(60));
    console.log('Summary:');
    console.log('='.repeat(60));
    console.log(`Total products:        ${stats.totalProducts}`);
    console.log(`Already normalized:    ${stats.alreadyNormalized}`);
    console.log(`Lowercased:            ${stats.lowercased}`);
    console.log(`Mapped to evergreen:   ${stats.mappedToEvergreen}`);
    console.log(`Errors:                ${stats.errors.length}`);
    console.log('');

    if (stats.errors.length > 0) {
      console.log('Errors encountered:');
      for (const err of stats.errors) {
        console.log(`  - ${err}`);
      }
    }

    // Verify final distribution
    const verifyProducts = await prisma.product.groupBy({
      by: ['itemType'],
      _count: true,
    });

    console.log('\nFinal item_type distribution:');
    for (const group of verifyProducts) {
      console.log(`  ${group.itemType || 'null'}: ${group._count}`);
    }

    console.log('\nNormalization complete!');
  } catch (err) {
    console.error('Script failed:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
