/**
 * Check transaction linkage to products/clients
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Get all transactions grouped by client
  const txnsByClient = await prisma.$queryRaw<Array<{
    client_code: string;
    client_name: string;
    txn_count: bigint;
  }>>`
    SELECT
      c.code as client_code,
      c.name as client_name,
      COUNT(t.id) as txn_count
    FROM transactions t
    JOIN products p ON t.product_id = p.id
    JOIN clients c ON p.client_id = c.id
    GROUP BY c.code, c.name
    ORDER BY txn_count DESC
  `;

  console.log("Transactions by client:");
  txnsByClient.forEach((row) => {
    console.log(`  ${row.client_code} (${row.client_name}): ${Number(row.txn_count)}`);
  });

  // Check total transactions
  const total = await prisma.transaction.count();
  console.log(`\nTotal transactions: ${total}`);

  // Check for orphan transactions (product doesn't exist)
  const orphans = await prisma.$queryRaw<Array<{ cnt: bigint }>>`
    SELECT COUNT(*) as cnt
    FROM transactions t
    LEFT JOIN products p ON t.product_id = p.id
    WHERE p.id IS NULL
  `;
  console.log(`Orphan transactions (no matching product): ${Number(orphans[0]?.cnt || 0)}`);

  // Check import batches for EVE
  const eveImports = await prisma.importBatch.findMany({
    where: {
      client: { code: "EVE" },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      importType: true,
      filename: true,
      status: true,
      rowCount: true,
      processedCount: true,
      createdAt: true,
    },
  });

  console.log("\nRecent Everstory imports:");
  eveImports.forEach((batch) => {
    console.log(`  ${batch.id.slice(0, 8)} | ${batch.importType} | ${batch.status} | ${batch.rowCount} rows | ${batch.filename}`);
  });

  // Check if there are products marked as orphans for EVE
  const eveOrphans = await prisma.product.count({
    where: {
      client: { code: "EVE" },
      isOrphan: true,
    },
  });
  console.log(`\nEverstory orphan products: ${eveOrphans}`);

  await prisma.$disconnect();
}

main();
