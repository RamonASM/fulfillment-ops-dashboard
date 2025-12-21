/**
 * Check recent import errors
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkImportErrors() {
  console.log("\n🔍 Checking for recent import errors...\n");

  // Get recent import batches
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
    return;
  }

  console.log(`📊 Found ${recentImports.length} recent import(s):\n`);

  for (const importBatch of recentImports) {
    const statusIcon = importBatch.status === 'completed' ? '✅' :
                       importBatch.status === 'failed' ? '❌' :
                       importBatch.status === 'processing' ? '⏳' : '📝';

    console.log(`${statusIcon} Import ID: ${importBatch.id}`);
    console.log(`   Client: ${importBatch.client.code} - ${importBatch.client.name}`);
    console.log(`   Type: ${importBatch.importType}`);
    console.log(`   Status: ${importBatch.status}`);
    console.log(`   Filename: ${importBatch.filename || 'N/A'}`);
    console.log(`   Created: ${importBatch.createdAt}`);
    console.log(`   Row Count: ${importBatch.rowCount || 0}`);
    console.log(`   Processed: ${importBatch.processedCount}`);
    console.log(`   Error Count: ${importBatch.errorCount}`);

    if (importBatch.errorCount > 0) {
      console.log(`   ❌ ERRORS: ${JSON.stringify(importBatch.errors, null, 2)}`);
    }

    if (importBatch.diagnosticLogs) {
      console.log(`   🔍 Diagnostic Logs: ${JSON.stringify(importBatch.diagnosticLogs, null, 2)}`);
    }

    if (importBatch.metadata) {
      console.log(`   📋 Metadata: ${JSON.stringify(importBatch.metadata, null, 2)}`);
    }

    console.log('');
  }

  // Check for failed imports specifically
  const failedImports = recentImports.filter(i => i.status === 'failed' || i.errorCount > 0);
  if (failedImports.length > 0) {
    console.log(`\n⚠️  Found ${failedImports.length} import(s) with errors:\n`);
    failedImports.forEach(imp => {
      console.log(`Import ${imp.id}:`);
      console.log(`  Status: ${imp.status}`);
      console.log(`  Error Count: ${imp.errorCount}`);
      console.log(`  Errors: ${JSON.stringify(imp.errors, null, 2)}`);
      if (imp.diagnosticLogs) {
        console.log(`  Diagnostic Logs: ${JSON.stringify(imp.diagnosticLogs, null, 2)}`);
      }
      console.log('');
    });
  }
}

async function main() {
  try {
    await checkImportErrors();
  } catch (error) {
    console.error("❌ Check failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
