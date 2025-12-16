#!/bin/bash

# ============================================================================
# Schema Validation Script
# ============================================================================
# Validates that the database schema matches the Prisma schema
# Useful for verifying migrations were applied correctly
#
# Usage:
#   chmod +x validate-schema.sh
#   ./validate-schema.sh
# ============================================================================

set -e  # Exit on error

echo "================================================"
echo "Schema Validation"
echo "================================================"
echo ""

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ ERROR: DATABASE_URL environment variable is not set"
    exit 1
fi

echo "Database URL: ${DATABASE_URL%%@*}@***"
echo ""

# Change to the API directory
cd "$(dirname "$0")/../.."

echo "🔍 Checking migration status..."
npx prisma migrate status

echo ""
echo "🔍 Validating schema against database..."

# This will fail if there are differences
if npx prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-schema-datasource prisma/schema.prisma --script > /dev/null 2>&1; then
    echo "✅ Schema is valid and matches database!"
else
    echo "⚠️  Schema differences detected"
    echo ""
    echo "Showing differences:"
    npx prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-schema-datasource prisma/schema.prisma --script
    echo ""
    echo "Consider running: npx prisma migrate deploy"
    exit 1
fi

echo ""
echo "🔍 Checking for pending migrations..."
STATUS_OUTPUT=$(npx prisma migrate status 2>&1)

if echo "$STATUS_OUTPUT" | grep -q "Database schema is up to date"; then
    echo "✅ No pending migrations"
elif echo "$STATUS_OUTPUT" | grep -q "pending migration"; then
    echo "⚠️  Pending migrations detected"
    echo ""
    echo "$STATUS_OUTPUT"
    echo ""
    echo "Run: npx prisma migrate deploy"
    exit 1
else
    echo "✅ All migrations applied"
fi

echo ""
echo "🔍 Verifying new tables exist..."

TABLES=(
    "budgets"
    "cost_tracking"
    "shipments"
    "shipment_events"
    "shipment_items"
    "benchmark_participation"
    "benchmark_snapshots"
    "dashboard_layouts"
    "user_preferences"
)

MISSING_TABLES=0

for table in "${TABLES[@]}"; do
    if psql "$DATABASE_URL" -c "SELECT 1 FROM $table LIMIT 0" > /dev/null 2>&1; then
        echo "  ✓ $table"
    else
        echo "  ✗ $table (MISSING)"
        MISSING_TABLES=$((MISSING_TABLES + 1))
    fi
done

if [ $MISSING_TABLES -gt 0 ]; then
    echo ""
    echo "❌ $MISSING_TABLES table(s) missing"
    echo "Run migrations: npx prisma migrate deploy"
    exit 1
fi

echo ""
echo "🔍 Verifying new columns exist..."

# Check key columns
COLUMNS=(
    "products:unit_cost"
    "products:supplier_lead_days"
    "products:total_lead_days"
    "products:projected_stockout_date"
)

MISSING_COLUMNS=0

for item in "${COLUMNS[@]}"; do
    IFS=':' read -r table column <<< "$item"
    if psql "$DATABASE_URL" -c "SELECT $column FROM $table LIMIT 0" > /dev/null 2>&1; then
        echo "  ✓ $table.$column"
    else
        echo "  ✗ $table.$column (MISSING)"
        MISSING_COLUMNS=$((MISSING_COLUMNS + 1))
    fi
done

if [ $MISSING_COLUMNS -gt 0 ]; then
    echo ""
    echo "❌ $MISSING_COLUMNS column(s) missing"
    echo "Run migrations: npx prisma migrate deploy"
    exit 1
fi

echo ""
echo "================================================"
echo "✅ Schema Validation Successful!"
echo "================================================"
echo ""
echo "Summary:"
echo "  - All migrations applied"
echo "  - All tables exist"
echo "  - All key columns exist"
echo "  - Schema matches database"
echo ""
