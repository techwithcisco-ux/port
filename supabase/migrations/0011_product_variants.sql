-- 0011_product_variants.sql
-- Product variants for the informal market. A product like sugar isn't
-- just bulk/retail — it is sold as cups, bags, sachets, bottles, gallons.
-- Each variant is its own sellable unit with its own price. `base_units`
-- says how many of the FIRST variant (the base/stock-counting unit) one
-- of these equals, so remaining stock is always counted in one unit no
-- matter which variant was sold.
--
-- The products.bulk_*/retail_* columns are kept (they feed intake,
-- allocation and the pricing trigger) and are derived from the variant
-- list at save time: the first variant seeds retail, the variant with the
-- largest base_units seeds bulk.
--
-- Reviewed SQL only (same as 0007/0008/0009): no Docker/Supabase CLI
-- locally, so this file is not executed here.

create table product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  name text not null,
  price numeric not null check (price >= 0),
  base_units numeric not null default 1 check (base_units > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index idx_product_variants_product on product_variants(product_id);

alter table product_variants enable row level security;

-- Same access model as products: anyone in the business reads (staff need
-- variant names/prices to sell), only a manager writes.
create policy product_variants_read on product_variants for select
  using (product_id in (select id from products where business_id = current_business_id()));

create policy product_variants_write_manager on product_variants for insert
  with check (
    current_user_role() = 'manager'
    and product_id in (select id from products where business_id = current_business_id())
  );
-- No UPDATE/DELETE: like everything else, corrections are new rows.

-- The till records which variant was sold. Null for legacy cash sales.
alter table sales
  add column variant_id uuid references product_variants(id) on delete set null;

-- Audit coverage for product_variants: reuse the shared trigger, which is
-- recreated here with the new table in its business_id resolution list.
create or replace function log_audit_event() returns trigger
language plpgsql security definer as $$
declare
  v_business_id uuid;
  v_actor uuid := auth.uid();
begin
  if TG_TABLE_NAME in ('products', 'suppliers', 'inventory_intake', 'branches') then
    v_business_id := coalesce(new.business_id, old.business_id);
  elsif TG_TABLE_NAME = 'product_variants' then
    select business_id into v_business_id from products where id = coalesce(new.product_id, old.product_id);
  elsif TG_TABLE_NAME in ('supplier_payments', 'supplier_reconciliations') then
    select business_id into v_business_id from suppliers
      where id = coalesce(new.supplier_id, old.supplier_id);
  elsif TG_TABLE_NAME in ('inventory_allocations', 'sales') then
    select business_id into v_business_id from branches
      where id = coalesce(new.branch_id, old.branch_id);
  end if;

  insert into audit_events (
    business_id, actor_user_id, action_type, entity_type, entity_id,
    before_state, after_state, occurred_at, client_reported_at
  ) values (
    v_business_id,
    v_actor,
    lower(TG_OP),
    TG_TABLE_NAME,
    coalesce(new.id, old.id),
    case when TG_OP = 'UPDATE' then to_jsonb(old) else null end,
    case when TG_OP in ('INSERT', 'UPDATE') then to_jsonb(new) else null end,
    now(),
    null
  );

  return new;
end;
$$;

create trigger trg_audit_product_variants
  after insert or update on product_variants
  for each row execute function log_audit_event();

-- Generalise staff provisioning so the same server-side function can
-- create a manager row when the OWNER invites one (0004 kept the original
-- staff-only function for backward compatibility).
create or replace function provision_user(
  p_auth_user_id uuid,
  p_business_id uuid,
  p_branch_id uuid,
  p_name text,
  p_role user_role
) returns void
language plpgsql security definer as $$
begin
  insert into users (id, business_id, branch_id, role, name)
  values (p_auth_user_id, p_business_id, p_branch_id, p_role, p_name);
end;
$$;
