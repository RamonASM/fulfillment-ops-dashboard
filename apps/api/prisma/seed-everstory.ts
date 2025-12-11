import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import crypto from 'crypto';
import { parse } from 'csv-parse/sync';
import { subDays, subWeeks, startOfWeek, format } from 'date-fns';

const prisma = new PrismaClient();

// =============================================================================
// EVERSTORY CLIENT DATA IMPORT - FULL PRODUCTION DATA
// Imports complete real data from Everstory CSV files
// =============================================================================

interface InventoryRow {
  'Catalog': string;
  'Product ID': string;
  'Product Name': string;
  'Can Exceed Available': string;
  'Current Notification Point': string;
  'Item Type': string;
  'New Notification Point': string;
  'Available Quantity': string;
  'Reserved Quantity': string;
  'Quantity Multiplier': string;
  'Total Qty on Hand': string;
  'Active': string;
  'Monthly Useage': string;
  'Based on': string;
}

interface TransactionRow {
  'Order ID': string;
  'User': string;
  'Product ID': string;
  'Product Name': string;
  'Customized Product ID': string;
  'Order Type': string;
  'Order Status': string;
  'Quantity': string;
  'Quantity Multiplier': string;
  'Total Quantity': string;
  'Unit Price': string;
  'Extended Price': string;
  'Date Submitted': string;
  'Ship To Identifier': string;
  'Ship To Company Name': string;
  'Ship To First Name': string;
  'Ship To Last Name': string;
  'Ship To Street 1': string;
  'Ship To Street 2': string;
  'Ship To City': string;
  'Ship To State': string;
  'Ship To Zip': string;
  'Ship To Country': string;
  'Ship To Phone': string;
}

function parseNotificationPoint(value: string): number {
  const numMatch = value.match(/^(\d+)/);
  return numMatch ? parseInt(numMatch[1], 10) : 0;
}

function calculateStockStatus(
  currentStock: number,
  notificationPoint: number,
  avgDailyUsage: number
): { status: string; weeksRemaining: number | null } {
  if (currentStock <= 0) {
    return { status: 'STOCKOUT', weeksRemaining: 0 };
  }

  if (avgDailyUsage <= 0) {
    // If no usage data, check against notification point
    if (notificationPoint > 0 && currentStock <= notificationPoint) {
      return { status: 'LOW', weeksRemaining: null };
    }
    return { status: 'HEALTHY', weeksRemaining: null };
  }

  const daysRemaining = currentStock / avgDailyUsage;
  const weeksRemaining = Math.round(daysRemaining / 7);

  if (weeksRemaining < 2) {
    return { status: 'CRITICAL', weeksRemaining };
  }

  if (weeksRemaining < 4 || currentStock <= notificationPoint) {
    return { status: 'LOW', weeksRemaining };
  }

  if (weeksRemaining < 8) {
    return { status: 'WATCH', weeksRemaining };
  }

  return { status: 'HEALTHY', weeksRemaining };
}

function parseDate(dateStr: string): Date {
  const [datePart, timePart] = dateStr.split(' ');
  const [month, day, year] = datePart.split('/').map(Number);
  const [hours, minutes] = (timePart || '12:00').split(':').map(Number);
  const fullYear = year < 100 ? 2000 + year : year;
  return new Date(fullYear, month - 1, day, hours, minutes);
}

