#!/usr/bin/env tsx
// =============================================================================
// SHIPMENT TRACKING & ORDER TIMING TEST RUNNER
// Executes comprehensive tests and generates detailed report
// =============================================================================

import { prisma } from "../src/lib/prisma.js";
import * as ShipmentService from "../src/services/shipment.service.js";
import * as OrderTimingService from "../src/services/order-timing.service.js";
import * as fs from "fs";
import * as path from "path";

// =============================================================================
// TEST DATA SETUP
// =============================================================================

let testClientId: string;
let testClient2Id: string;
let testProductId: string;
let testProduct2Id: string;
let testOrderRequestId: string;
let testShipmentId: string;
let testPortalUserId: string;

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
  details?: any;
}

interface TestSuiteResult {
  name: string;
  tests: TestResult[];
  totalTests: number;
  passedTests: number;
  failedTests: number;
  duration: number;
}

const allResults: TestSuiteResult[] = [];

async function setupTestData() {
  console.log("⚙️  Setting up test data...");

  // Create test clients
  const client1 = await prisma.client.create({
    data: {
      name: "Test Client 1 - Shipment Tests",
      code: `SHIPTEST1-${Date.now()}`,
      settings: {
        orderTiming: {
          defaultSupplierLeadDays: 7,
          defaultShippingDays: 5,
          defaultProcessingDays: 1,
          defaultSafetyBufferDays: 2,
          alertDaysBeforeDeadline: [14, 7, 3, 1],
        },
      },
    },
  });
  testClientId = client1.id;

  const client2 = await prisma.client.create({
    data: {
      name: "Test Client 2 - Isolation Tests",
      code: `SHIPTEST2-${Date.now()}`,
    },
  });
  testClient2Id = client2.id;

  // Create test portal user for client 1
  const portalUser = await prisma.portalUser.create({
    data: {
      email: `portal-${Date.now()}@test.com`,
      passwordHash: "test",
      name: "Portal Test User",
      clientId: testClientId,
    },
  });
  testPortalUserId = portalUser.id;

  // Create test products
  const product1 = await prisma.product.create({
    data: {
      clientId: testClientId,
      productId: "SHIP-TEST-001",
      name: "High Usage Product",
      packSize: 100,
      currentStockPacks: 50,
      currentStockUnits: 5000,
      avgDailyUsage: 150,
      reorderPointPacks: 20,
      supplierLeadDays: 10,
      shippingLeadDays: 3,
      processingLeadDays: 2,
      safetyBufferDays: 5,
      totalLeadDays: 20,
      leadTimeSource: "override",
    },
  });
  testProductId = product1.id;

  const product2 = await prisma.product.create({
    data: {
      clientId: testClientId,
      productId: "SHIP-TEST-002",
      name: "Low Usage Product",
      packSize: 50,
      currentStockPacks: 100,
      currentStockUnits: 5000,
      avgDailyUsage: 25,
      reorderPointPacks: 30,
    },
  });
  testProduct2Id = product2.id;

  await prisma.product.create({
    data: {
      clientId: testClient2Id,
      productId: "SHIP-TEST-003",
      name: "Client 2 Product",
      packSize: 10,
      currentStockPacks: 10,
      currentStockUnits: 100,
      avgDailyUsage: 5,
    },
  });

  const orderRequest = await prisma.orderRequest.create({
    data: {
      clientId: testClientId,
      requestedById: testPortalUserId,
      status: "fulfilled",
      deliveryDeadline: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    },
  });
  testOrderRequestId = orderRequest.id;

  await prisma.orderRequestItem.createMany({
    data: [
      {
        orderRequestId: testOrderRequestId,
        productId: testProductId,
        quantityPacks: 10,
        quantityUnits: 1000,
      },
      {
        orderRequestId: testOrderRequestId,
        productId: testProduct2Id,
        quantityPacks: 5,
        quantityUnits: 250,
      },
    ],
  });

  console.log("✅ Test data setup complete");
}

