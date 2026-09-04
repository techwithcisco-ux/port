-- 0012_phone_auth.sql
-- Name + phone authentication for the informal market. Accounts are
-- identified by the person's NAME and PHONE NUMBER — no email, no
-- password. This matches how staff/manager accounts are now created:
-- the inviter types a name and phone, the account is keyed by phone in
-- Supabase Auth, and sign-in everywhere (dashboard, POS) is name+phone.
--
-- Reviewed SQL only (no Docker/Supabase CLI locally, same as
-- 0007–0011): run against a real Supabase project.

alter table users add column phone text;

-- Phone is unique per business where present; several businesses can
-- legitimately hold the same number, and legacy rows may have none.
create unique index users_business_phone_key
  on users (business_id, phone)
  where phone is not null;

-- Provisioning gains an optional phone so invited accounts carry the
-- number the manager typed. provision_user (0011) covers every role;
-- provision_staff_user (0004) keeps its original signature for older
-- callers and now also records the phone when it can.
create or replace function provision_user(
  p_auth_user_id uuid,
  p_business_id uuid,
  p_branch_id uuid,
  p_name text,
  p_role user_role,
  p_phone text default null
) returns void
language plpgsql security definer as $$
begin
  insert into users (id, business_id, branch_id, role, name, phone)
  values (p_auth_user_id, p_business_id, p_branch_id, p_role, p_name, p_phone);
end;
$$;

create or replace function provision_staff_user(
  p_auth_user_id uuid,
  p_business_id uuid,
  p_branch_id uuid,
  p_name text,
  p_phone text default null
) returns void
language plpgsql security definer as $$
begin
  insert into users (id, business_id, branch_id, role, name, phone)
  values (p_auth_user_id, p_business_id, p_branch_id, 'staff', p_name, p_phone);
end;
$$;
