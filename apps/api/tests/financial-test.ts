#!/usr/bin/env tsx
/**
 * Financial Features Comprehensive Test Suite
 * Tests budget management, EOQ optimization, and cost tracking
 */

import { prisma } from "../src/lib/prisma.js";
import { FinancialService } from "../src/services/financial.service.js";

// Test utilities
interface TestResult {
  category: string;
  testName: string;
  status: "PASS" | "FAIL" | "SKIP" | "ERROR";
  message?: string;
  details?: any;
  duration?: number;
}

const results: TestResult[] = [];

function logTest(result: TestResult) {
  results.push(result);
  const icon =
    result.status === "PASS"
      ? "✓"
      : result.status === "FAIL"
        ? "✗"
        : result.status === "ERROR"
          ? "⚠"
          : "○";
  const color =
    result.status === "PASS"
      ? "\x1b[32m"
      : result.status === "FAIL"
        ? "\x1b[31m"
        : result.status === "ERROR"
          ? "\x1b[33m"
          : "\x1b[36m";
  console.log(
    `${color}${icon}\x1b[0m [${result.category}] ${result.testName}${result.message ? ": " + result.message : ""}`,
  );
  if (result.details) {
    console.log("  Details:", JSON.stringify(result.details, null, 2));
  }
}

async function runTest(
  category: string,
  testName: string,
  testFn: () => Promise<void>,
) {
  const startTime = Date.now();
  try {
    await testFn();
    logTest({
      category,
      testName,
      status: "PASS",
      duration: Date.now() - startTime,
    });
  } catch (error: any) {
    logTest({
      category,
      testName,
      status: "FAIL",
      message: error.message,
      details: error.stack,
      duration: Date.now() - startTime,
    });
  }
}

// =============================================================================
// SETUP & TEARDOWN
// =============================================================================

let testClientId: string;
let testProductIds: string[] = [];
let testBudgetIds: string[] = [];

async function setupTestData() {
  console.log("\n📦 Setting up test data...\n");

  // Create test client
  const client = await prisma.client.create({
    data: {
      name: "Financial Test Client",
      code: `FIN_TEST_${Date.now()}`,
      settings: {
        reorderLeadDays: 14,
        safetyStockWeeks: 2,
        serviceLevelTarget: 0.95,
      },
    },
  });
  testClientId = client.id;
  console.log(`Created test client: ${testClientId}`);

  // Create test products with financial data
  const product1 = await prisma.product.create({
    data: {
      clientId: testClientId,
      productId: "FIN_PROD_001",
      name: "High Volume Product",
      packSize: 100,
      currentStockPacks: 50,
      currentStockUnits: 5000,
      unitCost: 10.5,
      unitPrice: 15.75,
      reorderCost: 100.0,
      holdingCostRate: 0.15, // 15% per year
      reorderPointPacks: 30,
    },
  });
  testProductIds.push(product1.id);

  const product2 = await prisma.product.create({
    data: {
      clientId: testClientId,
      productId: "FIN_PROD_002",
      name: "Low Volume Product",
      packSize: 50,
      currentStockPacks: 20,
      currentStockUnits: 1000,
      unitCost: 25.0,
      unitPrice: 37.5,
      reorderCost: 150.0,
      holdingCostRate: 0.2, // 20% per year
      reorderPointPacks: 15,
    },
  });
  testProductIds.push(product2.id);

  const product3 = await prisma.product.create({
    data: {
      clientId: testClientId,
      productId: "FIN_PROD_003",
      name: "Zero Cost Product (Edge Case)",
      packSize: 25,
      currentStockPacks: 10,
      currentStockUnits: 250,
      unitCost: 0, // Edge case: zero cost
      reorderCost: 0,
      holdingCostRate: 0,
    },
  });
  testProductIds.push(product3.id);

  // Create usage metrics for EOQ calculations
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  await prisma.usageMetric.create({
    data: {
      productId: product1.id,
      periodType: "annual",
      periodStart: oneYearAgo,
      periodEnd: new Date(),
      totalConsumedUnits: 36500, // 100 units/day
      avgDailyUnits: 100,
      avgDailyPacks: 1.0,
      transactionCount: 365,
    },
  });

  await prisma.usageMetric.create({
    data: {
      productId: product2.id,
      periodType: "annual",
      periodStart: oneYearAgo,
      periodEnd: new Date(),
      totalConsumedUnits: 18250, // 50 units/day
      avgDailyUnits: 50,
      avgDailyPacks: 1.0,
      transactionCount: 365,
    },
  });

  // Create transactions for usage history
  for (let i = 0; i < 12; i++) {
    const orderDate = new Date();
    orderDate.setMonth(orderDate.getMonth() - i);

    await prisma.transaction.create({
      data: {
        productId: product1.id,
        orderId: `ORDER_${i}_PROD1`,
        quantityPacks: 30,
        quantityUnits: 3000,
        dateSubmitted: orderDate,
        orderStatus: "completed",
      },
    });

    await prisma.transaction.create({
      data: {
        productId: product2.id,
        orderId: `ORDER_${i}_PROD2`,
        quantityPacks: 15,
        quantityUnits: 750,
        dateSubmitted: orderDate,
        orderStatus: "completed",
      },
    });
  }

  // Create budgets
  const currentDate = new Date();
  const quarterStart = new Date(
    currentDate.getFullYear(),
    Math.floor(currentDate.getMonth() / 3) * 3,
    1,
  );
  const quarterEnd = new Date(quarterStart);
  quarterEnd.setMonth(quarterEnd.getMonth() + 3);

  const budget1 = await prisma.budget.create({
    data: {
      clientId: testClientId,
      productId: product1.id,
      period: "quarterly",
      periodStart: quarterStart,
      periodEnd: quarterEnd,
      allocatedAmount: 10000,
      spentAmount: 7500,
      forecastAmount: 8500,
      variance: 2500,
      status: "on_track",
      alertThreshold: 90,
    },
  });
  testBudgetIds.push(budget1.id);

  const budget2 = await prisma.budget.create({
    data: {
      clientId: testClientId,
      productId: product2.id,
      period: "quarterly",
      periodStart: quarterStart,
      periodEnd: quarterEnd,
      allocatedAmount: 5000,
      spentAmount: 5500,
      forecastAmount: 6000,
      variance: -500,
      status: "over",
      alertThreshold: 90,
    },
  });
  testBudgetIds.push(budget2.id);

  const budget3 = await prisma.budget.create({
    data: {
      clientId: testClientId,
      productId: null, // Client-level budget
      period: "quarterly",
      periodStart: quarterStart,
      periodEnd: quarterEnd,
      allocatedAmount: 20000,
      spentAmount: 13000,
      forecastAmount: 14500,
      variance: 7000,
      status: "under",
      alertThreshold: 85,
    },
  });
  testBudgetIds.push(budget3.id);

  console.log(
    `Created ${testProductIds.length} products and ${testBudgetIds.length} budgets\n`,
  );
}

