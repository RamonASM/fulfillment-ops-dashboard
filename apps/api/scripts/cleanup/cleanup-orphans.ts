/**
 * Orphan Product Cleanup Script
 *
 * This script handles orphan products (isOrphan: true):
 * 1. Deletes orphans with NO transactions (empty, no data loss)
 * 2. Marks remaining orphans as inactive (preserves transaction history)
 *
 * Run with: npx tsx apps/api/scripts/cleanup/cleanup-orphans.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanupOrphans(): Promise<void> {
  console.log('='.repeat(60));
  console.log('ORPHAN PRODUCT CLEANUP');
  console.log('='.repeat(60));
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  try {
    // Count total orphans
    const totalOrphans = await prisma.product.count({
      where: { isOrphan: true },
    });

    console.log(`Total orphan products: ${totalOrphans}\n`);

    if (totalOrphans === 0) {
      console.log('No orphan products found. Database is clean.');
      return;
    }

    // Find orphans with NO transactions (safe to delete)
    const orphansWithoutTransactions = await prisma.product.findMany({
      where: {
        isOrphan: true,
        transactions: { none: {} },
      },
      select: {
        id: true,
        sku: true,
        name: true,
        clientId: true,
        client: {
          select: {
            name: true,
            code: true,
          },
        },
      },
    });

    console.log(`Orphans with NO transactions (safe to delete): ${orphansWithoutTransactions.length}`);

    // Find orphans WITH transactions (need to preserve)
    const orphansWithTransactions = await prisma.product.findMany({
      where: {
        isOrphan: true,
        transactions: { some: {} },
      },
      select: {
        id: true,
        sku: true,
        name: true,
        clientId: true,
        client: {
          select: {
            name: true,
            code: true,
          },
        },
        _count: {
          select: { transactions: true },
        },
      },
    });

    console.log(`Orphans WITH transactions (will mark inactive): ${orphansWithTransactions.length}\n`);

    // Step 1: Delete orphans with no transactions
    if (orphansWithoutTransactions.length > 0) {
      console.log('-'.repeat(60));
      console.log('DELETING EMPTY ORPHANS:');
      console.log('-'.repeat(60));

      for (const product of orphansWithoutTransactions.slice(0, 10)) {
        console.log(`  - ${product.sku} (${product.name?.slice(0, 30) || 'No name'})`);
        console.log(`    Client: ${product.client?.name || 'Unknown'}`);
      }

      if (orphansWithoutTransactions.length > 10) {
        console.log(`  ... and ${orphansWithoutTransactions.length - 10} more`);
      }

      const deleteResult = await prisma.product.deleteMany({
        where: {
          id: { in: orphansWithoutTransactions.map((p) => p.id) },
        },
      });

      console.log(`\n  Deleted ${deleteResult.count} empty orphans`);
    }

    // Step 2: Mark orphans with transactions as inactive
    if (orphansWithTransactions.length > 0) {
      console.log('\n' + '-'.repeat(60));
      console.log('MARKING ORPHANS WITH TRANSACTIONS AS INACTIVE:');
      console.log('-'.repeat(60));

      for (const product of orphansWithTransactions.slice(0, 10)) {
        console.log(`  - ${product.sku} (${product._count.transactions} transactions)`);
        console.log(`    Client: ${product.client?.name || 'Unknown'}`);
      }

      if (orphansWithTransactions.length > 10) {
        console.log(`  ... and ${orphansWithTransactions.length - 10} more`);
      }

      const updateResult = await prisma.product.updateMany({
        where: {
          id: { in: orphansWithTransactions.map((p) => p.id) },
        },
        data: {
          isActive: false,
        },
      });

      console.log(`\n  Marked ${updateResult.count} orphans as inactive (transaction history preserved)`);
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('CHANGELOG SUMMARY:');
    console.log('='.repeat(60));
    console.log(`- Total orphans processed: ${totalOrphans}`);
    console.log(`- Deleted (no transactions): ${orphansWithoutTransactions.length}`);
    console.log(`- Marked inactive (with transactions): ${orphansWithTransactions.length}`);
    console.log('='.repeat(60));
  } catch (error) {
    console.error('Error during orphan cleanup:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run if executed directly
cleanupOrphans()
  .then(() => {
    console.log('\nScript completed successfully.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nScript failed:', error);
    process.exit(1);
  });
