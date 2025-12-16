-- Migration: Add Cross-Client Benchmarking
-- Description: Adds BenchmarkParticipation and BenchmarkSnapshot models for privacy-preserving performance comparison
-- Date: 2025-12-15

-- Create BenchmarkParticipation table
CREATE TABLE "benchmark_participation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_id" UUID NOT NULL,
    "is_participating" BOOLEAN NOT NULL DEFAULT false,
    "cohort" VARCHAR(50),
    "anonymous_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "joined_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "benchmark_participation_pkey" PRIMARY KEY ("id")
);

-- Create BenchmarkSnapshot table
CREATE TABLE "benchmark_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cohort" VARCHAR(50) NOT NULL,
    "period" DATE NOT NULL,
    "participant_count" INTEGER NOT NULL,

    -- Aggregated metrics
    "avg_product_count" DECIMAL(10,2) NOT NULL,
    "avg_order_frequency" DECIMAL(10,2) NOT NULL,
    "avg_stockout_rate" DECIMAL(5,4) NOT NULL,
    "avg_forecast_accuracy" DECIMAL(5,4) NOT NULL,
    "avg_inventory_turnover" DECIMAL(10,2) NOT NULL,

    -- Product count percentiles
    "p25_product_count" DECIMAL(10,2) NOT NULL,
    "p50_product_count" DECIMAL(10,2) NOT NULL,
    "p75_product_count" DECIMAL(10,2) NOT NULL,
    "p90_product_count" DECIMAL(10,2) NOT NULL,

    -- Order frequency percentiles
    "p25_order_frequency" DECIMAL(10,2) NOT NULL,
    "p50_order_frequency" DECIMAL(10,2) NOT NULL,
    "p75_order_frequency" DECIMAL(10,2) NOT NULL,
    "p90_order_frequency" DECIMAL(10,2) NOT NULL,

    -- Stockout rate percentiles
    "p25_stockout_rate" DECIMAL(5,4) NOT NULL,
    "p50_stockout_rate" DECIMAL(5,4) NOT NULL,
    "p75_stockout_rate" DECIMAL(5,4) NOT NULL,
    "p90_stockout_rate" DECIMAL(5,4) NOT NULL,

    -- Inventory turnover percentiles
    "p25_inventory_turnover" DECIMAL(10,2) NOT NULL,
    "p50_inventory_turnover" DECIMAL(10,2) NOT NULL,
    "p75_inventory_turnover" DECIMAL(10,2) NOT NULL,
    "p90_inventory_turnover" DECIMAL(10,2) NOT NULL,

    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "benchmark_snapshots_pkey" PRIMARY KEY ("id")
);

-- Create unique constraints
CREATE UNIQUE INDEX "benchmark_participation_client_id_key" ON "benchmark_participation"("client_id");
CREATE UNIQUE INDEX "benchmark_participation_anonymous_id_key" ON "benchmark_participation"("anonymous_id");
CREATE UNIQUE INDEX "benchmark_snapshots_cohort_period_key" ON "benchmark_snapshots"("cohort", "period");

-- Create indexes for BenchmarkParticipation
CREATE INDEX "benchmark_participation_cohort_is_participating_idx" ON "benchmark_participation"("cohort", "is_participating");

-- Create indexes for BenchmarkSnapshot
CREATE INDEX "benchmark_snapshots_period_idx" ON "benchmark_snapshots"("period");

-- Add foreign key constraints for BenchmarkParticipation
ALTER TABLE "benchmark_participation" ADD CONSTRAINT "benchmark_participation_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create trigger to update updated_at for benchmark_participation
CREATE OR REPLACE FUNCTION update_benchmark_participation_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER benchmark_participation_updated_at_trigger
    BEFORE UPDATE ON "benchmark_participation"
    FOR EACH ROW
    EXECUTE FUNCTION update_benchmark_participation_updated_at();

-- Add comment for privacy compliance
COMMENT ON TABLE "benchmark_snapshots" IS 'Aggregated benchmark data - minimum 5 participants required, no PII stored';
COMMENT ON COLUMN "benchmark_participation"."anonymous_id" IS 'Anonymous identifier for privacy-preserving benchmarking';
