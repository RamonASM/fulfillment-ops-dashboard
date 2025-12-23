/**
 * Quick check of Everstory data to debug usage calculation issue
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const client = await prisma.client.findFirst({ where: { code: "EVE" } });
  console.log("EVE client:", client?.id);

  if (!client) {
    console.log("Client not found!");
    return;
  }

  const prods = await prisma.product.count({
    where: { clientId: client.id, isActive: true },
  });
  console.log("EVE products:", prods);

  // Count transactions for EVE products using raw SQL
  const txns = await prisma.$queryRaw<Array<{ cnt: bigint }>>`
    SELECT COUNT(*) as cnt
    FROM transactions t
    JOIN products p ON t.product_id = p.id
    WHERE p.client_id = ${client.id}::uuid
  `;
  console.log("EVE transactions:", Number(txns[0]?.cnt || 0));

  const recent = await prisma.$queryRaw<Array<{ cnt: bigint }>>`
    SELECT COUNT(*) as cnt
    FROM transactions t
    JOIN products p ON t.product_id = p.id
    WHERE p.client_id = ${client.id}::uuid
    AND t.date_submitted >= NOW() - INTERVAL '12 months'
  `;
  console.log("EVE recent (12mo):", Number(recent[0]?.cnt || 0));

  // Get date range
  const dates = await prisma.$queryRaw<Array<{ min_date: Date; max_date: Date }>>`
    SELECT MIN(t.date_submitted) as min_date, MAX(t.date_submitted) as max_date
    FROM transactions t
    JOIN products p ON t.product_id = p.id
    WHERE p.client_id = ${client.id}::uuid
  `;
  console.log("Oldest EVE txn:", dates[0]?.min_date);
  console.log("Newest EVE txn:", dates[0]?.max_date);

  // Check status distribution for EVE
  const statuses = await prisma.$queryRaw<Array<{ order_status: string; cnt: bigint }>>`
    SELECT t.order_status, COUNT(*) as cnt
    FROM transactions t
    JOIN products p ON t.product_id = p.id
    WHERE p.client_id = ${client.id}::uuid
    GROUP BY t.order_status
  `;
  console.log("EVE transaction statuses:");
  statuses.forEach((s) => console.log(`  ${s.order_status}: ${Number(s.cnt)}`));

  await prisma.$disconnect();
}

main();