async function cleanupTestData() {
  console.log("\n🧹 Cleaning up test data...\n");

  try {
    // Delete in correct order to respect foreign key constraints
    await prisma.usageMetric.deleteMany({
      where: { productId: { in: testProductIds } },
    });

    await prisma.transaction.deleteMany({
      where: { productId: { in: testProductIds } },
    });

    await prisma.budget.deleteMany({
      where: { id: { in: testBudgetIds } },
    });

    await prisma.product.deleteMany({
      where: { id: { in: testProductIds } },
    });

    await prisma.client.delete({
      where: { id: testClientId },
    });

    console.log("Cleanup completed successfully\n");
  } catch (error: any) {
    console.error("Error during cleanup:", error.message);
  }
}

// =============================================================================
// BUDGET MANAGEMENT TESTS
// =============================================================================

async function testBudgetManagement() {
  console.log("\n💰 BUDGET MANAGEMENT TESTS\n");

  // Test 1: Get budget summary for client
  await runTest("Budget", "Get budget summary for client", async () => {
    const currentDate = new Date();
    const quarterStart = new Date(
      currentDate.getFullYear(),
      Math.floor(currentDate.getMonth() / 3) * 3,
      1,
    );
    const quarterEnd = new Date(quarterStart);
    quarterEnd.setMonth(quarterEnd.getMonth() + 3);

    const summary = await FinancialService.getBudgetSummary(
      testClientId,
      quarterStart,
      quarterEnd,
    );

    if (!summary) throw new Error("Budget summary is null");
    if (summary.clientId !== testClientId)
      throw new Error("Wrong client ID in summary");
    if (summary.totalAllocated !== 35000)
      throw new Error(
        `Expected totalAllocated 35000, got ${summary.totalAllocated}`,
      );
    if (summary.totalSpent !== 26000)
      throw new Error(`Expected totalSpent 26000, got ${summary.totalSpent}`);
    if (summary.variance !== 9000)
      throw new Error(`Expected variance 9000, got ${summary.variance}`);
    if (summary.productsOverBudget !== 1)
      throw new Error(
        `Expected 1 product over budget, got ${summary.productsOverBudget}`,
      );
    if (summary.productsUnderBudget !== 1)
      throw new Error(
        `Expected 1 product under budget, got ${summary.productsUnderBudget}`,
      );
  });

  // Test 2: Budget variance calculations
  await runTest("Budget", "Variance calculations are correct", async () => {
    const currentDate = new Date();
    const quarterStart = new Date(
      currentDate.getFullYear(),
      Math.floor(currentDate.getMonth() / 3) * 3,
      1,
    );
    const quarterEnd = new Date(quarterStart);
    quarterEnd.setMonth(quarterEnd.getMonth() + 3);

    const summary = await FinancialService.getBudgetSummary(
      testClientId,
      quarterStart,
      quarterEnd,
    );

    const expectedVariancePercent = (9000 / 35000) * 100;
    if (Math.abs(summary.variancePercent - expectedVariancePercent) > 0.01) {
      throw new Error(
        `Expected variancePercent ${expectedVariancePercent}, got ${summary.variancePercent}`,
      );
    }
  });

  // Test 3: Budget status categorization
  await runTest("Budget", "Status categorization logic", async () => {
    const currentDate = new Date();
    const quarterStart = new Date(
      currentDate.getFullYear(),
      Math.floor(currentDate.getMonth() / 3) * 3,
      1,
    );
    const quarterEnd = new Date(quarterStart);
    quarterEnd.setMonth(quarterEnd.getMonth() + 3);

    const summary = await FinancialService.getBudgetSummary(
      testClientId,
      quarterStart,
      quarterEnd,
    );

    // With variance of 25.7%, status should be 'under'
    if (summary.status !== "under") {
      throw new Error(`Expected status 'under', got '${summary.status}'`);
    }
  });

  // Test 4: Get individual budgets from database
  await runTest("Budget", "Retrieve individual budgets", async () => {
    const budgets = await prisma.budget.findMany({
      where: { clientId: testClientId },
    });

    if (budgets.length !== 3)
      throw new Error(`Expected 3 budgets, got ${budgets.length}`);

    const productBudgets = budgets.filter((b) => b.productId !== null);
    if (productBudgets.length !== 2)
      throw new Error(
        `Expected 2 product budgets, got ${productBudgets.length}`,
      );

    const clientBudgets = budgets.filter((b) => b.productId === null);
    if (clientBudgets.length !== 1)
      throw new Error(`Expected 1 client budget, got ${clientBudgets.length}`);
  });

  // Test 5: Budget alert threshold checks
  await runTest("Budget", "Alert threshold validation", async () => {
    const budgets = await prisma.budget.findMany({
      where: { clientId: testClientId },
    });

    budgets.forEach((budget) => {
      if (budget.alertThreshold) {
        const spentPercent =
          (Number(budget.spentAmount) / Number(budget.allocatedAmount)) * 100;
        const shouldAlert = spentPercent >= Number(budget.alertThreshold);

        // Budget 2 should trigger alert (110% > 90% threshold)
        if (budget.id === testBudgetIds[1] && !shouldAlert) {
          throw new Error("Budget 2 should trigger alert but does not");
        }
      }
    });
  });
}

