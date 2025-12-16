-- Migration: Add Dashboard Personalization
-- Description: Adds DashboardLayout and UserPreferences models for custom user experiences
-- Date: 2025-12-15

-- Create DashboardLayout table
CREATE TABLE "dashboard_layouts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "layout" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dashboard_layouts_pkey" PRIMARY KEY ("id")
);

-- Create UserPreferences table
CREATE TABLE "user_preferences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "default_view" VARCHAR(50) NOT NULL DEFAULT 'dashboard',
    "chart_color_scheme" VARCHAR(50) NOT NULL DEFAULT 'default',
    "compact_mode" BOOLEAN NOT NULL DEFAULT false,
    "enable_realtime" BOOLEAN NOT NULL DEFAULT true,
    "notification_settings" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

-- Create unique constraint for UserPreferences
CREATE UNIQUE INDEX "user_preferences_user_id_key" ON "user_preferences"("user_id");

-- Create indexes for DashboardLayout
CREATE INDEX "dashboard_layouts_user_id_idx" ON "dashboard_layouts"("user_id");
CREATE INDEX "dashboard_layouts_user_id_is_default_idx" ON "dashboard_layouts"("user_id", "is_default");

-- Add foreign key constraints for DashboardLayout
ALTER TABLE "dashboard_layouts" ADD CONSTRAINT "dashboard_layouts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add foreign key constraints for UserPreferences
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create trigger to update updated_at for dashboard_layouts
CREATE OR REPLACE FUNCTION update_dashboard_layouts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER dashboard_layouts_updated_at_trigger
    BEFORE UPDATE ON "dashboard_layouts"
    FOR EACH ROW
    EXECUTE FUNCTION update_dashboard_layouts_updated_at();

-- Create trigger to update updated_at for user_preferences
CREATE OR REPLACE FUNCTION update_user_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_preferences_updated_at_trigger
    BEFORE UPDATE ON "user_preferences"
    FOR EACH ROW
    EXECUTE FUNCTION update_user_preferences_updated_at();