async function cleanupTestData() {
  console.log("🧹 Cleaning up test data...");

  await prisma.shipmentEvent.deleteMany({
    where: { shipment: { clientId: { in: [testClientId, testClient2Id] } } },
  });
  await prisma.shipmentItem.deleteMany({
    where: { shipment: { clientId: { in: [testClientId, testClient2Id] } } },
  });
  await prisma.shipment.deleteMany({
    where: { clientId: { in: [testClientId, testClient2Id] } },
  });
  await prisma.orderRequestItem.deleteMany({
    where: {
      orderRequest: { clientId: { in: [testClientId, testClient2Id] } },
    },
  });
  await prisma.requestStatusHistory.deleteMany({
    where: {
      orderRequest: { clientId: { in: [testClientId, testClient2Id] } },
    },
  });
  await prisma.orderRequest.deleteMany({
    where: { clientId: { in: [testClientId, testClient2Id] } },
  });
  await prisma.product.deleteMany({
    where: { clientId: { in: [testClientId, testClient2Id] } },
  });
  await prisma.portalUser.deleteMany({
    where: { clientId: { in: [testClientId, testClient2Id] } },
  });
  await prisma.client.deleteMany({
    where: { id: { in: [testClientId, testClient2Id] } },
  });

  console.log("✅ Cleanup complete");
}

// =============================================================================
// TEST EXECUTION HELPERS
// =============================================================================

async function runTest(
  name: string,
  testFn: () => Promise<void>,
): Promise<TestResult> {
  const start = Date.now();
  try {
    await testFn();
    const duration = Date.now() - start;
    console.log(`  ✅ ${name} (${duration}ms)`);
    return { name, passed: true, duration };
  } catch (error: any) {
    const duration = Date.now() - start;
    console.log(`  ❌ ${name} (${duration}ms)`);
    console.error(`     Error: ${error.message}`);
    return {
      name,
      passed: false,
      duration,
      error: error.message,
    };
  }
}

// =============================================================================
// SHIPMENT TRACKING TESTS
// =============================================================================

