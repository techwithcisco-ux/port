-- ============================================================
-- BranchPort on Render Postgres — canonical schema
-- Run once against your Render Postgres (psql $DATABASE_URL -f schema.sql).
-- No external auth schema and no database roles — access control lives
-- entirely in apps/api (JWT).
-- Includes fixes: products.image TEXT, query_log learning loop,
-- users.password_hash + POS activation columns.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('owner', 'manager', 'staff');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE sale_unit_type AS ENUM ('bulk', 'retail');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Core ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  business_type text,
  business_form text,
  business_categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  owner_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Local auth: phone + bcrypt password_hash issued as JWT by apps/api.
-- No FK to auth.users (Render Postgres has no auth schema).
-- Phone is globally unique: login is by phone alone.
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  role user_role NOT NULL,
  name text NOT NULL,
  phone text UNIQUE,
  password_hash text,
  pos_activated boolean NOT NULL DEFAULT false,
  pos_activation_token text,
  created_at timestamptz NOT NULL DEFAULT now()
);

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
  -- Base64 JPEG (no data: prefix). Client-downscaled to <=800px, <=500KB
  -- (see packages/shared image helper). Kept inline so the offline POS
  -- cache stays a single row fetch; revisit object storage past ~10k SKUs.
  image text CHECK (image IS NULL OR char_length(image) <= 700000),
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

-- Append-only audit log. Written explicitly by apps/api on every mutation
-- (no database triggers — the API is the sole writer).
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

-- "Ask BranchPort" learning loop (was missing from FULL_SCHEMA.sql).
CREATE TABLE IF NOT EXISTS query_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  question text NOT NULL,
  intent text,
  helpful boolean,
  answered_by_model boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── Accounting / invoices ───────────────────────────────────

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
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS expense_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id uuid NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  paid_at timestamptz NOT NULL DEFAULT now(),
  note text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  created_by uuid REFERENCES users(id),
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
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(branch_id, invoice_number)
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
  created_by uuid REFERENCES users(id),
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
  created_by uuid REFERENCES users(id),
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

-- ── Indexes ─────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_branches_business ON branches(business_id);
CREATE INDEX IF NOT EXISTS idx_users_business ON users(business_id);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(business_id, phone);
CREATE UNIQUE INDEX IF NOT EXISTS users_pos_token_key ON users(pos_activation_token) WHERE pos_activation_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_business ON products(business_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_product ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_business ON suppliers(business_id);
CREATE INDEX IF NOT EXISTS idx_intake_business ON inventory_intake(business_id);
CREATE INDEX IF NOT EXISTS idx_allocations_branch ON inventory_allocations(branch_id);
CREATE INDEX IF NOT EXISTS idx_sales_branch ON sales(branch_id);
CREATE INDEX IF NOT EXISTS idx_sales_sold_at ON sales(sold_at);
CREATE INDEX IF NOT EXISTS idx_audit_business ON audit_events(business_id);
CREATE INDEX IF NOT EXISTS idx_audit_occurred ON audit_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_query_log_created ON query_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_branch ON invoices(branch_id);

-- ── Professional auth (access + refresh rotation, lockout, reset) ──
-- Short-lived access JWTs are stateless; refresh tokens are opaque and
-- stored hashed so a DB leak does not yield live sessions. Password
-- resets are single-use hashed tokens. auth_audit records every auth
-- decision (login, lockout, refresh reuse, reset) for forensics.

ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  replaced_by uuid REFERENCES refresh_tokens(id) ON DELETE SET NULL,
  ip text
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);

CREATE TABLE IF NOT EXISTS auth_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  phone text,
  action text NOT NULL,
  success boolean NOT NULL DEFAULT true,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_expires ON refresh_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_reset_user ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_audit_user ON auth_audit(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_audit_created ON auth_audit(created_at DESC);

-- ── Pricing consistency (no auth dependency — safe on Render) ──

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
    IF v_bulk_sell_price IS NOT NULL AND v_units_per_bulk IS NOT NULL AND v_units_per_bulk > 0 THEN
      v_implied_retail_price := v_bulk_sell_price / v_units_per_bulk;
      IF v_implied_retail_price > 0 AND ABS(NEW.unit_price - v_implied_retail_price) / v_implied_retail_price > v_tolerance THEN
        NEW.price_flagged := true;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_price_consistency ON sales;
CREATE TRIGGER trg_check_price_consistency BEFORE INSERT ON sales FOR EACH ROW EXECUTE FUNCTION check_price_consistency();
