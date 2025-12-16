# Database Migration Guide

This guide explains how to apply and manage database migrations for the Fulfillment Operations Dashboard.

## Overview

The following migrations add new features to support:

- Financial tracking and budgeting
- Shipment tracking with carrier integration
- Cross-client benchmarking (privacy-preserving)
- Dashboard personalization
- Product lead time management

## Migration Files

### 20251215000001_add_financial_tracking

**Purpose**: Adds financial tracking capabilities for inventory cost management

**Changes**:

- Adds `Budget` table for budget tracking and variance analysis
- Adds `CostTracking` table for monthly cost aggregation and EOQ calculations
- Adds financial fields to `Product` table:
  - `unit_cost`, `unit_price` (pricing information)
  - `reorder_cost`, `holding_cost_rate` (inventory cost components)
  - `last_cost_update`, `cost_source` (tracking metadata)

**Indexes Created**:

- `budgets_client_id_period_start_idx` - Query budgets by client and period
- `budgets_product_id_idx` - Query budgets by product
- `cost_tracking_client_id_product_id_period_key` - Unique constraint for cost periods
- `cost_tracking_period_idx` - Query costs by period

**Foreign Keys**:

- Budget → Client (CASCADE delete)
- Budget → Product (CASCADE delete)
- CostTracking → Client (CASCADE delete)
- CostTracking → Product (CASCADE delete)

### 20251215000002_add_shipment_tracking

**Purpose**: Enables tracking of shipments from carrier to delivery

**Changes**:

- Adds `Shipment` table for order shipment tracking
- Adds `ShipmentEvent` table for tracking history (status updates, location scans)
- Adds `ShipmentItem` table for linking shipped products to shipments

**Key Features**:

- Carrier integration support (UPS, FedEx, USPS, DHL)
- Tracking number and URL management
- Delivery estimation and confirmation
- Exception handling (delays, delivery issues)
- Raw tracking data storage for future API integration

**Indexes Created**:

- `shipments_order_request_id_idx` - Link shipments to orders
- `shipments_client_id_status_idx` - Query shipments by client and status
- `shipments_tracking_number_idx` - Quick tracking number lookup
- `shipment_events_shipment_id_event_time_idx` - Chronological event history

**Foreign Keys**:

- Shipment → OrderRequest (CASCADE delete)
- Shipment → Client (RESTRICT delete - prevent deleting clients with shipments)
- ShipmentEvent → Shipment (CASCADE delete)
- ShipmentItem → Shipment (CASCADE delete)
- ShipmentItem → Product (RESTRICT delete)
- ShipmentItem → OrderRequestItem (SET NULL)

### 20251215000003_add_benchmarking

**Purpose**: Privacy-preserving cross-client performance benchmarking

**Changes**:

- Adds `BenchmarkParticipation` table for opt-in tracking
- Adds `BenchmarkSnapshot` table for aggregated benchmark data

**Key Features**:

- Anonymous client identification
- Cohort-based comparison (industry, size)
- Percentile rankings (P25, P50, P75, P90)
- Metrics: product count, order frequency, stockout rate, forecast accuracy, inventory turnover
- Privacy compliance: minimum 5 participants, no PII

**Indexes Created**:

- `benchmark_participation_client_id_key` - Unique client participation
- `benchmark_participation_anonymous_id_key` - Unique anonymous ID
- `benchmark_participation_cohort_is_participating_idx` - Active participants by cohort
- `benchmark_snapshots_cohort_period_key` - Unique snapshot per cohort/period
- `benchmark_snapshots_period_idx` - Query snapshots by period

**Foreign Keys**:

- BenchmarkParticipation → Client (CASCADE delete)

### 20251215000004_add_dashboard_personalization

**Purpose**: Custom dashboard layouts and user preferences

**Changes**:

- Adds `DashboardLayout` table for saved dashboard configurations
- Adds `UserPreferences` table for user-specific settings

**Key Features**:

- Multiple saved layouts per user
- Default layout designation
- Widget positions and sizes (stored as JSON)
- UI preferences (compact mode, color scheme, default view)
- Real-time update preferences
- Notification settings

**Indexes Created**:

- `dashboard_layouts_user_id_idx` - Query layouts by user
- `dashboard_layouts_user_id_is_default_idx` - Find default layout
- `user_preferences_user_id_key` - One preference set per user

**Foreign Keys**:

- DashboardLayout → User (CASCADE delete)
- UserPreferences → User (CASCADE delete)

### 20251215000005_add_product_lead_times

**Purpose**: Order timing optimization and stockout prevention

**Changes**:

- Adds lead time fields to `Product` table:
  - `supplier_lead_days` - Supplier fulfillment time
  - `shipping_lead_days` - Transit time
  - `processing_lead_days` - Internal processing
  - `safety_buffer_days` - Safety margin
  - `total_lead_days` - Auto-calculated total
  - `lead_time_source` - Data provenance
