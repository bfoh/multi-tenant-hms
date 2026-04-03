-- =============================================================================
-- Migration: 02_tenant_columns.sql
-- Add Arkesel SMS columns to the tenants table.
--
-- The original schema (00_tenant_schema.sql) included `twilio_api_key` which
-- was never used. The API code in api/send-sms.ts reads `arkesel_api_key` and
-- `arkesel_sender_id`. This migration adds the correct columns.
-- =============================================================================

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS arkesel_api_key    TEXT,
  ADD COLUMN IF NOT EXISTS arkesel_sender_id  TEXT;

-- Rename the unused twilio column to avoid confusion.
-- If you are running this against a fresh database (00_ hasn't run on prod yet),
-- the column may not exist — the DO block handles that gracefully.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenants' AND column_name = 'twilio_api_key'
  ) THEN
    ALTER TABLE tenants RENAME COLUMN twilio_api_key TO twilio_api_key_unused;
  END IF;
END $$;