async function testShipmentTracking(): Promise<TestSuiteResult> {
  console.log("\n📦 Testing Shipment Tracking Service...");
  const suiteStart = Date.now();
  const tests: TestResult[] = [];

  // Test 1: Create shipment
  tests.push(
    await runTest("Create shipment with tracking info", async () => {
      const shipment = await ShipmentService.createShipment({
        orderRequestId: testOrderRequestId,
        clientId: testClientId,
        carrier: "ups",
        trackingNumber: "1Z9999999999999999",
        status: "label_created",
        packageCount: 2,
        serviceLevel: "ground",
        destinationCity: "New York",
        destinationState: "NY",
        estimatedDelivery: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        items: [
          { productId: testProductId, quantityPacks: 10, quantityUnits: 1000 },
        ],
      });

      testShipmentId = shipment.id;

      if (!shipment.trackingUrl?.includes("ups.com")) {
        throw new Error("Invalid tracking URL generated");
      }
      if (shipment.trackingEvents?.length !== 1) {
        throw new Error("Initial tracking event not created");
      }
    }),
  );

  // Test 2: Carrier tracking URLs
  tests.push(
    await runTest("Generate tracking URLs for all carriers", async () => {
      const carriers: ShipmentService.CarrierType[] = [
        "ups",
        "fedex",
        "usps",
        "dhl",
      ];
      const trackingNumbers = ["TEST123", "FEDEX456", "USPS789", "DHL000"];

      for (let i = 0; i < carriers.length; i++) {
        const url = ShipmentService.generateTrackingUrl(
          carriers[i],
          trackingNumbers[i],
        );
        if (!url || !url.includes(trackingNumbers[i])) {
          throw new Error(`Invalid URL for ${carriers[i]}`);
        }
      }
    }),
  );

  // Test 3: Update shipment status
  tests.push(
    await runTest("Update shipment status with event", async () => {
      const updated = await ShipmentService.updateShipmentStatus(
        testShipmentId,
        "in_transit",
        {
          status: "in_transit",
          description: "Package departed facility",
          location: "Louisville, KY",
        },
      );

      if (updated.status !== "in_transit") {
        throw new Error("Status not updated");
      }
      if (!updated.trackingEvents || updated.trackingEvents.length < 2) {
        throw new Error("Tracking event not added");
      }
    }),
  );

  // Test 4: Delivery status and timestamp
  tests.push(
    await runTest("Set deliveredAt on delivery status", async () => {
      const updated = await ShipmentService.updateShipmentStatus(
        testShipmentId,
        "delivered",
      );

      if (!updated.deliveredAt) {
        throw new Error("deliveredAt not set");
      }
    }),
  );

  // Test 5: Delivery deadline breach
  tests.push(
    await runTest("Detect delivery deadline breach", async () => {
      const pastOrder = await prisma.orderRequest.create({
        data: {
          clientId: testClientId,
          requestedById: testPortalUserId,
          status: "fulfilled",
          deliveryDeadline: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        },
      });

      const shipment = await ShipmentService.createShipment({
        orderRequestId: pastOrder.id,
        clientId: testClientId,
        carrier: "usps",
        trackingNumber: "USPS-LATE",
      });

      await ShipmentService.updateShipmentStatus(shipment.id, "delivered");

      const order = await prisma.orderRequest.findUnique({
        where: { id: pastOrder.id },
      });

      if (!order?.deliveryBreached) {
        throw new Error("Delivery breach not detected");
      }
    }),
  );

  // Test 6: Add tracking events
  tests.push(
    await runTest("Add custom tracking events", async () => {
      const event = await ShipmentService.addTrackingEvent(testShipmentId, {
        status: "in_transit",
        description: "Arrived at distribution center",
        location: "Chicago, IL",
      });

      if (!event || event.location !== "Chicago, IL") {
        throw new Error("Event not created correctly");
      }
    }),
  );

  // Test 7: Get shipments by order
  tests.push(
    await runTest("Get shipments by order ID", async () => {
      const shipments =
        await ShipmentService.getShipmentsByOrder(testOrderRequestId);

      if (shipments.length === 0) {
        throw new Error("No shipments found");
      }
      if (shipments.some((s) => s.orderRequestId !== testOrderRequestId)) {
        throw new Error("Wrong order shipments returned");
      }
    }),
  );

  // Test 8: Get shipments by client
  tests.push(
    await runTest("Get shipments by client with filters", async () => {
      const { shipments, total } = await ShipmentService.getShipmentsByClient(
        testClientId,
        { status: "delivered", limit: 10 },
      );

      if (shipments.some((s) => s.clientId !== testClientId)) {
        throw new Error("Wrong client shipments returned");
      }
    }),
  );

  // Test 9: Active shipments
  tests.push(
    await runTest("Get active shipments only", async () => {
      await ShipmentService.createShipment({
        orderRequestId: testOrderRequestId,
        clientId: testClientId,
        carrier: "dhl",
        trackingNumber: "DHL-ACTIVE",
        status: "in_transit",
      });

      const active = await ShipmentService.getActiveShipments(testClientId);

      const validStatuses = [
        "pending",
        "label_created",
        "in_transit",
        "out_for_delivery",
      ];
      if (active.some((s) => !validStatuses.includes(s.status))) {
        throw new Error("Non-active shipment returned");
      }
    }),
  );

  // Test 10: Client isolation
  tests.push(
    await runTest("Enforce client data isolation", async () => {
      const { shipments } =
        await ShipmentService.getShipmentsByClient(testClient2Id);

      if (shipments.some((s) => s.clientId !== testClient2Id)) {
        throw new Error("Client isolation violated");
      }
    }),
  );

  // Test 11: Shipment statistics
  tests.push(
    await runTest("Calculate shipment statistics", async () => {
      const stats = await ShipmentService.getShipmentStats(testClientId);

      if (stats.total === 0) {
        throw new Error("No shipments in stats");
      }
      if (typeof stats.avgDeliveryDays !== "number") {
        throw new Error("Invalid avg delivery days");
      }
    }),
  );

  const duration = Date.now() - suiteStart;
  const passedTests = tests.filter((t) => t.passed).length;

  return {
    name: "Shipment Tracking Service",
    tests,
    totalTests: tests.length,
    passedTests,
    failedTests: tests.length - passedTests,
    duration,
  };
}

// =============================================================================
// ORDER TIMING TESTS
// =============================================================================

