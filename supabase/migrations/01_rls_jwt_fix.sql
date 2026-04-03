-- =============================================================================
-- Migration: 01_rls_jwt_fix.sql
-- Fix RLS policies to read tenant_id from app_metadata (included in every
-- Supabase JWT automatically) rather than the top-level claims, which require
-- a custom Auth Hook to populate.
--
-- HOW TO ASSIGN tenant_id TO A STAFF USER:
--   Use the Supabase Admin API (from a trusted server/function) when creating
--   or updating the user:
--
--   supabaseAdmin.auth.admin.createUser({
--     email, password,
--     app_metadata: { tenant_id: '<uuid>' }
--   })
--
--   Or update an existing user:
--   supabaseAdmin.auth.admin.updateUserById(userId, {
--     app_metadata: { tenant_id: '<uuid>' }
--   })
--
--   The value is then available in JWT as:
--   auth.jwt()->'app_metadata'->>'tenant_id'
-- =============================================================================

-- Helper function so the expression is defined once and cached per query
CREATE OR REPLACE FUNCTION public.tenant_id() RETURNS uuid AS $$
  SELECT (auth.jwt()->'app_metadata'->>'tenant_id')::uuid;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Drop old policies (created by 00_tenant_schema.sql)
DROP POLICY IF EXISTS "Tenant Isolation - Guests"    ON guests;
DROP POLICY IF EXISTS "Tenant Isolation - Rooms"     ON rooms;
DROP POLICY IF EXISTS "Tenant Isolation - RoomTypes" ON room_types;
DROP POLICY IF EXISTS "Tenant Isolation - Bookings"  ON bookings;
DROP POLICY IF EXISTS "Tenant Isolation - Invoices"  ON invoices;

-- Re-create policies using app_metadata
CREATE POLICY "Tenant Isolation - Guests"
  ON guests
  USING (tenant_id = public.tenant_id());

CREATE POLICY "Tenant Isolation - Rooms"
  ON rooms
  USING (tenant_id = public.tenant_id());

CREATE POLICY "Tenant Isolation - RoomTypes"
  ON room_types
  USING (tenant_id = public.tenant_id());

CREATE POLICY "Tenant Isolation - Bookings"
  ON bookings
  USING (tenant_id = public.tenant_id());

CREATE POLICY "Tenant Isolation - Invoices"
  ON invoices
  USING (tenant_id = public.tenant_id());

-- Also update the auto-set trigger to use app_metadata
CREATE OR REPLACE FUNCTION set_tenant_id() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id = public.tenant_id();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
