/**
 * Initial Data Population Script
 *
 * This script populates default values for newly added fields after migration.
 * Run this after applying migrations to ensure existing records have reasonable defaults.
 *
 * Usage:
 *   npx ts-node prisma/migrations/populate-initial-data.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function populateFinancialData() {
  console.log("\n📊 Populating financial data defaults...");

  // Set default cost source for existing products
  const productsUpdated = await prisma.product.updateMany({
    where: {
      cost_source: null,
      OR: [{ unit_cost: { not: null } }, { unit_price: { not: null } }],
    },
    data: {
      cost_source: "manual",
      last_cost_update: new Date(),
    },
  });

  console.log(`✅ Updated cost_source for ${productsUpdated.count} products`);
}

async function populateLeadTimes() {
  console.log("\n⏱️  Populating default lead times...");

  // Get client default settings
  const clients = await prisma.client.findMany({
    select: { id: true, code: true, settings: true },
  });

  let totalUpdated = 0;

  for (const client of clients) {
    const settings = client.settings as any;
    const defaultLeadDays = settings?.defaultLeadDays || 14;

    // Set default lead times for products without them
    const result = await prisma.product.updateMany({
      where: {
        client_id: client.id,
        total_lead_days: null,
      },
      data: {
        supplier_lead_days: Math.floor(defaultLeadDays * 0.6), // 60% supplier
        shipping_lead_days: Math.floor(defaultLeadDays * 0.3), // 30% shipping
        processing_lead_days: Math.floor(defaultLeadDays * 0.1), // 10% processing
        safety_buffer_days: 2,
        lead_time_source: "default",
      },
    });

    totalUpdated += result.count;
    console.log(`  ${client.code}: ${result.count} products updated`);
  }

  console.log(`✅ Updated lead times for ${totalUpdated} products`);
}

async function createDefaultDashboardLayouts() {
  console.log("\n🎨 Creating default dashboard layouts...");

  // Get all users without a default layout
  const users = await prisma.user.findMany({
    where: {
      dashboardLayouts: {
        none: {},
      },
    },
  });

  const defaultLayout = {
    widgets: [
      { id: "alerts", x: 0, y: 0, w: 6, h: 4 },
      { id: "stock-status", x: 6, y: 0, w: 6, h: 4 },
      { id: "recent-orders", x: 0, y: 4, w: 6, h: 4 },
      { id: "usage-trends", x: 6, y: 4, w: 6, h: 4 },
    ],
  };

  for (const user of users) {
    await prisma.dashboardLayout.create({
      data: {
        user_id: user.id,
        name: "Default Layout",
        is_default: true,
        layout: defaultLayout,
      },
    });
  }

  console.log(`✅ Created default layouts for ${users.length} users`);
}

async function createDefaultUserPreferences() {
  console.log("\n⚙️  Creating default user preferences...");

  // Get all users without preferences
  const users = await prisma.user.findMany({
    where: {
      preferences: null,
    },
  });

  for (const user of users) {
    await prisma.userPreferences.create({
      data: {
        user_id: user.id,
        default_view: "dashboard",
        chart_color_scheme: "default",
        compact_mode: false,
        enable_realtime: true,
        notification_settings: {
          emailAlerts: true,
          lowStockAlerts: true,
          orderUpdates: true,
        },
      },
    });
  }

  console.log(`✅ Created preferences for ${users.length} users`);
}

async function assignBenchmarkCohorts() {
  console.log("\n🏆 Assigning benchmark cohorts...");

  // Get all clients without benchmark participation
  const clients = await prisma.client.findMany({
    where: {
      benchmarkParticipation: null,
    },
  });

  for (const client of clients) {
    // Default to 'general' cohort, can be customized later
    await prisma.benchmarkParticipation.create({
      data: {
        client_id: client.id,
        is_participating: false, // Opt-in required
        cohort: "general",
      },
    });
  }

  console.log(
    `✅ Created benchmark participation records for ${clients.length} clients`,
  );
}

async function calculateInitialTimingMetrics() {
  console.log("\n📅 Calculating initial timing metrics...");

  // Get products with lead times but no timing calculations
  const products = await prisma.product.findMany({
    where: {
      total_lead_days: { not: null },
      timing_last_calculated: null,
      is_active: true,
    },
    select: {
      id: true,
      avg_daily_usage: true,
      current_stock_units: true,
      total_lead_days: true,
    },
  });

  let calculated = 0;

  for (const product of products) {
    if (!product.avg_daily_usage || product.avg_daily_usage <= 0) {
      continue;
    }

    const daysUntilStockout =
      product.current_stock_units / product.avg_daily_usage;
    const projectedStockoutDate = new Date();
    projectedStockoutDate.setDate(
      projectedStockoutDate.getDate() + Math.floor(daysUntilStockout),
    );

    const lastOrderByDate = new Date(projectedStockoutDate);
    lastOrderByDate.setDate(
      lastOrderByDate.getDate() - (product.total_lead_days || 0),
    );

    await prisma.product.update({
      where: { id: product.id },
      data: {
        projected_stockout_date: projectedStockoutDate,
        last_order_by_date: lastOrderByDate,
        timing_last_calculated: new Date(),
      },
    });

    calculated++;
  }

  console.log(`✅ Calculated timing metrics for ${calculated} products`);
}

async function main() {
  console.log("================================================");
  console.log("Initial Data Population");
  console.log("================================================");

  try {
    await populateFinancialData();
    await populateLeadTimes();
    await createDefaultDashboardLayouts();
    await createDefaultUserPreferences();
    await assignBenchmarkCohorts();
    await calculateInitialTimingMetrics();

    console.log("\n================================================");
    console.log("✅ Data population completed successfully!");
    console.log("================================================\n");
  } catch (error) {
    console.error("\n❌ Error during data population:", error);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
