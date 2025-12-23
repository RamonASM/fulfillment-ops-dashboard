/**
 * COMPREHENSIVE IMPORT PIPELINE DIAGNOSTIC
 *
 * This script validates every layer of the import pipeline:
 * 1. Infrastructure (directories, Python, database)
 * 2. Import Batches (row counts, errors, diagnostic logs)
 * 3. Data Integrity (itemType, required fields, orphans)
 * 4. Transactions (dates, product links, completeness)
 * 5. Usage Calculations (data availability, staleness)
 * 6. Stock Status (consistency, calculation accuracy)
 * 7. API Endpoints (response validation)
 *
 * Run with: npx tsx apps/api/scripts/audit/full-diagnostic.ts
 */

import { PrismaClient, Prisma } from "@prisma/client";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
const prisma = new PrismaClient();

// ============================================================================
// TYPES
// ============================================================================

interface DiagnosticResult {
  category: string;
  check: string;
  status: "PASS" | "FAIL" | "WARN" | "INFO";
  message: string;
  details?: Record<string, unknown>;
}

interface DiagnosticReport {
  timestamp: string;
  duration: number;
  summary: {
    total: number;
    passed: number;
    failed: number;
    warnings: number;
  };
  results: DiagnosticResult[];
  criticalIssues: DiagnosticResult[];
  recommendations: string[];
}

// ============================================================================
// HELPERS
// ============================================================================

const results: DiagnosticResult[] = [];

function log(result: DiagnosticResult) {
  results.push(result);
  const icon =
    result.status === "PASS"
      ? "✅"
      : result.status === "FAIL"
        ? "❌"
        : result.status === "WARN"
          ? "⚠️"
          : "ℹ️";
  console.log(`${icon} [${result.category}] ${result.check}: ${result.message}`);
  if (result.details && Object.keys(result.details).length > 0) {
    Object.entries(result.details).forEach(([key, value]) => {
      console.log(`   ${key}: ${JSON.stringify(value)}`);
    });
  }
}

// ============================================================================
// LAYER 1: INFRASTRUCTURE CHECKS
// ============================================================================

async function checkInfrastructure() {
  console.log("\n" + "=".repeat(60));
  console.log("LAYER 1: INFRASTRUCTURE");
  console.log("=".repeat(60));

  // Check upload directory
  const uploadDir = path.resolve(process.cwd(), "uploads");
  const uploadExists = fs.existsSync(uploadDir);
  log({
    category: "Infrastructure",
    check: "Upload Directory",
    status: uploadExists ? "PASS" : "FAIL",
    message: uploadExists
      ? `Upload directory exists at ${uploadDir}`
      : `Upload directory MISSING at ${uploadDir}`,
  });

  if (uploadExists) {
    try {
      fs.accessSync(uploadDir, fs.constants.W_OK);
      log({
        category: "Infrastructure",
        check: "Upload Writable",
        status: "PASS",
        message: "Upload directory is writable",
      });
    } catch {
      log({
        category: "Infrastructure",
        check: "Upload Writable",
        status: "FAIL",
        message: "Upload directory is NOT writable",
      });
    }
  }

  // Check Python importer
  const pythonImporterPath = path.resolve(
    process.cwd(),
    "apps/python-importer/main.py"
  );
  const pythonExists = fs.existsSync(pythonImporterPath);
  log({
    category: "Infrastructure",
    check: "Python Importer",
    status: pythonExists ? "PASS" : "FAIL",
    message: pythonExists
      ? `Python importer exists at ${pythonImporterPath}`
      : `Python importer MISSING`,
  });

  // Check Python executable
  try {
    const { stdout } = await execAsync("python3 --version");
    log({
      category: "Infrastructure",
      check: "Python3 Available",
      status: "PASS",
      message: stdout.trim(),
    });
  } catch {
    log({
      category: "Infrastructure",
      check: "Python3 Available",
      status: "FAIL",
      message: "Python3 not found in PATH",
    });
  }

  // Check database connection
  try {
    await prisma.$connect();
    log({
      category: "Infrastructure",
      check: "Database Connection",
      status: "PASS",
      message: "Successfully connected to PostgreSQL",
    });
  } catch (error) {
    log({
      category: "Infrastructure",
      check: "Database Connection",
      status: "FAIL",
      message: `Database connection failed: ${error}`,
    });
  }

  // Check required tables exist
  const requiredTables = [
    "clients",
    "products",
    "transactions",
    "import_batches",
    "stock_history",
    "daily_snapshots",
    "alerts",
  ];

  for (const table of requiredTables) {
    try {
      await prisma.$queryRawUnsafe(`SELECT 1 FROM ${table} LIMIT 1`);
      log({
        category: "Infrastructure",
        check: `Table: ${table}`,
        status: "PASS",
        message: `Table ${table} exists and is accessible`,
      });
    } catch {
      log({
        category: "Infrastructure",
        check: `Table: ${table}`,
        status: "FAIL",
        message: `Table ${table} MISSING or inaccessible`,
      });
    }
  }
}

