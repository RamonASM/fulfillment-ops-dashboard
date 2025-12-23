/**
 * FIX DATA ISSUES SCRIPT
 *
 * Fixes issues discovered by the diagnostic:
 * 1. Normalize transaction status to lowercase
 * 2. Trigger usage recalculation for Everstory
 *
 * Run with: npx tsx apps/api/scripts/audit/fix-data-issues.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function normalizeTransactionStatus() {
  console.log("\n=== FIX 1: Normalize Transaction Status ===");

  // Check current status distribution
  const beforeStats = await prisma.$queryRaw<Array<{ order_status: string; count: bigint }>>`
    SELECT order_status, COUNT(*) as count
    FROM transactions
    GROUP BY order_status
    ORDER BY count DESC
  `;

  console.log("Before normalization:");
  beforeStats.forEach((s) => {
    console.log(`  ${s.order_status}: ${s.count}`);
  });

  // Normalize "Completed" to "completed"
  const completedResult = await prisma.$executeRaw`
    UPDATE transactions
    SET order_status = 'completed'
    WHERE order_status = 'Completed'
  `;
  console.log(`\nUpdated ${completedResult} 'Completed' → 'completed'`);

  // Normalize "Canceled" to "canceled"
  const canceledResult = await prisma.$executeRaw`
    UPDATE transactions
    SET order_status = 'canceled'
    WHERE order_status = 'Canceled'
  `;
  console.log(`Updated ${canceledResult} 'Canceled' → 'canceled'`);

  // Check after
  const afterStats = await prisma.$queryRaw<Array<{ order_status: string; count: bigint }>>`
    SELECT order_status, COUNT(*) as count
    FROM transactions
    GROUP BY order_status
    ORDER BY count DESC
  `;

  console.log("\nAfter normalization:");
  afterStats.forEach((s) => {
    console.log(`  ${s.order_status}: ${s.count}`);
  });

  console.log("\n✅ Transaction status normalization complete");
}

async function recalculateEverstoryUsage() {
  console.log("\n=== FIX 2: Recalculate Everstory Usage ===");

  // Get Everstory client
  const client = await prisma.client.findFirst({
    where: { code: "EVE" },
  });

  if (!client) {
    console.log("❌ Everstory client not found");
    return;
  }

  console.log(`Found Everstory client: ${client.id}`);

  // Get products for Everstory
  const products = await prisma.product.findMany({
    where: { clientId: client.id, isActive: true },
    select: { id: true, productId: true, packSize: true },
  });

  console.log(`Found ${products.length} products to process`);

  // For each product, calculate usage from transactions
  let updated = 0;
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

  for (const product of products) {
    // Get transaction totals for this product in last 12 months
    const transactionStats = await prisma.$queryRaw<
      Array<{
        total_units: bigint;
        transaction_count: bigint;
        first_date: Date;
        last_date: Date;
      }>
    >`
      SELECT
        COALESCE(SUM(quantity_units), 0) as total_units,
        COUNT(*) as transaction_count,
        MIN(date_submitted) as first_date,
        MAX(date_submitted) as last_date
      FROM transactions
      WHERE product_id = ${product.id}::uuid
        AND date_submitted >= ${twelveMonthsAgo}
        AND LOWER(order_status) = 'completed'
    `;

    const stats = transactionStats[0];
    if (!stats || Number(stats.transaction_count) === 0) {
      continue;
    }

    // Calculate usage metrics
    const totalUnits = Number(stats.total_units);
    const daysBetween = Math.max(
      1,
      Math.ceil(
        (new Date(stats.last_date).getTime() -
          new Date(stats.first_date).getTime()) /
          (1000 * 60 * 60 * 24)
      )
    );

    const avgDailyUsage = totalUnits / daysBetween;
    const monthlyUsageUnits = avgDailyUsage * 30.44;
    const monthlyUsagePacks = monthlyUsageUnits / (product.packSize || 1);

    // Calculate weeks remaining
    const currentProduct = await prisma.product.findUnique({
      where: { id: product.id },
      select: { currentStockUnits: true },
    });

    const weeksRemaining =
      avgDailyUsage > 0
        ? Math.floor(
            (currentProduct?.currentStockUnits || 0) / (avgDailyUsage * 7)
          )
        : 999;

    // Determine stock status
    let stockStatus = "healthy";
    if (weeksRemaining <= 1) {
      stockStatus = "critical";
    } else if (weeksRemaining <= 2) {
      stockStatus = "low";
    } else if (weeksRemaining <= 4) {
      stockStatus = "watch";
    }

    // Update product
    await prisma.product.update({
      where: { id: product.id },
      data: {
        avgDailyUsage,
        monthlyUsageUnits,
        monthlyUsagePacks,
        weeksRemaining,
        stockStatus,
        usageCalculationTier: "12_month",
        usageConfidence: "high",
        usageLastCalculated: new Date(),
        usageCalculationMethod: "transaction_history",
      },
    });

    updated++;
  }

  console.log(`\n✅ Updated usage data for ${updated}/${products.length} products`);

  // Verify results
  const productsWithUsage = await prisma.product.count({
    where: {
      clientId: client.id,
      isActive: true,
      OR: [
        { avgDailyUsage: { gt: 0 } },
        { monthlyUsageUnits: { gt: 0 } },
      ],
    },
  });

  console.log(`Products with usage data: ${productsWithUsage}/${products.length}`);
}

async function cleanupPendingImports() {
  console.log("\n=== FIX 3: Cleanup Pending/Stuck Imports ===");

  // Find stuck pending imports older than 1 hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const stuckImports = await prisma.importBatch.findMany({
    where: {
      status: "pending",
      createdAt: { lt: oneHourAgo },
    },
    select: { id: true, filename: true, createdAt: true },
  });

  console.log(`Found ${stuckImports.length} stuck pending imports`);

  for (const batch of stuckImports) {
    await prisma.importBatch.update({
      where: { id: batch.id },
      data: {
        status: "failed",
        completedAt: new Date(),
        errors: [{ message: "Import timed out - marked as failed by cleanup script" }],
      },
    });
    console.log(`  Marked ${batch.id.slice(0, 8)} as failed (${batch.filename})`);
  }

  console.log("\n✅ Cleanup complete");
}

async function main() {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║     DATA ISSUES FIX SCRIPT                                 ║");
  console.log("╚════════════════════════════════════════════════════════════╝");

  try {
    await normalizeTransactionStatus();
    await recalculateEverstoryUsage();
    await cleanupPendingImports();

    console.log("\n" + "=".repeat(60));
    console.log("ALL FIXES COMPLETE");
    console.log("=".repeat(60));
  } catch (error) {
    console.error("\n❌ Error during fix:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