- Adds timing calculation cache:
  - `projected_stockout_date` - When stock runs out
  - `last_order_by_date` - Order deadline
  - `timing_last_calculated` - Cache timestamp

**Special Features**:

- Automatic `total_lead_days` calculation via database trigger
- Check constraint to ensure non-negative lead times
- Column comments for documentation

## How to Apply Migrations

### Development Environment

```bash
# 1. Navigate to API directory
cd apps/api

# 2. Apply all pending migrations
npx prisma migrate deploy

# 3. Generate Prisma Client
npx prisma generate
```

### Production Environment

```bash
# 1. Create database backup
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql

# 2. Apply migrations
npx prisma migrate deploy

# 3. Verify migrations
npx prisma migrate status

# 4. Generate Prisma Client
npx prisma generate

# 5. Restart application servers
pm2 restart all  # or your process manager
```

### Using Prisma Migrate Commands

```bash
# Check migration status
npx prisma migrate status

# Apply pending migrations
npx prisma migrate deploy

# Create a new migration from schema changes
npx prisma migrate dev --name descriptive_name

# Reset database (CAUTION: drops all data)
npx prisma migrate reset

# View applied migrations
npx prisma migrate history
```

## Rollback Strategy

### Individual Migration Rollback

If you need to rollback a specific migration, you must manually create a rollback migration:

```bash
# Create a new migration for rollback
npx prisma migrate dev --name rollback_feature_name
```

### Rollback Templates

#### Rollback 20251215000005 (Product Lead Times)

```sql
-- Remove lead time fields
ALTER TABLE "products" DROP COLUMN IF EXISTS "supplier_lead_days";
ALTER TABLE "products" DROP COLUMN IF EXISTS "shipping_lead_days";
ALTER TABLE "products" DROP COLUMN IF EXISTS "processing_lead_days";
ALTER TABLE "products" DROP COLUMN IF EXISTS "safety_buffer_days";
ALTER TABLE "products" DROP COLUMN IF EXISTS "total_lead_days";
ALTER TABLE "products" DROP COLUMN IF EXISTS "lead_time_source";
ALTER TABLE "products" DROP COLUMN IF EXISTS "projected_stockout_date";
ALTER TABLE "products" DROP COLUMN IF EXISTS "last_order_by_date";
ALTER TABLE "products" DROP COLUMN IF EXISTS "timing_last_calculated";

-- Drop trigger and function
DROP TRIGGER IF EXISTS calculate_product_total_lead_days ON "products";
DROP FUNCTION IF EXISTS calculate_total_lead_days();

-- Drop constraint
ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "products_total_lead_days_check";
```

#### Rollback 20251215000004 (Dashboard Personalization)

```sql
-- Drop tables (cascades to dependent records)
DROP TABLE IF EXISTS "user_preferences";
DROP TABLE IF EXISTS "dashboard_layouts";

-- Drop functions
DROP FUNCTION IF EXISTS update_user_preferences_updated_at();
DROP FUNCTION IF EXISTS update_dashboard_layouts_updated_at();
```

#### Rollback 20251215000003 (Benchmarking)

```sql
-- Drop tables
DROP TABLE IF EXISTS "benchmark_snapshots";
DROP TABLE IF EXISTS "benchmark_participation";

-- Drop function
DROP FUNCTION IF EXISTS update_benchmark_participation_updated_at();
```

#### Rollback 20251215000002 (Shipment Tracking)

```sql
-- Drop tables in reverse dependency order
DROP TABLE IF EXISTS "shipment_items";
DROP TABLE IF EXISTS "shipment_events";
DROP TABLE IF EXISTS "shipments";

-- Drop function
DROP FUNCTION IF EXISTS update_shipments_updated_at();
```

#### Rollback 20251215000001 (Financial Tracking)

```sql
-- Drop tables
DROP TABLE IF EXISTS "cost_tracking";
DROP TABLE IF EXISTS "budgets";

-- Drop function
DROP FUNCTION IF EXISTS update_budgets_updated_at();

-- Remove financial fields from products
ALTER TABLE "products" DROP COLUMN IF EXISTS "unit_cost";
ALTER TABLE "products" DROP COLUMN IF EXISTS "unit_price";
ALTER TABLE "products" DROP COLUMN IF EXISTS "reorder_cost";
ALTER TABLE "products" DROP COLUMN IF EXISTS "holding_cost_rate";
ALTER TABLE "products" DROP COLUMN IF EXISTS "last_cost_update";
ALTER TABLE "products" DROP COLUMN IF EXISTS "cost_source";
```

### Complete Database Rollback

To rollback all migrations and restore from backup:

```bash
# 1. Drop database (CAUTION!)
dropdb fulfillment_ops_db

# 2. Create fresh database
createdb fulfillment_ops_db

# 3. Restore from backup
psql $DATABASE_URL < backup_20251215_120000.sql

# 4. Verify restoration
psql $DATABASE_URL -c "\dt"
```

## Data Migration Considerations

