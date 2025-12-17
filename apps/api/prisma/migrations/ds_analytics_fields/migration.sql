-- Migration: Add DS Analytics Intelligence Fields
-- Adds fields for advanced usage calculation, trending, and predictions

-- Add usage intelligence fields to products table
ALTER TABLE "products"
ADD COLUMN IF NOT EXISTS "usage_data_months" INTEGER,
ADD COLUMN IF NOT EXISTS "usage_calculation_tier" TEXT,
ADD COLUMN IF NOT EXISTS "usage_calculation_method" TEXT,
ADD COLUMN IF NOT EXISTS "usage_trend" TEXT,
ADD COLUMN IF NOT EXISTS "seasonality_detected" BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS "projected_stockout_date" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "stockout_confidence" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS "suggested_reorder_qty" INTEGER,
ADD COLUMN IF NOT EXISTS "reorder_qty_last_updated" TIMESTAMP(3);

-- Create index on stock_status for dashboard queries
CREATE INDEX IF NOT EXISTS "idx_products_stock_status" ON "products"("stock_status");

-- Create index on usage_confidence for reporting
CREATE INDEX IF NOT EXISTS "idx_products_usage_confidence" ON "products"("usage_confidence");

-- Create index on projected_stockout_date for alert generation
CREATE INDEX IF NOT EXISTS "idx_products_stockout_date" ON "products"("projected_stockout_date")
WHERE "projected_stockout_date" IS NOT NULL;

-- Create monthly_usage_snapshots table if it doesn't exist
CREATE TABLE IF NOT EXISTS "monthly_usage_snapshots" (
  "id" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "year_month" TEXT NOT NULL,
  "consumed_units" INTEGER NOT NULL DEFAULT 0,
  "consumed_packs" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "transaction_count" INTEGER NOT NULL DEFAULT 0,
  "order_count" INTEGER NOT NULL DEFAULT 0,
  "calculation_method" TEXT,
  "confidence" DOUBLE PRECISION,
  "is_outlier" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "monthly_usage_snapshots_pkey" PRIMARY KEY ("id")
);

-- Add foreign key constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'monthly_usage_snapshots_product_id_fkey'
  ) THEN
    ALTER TABLE "monthly_usage_snapshots"
    ADD CONSTRAINT "monthly_usage_snapshots_product_id_fkey"
    FOREIGN KEY ("product_id")
    REFERENCES "products"("id")
    ON DELETE CASCADE;
  END IF;
END $$;

-- Create unique constraint on product_id + year_month
CREATE UNIQUE INDEX IF NOT EXISTS "monthly_usage_snapshots_product_id_year_month_key"
ON "monthly_usage_snapshots"("product_id", "year_month");

-- Create index for querying by product
CREATE INDEX IF NOT EXISTS "idx_monthly_usage_product_month"
ON "monthly_usage_snapshots"("product_id", "year_month");

-- Add comment
COMMENT ON TABLE "monthly_usage_snapshots" IS 'Historical monthly usage data for trend analysis and seasonality detection';