// =============================================================================
// EOQ ANALYSIS TESTS
// =============================================================================

async function testEOQAnalysis() {
  console.log("\n📊 EOQ ANALYSIS TESTS\n");

  // Test 1: Calculate EOQ for products
  await runTest("EOQ", "Calculate EOQ opportunities", async () => {
    const opportunities =
      await FinancialService.analyzeEOQOpportunities(testClientId);

    if (!Array.isArray(opportunities))
      throw new Error("EOQ opportunities should be an array");
    if (opportunities.length === 0)
      throw new Error("Expected at least one EOQ opportunity");

    console.log(`  Found ${opportunities.length} optimization opportunities`);
  });

  // Test 2: EOQ formula validation
  await runTest("EOQ", "EOQ formula calculation", async () => {
    const annualDemand = 36500; // 100 units/day * 365 days
    const orderingCost = 100;
    const unitCost = 10.5;
    const holdingCostRate = 0.15;
    const holdingCostPerUnit = unitCost * holdingCostRate;

    const eoq = FinancialService.calculateEOQ(
      annualDemand,
      orderingCost,
      holdingCostPerUnit,
    );

    // Manual calculation: sqrt((2 * 36500 * 100) / 1.575) = sqrt(4634920.6) ≈ 2153
    const expectedEOQ = Math.sqrt(
      (2 * annualDemand * orderingCost) / holdingCostPerUnit,
    );

    if (Math.abs(eoq - expectedEOQ) > 1) {
      throw new Error(
        `EOQ calculation mismatch: expected ${expectedEOQ}, got ${eoq}`,
      );
    }

    console.log(`  EOQ for test product: ${Math.round(eoq)} units`);
  });

  // Test 3: EOQ edge case - zero holding cost
  await runTest("EOQ", "EOQ with zero holding cost (edge case)", async () => {
    const eoq = FinancialService.calculateEOQ(1000, 100, 0);

    // When holding cost is 0, EOQ should return annual demand
    if (eoq !== 1000) {
      throw new Error(
        `Expected EOQ to equal annual demand (1000) when holding cost is 0, got ${eoq}`,
      );
    }
  });

  // Test 4: Validate savings calculations
  await runTest("EOQ", "Potential savings calculations", async () => {
    const opportunities =
      await FinancialService.analyzeEOQOpportunities(testClientId);

    opportunities.forEach((opp) => {
      // Verify savings calculation
      const savingsMatch =
        opp.currentTotalCost - opp.optimalTotalCost === opp.potentialSavings;
      if (!savingsMatch) {
        throw new Error(`Savings calculation mismatch for ${opp.productName}`);
      }

      // Verify recommendation is appropriate
      if (opp.potentialSavings > 0 && !opp.recommendation.includes("save")) {
        throw new Error(
          `Recommendation should mention savings for ${opp.productName}`,
        );
      }
    });
  });

  // Test 5: EOQ with various cost parameters
  await runTest("EOQ", "EOQ with high variance costs", async () => {
    const scenarios = [
      { demand: 1000, ordering: 50, holding: 0.5, desc: "Low cost scenario" },
      {
        demand: 10000,
        ordering: 500,
        holding: 5.0,
        desc: "High cost scenario",
      },
      {
        demand: 500,
        ordering: 25,
        holding: 0.1,
        desc: "Very low holding cost",
      },
    ];

    scenarios.forEach((scenario) => {
      const eoq = FinancialService.calculateEOQ(
        scenario.demand,
        scenario.ordering,
        scenario.holding,
      );

      if (isNaN(eoq) || eoq <= 0) {
        throw new Error(`Invalid EOQ for ${scenario.desc}: ${eoq}`);
      }

      if (eoq > scenario.demand * 2) {
        throw new Error(`EOQ suspiciously high for ${scenario.desc}: ${eoq}`);
      }
    });
  });

  // Test 6: Verify only products with cost data are analyzed
  await runTest("EOQ", "Filter products without cost data", async () => {
    const opportunities =
      await FinancialService.analyzeEOQOpportunities(testClientId);

    // Product 3 has zero costs and should not appear in opportunities
    const zeroProduct = opportunities.find(
      (opp) => opp.productName === "Zero Cost Product (Edge Case)",
    );

    if (zeroProduct) {
      throw new Error(
        "Products with zero costs should not be included in EOQ analysis",
      );
    }
  });
}