### Financial Tracking

- Existing products will have `NULL` values for financial fields
- Consider running a script to populate initial values from external sources
- Budget and cost tracking tables start empty

### Shipment Tracking

- No historical shipment data - only applies to future orders
- Existing OrderRequests won't have shipments unless manually created
- Consider importing historical tracking data if needed

### Benchmarking

- All clients start as non-participating
- Requires opt-in and cohort assignment
- Snapshots require manual calculation job (minimum 5 participants)

### Dashboard Personalization

- Users will have no saved layouts initially
- Default preferences apply until user customizes
- Consider creating default layouts for common roles

### Product Lead Times

- All products will have `NULL` lead times initially
- Consider setting default values based on client settings
- Timing calculations won't work until lead times are populated

## Production Deployment Checklist

- [ ] **Pre-Deployment**
  - [ ] Review all migration SQL files
  - [ ] Create database backup
  - [ ] Test migrations on staging environment
  - [ ] Verify application code is compatible
  - [ ] Schedule maintenance window if needed

- [ ] **Deployment**
  - [ ] Enable maintenance mode (optional)
  - [ ] Stop application servers (if downtime acceptable)
  - [ ] Apply migrations: `npx prisma migrate deploy`
  - [ ] Verify migration status: `npx prisma migrate status`
  - [ ] Generate Prisma Client: `npx prisma generate`
  - [ ] Run any data migration scripts
  - [ ] Start application servers
  - [ ] Disable maintenance mode

- [ ] **Post-Deployment**
  - [ ] Verify all endpoints are responding
  - [ ] Check application logs for errors
  - [ ] Test critical features (auth, data access, writes)
  - [ ] Monitor database performance
  - [ ] Verify new features are accessible
  - [ ] Document any issues in deployment log

- [ ] **Data Population** (if needed)
  - [ ] Populate product financial data
  - [ ] Set default lead times for products
  - [ ] Configure client budget periods
  - [ ] Set up initial dashboard layouts
  - [ ] Assign benchmark cohorts

## Common Issues and Solutions

### Issue: Migration fails with foreign key constraint error

**Solution**: Ensure referenced tables exist. Migrations must run in order.

### Issue: Trigger creation fails

**Solution**: Check PostgreSQL version supports the trigger syntax. Requires PostgreSQL 11+.

### Issue: JSON/JSONB column issues

**Solution**: Ensure PostgreSQL version supports JSONB (9.4+). Check data format matches schema.

### Issue: Migration hangs or times out

**Solution**:

- Check for locks: `SELECT * FROM pg_locks WHERE NOT granted;`
- Kill blocking queries if safe
- Consider applying migrations during low-traffic period

### Issue: Column already exists error

**Solution**: Migration was partially applied. Either:

- Manually drop the column and retry
- Skip to next migration if safe
- Create custom migration to reconcile

### Issue: Prisma Client out of sync

**Solution**: Regenerate client after migrations:

```bash
npx prisma generate
```

## Testing Migrations

### Local Testing

```bash
# 1. Create test database
createdb fulfillment_ops_test

# 2. Set test database URL
export DATABASE_URL="postgresql://user:pass@localhost:5432/fulfillment_ops_test"

# 3. Apply migrations
npx prisma migrate deploy

# 4. Run application tests
npm test

# 5. Clean up
dropdb fulfillment_ops_test
```

### Staging Environment

```bash
# 1. Deploy to staging
npm run deploy:staging

# 2. Verify migrations
npx prisma migrate status

# 3. Run integration tests
npm run test:integration

# 4. Manual QA testing
```

## Performance Considerations

### Index Usage

All migrations include appropriate indexes for query performance:

- Foreign key columns are indexed
- Frequently queried columns have indexes
- Composite indexes for common query patterns

### Data Volume

- Budget table: ~12 records/product/year (monthly budgets)
- CostTracking: ~12 records/product/year (monthly aggregation)
- Shipment tables: ~1-10 records/order (depending on shipment count)
- BenchmarkSnapshot: ~12 records/cohort/year (monthly snapshots)
- DashboardLayout: ~1-5 records/user (saved layouts)

### Monitoring

Monitor these metrics after deployment:

- Query performance on new tables
- Index usage statistics
- Table sizes and growth rate
- Foreign key constraint performance

## Support and Resources

### Documentation

- Prisma Migrate: https://www.prisma.io/docs/concepts/components/prisma-migrate
- PostgreSQL Documentation: https://www.postgresql.org/docs/

### Migration History

Run `npx prisma migrate status` to see:

- Applied migrations
- Pending migrations
- Migration timestamps
- Current schema state

### Getting Help

If you encounter issues:

1. Check this guide for common issues
2. Review Prisma documentation
3. Check application logs
4. Review database logs
5. Contact development team

## Version History

- **v1.0** (2025-12-15): Initial migration guide
  - Financial tracking
  - Shipment tracking
  - Benchmarking
  - Dashboard personalization
  - Product lead times
