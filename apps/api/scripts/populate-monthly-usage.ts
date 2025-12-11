import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * One-time script to populate Phase 13 monthly usage tiers for all products.
 * This calculates and stores:
 * - monthlyUsageUnits / monthlyUsagePacks
 * - usageCalculationTier ('12_month' | '6_month' | '3_month' | 'weekly')
 * - usageConfidence ('high' | 'medium' | 'low')
 *
 * Run: npx tsx apps/api/scripts/populate-monthly-usage.ts
 */

type UsageCalculationTier = '12_month' | '6_month' | '3_month' | 'weekly';
type UsageConfidence = 'high' | 'medium' | 'low';

interface MonthlyUsageResult {
  monthlyUsageUnits: number;
  monthlyUsagePacks: number;
  calculationTier: UsageCalculationTier;
  confidence: UsageConfidence;
  dataMonths: number;
}

async function calculateMonthlyUsage(productId: string): Promise<MonthlyUsageResult | null> {
  // Get all transactions for the product grouped by month
  const transactions = await prisma.transaction.findMany({
    where: { productId },
    orderBy: { dateSubmitted: 'desc' },
    select: { quantityUnits: true, dateSubmitted: true },
  });

  if (transactions.length === 0) {
    return null;
  }

  // Group transactions by month
  const monthlyTotals = new Map<string, number>();
  for (const tx of transactions) {
    const monthKey = `${tx.dateSubmitted.getFullYear()}-${String(tx.dateSubmitted.getMonth() + 1).padStart(2, '0')}`;
    const current = monthlyTotals.get(monthKey) || 0;
    monthlyTotals.set(monthKey, current + tx.quantityUnits);
  }

  const months = Array.from(monthlyTotals.entries())
    .sort((a, b) => b[0].localeCompare(a[0])); // Most recent first

  const dataMonths = months.length;

  // Determine calculation tier and confidence
  let calculationTier: UsageCalculationTier;
  let confidence: UsageConfidence;
  let monthsToUse: number;

  if (dataMonths >= 12) {
    calculationTier = '12_month';
    confidence = 'high';
    monthsToUse = 12;
  } else if (dataMonths >= 6) {
    calculationTier = '6_month';
    confidence = 'medium';
    monthsToUse = 6;
  } else if (dataMonths >= 3) {
    calculationTier = '3_month';
    confidence = 'medium';
    monthsToUse = dataMonths;
  } else {
    calculationTier = 'weekly';
    confidence = 'low';
    monthsToUse = dataMonths;
  }

  // Calculate average monthly usage
  const relevantMonths = months.slice(0, monthsToUse);
  const totalUnits = relevantMonths.reduce((sum, [, units]) => sum + units, 0);
  const monthlyUsageUnits = monthsToUse > 0 ? totalUnits / monthsToUse : 0;

  // Get pack size to calculate packs
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { packSize: true },
  });

  const packSize = product?.packSize || 1;
  const monthlyUsagePacks = monthlyUsageUnits / packSize;

  return {
    monthlyUsageUnits,
    monthlyUsagePacks,
    calculationTier,
    confidence,
    dataMonths,
  };
}

async function main() {
  console.log('🔄 Populating Phase 13 monthly usage tiers for all products...\n');

  // Get all active clients
  const clients = await prisma.client.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  });

  console.log(`Found ${clients.length} active clients\n`);

  let totalProducts = 0;
  let updatedProducts = 0;

  for (const client of clients) {
    console.log(`📊 Processing client: ${client.name}`);

    const products = await prisma.product.findMany({
      where: { clientId: client.id, isActive: true },
      select: { id: true, name: true },
    });

    totalProducts += products.length;

    for (const product of products) {
      const usage = await calculateMonthlyUsage(product.id);

      if (usage) {
        await prisma.product.update({
          where: { id: product.id },
          data: {
            monthlyUsageUnits: usage.monthlyUsageUnits,
            monthlyUsagePacks: usage.monthlyUsagePacks,
            usageCalculationTier: usage.calculationTier,
            usageConfidence: usage.confidence,
            usageDataMonths: usage.dataMonths,
            usageLastCalculated: new Date(),
          },
        });
        updatedProducts++;
        console.log(`  ✓ ${product.name}: ${usage.calculationTier} (${usage.confidence}), ${usage.monthlyUsagePacks.toFixed(1)} packs/mo`);
      } else {
        console.log(`  ⚠ ${product.name}: No transaction data`);
      }
    }
    console.log();
  }

  console.log(`\n✅ Complete! Updated ${updatedProducts}/${totalProducts} products with usage tiers.`);
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
