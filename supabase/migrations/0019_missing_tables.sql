-- ============================================================
-- MIGRATION 0019: Add ALL missing tables and columns
-- Run this in Supabase SQL Editor to fix the blank pages.
-- ============================================================

-- 1. Add missing columns to businesses
DO $$ BEGIN
  ALTER TABLE businesses ADD COLUMN business_type text;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE businesses ADD COLUMN business_form text;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE businesses ADD COLUMN business_categories jsonb DEFAULT '[]'::jsonb;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 2. Create expenses table
CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  category text NOT NULL,
  description text NOT NULL,
  amount numeric NOT NULL CHECK (amount >= 0),
  frequency text NOT NULL DEFAULT 'monthly',
  start_date timestamptz NOT NULL DEFAULT now(),
  end_date timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_expenses_business ON expenses(business_id);

-- 3. Create expense_payments table
CREATE TABLE IF NOT EXISTS expense_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id uuid NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  paid_at timestamptz NOT NULL DEFAULT now(),
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_expense_payments_expense ON expense_payments(expense_id);

-- 4. Create debtors table
CREATE TABLE IF NOT EXISTS debtors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  customer_name text NOT NULL,
  customer_phone text,
  invoice_id uuid,
  original_amount numeric NOT NULL CHECK (original_amount >= 0),
  amount_paid numeric NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  amount_owed numeric NOT NULL DEFAULT 0 CHECK (amount_owed >= 0),
  status text NOT NULL DEFAULT 'pending',
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_debtors_business ON debtors(business_id);

-- 5. Create debtor_payments table
CREATE TABLE IF NOT EXISTS debtor_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debtor_id uuid NOT NULL REFERENCES debtors(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  note text DEFAULT '',
  paid_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_debtor_payments_debtor ON debtor_payments(debtor_id);

-- 6. Create creditors table
CREATE TABLE IF NOT EXISTS creditors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  supplier_name text NOT NULL,
  supplier_phone text,
  supplier_id uuid,
  original_amount numeric NOT NULL CHECK (original_amount >= 0),
  amount_paid numeric NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  amount_owed numeric NOT NULL DEFAULT 0 CHECK (amount_owed >= 0),
  status text NOT NULL DEFAULT 'pending',
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_creditors_business ON creditors(business_id);

-- 7. Create creditor_payments table
CREATE TABLE IF NOT EXISTS creditor_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creditor_id uuid NOT NULL REFERENCES creditors(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  note text DEFAULT '',
  paid_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_creditor_payments_creditor ON creditor_payments(creditor_id);

-- 8. Create invoices table
CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  created_by uuid,
  customer_name text,
  customer_phone text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal numeric NOT NULL DEFAULT 0,
  tax_rate numeric NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  grand_total numeric NOT NULL DEFAULT 0,
  payment_mode text NOT NULL DEFAULT 'full',
  amount_paid numeric NOT NULL DEFAULT 0,
  amount_owed numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'completed',
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invoices_branch ON invoices(branch_id);
CREATE INDEX IF NOT EXISTS idx_invoices_created ON invoices(created_at DESC);

-- 9. Create flagged_backdated_events table
CREATE TABLE IF NOT EXISTS flagged_backdated_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  details jsonb DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_flagged_events_business ON flagged_backdated_events(business_id, occurred_at DESC);

-- ============================================================
-- RLS POLICIES for new tables
-- ============================================================

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE debtors ENABLE ROW LEVEL SECURITY;
ALTER TABLE debtor_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE creditors ENABLE ROW LEVEL SECURITY;
ALTER TABLE creditor_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE flagged_backdated_events ENABLE ROW LEVEL SECURITY;

-- Expenses: manager + owner read, manager + owner write
DO $$ BEGIN
  CREATE POLICY expenses_read ON expenses FOR SELECT
    USING (business_id = current_business_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY expenses_insert ON expenses FOR INSERT
    WITH CHECK (current_user_role() IN ('manager', 'owner')
      AND business_id = current_business_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Expense payments
DO $$ BEGIN
  CREATE POLICY expense_payments_read ON expense_payments FOR SELECT
    USING (business_id = current_business_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY expense_payments_insert ON expense_payments FOR INSERT
    WITH CHECK (current_user_role() IN ('manager', 'owner')
      AND business_id = current_business_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Debtors
DO $$ BEGIN
  CREATE POLICY debtors_read ON debtors FOR SELECT
    USING (business_id = current_business_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY debtors_insert ON debtors FOR INSERT
    WITH CHECK (current_user_role() IN ('manager', 'owner')
      AND business_id = current_business_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY debtors_update ON debtors FOR UPDATE
    USING (current_user_role() IN ('manager', 'owner')
      AND business_id = current_business_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Debtor payments
DO $$ BEGIN
  CREATE POLICY debtor_payments_read ON debtor_payments FOR SELECT
    USING (debtor_id IN (SELECT id FROM debtors WHERE business_id = current_business_id()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY debtor_payments_insert ON debtor_payments FOR INSERT
    WITH CHECK (current_user_role() IN ('manager', 'owner'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Creditors
DO $$ BEGIN
  CREATE POLICY creditors_read ON creditors FOR SELECT
    USING (business_id = current_business_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY creditors_insert ON creditors FOR INSERT
    WITH CHECK (current_user_role() IN ('manager', 'owner')
      AND business_id = current_business_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY creditors_update ON creditors FOR UPDATE
    USING (current_user_role() IN ('manager', 'owner')
      AND business_id = current_business_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Creditor payments
DO $$ BEGIN
  CREATE POLICY creditor_payments_read ON creditor_payments FOR SELECT
    USING (creditor_id IN (SELECT id FROM creditors WHERE business_id = current_business_id()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY creditor_payments_insert ON creditor_payments FOR INSERT
    WITH CHECK (current_user_role() IN ('manager', 'owner'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Invoices
DO $$ BEGIN
  CREATE POLICY invoices_read ON invoices FOR SELECT
    USING (branch_id IN (SELECT id FROM branches WHERE business_id = current_business_id()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY invoices_insert ON invoices FOR INSERT
    WITH CHECK (current_user_role() IN ('manager', 'owner', 'staff')
      AND branch_id IN (SELECT id FROM branches WHERE business_id = current_business_id()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY invoices_update ON invoices FOR UPDATE
    USING (branch_id IN (SELECT id FROM branches WHERE business_id = current_business_id()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Flagged backdated events
DO $$ BEGIN
  CREATE POLICY flagged_events_read ON flagged_backdated_events FOR SELECT
    USING (business_id = current_business_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY flagged_events_insert ON flagged_backdated_events FOR INSERT
    WITH CHECK (current_user_role() IN ('manager', 'owner')
      AND business_id = current_business_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- DONE! All missing tables, columns, and policies created.
-- ============================================================
