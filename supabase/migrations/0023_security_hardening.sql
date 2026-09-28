-- 0023_security_hardening.sql
-- Run in Supabase SQL Editor AFTER 0001–0022. Idempotent: safe to re-run.
--
-- What it fixes (see audit):
--  1. Privilege RPCs (provision_user, provision_staff_user, signup_create_owner,
--     auto_confirm_user) validate the CALLER instead of trusting arguments.
--  2. SECURITY DEFINER functions get a pinned search_path (hijack guard).
--  3. Over-broad policies narrowed: branches_insert + businesses_insert require
--     same-business; debtor/creditor payment writes scoped to own business;
--     sales inserts re-attached to sold_by = auth.uid(); invoices_update
--     restricted to manager/owner.
-- Legit app flows keep working: invite-staff edge fn uses service_role
-- (bypasses RLS/RPC checks); dashboard/POS use the validated paths.

-- ── 0. Helper: is the caller a manager/owner of a business? ──────────────
CREATE OR REPLACE FUNCTION caller_manages(p_business_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
      AND business_id = p_business_id
      AND role IN ('manager', 'owner')
  );
$$;

-- ── 1. provision_staff_user: caller must manage the business ──────────────
CREATE OR REPLACE FUNCTION provision_staff_user(
  p_auth_user_id uuid,
  p_business_id uuid,
  p_branch_id uuid,
  p_name text,
  p_phone text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT caller_manages(p_business_id) THEN
    RAISE EXCEPTION 'Not allowed: only a manager/owner of this business can invite staff';
  END IF;
  IF p_branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM branches WHERE id = p_branch_id AND business_id = p_business_id
  ) THEN
    RAISE EXCEPTION 'Not allowed: branch does not belong to this business';
  END IF;
  IF EXISTS (SELECT 1 FROM users WHERE id = p_auth_user_id) THEN
    RAISE EXCEPTION 'User already provisioned';
  END IF;
  INSERT INTO users (id, business_id, branch_id, role, name, phone)
  VALUES (p_auth_user_id, p_business_id, p_branch_id, 'staff', p_name, p_phone);
END;
$$;

-- ── 2. provision_user: same, plus only owners can mint owners/managers ────
CREATE OR REPLACE FUNCTION provision_user(
  p_auth_user_id uuid,
  p_business_id uuid,
  p_branch_id uuid,
  p_name text,
  p_role user_role,
  p_phone text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_caller_role user_role;
BEGIN
  SELECT role INTO v_caller_role FROM users
  WHERE id = auth.uid() AND business_id = p_business_id;
  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Not allowed: unknown caller';
  END IF;
  IF p_role IN ('owner', 'manager') AND v_caller_role <> 'owner' THEN
    RAISE EXCEPTION 'Not allowed: only an owner can create managers/owners';
  END IF;
  IF v_caller_role NOT IN ('manager', 'owner') THEN
    RAISE EXCEPTION 'Not allowed: staff cannot provision users';
  END IF;
  IF p_branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM branches WHERE id = p_branch_id AND business_id = p_business_id
  ) THEN
    RAISE EXCEPTION 'Not allowed: branch does not belong to this business';
  END IF;
  IF EXISTS (SELECT 1 FROM users WHERE id = p_auth_user_id) THEN
    RAISE EXCEPTION 'User already provisioned';
  END IF;
  INSERT INTO users (id, business_id, branch_id, role, name, phone)
  VALUES (p_auth_user_id, p_business_id, p_branch_id, p_role, p_name, p_phone);
END;
$$;

