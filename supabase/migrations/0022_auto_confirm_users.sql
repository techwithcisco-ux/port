-- 0022_auto_confirm_users.sql
-- BranchPort uses phone numbers mapped to fake emails (phone@branchport.app).
-- Supabase requires email confirmation by default, but since these emails
-- are not real, we need to auto-confirm users after signup.
--
-- This creates a security-definer function that confirms a user's email
-- so they can sign in immediately after registration.

create or replace function auto_confirm_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = auth
as $$
begin
  -- Set email_confirmed_at to now() so the user can sign in
  update auth.users
  set email_confirmed_at = now()
  where id = p_user_id
    and email_confirmed_at is null;
end;
$$;

-- Allow authenticated and anon roles to call this
grant execute on function auto_confirm_user(uuid) to authenticated;
grant execute on function auto_confirm_user(uuid) to anon;
