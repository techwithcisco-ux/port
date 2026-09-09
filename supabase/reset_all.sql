-- ============================================
-- BRANCHPORT FULL RESET SCRIPT
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================

-- 1. Delete all data (order matters for foreign keys)
DELETE FROM invoice_items;
DELETE FROM invoices;
DELETE FROM product_variants;
DELETE FROM inventory_intake;
DELETE FROM expenses;
DELETE FROM staff_allocations;
DELETE FROM daily_sales;
DELETE FROM stock_balances;
DELETE FROM products;
DELETE FROM suppliers;
DELETE FROM branches;
DELETE FROM users;

-- Also delete from auth.users (Supabase auth)
DELETE FROM auth.users;

-- 2. Migration 0021: Add image column to products
ALTER TABLE products ADD COLUMN IF NOT EXISTS image TEXT DEFAULT NULL;

-- 3. Migration 0022: Auto-confirm users (for phone-based signup)
CREATE OR REPLACE FUNCTION auto_confirm_user(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE auth.users
  SET email_confirmed_at = now(),
      confirmed_at = now()
  WHERE id = p_user_id
    AND email_confirmed_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION auto_confirm_user(UUID) TO anon, authenticated, service_role;

-- 4. Verify signup_create_owner exists (should already be there from migration 0014)
-- If it doesn't exist, you'll see an error — let us know and we'll recreate it.
SELECT EXISTS (
  SELECT 1 FROM pg_proc WHERE proname = 'signup_create_owner'
) AS rpc_exists;

-- Done! All data cleared, migrations applied.
-- You can now sign up fresh at /signup