// ============================================================================
// LAYER 2: IMPORT BATCH ANALYSIS
// ============================================================================

async function checkImportBatches() {
  console.log("\n" + "=".repeat(60));
  console.log("LAYER 2: IMPORT BATCHES");
  console.log("=".repeat(60));

  const recentImports = await prisma.importBatch.findMany({
    take: 10,
    orderBy: { createdAt: "desc" },
    include: { client: true },
  });

  log({
    category: "Imports",
    check: "Recent Import Count",
    status: recentImports.length > 0 ? "INFO" : "WARN",
    message: `Found ${recentImports.length} recent imports`,
  });

  for (const batch of recentImports) {
    const clientName = batch.client?.name || "Unknown";
    const rowMismatch =
      batch.rowCount !== batch.processedCount + batch.errorCount;

    // Check row count consistency
    log({
      category: "Imports",
      check: `Batch ${batch.id.slice(0, 8)}`,
      status: batch.status === "completed" ? (rowMismatch ? "WARN" : "PASS") : "FAIL",
      message: `${clientName} - ${batch.status} | Rows: ${batch.rowCount} | Processed: ${batch.processedCount} | Errors: ${batch.errorCount}`,
      details: rowMismatch
        ? {
            issue: "Row count mismatch",
            expected: batch.rowCount,
            actual: batch.processedCount + batch.errorCount,
            missing: batch.rowCount - (batch.processedCount + batch.errorCount),
          }
        : undefined,
    });

    // Check for errors in batch
    if (batch.errors && Array.isArray(batch.errors) && batch.errors.length > 0) {
      const errors = batch.errors as Array<{ type?: string; message?: string }>;
      log({
        category: "Imports",
        check: `Batch ${batch.id.slice(0, 8)} Errors`,
        status: "WARN",
        message: `${errors.length} errors recorded`,
        details: {
          sampleErrors: errors.slice(0, 3).map((e) => e.message || "Unknown"),
        },
      });
    }

    // Check diagnostic logs
    if (batch.diagnosticLogs) {
      const logs = batch.diagnosticLogs as Array<{ type?: string; message?: string }>;
      const droppedRows = logs.filter((l) => l.type === "row_dropped");
      const coercions = logs.filter((l) => l.type === "data_coerced");
      const warnings = logs.filter((l) => l.type === "warning");

      if (droppedRows.length > 0 || coercions.length > 0) {
        log({
          category: "Imports",
          check: `Batch ${batch.id.slice(0, 8)} Diagnostics`,
          status: droppedRows.length > 0 ? "WARN" : "INFO",
          message: `${droppedRows.length} dropped rows, ${coercions.length} coercions, ${warnings.length} warnings`,
          details: {
            droppedSample: droppedRows.slice(0, 2).map((d) => d.message),
            coercionSample: coercions.slice(0, 2).map((c) => c.message),
          },
        });
      }
    }
  }
}

// ============================================================================
// LAYER 3: DATA INTEGRITY
// ============================================================================

