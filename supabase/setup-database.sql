-- ═══════════════════════════════════════════════════════════════════════
-- BranchPort — Full Database Setup
-- Paste this entire file into Supabase SQL Editor and click "Run"
-- ═══════════════════════════════════════════════════════════════════════

-- ─── 0001: Core Schema ───────────────────────────────────────────────

create extension if not exists "pgcrypto";

create type user_role as enum ('owner', 'manager', 'staff');
create type sale_unit_type as enum ('bulk', 'retail');

create table businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_user_id uuid,
  created_at timestamptz not null default now()
);

create table branches (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  branch_id uuid references branches(id) on delete set null,
  role user_role not null,
  name text not null,
  phone text,
  created_at timestamptz not null default now()
);

alter table businesses
  add constraint businesses_owner_user_id_fkey
  foreign key (owner_user_id) references users(id) on delete set null;

create table products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  bulk_unit_name text not null,
  retail_unit_name text not null,
  units_per_bulk numeric not null check (units_per_bulk > 0),
  bulk_cost_price numeric not null check (bulk_cost_price >= 0),
  bulk_sell_price numeric not null check (bulk_sell_price >= 0),
  retail_sell_price numeric not null check (retail_sell_price >= 0),
  created_at timestamptz not null default now()
);

create table suppliers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table inventory_intake (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  supplier_id uuid not null references suppliers(id),
  product_id uuid not null references products(id),
  bulk_quantity numeric not null check (bulk_quantity > 0),
  cost_price_total numeric not null check (cost_price_total >= 0),
  amount_paid numeric not null default 0 check (amount_paid >= 0),
  amount_owed numeric generated always as (cost_price_total - amount_paid) stored,
  created_at timestamptz not null default now(),
  created_by uuid not null references users(id)
);

create table inventory_allocations (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id),
  branch_id uuid not null references branches(id),
  bulk_quantity numeric not null check (bulk_quantity > 0),
  retail_quantity_equivalent numeric not null,
  allocated_at timestamptz not null default now(),
  allocated_by uuid not null references users(id)
);

create table sales (
  id uuid primary key,
  branch_id uuid not null references branches(id),
  product_id uuid not null references products(id),
  unit_type sale_unit_type not null,
  quantity numeric not null check (quantity > 0),
  unit_price numeric not null check (unit_price >= 0),
  total_price numeric not null check (total_price >= 0),
  sold_by uuid not null references users(id),
  sold_at timestamptz not null default now(),
  client_reported_at timestamptz not null,
  price_flagged boolean not null default false,
  customer_name text,
  customer_phone text
);

create table audit_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  actor_user_id uuid not null references users(id),
  action_type text not null,
  entity_type text not null,
  entity_id uuid not null,
  before_state jsonb,
  after_state jsonb,
  occurred_at timestamptz not null default now(),
  client_reported_at timestamptz
);

-- Indexes
create index idx_branches_business on branches(business_id);
create index idx_users_business on users(business_id);
create index idx_products_business on products(business_id);
create index idx_suppliers_business on suppliers(business_id);
create index idx_intake_business on inventory_intake(business_id);
create index idx_intake_supplier on inventory_intake(supplier_id);
create index idx_allocations_branch on inventory_allocations(branch_id);
create index idx_sales_branch on sales(branch_id);
create index idx_sales_sold_at on sales(sold_at);
create index idx_sales_product on sales(product_id);
create index idx_audit_business on audit_events(business_id);
create index idx_audit_actor on audit_events(actor_user_id);
create index idx_audit_entity on audit_events(entity_type, entity_id);
create index idx_audit_occurred on audit_events(occurred_at desc);

-- ─── 0002: Row-Level Security ────────────────────────────────────────

create or replace function current_user_role() returns user_role
language sql security definer stable as $$
  select role from users where id = auth.uid();
$$;

create or replace function current_business_id() returns uuid
language sql security definer stable as $$
  select business_id from users where id = auth.uid();
$$;

create or replace function current_branch_id() returns uuid
language sql security definer stable as $$
  select branch_id from users where id = auth.uid();
$$;