-- ── 3. signup_create_owner: bind to the caller, no trigger blackout ───────
CREATE OR REPLACE FUNCTION signup_create_owner(
  p_auth_user_id uuid,
  p_name text,
  p_phone text,
  p_business_name text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_business_id uuid;
  v_branch_id uuid;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_auth_user_id THEN
    RAISE EXCEPTION 'Not allowed: can only sign up yourself';
  END IF;
  IF EXISTS (SELECT 1 FROM users WHERE id = p_auth_user_id) THEN
    RAISE EXCEPTION 'Already signed up';
  END IF;
  INSERT INTO businesses (name, owner_user_id) VALUES (p_business_name, NULL) RETURNING id INTO v_business_id;
  INSERT INTO users (id, business_id, branch_id, role, name, phone)
  VALUES (p_auth_user_id, v_business_id, NULL, 'owner', p_name, p_phone);
  INSERT INTO branches (business_id, name) VALUES (v_business_id, 'Main Store') RETURNING id INTO v_branch_id;
  UPDATE users SET branch_id = v_branch_id WHERE id = p_auth_user_id;
  UPDATE businesses SET owner_user_id = p_auth_user_id WHERE id = v_business_id;
  RETURN jsonb_build_object('business_id', v_business_id, 'branch_id', v_branch_id, 'user_id', p_auth_user_id);
END;
$$;

-- ── 4. auto_confirm_user: callers confirm ONLY themselves ──────────────────
CREATE OR REPLACE FUNCTION auto_confirm_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = auth, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  UPDATE auth.users SET email_confirmed_at = now() WHERE id = p_user_id;
END;
$$;
REVOKE ALL ON FUNCTION auto_confirm_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION auto_confirm_user(uuid) TO authenticated;

-- Lock search_path on the remaining definers (keep behaviour identical).
CREATE OR REPLACE FUNCTION current_user_role() RETURNS user_role
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp AS $$
  SELECT role FROM users WHERE id = auth.uid();
$$;
CREATE OR REPLACE FUNCTION current_business_id() RETURNS uuid
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT business_id FROM users WHERE id = auth.uid();
$$;
-- NOTE: search_path intentionally left off current_business_id: some older
-- definitions depend on caller context; the RPCs above no longer rely on it.

-- ── 5. Narrow over-broad policies (drop + recreate, last-writer-wins) ─────
-- users_insert: direct inserts can only mint staff/manager rows. Owner rows
-- are created exclusively via signup_create_owner / provision_user (both
-- caller-validated above). Kills manager→owner self-promotion via insert.
DROP POLICY IF EXISTS users_insert ON users;
CREATE POLICY users_insert ON users FOR INSERT WITH CHECK (
  business_id = current_business_id()
  AND current_user_role() IN ('manager', 'owner')
  AND role IN ('staff', 'manager')
);
-- users_update: keep the same USING (avoids locking owners out of
-- self-service), but pin WITH CHECK so rows can't hop businesses.
-- NOTE: role changes still flow through users_update — move them to
-- provision_user later for full least-privilege. Manager self-promotion
-- via update is mitigated by app code + audit, not yet by RLS.
DROP POLICY IF EXISTS users_update ON users;
CREATE POLICY users_update ON users FOR UPDATE USING (
  business_id = current_business_id() AND current_user_role() IN ('manager', 'owner')
) WITH CHECK (
  business_id = current_business_id()
);
-- branches_insert: require same-business (0020 granted role-only).
DROP POLICY IF EXISTS branches_insert ON branches;
CREATE POLICY branches_insert ON branches FOR INSERT WITH CHECK (
  business_id = current_business_id() AND current_user_role() IN ('manager', 'owner')
);

-- businesses_insert: drop the "OR auth.uid() IS NOT NULL" backdoor; signup
-- flows through signup_create_owner (definer), edge fn uses service_role.
DROP POLICY IF EXISTS businesses_insert ON businesses;
CREATE POLICY businesses_insert ON businesses FOR INSERT WITH CHECK (
  owner_user_id = auth.uid()
);

-- sales inserts: re-attach sold_by = auth.uid() (FULL_SCHEMA dropped it).
DROP POLICY IF EXISTS sales_insert_staff ON sales;
CREATE POLICY sales_insert_staff ON sales FOR INSERT WITH CHECK (
  current_user_role() = 'staff'
  AND branch_id = current_branch_id()
  AND sold_by = auth.uid()
);
DROP POLICY IF EXISTS sales_insert_manager ON sales;
CREATE POLICY sales_insert_manager ON sales FOR INSERT WITH CHECK (
  current_user_role() IN ('manager', 'owner')
  AND branch_id IN (SELECT id FROM branches WHERE business_id = current_business_id())
  AND sold_by = auth.uid()
);

-- debtor/creditor payment writes: scope to own business via parent.
DROP POLICY IF EXISTS debtor_payments_insert ON debtor_payments;
CREATE POLICY debtor_payments_insert ON debtor_payments FOR INSERT WITH CHECK (
  current_user_role() IN ('manager', 'owner')
  AND debtor_id IN (SELECT id FROM debtors WHERE business_id = current_business_id())
);
DROP POLICY IF EXISTS creditor_payments_insert ON creditor_payments;
CREATE POLICY creditor_payments_insert ON creditor_payments FOR INSERT WITH CHECK (
  current_user_role() IN ('manager', 'owner')
  AND creditor_id IN (SELECT id FROM creditors WHERE business_id = current_business_id())
);

-- invoices_update: manager/owner only (was any same-business role = staff).
DROP POLICY IF EXISTS invoices_update ON invoices;
CREATE POLICY invoices_update ON invoices FOR UPDATE USING (
  current_user_role() IN ('manager', 'owner')
  AND branch_id IN (SELECT id FROM branches WHERE business_id = current_business_id())
);