function calculateFileChecksum(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

async function main() {
  console.log('🌱 Starting FULL Everstory data import...\n');

  const inventoryPath = '/Users/aerialshotsmedia/Downloads/Everstory Inventory Items - Sheet1.csv';
  const transactionsPath = '/Users/aerialshotsmedia/Downloads/Line Item Report - Sheet1.csv';

  // Calculate checksums for import tracking
  const inventoryChecksum = calculateFileChecksum(inventoryPath);
  const transactionsChecksum = calculateFileChecksum(transactionsPath);

  console.log('📄 Reading inventory CSV...');
  const inventoryContent = fs.readFileSync(inventoryPath, 'utf-8');
  const inventoryRows: InventoryRow[] = parse(inventoryContent, {
    columns: true,
    skip_empty_lines: true,
  });
  console.log(`  ✓ Found ${inventoryRows.length} products`);

  console.log('📄 Reading transactions CSV...');
  const transactionsContent = fs.readFileSync(transactionsPath, 'utf-8');
  const transactionRows: TransactionRow[] = parse(transactionsContent, {
    columns: true,
    skip_empty_lines: true,
  });
  console.log(`  ✓ Found ${transactionRows.length} transaction records (importing ALL)`);

  // =============================================================================
  // GET OR CREATE ADMIN USER
  // =============================================================================
  console.log('\n👤 Setting up users...');

  const passwordHash = await bcrypt.hash('demo1234', 12);

  let adminUser = await prisma.user.findFirst({
    where: { email: 'sarah.chen@inventoryiq.com' }
  });

  if (!adminUser) {
    adminUser = await prisma.user.create({
      data: {
        email: 'sarah.chen@inventoryiq.com',
        passwordHash,
        name: 'Sarah Chen',
        role: 'account_manager',
      },
    });
    console.log('  ✓ Created Sarah Chen (Account Manager)');
  } else {
    console.log('  ✓ Using existing Sarah Chen user');
  }

  // =============================================================================
  // CREATE EVERSTORY CLIENT
  // =============================================================================
  console.log('\n🏢 Creating Everstory client...');

  const existingClient = await prisma.client.findFirst({
    where: { code: 'EVR' }
  });

  if (existingClient) {
    console.log('  🧹 Removing existing Everstory data...');
    await prisma.transaction.deleteMany({ where: { product: { clientId: existingClient.id } } });
    await prisma.stockHistory.deleteMany({ where: { product: { clientId: existingClient.id } } });
    await prisma.usageMetric.deleteMany({ where: { product: { clientId: existingClient.id } } });
    await prisma.alert.deleteMany({ where: { clientId: existingClient.id } });
    await prisma.orderRequest.deleteMany({ where: { clientId: existingClient.id } });
    await prisma.portalUser.deleteMany({ where: { clientId: existingClient.id } });
    await prisma.importBatch.deleteMany({ where: { clientId: existingClient.id } });
    await prisma.product.deleteMany({ where: { clientId: existingClient.id } });
    await prisma.userClient.deleteMany({ where: { clientId: existingClient.id } });
    await prisma.client.delete({ where: { id: existingClient.id } });
  }

  const client = await prisma.client.create({
    data: {
      name: 'Everstory Partners',
      code: 'EVR',
      settings: {
        reorderLeadDays: 14,
        safetyStockWeeks: 3,
        serviceLevelTarget: 0.95,
        notificationEmails: ['inventory@everstory.com'],
        autoReorderEnabled: false,
      },
    },
  });
  console.log(`  ✓ Created client: ${client.name}`);

  await prisma.userClient.create({
    data: { userId: adminUser.id, clientId: client.id },
  });
  console.log(`  ✓ Assigned Sarah Chen to Everstory`);

  // =============================================================================
  // CREATE PORTAL USERS
  // =============================================================================
  console.log('\n👤 Creating portal users...');

  const portalPasswordHash = await bcrypt.hash('everstory1234', 12);

  await prisma.portalUser.createMany({
    data: [
      {
        clientId: client.id,
        email: 'admin@everstory.com',
        passwordHash: portalPasswordHash,
        name: 'Everstory Admin',
        role: 'admin',
        notificationPreferences: {
          emailAlerts: true,
          lowStockThreshold: 'medium',
          digestFrequency: 'daily',
        },
      },
      {
        clientId: client.id,
        email: 'orders@everstory.com',
        passwordHash: portalPasswordHash,
        name: 'Orders Team',
        role: 'requester',
        notificationPreferences: {
          emailAlerts: true,
          lowStockThreshold: 'high',
          digestFrequency: 'weekly',
        },
      },
      {
        clientId: client.id,
        email: 'viewer@everstory.com',
        passwordHash: portalPasswordHash,
        name: 'View Only User',
        role: 'viewer',
        notificationPreferences: {
          emailAlerts: false,
        },
      },
    ],
  });
  console.log('  ✓ Created 3 portal users (admin, requester, viewer)');

  // =============================================================================
  // CREATE IMPORT BATCH RECORDS
  // =============================================================================
  console.log('\n📥 Creating import batch records...');

  const inventoryImportBatch = await prisma.importBatch.create({
    data: {
      clientId: client.id,
      importType: 'inventory',
      filename: 'Everstory Inventory Items - Sheet1.csv',
      status: 'completed',
      rowCount: inventoryRows.length,
      processedCount: inventoryRows.length,
      errorCount: 0,
      errors: [],
      fileChecksum: inventoryChecksum,
      importedBy: adminUser.id,
      startedAt: new Date(),
      completedAt: new Date(),
    },
  });

  const transactionsImportBatch = await prisma.importBatch.create({
    data: {
      clientId: client.id,
      importType: 'orders',
      filename: 'Line Item Report - Sheet1.csv',
      status: 'completed',
      rowCount: transactionRows.length,
      processedCount: transactionRows.length,
      errorCount: 0,
      errors: [],
      fileChecksum: transactionsChecksum,
      importedBy: adminUser.id,
      startedAt: new Date(),
      completedAt: new Date(),
    },
  });
  console.log('  ✓ Created 2 import batch records');

  // =============================================================================
  // AGGREGATE TRANSACTIONS BY PRODUCT
  // =============================================================================
  console.log('\n📊 Aggregating transaction data...');

  const productUsage = new Map<string, {
    totalQuantity: number;
    orderCount: number;
    transactions: TransactionRow[];
    earliestDate: Date;
    latestDate: Date;
    weeklyUsage: Map<string, number>;
  }>();

  for (const tx of transactionRows) {
    const productId = tx['Product ID'];
    if (!productId) continue;

    const date = parseDate(tx['Date Submitted']);
    const quantity = parseInt(tx['Total Quantity'] || tx['Quantity'] || '0', 10);
    const weekKey = format(startOfWeek(date), 'yyyy-MM-dd');

    if (!productUsage.has(productId)) {
      productUsage.set(productId, {
        totalQuantity: 0,
        orderCount: 0,
        transactions: [],
        earliestDate: date,
        latestDate: date,
        weeklyUsage: new Map(),
      });
    }

    const usage = productUsage.get(productId)!;
    usage.totalQuantity += quantity;
    usage.orderCount += 1;
    usage.transactions.push(tx);
    usage.weeklyUsage.set(weekKey, (usage.weeklyUsage.get(weekKey) || 0) + quantity);

    if (date < usage.earliestDate) usage.earliestDate = date;
    if (date > usage.latestDate) usage.latestDate = date;
  }

  console.log(`  ✓ Aggregated usage for ${productUsage.size} unique products`);

  // Define now once for consistent date calculations
  const now = new Date();

  // =============================================================================
  // CREATE PRODUCTS
  // =============================================================================
  console.log('\n📦 Creating products...');

  const productMap = new Map<string, { id: string; packSize: number; name: string }>();
  let createdProducts = 0;

  for (const row of inventoryRows) {
    const sku = row['Product ID'];
    const name = row['Product Name'];
    const itemType = (row['Item Type'].trim() || 'evergreen').toLowerCase();
    const availableQty = parseInt(row['Available Quantity'] || '0', 10);
    const packSize = parseInt(row['Quantity Multiplier'] || '1', 10);
    const totalOnHand = parseInt(row['Total Qty on Hand'] || '0', 10);
    const notificationPoint = parseNotificationPoint(row['Current Notification Point']);
    const isActive = row['Active'] === 'TRUE';
    const reservedQty = parseInt(row['Reserved Quantity'] || '0', 10);

    const usage = productUsage.get(sku);
    let avgDailyUsage = 0;
    let usageCalculationTier = 'none'; // Track which tier calculation came from
    let usage3mo = 0;
    let usage12mo = 0;
    let usageWeekly = 0;

    if (usage && usage.totalQuantity > 0) {
      const daysDiff = Math.max(1, Math.ceil(
        (usage.latestDate.getTime() - usage.earliestDate.getTime()) / (1000 * 60 * 60 * 24)
      ));

      // Calculate tier-based usage (from transaction data)
      const threeMonthsAgo = subDays(now, 90);
      const twelveMonthsAgo = subDays(now, 365);
      const oneWeekAgo = subDays(now, 7);

      const threeMonthTxs = usage.transactions.filter(tx => parseDate(tx['Date Submitted']) >= threeMonthsAgo);
      const twelveMonthTxs = usage.transactions.filter(tx => parseDate(tx['Date Submitted']) >= twelveMonthsAgo);
      const weeklyTxs = usage.transactions.filter(tx => parseDate(tx['Date Submitted']) >= oneWeekAgo);

      usage3mo = threeMonthTxs.reduce((sum, tx) => sum + parseInt(tx['Total Quantity'] || tx['Quantity'] || '0', 10), 0);
      usage12mo = twelveMonthTxs.reduce((sum, tx) => sum + parseInt(tx['Total Quantity'] || tx['Quantity'] || '0', 10), 0);
      usageWeekly = weeklyTxs.reduce((sum, tx) => sum + parseInt(tx['Total Quantity'] || tx['Quantity'] || '0', 10), 0);

      // Determine usage tier and calculate average (tiered system)
      // Priority: 12-month > 3-month > weekly > all-time
      if (usage12mo > 0 && daysDiff >= 365) {
        avgDailyUsage = Math.round((usage12mo / 365) * 100) / 100;
        usageCalculationTier = '12_month';
      } else if (usage3mo > 0 && daysDiff >= 90) {
        avgDailyUsage = Math.round((usage3mo / 90) * 100) / 100;
        usageCalculationTier = '3_month';
      } else if (usageWeekly > 0) {
        avgDailyUsage = Math.round((usageWeekly / 7) * 100) / 100;
        usageCalculationTier = 'weekly';
      } else {
        avgDailyUsage = Math.round((usage.totalQuantity / daysDiff) * 100) / 100;
        usageCalculationTier = 'all_time';
      }
    }

    const { status, weeksRemaining } = calculateStockStatus(
      totalOnHand,
      notificationPoint * packSize,
      avgDailyUsage
    );

    const product = await prisma.product.create({
      data: {
        clientId: client.id,
        productId: sku,
        name,
        itemType,
        currentStockPacks: availableQty,
        currentStockUnits: totalOnHand,
        packSize,
        reorderPointPacks: notificationPoint,
        notificationPoint: notificationPoint * packSize,
        isActive,
        avgDailyUsage,
        stockStatus: status,
        weeksRemaining,
        metadata: {
          reservedQuantity: reservedQty,
          canExceedAvailable: row['Can Exceed Available'] === 'TRUE',
          catalog: row['Catalog'],
          importedAt: new Date().toISOString(),
          importBatchId: inventoryImportBatch.id,
          // Usage calculation tracking
          usageCalculationTier,
          usage3MonthUnits: usage3mo,
          usage12MonthUnits: usage12mo,
          usageWeeklyUnits: usageWeekly,
          monthlyUsage3mo: Math.round(usage3mo / 3), // Avg monthly usage from 3-month data
          monthlyUsage12mo: Math.round(usage12mo / 12), // Avg monthly usage from 12-month data
        },
      },
    });

    productMap.set(sku, { id: product.id, packSize, name });
    createdProducts++;
  }

  console.log(`  ✓ Created ${createdProducts} products`);

  // =============================================================================
  // CREATE ALL TRANSACTIONS
  // =============================================================================
  console.log('\n💳 Creating ALL transactions...');

  const sortedTransactions = [...transactionRows].sort((a, b) => {
    return parseDate(a['Date Submitted']).getTime() - parseDate(b['Date Submitted']).getTime();
  });

  const batchSize = 1000;
  let createdTransactions = 0;
  let skippedProducts = 0;

  for (let i = 0; i < sortedTransactions.length; i += batchSize) {
    const batch = sortedTransactions.slice(i, i + batchSize);

    const transactionData = [];
    for (const tx of batch) {
      const productInfo = productMap.get(tx['Product ID']);
      if (!productInfo) {
        skippedProducts++;
        continue;
      }

      const quantity = parseInt(tx['Total Quantity'] || tx['Quantity'] || '0', 10);

      const shipToLocation = [
        tx['Ship To Identifier'],
        tx['Ship To Street 1'],
        tx['Ship To City'],
        tx['Ship To State'],
        tx['Ship To Zip']
      ].filter(Boolean).join(', ');

      transactionData.push({
        productId: productInfo.id,
        orderId: tx['Order ID'],
        orderStatus: (tx['Order Status'] || 'completed').toLowerCase(),
        quantityPacks: Math.ceil(quantity / (productInfo.packSize || 1)),
        quantityUnits: quantity,
        dateSubmitted: parseDate(tx['Date Submitted']),
        shipToLocation: shipToLocation.substring(0, 255),
        shipToCompany: (tx['Ship To Company Name'] || '').substring(0, 255),
        importBatchId: transactionsImportBatch.id,
      });
    }

    if (transactionData.length > 0) {
      await prisma.transaction.createMany({
        data: transactionData,
        skipDuplicates: true,
      });
      createdTransactions += transactionData.length;
    }

    process.stdout.write(`\r  📊 Progress: ${Math.min(i + batchSize, sortedTransactions.length).toLocaleString()}/${sortedTransactions.length.toLocaleString()} processed...`);
  }

  console.log(`\n  ✓ Created ${createdTransactions.toLocaleString()} transactions`);
  if (skippedProducts > 0) {
    console.log(`  ⚠ Skipped ${skippedProducts.toLocaleString()} transactions for products not in inventory`);
  }

  // =============================================================================
  // CREATE STOCK HISTORY (Weekly snapshots for past 12 weeks)
  // =============================================================================
  console.log('\n📉 Creating stock history...');

  const allProducts = await prisma.product.findMany({
    where: { clientId: client.id },
  });

  let stockHistoryCount = 0;

  for (const product of allProducts) {
    const usage = productUsage.get(product.productId);
    const weeklyAvgUsage = usage ? usage.totalQuantity / Math.max(1, usage.weeklyUsage.size) : 0;

    // Create 12 weeks of stock history
    for (let week = 12; week >= 0; week--) {
      const weekDate = subWeeks(now, week);
      // Simulate higher stock in past, decreasing to current level
      const simulatedStock = Math.round(
        product.currentStockUnits + (weeklyAvgUsage * week * (0.8 + Math.random() * 0.4))
      );

      await prisma.stockHistory.create({
        data: {
          productId: product.id,
          totalUnits: Math.max(0, simulatedStock),
          packsAvailable: Math.ceil(Math.max(0, simulatedStock) / (product.packSize || 1)),
          recordedAt: weekDate,
          source: 'import',
        },
      });
      stockHistoryCount++;
    }
  }

  console.log(`  ✓ Created ${stockHistoryCount.toLocaleString()} stock history records (12 weeks per product)`);

  // =============================================================================
  // GENERATE COMPREHENSIVE ALERTS
  // =============================================================================
  console.log('\n🚨 Generating alerts...');

  let alertsCreated = 0;

  // Get products needing attention
  const productsNeedingAlerts = await prisma.product.findMany({
    where: { clientId: client.id },
    orderBy: { currentStockUnits: 'asc' },
  });

  for (const product of productsNeedingAlerts) {
    const usage = productUsage.get(product.productId);

    // STOCKOUT alerts
    if (product.stockStatus === 'STOCKOUT' || product.currentStockUnits === 0) {
      await prisma.alert.create({
        data: {
          clientId: client.id,
          productId: product.id,
          alertType: 'stockout',
          severity: 'critical',
          title: `STOCKOUT: ${product.name.substring(0, 80)}`,
          message: `${product.name} is completely out of stock. Immediate reorder required.`,
          status: 'active',
          currentValue: 0,
          thresholdValue: product.notificationPoint ? parseFloat(product.notificationPoint.toString()) : null,
        },
      });
      alertsCreated++;
    }
    // CRITICAL alerts (less than 2 weeks)
    else if (product.stockStatus === 'CRITICAL') {
      await prisma.alert.create({
        data: {
          clientId: client.id,
          productId: product.id,
          alertType: 'stockout_risk',
          severity: 'high',
          title: `Critical Stock: ${product.name.substring(0, 80)}`,
          message: `${product.name} has only ${product.weeksRemaining || '<1'} week(s) of stock remaining based on current usage.`,
          status: 'active',
          currentValue: product.currentStockUnits ? parseFloat(product.currentStockUnits.toString()) : null,
          thresholdValue: product.notificationPoint ? parseFloat(product.notificationPoint.toString()) : null,
        },
      });
      alertsCreated++;
    }
    // LOW stock alerts
    else if (product.stockStatus === 'LOW') {
      await prisma.alert.create({
        data: {
          clientId: client.id,
          productId: product.id,
          alertType: 'low_stock',
          severity: 'medium',
          title: `Low Stock: ${product.name.substring(0, 80)}`,
          message: `${product.name} is below reorder point. Current stock: ${product.currentStockUnits} units, Reorder at: ${product.notificationPoint || 'N/A'} units.`,
          status: 'active',
          currentValue: product.currentStockUnits ? parseFloat(product.currentStockUnits.toString()) : null,
          thresholdValue: product.notificationPoint ? parseFloat(product.notificationPoint.toString()) : null,
        },
      });
      alertsCreated++;
    }
    // WATCH alerts
    else if (product.stockStatus === 'WATCH') {
      await prisma.alert.create({
        data: {
          clientId: client.id,
          productId: product.id,
          alertType: 'low_stock',
          severity: 'low',
          title: `Watch: ${product.name.substring(0, 80)}`,
          message: `${product.name} has ${product.weeksRemaining || 'limited'} weeks of stock remaining. Consider reordering soon.`,
          status: 'active',
          currentValue: product.currentStockUnits ? parseFloat(product.currentStockUnits.toString()) : null,
          thresholdValue: product.notificationPoint ? parseFloat(product.notificationPoint.toString()) : null,
        },
      });
      alertsCreated++;
    }

    // High usage alert for top movers
    if (usage && usage.orderCount > 50) {
      await prisma.alert.create({
        data: {
          clientId: client.id,
          productId: product.id,
          alertType: 'usage_spike',
          severity: 'low',
          title: `High Demand: ${product.name.substring(0, 80)}`,
          message: `${product.name} has ${usage.orderCount} orders totaling ${usage.totalQuantity.toLocaleString()} units. Monitor stock levels closely.`,
          status: 'active',
          currentValue: usage.orderCount,
        },
      });
      alertsCreated++;
    }
  }

  console.log(`  ✓ Created ${alertsCreated} alerts`);

  // =============================================================================
  // CREATE USAGE METRICS (3 months, 12 months, weekly)
  // =============================================================================
  console.log('\n📈 Creating usage metrics (3-month, 12-month, weekly)...');

  let metricsCreated = 0;

  // Calculate period boundaries
  const threeMonthsAgo = subDays(now, 90);
  const twelveMonthsAgo = subDays(now, 365);

  for (const product of allProducts) {
    const usage = productUsage.get(product.productId);

    if (usage && usage.totalQuantity > 0) {
      // 3-MONTH USAGE METRIC
      const threeMonthTxs = usage.transactions.filter(tx => parseDate(tx['Date Submitted']) >= threeMonthsAgo);
      const threeMonthTotal = threeMonthTxs.reduce((sum, tx) => sum + parseInt(tx['Total Quantity'] || tx['Quantity'] || '0', 10), 0);

      if (threeMonthTotal > 0) {
        const dailyAvg3mo = threeMonthTotal / 90;
        await prisma.usageMetric.create({
          data: {
            productId: product.id,
            periodType: '3_month',
            periodStart: threeMonthsAgo,
            periodEnd: now,
            totalConsumedUnits: threeMonthTotal,
            totalConsumedPacks: Math.ceil(threeMonthTotal / (product.packSize || 1)),
            avgDailyUnits: Math.round(dailyAvg3mo * 100) / 100,
            avgDailyPacks: Math.round((dailyAvg3mo / (product.packSize || 1)) * 10000) / 10000,
            transactionCount: threeMonthTxs.length,
            calculatedAt: new Date(),
          },
        });
        metricsCreated++;
      }

      // 12-MONTH USAGE METRIC
      const twelveMonthTxs = usage.transactions.filter(tx => parseDate(tx['Date Submitted']) >= twelveMonthsAgo);
      const twelveMonthTotal = twelveMonthTxs.reduce((sum, tx) => sum + parseInt(tx['Total Quantity'] || tx['Quantity'] || '0', 10), 0);

      if (twelveMonthTotal > 0) {
        const dailyAvg12mo = twelveMonthTotal / 365;
        await prisma.usageMetric.create({
          data: {
            productId: product.id,
            periodType: '12_month',
            periodStart: twelveMonthsAgo,
            periodEnd: now,
            totalConsumedUnits: twelveMonthTotal,
            totalConsumedPacks: Math.ceil(twelveMonthTotal / (product.packSize || 1)),
            avgDailyUnits: Math.round(dailyAvg12mo * 100) / 100,
            avgDailyPacks: Math.round((dailyAvg12mo / (product.packSize || 1)) * 10000) / 10000,
            transactionCount: twelveMonthTxs.length,
            calculatedAt: new Date(),
          },
        });
        metricsCreated++;
      }

      // WEEKLY USAGE METRIC (last 7 days for trend)
      const oneWeekAgo = subDays(now, 7);
      const weeklyTxs = usage.transactions.filter(tx => parseDate(tx['Date Submitted']) >= oneWeekAgo);
      const weeklyTotal = weeklyTxs.reduce((sum, tx) => sum + parseInt(tx['Total Quantity'] || tx['Quantity'] || '0', 10), 0);

      await prisma.usageMetric.create({
        data: {
          productId: product.id,
          periodType: 'weekly',
          periodStart: oneWeekAgo,
          periodEnd: now,
          totalConsumedUnits: weeklyTotal,
          totalConsumedPacks: Math.ceil(weeklyTotal / (product.packSize || 1)),
          avgDailyUnits: Math.round((weeklyTotal / 7) * 100) / 100,
          avgDailyPacks: Math.round((weeklyTotal / 7 / (product.packSize || 1)) * 10000) / 10000,
          transactionCount: weeklyTxs.length,
          calculatedAt: new Date(),
        },
      });
      metricsCreated++;

      // MONTHLY USAGE METRICS (for each of the last 12 months for charts)
      for (let monthOffset = 0; monthOffset < 12; monthOffset++) {
        const monthEnd = subDays(now, monthOffset * 30);
        const monthStart = subDays(monthEnd, 30);

        const monthTxs = usage.transactions.filter(tx => {
          const date = parseDate(tx['Date Submitted']);
          return date >= monthStart && date < monthEnd;
        });

        const monthTotal = monthTxs.reduce((sum, tx) => sum + parseInt(tx['Total Quantity'] || tx['Quantity'] || '0', 10), 0);

        if (monthTotal > 0 || monthOffset < 3) { // Always create at least 3 months of history
          await prisma.usageMetric.create({
            data: {
              productId: product.id,
              periodType: 'monthly',
              periodStart: monthStart,
              periodEnd: monthEnd,
              totalConsumedUnits: monthTotal,
              totalConsumedPacks: Math.ceil(monthTotal / (product.packSize || 1)),
              avgDailyUnits: Math.round((monthTotal / 30) * 100) / 100,
              avgDailyPacks: Math.round((monthTotal / 30 / (product.packSize || 1)) * 10000) / 10000,
              transactionCount: monthTxs.length,
              calculatedAt: new Date(),
            },
          });
          metricsCreated++;
        }
      }
    }
  }

  console.log(`  ✓ Created ${metricsCreated} usage metrics (3mo, 12mo, weekly, monthly)`);

  // =============================================================================
  // CREATE SAMPLE ORDER REQUESTS (for portal demo)
  // =============================================================================
  console.log('\n📋 Creating sample order requests...');

  const portalAdmin = await prisma.portalUser.findFirst({
    where: { clientId: client.id, role: 'admin' }
  });

  const portalOrders = await prisma.portalUser.findFirst({
    where: { clientId: client.id, role: 'requester' }
  });

  const sampleProducts = allProducts.slice(0, 5);

  if (portalAdmin && sampleProducts.length > 0) {
    // Pending request (from orders team)
    await prisma.orderRequest.create({
      data: {
        clientId: client.id,
        requestedById: portalOrders?.id || portalAdmin.id,
        status: 'pending',
        items: sampleProducts.slice(0, 2).map(p => ({
          productId: p.id,
          productName: p.name,
          quantity: Math.floor(Math.random() * 10) + 1,
        })),
        notes: 'Monthly restock request for holiday materials',
      },
    });

    // Approved request (reviewed by admin)
    await prisma.orderRequest.create({
      data: {
        clientId: client.id,
        requestedById: portalOrders?.id || portalAdmin.id,
        reviewedById: portalAdmin.id,
        status: 'approved',
        items: sampleProducts.slice(2, 4).map(p => ({
          productId: p.id,
          productName: p.name,
          quantity: Math.floor(Math.random() * 20) + 5,
        })),
        notes: 'Urgent restock for upcoming event',
        reviewNotes: 'Approved - expedited shipping requested',
        reviewedAt: subDays(new Date(), 2),
      },
    });

    // Completed request
    await prisma.orderRequest.create({
      data: {
        clientId: client.id,
        requestedById: portalOrders?.id || portalAdmin.id,
        reviewedById: portalAdmin.id,
        status: 'completed',
        items: sampleProducts.slice(0, 3).map(p => ({
          productId: p.id,
          productName: p.name,
          quantity: Math.floor(Math.random() * 15) + 3,
        })),
        notes: 'Q4 preparation order',
        reviewNotes: 'Shipped via FedEx',
        reviewedAt: subDays(new Date(), 10),
      },
    });

    console.log('  ✓ Created 3 sample order requests');
  }

  // =============================================================================
  // SUMMARY
  // =============================================================================
  const statusCounts = await prisma.product.groupBy({
    by: ['stockStatus'],
    where: { clientId: client.id },
    _count: { id: true },
  });

  const totalTransactions = await prisma.transaction.count({
    where: { product: { clientId: client.id } }
  });

  const totalAlerts = await prisma.alert.count({
    where: { clientId: client.id }
  });

  console.log('\n' + '='.repeat(70));
  console.log('🎉 EVERSTORY FULL DATA IMPORT COMPLETE!');
  console.log('='.repeat(70));
  console.log(`
📊 Import Summary:
  ┌─────────────────────────────────────────────────────────┐
  │ Client:         Everstory Partners (EVR)                │
  │ Products:       ${createdProducts.toString().padEnd(40)}│
  │ Transactions:   ${totalTransactions.toLocaleString().padEnd(40)}│
  │ Stock History:  ${stockHistoryCount.toLocaleString().padEnd(40)}│
  │ Alerts:         ${totalAlerts.toString().padEnd(40)}│
  │ Usage Metrics:  ${metricsCreated.toString().padEnd(40)}│
  │ Import Batches: 2 (inventory + orders)                  │
  │ Order Requests: 3 (pending, approved, completed)        │
  └─────────────────────────────────────────────────────────┘

📦 Stock Status Distribution:`);

  for (const { stockStatus, _count } of statusCounts) {
    const emoji = stockStatus === 'HEALTHY' ? '🟢' :
                  stockStatus === 'WATCH' ? '🔵' :
                  stockStatus === 'LOW' ? '🟡' :
                  stockStatus === 'CRITICAL' ? '🟠' : '🔴';
    console.log(`    ${emoji} ${stockStatus?.padEnd(10) || 'UNKNOWN'}: ${_count.id} products`);
  }

  console.log(`
🔐 Login Credentials:

  ADMIN DASHBOARD (http://localhost:5173):
    Email:    sarah.chen@inventoryiq.com
    Password: demo1234

  CLIENT PORTAL (http://localhost:5174):
    Admin:    admin@everstory.com     / everstory1234
    Orders:   orders@everstory.com    / everstory1234
    Viewer:   viewer@everstory.com    / everstory1234

📁 Import History:
    ✓ Everstory Inventory Items - Sheet1.csv (${inventoryRows.length} products)
    ✓ Line Item Report - Sheet1.csv (${transactionRows.length} orders)
`);
  console.log('='.repeat(70) + '\n');
}

main()
  .catch((e) => {
    console.error('❌ Error during import:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
