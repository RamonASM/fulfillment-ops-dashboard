# Test Suite Documentation

## Shipment Tracking & Order Timing Tests

### Overview

This directory contains comprehensive tests for the shipment tracking and order timing features of the Fulfillment Operations Dashboard.

### Test Files

- **`run-shipment-timing-tests.ts`** - Main test runner that executes all tests and generates reports
- **`reports/shipment-timing-test-report.md`** - Comprehensive test report with results and analysis
- **`../src/__tests__/shipment-timing.test.ts`** - Test suite implementation (Jest-compatible)

### Running Tests

#### Option 1: Using the Test Runner (Recommended)

```bash
cd /Users/aerialshotsmedia/Projects/fulfillment-ops-dashboard/apps/api
tsx tests/run-shipment-timing-tests.ts
```

This will:

1. Set up test data (clients, products, orders)
2. Run all 32 test scenarios
3. Generate a detailed markdown report
4. Clean up test data
5. Save report to `tests/reports/shipment-timing-test-report.md`

#### Option 2: Using Jest (if configured)

```bash
npm test -- src/__tests__/shipment-timing.test.ts
```

### Test Coverage

#### Shipment Tracking (11 tests)

- ✅ Create shipments for orders
- ✅ Update shipment status
- ✅ Add tracking events
- ✅ Get shipments by order
- ✅ Get shipments by client
- ✅ Generate tracking URLs for different carriers
- ✅ Test manual vs API tracking modes
- ✅ Test delivery deadline breach detection
- ✅ Client data isolation
- ✅ Active shipments filtering
- ✅ Shipment statistics

#### Order Timing (15 tests)

- ✅ Calculate stockout dates
- ✅ Calculate last order-by dates
- ✅ Get total lead time (supplier + shipping + processing + buffer)
- ✅ Get urgency levels (safe/upcoming/soon/critical/overdue)
- ✅ Get upcoming deadlines for clients
- ✅ Test timing cache updates
- ✅ Set product-level lead times
- ✅ Use client default lead times
- ✅ Bulk import lead times
- ✅ Override calculations
- ✅ Client timing defaults management
- ✅ Product timing cache
- ✅ Client-wide cache recalculation
- ✅ Urgency level determination
- ✅ Urgency message generation

#### Authorization & Security (6 tests)

- ✅ Client data isolation
- ✅ Portal user authentication
- ✅ Admin authentication
- ✅ Client-specific filtering
- ✅ Cross-client access prevention
- ✅ Role-based access control

### API Endpoints Tested

#### Admin Endpoints

**Shipments:**

- `POST /api/shipments` - Create shipment
- `GET /api/shipments/:id` - Get shipment
- `PUT /api/shipments/:id` - Update shipment
- `DELETE /api/shipments/:id` - Delete shipment
- `POST /api/shipments/:id/status` - Update status
- `POST /api/shipments/:id/events` - Add tracking event
- `GET /api/shipments/:id/events` - Get events
- `POST /api/shipments/:id/items` - Add items
- `GET /api/shipments` - List shipments
- `GET /api/shipments/order/:orderRequestId` - Get by order
- `GET /api/shipments/active/:clientId` - Active shipments
- `GET /api/shipments/stats/:clientId` - Statistics

**Order Timing:**

- `GET /api/order-timing/:clientId` - Timing summary
- `GET /api/order-timing/:clientId/deadlines` - Upcoming deadlines
- `GET /api/order-timing/product/:productId` - Product timing
- `GET /api/order-timing/:clientId/defaults` - Get defaults
- `PUT /api/order-timing/:clientId/defaults` - Update defaults
- `PATCH /api/order-timing/product/:productId/lead-time` - Update lead time
- `POST /api/order-timing/:clientId/bulk-lead-times` - Bulk update
- `POST /api/order-timing/:clientId/recalculate` - Recalculate cache

**Products:**

- `PATCH /api/products/:id/lead-time` - Update product lead time

#### Portal Endpoints

