-- ============================================================
-- BRANCHPORT: COMPLETE DATABASE SCHEMA
-- Paste this ENTIRE file into Supabase SQL Editor and run it.
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Custom types
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('owner', 'manager', 'staff');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE sale_unit_type AS ENUM ('bulk', 'retail');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  role user_role NOT NULL,
  name text NOT NULL,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE businesses
  ADD CONSTRAINT businesses_owner_user_id_fkey
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  bulk_unit_name text NOT NULL,
  retail_unit_name text NOT NULL,
  units_per_bulk numeric NOT NULL CHECK (units_per_bulk > 0),
  bulk_cost_price numeric NOT NULL CHECK (bulk_cost_price >= 0),
  bulk_sell_price numeric NOT NULL CHECK (bulk_sell_price >= 0),
  retail_sell_price numeric NOT NULL CHECK (retail_sell_price >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name text NOT NULL,
  price numeric NOT NULL CHECK (price >= 0),
  base_units numeric NOT NULL DEFAULT 1 CHECK (base_units > 0),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_intake (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES suppliers(id),
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  bulk_quantity numeric NOT NULL CHECK (bulk_quantity > 0),
  cost_price_total numeric NOT NULL CHECK (cost_price_total >= 0),
  amount_paid numeric NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  amount_owed numeric GENERATED ALWAYS AS (cost_price_total - amount_paid) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS inventory_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  bulk_quantity numeric NOT NULL CHECK (bulk_quantity > 0),
  retail_quantity_equivalent numeric NOT NULL,
  allocated_at timestamptz NOT NULL DEFAULT now(),
  allocated_by uuid NOT NULL REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS sales (
  id uuid PRIMARY KEY,
  branch_id uuid NOT NULL REFERENCES branches(id),
  product_id uuid NOT NULL REFERENCES products(id),
  unit_type sale_unit_type NOT NULL,
  quantity numeric NOT NULL CHECK (quantity > 0),
  unit_price numeric NOT NULL CHECK (unit_price >= 0),
  total_price numeric NOT NULL CHECK (total_price >= 0),
  sold_by uuid NOT NULL REFERENCES users(id),
  sold_at timestamptz NOT NULL DEFAULT now(),
  client_reported_at timestamptz NOT NULL,
  price_flagged boolean NOT NULL DEFAULT false,
  customer_name text,
  customer_phone text,
  variant_id uuid REFERENCES product_variants(id) ON DELETE SET NULL,
  cut_price numeric,
  is_discounted boolean
);

CREATE TABLE IF NOT EXISTS supplier_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  note text,
  paid_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS supplier_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('confirmed', 'disputed')),
  note text,
  reconciled_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL REFERENCES users(id),
  action_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  before_state jsonb,
  after_state jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  client_reported_at timestamptz
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_branches_business ON branches(business_id);
CREATE INDEX IF NOT EXISTS idx_users_business ON users(business_id);
CREATE INDEX IF NOT EXISTS idx_products_business ON products(business_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_product ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_business ON suppliers(business_id);
CREATE INDEX IF NOT EXISTS idx_intake_business ON inventory_intake(business_id);
CREATE INDEX IF NOT EXISTS idx_intake_supplier ON inventory_intake(supplier_id);
CREATE INDEX IF NOT EXISTS idx_allocations_branch ON inventory_allocations(branch_id);
CREATE INDEX IF NOT EXISTS idx_sales_branch ON sales(branch_id);
CREATE INDEX IF NOT EXISTS idx_sales_sold_at ON sales(sold_at);
CREATE INDEX IF NOT EXISTS idx_audit_business ON audit_events(business_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_events(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_payments_supplier ON supplier_payments(supplier_id);
CREATE INDEX IF NOT EXISTS idx_reconciliations_supplier ON supplier_reconciliations(supplier_id);

CREATE UNIQUE INDEX IF NOT EXISTS users_business_phone_key
  ON users (business_id, phone) WHERE phone IS NOT NULL;

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION current_user_role() RETURNS user_role
LANGUAGE sql SECURITY definer STABLE AS $$
  SELECT role FROM users WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION current_business_id() RETURNS uuid
LANGUAGE sql SECURITY definer STABLE AS $$
  SELECT business_id FROM users WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION current_branch_id() RETURNS uuid
LANGUAGE sql SECURITY definer STABLE AS $$
  SELECT branch_id FROM users WHERE id = auth.uid();
$$;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_intake ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_reconciliations ENABLE ROW LEVEL SECURITY;

-- Businesses
CREATE POLICY business_read ON businesses FOR SELECT USING (id = current_business_id());
CREATE POLICY businesses_insert ON businesses FOR INSERT WITH CHECK (owner_user_id = auth.uid() OR auth.uid() IS NOT NULL);
CREATE POLICY businesses_update ON businesses FOR UPDATE USING (id = current_business_id() AND current_user_role() = 'owner');
CREATE POLICY businesses_delete ON businesses FOR DELETE USING (id = current_business_id() AND current_user_role() = 'owner');

-- Branches
CREATE POLICY branches_read ON branches FOR SELECT USING (business_id = current_business_id());
CREATE POLICY branches_write ON branches FOR INSERT WITH CHECK (
  business_id = current_business_id() AND current_user_role() IN ('manager', 'owner')
);
CREATE POLICY branches_update ON branches FOR UPDATE USING (business_id = current_business_id() AND current_user_role() IN ('manager', 'owner'));
CREATE POLICY branches_delete ON branches FOR DELETE USING (business_id = current_business_id() AND current_user_role() = 'owner');

-- Users
CREATE POLICY users_read ON users FOR SELECT USING (business_id = current_business_id());
CREATE POLICY users_read_self ON users FOR SELECT USING (id = auth.uid());
CREATE POLICY users_insert ON users FOR INSERT WITH CHECK (business_id = current_business_id() AND current_user_role() IN ('manager', 'owner'));
CREATE POLICY users_update ON users FOR UPDATE USING (business_id = current_business_id() AND current_user_role() IN ('manager', 'owner'));
CREATE POLICY users_delete ON users FOR DELETE USING (business_id = current_business_id() AND current_user_role() = 'owner');

-- Products (manager + owner can write)
CREATE POLICY products_read ON products FOR SELECT USING (business_id = current_business_id());
CREATE POLICY products_insert ON products FOR INSERT WITH CHECK (
  business_id = current_business_id() AND current_user_role() IN ('manager', 'owner')
);
CREATE POLICY products_update_manager ON products FOR UPDATE USING (
  business_id = current_business_id() AND current_user_role() = 'manager'
);
CREATE POLICY products_update_owner ON products FOR UPDATE USING (
  business_id = current_business_id() AND current_user_role() = 'owner'
);
CREATE POLICY products_delete ON products FOR DELETE USING (
  business_id = current_business_id() AND current_user_role() IN ('manager', 'owner')
);

-- Product Variants (manager + owner can write, update, delete)
CREATE POLICY product_variants_read ON product_variants FOR SELECT USING (
  product_id IN (SELECT id FROM products WHERE business_id = current_business_id())
);
CREATE POLICY product_variants_insert ON product_variants FOR INSERT WITH CHECK (
  current_user_role() IN ('manager', 'owner')
  AND product_id IN (SELECT id FROM products WHERE business_id = current_business_id())
);
CREATE POLICY product_variants_update ON product_variants FOR UPDATE USING (
  current_user_role() IN ('manager', 'owner')
  AND product_id IN (SELECT id FROM products WHERE business_id = current_business_id())
);
CREATE POLICY product_variants_delete ON product_variants FOR DELETE USING (
  current_user_role() IN ('manager', 'owner')
  AND product_id IN (SELECT id FROM products WHERE business_id = current_business_id())
);

-- Suppliers
CREATE POLICY suppliers_read ON suppliers FOR SELECT USING (
  business_id = current_business_id() AND current_user_role() IN ('manager', 'owner')
);
CREATE POLICY suppliers_insert ON suppliers FOR INSERT WITH CHECK (
  business_id = current_business_id() AND current_user_role() IN ('manager', 'owner')
);
CREATE POLICY suppliers_update ON suppliers FOR UPDATE USING (
  business_id = current_business_id() AND current_user_role() IN ('manager', 'owner')
);
CREATE POLICY suppliers_delete ON suppliers FOR DELETE USING (
  business_id = current_business_id() AND current_user_role() IN ('manager', 'owner')
);

-- Inventory Intake
CREATE POLICY intake_read ON inventory_intake FOR SELECT USING (
  business_id = current_business_id() AND current_user_role() IN ('manager', 'owner')
);
CREATE POLICY intake_insert ON inventory_intake FOR INSERT WITH CHECK (
  business_id = current_business_id() AND current_user_role() IN ('manager', 'owner')
);
CREATE POLICY intake_update ON inventory_intake FOR UPDATE USING (
  business_id = current_business_id() AND current_user_role() IN ('manager', 'owner')
);

-- Inventory Allocations
CREATE POLICY allocations_read_manager ON inventory_allocations FOR SELECT USING (
  current_user_role() IN ('manager', 'owner')
  AND branch_id IN (SELECT id FROM branches WHERE business_id = current_business_id())
);
CREATE POLICY allocations_read_staff ON inventory_allocations FOR SELECT USING (
  current_user_role() = 'staff' AND branch_id = current_branch_id()
);
CREATE POLICY allocations_insert ON inventory_allocations FOR INSERT WITH CHECK (
  current_user_role() IN ('manager', 'owner')
  AND branch_id IN (SELECT id FROM branches WHERE business_id = current_business_id())
);

-- Sales
CREATE POLICY sales_read_manager ON sales FOR SELECT USING (
  current_user_role() IN ('manager', 'owner')
  AND branch_id IN (SELECT id FROM branches WHERE business_id = current_business_id())
);
CREATE POLICY sales_read_staff ON sales FOR SELECT USING (
  current_user_role() = 'staff' AND branch_id = current_branch_id()
);
CREATE POLICY sales_insert_staff ON sales FOR INSERT WITH CHECK (
  current_user_role() = 'staff' AND branch_id = current_branch_id()
);

-- Audit Events
CREATE POLICY audit_read_owner ON audit_events FOR SELECT USING (
  current_user_role() = 'owner' AND business_id = current_business_id()
);
CREATE POLICY audit_insert_auth ON audit_events FOR INSERT WITH CHECK (
  business_id = current_business_id() AND actor_user_id = auth.uid()
);

-- Supplier Payments
CREATE POLICY payments_read ON supplier_payments FOR SELECT USING (
  business_id = current_business_id() AND current_user_role() IN ('manager', 'owner')
);
CREATE POLICY payments_insert ON supplier_payments FOR INSERT WITH CHECK (
  business_id = current_business_id() AND current_user_role() IN ('manager', 'owner')
);

-- Supplier Reconciliations
CREATE POLICY reconciliations_read ON supplier_reconciliations FOR SELECT USING (
  current_user_role() = 'owner' AND business_id = current_business_id()
);
CREATE POLICY reconciliations_insert ON supplier_reconciliations FOR INSERT WITH CHECK (
  current_user_role() = 'owner' AND business_id = current_business_id()
);

-- ============================================================
-- AUDIT TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION log_audit_event() RETURNS trigger
LANGUAGE plpgsql SECURITY definer AS $$
DECLARE
  v_business_id uuid;
  v_actor uuid := auth.uid();
BEGIN
  IF TG_TABLE_NAME IN ('products', 'suppliers', 'inventory_intake') THEN
    v_business_id := COALESCE(new.business_id, old.business_id);
  ELSIF TG_TABLE_NAME = 'product_variants' THEN
    SELECT business_id INTO v_business_id FROM products WHERE id = COALESCE(new.product_id, old.product_id);
  ELSIF TG_TABLE_NAME IN ('supplier_payments', 'supplier_reconciliations') THEN
    SELECT business_id INTO v_business_id FROM suppliers WHERE id = COALESCE(new.supplier_id, old.supplier_id);
  ELSIF TG_TABLE_NAME IN ('inventory_allocations', 'sales') THEN
    SELECT business_id INTO v_business_id FROM branches WHERE id = COALESCE(new.branch_id, old.branch_id);
  END IF;

  INSERT INTO audit_events (business_id, actor_user_id, action_type, entity_type, entity_id, before_state, after_state, occurred_at, client_reported_at)
  VALUES (v_business_id, v_actor, LOWER(TG_OP), TG_TABLE_NAME, COALESCE(new.id, old.id),
    CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(old) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(new) ELSE NULL END,
    NOW(), NULL);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_products ON products;
CREATE TRIGGER trg_audit_products AFTER INSERT OR UPDATE ON products FOR EACH ROW EXECUTE FUNCTION log_audit_event();

DROP TRIGGER IF EXISTS trg_audit_suppliers ON suppliers;
CREATE TRIGGER trg_audit_suppliers AFTER INSERT OR UPDATE ON suppliers FOR EACH ROW EXECUTE FUNCTION log_audit_event();

DROP TRIGGER IF EXISTS trg_audit_inventory_intake ON inventory_intake;
CREATE TRIGGER trg_audit_inventory_intake AFTER INSERT OR UPDATE ON inventory_intake FOR EACH ROW EXECUTE FUNCTION log_audit_event();

DROP TRIGGER IF EXISTS trg_audit_inventory_allocations ON inventory_allocations;
CREATE TRIGGER trg_audit_inventory_allocations AFTER INSERT OR UPDATE ON inventory_allocations FOR EACH ROW EXECUTE FUNCTION log_audit_event();

DROP TRIGGER IF EXISTS trg_audit_sales ON sales;
CREATE TRIGGER trg_audit_sales AFTER INSERT OR UPDATE ON sales FOR EACH ROW EXECUTE FUNCTION log_audit_event();

DROP TRIGGER IF EXISTS trg_audit_product_variants ON product_variants;
CREATE TRIGGER trg_audit_product_variants AFTER INSERT OR UPDATE ON product_variants FOR EACH ROW EXECUTE FUNCTION log_audit_event();

DROP TRIGGER IF EXISTS trg_audit_supplier_payments ON supplier_payments;
CREATE TRIGGER trg_audit_supplier_payments AFTER INSERT OR UPDATE ON supplier_payments FOR EACH ROW EXECUTE FUNCTION log_audit_event();

DROP TRIGGER IF EXISTS trg_audit_supplier_reconciliations ON supplier_reconciliations;
CREATE TRIGGER trg_audit_supplier_reconciliations AFTER INSERT OR UPDATE ON supplier_reconciliations FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ============================================================
-- PRICING CONSISTENCY CHECK
-- ============================================================

CREATE OR REPLACE FUNCTION check_price_consistency() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_bulk_sell_price numeric;
  v_units_per_bulk numeric;
  v_implied_retail_price numeric;
  v_tolerance numeric := 0.05;
BEGIN
  IF NEW.unit_type = 'retail' THEN
    SELECT bulk_sell_price, units_per_bulk INTO v_bulk_sell_price, v_units_per_bulk
    FROM products WHERE id = NEW.product_id;
    v_implied_retail_price := v_bulk_sell_price / v_units_per_bulk;
    IF ABS(NEW.unit_price - v_implied_retail_price) / v_implied_retail_price > v_tolerance THEN
      NEW.price_flagged := true;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_price_consistency ON sales;
CREATE TRIGGER trg_check_price_consistency BEFORE INSERT ON sales FOR EACH ROW EXECUTE FUNCTION check_price_consistency();

-- ============================================================
-- USER PROVISIONING FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION provision_user(
  p_auth_user_id uuid,
  p_business_id uuid,
  p_branch_id uuid,
  p_name text,
  p_role user_role,
  p_phone text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY definer AS $$
BEGIN
  INSERT INTO users (id, business_id, branch_id, role, name, phone)
  VALUES (p_auth_user_id, p_business_id, p_branch_id, p_role, p_name, p_phone);
END;
$$;

CREATE OR REPLACE FUNCTION provision_staff_user(
  p_auth_user_id uuid,
  p_business_id uuid,
  p_branch_id uuid,
  p_name text,
  p_phone text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY definer AS $$
BEGIN
  INSERT INTO users (id, business_id, branch_id, role, name, phone)
  VALUES (p_auth_user_id, p_business_id, p_branch_id, 'staff', p_name, p_phone);
END;
$$;

GRANT EXECUTE ON FUNCTION provision_staff_user(uuid, uuid, uuid, text, text) TO authenticated;

-- ============================================================
-- SIGNUP FUNCTION (creates business + owner + default branch)
-- ============================================================

CREATE OR REPLACE FUNCTION signup_create_owner(
  p_auth_user_id uuid,
  p_name text,
  p_phone text,
  p_business_name text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY definer AS $$
DECLARE
  v_business_id uuid;
  v_branch_id uuid;
BEGIN
  INSERT INTO businesses (name, owner_user_id) VALUES (p_business_name, NULL) RETURNING id INTO v_business_id;
  INSERT INTO users (id, business_id, branch_id, role, name, phone)
  VALUES (p_auth_user_id, v_business_id, NULL, 'owner', p_name, p_phone);
  INSERT INTO branches (business_id, name) VALUES (v_business_id, 'Main Store') RETURNING id INTO v_branch_id;
  UPDATE users SET branch_id = v_branch_id WHERE id = p_auth_user_id;
  UPDATE businesses SET owner_user_id = p_auth_user_id WHERE id = v_business_id;
  RETURN jsonb_build_object('business_id', v_business_id, 'branch_id', v_branch_id, 'user_id', p_auth_user_id);
END;
$$;

GRANT EXECUTE ON FUNCTION signup_create_owner(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION signup_create_owner(uuid, text, text, text) TO anon;

-- ============================================================
-- BUSINESS METADATA COLUMNS
-- ============================================================

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

-- ============================================================
-- ADDITIONAL TABLES (accounting, invoices, flags)
-- ============================================================

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

CREATE TABLE IF NOT EXISTS debtor_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debtor_id uuid NOT NULL REFERENCES debtors(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  note text DEFAULT '',
  paid_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

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

CREATE TABLE IF NOT EXISTS creditor_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creditor_id uuid NOT NULL REFERENCES creditors(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  note text DEFAULT '',
  paid_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

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

-- ============================================================
-- RLS FOR ADDITIONAL TABLES
-- ============================================================

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE debtors ENABLE ROW LEVEL SECURITY;
ALTER TABLE debtor_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE creditors ENABLE ROW LEVEL SECURITY;
ALTER TABLE creditor_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE flagged_backdated_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY expenses_read ON expenses FOR SELECT USING (business_id = current_business_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY expenses_insert ON expenses FOR INSERT WITH CHECK (current_user_role() IN ('manager', 'owner') AND business_id = current_business_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY expenses_update ON expenses FOR UPDATE USING (business_id = current_business_id() AND current_user_role() IN ('manager', 'owner'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY expenses_delete ON expenses FOR DELETE USING (business_id = current_business_id() AND current_user_role() IN ('manager', 'owner'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY expense_payments_read ON expense_payments FOR SELECT USING (business_id = current_business_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY expense_payments_insert ON expense_payments FOR INSERT WITH CHECK (current_user_role() IN ('manager', 'owner') AND business_id = current_business_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY invoices_read ON invoices FOR SELECT USING (branch_id IN (SELECT id FROM branches WHERE business_id = current_business_id()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY invoices_insert ON invoices FOR INSERT WITH CHECK (current_user_role() IN ('manager', 'owner', 'staff') AND branch_id IN (SELECT id FROM branches WHERE business_id = current_business_id()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY invoices_update ON invoices FOR UPDATE USING (branch_id IN (SELECT id FROM branches WHERE business_id = current_business_id()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY invoices_delete ON invoices FOR DELETE USING (branch_id IN (SELECT id FROM branches WHERE business_id = current_business_id()) AND current_user_role() IN ('manager', 'owner'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY debtors_read ON debtors FOR SELECT USING (business_id = current_business_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY debtors_insert ON debtors FOR INSERT WITH CHECK (current_user_role() IN ('manager', 'owner') AND business_id = current_business_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY debtors_update ON debtors FOR UPDATE USING (current_user_role() IN ('manager', 'owner') AND business_id = current_business_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY debtors_delete ON debtors FOR DELETE USING (business_id = current_business_id() AND current_user_role() IN ('manager', 'owner'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY debtor_payments_read ON debtor_payments FOR SELECT USING (debtor_id IN (SELECT id FROM debtors WHERE business_id = current_business_id()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY debtor_payments_insert ON debtor_payments FOR INSERT WITH CHECK (current_user_role() IN ('manager', 'owner'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY creditors_read ON creditors FOR SELECT USING (business_id = current_business_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY creditors_insert ON creditors FOR INSERT WITH CHECK (current_user_role() IN ('manager', 'owner') AND business_id = current_business_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY creditors_update ON creditors FOR UPDATE USING (current_user_role() IN ('manager', 'owner') AND business_id = current_business_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY creditors_delete ON creditors FOR DELETE USING (business_id = current_business_id() AND current_user_role() IN ('manager', 'owner'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY creditor_payments_read ON creditor_payments FOR SELECT USING (creditor_id IN (SELECT id FROM creditors WHERE business_id = current_business_id()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY creditor_payments_insert ON creditor_payments FOR INSERT WITH CHECK (current_user_role() IN ('manager', 'owner'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY creditor_payments_update ON creditor_payments FOR UPDATE USING (current_user_role() IN ('manager', 'owner'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY expense_payments_update ON expense_payments FOR UPDATE USING (business_id = current_business_id() AND current_user_role() IN ('manager', 'owner'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY debtor_payments_delete ON debtor_payments FOR DELETE USING (current_user_role() IN ('manager', 'owner'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY payments_update ON supplier_payments FOR UPDATE USING (business_id = current_business_id() AND current_user_role() IN ('manager', 'owner'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY reconciliations_update ON supplier_reconciliations FOR UPDATE USING (business_id = current_business_id() AND current_user_role() = 'owner');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY flagged_events_read ON flagged_backdated_events FOR SELECT USING (business_id = current_business_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY flagged_events_insert ON flagged_backdated_events FOR INSERT WITH CHECK (current_user_role() IN ('manager', 'owner') AND business_id = current_business_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY flagged_events_update ON flagged_backdated_events FOR UPDATE USING (business_id = current_business_id() AND current_user_role() IN ('manager', 'owner'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY flagged_events_delete ON flagged_backdated_events FOR DELETE USING (business_id = current_business_id() AND current_user_role() IN ('manager', 'owner'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- DONE! All tables, RLS, triggers, and functions created.
-- ============================================================
