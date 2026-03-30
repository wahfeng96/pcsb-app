-- Commission feature migration
-- Run this in Supabase Dashboard > SQL Editor

-- 1. Add commission_percent to bookings
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS commission_percent numeric DEFAULT 0;

-- 2. Create commissions table
CREATE TABLE IF NOT EXISTS commissions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id uuid REFERENCES bookings(id) ON DELETE CASCADE,
  month text NOT NULL,
  amount numeric DEFAULT 0,
  status text DEFAULT 'pending_payment' CHECK (status IN ('pending_payment', 'waiting_to_be_paid', 'settled')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(booking_id, month)
);

-- 3. Enable RLS
ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;

-- 4. RLS policies
CREATE POLICY "commissions_service_role" ON commissions FOR ALL TO service_role USING (true);
CREATE POLICY "commissions_auth_select" ON commissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "commissions_auth_insert" ON commissions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "commissions_auth_update" ON commissions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "commissions_auth_delete" ON commissions FOR DELETE TO authenticated USING (true);
