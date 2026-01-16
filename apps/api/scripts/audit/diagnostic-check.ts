
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

async function runDiagnostic() {
  console.log("Starting deep diagnostic check...");

  // 1. Check Database Connection
  try {
    await prisma.$connect();
    console.log("✅ Database connected successfully.");
  } catch (error) {
    console.error("❌ Database connection failed:", error);
    process.exit(1);
  }

  // 2. Check Recent Import Batches
  const recentImports = await prisma.importBatch.findMany({
    take: 5,
    orderBy: { createdAt: "desc" },
    include: {
      client: true,
    },
  });

  console.log(`\nFound ${recentImports.length} recent import batches:`);
  for (const batch of recentImports) {
    console.log(
      ` - ID: ${batch.id} | Status: ${batch.status} | Rows: ${batch.rowCount} | Processed: ${batch.processedCount} | Errors: ${batch.errorCount}`
    );
    if (batch.errors && Array.isArray(batch.errors) && batch.errors.length > 0) {
      console.log(`   ⚠️ Errors found in batch ${batch.id}:`);
      // @ts-ignore
      batch.errors.slice(0, 3).forEach((err: any) => {
        console.log(`     - [${err.type || 'Unknown'}] ${err.message}`);
      });
    }
  }

  // 3. Check for "Event" vs "event" itemType mismatch
  const mismatchedProducts = await prisma.product.count({
    where: {
      itemType: {
        notIn: ["evergreen", "event", "completed"],
      },
      isActive: true,
    },
  });

  if (mismatchedProducts > 0) {
    console.error(
      `\n❌ FOUND ${mismatchedProducts} PRODUCTS WITH INVALID ITEM TYPES (e.g. 'Event', 'Evergreen')`
    );
    console.log(
      "   Run the backfill script: 'python apps/python-importer/scripts/backfill_item_types.py <DATABASE_URL>'"
    );
  } else {
    console.log("\n✅ No invalid itemType values found in active products.");
  }

  // 4. Check for Orphaned Products
  const orphans = await prisma.product.count({
    where: { isOrphan: true, isActive: true },
  });
  console.log(`\nℹ️ Found ${orphans} active orphan products.`);

  // 5. ML Service Health Check (Simple URL check)
  const mlUrl = process.env.ML_SERVICE_URL || "http://localhost:8000";
  console.log(`\nChecking ML Service at ${mlUrl}...`);
  try {
    const mlResponse = await fetch(`${mlUrl}/health`);
    if (mlResponse.ok) {
      console.log("✅ ML Service is UP and HEALTHY.");
    } else {
      console.error(`❌ ML Service returned status ${mlResponse.status}`);
    }
  } catch (error) {
    console.error("❌ ML Service is DOWN or UNREACHABLE.");
  }

  await prisma.$disconnect();
  console.log("\nDiagnostic complete.");
}

runDiagnostic();
