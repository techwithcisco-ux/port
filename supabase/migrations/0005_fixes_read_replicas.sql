-- BranchPort: follow-up fixes + read-side improvements
-- Two real defects found in review of the foundation schema:
--
--   1. sales_insert_staff (0002) checked branch_id but NOT sold_by. Any
--      staff user could attribute a sale to any other user id, which
--      is exactly the kind of in-row forgery this product exists to
--      prevent. Now sold_by must equal the authenticated user.
--
--   2. check_price_consistency (0004) divided by retail_implied price
--      with no zero guard: a product whose bulk_sell_price = 0 (legal
--      under 0001, check is >= 0) made every retail sale RAISE an
--      error instead of being flagged. A pricing bug that breaks the
--      sell path is worse than the flag it was meant to produce.

-- 1) Force staff sales to be self-attributed. Old policy dropped;
--    be aware this migration targets the ORIGINAL policy name.
drop policy if exists sales_insert_staff on sales;
create policy sales_insert_staff on sales for insert
  with check (
    current_user_role() = 'staff'
    and branch_id = current_branch_id()
    and sold_by = auth.uid()
  );

-- 2) Pricing-consistency trigger, made robust against zero/absent
--    implied retail price. Zero price for retail is treated as a
--    goodwill/free unit (flag a free give-away only if it was charged).
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

    -- can't divide by zero; if the product has no well-defined implied
    -- retail price, any non-zero charge is suspect.
    v_implied_retail_price :=
      case
        when v_units_per_bulk is null or v_units_per_bulk <= 0
          or v_bulk_sell_price is null or v_bulk_sell_price < 0
          then null
        else round(v_bulk_sell_price / v_units_per_bulk, 4)
      end;

    if v_implied_retail_price is null or v_implied_retail_price <= 0 then
      new.price_flagged := (new.unit_price > 0);
    elsif abs(new.unit_price - v_implied_retail_price) / v_implied_retail_price > v_tolerance then
      new.price_flagged := true;
    end if;
  end if;

  return new;
end;
$$;

-- trigger name unchanged – body only, safe to re-run
drop trigger if exists trg_check_price_consistency on sales;
create trigger trg_check_price_consistency
  before insert on sales
  for each row execute function check_price_consistency();

-- Read-side help for the owner/manager queries we add in the apps:
create index if not exists idx_audit_occurred on audit_events(occurred_at desc);
create index if not exists idx_sales_product on sales(product_id);