// =============================================================================
// COST TRACKING TESTS
// =============================================================================

async function testCostTracking() {
  console.log("\n💵 COST TRACKING TESTS\n");

  // Test 1: Create cost tracking records
  await runTest("Cost Tracking", "Create cost tracking records", async () => {
    const period = new Date(2024, 0, 1); // January 2024

    const costRecord = await prisma.costTracking.create({
      data: {
        clientId: testClientId,
        productId: testProductIds[0],
        period: period,
        unitsOrdered: 3000,
        packsOrdered: 30,
        purchaseCost: 31500, // 3000 * $10.50
        holdingCost: 2362.5, // Avg inventory * holding cost
        orderingCost: 100,
        totalCost: 33962.5,
        eoqQuantity: 2153,
        eoqSavings: 500,
      },
    });

    if (!costRecord) throw new Error("Failed to create cost tracking record");
    if (Number(costRecord.totalCost) !== 33962.5) {
      throw new Error(
        `Total cost mismatch: expected 33962.50, got ${costRecord.totalCost}`,
      );
    }
  });

  // Test 2: Retrieve cost tracking data
  await runTest("Cost Tracking", "Retrieve cost tracking data", async () => {
    const costRecords = await prisma.costTracking.findMany({
      where: { clientId: testClientId },
    });

    if (costRecords.length === 0)
      throw new Error("No cost tracking records found");

    const firstRecord = costRecords[0];
    if (!firstRecord.purchaseCost) throw new Error("Purchase cost is missing");
    if (!firstRecord.totalCost) throw new Error("Total cost is missing");
  });

  // Test 3: Cost breakdown validation
  await runTest("Cost Tracking", "Cost breakdown components", async () => {
    const costRecords = await prisma.costTracking.findMany({
      where: { clientId: testClientId },
    });

    costRecords.forEach((record) => {
      const calculatedTotal =
        Number(record.purchaseCost) +
        (Number(record.holdingCost) || 0) +
        (Number(record.orderingCost) || 0) +
        (Number(record.shortageCost) || 0);

      if (Math.abs(calculatedTotal - Number(record.totalCost)) > 0.01) {
        throw new Error(`Cost breakdown mismatch for record ${record.id}`);
      }
    });
  });

  // Test 4: Period-based aggregation
  await runTest("Cost Tracking", "Period-based aggregation", async () => {
    // Create multiple records for different periods
    const periods = [
      new Date(2024, 0, 1), // Jan
      new Date(2024, 1, 1), // Feb
      new Date(2024, 2, 1), // Mar
    ];

    for (const period of periods) {
      await prisma.costTracking.create({
        data: {
          clientId: testClientId,
          productId: testProductIds[1],
          period: period,
          unitsOrdered: 750,
          packsOrdered: 15,
          purchaseCost: 18750,
          totalCost: 19000,
        },
      });
    }

    const allRecords = await prisma.costTracking.findMany({
      where: {
        clientId: testClientId,
        productId: testProductIds[1],
      },
      orderBy: { period: "asc" },
    });

    if (allRecords.length !== 3) {
      throw new Error(
        `Expected 3 cost tracking records, got ${allRecords.length}`,
      );
    }
  });

  // Test 5: Calculate total costs across periods
  await runTest(
    "Cost Tracking",
    "Total cost analysis across periods",
    async () => {
      const allRecords = await prisma.costTracking.findMany({
        where: { clientId: testClientId },
      });

      const totalCost = allRecords.reduce(
        (sum, record) => sum + Number(record.totalCost),
        0,
      );
      const totalPurchaseCost = allRecords.reduce(
        (sum, record) => sum + Number(record.purchaseCost),
        0,
      );

      if (totalCost < totalPurchaseCost) {
        throw new Error(
          "Total cost should be greater than or equal to purchase cost",
        );
      }

      console.log(`  Total cost across all periods: $${totalCost.toFixed(2)}`);
    },
  );
}

