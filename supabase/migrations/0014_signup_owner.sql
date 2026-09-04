-- 0014_signup_owner.sql
-- Allows a newly signed-up owner to create their business, default branch,
-- and user record in a single atomic operation.  Runs as the table owner
-- (security definer) so it bypasses RLS.
--
-- We temporarily disable ALL audit triggers during signup because
-- auth.uid() inside a security definer function may not match the
-- newly-created user row, causing FK violations on audit_events.

create or replace function signup_create_owner(
  p_auth_user_id uuid,
  p_name text,
  p_phone text,
  p_business_name text
) returns jsonb
language plpgsql security definer as $$
declare
  v_business_id uuid;
  v_branch_id uuid;
  v_result jsonb;
begin
  -- Disable all audit triggers to avoid FK issues during signup
  -- (security definer context + brand-new user = auth.uid() mismatch)
  begin
    alter table branches disable trigger trg_audit_branches;
  exception when undefined_object then null;
  end;

  begin
    alter table users disable trigger trg_audit_users;
  exception when undefined_object then null;
  end;

  begin
    alter table businesses disable trigger trg_audit_businesses;
  exception when undefined_object then null;
  end;

  -- 1. Create the business (owner_user_id is nullable)
  insert into businesses (name, owner_user_id)
  values (p_business_name, null)
  returning id into v_business_id;

  -- 2. Create the owner user row
  insert into users (id, business_id, branch_id, role, name, phone)
  values (p_auth_user_id, v_business_id, null, 'owner', p_name, p_phone);

  -- 3. Create the default branch
  insert into branches (business_id, name)
  values (v_business_id, 'Main Store')
  returning id into v_branch_id;

  -- 4. Link everything back
  update users set branch_id = v_branch_id where id = p_auth_user_id;
  update businesses set owner_user_id = p_auth_user_id where id = v_business_id;

  -- Re-enable audit triggers
  begin
    alter table branches enable trigger trg_audit_branches;
  exception when undefined_object then null;
  end;

  begin
    alter table users enable trigger trg_audit_users;
  exception when undefined_object then null;
  end;

  begin
    alter table businesses enable trigger trg_audit_businesses;
  exception when undefined_object then null;
  end;

  v_result := jsonb_build_object(
    'business_id', v_business_id,
    'branch_id', v_branch_id,
    'user_id', p_auth_user_id
  );

  return v_result;
end;
$$;

grant execute on function signup_create_owner(uuid, text, text, text) to authenticated;
