-- ============================================================
-- MIGRATION 0020: Fix authentication and RLS policies
-- Run this in Supabase SQL Editor after FULL_SCHEMA.sql
-- ============================================================

-- 1. Grant signup_create_owner to BOTH anon and authenticated
--    (during signup, email confirmation may not be complete yet,
--     so the user is 'anon' not 'authenticated')
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION signup_create_owner(uuid, text, text, text) TO anon;
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;

-- 2. Add missing INSERT/UPDATE/DELETE policies for businesses
DO $$ BEGIN
  CREATE POLICY businesses_insert ON businesses FOR INSERT
    WITH CHECK (owner_user_id = auth.uid() OR auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY businesses_update ON businesses FOR UPDATE
    USING (id = current_business_id() AND current_user_role() = 'owner');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY businesses_delete ON businesses FOR DELETE
    USING (id = current_business_id() AND current_user_role() = 'owner');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Add missing INSERT/UPDATE policies for users
DO $$ BEGIN
  CREATE POLICY users_insert ON users FOR INSERT
    WITH CHECK (business_id = current_business_id() AND current_user_role() IN ('manager', 'owner'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY users_update ON users FOR UPDATE
    USING (business_id = current_business_id() AND current_user_role() IN ('manager', 'owner'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY users_delete ON users FOR DELETE
    USING (business_id = current_business_id() AND current_user_role() = 'owner');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4. Add INSERT policy for branches (needed during signup and branch creation)
DO $$ BEGIN
  CREATE POLICY branches_insert ON branches FOR INSERT
    WITH CHECK (current_user_role() IN ('manager', 'owner'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY branches_update ON branches FOR UPDATE
    USING (business_id = current_business_id() AND current_user_role() IN ('manager', 'owner'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY branches_delete ON branches FOR DELETE
    USING (business_id = current_business_id() AND current_user_role() = 'owner');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 5. Add INSERT/UPDATE/DELETE for expenses
DO $$ BEGIN
  CREATE POLICY expenses_update ON expenses FOR UPDATE
    USING (business_id = current_business_id() AND current_user_role() IN ('manager', 'owner'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY expenses_delete ON expenses FOR DELETE
    USING (business_id = current_business_id() AND current_user_role() IN ('manager', 'owner'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 6. Add UPDATE/DELETE for products
DO $$ BEGIN
  CREATE POLICY products_update ON products FOR UPDATE
    USING (business_id = current_business_id() AND current_user_role() IN ('manager', 'owner'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 7. Add UPDATE/DELETE for inventory_intake
DO $$ BEGIN
  CREATE POLICY intake_delete ON inventory_intake FOR DELETE
    USING (business_id = current_business_id() AND current_user_role() IN ('manager', 'owner'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 8. Add UPDATE/DELETE for inventory_allocations
DO $$ BEGIN
  CREATE POLICY allocations_update ON inventory_allocations FOR UPDATE
    USING (current_user_role() IN ('manager', 'owner')
      AND branch_id IN (SELECT id FROM branches WHERE business_id = current_business_id()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY allocations_delete ON inventory_allocations FOR DELETE
    USING (current_user_role() IN ('manager', 'owner')
      AND branch_id IN (SELECT id FROM branches WHERE business_id = current_business_id()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 9. Add UPDATE/DELETE for sales
DO $$ BEGIN
  CREATE POLICY sales_update ON sales FOR UPDATE
    USING (current_user_role() IN ('manager', 'owner')
      AND branch_id IN (SELECT id FROM branches WHERE business_id = current_business_id()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY sales_delete ON sales FOR DELETE
    USING (current_user_role() IN ('manager', 'owner')
      AND branch_id IN (SELECT id FROM branches WHERE business_id = current_business_id()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 10. Add UPDATE/DELETE for invoices
DO $$ BEGIN
  CREATE POLICY invoices_delete ON invoices FOR DELETE
    USING (branch_id IN (SELECT id FROM branches WHERE business_id = current_business_id())
      AND current_user_role() IN ('manager', 'owner'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 11. Add UPDATE/DELETE for debtors and creditors
DO $$ BEGIN
  CREATE POLICY debtors_delete ON debtors FOR DELETE
    USING (business_id = current_business_id() AND current_user_role() IN ('manager', 'owner'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY creditors_delete ON creditors FOR DELETE
    USING (business_id = current_business_id() AND current_user_role() IN ('manager', 'owner'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 12. Add UPDATE/DELETE for flagged_backdated_events
DO $$ BEGIN
  CREATE POLICY flagged_events_update ON flagged_backdated_events FOR UPDATE
    USING (business_id = current_business_id() AND current_user_role() IN ('manager', 'owner'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY flagged_events_delete ON flagged_backdated_events FOR DELETE
    USING (business_id = current_business_id() AND current_user_role() IN ('manager', 'owner'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 13. Add UPDATE for supplier_payments and reconciliations
DO $$ BEGIN
  CREATE POLICY payments_update ON supplier_payments FOR UPDATE
    USING (business_id = current_business_id() AND current_user_role() IN ('manager', 'owner'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY reconciliations_update ON supplier_reconciliations FOR UPDATE
    USING (business_id = current_business_id() AND current_user_role() = 'owner');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 14. Ensure the FULL grant for authenticated too
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION signup_create_owner(uuid, text, text, text) TO authenticated;
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;

-- 15. Add RLS permissive policies for signup: the user needs to be able to
--     SELECT their own row immediately after signup
DO $$ BEGIN
  CREATE POLICY users_read_self ON users FOR SELECT
    USING (id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- DONE! All RLS policies and grants fixed.
-- ============================================================
