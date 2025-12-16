#!/bin/bash

# ============================================================================
# Migration Rollback Template
# ============================================================================
# This script helps create rollback migrations
# Modify the MIGRATION_NAME and SQL_FILE variables for your specific rollback
#
# Usage:
#   chmod +x rollback-template.sh
#   ./rollback-template.sh
# ============================================================================

set -e  # Exit on error

# Configuration - MODIFY THESE
MIGRATION_NAME="rollback_feature_name"
ROLLBACK_SQL="rollback.sql"

echo "================================================"
echo "Creating Rollback Migration"
echo "================================================"
echo ""

# Check if we're in the right directory
if [ ! -f "schema.prisma" ]; then
    echo "❌ ERROR: schema.prisma not found"
    echo "Please run this script from the prisma directory"
    exit 1
fi

echo "Migration name: $MIGRATION_NAME"
echo ""

# Confirm before proceeding
read -p "⚠️  This will create a new migration. Continue? (y/N) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Rollback cancelled"
    exit 0
fi

echo ""

# Create migration directory
TIMESTAMP=$(date +%Y%m%d%H%M%S)
MIGRATION_DIR="migrations/${TIMESTAMP}_${MIGRATION_NAME}"

echo "Creating migration directory: $MIGRATION_DIR"
mkdir -p "$MIGRATION_DIR"

# Check if rollback SQL file exists
if [ ! -f "$ROLLBACK_SQL" ]; then
    echo "⚠️  Warning: $ROLLBACK_SQL not found"
    echo "Creating empty migration file..."
    echo "-- Add your rollback SQL here" > "$MIGRATION_DIR/migration.sql"
else
    echo "Copying $ROLLBACK_SQL to migration..."
    cp "$ROLLBACK_SQL" "$MIGRATION_DIR/migration.sql"
fi

echo ""
echo "✅ Rollback migration created!"
echo ""
echo "Next steps:"
echo "1. Edit the migration file: $MIGRATION_DIR/migration.sql"
echo "2. Add your rollback SQL statements"
echo "3. Test on a backup database first"
echo "4. Apply migration: npx prisma migrate deploy"
echo ""

# Example rollback SQL templates
cat > "$MIGRATION_DIR/README.md" <<EOF
# Rollback Migration: $MIGRATION_NAME

## Purpose
Describe what this rollback does

## Original Migration
Reference the migration being rolled back

## Impact
- Tables affected:
- Data loss potential:
- Dependent features:

## Rollback SQL Templates

### Drop Table
\`\`\`sql
DROP TABLE IF EXISTS "table_name";
\`\`\`

### Drop Column
\`\`\`sql
ALTER TABLE "table_name" DROP COLUMN IF EXISTS "column_name";
\`\`\`

### Drop Index
\`\`\`sql
DROP INDEX IF EXISTS "index_name";
\`\`\`

### Drop Constraint
\`\`\`sql
ALTER TABLE "table_name" DROP CONSTRAINT IF EXISTS "constraint_name";
\`\`\`

### Drop Trigger
\`\`\`sql
DROP TRIGGER IF EXISTS "trigger_name" ON "table_name";
\`\`\`

### Drop Function
\`\`\`sql
DROP FUNCTION IF EXISTS "function_name"();
\`\`\`

## Testing
Test this rollback on a backup database before production:

\`\`\`bash
# Create test database
createdb test_rollback

# Restore backup
psql test_rollback < backup.sql

# Apply rollback
psql test_rollback -f $MIGRATION_DIR/migration.sql

# Verify
psql test_rollback -c "\\dt"
\`\`\`
EOF

echo "📝 Documentation template created: $MIGRATION_DIR/README.md"
echo ""
