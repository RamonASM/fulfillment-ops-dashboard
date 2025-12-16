#!/bin/sh
set -ex # Enable debugging and exit on error

# Wait for database to be ready
echo "Waiting for database connection..."
until pg_isready -h ${DATABASE_HOST:-postgres} -p ${DATABASE_PORT:-5432} -U ${DB_USER:-inventory}; do
  echo "Database not ready, waiting..."
  sleep 2
done
echo "Database is ready!"

# Run Prisma Generate to ensure client is up-to-date
echo "Running Prisma Generate..."
npx prisma generate || { echo "Prisma Generate failed!"; exit 1; }

# Use db push instead of migrate deploy (no migrations folder exists)
# This synchronizes the schema without requiring migration files
echo "Synchronizing database schema with Prisma db push..."
npx prisma db push --accept-data-loss || { echo "Prisma db push failed!"; exit 1; }

# Run database seeding
echo "Running database seeding..."
npx tsx prisma/seed.ts || { echo "Database seeding failed!"; exit 1; }

# Execute the main container command (CMD)
exec "$@"
