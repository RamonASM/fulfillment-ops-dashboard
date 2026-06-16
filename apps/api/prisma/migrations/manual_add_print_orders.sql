-- Four51 print-order tables (PrintOrder / PrintOrderLine).
--
-- Preferred apply path: `npm run db:push -w apps/api` (syncs from schema.prisma),
-- or `npm run db:migrate -w apps/api` to create a tracked migration.
-- This raw DDL is a reviewable fallback you can run directly with psql.
-- Safe to re-run (IF NOT EXISTS guards).

CREATE TABLE IF NOT EXISTS "print_orders" (
  "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "client_id"       UUID NOT NULL,
  "four51_order_id" VARCHAR(100) NOT NULL,
  "source"          VARCHAR(50) NOT NULL DEFAULT 'four51_cxml',
  "order_type"      VARCHAR(50),
  "status"          VARCHAR(50) NOT NULL DEFAULT 'received',
  "order_date"      TIMESTAMPTZ,
  "total_amount"    VARCHAR(50),
  "currency"        VARCHAR(10),
  "ship_to_company" VARCHAR(255),
  "ship_to_name"    VARCHAR(255),
  "ship_to_city"    VARCHAR(255),
  "ship_to_state"   VARCHAR(100),
  "payload_id"      VARCHAR(255),
  "raw_cxml"        TEXT,
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "print_orders_client_fk"
    FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "print_orders_client_four51_uq"
  ON "print_orders" ("client_id", "four51_order_id");
CREATE INDEX IF NOT EXISTS "print_orders_client_idx" ON "print_orders" ("client_id");
CREATE INDEX IF NOT EXISTS "print_orders_status_idx" ON "print_orders" ("status");

CREATE TABLE IF NOT EXISTS "print_order_lines" (
  "id"                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "print_order_id"      UUID NOT NULL,
  "line_number"         INTEGER NOT NULL,
  "product_id"          VARCHAR(100) NOT NULL,
  "variant_id"          VARCHAR(100),
  "description"         VARCHAR(255),
  "product_type"        VARCHAR(50),
  "quantity"            INTEGER NOT NULL DEFAULT 0,
  "quantity_multiplier" INTEGER NOT NULL DEFAULT 1,
  "unit_price"          VARCHAR(50),
  "title_line_1"        VARCHAR(500),
  "title_line_2"        VARCHAR(500),
  "specs"               JSONB NOT NULL DEFAULT '{}',
  "production_pdf_url"  VARCHAR(1000),
  "created_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "print_order_lines_order_fk"
    FOREIGN KEY ("print_order_id") REFERENCES "print_orders"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "print_order_lines_order_idx"
  ON "print_order_lines" ("print_order_id");