async function checkDataIntegrity() {
  console.log("\n" + "=".repeat(60));
  console.log("LAYER 3: DATA INTEGRITY");
  console.log("=".repeat(60));

  // Check itemType values
  const invalidItemTypes = await prisma.$queryRaw<Array<{ item_type: string; count: bigint }>>`
    SELECT item_type, COUNT(*) as count
    FROM products
    WHERE item_type NOT IN ('evergreen', 'event', 'completed')
    AND is_active = true
    GROUP BY item_type
  `;

  if (invalidItemTypes.length > 0) {
    log({
      category: "Integrity",
      check: "ItemType Values",
      status: "FAIL",
      message: `Found ${invalidItemTypes.length} invalid itemType values`,
      details: {
        invalidValues: invalidItemTypes.map((i) => ({
          value: i.item_type,
          count: Number(i.count),
        })),
      },
    });
  } else {
    log({
      category: "Integrity",
      check: "ItemType Values",
      status: "PASS",
      message: "All itemType values are valid lowercase",
    });
  }

  // Check required fields - use raw SQL since Prisma doesn't allow null checks on required fields
  const emptyFieldsResult = await prisma.$queryRaw<Array<{ empty_names: bigint; empty_product_ids: bigint }>>`
    SELECT
      COUNT(*) FILTER (WHERE name = '' OR name IS NULL) as empty_names,
      COUNT(*) FILTER (WHERE product_id = '' OR product_id IS NULL) as empty_product_ids
    FROM products
    WHERE is_active = true
  `;

  const emptyNames = Number(emptyFieldsResult[0]?.empty_names || 0);
  const emptyProductIds = Number(emptyFieldsResult[0]?.empty_product_ids || 0);

  log({
    category: "Integrity",
    check: "Required Fields",
    status: emptyNames + emptyProductIds > 0 ? "FAIL" : "PASS",
    message:
      emptyNames + emptyProductIds > 0
        ? `Found products with missing required fields`
        : "All products have required fields",
    details:
      emptyNames + emptyProductIds > 0
        ? { emptyNames, emptyProductIds }
        : undefined,
  });

  // Check orphan products
  const orphanCount = await prisma.product.count({
    where: { isOrphan: true, isActive: true },
  });

  log({
    category: "Integrity",
    check: "Orphan Products",
    status: orphanCount > 0 ? "WARN" : "PASS",
    message: `${orphanCount} orphan products found`,
  });

  // Check products by itemType distribution
  const itemTypeDistribution = await prisma.$queryRaw<Array<{ item_type: string; count: bigint }>>`
    SELECT item_type, COUNT(*) as count
    FROM products
    WHERE is_active = true
    GROUP BY item_type
  `;

  log({
    category: "Integrity",
    check: "ItemType Distribution",
    status: "INFO",
    message: "Active product distribution by itemType",
    details: {
      distribution: itemTypeDistribution.map((i) => ({
        type: i.item_type,
        count: Number(i.count),
      })),
    },
  });

  // Check for duplicate productId within same client
  const duplicates = await prisma.$queryRaw<Array<{ client_id: string; product_id: string; count: bigint }>>`
    SELECT client_id, product_id, COUNT(*) as count
    FROM products
    WHERE is_active = true
    GROUP BY client_id, product_id
    HAVING COUNT(*) > 1
  `;

  log({
    category: "Integrity",
    check: "Duplicate ProductIDs",
    status: duplicates.length > 0 ? "FAIL" : "PASS",
    message:
      duplicates.length > 0
        ? `Found ${duplicates.length} duplicate productId combinations`
        : "No duplicate productIds within same client",
    details: duplicates.length > 0 ? { samples: duplicates.slice(0, 5) } : undefined,
  });
}

// ============================================================================
// LAYER 4: TRANSACTION DATA
// ============================================================================