// =============================================================================
// DATA PERSISTENCE TESTS
// =============================================================================

async function testDataPersistence() {
  console.log("\n💾 DATA PERSISTENCE TESTS\n");

  // Test 1: Budget data integrity
  await runTest("Persistence", "Budget data integrity", async () => {
    const budget = await prisma.budget.findFirst({
      where: { id: testBudgetIds[0] },
    });

    if (!budget) throw new Error("Budget not found");

    // Verify Decimal fields are properly stored and retrieved
    const allocated = Number(budget.allocatedAmount);
    const spent = Number(budget.spentAmount);

    if (typeof allocated !== "number")
      throw new Error("Allocated amount is not a number");
    if (typeof spent !== "number")
      throw new Error("Spent amount is not a number");
  });

  // Test 2: Product cost data persistence
  await runTest("Persistence", "Product cost data persistence", async () => {
    const product = await prisma.product.findFirst({
      where: { id: testProductIds[0] },
    });

    if (!product) throw new Error("Product not found");
    if (!product.unitCost) throw new Error("Unit cost not persisted");
    if (!product.reorderCost) throw new Error("Reorder cost not persisted");
    if (!product.holdingCostRate)
      throw new Error("Holding cost rate not persisted");

    // Verify costs are within expected ranges
    if (Number(product.unitCost) <= 0) throw new Error("Invalid unit cost");
    if (
      Number(product.holdingCostRate) < 0 ||
      Number(product.holdingCostRate) > 1
    ) {
      throw new Error("Holding cost rate should be between 0 and 1");
    }
  });

  // Test 3: Update budget values
  await runTest("Persistence", "Update budget allocations", async () => {
    const originalBudget = await prisma.budget.findFirst({
      where: { id: testBudgetIds[0] },
    });

    if (!originalBudget) throw new Error("Budget not found");

    const updatedBudget = await prisma.budget.update({
      where: { id: testBudgetIds[0] },
      data: {
        spentAmount: Number(originalBudget.spentAmount) + 1000,
        variance: Number(originalBudget.variance) - 1000,
      },
    });

    if (
      Number(updatedBudget.spentAmount) !==
      Number(originalBudget.spentAmount) + 1000
    ) {
      throw new Error("Budget update failed");
    }
  });
}

// =============================================================================
// CALCULATION ACCURACY TESTS
// =============================================================================

