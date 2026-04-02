-- 1. Create the `tenants` table
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    domain TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    address TEXT,
    phone TEXT,
    email TEXT,
    logo_url TEXT,
    tax_rate NUMERIC DEFAULT 0.10,
    currency VARCHAR(10) DEFAULT 'USD',
    manager_email TEXT,
    manager_phone TEXT,
    manager_notifications_enabled BOOLEAN DEFAULT true,
    resend_api_key TEXT, -- Encrypted in production systems
    twilio_api_key TEXT, -- Encrypted in production systems
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Add `tenant_id` to existing application tables
ALTER TABLE guests ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE rooms ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE room_types ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE bookings ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE invoices ADD COLUMN tenant_id UUID REFERENCES tenants(id);

-- 3. Enable RLS
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS Policies based on auth.jwt()
-- Publicly readable so the frontend can query 'tenants' by 'domain' without being logged in
CREATE POLICY "Public Tenant Read" ON tenants FOR SELECT USING (true); 

-- For application data: restrict access to rows where tenant_id matches the admin's session tenant
CREATE POLICY "Tenant Isolation - Guests" ON guests USING (tenant_id = (select (auth.jwt()->>'tenant_id')::uuid));
CREATE POLICY "Tenant Isolation - Rooms" ON rooms USING (tenant_id = (select (auth.jwt()->>'tenant_id')::uuid));
CREATE POLICY "Tenant Isolation - RoomTypes" ON room_types USING (tenant_id = (select (auth.jwt()->>'tenant_id')::uuid));
CREATE POLICY "Tenant Isolation - Bookings" ON bookings USING (tenant_id = (select (auth.jwt()->>'tenant_id')::uuid));
CREATE POLICY "Tenant Isolation - Invoices" ON invoices USING (tenant_id = (select (auth.jwt()->>'tenant_id')::uuid));

-- 5. Trigger for New Inserts to automatically map to the active JWT Tenant
CREATE OR REPLACE FUNCTION set_tenant_id() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id = (auth.jwt()->>'tenant_id')::uuid;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_guest_tenant BEFORE INSERT ON guests FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
CREATE TRIGGER trigger_set_room_tenant BEFORE INSERT ON rooms FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
CREATE TRIGGER trigger_set_booking_tenant BEFORE INSERT ON bookings FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
