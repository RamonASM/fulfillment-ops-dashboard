/**
 * Delete Failed Import Batches
 *
 * This script permanently deletes all failed/rolled_back import batches.
 * These are from before the quantity_packs fix and contain no useful data.
 *
 * Run with: npx tsx apps/api/scripts/cleanup/delete-failed-imports.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function deleteFailedImports(): Promise<void> {
  console.log('='.repeat(60));
  console.log('DELETE FAILED IMPORT BATCHES');
  console.log('='.repeat(60));
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  try {
    // Find all failed/rolled_back imports
    const failedImports = await prisma.importBatch.findMany({
      where: {
        status: { in: ['failed', 'rolled_back'] },
      },
      select: {
        id: true,
        filename: true,
        status: true,
        errors: true,
        createdAt: true,
        client: {
          select: {
            name: true,
            code: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (failedImports.length === 0) {
      console.log('No failed import batches found. Database is clean.');
      return;
    }

    console.log(`Found ${failedImports.length} failed import batches:\n`);

    // Document what we're deleting (for changelog)
    console.log('BATCHES TO DELETE:');
    console.log('-'.repeat(60));

    for (const batch of failedImports) {
      console.log(`\n  ID: ${batch.id}`);
      console.log(`  File: ${batch.filename || 'Unknown'}`);
      console.log(`  Client: ${batch.client?.name || 'Unknown'} (${batch.client?.code || 'N/A'})`);
      console.log(`  Status: ${batch.status}`);
      console.log(`  Date: ${batch.createdAt.toISOString()}`);
      console.log(`  Errors: ${batch.errors?.slice(0, 150) || 'None'}`);
    }

    console.log('\n' + '-'.repeat(60));

    // Delete them
    const deleted = await prisma.importBatch.deleteMany({
      where: {
        status: { in: ['failed', 'rolled_back'] },
      },
    });

    console.log(`\n DELETED ${deleted.count} failed import batches`);

    // Summary for changelog
    console.log('\n' + '='.repeat(60));
    console.log('CHANGELOG SUMMARY:');
    console.log('='.repeat(60));
    console.log(`- Deleted ${deleted.count} failed import batches`);
    console.log(`- Root causes: missing quantity_packs column, file format issues, Python import errors`);
    console.log(`- Date range: ${failedImports[failedImports.length - 1]?.createdAt.toISOString().split('T')[0]} to ${failedImports[0]?.createdAt.toISOString().split('T')[0]}`);
    console.log('='.repeat(60));
  } catch (error) {
    console.error('Error deleting failed imports:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run if executed directly
deleteFailedImports()
  .then(() => {
    console.log('\nScript completed successfully.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nScript failed:', error);
    process.exit(1);
  });