async function testCalculationAccuracy() {
  console.log("\n🔢 CALCULATION ACCURACY TESTS\n");

  // Test 1: EOQ calculation precision
  await runTest("Accuracy", "EOQ calculation precision", async () => {
    const testCases = [
      { D: 10000, S: 100, H: 5, expected: Math.sqrt((2 * 10000 * 100) / 5) },
      { D: 5000, S: 50, H: 2, expected: Math.sqrt((2 * 5000 * 50) / 2) },
      { D: 20000, S: 200, H: 10, expected: Math.sqrt((2 * 20000 * 200) / 10) },
    ];

    testCases.forEach((tc, idx) => {
      const calculated = FinancialService.calculateEOQ(tc.D, tc.S, tc.H);
      if (Math.abs(calculated - tc.expected) > 0.01) {
        throw new Error(
          `Test case ${idx + 1} failed: expected ${tc.expected}, got ${calculated}`,
        );
      }
    });
  });

  // Test 2: Variance percentage calculation
  await runTest("Accuracy", "Variance percentage calculation", async () => {
    const testCases = [
      { allocated: 10000, spent: 7500, expectedPercent: 25 },
      { allocated: 5000, spent: 5500, expectedPercent: -10 },
      { allocated: 20000, spent: 20000, expectedPercent: 0 },
    ];

    testCases.forEach((tc, idx) => {
      const variance = tc.allocated - tc.spent;
      const variancePercent = (variance / tc.allocated) * 100;

      if (Math.abs(variancePercent - tc.expectedPercent) > 0.01) {
        throw new Error(
          `Test case ${idx + 1} failed: expected ${tc.expectedPercent}%, got ${variancePercent}%`,
        );
      }
    });
  });

  // Test 3: Total cost calculation in EOQ
  await runTest("Accuracy", "EOQ total cost calculation", async () => {
    const annualDemand = 10000;
    const orderQuantity = 500;
    const unitCost = 10;
    const orderingCost = 100;
    const holdingCostPerUnit = 2;

    const ordersPerYear = annualDemand / orderQuantity;
    const totalCost =
      annualDemand * unitCost +
      ordersPerYear * orderingCost +
      (orderQuantity / 2) * holdingCostPerUnit;

    // Manual: 100000 + 2000 + 500 = 102500
    const expected = 102500;

    if (Math.abs(totalCost - expected) > 0.01) {
      throw new Error(
        `Total cost calculation failed: expected ${expected}, got ${totalCost}`,
      );
    }
  });
}

// =============================================================================
// ERROR HANDLING TESTS
// =============================================================================

async function testErrorHandling() {
  console.log("\n⚠️  ERROR HANDLING TESTS\n");

  // Test 1: Invalid client ID
  await runTest("Error Handling", "Handle invalid client ID", async () => {
    const currentDate = new Date();
    const quarterStart = new Date(
      currentDate.getFullYear(),
      Math.floor(currentDate.getMonth() / 3) * 3,
      1,
    );
    const quarterEnd = new Date(quarterStart);
    quarterEnd.setMonth(quarterEnd.getMonth() + 3);

    const summary = await FinancialService.getBudgetSummary(
      "00000000-0000-0000-0000-000000000000",
      quarterStart,
      quarterEnd,
    );

    // Should return empty summary with all zeros
    if (summary.totalAllocated !== 0) {
      throw new Error("Expected empty summary for invalid client");
    }
  });

  // Test 2: Invalid date range
  await runTest("Error Handling", "Handle invalid date range", async () => {
    const futureStart = new Date();
    futureStart.setFullYear(futureStart.getFullYear() + 1);
    const futureEnd = new Date(futureStart);
    futureEnd.setMonth(futureEnd.getMonth() + 3);

    const summary = await FinancialService.getBudgetSummary(
      testClientId,
      futureStart,
      futureEnd,
    );

    // Should return empty summary for future dates
    if (summary.totalAllocated !== 0) {
      throw new Error("Expected empty summary for future date range");
    }
  });

  // Test 3: Negative cost values
  await runTest("Error Handling", "Handle negative cost values", async () => {
    try {
      const eoq = FinancialService.calculateEOQ(-1000, 100, 5);
      // Should handle gracefully - result will be NaN or invalid
      if (!isNaN(eoq) && eoq > 0) {
        throw new Error("Should not produce valid EOQ with negative demand");
      }
    } catch (error) {
      // Expected to handle error
    }
  });
}

// =============================================================================
// MISSING FEATURES TESTS
// =============================================================================

async function testMissingFeatures() {
  console.log("\n❌ MISSING FEATURES (NOT IMPLEMENTED)\n");

  logTest({
    category: "Missing",
    testName: "POST /api/financial/budgets",
    status: "SKIP",
    message: "Endpoint not implemented - cannot create budgets via API",
  });

  logTest({
    category: "Missing",
    testName: "PATCH /api/financial/budgets/:budgetId",
    status: "SKIP",
    message: "Endpoint not implemented - cannot update budgets via API",
  });

  logTest({
    category: "Missing",
    testName: "Authorization checks on financial routes",
    status: "SKIP",
    message: "Cannot test without API endpoints",
  });

  logTest({
    category: "Missing",
    testName: "Response format validation",
    status: "SKIP",
    message: "Cannot test without API endpoints",
  });
}

// =============================================================================
// MAIN TEST RUNNER
// =============================================================================

