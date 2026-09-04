-- BranchPort: unit-pricing consistency check (requirements 4.2)
-- Runs server-side on every sale insert so it can't be spoofed by a
-- compromised or modified client.

create or replace function check_price_consistency() returns trigger
language plpgsql as $$
declare
  v_bulk_sell_price numeric;
  v_units_per_bulk numeric;
  v_implied_retail_price numeric;
  v_tolerance numeric := 0.05; -- default 5%, requirements 4.2
begin
  if new.unit_type = 'retail' then
    select bulk_sell_price, units_per_bulk
      into v_bulk_sell_price, v_units_per_bulk
      from products where id = new.product_id;

    v_implied_retail_price := v_bulk_sell_price / v_units_per_bulk;

    if abs(new.unit_price - v_implied_retail_price) / v_implied_retail_price > v_tolerance then
      new.price_flagged := true;
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_check_price_consistency
  before insert on sales
  for each row execute function check_price_consistency();

-- Staff invite/provisioning: the manager cannot directly INSERT into
-- `users` (no write policy is granted on that table in 0002). Instead,
-- account creation happens through this function, which must be called
-- from a trusted server context (a Supabase Edge Function using the
-- service role key), not directly from the dashboard client. The flow:
--   1. Manager dashboard calls an Edge Function with { branch_id, name }.
--   2. Edge Function creates a Supabase Auth user (e.g. via magic link
--      or invite email/SMS) and gets back the new auth user's id.
--   3. Edge Function calls this SQL function with that id to create the
--      matching `users` row scoped to the branch with role 'staff'.
-- This keeps the RLS model simple (no client-side insert path into
-- `users` to lock down) while still supporting the invite-link UX
-- described in requirements.txt Section 2.1.
create or replace function provision_staff_user(
  p_auth_user_id uuid,
  p_business_id uuid,
  p_branch_id uuid,
  p_name text
) returns void
language plpgsql security definer as $$
begin
  insert into users (id, business_id, branch_id, role, name)
  values (p_auth_user_id, p_business_id, p_branch_id, 'staff', p_name);
end;
$$;