- `GET /api/portal/shipments` - List client shipments
- `GET /api/portal/shipments/active` - Active shipments
- `GET /api/portal/shipments/stats` - Shipment stats
- `GET /api/portal/shipments/:id` - Shipment details
- `GET /api/portal/shipments/order/:orderId` - Order tracking
- `GET /api/portal/shipments/:id/events` - Tracking events
- `GET /api/portal/shipments/timing/summary` - Timing summary
- `GET /api/portal/shipments/timing/deadlines` - Order deadlines
- `GET /api/portal/shipments/timing/product/:productId` - Product timing

### Test Data

The test suite creates the following test data:

**Clients:**

- Test Client 1 - Primary test client with timing defaults
- Test Client 2 - Used for isolation testing

**Products:**

- SHIP-TEST-001: High usage product (150 units/day) with custom lead times
- SHIP-TEST-002: Low usage product (25 units/day) with default lead times
- SHIP-TEST-003: Client 2 product for isolation testing

**Orders:**

- Multiple order requests with various delivery deadlines
- Order items linked to products

**Shipments:**

- Multiple shipments with different carriers and statuses
- Tracking events for status transitions
- Shipment items linked to products

### Calculation Verification

#### Stockout Date

```
Formula: daysRemaining = floor(currentStockUnits / avgDailyUsage)
Example: floor(5000 / 150) = 33 days
```

#### Order-By Date

```
Formula: orderByDate = stockoutDate - totalLeadDays
Example: 2025-01-17 - 20 days = 2024-12-28
```

#### Total Lead Time

```
Formula: supplierDays + shippingDays + processingDays + safetyBufferDays
Product Override: 10 + 3 + 2 + 5 = 20 days
Client Default: 7 + 5 + 1 + 2 = 15 days
```

#### Urgency Level

```
overdue:   daysUntilDeadline < 0
critical:  daysUntilDeadline <= 3
soon:      daysUntilDeadline <= 7
upcoming:  daysUntilDeadline <= 14
safe:      daysUntilDeadline > 14
```

### Expected Test Results

All tests should pass with 100% success rate:

```
================================================================================
TEST RESULTS SUMMARY
================================================================================
Total Tests: 32
Passed: 32
Failed: 0
Success Rate: 100%

✓ ALL TESTS PASSED!
```

### Troubleshooting

#### Database Connection Issues

If you get connection errors:

1. Check `.env` file has correct `DATABASE_URL`
2. Ensure PostgreSQL is running
3. Run `npm run db:push` to sync schema

#### Test Data Conflicts

If you get unique constraint violations:

1. The test suite uses timestamped client codes to avoid conflicts
2. Cleanup runs automatically after tests
3. Manually clean up if needed:
   ```sql
   DELETE FROM shipment_events WHERE shipment_id IN (SELECT id FROM shipments WHERE client_id IN (SELECT id FROM clients WHERE code LIKE 'SHIPTEST%'));
   DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE client_id IN (SELECT id FROM clients WHERE code LIKE 'SHIPTEST%'));
   DELETE FROM shipments WHERE client_id IN (SELECT id FROM clients WHERE code LIKE 'SHIPTEST%');
   -- ... etc
   ```

#### Import Errors

If you get module import errors:

1. Ensure TypeScript is compiled: `npm run build`
2. Check `tsconfig.json` has correct paths
3. Use `tsx` instead of `ts-node` for ESM support

### Continuous Integration

To integrate into CI/CD pipeline:

```yaml
# .github/workflows/test.yml
- name: Run Shipment & Timing Tests
  run: |
    npm run db:push
    tsx tests/run-shipment-timing-tests.ts
```

### Reporting

After running tests, the report is generated at:

```
/apps/api/tests/reports/shipment-timing-test-report.md
```

The report includes:

- Executive summary
- Detailed test results
- Calculation verification
- API endpoint coverage
- Authorization testing
- Performance metrics
- Known limitations

### Maintenance

When to update tests:

1. **Schema Changes:** Update test data setup if database schema changes
2. **New Features:** Add new test scenarios for new functionality
3. **Bug Fixes:** Add regression tests for fixed bugs
4. **Calculation Changes:** Update verification examples

### Support

For questions or issues:

1. Check the test report for detailed failure information
2. Review service implementations in `src/services/`
3. Consult API route handlers in `src/routes/`
4. Check Prisma schema in `prisma/schema.prisma`

---

**Last Updated:** December 15, 2025
**Maintainer:** Development Team
