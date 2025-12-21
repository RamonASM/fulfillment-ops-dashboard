/**
 * Check diagnostic logs from recent imports
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkDiagnostics() {
  console.log("\n🔍 Checking diagnostic logs from recent imports...\n");

  // Get recent import batches with diagnostic logs
  const recentImports = await prisma.importBatch.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: {
      client: {
        select: { code: true, name: true },
      },
    },
  });

  if (recentImports.length === 0) {
    console.log("⚠️  No import batches found in database.");
    console.log("\nℹ️  This means no import has been attempted yet.");
    console.log("   The diagnostic logs will appear here after an import runs.\n");
    return;
  }

  console.log(`📊 Found ${recentImports.length} recent import(s):\n`);
  console.log("=".repeat(80) + "\n");

  for (const imp of recentImports) {
    const statusIcon = imp.status === 'completed' ? '✅' :
                       imp.status === 'failed' ? '❌' :
                       imp.status === 'processing' ? '⏳' : '📝';

    console.log(`${statusIcon} Import: ${imp.id.substring(0, 8)}...`);
    console.log(`   Client: ${imp.client.code} - ${imp.client.name}`);
    console.log(`   Type: ${imp.importType}`);
    console.log(`   Status: ${imp.status}`);
    console.log(`   Filename: ${imp.filename || 'N/A'}`);
    console.log(`   Created: ${imp.createdAt.toISOString()}`);
    console.log(`   Rows: ${imp.rowCount || 0} total, ${imp.processedCount} processed, ${imp.errorCount} errors`);

    // Show errors array
    if (imp.errorCount > 0 && imp.errors) {
      console.log(`\n   ❌ ERRORS (${imp.errorCount}):`);
      const errors = Array.isArray(imp.errors) ? imp.errors : [];
      errors.slice(0, 5).forEach((error: any, idx: number) => {
        console.log(`      ${idx + 1}. ${JSON.stringify(error)}`);
      });
      if (errors.length > 5) {
        console.log(`      ... and ${errors.length - 5} more errors`);
      }
    }

    // Show diagnostic logs (the key part!)
    if (imp.diagnosticLogs) {
      console.log(`\n   🔍 DIAGNOSTIC LOGS:`);
      const logs = Array.isArray(imp.diagnosticLogs) ? imp.diagnosticLogs : [];

      if (logs.length === 0) {
        console.log(`      (No diagnostic logs captured)`);
      } else {
        // Group by level
        const grouped: Record<string, any[]> = {};
        logs.forEach((log: any) => {
          const level = log.level || 'unknown';
          if (!grouped[level]) grouped[level] = [];
          grouped[level].push(log);
        });

        Object.entries(grouped).forEach(([level, levelLogs]) => {
          const icon = level === 'error' ? '❌' :
                       level === 'warning' ? '⚠️' :
                       level === 'info' ? 'ℹ️' : '🔍';
          console.log(`\n      ${icon} ${level.toUpperCase()} (${levelLogs.length}):`);
          levelLogs.slice(0, 3).forEach((log: any) => {
            console.log(`         ${log.message}`);
            if (log.context) {
              console.log(`         Context: ${JSON.stringify(log.context, null, 2).split('\n').join('\n         ')}`);
            }
            if (log.timestamp) {
              console.log(`         Time: ${log.timestamp}`);
            }
          });
          if (levelLogs.length > 3) {
            console.log(`         ... and ${levelLogs.length - 3} more ${level} logs`);
          }
        });
      }
    } else {
      console.log(`\n   ℹ️  No diagnostic logs available for this import`);
    }

    console.log("\n" + "=".repeat(80) + "\n");
  }

  // Summary
  const withDiagnostics = recentImports.filter(i => i.diagnosticLogs);
  const withErrors = recentImports.filter(i => i.errorCount > 0);
  const failed = recentImports.filter(i => i.status === 'failed');

  console.log("📊 SUMMARY:");
  console.log(`   Total imports: ${recentImports.length}`);
  console.log(`   With diagnostics: ${withDiagnostics.length}`);
  console.log(`   With errors: ${withErrors.length}`);
  console.log(`   Failed: ${failed.length}`);
  console.log();
}

async function main() {
  try {
    await checkDiagnostics();
  } catch (error) {
    console.error("❌ Check failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