async function testOrderTiming(): Promise<TestSuiteResult> {
  console.log("\n⏰ Testing Order Timing Service...");
  const suiteStart = Date.now();
  const tests: TestResult[] = [];

  // Test 1: Stockout date calculation
  tests.push(
    await runTest("Calculate stockout date from usage", async () => {
      const result = OrderTimingService.calculateStockoutDate(5000, 150);

      if (!result.date || result.daysRemaining !== 33) {
        throw new Error("Incorrect stockout calculation");
      }
    }),
  );

  // Test 2: Zero usage handling
  tests.push(
    await runTest("Handle zero/negative usage", async () => {
      const result1 = OrderTimingService.calculateStockoutDate(1000, 0);
      const result2 = OrderTimingService.calculateStockoutDate(1000, -10);

      if (result1.date !== null || result2.date !== null) {
        throw new Error("Should return null for invalid usage");
      }
    }),
  );

  // Test 3: Order-by date calculation
  tests.push(
    await runTest("Calculate last order-by date", async () => {
      const stockoutDate = new Date();
      stockoutDate.setDate(stockoutDate.getDate() + 30);

      const orderByDate = OrderTimingService.calculateLastOrderByDate(
        stockoutDate,
        15,
      );

      const expectedDate = new Date(stockoutDate);
      expectedDate.setDate(expectedDate.getDate() - 15);

      if (orderByDate.toDateString() !== expectedDate.toDateString()) {
        throw new Error("Incorrect order-by date calculation");
      }
    }),
  );

  // Test 4: Product-level lead time
  tests.push(
    await runTest("Use product-level lead time overrides", async () => {
      const product = await prisma.product.findUnique({
        where: { id: testProductId },
      });
      const clientDefaults =
        await OrderTimingService.getClientTimingDefaults(testClientId);

      const { total, breakdown } = OrderTimingService.getTotalLeadTime(
        product!,
        clientDefaults,
      );

      if (total !== 20) {
        throw new Error(`Expected total 20, got ${total}`);
      }
      if (breakdown.supplierDays !== 10) {
        throw new Error("Incorrect supplier days");
      }
    }),
  );

  // Test 5: Client default lead time
  tests.push(
    await runTest("Use client defaults when no override", async () => {
      const product = await prisma.product.findUnique({
        where: { id: testProduct2Id },
      });
      const clientDefaults =
        await OrderTimingService.getClientTimingDefaults(testClientId);

      const { total } = OrderTimingService.getTotalLeadTime(
        product!,
        clientDefaults,
      );

      if (total !== 15) {
        throw new Error(`Expected total 15, got ${total}`);
      }
    }),
  );

  // Test 6: Urgency levels
  tests.push(
    await runTest("Determine correct urgency levels", async () => {
      const tests = [
        { days: -5, expected: "overdue" },
        { days: 1, expected: "critical" },
        { days: 5, expected: "soon" },
        { days: 10, expected: "upcoming" },
        { days: 20, expected: "safe" },
      ];

      for (const test of tests) {
        const level = OrderTimingService.getUrgencyLevel(test.days);
        if (level !== test.expected) {
          throw new Error(
            `Expected ${test.expected} for ${test.days} days, got ${level}`,
          );
        }
      }
    }),
  );

  // Test 7: Product order timing
  tests.push(
    await runTest("Calculate complete product timing", async () => {
      const timing =
        await OrderTimingService.calculateProductOrderTiming(testProductId);

      if (!timing) {
        throw new Error("Timing calculation failed");
      }
      if (timing.daysOfStockRemaining !== 33) {
        throw new Error("Incorrect days remaining");
      }
      if (!timing.projectedStockoutDate) {
        throw new Error("No stockout date");
      }
      if (!timing.lastOrderByDate) {
        throw new Error("No order-by date");
      }
    }),
  );

  // Test 8: Upcoming deadlines
  tests.push(
    await runTest("Get upcoming deadlines sorted by urgency", async () => {
      const deadlines = await OrderTimingService.getUpcomingDeadlines(
        testClientId,
        { daysAhead: 30 },
      );

      // Check sorting
      for (let i = 1; i < deadlines.length; i++) {
        const prevDays = deadlines[i - 1].daysUntilOrderDeadline ?? Infinity;
        const currDays = deadlines[i].daysUntilOrderDeadline ?? Infinity;
        if (prevDays > currDays) {
          throw new Error("Deadlines not sorted correctly");
        }
      }
    }),
  );

  // Test 9: Filter by urgency
  tests.push(
    await runTest("Filter deadlines by urgency level", async () => {
      const critical = await OrderTimingService.getUpcomingDeadlines(
        testClientId,
        { urgencyLevels: ["critical", "overdue"] },
      );

      const validLevels = ["critical", "overdue"];
      if (critical.some((d) => !validLevels.includes(d.urgencyLevel))) {
        throw new Error("Urgency filter not working");
      }
    }),
  );

  // Test 10: Timing summary
  tests.push(
    await runTest("Generate timing summary", async () => {
      const summary = await OrderTimingService.getTimingSummary(testClientId);

      if (!summary || summary.totalProducts === 0) {
        throw new Error("Invalid summary");
      }

      const total =
        summary.overdue +
        summary.critical +
        summary.soon +
        summary.upcoming +
        summary.safe;

      if (total !== summary.withUsageData) {
        throw new Error("Summary counts do not match");
      }
    }),
  );

  // Test 11: Update product timing cache
  tests.push(
    await runTest("Update product timing cache", async () => {
      await OrderTimingService.updateProductTimingCache(testProductId);

      const product = await prisma.product.findUnique({
        where: { id: testProductId },
      });

      if (!product?.projectedStockoutDate) {
        throw new Error("Stockout date not cached");
      }
      if (!product.lastOrderByDate) {
        throw new Error("Order-by date not cached");
      }
      if (!product.timingLastCalculated) {
        throw new Error("Calculation timestamp not set");
      }
    }),
  );

  // Test 12: Update client timing cache
  tests.push(
    await runTest("Update timing cache for all products", async () => {
      const result =
        await OrderTimingService.updateClientTimingCache(testClientId);

      if (result.updated === 0) {
        throw new Error("No products updated");
      }
    }),
  );

  // Test 13: Update product lead time
  tests.push(
    await runTest("Update individual product lead time", async () => {
      await OrderTimingService.updateProductLeadTime(testProduct2Id, {
        supplierLeadDays: 14,
        shippingLeadDays: 7,
      });

      const product = await prisma.product.findUnique({
        where: { id: testProduct2Id },
      });

      if (product?.supplierLeadDays !== 14) {
        throw new Error("Supplier lead days not updated");
      }
      if (product.leadTimeSource !== "override") {
        throw new Error("Lead time source not set");
      }
    }),
  );

  // Test 14: Bulk update lead times
  tests.push(
    await runTest("Bulk update lead times", async () => {
      const result = await OrderTimingService.bulkUpdateLeadTimes(
        testClientId,
        [
          { productId: "SHIP-TEST-001", supplierLeadDays: 5 },
          { productId: "SHIP-TEST-002", shippingLeadDays: 2 },
          { productId: "NONEXISTENT", supplierLeadDays: 10 },
        ],
      );

      if (result.updated !== 2) {
        throw new Error(`Expected 2 updates, got ${result.updated}`);
      }
      if (!result.notFound.includes("NONEXISTENT")) {
        throw new Error("Not found list incorrect");
      }
    }),
  );

  // Test 15: Client timing defaults
  tests.push(
    await runTest("Get and update client timing defaults", async () => {
      const defaults =
        await OrderTimingService.getClientTimingDefaults(testClientId);

      if (defaults.defaultSupplierLeadDays !== 7) {
        throw new Error("Incorrect default supplier lead days");
      }

      await OrderTimingService.updateClientTimingDefaults(testClientId, {
        defaultSupplierLeadDays: 10,
      });

      const updated =
        await OrderTimingService.getClientTimingDefaults(testClientId);

      if (updated.defaultSupplierLeadDays !== 10) {
        throw new Error("Defaults not updated");
      }
    }),
  );

  const duration = Date.now() - suiteStart;
  const passedTests = tests.filter((t) => t.passed).length;

  return {
    name: "Order Timing Service",
    tests,
    totalTests: tests.length,
    passedTests,
    failedTests: tests.length - passedTests,
    duration,
  };
}

