import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkRecentImports() {
  console.log("\n🔍 Checking recent import attempts...\n");

  const imports = await prisma.importBatch.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      status: true,
      createdAt: true,
      completedAt: true,
      importType: true,
      errorCount: true,
      processedCount: true,
      rowCount: true,
      filename: true,
      errors: true,
      diagnosticLogs: true,
      metadata: true,
      client: { select: { name: true, code: true } },
    },
  });

  if (imports.length === 0) {
    console.log("❌ No import batches found in database.");
    console.log(
      "\nPossible reasons:\n" +
        "  1. Import failed before creating database record\n" +
        "  2. Wrong database connection\n" +
        "  3. No imports have been attempted\n"
    );
    return;
  }

  console.log(`✅ Found ${imports.length} recent import(s):\n`);

  for (const imp of imports) {
    const statusIcon =
      imp.status === "completed"
        ? "✅"
        : imp.status === "failed"
          ? "❌"
          : "⏳";

    console.log(`${statusIcon} Import ID: ${imp.id.substring(0, 8)}...`);
    console.log(`   Client: ${imp.client.code} - ${imp.client.name}`);
    console.log(`   Type: ${imp.importType}`);
    console.log(`   Status: ${imp.status}`);
    console.log(`   File: ${imp.filename || "N/A"}`);
    console.log(`   Created: ${imp.createdAt.toISOString()}`);
    if (imp.completedAt) {
      console.log(`   Completed: ${imp.completedAt.toISOString()}`);
    }
    console.log(
      `   Rows: ${imp.rowCount || 0} total, ${imp.processedCount} processed, ${imp.errorCount} errors`
    );

    // Check metadata for analytics completion
    if (imp.metadata) {
      const meta = imp.metadata as any;
      console.log(`   📊 Analytics:`);
      console.log(`      - Completed: ${meta.analytics_completed || false}`);
      console.log(
        `      - Risk Scores: ${meta.risk_scores_calculated || false}`
      );
      console.log(
        `      - Alert Metrics: ${meta.alert_metrics_aggregated || false}`
      );
    }

    // Show errors if any
    if (imp.errorCount > 0 && imp.errors) {
      console.log(`\n   ❌ ERRORS (${imp.errorCount}):`);
      const errors = Array.isArray(imp.errors) ? imp.errors : [];
      errors.slice(0, 3).forEach((error: any, idx: number) => {
        console.log(`      ${idx + 1}. ${JSON.stringify(error)}`);
      });
      if (errors.length > 3) {
        console.log(`      ... and ${errors.length - 3} more errors`);
      }
    }

    // Show diagnostic logs
    if (imp.diagnosticLogs) {
      const logs = Array.isArray(imp.diagnosticLogs)
        ? imp.diagnosticLogs
        : [];
      console.log(`\n   🔍 Diagnostic Logs: ${logs.length} entries`);
      const errorLogs = logs.filter((l: any) => l.level === "error");
      if (errorLogs.length > 0) {
        console.log(`      ❌ ${errorLogs.length} error(s) in logs`);
        errorLogs.slice(0, 2).forEach((log: any) => {
          console.log(`         - ${log.message}`);
        });
      }
    }

    console.log("\n" + "=".repeat(80) + "\n");
  }

  // Check if products were created
  const productCount = await prisma.product.count();
  console.log(`📦 Total products in database: ${productCount}`);

  // Check if analytics data exists
  const snapshotCount = await prisma.dailySnapshot.count();
  console.log(`📊 Total daily snapshots: ${snapshotCount}`);
}

async function main() {
  try {
    await checkRecentImports();
  } catch (error) {
    console.error("❌ Error checking imports:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