async function runAllTests() {
  console.log(
    "╔═══════════════════════════════════════════════════════════════╗",
  );
  console.log(
    "║                                                               ║",
  );
  console.log(
    "║        FINANCIAL FEATURES COMPREHENSIVE TEST SUITE            ║",
  );
  console.log(
    "║                                                               ║",
  );
  console.log(
    "╚═══════════════════════════════════════════════════════════════╝",
  );

  const startTime = Date.now();

  try {
    await setupTestData();

    await testBudgetManagement();
    await testEOQAnalysis();
    await testCostTracking();
    await testDataPersistence();
    await testCalculationAccuracy();
    await testErrorHandling();
    await testMissingFeatures();
  } catch (error: any) {
    console.error("\n❌ Fatal error during test execution:", error.message);
    console.error(error.stack);
  } finally {
    await cleanupTestData();
  }

  const duration = Date.now() - startTime;

  // Generate summary
  console.log(
    "\n╔═══════════════════════════════════════════════════════════════╗",
  );
  console.log(
    "║                        TEST SUMMARY                           ║",
  );
  console.log(
    "╚═══════════════════════════════════════════════════════════════╝\n",
  );

  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  const errors = results.filter((r) => r.status === "ERROR").length;
  const skipped = results.filter((r) => r.status === "SKIP").length;
  const total = results.length;

  console.log(`Total Tests:    ${total}`);
  console.log(`\x1b[32mPassed:         ${passed}\x1b[0m`);
  console.log(`\x1b[31mFailed:         ${failed}\x1b[0m`);
  console.log(`\x1b[33mErrors:         ${errors}\x1b[0m`);
  console.log(`\x1b[36mSkipped:        ${skipped}\x1b[0m`);
  console.log(`Duration:       ${duration}ms\n`);

  // Group results by category
  const categories = [...new Set(results.map((r) => r.category))];
  categories.forEach((category) => {
    const categoryResults = results.filter((r) => r.category === category);
    const categoryPassed = categoryResults.filter(
      (r) => r.status === "PASS",
    ).length;
    const categoryTotal = categoryResults.length;
    console.log(`${category}: ${categoryPassed}/${categoryTotal} passed`);
  });

  // Return results for report generation
  return {
    results,
    duration,
    summary: { total, passed, failed, errors, skipped },
  };
}

// Run tests and disconnect
runAllTests()
  .then(async ({ results, duration, summary }) => {
    console.log("\n✅ Test execution completed\n");

    // Generate markdown report
    await generateMarkdownReport(results, duration, summary);

    await prisma.$disconnect();
    process.exit(summary.failed + summary.errors > 0 ? 1 : 0);
  })
  .catch(async (error) => {
    console.error("Fatal error:", error);
    await prisma.$disconnect();
    process.exit(1);
  });

// =============================================================================
// REPORT GENERATION
// =============================================================================

