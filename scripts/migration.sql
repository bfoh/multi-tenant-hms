-- ============================================================
-- AMP Lodge HMS — Supabase Migration
-- Run this entire script in the Supabase SQL Editor
-- ============================================================

-- 1. Ensure staff table has user_id and necessary columns
ALTER TABLE IF EXISTS staff ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE IF EXISTS staff ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE IF EXISTS staff ADD COLUMN IF NOT EXISTS role text;

-- 2. Create standalone_sales table
CREATE TABLE IF NOT EXISTS standalone_sales (
    id text PRIMARY KEY,
    description text NOT NULL,
    category text DEFAULT 'other',
    quantity integer DEFAULT 1,
    unit_price decimal(12,2) DEFAULT 0,
    amount decimal(12,2) DEFAULT 0,
    notes text DEFAULT '',
    staff_id text,
    staff_name text,
    sale_date date DEFAULT CURRENT_DATE,
    payment_method text DEFAULT 'cash',
    created_at timestamptz DEFAULT now()
);

-- 3. Create hr_weekly_revenue table
CREATE TABLE IF NOT EXISTS hr_weekly_revenue (
    id text PRIMARY KEY,
    staff_id text,
    staff_name text,
    week_start date,
    week_end date,
    total_revenue decimal(12,2) DEFAULT 0,
    booking_count integer DEFAULT 0,
    booking_ids text DEFAULT '[]',
    status text DEFAULT 'draft',
    notes text DEFAULT '',
    admin_notes text DEFAULT '',
    reviewed_by text DEFAULT '',
    reviewed_at timestamptz,
    submitted_at timestamptz,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 4. Update bookings table for revenue attribution
ALTER TABLE IF EXISTS bookings ADD COLUMN IF NOT EXISTS created_by text;
ALTER TABLE IF EXISTS bookings ADD COLUMN IF NOT EXISTS created_by_name text;
ALTER TABLE IF EXISTS bookings ADD COLUMN IF NOT EXISTS total_price decimal(12,2) DEFAULT 0;

-- 5. Disable RLS on these tables so staff can read/write freely
--    (the app uses Supabase service-role-equivalent anon key with these tables)
ALTER TABLE standalone_sales DISABLE ROW LEVEL SECURITY;
ALTER TABLE hr_weekly_revenue DISABLE ROW LEVEL SECURITY;

-- 6. If RLS is already enabled and you prefer policies over disabling, use these instead:
-- DROP POLICY IF EXISTS "allow_all_standalone_sales" ON standalone_sales;
-- CREATE POLICY "allow_all_standalone_sales" ON standalone_sales FOR ALL USING (true) WITH CHECK (true);
-- DROP POLICY IF EXISTS "allow_all_hr_weekly_revenue" ON hr_weekly_revenue;
-- CREATE POLICY "allow_all_hr_weekly_revenue" ON hr_weekly_revenue FOR ALL USING (true) WITH CHECK (true);

-- 7. Grant access to anon and authenticated roles
GRANT ALL ON standalone_sales TO anon, authenticated;
GRANT ALL ON hr_weekly_revenue TO anon, authenticated;

-- Done
