-- Add CHECK constraint for valid item_type values
-- This ensures only 'evergreen', 'event', or 'completed' can be stored
-- The Python importer already validates this, but this adds DB-level protection

ALTER TABLE "products" ADD CONSTRAINT "products_item_type_check"
  CHECK (item_type IN ('evergreen', 'event', 'completed'));
