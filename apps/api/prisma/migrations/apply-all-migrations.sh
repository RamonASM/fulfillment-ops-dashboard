#!/bin/bash

# ============================================================================
# Master Migration Script
# ============================================================================
# This script applies all pending migrations in the correct order
# Use this for initial setup or when applying all migrations at once
#
# Usage:
#   chmod +x apply-all-migrations.sh
#   ./apply-all-migrations.sh
# ============================================================================

set -e  # Exit on error

echo "================================================"
echo "Fulfillment Ops Dashboard - Database Migration"
echo "================================================"
echo ""

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ ERROR: DATABASE_URL environment variable is not set"
    echo "Please set DATABASE_URL and try again"
    echo ""
    echo "Example:"
    echo "  export DATABASE_URL='postgresql://user:password@localhost:5432/dbname'"
    exit 1
fi

echo "Database URL: ${DATABASE_URL%%@*}@***"
echo ""

# Confirm before proceeding
read -p "⚠️  This will apply migrations to your database. Continue? (y/N) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Migration cancelled"
    exit 0
fi

echo ""
echo "Starting migration process..."
echo ""

# Change to the API directory
cd "$(dirname "$0")/../.."

# Run Prisma migrate
echo "📦 Applying Prisma migrations..."
npx prisma migrate deploy

echo ""
echo "✅ All migrations applied successfully!"
echo ""

# Generate Prisma Client
echo "🔧 Generating Prisma Client..."
npx prisma generate

echo ""
echo "✅ Prisma Client generated successfully!"
echo ""

# Show migration status
echo "📊 Migration Status:"
npx prisma migrate status

echo ""
echo "================================================"
echo "Migration Complete!"
echo "================================================"
echo ""
echo "Next steps:"
echo "1. Restart your application servers"
echo "2. Verify new features are accessible"
echo "3. Populate initial data if needed (see MIGRATION_GUIDE.md)"
echo ""
