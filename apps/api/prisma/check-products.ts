/**
 * Check products in database
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkProducts() {
  // Count total products
  const totalProducts = await prisma.product.count();
  console.log(`\n📊 Total products in database: ${totalProducts}`);

  if (totalProducts === 0) {
    console.log("⚠️  No products found in database. Import may not have run yet.");
    return;
  }

  // Count by client
  const productsByClient = await prisma.product.groupBy({
    by: ['clientId'],
    _count: true,
  });

  console.log(`\n📊 Products by client:`);
  for (const group of productsByClient) {
    const client = await prisma.client.findUnique({
      where: { id: group.clientId },
      select: { code: true, name: true },
    });
    console.log(`  ${client?.code || 'UNKNOWN'}: ${group._count} products`);
  }

  // Count by itemType (including case variations)
  const allProducts = await prisma.product.findMany({
    select: { itemType: true },
  });

  const itemTypeCounts: Record<string, number> = {};
  allProducts.forEach(p => {
    const type = p.itemType || 'null';
    itemTypeCounts[type] = (itemTypeCounts[type] || 0) + 1;
  });

  console.log(`\n📊 Products by itemType (showing actual case):`);
  Object.entries(itemTypeCounts).forEach(([type, count]) => {
    console.log(`  "${type}": ${count}`);
  });
}

async function main() {
  try {
    await checkProducts();
  } catch (error) {
    console.error("❌ Check failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