// =============================================================================
// REPORT GENERATION
// =============================================================================

function generateMarkdownReport(results: TestSuiteResult[]): string {
  const timestamp = new Date().toISOString();
  const totalTests = results.reduce((sum, r) => sum + r.totalTests, 0);
  const totalPassed = results.reduce((sum, r) => sum + r.passedTests, 0);
  const totalFailed = results.reduce((sum, r) => sum + r.failedTests, 0);
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
  const successRate = Math.round((totalPassed / totalTests) * 100);

  let report = `# Shipment Tracking & Order Timing Test Report

**Generated:** ${new Date(timestamp).toLocaleString()}
**Total Tests:** ${totalTests}
**Passed:** ${totalPassed}
**Failed:** ${totalFailed}
**Success Rate:** ${successRate}%
**Total Duration:** ${totalDuration}ms

---

## Summary

`;

  // Summary table
  report += `| Test Suite | Total | Passed | Failed | Duration |\n`;
  report += `|-----------|-------|--------|--------|----------|\n`;

  for (const suite of results) {
    const rate = Math.round((suite.passedTests / suite.totalTests) * 100);
    const status = suite.failedTests === 0 ? "✅" : "⚠️";
    report += `| ${status} ${suite.name} | ${suite.totalTests} | ${suite.passedTests} | ${suite.failedTests} | ${suite.duration}ms |\n`;
  }

  report += `\n---\n\n`;

  // Detailed results
  for (const suite of results) {
    report += `## ${suite.name}\n\n`;
    report += `**Total Tests:** ${suite.totalTests}  \n`;
    report += `**Passed:** ${suite.passedTests}  \n`;
    report += `**Failed:** ${suite.failedTests}  \n`;
    report += `**Duration:** ${suite.duration}ms\n\n`;

    // Test list
    for (const test of suite.tests) {
      const status = test.passed ? "✅" : "❌";
      report += `### ${status} ${test.name}\n`;
      report += `- **Status:** ${test.passed ? "PASSED" : "FAILED"}\n`;
      report += `- **Duration:** ${test.duration}ms\n`;

      if (test.error) {
        report += `- **Error:** \`${test.error}\`\n`;
      }

      report += `\n`;
    }

    report += `---\n\n`;
  }

  // Failed tests summary
  const failedTests = results.flatMap((r) =>
    r.tests.filter((t) => !t.passed).map((t) => ({ suite: r.name, ...t })),
  );

  if (failedTests.length > 0) {
    report += `## Failed Tests\n\n`;
    for (const test of failedTests) {
      report += `- **${test.suite}:** ${test.name}\n`;
      report += `  - Error: \`${test.error}\`\n\n`;
    }
  }

  // Coverage summary
  report += `## Test Coverage\n\n`;
  report += `### Shipment Tracking\n`;
  report += `- ✅ Create shipments for orders\n`;
  report += `- ✅ Update shipment status\n`;
  report += `- ✅ Add tracking events\n`;
  report += `- ✅ Get shipments by order\n`;
  report += `- ✅ Get shipments by client\n`;
  report += `- ✅ Generate tracking URLs for different carriers\n`;
  report += `- ✅ Test delivery deadline breach detection\n`;
  report += `- ✅ Client data isolation\n\n`;

  report += `### Order Timing\n`;
  report += `- ✅ Calculate stockout dates\n`;
  report += `- ✅ Calculate last order-by dates\n`;
  report += `- ✅ Get total lead time (supplier + shipping + processing + buffer)\n`;
  report += `- ✅ Get urgency levels (safe/upcoming/soon/critical/overdue)\n`;
  report += `- ✅ Get upcoming deadlines for clients\n`;
  report += `- ✅ Update product-level lead times\n`;
  report += `- ✅ Bulk import lead times\n`;
  report += `- ✅ Timing cache updates\n`;
  report += `- ✅ Client default lead time management\n\n`;

  report += `---\n\n`;
  report += `## Conclusion\n\n`;

  if (totalFailed === 0) {
    report += `✅ **All tests passed!** The shipment tracking and order timing features are working as expected.\n`;
  } else {
    report += `⚠️ **${totalFailed} test(s) failed.** Please review the failures above and address the issues.\n`;
  }

  return report;
}