alter table businesses enable row level security;
alter table branches enable row level security;
alter table users enable row level security;
alter table products enable row level security;
alter table suppliers enable row level security;
alter table inventory_intake enable row level security;
alter table inventory_allocations enable row level security;
alter table sales enable row level security;
alter table audit_events enable row level security;

create policy business_read on businesses for select
  using (id = current_business_id());

create policy branches_read on branches for select
  using (business_id = current_business_id());

create policy users_read on users for select
  using (business_id = current_business_id());

create policy products_read on products for select
  using (business_id = current_business_id());

create policy products_write_manager on products for insert
  with check (business_id = current_business_id() and current_user_role() in ('manager', 'owner'));

create policy products_update_manager on products for update
  using (business_id = current_business_id() and current_user_role() = 'manager');

create policy suppliers_read on suppliers for select
  using (business_id = current_business_id() and current_user_role() in ('manager', 'owner'));

create policy suppliers_write_manager on suppliers for insert
  with check (business_id = current_business_id() and current_user_role() in ('manager', 'owner'));

create policy intake_read on inventory_intake for select
  using (business_id = current_business_id() and current_user_role() in ('manager', 'owner'));

create policy intake_write_manager on inventory_intake for insert
  with check (business_id = current_business_id() and current_user_role() in ('manager', 'owner'));

create policy allocations_read_manager_owner on inventory_allocations for select
  using (
    current_user_role() in ('manager', 'owner')
    and branch_id in (select id from branches where business_id = current_business_id())
  );

create policy allocations_read_staff_own_branch on inventory_allocations for select
  using (current_user_role() = 'staff' and branch_id = current_branch_id());

create policy allocations_write_manager on inventory_allocations for insert
  with check (
    current_user_role() in ('manager', 'owner')
    and branch_id in (select id from branches where business_id = current_business_id())
  );

create policy sales_read_manager_owner on sales for select
  using (
    current_user_role() in ('manager', 'owner')
    and branch_id in (select id from branches where business_id = current_business_id())
  );

create policy sales_read_staff_own_branch on sales for select
  using (current_user_role() = 'staff' and branch_id = current_branch_id());

create policy sales_insert_staff on sales for insert
  with check (
    current_user_role() = 'staff'
    and branch_id = current_branch_id()
    and sold_by = auth.uid()
  );

create policy sales_insert_manager on sales for insert
  with check (
    current_user_role() = 'manager'
    and branch_id in (select id from branches where business_id = current_business_id())
  );

create policy audit_read_owner_only on audit_events for select
  using (current_user_role() = 'owner' and business_id = current_business_id());

-- ─── 0003: Audit Trigger ─────────────────────────────────────────────

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

create trigger trg_audit_products
  after insert or update on products
  for each row execute function log_audit_event();

create trigger trg_audit_suppliers
  after insert or update on suppliers
  for each row execute function log_audit_event();

create trigger trg_audit_inventory_intake
  after insert or update on inventory_intake
  for each row execute function log_audit_event();

create trigger trg_audit_inventory_allocations
  after insert or update on inventory_allocations
  for each row execute function log_audit_event();

create trigger trg_audit_sales
  after insert or update on sales
  for each row execute function log_audit_event();

create trigger trg_audit_branches
  after insert or update on branches
  for each row execute function log_audit_event();

create view flagged_backdated_events as
  select *,
    extract(epoch from (occurred_at - client_reported_at)) / 60 as gap_minutes
  from audit_events
  where client_reported_at is not null
    and abs(extract(epoch from (occurred_at - client_reported_at))) > 600;

-- ─── 0004: Price Check + Provisioning ────────────────────────────────

create or replace function check_price_consistency() returns trigger
language plpgsql as $$
declare
  v_bulk_sell_price numeric;
  v_units_per_bulk numeric;
  v_implied_retail_price numeric;
  v_tolerance numeric := 0.05;
begin
  if new.unit_type = 'retail' then
    select bulk_sell_price, units_per_bulk
      into v_bulk_sell_price, v_units_per_bulk
      from products where id = new.product_id;

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

