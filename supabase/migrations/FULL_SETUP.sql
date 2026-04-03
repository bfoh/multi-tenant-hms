-- =============================================================================
-- FULL SETUP: Run this once in the Supabase SQL Editor for the new project.
-- Paste the entire file. It is safe to run on a fresh database.
-- =============================================================================

-- -----------------------------------------------------------------------
-- EXTENSIONS
-- -----------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------------------------
-- BASE TABLES
-- (These are the original tables that existed before any migrations)
-- -----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.users (
    id          UUID PRIMARY KEY,
    email       TEXT,
    phone       TEXT,
    first_login INTEGER DEFAULT 1,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.hotel_settings (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name       TEXT NOT NULL,
    address    TEXT,
    phone      TEXT,
    email      TEXT,
    logo_url   TEXT,
    tax_rate   NUMERIC DEFAULT 0.10,
    currency   VARCHAR(10) DEFAULT 'GHS',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.room_types (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        TEXT NOT NULL,
    description TEXT,
    base_price  NUMERIC DEFAULT 0,
    capacity    INTEGER DEFAULT 2,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.rooms (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_number  TEXT UNIQUE NOT NULL,
    room_type_id UUID REFERENCES public.room_types(id) ON DELETE SET NULL,
    status       TEXT DEFAULT 'clean',
    price        NUMERIC DEFAULT 0,
    image_urls   TEXT[],
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.guests (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name       TEXT,
    email      TEXT,
    phone      TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.staff (
    id         TEXT PRIMARY KEY,
    name       TEXT,
    email      TEXT UNIQUE,
    role       TEXT DEFAULT 'staff',
    user_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.bookings (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    guest_id         UUID REFERENCES public.guests(id) ON DELETE SET NULL,
    user_id          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    room_id          UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
    check_in         DATE,
    check_out        DATE,
    status           TEXT DEFAULT 'confirmed',
    total_price      NUMERIC DEFAULT 0,
    num_guests       INTEGER DEFAULT 1,
    special_requests TEXT,
    source           TEXT,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.housekeeping_tasks (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id     UUID REFERENCES public.rooms(id) ON DELETE CASCADE,
    room_number TEXT,
    task_type   TEXT DEFAULT 'clean',
    status      TEXT DEFAULT 'pending',
    assigned_to TEXT,
    notes       TEXT,
    priority    TEXT DEFAULT 'normal',
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.activity_logs (
    id          TEXT PRIMARY KEY,
    user_id     UUID,
    action      TEXT,
    entity_type TEXT,
    entity_id   TEXT,
    details     TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------
-- MIGRATION: 20251219 — Create reviews table
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reviews (
    id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    booking_id   UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
    rating       INTEGER CHECK (rating >= 1 AND rating <= 5),
    comment      TEXT,
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------
-- MIGRATION: 20251221 — Persist reviews (add guest_name, relax FK)
-- -----------------------------------------------------------------------
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS guest_name TEXT;

-- -----------------------------------------------------------------------
-- MIGRATION: 20251222 — Add manager notification fields to hotel_settings
-- -----------------------------------------------------------------------
ALTER TABLE public.hotel_settings ADD COLUMN IF NOT EXISTS manager_email TEXT;
ALTER TABLE public.hotel_settings ADD COLUMN IF NOT EXISTS manager_phone TEXT;
ALTER TABLE public.hotel_settings ADD COLUMN IF NOT EXISTS manager_notifications_enabled BOOLEAN DEFAULT true;

-- -----------------------------------------------------------------------
-- MIGRATION: 20251222 — Add payment_method to bookings
-- -----------------------------------------------------------------------
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'Not paid';

-- -----------------------------------------------------------------------
-- MIGRATION: 20251222 — Add phone to staff
-- -----------------------------------------------------------------------
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS phone TEXT;

-- -----------------------------------------------------------------------
-- MIGRATION: 20251222 — Create booking_charges table
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.booking_charges (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id  UUID REFERENCES public.bookings(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    amount      NUMERIC NOT NULL DEFAULT 0,
    category    TEXT DEFAULT 'other' CHECK (category IN ('food', 'drinks', 'laundry', 'transport', 'other', 'room_extension')),
    quantity    INTEGER DEFAULT 1,
    notes       TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------
-- MIGRATION: 20251223 — Add invoice_number to bookings
-- -----------------------------------------------------------------------
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS invoice_number TEXT;
CREATE INDEX IF NOT EXISTS idx_bookings_invoice_number ON public.bookings(invoice_number);

-- -----------------------------------------------------------------------
-- MIGRATION: 20251223 — Add room_extension category (already in check above)
-- -----------------------------------------------------------------------

-- -----------------------------------------------------------------------
-- MIGRATION: 20251224 — Add discount to bookings
-- -----------------------------------------------------------------------
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS discount NUMERIC DEFAULT 0;

-- -----------------------------------------------------------------------
-- MIGRATION: 20251224 — Seed default room types
-- -----------------------------------------------------------------------
INSERT INTO public.room_types (id, name, description, base_price, capacity, created_at, updated_at)
VALUES
    (gen_random_uuid(), 'Standard Room',  'Comfortable standard room with essential amenities', 200, 2, NOW(), NOW()),
    (gen_random_uuid(), 'Deluxe Room',    'Spacious deluxe room with premium amenities',        300, 2, NOW(), NOW()),
    (gen_random_uuid(), 'Suite',          'Luxurious suite with separate living area',           500, 4, NOW(), NOW()),
    (gen_random_uuid(), 'Executive Room', 'Executive room with business amenities',              400, 2, NOW(), NOW()),
    (gen_random_uuid(), 'Family Room',    'Large family room accommodating up to 6 guests',      600, 6, NOW(), NOW())
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------
-- MIGRATION: 20260111 — Create marketing_templates table
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketing_templates (
    id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name       TEXT NOT NULL,
    channel    TEXT NOT NULL CHECK (channel IN ('sms', 'email')),
    subject    TEXT,
    content    TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------
-- MIGRATION: 20260114 — Guest portal: service_requests + guest_token
-- -----------------------------------------------------------------------
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS guest_token UUID DEFAULT gen_random_uuid();
CREATE INDEX IF NOT EXISTS idx_bookings_guest_token ON public.bookings(guest_token);

CREATE TABLE IF NOT EXISTS public.service_requests (
    id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    booking_id   UUID REFERENCES public.bookings(id) ON DELETE CASCADE,
    guest_token  UUID,
    request_type TEXT,
    description  TEXT,
    status       TEXT DEFAULT 'pending',
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------
-- MIGRATION: 20260116 — Staff can delete service requests
-- -----------------------------------------------------------------------
ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can delete requests" ON public.service_requests;
CREATE POLICY "Staff can delete requests"
ON public.service_requests FOR DELETE
TO authenticated
USING (true);

-- -----------------------------------------------------------------------
-- MIGRATION: 20260123 — Channel manager tables
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.channel_connections (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id  TEXT NOT NULL,
    name        TEXT NOT NULL,
    status      TEXT DEFAULT 'inactive',
    credentials JSONB,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.channel_room_mappings (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id        TEXT NOT NULL,
    room_id           UUID REFERENCES public.rooms(id) ON DELETE CASCADE,
    external_room_id  TEXT,
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.external_bookings (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id          TEXT NOT NULL,
    external_booking_id TEXT,
    booking_id          UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
    raw_data            JSONB,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------
-- MIGRATION: 20260328 — Add payment_method to booking_charges
-- -----------------------------------------------------------------------
ALTER TABLE public.booking_charges ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'cash';

-- -----------------------------------------------------------------------
-- MIGRATION: 20260328 — Create standalone_sales table
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.standalone_sales (
    id             TEXT PRIMARY KEY,
    items          JSONB,
    total          NUMERIC DEFAULT 0,
    payment_method TEXT DEFAULT 'cash',
    staff_id       TEXT,
    notes          TEXT,
    created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------
-- MULTI-TENANT MIGRATION: 00_tenant_schema
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tenants (
    id                              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    domain                          TEXT UNIQUE NOT NULL,
    name                            TEXT NOT NULL,
    address                         TEXT,
    phone                           TEXT,
    email                           TEXT,
    logo_url                        TEXT,
    tax_rate                        NUMERIC DEFAULT 0.10,
    currency                        VARCHAR(10) DEFAULT 'GHS',
    manager_email                   TEXT,
    manager_phone                   TEXT,
    manager_notifications_enabled   BOOLEAN DEFAULT true,
    resend_api_key                  TEXT,
    arkesel_api_key                 TEXT,
    arkesel_sender_id               TEXT,
    created_at                      TIMESTAMPTZ DEFAULT NOW(),
    updated_at                      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.guests       ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);
ALTER TABLE public.rooms        ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);
ALTER TABLE public.room_types   ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);
ALTER TABLE public.bookings     ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);
ALTER TABLE public.staff        ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);

-- -----------------------------------------------------------------------
-- MULTI-TENANT MIGRATION: 01_rls_jwt_fix
-- -----------------------------------------------------------------------

-- Helper: reads tenant_id from the JWT app_metadata (set via Admin API)
CREATE OR REPLACE FUNCTION public.tenant_id() RETURNS uuid AS $$
    SELECT (auth.jwt()->'app_metadata'->>'tenant_id')::uuid;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Enable RLS
ALTER TABLE public.tenants      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guests       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_types   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff        ENABLE ROW LEVEL SECURITY;

-- Tenants table: publicly readable so the frontend can look up by domain
CREATE POLICY "Public Tenant Read" ON public.tenants FOR SELECT USING (true);

-- All other tables: only show rows belonging to the authenticated user's tenant
CREATE POLICY "Tenant Isolation - Guests"
    ON public.guests USING (tenant_id = public.tenant_id());

CREATE POLICY "Tenant Isolation - Rooms"
    ON public.rooms USING (tenant_id = public.tenant_id());

CREATE POLICY "Tenant Isolation - RoomTypes"
    ON public.room_types USING (tenant_id = public.tenant_id());

CREATE POLICY "Tenant Isolation - Bookings"
    ON public.bookings USING (tenant_id = public.tenant_id());

CREATE POLICY "Tenant Isolation - Staff"
    ON public.staff USING (tenant_id = public.tenant_id());

-- Auto-set tenant_id on insert if caller is authenticated
CREATE OR REPLACE FUNCTION public.set_tenant_id() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.tenant_id IS NULL THEN
        NEW.tenant_id = public.tenant_id();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trigger_set_guest_tenant
    BEFORE INSERT ON public.guests FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();

CREATE OR REPLACE TRIGGER trigger_set_room_tenant
    BEFORE INSERT ON public.rooms FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();

CREATE OR REPLACE TRIGGER trigger_set_booking_tenant
    BEFORE INSERT ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();

CREATE OR REPLACE TRIGGER trigger_set_staff_tenant
    BEFORE INSERT ON public.staff FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();

-- -----------------------------------------------------------------------
-- GUEST PORTAL RPCs (from migrations 20260114–20260116)
-- -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.login_guest(p_room_num text, p_name_input text)
RETURNS json
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
    v_room        RECORD;
    v_booking     RECORD;
    v_guest_name  TEXT;
BEGIN
    SELECT id INTO v_room FROM public.rooms WHERE room_number = p_room_num LIMIT 1;
    IF NOT FOUND THEN
        RETURN json_build_object('error', 'Invalid room number');
    END IF;

    SELECT b.id, b.status, b.check_in, b.check_out, b.guest_token, b.guest_id
    INTO v_booking
    FROM public.bookings b
    WHERE b.room_id = v_room.id
      AND b.status IN ('confirmed', 'checked-in')
      AND (b.check_out IS NULL OR b.check_out >= CURRENT_DATE)
    ORDER BY b.check_in DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN json_build_object('error', 'No active booking found');
    END IF;

    SELECT name INTO v_guest_name FROM public.guests WHERE id = v_booking.guest_id;

    IF lower(v_guest_name) NOT LIKE lower(p_name_input) || '%' THEN
        RETURN json_build_object('error', 'Name does not match');
    END IF;

    RETURN json_build_object(
        'success', true,
        'token', v_booking.guest_token,
        'guestName', v_guest_name
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_guest_request(
    token_input uuid,
    request_type_input text,
    description_input text
)
RETURNS json
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
    v_booking RECORD;
BEGIN
    SELECT id INTO v_booking FROM public.bookings WHERE guest_token = token_input LIMIT 1;
    IF NOT FOUND THEN
        RETURN json_build_object('error', 'Invalid token');
    END IF;

    INSERT INTO public.service_requests (booking_id, guest_token, request_type, description)
    VALUES (v_booking.id, token_input, request_type_input, description_input);

    RETURN json_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_guest_requests(token_input uuid)
RETURNS TABLE (
    id uuid,
    request_type text,
    description text,
    status text,
    created_at timestamptz
)
SECURITY DEFINER
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT sr.id, sr.request_type, sr.description, sr.status, sr.created_at
    FROM public.service_requests sr
    WHERE sr.guest_token = token_input
    ORDER BY sr.created_at DESC;
END;
$$;