// =============================================================================
// MAIN EXECUTION
// =============================================================================

async function main() {
  console.log("=".repeat(80));
  console.log("SHIPMENT TRACKING & ORDER TIMING COMPREHENSIVE TEST SUITE");
  console.log("=".repeat(80));

  try {
    await setupTestData();

    // Run test suites
    const shipmentResults = await testShipmentTracking();
    allResults.push(shipmentResults);

    const timingResults = await testOrderTiming();
    allResults.push(timingResults);

    await cleanupTestData();

    // Generate report
    const report = generateMarkdownReport(allResults);

    // Save report
    const reportDir = path.join(process.cwd(), "tests", "reports");
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    const reportPath = path.join(reportDir, "shipment-timing-test-report.md");
    fs.writeFileSync(reportPath, report);

    // Print summary
    console.log("\n" + "=".repeat(80));
    console.log("TEST RESULTS SUMMARY");
    console.log("=".repeat(80));

    const totalTests = allResults.reduce((sum, r) => sum + r.totalTests, 0);
    const totalPassed = allResults.reduce((sum, r) => sum + r.passedTests, 0);
    const totalFailed = allResults.reduce((sum, r) => sum + r.failedTests, 0);

    console.log(`Total Tests: ${totalTests}`);
    console.log(`Passed: ${totalPassed}`);
    console.log(`Failed: ${totalFailed}`);
    console.log(
      `Success Rate: ${Math.round((totalPassed / totalTests) * 100)}%`,
    );
    console.log(`\nReport saved to: ${reportPath}`);

    if (totalFailed === 0) {
      console.log("\n✅ ALL TESTS PASSED!");
      process.exit(0);
    } else {
      console.log(`\n❌ ${totalFailed} test(s) failed`);
      process.exit(1);
    }
  } catch (error) {
    console.error("Fatal error:", error);
    await cleanupTestData();
    process.exit(1);
  }
}

main();