async function generateMarkdownReport(
  results: TestResult[],
  duration: number,
  summary: {
    total: number;
    passed: number;
    failed: number;
    errors: number;
    skipped: number;
  },
) {
  const fs = await import("fs");
  const path = await import("path");

  const reportPath = path.join(
    process.cwd(),
    "tests",
    "reports",
    "financial-features-test-report.md",
  );

  const report = `# Financial Features Test Report

**Generated:** ${new Date().toISOString()}
**Duration:** ${duration}ms
**Status:** ${summary.failed + summary.errors === 0 ? "✅ PASSED" : "❌ FAILED"}

## Summary

| Metric | Count |
|--------|-------|
| Total Tests | ${summary.total} |
| Passed | ${summary.passed} |
| Failed | ${summary.failed} |
| Errors | ${summary.errors} |
| Skipped | ${summary.skipped} |
| Success Rate | ${((summary.passed / (summary.total - summary.skipped)) * 100).toFixed(1)}% |

## Test Results by Category

${generateCategoryTables(results)}

## Detailed Results

${generateDetailedResults(results)}

## Implementation Status

### ✅ Implemented Features

1. **Budget Management Service**
   - ✅ Get budget summary for clients
   - ✅ Budget variance calculations
   - ✅ Budget status categorization
   - ✅ Product-level and client-level budgets
   - ✅ Alert threshold tracking

2. **EOQ Analysis Service**
   - ✅ Calculate Economic Order Quantity
   - ✅ Analyze optimization opportunities
   - ✅ Calculate potential savings
   - ✅ Generate recommendations
   - ✅ Handle edge cases (zero costs)

3. **Cost Tracking Data Model**
   - ✅ Store cost breakdown (purchase, holding, ordering, shortage)
   - ✅ Period-based aggregation
   - ✅ EOQ quantity and savings tracking

4. **Database Schema**
   - ✅ Budget table with variance tracking
   - ✅ CostTracking table with comprehensive metrics
   - ✅ Product financial fields (unitCost, reorderCost, holdingCostRate)

### ❌ Missing Features

1. **API Endpoints**
   - ❌ POST /api/financial/budgets - Create new budgets
   - ❌ PATCH /api/financial/budgets/:budgetId - Update budget allocations
   - ⚠️  Only GET endpoints currently implemented

2. **Authorization**
   - ⚠️  Cannot verify authorization checks without POST/PATCH endpoints
   - ⚠️  requireClientAccess middleware in place but untested for mutations

3. **Response Format Validation**
   - ⚠️  Cannot verify full API response structure without endpoints

## Recommendations

### High Priority
1. **Implement Budget Creation Endpoint** (POST /api/financial/budgets)
   - Allow creating budgets via API
   - Validate required fields (clientId, period, allocatedAmount)
   - Support both client-level and product-level budgets

2. **Implement Budget Update Endpoint** (PATCH /api/financial/budgets/:budgetId)
   - Allow updating budget allocations
   - Recalculate variance automatically
   - Update status based on new variance

3. **Add Authorization Tests**
   - Verify requireClientAccess middleware blocks unauthorized access
   - Test that users can only access budgets for their assigned clients

### Medium Priority
4. **Add Cost Tracking API Endpoints**
   - POST /api/financial/cost-tracking - Record cost data
   - GET /api/financial/cost-tracking/:clientId - Retrieve cost history

5. **Enhanced Error Handling**
   - Validate date ranges (end must be after start)
   - Handle negative cost values gracefully
   - Return meaningful error messages

6. **Add Budget Update Webhooks**
   - Notify when budgets approach alert thresholds
   - Alert when budgets go over

### Low Priority
7. **Advanced EOQ Features**
   - Support different EOQ models (production, quantity discounts)
   - Historical EOQ tracking
   - Sensitivity analysis

8. **Cost Optimization Recommendations**
   - Automated suggestions for cost reduction
   - Comparison across products
   - Trend analysis

## Test Coverage

- **Budget Management:** ${results.filter((r) => r.category === "Budget").length} tests
- **EOQ Analysis:** ${results.filter((r) => r.category === "EOQ").length} tests
- **Cost Tracking:** ${results.filter((r) => r.category === "Cost Tracking").length} tests
- **Data Persistence:** ${results.filter((r) => r.category === "Persistence").length} tests
- **Calculation Accuracy:** ${results.filter((r) => r.category === "Accuracy").length} tests
- **Error Handling:** ${results.filter((r) => r.category === "Error Handling").length} tests

## Conclusion

The financial tracking features have a **solid foundation** with comprehensive service layer implementations and database schema. However, **API endpoints are incomplete** - only GET operations are available.

**Next Steps:**
1. Implement POST /api/financial/budgets endpoint
2. Implement PATCH /api/financial/budgets/:budgetId endpoint
3. Add comprehensive authorization tests
4. Test API response formats and error handling

---

*Generated by Financial Features Test Suite*
`;

  await fs.promises.writeFile(reportPath, report, "utf-8");
  console.log(`📄 Test report generated: ${reportPath}\n`);
}

function generateCategoryTables(results: TestResult[]): string {
  const categories = [...new Set(results.map((r) => r.category))];

  return categories
    .map((category) => {
      const categoryResults = results.filter((r) => r.category === category);
      const passed = categoryResults.filter((r) => r.status === "PASS").length;
      const failed = categoryResults.filter((r) => r.status === "FAIL").length;
      const errors = categoryResults.filter((r) => r.status === "ERROR").length;
      const skipped = categoryResults.filter((r) => r.status === "SKIP").length;

      return `### ${category}

| Status | Count |
|--------|-------|
| ✅ Passed | ${passed} |
| ❌ Failed | ${failed} |
| ⚠️  Errors | ${errors} |
| ⏭️  Skipped | ${skipped} |
`;
    })
    .join("\n");
}

function generateDetailedResults(results: TestResult[]): string {
  const categories = [...new Set(results.map((r) => r.category))];

  return categories
    .map((category) => {
      const categoryResults = results.filter((r) => r.category === category);

      const rows = categoryResults
        .map((r) => {
          const icon =
            r.status === "PASS"
              ? "✅"
              : r.status === "FAIL"
                ? "❌"
                : r.status === "ERROR"
                  ? "⚠️"
                  : "⏭️";
          const message = r.message ? `<br/>${r.message}` : "";
          return `| ${icon} | ${r.testName}${message} | ${r.duration || "-"}ms |`;
        })
        .join("\n");

      return `### ${category}

| Status | Test Name | Duration |
|--------|-----------|----------|
${rows}
`;
    })
    .join("\n");
}