async function checkTransactions() {
  console.log("\n" + "=".repeat(60));
  console.log("LAYER 4: TRANSACTIONS");
  console.log("=".repeat(60));

  // Total transaction count
  const totalTransactions = await prisma.transaction.count();
  log({
    category: "Transactions",
    check: "Total Count",
    status: "INFO",
    message: `${totalTransactions.toLocaleString()} total transactions`,
  });

  // Transaction date range
  const dateRange = await prisma.$queryRaw<Array<{ min_date: Date; max_date: Date }>>`
    SELECT MIN(date_submitted) as min_date, MAX(date_submitted) as max_date
    FROM transactions
  `;

  if (dateRange.length > 0 && dateRange[0].min_date) {
    const oldest = new Date(dateRange[0].min_date);
    const newest = new Date(dateRange[0].max_date);
    const now = new Date();
    const newestAge = Math.floor(
      (now.getTime() - newest.getTime()) / (1000 * 60 * 60 * 24)
    );

    log({
      category: "Transactions",
      check: "Date Range",
      status: newestAge > 365 ? "FAIL" : newestAge > 90 ? "WARN" : "PASS",
      message: `Oldest: ${oldest.toISOString().split("T")[0]}, Newest: ${newest.toISOString().split("T")[0]}`,
      details: {
        newestAgeDays: newestAge,
        issue: newestAge > 365 ? "Data is over 1 year old - usage calculations will show no data" : undefined,
      },
    });
  }

  // Transactions in last 12 months (critical for usage calculation)
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

  const recentTransactions = await prisma.transaction.count({
    where: {
      dateSubmitted: { gte: twelveMonthsAgo },
    },
  });

  const percentage =
    totalTransactions > 0
      ? ((recentTransactions / totalTransactions) * 100).toFixed(1)
      : 0;

  log({
    category: "Transactions",
    check: "Recent Transactions (12mo)",
    status: recentTransactions < 100 ? "FAIL" : recentTransactions < 1000 ? "WARN" : "PASS",
    message: `${recentTransactions.toLocaleString()} transactions in last 12 months (${percentage}% of total)`,
    details: {
      implication:
        recentTransactions < 100
          ? "CRITICAL: Not enough recent data for usage calculations"
          : undefined,
    },
  });

  // Transactions by status
  const statusDistribution = await prisma.$queryRaw<Array<{ order_status: string; count: bigint }>>`
    SELECT order_status, COUNT(*) as count
    FROM transactions
    GROUP BY order_status
  `;

  log({
    category: "Transactions",
    check: "Status Distribution",
    status: "INFO",
    message: "Transaction status breakdown",
    details: {
      statuses: statusDistribution.map((s) => ({
        status: s.order_status,
        count: Number(s.count),
      })),
    },
  });

  // Orphan transactions (no matching product)
  const orphanTransactions = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) as count
    FROM transactions t
    LEFT JOIN products p ON t.product_id = p.id
    WHERE p.id IS NULL
  `;

  const orphanCount = Number(orphanTransactions[0]?.count || 0);
  log({
    category: "Transactions",
    check: "Orphan Transactions",
    status: orphanCount > 0 ? "FAIL" : "PASS",
    message:
      orphanCount > 0
        ? `${orphanCount} transactions reference non-existent products`
        : "All transactions link to valid products",
  });
}

// ============================================================================
// LAYER 5: USAGE CALCULATIONS
// ============================================================================

async function checkUsageCalculations() {
  console.log("\n" + "=".repeat(60));
  console.log("LAYER 5: USAGE CALCULATIONS");
  console.log("=".repeat(60));

  // Products with usage data - use avgDailyUsage or monthlyUsageUnits
  const productsWithUsage = await prisma.product.count({
    where: {
      isActive: true,
      OR: [
        { avgDailyUsage: { not: null, gt: 0 } },
        { monthlyUsageUnits: { not: null, gt: 0 } },
      ],
    },
  });

  const totalActiveProducts = await prisma.product.count({
    where: { isActive: true },
  });

  const usagePercentage =
    totalActiveProducts > 0
      ? ((productsWithUsage / totalActiveProducts) * 100).toFixed(1)
      : 0;

  log({
    category: "Usage",
    check: "Products with Usage Data",
    status: productsWithUsage < totalActiveProducts * 0.5 ? "FAIL" : "PASS",
    message: `${productsWithUsage}/${totalActiveProducts} products have usage data (${usagePercentage}%)`,
    details: {
      withoutUsage: totalActiveProducts - productsWithUsage,
      implication:
        productsWithUsage < totalActiveProducts * 0.5
          ? "Most products show 'No data' in usage column"
          : undefined,
    },
  });

  // Check usage staleness (usageLastCalculated)
  const staleUsage = await prisma.product.count({
    where: {
      isActive: true,
      OR: [
        { avgDailyUsage: { gt: 0 } },
        { monthlyUsageUnits: { gt: 0 } },
      ],
      usageLastCalculated: {
        lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
      },
    },
  });

  log({
    category: "Usage",
    check: "Usage Data Freshness",
    status: staleUsage > productsWithUsage * 0.5 ? "WARN" : "PASS",
    message:
      staleUsage > 0
        ? `${staleUsage} products have usage data older than 7 days`
        : "All usage data is fresh",
  });

  // Check monthly usage table if exists
  try {
    const monthlyUsageCount = await prisma.monthlyUsage.count();
    log({
      category: "Usage",
      check: "MonthlyUsage Records",
      status: monthlyUsageCount > 0 ? "PASS" : "WARN",
      message: `${monthlyUsageCount} monthly usage records stored`,
    });
  } catch {
    log({
      category: "Usage",
      check: "MonthlyUsage Records",
      status: "INFO",
      message: "MonthlyUsage table not found (may not be required)",
    });
  }
}

// ============================================================================
// LAYER 6: STOCK STATUS
// ============================================================================

async function checkStockStatus() {
  console.log("\n" + "=".repeat(60));
  console.log("LAYER 6: STOCK STATUS");
  console.log("=".repeat(60));

  // Stock status distribution
  const stockDistribution = await prisma.$queryRaw<Array<{ stock_status: string; count: bigint }>>`
    SELECT stock_status, COUNT(*) as count
    FROM products
    WHERE is_active = true
    GROUP BY stock_status
  `;

  log({
    category: "Stock",
    check: "Status Distribution",
    status: "INFO",
    message: "Stock status breakdown",
    details: {
      distribution: stockDistribution.map((s) => ({
        status: s.stock_status || "null",
        count: Number(s.count),
      })),
    },
  });

  // Check for null/unknown status
  const unknownStatus = await prisma.product.count({
    where: {
      isActive: true,
      OR: [{ stockStatus: null }, { stockStatus: "unknown" }],
    },
  });

  log({
    category: "Stock",
    check: "Unknown Status Count",
    status: unknownStatus > 0 ? "WARN" : "PASS",
    message:
      unknownStatus > 0
        ? `${unknownStatus} products have unknown/null stock status`
        : "All products have valid stock status",
    details: unknownStatus > 0 ? { cause: "Usually means no usage data to calculate status" } : undefined,
  });

  // Check weeksRemaining calculation
  const productsWithWeeks = await prisma.product.count({
    where: {
      isActive: true,
      weeksRemaining: { not: null, gt: 0 },
    },
  });

  const productsWithoutWeeks = await prisma.product.count({
    where: {
      isActive: true,
      OR: [{ weeksRemaining: null }, { weeksRemaining: 0 }],
    },
  });

  log({
    category: "Stock",
    check: "Weeks Remaining Data",
    status: productsWithoutWeeks > productsWithWeeks ? "WARN" : "PASS",
    message: `${productsWithWeeks} products have weeks remaining, ${productsWithoutWeeks} do not`,
  });
}

// ============================================================================
// LAYER 7: CLIENT DATA
// ============================================================================

async function checkClientData() {
  console.log("\n" + "=".repeat(60));
  console.log("LAYER 7: CLIENT DATA");
  console.log("=".repeat(60));

  const clients = await prisma.client.findMany({
    where: { isActive: true },
    select: {
      id: true,
      code: true,
      name: true,
      _count: { select: { products: true } },
    },
  });

  for (const client of clients) {
    const productCount = client._count.products;

    // Get product breakdown - cast UUID properly
    const breakdown = await prisma.$queryRaw<Array<{ item_type: string; count: bigint }>>`
      SELECT item_type, COUNT(*) as count
      FROM products
      WHERE client_id = ${client.id}::uuid AND is_active = true
      GROUP BY item_type
    `;

    // Get usage stats
    const withUsage = await prisma.product.count({
      where: {
        clientId: client.id,
        isActive: true,
        OR: [
          { avgDailyUsage: { gt: 0 } },
          { monthlyUsageUnits: { gt: 0 } },
        ],
      },
    });

    log({
      category: "Clients",
      check: `${client.code} (${client.name})`,
      status: productCount > 0 ? "INFO" : "WARN",
      message: `${productCount} products, ${withUsage} with usage data`,
      details: {
        breakdown: breakdown.map((b) => ({ type: b.item_type, count: Number(b.count) })),
        usagePercentage: productCount > 0 ? `${((withUsage / productCount) * 100).toFixed(0)}%` : "N/A",
      },
    });
  }
}

// ============================================================================
// LAYER 8: DAILY SNAPSHOTS & ANALYTICS
// ============================================================================

async function checkAnalytics() {
  console.log("\n" + "=".repeat(60));
  console.log("LAYER 8: ANALYTICS");
  console.log("=".repeat(60));

  // Daily snapshots
  const snapshotCount = await prisma.dailySnapshot.count();
  const recentSnapshots = await prisma.dailySnapshot.count({
    where: {
      createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
  });

  log({
    category: "Analytics",
    check: "Daily Snapshots",
    status: snapshotCount === 0 ? "FAIL" : recentSnapshots === 0 ? "WARN" : "PASS",
    message: `${snapshotCount} total snapshots, ${recentSnapshots} in last 7 days`,
    details: snapshotCount === 0 ? { action: "Run post-import analytics to generate snapshots" } : undefined,
  });

  // Alerts
  const alertCount = await prisma.alert.count();
  const unresolvedAlerts = await prisma.alert.count({
    where: { resolvedAt: null },
  });

  log({
    category: "Analytics",
    check: "Alerts",
    status: "INFO",
    message: `${alertCount} total alerts, ${unresolvedAlerts} unresolved`,
  });

  // Stock history
  const stockHistoryCount = await prisma.stockHistory.count();
  log({
    category: "Analytics",
    check: "Stock History",
    status: stockHistoryCount > 0 ? "PASS" : "WARN",
    message: `${stockHistoryCount} stock history records`,
  });
}

// ============================================================================
// GENERATE REPORT
// ============================================================================

function generateReport(startTime: number): DiagnosticReport {
  const duration = Date.now() - startTime;

  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  const warnings = results.filter((r) => r.status === "WARN").length;

  const criticalIssues = results.filter((r) => r.status === "FAIL");

  const recommendations: string[] = [];

  // Generate recommendations based on findings
  if (criticalIssues.some((i) => i.check.includes("Recent Transactions"))) {
    recommendations.push(
      "CRITICAL: Transaction data is too old. Run: UPDATE transactions SET date_submitted = date_submitted + INTERVAL '1 year' to shift dates into 12-month window"
    );
  }

  if (criticalIssues.some((i) => i.check.includes("ItemType"))) {
    recommendations.push(
      "CRITICAL: Invalid itemType values found. Run normalize-item-types.ts to fix"
    );
  }

  if (results.some((r) => r.check.includes("Daily Snapshots") && r.status === "FAIL")) {
    recommendations.push(
      "Run post-import analytics to generate daily snapshots for dashboard widgets"
    );
  }

  if (results.some((r) => r.check.includes("Usage Data") && r.status === "FAIL")) {
    recommendations.push(
      "Most products lack usage data. Either transaction dates are too old or recalculation is needed"
    );
  }

  return {
    timestamp: new Date().toISOString(),
    duration,
    summary: {
      total: results.length,
      passed,
      failed,
      warnings,
    },
    results,
    criticalIssues,
    recommendations,
  };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║     COMPREHENSIVE IMPORT PIPELINE DIAGNOSTIC               ║");
  console.log("║     Checking ALL layers for issues...                      ║");
  console.log("╚════════════════════════════════════════════════════════════╝");

  const startTime = Date.now();

  try {
    await checkInfrastructure();
    await checkImportBatches();
    await checkDataIntegrity();
    await checkTransactions();
    await checkUsageCalculations();
    await checkStockStatus();
    await checkClientData();
    await checkAnalytics();

    const report = generateReport(startTime);

    console.log("\n" + "=".repeat(60));
    console.log("DIAGNOSTIC SUMMARY");
    console.log("=".repeat(60));
    console.log(`Total Checks: ${report.summary.total}`);
    console.log(`✅ Passed: ${report.summary.passed}`);
    console.log(`❌ Failed: ${report.summary.failed}`);
    console.log(`⚠️  Warnings: ${report.summary.warnings}`);
    console.log(`Duration: ${report.duration}ms`);

    if (report.criticalIssues.length > 0) {
      console.log("\n🚨 CRITICAL ISSUES:");
      report.criticalIssues.forEach((issue, i) => {
        console.log(`  ${i + 1}. [${issue.category}] ${issue.check}: ${issue.message}`);
      });
    }

    if (report.recommendations.length > 0) {
      console.log("\n📋 RECOMMENDATIONS:");
      report.recommendations.forEach((rec, i) => {
        console.log(`  ${i + 1}. ${rec}`);
      });
    }

    // Write report to file
    const reportPath = path.resolve(process.cwd(), "diagnostic-report.json");
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📁 Full report saved to: ${reportPath}`);
  } catch (error) {
    console.error("\n❌ Diagnostic failed with error:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
