-- Migration: Add Financial Tracking
-- Description: Adds Budget and CostTracking models with product financial fields
-- Date: 2025-12-15

-- Add financial tracking fields to Product table
ALTER TABLE "products" ADD COLUMN "unit_cost" DECIMAL(10,2);
ALTER TABLE "products" ADD COLUMN "unit_price" DECIMAL(10,2);
ALTER TABLE "products" ADD COLUMN "reorder_cost" DECIMAL(10,2);
ALTER TABLE "products" ADD COLUMN "holding_cost_rate" DECIMAL(5,4);
ALTER TABLE "products" ADD COLUMN "last_cost_update" TIMESTAMPTZ;
ALTER TABLE "products" ADD COLUMN "cost_source" VARCHAR(50);

-- Create Budget table
CREATE TABLE "budgets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_id" UUID NOT NULL,
    "product_id" UUID,
    "period" VARCHAR(20) NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "allocated_amount" DECIMAL(12,2) NOT NULL,
    "spent_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "forecast_amount" DECIMAL(12,2),
    "variance" DECIMAL(12,2),
    "status" VARCHAR(20) NOT NULL,
    "alert_threshold" DECIMAL(5,2),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

-- Create CostTracking table
CREATE TABLE "cost_tracking" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "period" DATE NOT NULL,
    "units_ordered" INTEGER NOT NULL,
    "packs_ordered" INTEGER NOT NULL,
    "purchase_cost" DECIMAL(12,2) NOT NULL,
    "holding_cost" DECIMAL(12,2),
    "ordering_cost" DECIMAL(12,2),
    "shortage_cost" DECIMAL(12,2),
    "total_cost" DECIMAL(12,2) NOT NULL,
    "eoq_quantity" INTEGER,
    "eoq_savings" DECIMAL(12,2),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cost_tracking_pkey" PRIMARY KEY ("id")
);

-- Create indexes for Budget
CREATE INDEX "budgets_client_id_period_start_idx" ON "budgets"("client_id", "period_start");
CREATE INDEX "budgets_product_id_idx" ON "budgets"("product_id");

-- Create indexes for CostTracking
CREATE UNIQUE INDEX "cost_tracking_client_id_product_id_period_key" ON "cost_tracking"("client_id", "product_id", "period");
CREATE INDEX "cost_tracking_period_idx" ON "cost_tracking"("period");

-- Add foreign key constraints for Budget
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add foreign key constraints for CostTracking
ALTER TABLE "cost_tracking" ADD CONSTRAINT "cost_tracking_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cost_tracking" ADD CONSTRAINT "cost_tracking_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create trigger to update updated_at for budgets
CREATE OR REPLACE FUNCTION update_budgets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER budgets_updated_at_trigger
    BEFORE UPDATE ON "budgets"
    FOR EACH ROW
    EXECUTE FUNCTION update_budgets_updated_at();
