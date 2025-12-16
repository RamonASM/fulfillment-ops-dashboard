-- Migration: Add Product Lead Time Fields
-- Description: Adds lead time tracking and order timing calculations to Product model
-- Date: 2025-12-15

-- Add lead time fields to Product table
ALTER TABLE "products" ADD COLUMN "supplier_lead_days" INTEGER;
ALTER TABLE "products" ADD COLUMN "shipping_lead_days" INTEGER;
ALTER TABLE "products" ADD COLUMN "processing_lead_days" INTEGER;
ALTER TABLE "products" ADD COLUMN "safety_buffer_days" INTEGER;
ALTER TABLE "products" ADD COLUMN "total_lead_days" INTEGER;
ALTER TABLE "products" ADD COLUMN "lead_time_source" VARCHAR(20);

-- Add timing calculation cache fields
ALTER TABLE "products" ADD COLUMN "projected_stockout_date" DATE;
ALTER TABLE "products" ADD COLUMN "last_order_by_date" DATE;
ALTER TABLE "products" ADD COLUMN "timing_last_calculated" TIMESTAMPTZ;

-- Add comments for documentation
COMMENT ON COLUMN "products"."supplier_lead_days" IS 'Number of days for supplier to fulfill order';
COMMENT ON COLUMN "products"."shipping_lead_days" IS 'Number of transit days for shipment';
COMMENT ON COLUMN "products"."processing_lead_days" IS 'Internal processing time in days';
COMMENT ON COLUMN "products"."safety_buffer_days" IS 'Extra cushion days for variability';
COMMENT ON COLUMN "products"."total_lead_days" IS 'Computed total lead time (sum of all components)';
COMMENT ON COLUMN "products"."lead_time_source" IS 'Source of lead time data: default, override, or imported';
COMMENT ON COLUMN "products"."projected_stockout_date" IS 'Calculated date when stock is expected to run out';
COMMENT ON COLUMN "products"."last_order_by_date" IS 'Latest date to place order to avoid stockout';

-- Create function to calculate total lead days
CREATE OR REPLACE FUNCTION calculate_total_lead_days()
RETURNS TRIGGER AS $$
BEGIN
    -- Only calculate if we have at least one lead time component
    IF NEW.supplier_lead_days IS NOT NULL OR
       NEW.shipping_lead_days IS NOT NULL OR
       NEW.processing_lead_days IS NOT NULL OR
       NEW.safety_buffer_days IS NOT NULL THEN

        NEW.total_lead_days := COALESCE(NEW.supplier_lead_days, 0) +
                               COALESCE(NEW.shipping_lead_days, 0) +
                               COALESCE(NEW.processing_lead_days, 0) +
                               COALESCE(NEW.safety_buffer_days, 0);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-calculate total_lead_days
CREATE TRIGGER calculate_product_total_lead_days
    BEFORE INSERT OR UPDATE OF supplier_lead_days, shipping_lead_days, processing_lead_days, safety_buffer_days
    ON "products"
    FOR EACH ROW
    EXECUTE FUNCTION calculate_total_lead_days();

-- Add check constraint to ensure total_lead_days is non-negative if set
ALTER TABLE "products" ADD CONSTRAINT "products_total_lead_days_check"
    CHECK (total_lead_days IS NULL OR total_lead_days >= 0);
