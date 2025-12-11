import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { subDays, subMonths, addDays } from 'date-fns';

const prisma = new PrismaClient();

// =============================================================================
// SEED DATA FOR INVENTORY INTELLIGENCE PLATFORM
// =============================================================================

async function main() {
  console.log('🌱 Starting database seed...\n');

  // Clean existing data
  console.log('🧹 Cleaning existing data...');
  await prisma.transaction.deleteMany();
  await prisma.stockHistory.deleteMany();
  await prisma.usageMetric.deleteMany();
  await prisma.alert.deleteMany();
  await prisma.orderRequest.deleteMany();
  await prisma.portalUser.deleteMany();
  await prisma.product.deleteMany();
  await prisma.importBatch.deleteMany();
  await prisma.userClient.deleteMany();
  await prisma.client.deleteMany();
  await prisma.user.deleteMany();

  // =============================================================================
  // USERS
  // =============================================================================
  console.log('👤 Creating users...');

  const passwordHash = await bcrypt.hash('demo1234', 12);

  const adminUser = await prisma.user.create({
    data: {
      email: 'admin@inventoryiq.com',
      passwordHash,
      name: 'Admin User',
      role: 'admin',
    },
  });

  const sarahUser = await prisma.user.create({
    data: {
      email: 'sarah.chen@inventoryiq.com',
      passwordHash,
      name: 'Sarah Chen',
      role: 'account_manager',
    },
  });

  const mikeUser = await prisma.user.create({
    data: {
      email: 'mike.torres@inventoryiq.com',
      passwordHash,
      name: 'Mike Torres',
      role: 'operations_manager',
    },
  });

  console.log(`  ✓ Created ${3} users`);

  // =============================================================================
  // CLIENTS
  // =============================================================================
  console.log('🏢 Creating clients...');

  const clients = await Promise.all([
    prisma.client.create({
      data: {
        name: 'Acme Corporation',
        code: 'ACME',
        settings: {
          reorderLeadDays: 14,
          safetyStockWeeks: 2,
          serviceLevelTarget: 0.95,
        },
      },
    }),
    prisma.client.create({
      data: {
        name: 'TechStart Inc',
        code: 'TECH',
        settings: {
          reorderLeadDays: 10,
          safetyStockWeeks: 3,
          serviceLevelTarget: 0.98,
        },
      },
    }),
    prisma.client.create({
      data: {
        name: 'GlobalMed Supplies',
        code: 'GMED',
        settings: {
          reorderLeadDays: 21,
          safetyStockWeeks: 4,
          serviceLevelTarget: 0.99,
        },
      },
    }),
    prisma.client.create({
      data: {
        name: 'EcoFriendly Products',
        code: 'ECOF',
        settings: {
          reorderLeadDays: 7,
          safetyStockWeeks: 2,
          serviceLevelTarget: 0.90,
        },
      },
    }),
  ]);

  console.log(`  ✓ Created ${clients.length} clients`);

  // =============================================================================
  // USER-CLIENT ASSIGNMENTS
  // =============================================================================
  console.log('🔗 Assigning users to clients...');

  await prisma.userClient.createMany({
    data: [
      { userId: sarahUser.id, clientId: clients[0].id, role: 'manager' },
      { userId: sarahUser.id, clientId: clients[1].id, role: 'manager' },
      { userId: sarahUser.id, clientId: clients[2].id, role: 'manager' },
      { userId: mikeUser.id, clientId: clients[0].id, role: 'viewer' },
      { userId: mikeUser.id, clientId: clients[1].id, role: 'viewer' },
      { userId: mikeUser.id, clientId: clients[2].id, role: 'viewer' },
      { userId: mikeUser.id, clientId: clients[3].id, role: 'manager' },
      { userId: adminUser.id, clientId: clients[0].id, role: 'admin' },
      { userId: adminUser.id, clientId: clients[1].id, role: 'admin' },
      { userId: adminUser.id, clientId: clients[2].id, role: 'admin' },
      { userId: adminUser.id, clientId: clients[3].id, role: 'admin' },
    ],
  });

  console.log('  ✓ User-client assignments created');

  // =============================================================================
  // PRODUCTS
  // =============================================================================
  console.log('📦 Creating products...');

  const productTemplates = [
    // Acme products
    { clientIdx: 0, productId: 'ACME-001', name: 'Business Cards - Standard', packSize: 500, itemType: 'evergreen', stock: 150, avgDaily: 25 },
    { clientIdx: 0, productId: 'ACME-002', name: 'Letterhead Paper', packSize: 100, itemType: 'evergreen', stock: 80, avgDaily: 8 },
    { clientIdx: 0, productId: 'ACME-003', name: 'Presentation Folders', packSize: 50, itemType: 'evergreen', stock: 25, avgDaily: 5 },
    { clientIdx: 0, productId: 'ACME-004', name: 'Envelopes #10', packSize: 500, itemType: 'evergreen', stock: 200, avgDaily: 40 },
    { clientIdx: 0, productId: 'ACME-005', name: 'Brochures - Tri-fold', packSize: 100, itemType: 'evergreen', stock: 5, avgDaily: 12 }, // LOW STOCK
    { clientIdx: 0, productId: 'ACME-006', name: 'Notepads - Custom', packSize: 50, itemType: 'evergreen', stock: 0, avgDaily: 3 }, // STOCKOUT
    { clientIdx: 0, productId: 'ACME-007', name: 'Annual Report 2024', packSize: 25, itemType: 'event', stock: 100, avgDaily: 0 },

    // TechStart products
    { clientIdx: 1, productId: 'TECH-001', name: 'Product Manual v3.0', packSize: 50, itemType: 'evergreen', stock: 45, avgDaily: 6 },
    { clientIdx: 1, productId: 'TECH-002', name: 'Quick Start Guides', packSize: 100, itemType: 'evergreen', stock: 120, avgDaily: 15 },
    { clientIdx: 1, productId: 'TECH-003', name: 'Safety Data Sheets', packSize: 25, itemType: 'evergreen', stock: 10, avgDaily: 4 }, // LOW STOCK
    { clientIdx: 1, productId: 'TECH-004', name: 'Warranty Cards', packSize: 500, itemType: 'evergreen', stock: 300, avgDaily: 50 },
    { clientIdx: 1, productId: 'TECH-005', name: 'Packaging Inserts', packSize: 1000, itemType: 'evergreen', stock: 500, avgDaily: 80 },

    // GlobalMed products
    { clientIdx: 2, productId: 'GMED-001', name: 'Patient Information Sheets', packSize: 100, itemType: 'evergreen', stock: 200, avgDaily: 30 },
    { clientIdx: 2, productId: 'GMED-002', name: 'Prescription Pads', packSize: 50, itemType: 'evergreen', stock: 75, avgDaily: 10 },
    { clientIdx: 2, productId: 'GMED-003', name: 'Appointment Cards', packSize: 500, itemType: 'evergreen', stock: 400, avgDaily: 60 },
    { clientIdx: 2, productId: 'GMED-004', name: 'Medical Labels - Hazard', packSize: 200, itemType: 'evergreen', stock: 3, avgDaily: 8 }, // CRITICAL
    { clientIdx: 2, productId: 'GMED-005', name: 'Compliance Posters', packSize: 10, itemType: 'evergreen', stock: 50, avgDaily: 1 },

    // EcoFriendly products
    { clientIdx: 3, productId: 'ECOF-001', name: 'Recycled Bags - Small', packSize: 100, itemType: 'evergreen', stock: 80, avgDaily: 12 },
    { clientIdx: 3, productId: 'ECOF-002', name: 'Recycled Bags - Large', packSize: 50, itemType: 'evergreen', stock: 40, avgDaily: 6 },
    { clientIdx: 3, productId: 'ECOF-003', name: 'Eco Labels', packSize: 500, itemType: 'evergreen', stock: 250, avgDaily: 35 },
    { clientIdx: 3, productId: 'ECOF-004', name: 'Bamboo Utensil Sets', packSize: 25, itemType: 'evergreen', stock: 15, avgDaily: 4 },
  ];

  const products: any[] = [];

  for (const template of productTemplates) {
    const reorderPoint = Math.ceil(template.avgDaily * 14 * 1.2); // 2 weeks + 20% safety
    const weeksRemaining = template.avgDaily > 0
      ? Math.floor((template.stock * template.packSize) / (template.avgDaily * 7))
      : 999;

    let stockStatus = 'healthy';
    if (template.stock === 0) stockStatus = 'stockout';
    else if (weeksRemaining <= 1) stockStatus = 'critical';
    else if (weeksRemaining <= 2) stockStatus = 'low';
    else if (weeksRemaining <= 4) stockStatus = 'watch';

    const product = await prisma.product.create({
      data: {
        clientId: clients[template.clientIdx].id,
        productId: template.productId,
        name: template.name,
        packSize: template.packSize,
        itemType: template.itemType,
        currentStockPacks: template.stock,
        currentStockUnits: template.stock * template.packSize,
        reorderPointPacks: reorderPoint,
        avgDailyUsage: template.avgDaily,
        stockStatus,
        weeksRemaining,
        calculationBasis: '3mo_average',
      },
    });

    products.push({ ...product, template });
  }

  console.log(`  ✓ Created ${products.length} products`);

  // =============================================================================
  // TRANSACTIONS (Historical Orders)
  // =============================================================================
  console.log('📊 Creating transaction history...');

  let transactionCount = 0;
  const now = new Date();

  for (const product of products) {
    if (product.template.avgDaily === 0) continue;

    // Generate 12 months of transaction history
    for (let monthsAgo = 12; monthsAgo >= 0; monthsAgo--) {
      const baseDate = subMonths(now, monthsAgo);
      const ordersThisMonth = Math.floor(Math.random() * 4) + 2; // 2-5 orders per month

      for (let i = 0; i < ordersThisMonth; i++) {
        const dayOffset = Math.floor(Math.random() * 28);
        const orderDate = addDays(baseDate, dayOffset);

        // Seasonal variation (higher in Q4)
        const seasonalMultiplier = orderDate.getMonth() >= 9 ? 1.3 : 1.0;
        const baseQty = Math.floor(product.template.avgDaily * 7 * seasonalMultiplier);
        const quantity = Math.max(1, baseQty + Math.floor(Math.random() * baseQty * 0.4) - Math.floor(baseQty * 0.2));

        await prisma.transaction.create({
          data: {
            productId: product.id,
            orderId: `ORD-${product.template.productId}-${monthsAgo}-${i}`,
            quantityPacks: Math.ceil(quantity / product.template.packSize),
            quantityUnits: quantity,
            dateSubmitted: orderDate,
            orderStatus: 'completed',
            shipToLocation: ['HQ', 'Branch A', 'Branch B', 'Warehouse'][Math.floor(Math.random() * 4)],
          },
        });
        transactionCount++;
      }
    }
  }

  console.log(`  ✓ Created ${transactionCount} transactions`);

  // =============================================================================
  // STOCK HISTORY
  // =============================================================================
  console.log('📈 Creating stock history...');

  let stockHistoryCount = 0;

  for (const product of products) {
    // Create weekly stock snapshots for past 3 months
    for (let weeksAgo = 12; weeksAgo >= 0; weeksAgo--) {
      const recordDate = subDays(now, weeksAgo * 7);
      const stockVariation = Math.floor(Math.random() * 20) - 10;
      const historicalStock = Math.max(0, product.template.stock + stockVariation + weeksAgo * 2);

      await prisma.stockHistory.create({
        data: {
          productId: product.id,
          recordedAt: recordDate,
          packsAvailable: historicalStock,
          totalUnits: historicalStock * product.template.packSize,
          source: 'import',
        },
      });
      stockHistoryCount++;
    }
  }

  console.log(`  ✓ Created ${stockHistoryCount} stock history records`);

  // =============================================================================
  // ALERTS
  // =============================================================================
  console.log('🚨 Creating alerts...');

  const alertsData = [
    { clientIdx: 0, productId: 'ACME-005', type: 'low_stock', severity: 'warning', title: 'Low stock alert: Brochures - Tri-fold' },
    { clientIdx: 0, productId: 'ACME-006', type: 'stockout', severity: 'critical', title: 'STOCKOUT: Notepads - Custom' },
    { clientIdx: 1, productId: 'TECH-003', type: 'low_stock', severity: 'warning', title: 'Low stock alert: Safety Data Sheets' },
    { clientIdx: 2, productId: 'GMED-004', type: 'critical_stock', severity: 'critical', title: 'CRITICAL: Medical Labels - Hazard running out' },
  ];

  for (const alert of alertsData) {
    const product = products.find(p => p.productId === alert.productId);
    await prisma.alert.create({
      data: {
        clientId: clients[alert.clientIdx].id,
        productId: product?.id,
        alertType: alert.type,
        severity: alert.severity,
        status: 'active',
        title: alert.title,
        message: `Stock level requires immediate attention.`,
      },
    });
  }

  console.log(`  ✓ Created ${alertsData.length} alerts`);

  // =============================================================================
  // PORTAL USERS
  // =============================================================================
  console.log('🌐 Creating portal users...');

  const portalPasswordHash = await bcrypt.hash('client1234', 12);

  const portalUsers = await Promise.all([
    prisma.portalUser.create({
      data: {
        clientId: clients[0].id,
        email: 'john.doe@acmecorp.com',
        passwordHash: portalPasswordHash,
        name: 'John Doe',
        role: 'admin',
      },
    }),
    prisma.portalUser.create({
      data: {
        clientId: clients[0].id,
        email: 'jane.smith@acmecorp.com',
        passwordHash: portalPasswordHash,
        name: 'Jane Smith',
        role: 'requester',
      },
    }),
    prisma.portalUser.create({
      data: {
        clientId: clients[1].id,
        email: 'bob.wilson@techstart.io',
        passwordHash: portalPasswordHash,
        name: 'Bob Wilson',
        role: 'admin',
      },
    }),
  ]);

  console.log(`  ✓ Created ${portalUsers.length} portal users`);

  // =============================================================================
  // ORDER REQUESTS
  // =============================================================================
  console.log('🛒 Creating sample order requests...');

  const acmeProducts = products.filter(p => p.clientId === clients[0].id);

  await prisma.orderRequest.create({
    data: {
      clientId: clients[0].id,
      requestedById: portalUsers[0].id,
      status: 'pending',
      items: [
        { productId: acmeProducts[0].id, quantity: 50 },
        { productId: acmeProducts[1].id, quantity: 25 },
      ],
      notes: 'Quarterly restock for office supplies',
    },
  });

  await prisma.orderRequest.create({
    data: {
      clientId: clients[0].id,
      requestedById: portalUsers[1].id,
      status: 'approved',
      items: [
        { productId: acmeProducts[4].id, quantity: 100 },
      ],
      notes: 'Urgent - running low on brochures',
      reviewedById: portalUsers[0].id,
      reviewedAt: subDays(now, 2),
    },
  });

  console.log('  ✓ Created sample order requests');

  // =============================================================================
  // SUMMARY
  // =============================================================================
  console.log('\n✅ Seed completed successfully!\n');
  console.log('📋 Summary:');
  console.log('  • Users: 3 (admin, account_manager, operations_manager)');
  console.log('  • Clients: 4');
  console.log(`  • Products: ${products.length}`);
  console.log(`  • Transactions: ${transactionCount}`);
  console.log(`  • Stock History: ${stockHistoryCount}`);
  console.log(`  • Alerts: ${alertsData.length}`);
  console.log(`  • Portal Users: ${portalUsers.length}`);
  console.log('\n🔑 Login credentials:');
  console.log('  Admin Dashboard:');
  console.log('    • sarah.chen@inventoryiq.com / demo1234');
  console.log('    • mike.torres@inventoryiq.com / demo1234');
  console.log('    • admin@inventoryiq.com / demo1234');
  console.log('  Client Portal:');
  console.log('    • john.doe@acmecorp.com / client1234');
  console.log('    • bob.wilson@techstart.io / client1234');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
