-- Migration: Add Shipment Tracking
-- Description: Adds Shipment, ShipmentEvent, and ShipmentItem models for order tracking
-- Date: 2025-12-15

-- Create Shipment table
CREATE TABLE "shipments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_request_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "carrier" VARCHAR(100) NOT NULL,
    "carrier_name" VARCHAR(255),
    "tracking_number" VARCHAR(100) NOT NULL,
    "tracking_url" VARCHAR(500),
    "status" VARCHAR(50) NOT NULL DEFAULT 'pending',
    "shipped_at" TIMESTAMPTZ,
    "estimated_delivery" DATE,
    "delivered_at" TIMESTAMPTZ,
    "destination_city" VARCHAR(100),
    "destination_state" VARCHAR(100),
    "package_count" INTEGER NOT NULL DEFAULT 1,
    "service_level" VARCHAR(100),
    "exception_reason" TEXT,
    "is_manual" BOOLEAN NOT NULL DEFAULT true,
    "last_polled_at" TIMESTAMPTZ,
    "raw_tracking_data" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "shipments_pkey" PRIMARY KEY ("id")
);

-- Create ShipmentEvent table
CREATE TABLE "shipment_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shipment_id" UUID NOT NULL,
    "status" VARCHAR(50) NOT NULL,
    "description" TEXT NOT NULL,
    "location" VARCHAR(255),
    "event_time" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipment_events_pkey" PRIMARY KEY ("id")
);

-- Create ShipmentItem table
CREATE TABLE "shipment_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shipment_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "order_item_id" UUID,
    "quantity_packs" INTEGER NOT NULL,
    "quantity_units" INTEGER NOT NULL,

    CONSTRAINT "shipment_items_pkey" PRIMARY KEY ("id")
);

-- Create indexes for Shipment
CREATE INDEX "shipments_order_request_id_idx" ON "shipments"("order_request_id");
CREATE INDEX "shipments_client_id_status_idx" ON "shipments"("client_id", "status");
CREATE INDEX "shipments_tracking_number_idx" ON "shipments"("tracking_number");

-- Create indexes for ShipmentEvent
CREATE INDEX "shipment_events_shipment_id_event_time_idx" ON "shipment_events"("shipment_id", "event_time");

-- Create indexes for ShipmentItem
CREATE INDEX "shipment_items_shipment_id_idx" ON "shipment_items"("shipment_id");

-- Add foreign key constraints for Shipment
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order_request_id_fkey" FOREIGN KEY ("order_request_id") REFERENCES "order_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Add foreign key constraints for ShipmentEvent
ALTER TABLE "shipment_events" ADD CONSTRAINT "shipment_events_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add foreign key constraints for ShipmentItem
ALTER TABLE "shipment_items" ADD CONSTRAINT "shipment_items_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shipment_items" ADD CONSTRAINT "shipment_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "shipment_items" ADD CONSTRAINT "shipment_items_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_request_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Create trigger to update updated_at for shipments
CREATE OR REPLACE FUNCTION update_shipments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER shipments_updated_at_trigger
    BEFORE UPDATE ON "shipments"
    FOR EACH ROW
    EXECUTE FUNCTION update_shipments_updated_at();
