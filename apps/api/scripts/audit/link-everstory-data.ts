/**
 * Link Everstory data between old (EVERS) and new (EVE) clients
 *
 * Problem: EVE has products but no transactions. EVERS has transactions.
 * Solution: Link EVERS transactions to EVE products by matching product_id.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Get both clients
  const eveNew = await prisma.client.findFirst({ where: { code: "EVE" } });
  const eveOld = await prisma.client.findFirst({ where: { code: "EVERS" } });

  console.log("New EVE client:", eveNew?.id, eveNew?.name);
  console.log("Old EVERS client:", eveOld?.id, eveOld?.name);

  if (!eveNew || !eveOld) {
    console.log("Missing client!");
    return;
  }

  // Get products from both clients
  const eveNewProducts = await prisma.product.findMany({
    where: { clientId: eveNew.id },
    select: { id: true, productId: true },
  });
  console.log(`\nEVE new products: ${eveNewProducts.length}`);

  const eveOldProducts = await prisma.product.findMany({
    where: { clientId: eveOld.id },
    select: { id: true, productId: true },
  });
  console.log(`EVERS old products: ${eveOldProducts.length}`);

  // Build lookup maps
  const newProductMap = new Map(eveNewProducts.map((p) => [p.productId, p.id]));
  const oldProductMap = new Map(eveOldProducts.map((p) => [p.productId, p.id]));

  // Find matching product IDs
  const matchingProductIds = new Set<string>();
  for (const [productId] of newProductMap) {
    if (oldProductMap.has(productId)) {
      matchingProductIds.add(productId);
    }
  }
  console.log(`Matching product IDs: ${matchingProductIds.size}`);

  // Check transactions on old products
  const oldTxns = await prisma.transaction.count({
    where: { product: { clientId: eveOld.id } },
  });
  console.log(`Transactions on EVERS products: ${oldTxns}`);

  // Check how many transactions could be migrated
  const migratableCount = await prisma.$queryRaw<Array<{ cnt: bigint }>>`
    SELECT COUNT(*) as cnt
    FROM transactions t
    JOIN products old_p ON t.product_id = old_p.id
    JOIN products new_p ON old_p.product_id = new_p.product_id
    WHERE old_p.client_id = ${eveOld.id}::uuid
    AND new_p.client_id = ${eveNew.id}::uuid
  `;
  console.log(
    `Transactions that CAN be migrated (matching product_id): ${Number(migratableCount[0]?.cnt || 0)}`
  );

  // Ask for confirmation before migrating
  console.log("\n--- MIGRATION PREVIEW ---");
  console.log(`Will update ${migratableCount[0]?.cnt} transactions:`);
  console.log(`  FROM: products in EVERS (${eveOld.id})`);
  console.log(`  TO: products in EVE (${eveNew.id})`);

  // Actually perform migration
  console.log("\nPerforming migration...");

  const result = await prisma.$executeRaw`
    UPDATE transactions t
    SET product_id = new_p.id
    FROM products old_p, products new_p
    WHERE t.product_id = old_p.id
    AND old_p.product_id = new_p.product_id
    AND old_p.client_id = ${eveOld.id}::uuid
    AND new_p.client_id = ${eveNew.id}::uuid
  `;

  console.log(`✅ Migrated ${result} transactions to EVE client`);

  // Verify
  const newTxns = await prisma.transaction.count({
    where: { product: { clientId: eveNew.id } },
  });
  console.log(`\nEVE transactions after migration: ${newTxns}`);

  await prisma.$disconnect();
}

main();