create trigger trg_check_price_consistency
  before insert on sales
  for each row execute function check_price_consistency();

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

-- ─── 0006: Query Log ─────────────────────────────────────────────────

create table if not exists query_log (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) not null default current_business_id(),
  actor_user_id uuid references users(id) not null default auth.uid(),
  question text not null,
  intent text not null,
  values jsonb not null default '{}'::jsonb,
  helpful boolean,
  answered_by_model boolean not null default false,
  created_at timestamptz not null default now()
);

alter table query_log enable row level security;

create policy query_log_read_owner on query_log for select
  using (current_user_role() = 'owner' and business_id = current_business_id());

create policy query_log_write_owner on query_log for insert
  with check (current_user_role() = 'owner' and business_id = current_business_id());

create policy query_log_update_feedback on query_log for update
  using (current_user_role() = 'owner' and business_id = current_business_id() and actor_user_id = auth.uid())
  with check (business_id = current_business_id() and actor_user_id = auth.uid());

create index if not exists idx_query_log_created on query_log(created_at desc);

-- ─── 0007: Supplier Payments + Reconciliation ────────────────────────

create table supplier_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  supplier_id uuid not null references suppliers(id) on delete cascade,
  amount numeric not null check (amount > 0),
  note text,
  paid_at timestamptz not null default now(),
  created_by uuid not null references users(id)
);

create table supplier_reconciliations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  supplier_id uuid not null references suppliers(id) on delete cascade,
  status text not null check (status in ('confirmed', 'disputed')),
  note text,
  reconciled_at timestamptz not null default now(),
  created_by uuid not null references users(id)
);

create index idx_payments_supplier on supplier_payments(supplier_id);
create index idx_reconciliations_supplier on supplier_reconciliations(supplier_id);

create trigger trg_audit_supplier_payments
  after insert or update on supplier_payments
  for each row execute function log_audit_event();

create trigger trg_audit_supplier_reconciliations
  after insert or update on supplier_reconciliations
  for each row execute function log_audit_event();

alter table supplier_payments enable row level security;
alter table supplier_reconciliations enable row level security;

create policy payments_read_manager_owner on supplier_payments for select
  using (business_id = current_business_id() and current_user_role() in ('manager', 'owner'));

create policy payments_write_manager_owner on supplier_payments for insert
  with check (business_id = current_business_id() and current_user_role() in ('manager', 'owner'));

create policy reconciliations_read_owner_only on supplier_reconciliations for select
  using (current_user_role() = 'owner' and business_id = current_business_id());

create policy reconciliations_write_owner_only on supplier_reconciliations for insert
  with check (current_user_role() = 'owner' and business_id = current_business_id());

create policy products_update_owner on products for update
  using (business_id = current_business_id() and current_user_role() = 'owner');

-- ─── 0008: Branch Write + Learning ───────────────────────────────────

create policy branches_write_manager on branches for insert
  with check (business_id = current_business_id() and current_user_role() in ('manager', 'owner'));

-- ─── 0010: Manager POS ───────────────────────────────────────────────

-- (sales_insert_manager already created above in 0002 section)

-- ─── 0011: Product Variants ──────────────────────────────────────────

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

create policy product_variants_read on product_variants for select
  using (product_id in (select id from products where business_id = current_business_id()));

create policy product_variants_write_manager on product_variants for insert
  with check (
    current_user_role() in ('manager', 'owner')
    and product_id in (select id from products where business_id = current_business_id())
  );

create trigger trg_audit_product_variants
  after insert or update on product_variants
  for each row execute function log_audit_event();

-- Add variant_id to sales after product_variants exists
alter table sales
  add column variant_id uuid references product_variants(id) on delete set null;

-- ─── 0012: Phone Auth ────────────────────────────────────────────────

-- (phone column already added to users table above)

create unique index users_business_phone_key
  on users (business_id, phone)
  where phone is not null;

-- ─── Done! ───────────────────────────────────────────────────────────
-- Your database is ready. Now deploy the Edge Function:
--   npx supabase functions deploy market-api --project-ref gpoavyfgeolwovaquiog
-- ─────────────────────────────────────────────────────────────────────
